# Analyse — Migration de la génération de user stories vers les Structured Outputs

> **Statut : analyse seule, rien implémenté.** Date : 2026-08-31.
> Sources API vérifiées en direct sur `platform.claude.com` (`structured-outputs.md`, `streaming.md`), pas de mémoire.
> Objectif : évaluer le passage du format texte actuel (parsé par regex côté client) vers
> les Structured Outputs de l'API Claude (`output_config.format`, sortie contrainte par schéma JSON).

---

## Résumé (à lire en premier)

- **Interface stable réelle du système = la forme d'objet produite par `src/logic/storyParser.js`**, pas le
  texte. Un adaptateur `jsonToStory()` qui reproduit cette forme confine fortement le rayon de l'impact.
- **Effort : chantier transverse**, pas localisé. ~10 fichiers source à toucher (4 épargnés via
  l'adaptateur : `csvExport.js`, `StoryCard.jsx`, `Dashboard.jsx`, `dashboardStats.js`), ~7 fichiers de
  tests (~120 cas) + l'e2e. Churn concentré sur : prompt / API, client streaming, swap parser→JSON,
  chemins « texte brut » / copie de 3 écrans, compat stockage (~200 entrées `localStorage` en texte).
- **Risque #1 (le plus important)** : Structured Outputs réactive la zone d'hallucination que la
  calibration RAG du 2026-08-25 a servi à maîtriser. `required` force la *présence* des champs ; un
  `minItems` forcerait le *bourrage* (invention de faux critères pour un produit que le client ne vend
  pas) ; le décodage contraint peut éroder la clause d'exception *conditionnelle* ; le prompt système
  injecté par la feature perturbe l'équilibre `DOIS`/`INTERDIT` calibré. **Re-test du brief « téléphone »
  obligatoire avant tout merge** (déjà exigé par CLAUDE.md pour toute modif de cette clause).
- **Troncature `max_tokens`** : la doc est explicite — en cas de coupure, *« the output may be incomplete
  and not match your schema »*. Donc `JSON.parse` échoue → parsing 100 % cassé, pas de dégradation
  gracieuse story-par-story comme aujourd'hui.
- **Streaming (point dur, précisément situé)** : avec `output_config.format`, la réponse est un content
  block de type `text`, streamé par des `text_delta` **à la même fluidité caractère-par-caractère
  qu'aujourd'hui** (doc : *« Stream structured outputs like normal responses »*). **La fluidité au
  transport est intacte.** Le coût réel : le JSON n'est **exploitable qu'une fois complet**. Garder un
  rendu progressif *propre* (cartes qui se remplissent) impose un **parseur JSON tolérant côté client**
  (dépendance en plus, fragile sur les tableaux imbriqués). Le repli « afficher le JSON brut qui se
  tape » reste fluide mais moche. Le rythme saccadé « un champ à la fois avec des pauses » est
  **spécifique à `strict: true` (tool use)**, pas à `output_config.format`.
- **Risque opérationnel mineur** : compilation de grammaire au 1er appel d'un schéma donné (puis cache
  24 h, invalidé si le schéma ou le jeu d'outils change) → latence peu prévisible sur les premières
  requêtes après un redéploiement sur une fonction serverless Vercel qui a déjà des cold starts.
- **Incrémental** : le format de réponse structuré est **atomique** (big-bang côté API — on ne peut pas
  cibler « juste le champ Gherkin »). On peut seulement étager le *rollout* des consommateurs via
  l'adaptateur. `max_tokens` à **re-mesurer** (js-tiktoken, calcul réel — pas d'estimation, règle
  CLAUDE.md).
- **Recommandation** : **ne pas migrer vers les Structured Outputs maintenant.** Si le parsing fait
  réellement mal en prod → correctif ciblé : émettre **le seul bloc Gherkin** en JSON embarqué dans une
  sortie par ailleurs texte, validé, avec repli regex (texte + streaming + réversibilité conservés, zéro
  re-tuning RAG). La vraie migration = plus tard, derrière un flag d'env, avec l'adaptateur de forme
  d'objet + une session dédiée de re-calibration RAG.

---

## §0. Rappel de l'architecture actuelle

Le modèle renvoie **un seul blob de texte** au format imposé par le prompt système de
`api/generate-stories.js` (`**User Story N**`, `**Titre :**`, `**Description :**`,
`**Critères d'acceptation :**`, `**Scénarios Gherkin :**`, `**Complexité :**`). Ce texte :

1. transite en streaming SSE token-par-token — `api/generate-stories.js` relaie `delta.text`,
   `src/components/services/claudeService.js` accumule via `onChunk` ;
2. s'affiche **brut** dans le panneau « Streaming Result » de `src/screens/Forge.jsx`
   (`<StreamingText>{stories}<Cursor /></StreamingText>` — effet machine à écrire) — **aucun parsing
   pendant le streaming** ;
3. une fois complet, est parsé **globalement** par `src/logic/storyParser.js` (`split(/---+/)` puis
   ~12 regex par bloc) en objets :
   `{ id, title, statement:{role,action,benefit}|null, description, criteria[], gherkinGroups[{title,lines[]}], complexity, rawBlock, incomplete, hasValidTitle }` ;
4. ces objets alimentent `src/components/StoryCard.jsx`, `src/logic/csvExport.js`, `src/screens/Results.jsx` ;
5. `src/logic/storyCount.js` (ajouté au LOT 2) = `parseStories(rawText).length` ;
6. le **texte brut** est aussi stocké tel quel dans `src/utils/libraryStorage.js` (`entry.stories`),
   ré-affiché et ré-parsé dans `src/screens/Library.jsx`, et copié tel quel par « Copier tout » /
   `story.rawBlock` par story dans `Results.jsx`.

**Point clé pour toute la suite : l'interface stable du système n'est pas le texte, c'est la forme
d'objet produite par `storyParser.js`.** Un adaptateur qui produit exactement cette forme depuis du
JSON confine énormément le rayon de l'impact.

---

## §1. Effort réel — inventaire des fichiers impactés

### Côté producteur (prompt + API + client streaming)

| Fichier | Nature du changement |
|---|---|
| `api/generate-stories.js` | Retirer la spec de format du prompt système (le schéma la remplace) **en gardant** le bloc d'instructions RAG + la clause d'exception ; ajouter `output_config: { format: { type: "json_schema", schema } }` ; revoir la boucle SSE (le delta n'est plus du texte libre exploitable directement) ; **re-mesurer `max_tokens`** (le JSON ajoute quotes / clés / crochets / échappements — la règle CLAUDE.md interdit l'estimation, il faut refaire la mesure js-tiktoken) ; revoir la sémantique de troncature (voir §2e). |
| `src/components/services/claudeService.js` | Parsing SSE, garde-fou `MAX_OUTPUT_LENGTH` (calibré en **caractères** pour du texte FR, à repenser pour du JSON), détection `truncated`/`stop`, JSDoc des fonctions exportées. |

### Parsing / logique cœur

| Fichier | Impact |
|---|---|
| `src/logic/storyParser.js` | Soit remplacé par `JSON.parse` + **adaptateur de forme**, soit conservé comme *fallback* pour l'historique texte existant. |
| `src/logic/storyCount.js` | OK tel quel **si** l'adaptateur préserve la sémantique `.length`. |
| `src/logic/csvExport.js` | **Non impacté si la forme d'objet est préservée** (consomme des objets déjà parsés). |
| `src/logic/dashboardStats.js` | **Non impacté** (ne lit que `storiesCount`, déjà numérique et stocké). |

### Rendu

| Fichier | Impact |
|---|---|
| `src/screens/Forge.jsx` | Le panneau « Streaming Result » affiche `{stories}` brut → soit afficher du JSON qui se tape (fluide mais moche), soit parsing JSON partiel (voir §3), soit état « génération… ». `setStories(prev => prev + chunk)`. |
| `src/screens/Results.jsx` | `parseStories(stories)`, branche *fallback* « texte brut si parsing échoue », « Copier tout » (`writeText(stories)`), copie par story (`story.rawBlock`). |
| `src/screens/Library.jsx` | `parseStories(selected.stories)`, affichage brut `{selected.stories}`, copie. |
| `src/components/StoryCard.jsx` | **Non impacté si la forme d'objet est préservée.** |
| `src/screens/Dashboard.jsx` | **Non impacté.** |

### Stockage

| Fichier | Impact |
|---|---|
| `src/utils/libraryStorage.js` | `entry.stories` contiendrait du JSON (ou ajout d'un champ `storiesJson`) ; **compat ascendante** des ~200 entrées texte déjà en `localStorage` ; le chemin copie / ré-affichage. |

### État

| Fichier | Impact |
|---|---|
| `src/App.jsx` | `countStories(stories)`, passage de `stories`, `savedFingerprintRef.current === stories` (comparaison de chaîne — OK si on garde une sérialisation stable). |

### Tests couplés au format texte ou au contrat SSE texte

`storyParser.test.js` (33), `storyCount.test.js` (5), `Results.test.jsx` (13), `Library.test.jsx` (24),
`Forge.test.jsx` (34), `claudeService.test.js` (17 — format SSE `data: {"text":…}` + `stop`/`truncated`/`[DONE]`),
`api-generate-stories.test.js` (21 — les tests streaming), `e2e/generate-stories.spec.js` (constante
`FAKE_STORY` + mock SSE + assertions « User Story 1 » / « 1 stories »).
**Non impactés si la forme est préservée** : `csvExport.test.js` (38), les tests `StoryCard`.

### Verdict

**Chantier transverse, pas localisé.** ~10 fichiers source à toucher (dont 4 réellement épargnés via
l'adaptateur : `csvExport`, `StoryCard`, `Dashboard`, `dashboardStats`), ~7 fichiers de tests (~120 cas)
+ l'e2e. L'**adaptateur de forme d'objet** est le levier qui fait passer « on refait tout le flux de
données story » à « on concentre la casse sur : prompt + API, client streaming, le swap parser→JSON, les
chemins texte-brut / copie de 3 écrans, la compat stockage, et les tests côté producteur ».

---

## §2. Risque de régression sur les champs actuels + tension avec la clause d'exception RAG

**C'est le risque principal. Il se décompose en cinq mécanismes.**

### 2a. `required` force la *présence* du champ, pas l'*invention* de contenu client

Un schéma strict avec `required: ["title","statement","description","criteria","gherkinGroups","complexity"]`
garantit que chaque story a tous ses champs non vides. Ça **ne force pas** ces champs à référencer des
faits documentés du client — le modèle peut remplir `description` avec du générique. Lecture naïve :
« le schéma n'oblige pas à halluciner ». **Mais** trois autres mécanismes rouvrent la porte.

### 2b. `minItems` = plancher dur = incitation au bourrage

Si le schéma pose `minItems: 3` sur `criteria` ou `minItems: 2` sur `gherkinGroups` (tentation naturelle
pour encoder « 3-4 critères, 3 scénarios »), c'est un **plancher mécanique**. Pour une story dont la
réponse honnête est « ce point est générique, j'ai peu à dire », le modèle **doit** remplir jusqu'au
quota — et bourrer une story sur un produit que le client ne vend pas, c'est précisément là que
l'invention s'infiltre (faux critères d'acceptation référençant une fausse caractéristique produit). Le
format texte actuel ne fait que *demander* « 3-4 critères » ; `storyParser.js` accepte moins. Un
`minItems` **supprime cette soupape.**

### 2c. Le décodage contraint peut éroder une instruction *conditionnelle et nuancée*

Le *constrained decoding* masque à chaque pas les tokens invalides pour la grammaire. La clause
d'exception RAG n'est pas une règle binaire — c'est un raisonnement conditionnel : « rester générique
**uniquement si** aucun équivalent métier n'est documenté chez ce client ». CLAUDE.md documente qu'elle
est **déjà délicate à équilibrer** (« ni trop faible — testé, sans effet ; ni trop absolue — testé, a
produit une réponse méta au lieu de user stories »). Si le décodage contraint pousse le modèle vers un
mode « remplissage de gabarit » plutôt que « est-ce que ce brief correspond aux docs ? », la clause peut
perdre son effet. **Impossible à trancher sans re-test empirique** avec le brief de repro « téléphone »
— ce que CLAUDE.md rend d'ailleurs **obligatoire** pour toute modification touchant cette clause.

### 2d. Structured Outputs injecte son propre prompt système

Doc Anthropic : *« Claude reçoit automatiquement un prompt système supplémentaire expliquant le format
attendu »* (ce qui augmente aussi le compte de tokens d'entrée). Or CLAUDE.md précise que la clause
d'exception « ne doit pas se faire ignorer par les instructions `DOIS`/`INTERDIT` plus fortes situées
juste au-dessus ». Ajouter un bloc système supplémentaire (l'explication de schéma) autour de cet
empilement d'instructions **perturbe l'équilibre calibré** et impose un re-tuning + re-test.

### 2e. Dégradation de la troncature (désormais confirmée par la doc)

Aujourd'hui, `stop_reason: "max_tokens"` → `{truncated:true}` → l'UI affiche « génération possiblement
incomplète — la dernière user story est à vérifier », et `storyParser.js` récupère quand même les
stories complètes. En JSON contraint, la doc est **explicite** : en cas de coupure,
*« the output may be incomplete and not match your schema »*. Donc `JSON.parse` échoue → parsing
**100 % cassé**, pas de dégradation gracieuse story-par-story. Ce n'est plus une supposition, c'est
documenté.

### Mitigations possibles (si on migre quand même)

- Rendre **optionnels** les champs qui peuvent légitimement être pauvres : `description` hors
  `required`, `criteria` / `gherkinGroups` sans `minItems` (ou très bas). Ne garder en `required` que
  `title`, `statement`, `complexity`.
- Ajouter au schéma un signal structuré par story : `grounded: boolean` (ou `clientContext: string | null`),
  pour donner au modèle un **moyen explicite** de dire « celle-ci est générique » au lieu d'être forcé de
  plaquer des spécificités client.
- Garder la clause d'exception **verbatim** dans le prompt système (Structured Outputs ne le retire pas,
  il s'y ajoute).
- **Re-jouer le brief « téléphone »** contre la version structurée avant tout merge — non négociable
  (CLAUDE.md).
- Re-mesurer `max_tokens` (js-tiktoken, calcul réel) et prévoir une détection de JSON incomplet
  (`JSON.parse` en try/catch → message utilisateur dédié, distinct de « dernière story à vérifier »).

### Conclusion §2

La migration ne « casse » pas mécaniquement les titres / critères / Gherkin, mais elle **réactive
exactement la zone de risque que la calibration du 2026-08-25 a servi à maîtriser**, et transforme un
garde-fou déjà qualifié de « fragile » en quelque chose qui demande une re-validation complète. Le coût
de sécurisation est élevé pour un bénéfice (robustesse) spéculatif.

---

## §3. Compatibilité avec le streaming temps réel

**Vérifié dans la doc actuelle (`structured-outputs.md`, `streaming.md`), pas supposé.**

### Ce que dit la doc

**`output_config.format` (JSON outputs — réponse contrainte par schéma) :**

- La réponse atterrit dans un **content block de type `text`** (doc, Quick start : *« Valid JSON matching
  your schema in the response's text content block »*).
- Elle est streamée par des événements **`text_delta` classiques**, au **même rythme fluide
  caractère-par-caractère** que le texte libre actuel. Doc : *« Stream structured outputs like normal
  responses. »*
- **→ La fluidité au transport est intacte.** Le coût n'est pas là.
- Le vrai coût : **le JSON n'est pas exploitable tant qu'il n'est pas complet.** Doc (section Streaming,
  exemple Java) : *« you need to accumulate the full response before deserializing the JSON. »*
- Conséquences concrètes pour l'UX :
  - On *peut* garder un effet machine à écrire en affichant le **JSON brut** au fil du flux : fluide,
    mais moche (accolades, clés, guillemets d'échappement visibles, fuite du schéma à l'utilisateur).
  - Pour afficher des **champs propres** en cours de flux (le titre apparaît, puis la description, puis
    les critères se remplissent), il faut un **parseur JSON tolérant** côté client
    (type `best-effort-json-parser` / `partial-json`) qui extrait les champs déjà complets d'un JSON
    encore ouvert. Faisable, mais : dépendance supplémentaire, logique fragile sur les tableaux imbriqués
    (`gherkinGroups[].lines[]`), et à tester.
  - **L'effort se situe entièrement côté rendu client**, pas côté API ni transport.

**Tool use `strict: true` (`input_json_delta`) — chemin distinct, à ne pas confondre :**

- Là, les deltas sont des *« partial JSON strings »* **et** la doc précise : *« Current models only
  support emitting one complete key and value property from `input` at a time [...] there may be delays
  between streaming events while the model is working. »* → rythme **saccadé, champ-par-champ avec des
  pauses**, pas caractère-par-caractère.
- **Ce problème de fluidité est spécifique à `strict`.** Il ne s'applique **pas** à `output_config.format`.

**Le point commun des deux chemins** n'est donc **pas** la fluidité (seul `strict` la perd) — c'est que
**la sortie n'est pas exploitable en champs propres tant qu'elle est incomplète.**

### Impact produit

| Approche | Fluidité au transport | Exploitable en cours de flux ? | UX résultante |
|---|---|---|---|
| **Actuel (texte libre)** | caractère-par-caractère | oui (affichage brut direct) | machine à écrire lisible immédiatement |
| **`output_config.format`** | **caractère-par-caractère (intacte)** | non — JSON valide seulement complet | soit JSON brut qui se tape (fluide, moche), soit parseur JSON partiel côté client → cartes qui se forment |
| **tool use `strict`** | **saccadée (champ-par-champ + pauses)** | partiellement (helpers SDK) | les champs « popent » un par un |

### Le point dur, précisément situé

Ce n'est pas « le streaming casse ». C'est : **avec `output_config.format`, préserver un rendu progressif
*propre* (cartes qui se remplissent au fil du flux) demande un parseur JSON tolérant côté client** —
nouvelle dépendance + logique fragile sur structure imbriquée. Le repli « afficher le JSON brut en
streaming » garde la fluidité mais donne une UX dégradée. Un *spike* d'une demi-journée reste utile pour
valider le rendu partiel sur la vraie structure (5 stories × critères × groupes Gherkin).

### Risque opérationnel : compilation de grammaire

La doc (« Grammar compilation and caching ») :

- au **premier appel d'un schéma donné**, latence supplémentaire pendant que la grammaire compile ;
- ensuite **cache 24 h à compter du dernier usage** ;
- cache invalidé si la **structure du schéma** change ou si le **jeu d'outils** change (pas si seuls
  `name` / `description` changent).

Sur une fonction serverless Vercel qui a déjà des cold starts, ça ajoute une **latence peu prévisible sur
les premières requêtes** après un redéploiement ou une modification de schéma. **Risque mineur, pas
bloquant** — à garder en tête si on met un flag qui bascule de schéma, ou si le trafic est assez faible
pour laisser le cache expirer entre deux sessions de démo.

---

## §4. Migration incrémentale vs big-bang

### Peut-on structurer un champ à la fois ?

- **`output_config.format` s'applique à la réponse entière**, sous **un** schéma. On ne peut pas le
  cibler sur « juste le champ Gherkin ». Pour les vraies Structured Outputs, le **changement de format de
  réponse est atomique** (big-bang côté API).
- **Mais on peut étager le déploiement des consommateurs** : introduire la forme d'objet `story`, écrire
  un adaptateur `jsonToStory()` qui produit **exactement** la forme actuelle de `parseStories()`,
  brancher tout l'aval (`csvExport`, `StoryCard`, `countStories`) dessus **sans le toucher**, puis
  basculer le producteur (regex → `JSON.parse` + adaptateur) derrière cette frontière. Big-bang côté API,
  rollout progressif côté rendu.
- **Compat stockage** : `libraryStorage` a ~200 entrées texte. Post-migration, il faut soit garder
  `parseStories` en *fallback* détecté (`try JSON.parse, sinon regex`), soit stocker les deux
  (`stories` texte pour copie / rétro-compat + `storiesJson`). Les vieilles entrées ne se reconvertissent
  pas de façon fiable.

### Alternative légère qui NE nécessite PAS Structured Outputs

La partie la plus fragile de `storyParser.js` est le parsing Gherkin
(`split(/(?=Sc[ée]nario\s+\d+\s*:)/i)` + filtres de lignes). On peut demander au modèle d'émettre
**uniquement le bloc Gherkin comme JSON dans un fence** ` ```json ` au milieu d'une sortie **par ailleurs
texte**, et faire :

```
extraire le fence → JSON.parse (avec fallback regex si absent/invalide),
garder les regex pour le reste
```

→ **texte conservé, streaming intact, réversible, aucun changement de décodage, aucun re-tuning RAG.**
Ce n'est pas « Structured Outputs » (pas d'enforcement schéma, le modèle peut produire du JSON malformé —
mais on valide + fallback). C'est le moyen le moins cher de dé-risquer le bout de parseur le plus
casse-gueule.

---

## §5. Recommandation (avis, pas décision — la décision reste celle du mainteneur)

**Ne pas faire la migration complète vers Structured Outputs maintenant.** Trois raisons :

1. **Coût côté rendu réel** (§3) : préserver un rendu progressif propre impose un parseur JSON tolérant
   côté client (dépendance + fragilité sur structure imbriquée). La fluidité au transport est certes
   intacte, mais le repli sans parseur partiel (« JSON brut qui se tape ») est une UX dégradée sur une
   fonctionnalité mise en avant.
2. **La clause d'exception RAG est explicitement fragile** et le décodage contraint + le prompt système
   injecté + tout `minItems` forcent une re-calibration + re-validation complète de précisément ce que
   CLAUDE.md signale comme la zone la plus sensible — pour un bénéfice (robustesse du parsing) qui reste
   spéculatif. La troncature `max_tokens` dégrade en plus le mode d'échec (JSON 100 % cassé vs « dernière
   story à vérifier »).
3. **Le parseur ne fait pas mal en prod** de façon visible : 33 tests, corrections accumulées (PR #73,
   troncature IDs, repli statement…). Le rapport coût / risque vs bénéfice est défavorable aujourd'hui.

**Si la robustesse du parsing est un vrai point de douleur** (échecs de parsing observés sur de vraies
générations) : faire le **correctif ciblé du §4** — bloc Gherkin en JSON embarqué, validé, avec fallback
regex. Texte + streaming intacts, réversible, zéro re-tuning RAG. C'est l'approche à privilégier en
premier si on veut agir.

**Si on veut plus tard la vraie sortie structurée** :

- la mettre derrière un flag d'env (`STORY_OUTPUT_FORMAT=json|text`) ;
- construire l'**adaptateur de forme d'objet** pour que l'aval (`csvExport`, `StoryCard`) ne bouge pas ;
- accepter le changement de rendu (cartes qui se forment via parsing JSON partiel, ou état
  « génération… ») ;
- schéma : `title` / `statement` / `complexity` requis, le reste optionnel, un champ `grounded: boolean`
  par story ;
- ajouter une détection de JSON incomplet (`JSON.parse` en try/catch) avec message dédié ;
- re-mesurer `max_tokens` (js-tiktoken) ;
- **budgéter une session dédiée** pour re-calibrer + re-tester le brief « téléphone » et l'équilibre
  `DOIS` / `INTERDIT`.
