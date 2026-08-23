# StoryPilot AI — Contexte actif
*Mis à jour le 2026-08-19*

---

## Session CLEAN-FORGE-UPLOAD (2026-08-19) — Suppression du code mort d'upload dans Forge.jsx

**Contexte :** l'écran Forge est verrouillé en mode démo publique (`UploadZone`, `DeleteDocBtn`, `IndexBtn` tous rendus avec `disabled` en dur, aucun `onClick`/`onDrop`/`onDragOver` câblé). Toute la logique d'upload derrière ces éléments n'était donc plus jamais atteignable depuis l'UI — vérifié explicitement par `grep` (`onDrop`, `onDragOver`, `fileInputRef`, chaque handler) avant toute suppression, pas supposé.

### Réalisé

- [x] **Supprimé dans `src/screens/Forge.jsx`** : `handleFileUpload`, `uploadSingleFile`, `handleConfirmReplace`, `handleCancelReplace`, `handleDeleteDoc`, `handleDrop` (aucun appelant restant après suppression, vérifié) ; les states `uploadingFile`, `uploadProgress`, `pendingReplaceFile` (lus nulle part ailleurs) ; `fileInputRef` (jamais attaché à un `<input type="file">`, ce dernier n'existe même pas dans le fichier) et `documentsRef` + son `useEffect` (son seul lecteur était `handleFileUpload`) ; le bloc JSX `ConfirmBanner` (jamais atteignable, `pendingReplaceFile` ne pouvant plus jamais devenir vrai) et sa définition `styled.div` désormais orpheline.
- [x] **Extra trouvé pendant l'audit, hors de la liste initiale mais même critère** : le state `dragOver` — son seul setter vivait dans `handleDrop` (supprimé) et il n'était jamais lu dans le JSX réellement rendu (`UploadZone` n'utilise pas la prop `$dragOver` au rendu, seulement dans sa définition CSS). Supprimé pour la même raison que `uploadingFile`/`uploadProgress`.
- [x] **Imports nettoyés en conséquence** : `useRef` (React), `uploadDocument` et `deleteDocument` (`ragService`) — tous devenus inutilisés après les suppressions ci-dessus.
- [x] **Gardé tel quel, signalé sans corriger (cas ambigu, comme demandé)** : `uploadError` reste techniquement vivant — son seul appelant restant est le bouton "✕" qui le remet à `null` (`onClick={() => setUploadError(null)}`), donc il ne peut plus jamais redevenir vrai après cette suppression, mais il n'est pas à 100% mort comme les autres (il a encore un point d'écriture actif). À trancher dans une session dédiée si ce bouton/état doit aussi partir.
- [x] **Vérifié** : `npm run test:run` (204/204 verts, dont `Forge.test.jsx` inchangé), `npm run build` (bundle légèrement plus petit : 264,47 kB → 262,02 kB), et contrôle visuel via `npm run dev` + Playwright sur l'écran Forge (Base de connaissance, message "Upload désactivé en mode démo publique", bouton "Indexer les documents" désactivé — rendu identique à avant, aucune erreur console).

---

## Session TEST-INVENTORY (2026-08-19) — Inventaire de couverture de test + nettoyage legacy v1

**Objectif :** Produire `testing/inventaire-tests.md` (couverture de test par fonctionnalité, pas par ticket) avant d'attaquer les priorités identifiées.

### Réalisé

- [x] `testing/inventaire-tests.md` créé — classement 🟢/🟠/🔴 des fonctionnalités existantes, priorités : `claudeService.js` (streaming/troncature/timeout non testés), `libraryStorage.js` (aucun test direct malgré 4 écrans dépendants), `ragService.js` (miroir non testé de `claudeService.js`).
- [x] **Suppression de `src/components/BriefInput.jsx` et `src/components/StoriesOutput.jsx`** (+ leurs tests `src/test/BriefInput.test.jsx`, `src/test/StoriesOutput.test.jsx`) : composants legacy v1 confirmés morts (non importés nulle part, `grep` à l'appui), déjà notés comme tels dans `README.md`. `App.jsx` utilise le textarea inline de `Forge.jsx` et le rendu parsé de `Results.jsx` à la place.
- [x] `CLAUDE.md` — section Architecture corrigée : les deux fichiers supprimés remplacés par `src/screens/Forge.jsx` et `src/screens/Results.jsx`, qui reflètent l'architecture réelle.

---

## Reste à faire (prioritaire, à ne pas perdre)

Trois sujets de petite dette technique, volontairement reportés à une session dédiée :

- [x] **`topK` non validé côté serveur** dans `api/retrieve-context.js` (ligne 30) — aucune borne min/max, aucun contrôle de type, transmis tel quel à `index.query()`. Définir une vraie borne et l'ajouter à `CLAUDE.md` avant de coder le fix. *(Identifié lors de la session TESTS-API-SECU, 2026-08-18. Déjà corrigé dans le code au moment de la vérification du 2026-08-23 — validation entier 1-20 avec rejet 400 explicite présente dans `api/retrieve-context.js`, corrigée lors d'une session antérieure sans avoir été cochée ici.)*
- [x] **Statut 500 au lieu de 400** dans `api/upload-doc.js` pour une extension de fichier non supportée — l'exception levée par `extractText()` passe par le catch générique (qui renvoie désormais un message générique, mais toujours avec un code 500). Décider si ce cas doit devenir une vraie erreur de validation 400. *(Identifié lors de la session TESTS-API-SECU, 2026-08-18. Déjà corrigé dans le code au moment de la vérification du 2026-08-23 — le handler rejette l'extension non supportée en 400 avant même d'appeler `extractText()`, corrigé lors d'une session antérieure sans avoir été coché ici.)*
- [x] **`onTruncated` appelé deux fois** dans `claudeService.js` (`generateStories`) quand le serveur envoie explicitement `{ truncated: true }` — le flag ne met pas `receivedStop` à `true` (seul `parsed.stop` le fait), donc la vérification de fin de boucle (`charCount > 0 && !receivedStop`) se redéclenche juste après l'appel déjà fait pour le flag explicite. Comportement testé tel quel (`toHaveBeenCalledTimes(2)`) dans `src/test/claudeService.test.js`, pas corrigé. Décider si un seul appel suffit et, si oui, comment le garantir (ex. `receivedStop` aussi mis à `true` sur `truncated`, ou compteur/flag dédié). *(Identifié lors de la session TEST-CLAUDE-SERVICE, 2026-08-19. Corrigé le 2026-08-23 : `receivedStop = true` ajouté dans la branche `parsed.truncated` de `claudeService.js`, pour que la troncature explicite soit traitée comme une fin de stream légitime au même titre que `parsed.stop`. Test mis à jour pour vérifier `toHaveBeenCalledTimes(1)`.)*

- [x] **`GenerateBtn` déclenche `onNavigate("forge")` deux fois** (`Dashboard.jsx`) — le bouton "Générer" est imbriqué dans `CTACard`, qui a lui-même un `onClick` identique ; aucun `stopPropagation`, donc un clic sur le bouton fait remonter l'événement (bubbling) et déclenche les deux handlers. Sans conséquence visible aujourd'hui (naviguer deux fois vers le même écran ne casse rien), mais à corriger pour la propreté. Constaté et documenté tel quel (pas corrigé) dans `src/test/Dashboard.test.jsx`. *(Identifié lors de la session TEST-DASHBOARD-RENDER, 2026-08-19. Corrigé le 2026-08-23 : `e.stopPropagation()` ajouté dans le handler `onClick` de `GenerateBtn`, même pattern que `handleDelete` dans le même fichier. Test mis à jour pour vérifier `toHaveBeenCalledTimes(1)`.)*
- [x] **Collision d'id possible dans `libraryStorage.js`** — `saveGeneration()` génère l'id via `Date.now().toString()` ; deux appels synchrones consécutifs peuvent tomber sur la même milliseconde et produire le même id (vérifié empiriquement). Conséquence potentielle : `deleteGeneration(id)` supprimerait alors deux entrées distinctes au lieu d'une seule, perte de donnée utilisateur non voulue. Plus sérieux que les autres points de cette liste (risque de perte de données, pas juste un défaut esthétique). *(Identifié lors de la session TEST-DASHBOARD-RENDER, 2026-08-19. Corrigé le 2026-08-23 : `id` généré via `crypto.randomUUID()` au lieu de `Date.now().toString()` ; test de régression ajouté dans `src/test/libraryStorage.test.js` vérifiant que deux appels synchrones à la même milliseconde produisent bien des ids différents.)*
- [ ] **Regex `fullStatement` dans `storyParser.js` (ligne 17) potentiellement affectée par le même défaut que `**Titre :**`** — `/\*\*User Story \d+\*\*\s*(.+?)(?=\n|$)/` utilise `\s*` (pas `[ \t]*`) entre le marqueur et le contenu capturé : en théorie, si le texte suivant `**User Story N**` était vide sur sa propre ligne, le `\s*` gourmand avalerait la ligne vide et capturerait le texte de la section suivante comme statement, au lieu de laisser `fullStatement` vide. Jamais déclenché en pratique à ce jour car le prompt système remplit toujours `**User Story N**` sur la même ligne. Repéré par la revue automatique de la PR #66 (champ `**Titre :**`, corrigé avec `[ \t]*`) qui a signalé la même construction sur cette regex préexistante — non corrigée dans cette PR (hors périmètre, regex antérieure), à traiter séparément si le cas se présente un jour en pratique. *(Identifié le 2026-08-23, PR #66.)*
- [ ] **`escapeCsvField` ne neutralise pas un `\r` en tête de champ** (`src/logic/csvExport.js`) — la neutralisation anti-injection de formule couvre `=+-@` et la tabulation, mais pas un retour chariot seul en début de champ. Cas très marginal (un `\r` en tout début de cellule n'est pas un déclencheur de formule reconnu par les tableurs, et le champ est de toute façon déjà entouré de guillemets par l'échappement RFC 4180), signalé par la revue automatique sur PR #66 comme cosmétique, non corrigé. *(Identifié lors de la revue automatique PR #66, 2026-08-23.)*
- [ ] **Ligne vide possible dans la Description CSV si `fullStatement` est vide** (`src/logic/csvExport.js`, `buildDescription`) — si un bloc malformé produit un `fullStatement` vide, une ligne vide s'insère en tête de la description exportée. Défaut d'esthétique sur un cas déjà marginal, pas de perte de donnée. *(Identifié lors de la revue automatique PR #66, 2026-08-23.)*

**Rappel comportement déjà documenté, re-rencontré le 2026-08-19 (PR #41) :** `claude-code-action` refuse de s'exécuter (donc aucune review soumise) tant que `.github/workflows/claude-pr-review.yml` sur la branche de la PR diffère de la version sur `main` — protection anti-triche intentionnelle de l'action, pas un bug de ce projet. Déjà noté en détail dans la session CI/PR-REVIEW (2026-07-13) ci-dessous, "Découverte clé #1". Sur PR #41, le fichier avait été modifié sur la branche (`show_full_output: true`, ajouté pour débugger) — donc auto-skip garanti tant que non mergé. Débloqué via merge en bypass admin ("Merge without waiting for requirements to be met"), seule option pour une PR qui touche elle-même ce fichier. Implication pratique à garder en tête pour tout futur repo réutilisant ce pattern CI (dont `kommit-frontend`) : une PR qui modifie ce workflow ne recevra jamais sa propre review automatique, il faut la merger en bypass puis vérifier le comportement sur la PR *suivante*.

---

## Session TESTS-API-SECU (2026-08-18) — Tests des 5 routes serverless, fix CORS et fuite error.message

**Objectif :** Ajouter une couverture de tests sur les 4 routes serverless qui n'en avaient pas (`api/upload-doc.js`, `api/delete-doc.js`, `api/retrieve-context.js`, `api/list-docs.js`), au même niveau de rigueur que le patron de référence `src/test/api-generate-stories.test.js` (handler appelé directement avec req/res fabriqués à la main, mocks `vi.fn()` sur les appels externes, pas de librairie type `node-mocks-http`/`supertest`), puis corriger les écarts CLAUDE.md que ces tests ont mis en évidence.

### Réalisé

- [x] **4 nouveaux fichiers de test** : `src/test/api-upload-doc.test.js`, `src/test/api-delete-doc.test.js`, `src/test/api-retrieve-context.test.js`, `src/test/api-list-docs.test.js`. Même méthode que le patron : mocks `vi.fn()` sur `OpenAI`/`Pinecone`/`unpdf`/`mammoth`, jamais de vrai appel réseau. Aucun état module-level de type rate-limiting sur ces 4 routes (contrairement à `generate-stories.js`) — noté explicitement en commentaire dans chaque fichier plutôt que supposé.
- [x] **79 tests au total** sur les 5 routes serverless (`generate-stories` inclus), **78 verts / 1 rouge intentionnel et documenté** (voir "Reste à faire" ci-dessus, le cas 400 vs 500 sur `upload-doc.js`).
- [x] **Écarts CLAUDE.md découverts par des tests rouges, validés avec l'utilisateur, puis corrigés dans le code source** :
  - **CORS ouvert à `"*"` en dur** → remplacé par la dérivation `process.env.ALLOWED_ORIGINS` (même pattern que `generate-stories.js` : `.split(',')` avec fallback `['http://localhost:5173', 'https://storypilot-ai.vercel.app']`) sur `upload-doc.js`, `delete-doc.js`, `retrieve-context.js`, `list-docs.js`, et `generate-stories.js` (voir bug de preflight ci-dessous).
  - **`error.message` brut renvoyé au client** sur exception inattendue → remplacé par un message générique fixe (le détail reste loggé côté serveur via `console.error`) dans `upload-doc.js`, `delete-doc.js`, `retrieve-context.js`. `list-docs.js` et `generate-stories.js` étaient **déjà conformes** sur ce point, vérifié par test avant toute modification plutôt que supposé.
- [x] **Bug de preflight CORS découvert sur `generate-stories.js` lui-même** en lançant son propre test de référence : le check `if (req.method !== 'POST') return 405` était placé **avant** le bloc CORS/OPTIONS, donc toute requête `OPTIONS` (préflight) recevait un 405 au lieu du 200 attendu — le test `répond 200 et coupe court sur une requête OPTIONS` du patron de référence échouait en réalité déjà, avant toute intervention de cette session. Réordonné pour que le bloc CORS + `if (method === 'OPTIONS') return 200` passe **avant** le check `method !== 'POST'`, comme c'était déjà le cas sur les 4 autres routes — sans toucher au rate limiting, à la validation ou au streaming.
- [x] **Vérification dédiée du rate limiting après ce réordonnancement** (demandée explicitement par l'utilisateur avant de considérer le fix terminé) : nouveau test dans `api-generate-stories.test.js` confirmant qu'une requête `OPTIONS` ne consomme jamais de crédit de rate limit (sort via le `return 200` avant d'atteindre `checkRateLimit`), même répétée 15 fois, et qu'une requête `POST` valide déclenche toujours le blocage au même seuil qu'avant (10 passent, la 11ᵉ renvoie 429).
- [x] `topK` non validé dans `retrieve-context.js` : traité comme un constat de comportement actuel (test qui documente, sans jugement), pas une violation CLAUDE.md explicite — reporté, voir "Reste à faire".

Détail complet des cas limites couverts par fichier, disponible dans l'historique de conversation de cette session (non dupliqué ici pour éviter la dérive avec le code).

---

## Session GIT-WORKFLOW (2026-08-05) — Nettoyage doc CI, règles de collaboration git

**Contexte :** courte session de suite après la clôture de la session CI/PR-REVIEW (voir plus bas). Deux points traités :

1. **Confirmation que le crédit Anthropic a bien été rechargé** par l'utilisateur (voir "Point d'attention" de la session précédente) — testé en direct avec un appel `curl` sur `api.anthropic.com/v1/messages`, réponse HTTP 200. La démo publique est donc de nouveau fonctionnelle. Point de confusion clarifié avec l'utilisateur au passage : le "Monthly spend limit" (plafond, ex. 5$) sur console.anthropic.com est indépendant du "Credit balance" (solde prépayé réel) — le premier ne finance rien, seul le second alimente les appels API. Auto-reload recommandé mais pas activé par l'utilisateur.
2. **Doc de reproductibilité créée** : `docs/ci-claude-pr-review-workflow.md` — guide complet pour reproduire le setup CI Claude (review + approbation + auto-merge) sur un autre projet, avec les 5 pièges rencontrés lors du debug de la session précédente (anti-triche workflow, self-approval GitHub, syntaxe `allowedTools`, budget API prod partagé, confusion spend limit/credit balance) et une checklist de diagnostic. **Volontairement non commité** (demande explicite de l'utilisateur) — ajouté à `.gitignore` à la place. PR #34 (`chore/gitignore-ci-doc` → `main`) ouverte pour ce seul changement de `.gitignore`.
3. **Nouvelles règles de collaboration git établies avec l'utilisateur** (à respecter dans toutes les sessions futures sur ce repo) :
   - Ne jamais push sur `main` sans passer par une PR, même pour un changement mineur (doc/config) — un push admin direct a été fait par erreur en fin de session précédente (`context.md` seul), signalé et corrigé.
   - Ne jamais créer de PR de ma propre initiative sans autorisation explicite préalable.
   - Raccourcis utilisateur : **"c"** = committer les changements en cours sans demander ; **"p"** = pousser la branche **et créer la PR dans la foulée**, en un seul geste (pas de confirmation séparée pour la PR une fois le push autorisé).
   - Après tout merge sur `main`, refaire `git checkout main && git pull origin main` avant de repartir sur une nouvelle branche.
   - Détail complet dans la mémoire persistante : `feedback_git_workflow.md`.

---

## Session CI/PR-REVIEW (2026-07-13) — Toggle RAG, contraste, renommage, workflow Claude — RÉSOLU

**Branche :** `feat/polish`, mergée dans `main` via PR #26 (bypass admin, voir plus bas). Le workflow `claude-pr-review.yml` est pleinement fonctionnel depuis la fin de cette session : test → review Claude → approbation formelle → auto-merge natif GitHub, sur toute PR qui ne touche pas au fichier workflow lui-même.

### Suite et résolution (même session, après la partie "EN COURS" ci-dessous)

1. `/install-github-app` lancé avec succès après avoir dû installer + authentifier `gh` CLI (absent de la machine), avec les scopes `repo` puis `workflow` (ajouté via `gh auth refresh -h github.com -s repo,workflow`, sinon erreur "GitHub CLI is missing required permissions: workflow"). A créé le secret `CLAUDE_CODE_OAUTH_TOKEN` et proposé 2 workflows (`claude-code-review.yml`, `claude.yml`) — **non retenus** (redondants avec notre workflow existant), branche distante supprimée.
2. **Découverte clé #1** : `claude-code-action` a une protection anti-triche intentionnelle — si le fichier workflow dans la PR diffère de celui sur `main`, l'action **skip silencieusement** son exécution ("Workflow validation failed... your workflow will begin working once you merge your PR"). Donc toute PR qui modifie `claude-pr-review.yml` ne peut jamais recevoir de review sur elle-même — normal, pas un bug. Implication pratique : chaque fix du workflow nécessite un bypass merge (`gh pr merge <n> --merge --admin`), et il faut tester sur une PR **suivante**, séparée, qui ne touche pas au fichier.
3. **Découverte clé #2** : GitHub interdit nativement qu'un auteur approuve sa propre PR (tooltip UI : "Pull request authors can't approve their own pull requests") — restriction plateforme non contournable, indépendante des permissions admin/owner. D'où la nécessité du bypass admin pour merger la PR qui introduit le fix (personne ne peut l'approuver formellement). Les PR **suivantes** n'ont pas ce problème car c'est le bot `claude[bot]` (identité différente) qui approuve, pas l'auteur humain.
4. **Découverte clé #3 (fausse piste)** : `claude_args: --allowedTools "Bash(gh pr review:*)"` avec seulement ce pattern → 8 refus de permission, review jamais soumise. Cause réelle : un seul pattern autorisé empêchait Claude d'explorer la PR (`gh pr diff`, `gh pr view`) via Bash. Un essai de syntaxe alternative (`Bash(gh pr review *)`, espace au lieu de deux-points) a cassé encore plus (crash instantané SDK). La syntaxe deux-points (`Bash(gh pr view:*),Bash(gh pr diff:*),Bash(gh pr review:*)`) est la bonne, confirmée par l'exemple officiel `anthropics/claude-code-action/examples/pr-review-comprehensive.yml`.
5. **Découverte clé #4 (la vraie cause du dernier blocage)** : après le fix de syntaxe, les runs échouaient toujours, mais différemment (crash instantané, 1 tour, coût $0, 0 refus). Cause : le compte Anthropic derrière `secrets.ANTHROPIC_API_KEY` (la même clé pay-per-use que `api/generate-stories.js` en prod !) était à sec — "Your credit balance is too low" / solde impayé de 0,17$ affiché sur console.anthropic.com. **Problème d'architecture** : réutiliser la clé API prod pour la review CI fait consommer le même budget que la démo publique. **Fix définitif** : le workflow utilise maintenant `claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}` (token lié à l'abonnement Claude.ai de l'utilisateur, provisionné par `/install-github-app`), complètement découplé du budget de l'app en prod.
6. **Validation end-to-end réussie** : PR de test #33 (petit commentaire HTML dans README, ne touchant pas au workflow) → `claude[bot]` a soumis une review `APPROVED` avec un résumé pertinent. PR non mergée (fermée sans merge, c'était juste un test) mais le flux est prouvé fonctionnel.
7. **État final de `.github/workflows/claude-pr-review.yml`** sur `main` :
   ```yaml
   - uses: anthropics/claude-code-action@v1
     with:
       claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
       claude_args: |
         --allowedTools "Bash(gh pr view:*),Bash(gh pr diff:*),Bash(gh pr review:*)"
       prompt: | ...
   ```
8. **PR de nettoyage** : #27, #29, #31, #33 (tests intermédiaires, tous des commits README triviaux) fermées sans merge, branches locales et distantes supprimées.

### Point d'attention pour la suite

Le secret `ANTHROPIC_API_KEY` reste utilisé par l'app en prod (`api/generate-stories.js`) — le solde impayé (0,17$ au moment du diagnostic) doit être régularisé côté utilisateur sur console.anthropic.com sans quoi **la démo publique elle-même est cassée** (pas juste la CI). Vérifier que l'utilisateur a bien rechargé, ce n'était pas confirmé en fin de session.

---

## Session CI/PR-REVIEW (2026-07-13) — partie initiale (contexte historique, gardé pour référence)

**Branche :** `feat/polish` (tout poussé sur `origin`, rien en attente). **PR ouverte : #26** `feat/polish` → `main` sur `github.com/EdenSahile/StoryPilot-ai`, auto-merge activé dessus, mais **bloquée** (voir "Où ça bloque" ci-dessous).

### Réalisé cette session (tout committé + poussé, dans l'ordre)

1. **Toggle "Générer sans RAG"** dans `Forge.jsx` — checkbox devenue un vrai bouton toggle (piste + curseur animés), déplacée en haut à droite du textarea (était en bas, peu visible). Suppression du faux panneau de comparaison statique dans `Results.jsx` (US codées en dur, jamais le vrai brief). Voir `docs/superpowers/specs/2026-07-12-rag-toggle-design.md` et `docs/superpowers/plans/2026-07-12-rag-toggle.md` pour le détail du design/plan (fait via brainstorming + subagent-driven-development).
2. **Fix contraste** : `onSurfaceVariant` (texte muté générique, ~150 usages : nav, hints, sous-titres, placeholders) était réglé sur l'accent vert d'eau `#7fae9d` depuis la session palette précédente — ça rendait tout le texte secondaire vert sur un fond déjà pétrole/vert foncé ("vert sur vert" signalé par l'utilisateur). Remplacé par un gris-teal neutre `#a7b4b2` (contraste 8.40:1/7.71:1/6.48:1 sur les 3 fonds, meilleur qu'avant). Le bloc `ModeHint` (Démo Lumeo Boutique) et le libellé du toggle RAG sont passés de `onSurfaceVariant` à `onSurface` (blanc cassé) pour plus de lisibilité — demande explicite de l'utilisateur après un premier retour "pas assez clair".
3. **Renommage StoryForge → StoryPilot** : le repo GitHub et l'URL Vercel ont été renommés côté utilisateur (`storypilot-ai.vercel.app`, `EdenSahile/StoryPilot-ai`). Renommé partout où affiché : titre page, sidebar, topbar, About Settings, `package.json`, README, `CLAUDE.md`, règle `.claude/rules/storypilot-api.md` (fichier renommé), fallback CORS dans `generate-stories.js`. Remote git local mis à jour. **Volontairement pas touché** : `context.md`/`HANDOFF.md`/anciens specs-plans (enregistrements historiques du nom à l'époque), et le nom technique de l'index Pinecone `storyforge` (ressource externe live, migration hors scope).
4. **`index.html`** : `theme-color` et fond de secours pré-React étaient encore sur l'ancien indigo `#6366f1`/bleu marine `#031427` (jamais mis à jour depuis "Forge à braises"). Alignés sur `#0d1917` (fond Pétrole & or actuel).
5. **Workflow CI `.github/workflows/claude-pr-review.yml`** (nouveau) : job `test` (npm ci + vitest, check de statut requis) + job `claude-review` (anthropics/claude-code-action revoit le diff selon `CLAUDE.md`, censé soumettre `gh pr review --approve` ou `--request-changes`). Objectif : que Claude review + approuve les PR automatiquement, combiné à une branch protection rule sur `main` (1 review requise + check "Tests" requis) + auto-merge GitHub natif.

### Bug npm résolu en cours de route (important si ça revient)

`npm ci` échouait en CI avec deux erreurs successives, toutes deux dues à un **`package-lock.json` corrompu**, pas au code :
1. D'abord "Missing: esbuild@0.28.1 from lock file" — lockfile désynchronisé, probablement séquelle du `npm install --package-lock-only` lancé pendant le renommage.
2. Puis "EBADPLATFORM @esbuild/netbsd-arm64@0.28.1" après une 1ère régénération — cause réelle : **npm 11.17 (bundled avec Node 26 sur cette machine) a un bug** qui marque certains paquets optionnels imbriqués (la famille `esbuild@0.28.1` que `vitest` embarque en interne, distincte du `esbuild@0.21.5` de `vite@5`) comme `"extraneous": true` sans le flag `"optional"` — `npm ci` les traite alors comme requis au lieu de les ignorer sur une plateforme incompatible.
   - **Fix : régénérer le lockfile avec npm 10**, pas npm 11 : `npm_config_cache=/tmp/xxx npx -y npm@10 install`, puis vérifier `grep -c '"extraneous": true' package-lock.json` → doit être bas/cohérent avec les siblings qui ont bien `optional: true`. Toujours valider avec `npm ci` dans un répertoire isolé avant de committer.
   - Pendant le dépannage, `brew install node@22` a cassé le `node` principal (dylib `simdjson` incompatible) — `brew reinstall node` a réparé (a fait remonter à Node 26.5.0 au passage).
   - Le cache npm partagé (`~/.npm`) contient des fichiers root-owned (vieux bug npm) qui bloquent régulièrement les commandes — contournement systématique avec `--cache /tmp/xxx` ou `npm_config_cache=...`. L'utilisateur a tenté `sudo chown -R $(id -u):$(id -g) ~/.npm` mais a eu une erreur suspecte ("killall: unknown signal R") suggérant un alias/correction shell qui interfère — **non résolu, non bloquant** (juste contourner avec un cache temp).

### Où ça bloque — PROCHAINE ÉTAPE

Le workflow tourne bien techniquement (jobs `test` et `claude-review` passent tous les deux au vert), **mais Claude ne soumet jamais de review formelle** (`gh pr review --approve`) — GitHub affiche toujours "No reviews — at least 1 approving review is required", donc la PR reste bloquée malgré auto-merge activé.

Chronologie des erreurs déjà corrigées sur ce même workflow (pour ne pas les redécouvrir) :
1. `id-token: write` manquant dans `permissions:` → ajouté (commit `74dd4b6`), a résolu "Unable to get ACTIONS_ID_TOKEN_REQUEST_URL".
2. Ensuite : "Claude Code is not installed on this repository" → l'utilisateur a installé l'app partagée `github.com/apps/claude`, mais a été redirigé vers une page claude.ai "paramètres de l'organisation — Claude Team/Enterprise requis" (probablement un compte Claude Team lié qui route l'install au mauvais endroit, pas forcément un vrai blocage).
3. Après un "Re-run failed jobs", le job est passé vert — mais toujours aucune review soumise. Hypothèse non confirmée : l'app partagée `claude` n'a pas la permission "Pull requests: write" dans son scope par défaut (fixé par Anthropic, pas configurable par l'utilisateur à l'installation).

**Piste essayée puis abandonnée** (rejetée par l'utilisateur car trop compliquée) : créer une GitHub App personnelle dédiée (`actions/create-github-app-token` + secrets `APP_ID`/`APP_PRIVATE_KEY`) pour garantir le scope "Pull requests: write". L'edit du workflow a été rejetée par l'utilisateur.

**Décision prise en fin de session** : au lieu de bricoler manuellement, utiliser le chemin officiel intégré : lancer `/install-github-app` directement dans Claude Code (CLI), qui gère l'installation de l'app + le fichier workflow + le secret en une fois, de façon garantie compatible. C'est une commande interactive (OAuth GitHub) que l'utilisateur doit lancer lui-même.

**À faire à la reprise :**
1. Lancer `/install-github-app` dans Claude Code, suivre les prompts.
2. Comparer ce que ça génère à `.github/workflows/claude-pr-review.yml` existant — probablement à remplacer/fusionner plutôt qu'à garder les deux.
3. Une fois l'app correctement installée avec le bon scope, re-tester sur la PR #26 (repush un commit vide ou "Re-run jobs") et vérifier que "Reviewers" affiche enfin une review de Claude.
4. Si ça marche : vérifier que l'auto-merge (déjà activé sur la PR #26) fusionne bien automatiquement une fois la review + le check "Tests" au vert.
5. Rappel branch protection déjà configurée sur `main` (faite par l'utilisateur pendant cette session) : require 1 approving review + check "Tests" requis, "Allow auto-merge" activé au niveau repo.

---

## Session RAG-TOGGLE (2026-07-12) — Toggle "Générer sans RAG"

**Branche :** `feat/polish`

**Objectif :** Permettre à un visiteur de désactiver volontairement le RAG pour une génération (test d'US génériques), même sur un brief par ailleurs pertinent. Spec : `docs/superpowers/specs/2026-07-12-rag-toggle-design.md`.

### Réalisé
- [x] Checkbox "Générer sans RAG (US génériques)" dans `Forge.jsx`, entre le textarea et le bouton Générer. State local `ragDisabled` (non persisté), saute l'appel `retrieveContext()` dans `handleSubmit` quand coché.
- [x] Suppression du panneau de comparaison statique dans `Results.jsx` (`GENERIC_STORIES`, `ComparisonToggle`/`ToggleHeader`/`ComparisonContent`) — affichait toujours les 3 mêmes US codées en dur, jamais le vrai brief.
- [x] Tests : 2 nouveaux tests dans `src/test/Forge.test.jsx` (comportement par défaut + toggle coché).

---

## Session PALETTE (2026-07-12) — Application de "Pétrole & or"

**Branche :** `feat/polish` (non commité à la fin de la session — à valider avant commit)

Applique la palette "Pétrole & or" validée en session POLISH (voir section ci-dessous), qui n'avait pas encore été appliquée au code.

### Réalisé
- [x] `src/theme.js` : remplacement complet des tokens `colors`, `gradients`, `shadows`, et des helpers `glassCard`/`indigoGradient`/`primaryGradient`.
- [x] Remplacement de tous les hex/rgba en dur dans les 10 fichiers identifiés (`Results.jsx`, `Forge.jsx`, `Dashboard.jsx`, `Library.jsx`, `Settings.jsx`, `Sidebar.jsx`, `BottomNav.jsx`, `StoriesOutput.jsx`, `BriefInput.jsx`, `ErrorBoundary.jsx`) via substitution mécanique des triplets RGB exacts (chaque rgba en dur correspondait à un token nommé de `theme.js`, donc mapping 1:1 sans ambiguïté).
- [x] Couleurs sémantiques laissées inchangées (confirmé par grep) : `success`/`#4ade80`, `error`/`#ffb4ab`/`#ef4444`, `amber`/`#fbbf24`, le jaune `#ca8a04`/`rgba(234,179,8,…)` (bannière), le bleu Trello `#0284c7`/`#dbeafe`, `#1a0500` (texte sur bouton `error`), et toute la palette d'`ErrorBoundary.jsx`.
- [x] Tests Vitest : 29/29 passent, aucun test ne référence de hex en dur.
- [x] Vérification visuelle via `vite dev` + Playwright (Dashboard, Forge) : rendu cohérent, badges à fond plein lisibles.

### Tokens dérivés (non fournis explicitement par la palette validée à 5 couleurs — à confirmer si besoin d'ajustement)

| Token | Valeur | Méthode |
|---|---|---|
| `surfaceContainerLow` | `#0f1b19` | Interpolation HSL entre fond page et fond carte, en conservant la forme (proportions) de l'échelle à 6 niveaux de l'ancienne palette "Forge à braises" |
| `surfaceContainer` | `#16211f` | = fond carte (donné), correspond à l'usage le plus fréquent ("card") dans le code |
| `surfaceContainerHigh` | `#1a2624` | Extrapolation HSL (même méthode) |
| `surfaceContainerHighest` | `#1d2b28` | Extrapolation HSL (même méthode) |
| `surfaceBright` | `#1e302d` | Extrapolation HSL (même méthode) |
| `onSurfaceVariant` | `#7fae9d` | Réutilise l'accent secondaire tel quel — la palette validée le décrit comme "labels secondaires, icônes RAG", exactement l'usage de ce token dans le code (62 usages) |
| `tertiary` | `#a881bb` (violet-mauve) | Hue dérivée en relation triadique avec l'or (H≈41°) et le vert d'eau (H≈158°) → H≈281°, L/S calés pour rester dans la famille de luminosité des 2 accents validés. Sert au 3ᵉ surlignage Gherkin ("Et") et à l'icône de statut "loading" dans Forge |
| `outline` | `#6e8782` | Teinte neutre desaturée dérivée (même famille de teinte que le fond), pour texte tertiaire discret (séparateurs, icônes chevron/corbeille) |
| `outlineVariant` | `#1c2926` | Interpolation HSL, bordures subtiles |

### Ratios WCAG calculés

| Paire | Ratio | Usage |
|---|---|---|
| `#eef2f0` (onSurface) sur `#0d1917` | 15.91:1 | validé session précédente |
| `#eef2f0` sur `#16211f` | 14.62:1 | validé session précédente |
| `#d1a954` (primary) sur `#0d1917` | 8.14:1 | validé session précédente |
| `#d1a954` sur `#16211f` | 7.48:1 | validé session précédente |
| `#7fae9d` (secondary / onSurfaceVariant) sur `#0d1917` | 7.23:1 | validé session précédente |
| `#7fae9d` sur `#16211f` | 6.64:1 | validé session précédente |
| `#7fae9d` (onSurfaceVariant) sur `#1e302d` (surfaceBright, le fond le plus clair) | 5.58:1 | nouveau — reste largement AA même sur la surface la moins contrastée |
| `#0d1917` (onPrimary/onSecondary) sur `#d1a954` ou `#7fae9d` (fond plein) | 8.14:1 / 7.23:1 | règle critique respectée : texte foncé sur badge à fond plein accent |
| `#a881bb` (tertiary, dérivé) sur `#0d1917` | 5.58:1 | AA |
| `#a881bb` sur `#16211f` | 5.12:1 | AA |
| `#6e8782` (outline, dérivé) sur `#0d1917` | ~4.67:1 | AA, usage non-critique (icônes/séparateurs) |
| `#6e8782` sur `#16211f` | ~4.28:1 | légèrement sous AA texte normal — acceptable car jamais utilisé pour du texte de lecture, seulement icônes/séparateurs (seuil non-texte WCAG 1.4.11 = 3:1) |

### Reste à faire
- [ ] Confirmer les 3 tokens dérivés (`tertiary`, `outline`, `outlineVariant`) — pas de retour utilisateur négatif obtenu pendant cette session, à valider au prochain passage si un ajustement visuel est souhaité.
- [ ] Commit (pas fait automatiquement, à la demande explicite de l'utilisateur uniquement).
- [ ] Tester Library/Results avec de vraies données sauvegardées (Dashboard était vide pendant le test visuel — pas de génération en historique sur ce profil de test).

---

## Session POLISH (2026-07-08) — Copie par US, garde-fou RAG, palette

**Branche :** `feat/polish` (4 commits + le commit palette ci-dessous, tous poussés en local, rien pushé sur remote)

### Réalisé

- [x] **Bouton "Copier" par user story** — en plus du bouton global renommé "Copier tout" (`Results.jsx` : `StoryCopyBtn`, état `copiedStoryId`, `story.rawBlock` ajouté par `parseStories`). Tests dans `Results.test.jsx`.
- [x] **Seuil de pertinence RAG recalibré 0.3 → 0.42** (`api/retrieve-context.js:62`) — mesuré en conditions réelles : hors-sujet (auth, restaurant) ≤ 0.41, pertinent (factures, livraison, catalogue) ≥ 0.44. À 0.3 le RAG se déclenchait même hors-sujet ; à 0.5 (essayé puis rejeté) il ratait des briefs pourtant pertinents comme "voir mes factures".
- [x] **Badge "RAG actif" / "RAG non utilisé — US Générique"** dans `Results.jsx`, avec panel "Sources utilisées" affichant le score de pertinence par document (`ragChunks` groupés par filename, score max, triés desc).
- [x] **Bouton "Supprimer tout" l'historique** (`Library.jsx` + `libraryStorage.js:clearGenerations()`), garde le bouton "Supprimer" par génération. Confirmation avant suppression totale.
- [x] **Fix infra de test** : Node 22+/25 expose un `localStorage` global expérimental qui shadowe celui de jsdom et casse `setItem`/`clear` silencieusement (les tests passaient quand même à cause d'un try/catch dans `libraryStorage.js`, mais `saveGeneration` sans try/catch aurait planté). Polyfill mémoire ajouté dans `src/test/setup.js`.
- [x] **Investigation streaming** : signalé "pas de streaming visible" par l'utilisateur — non reproductible après 3 tests propres (page neuve, Chrome, brief identique) : le "Streaming Result" apparaît bien à 4-7s et se met à jour jusqu'à la fin. Pas de bug trouvé côté code ; cause probablement ponctuelle/environnementale, non élucidée.
- [x] **Palette "Forge à braises"** — remplacement complet de l'indigo/violet (`#6366f1`/`#8b5cf6`/etc., signature "généré par IA") par une palette charbon/braise/laiton dans `theme.js` + tous les hex/rgba en dur trouvés dans les composants (voir détail ci-dessous).

### ⚠️ Palette "Forge à braises" rejetée — remplacée par "Pétrole & or" (À APPLIQUER, pas encore fait)

L'utilisateur n'a pas aimé "Forge à braises" (orange/olive, trop orange/marron). Nouveau choix validé : **"Pétrole & or"**. La palette ci-dessous n'est **pas encore appliquée au code** — c'est la tâche de la prochaine session.

**Palette validée à appliquer :**
- Fond page : `#0d1917`
- Fond carte : `#16211f`
- Accent or (badges, highlights, éléments interactifs) : `#d1a954`
- Accent secondaire vert d'eau (labels secondaires, icônes RAG) : `#7fae9d`
- Texte principal (body, descriptions) : `#eef2f0`

**Contrastes WCAG validés :**
| Paire | Ratio |
|---|---|
| `#eef2f0` sur `#0d1917` | 15.91:1 |
| `#eef2f0` sur `#16211f` | 14.62:1 |
| `#d1a954` sur `#0d1917` | 8.14:1 |
| `#d1a954` sur `#16211f` | 7.48:1 |
| `#7fae9d` sur `#0d1917` | 7.23:1 |
| `#7fae9d` sur `#16211f` | 6.64:1 |

**Règle critique (déjà apprise sur "Forge à braises", reconfirmée ici)** : sur un badge/pastille/bouton à **fond plein** rempli d'une couleur d'accent, le texte doit être `#0d1917` (foncé), jamais `#eef2f0` (clair sur `#d1a954` = 1.95:1, échec sévère). Un fond translucide/bordure seule peut garder le texte clair ou accent.

**Tâches pour la prochaine session (données telles quelles par l'utilisateur) :**
1. Localiser `src/theme.js` (tokens de couleur du projet).
2. Remplacer les valeurs, avec des noms de tokens explicites (`--color-bg-page`, `--color-bg-card`, `--color-accent`, `--color-accent-secondary`, `--color-text-primary`, `--color-text-on-accent` — adapter à la convention `theme.colors.*` déjà en place plutôt que des CSS vars, `theme.js` n'utilise pas de CSS custom properties).
3. Chercher tous les hex/rgba en dur dans les composants (cf. session précédente : `Results.jsx`, `Forge.jsx`, `Dashboard.jsx`, `Library.jsx`, `Settings.jsx`, `Sidebar.jsx`, `StoriesOutput.jsx`/`BriefInput.jsx` morts) et les remplacer par les tokens.
4. Repérer spécifiquement les badges/pastilles à fond plein (`Badge`, `Pill`, `Tag`, composants de statut) et forcer `--color-text-on-accent` dessus ; fond translucide/bordure seule → texte peut rester clair/accent.
5. Ne toucher qu'aux couleurs, aucune logique fonctionnelle.
6. Calculer le ratio WCAG pour toute nouvelle paire introduite (hover, disabled, focus) avant de l'utiliser — ne pas inventer sans calcul.
7. Lister les fichiers modifiés et les ratios des nouvelles paires à la fin.
8. Ne pas assumer sur les couleurs non listées (ex: `tertiary` pour le mot-clé Gherkin "Et", `onSurfaceVariant`, `outline`/`outlineVariant`, `error`/`success`/`amber`) — redemander si ambigu, comme la session précédente l'a fait.

**Pièges de contraste déjà identifiés sur la session précédente, toujours valables ici :**
- Fond plein accent + texte clair → échec (voir règle critique ci-dessus).
- Badge à fond teinté (rgba accent à faible alpha) **avec texte de la même couleur que la teinte** perd du contraste quand l'alpha augmente (ex. hover) — plafonner ces fonds tintés à ~0.08 d'alpha, vérifier au cas par cas avec le nouvel accent or `#d1a954` (le calcul dépendra de sa luminosité, différente de l'orange précédent).
- `error`/`success`/`amber` restent probablement inchangés (sémantiques, indépendants de l'accent de marque).

---

## Session RAG-3 (2026-06-20) — Chunking avec outil professionnel

**Objectif :** Remplacer le chunking regex maison par `RecursiveCharacterTextSplitter` de `@langchain/textsplitters`, standard industrie pour les pipelines RAG.

### Étapes

- [x] **Étape 1 — Installer la dépendance** : `npm install @langchain/textsplitters`
- [x] **Étape 2 — Remplacer `chunkText()` dans `api/upload-doc.js`** : utiliser `RecursiveCharacterTextSplitter` avec `chunkSize: 1600`, `chunkOverlap: 200`, séparateurs `["\n\n", "\n", ". ", " ", ""]`
- [x] **Étape 3 — Nettoyer les debug logs** dans `api/upload-doc.js` (les `console.log("[debug]...")` laissés de la session RAG-2)
- [ ] **Étape 4 — Re-indexer les documents** : supprimer + re-uploader les docs dans l'UI pour bénéficier du nouveau chunking
- [ ] **Étape 5 — Vérifier les scores** : les scores de match doivent monter de 38-51% → 60-75%+
- [ ] **Étape 6 — Commiter**

---

## Session RAG-4 (2026-06-20) — Affichage Sources professionnel

**Objectif :** Remplacer le panel "X passages récupérés" (scores bruts en %) par un panel "Sources utilisées" minimaliste — les scores cosine sont un détail d'implémentation, pas une métrique utilisateur.

### Étapes

- [x] **Étape 1 — Remplacer le panel RAG dans `Results.jsx`** : supprimer `ChunkItem` avec % et barres de progression, le remplacer par une liste de noms de documents avec un indicateur visuel simple (point vert = contribué)
- [x] **Étape 2 — Dédupliquer par filename** : si plusieurs chunks du même doc sont retournés, n'afficher le doc qu'une seule fois
- [x] **Étape 3 — Supprimer les styled components inutilisés** : `ChunkList`, `ChunkItem`
- [ ] **Étape 4 — Commiter**

---

## Session RAG-5 (2026-06-20) — Guard duplicate upload

**Objectif :** Empêcher le re-upload silencieux d'un fichier déjà indexé. Afficher une confirmation avant d'écraser.

### Étapes

- [x] **Étape 1 — Détecter le doublon dans `Forge.jsx`** : avant l'upload, vérifier si `documents` contient déjà un doc avec le même `name` que le fichier déposé
- [x] **Étape 2 — Afficher une confirmation** : si doublon détecté, afficher un message inline "Ce document est déjà indexé. Remplacer ?" avec deux boutons (Remplacer / Annuler)
- [x] **Étape 3 — Bloquer ou continuer** selon le choix utilisateur
- [ ] **Étape 4 — Commiter**

---

## Session DEMO (2026-06-21) — Préparation publication LinkedIn

**Objectif :** Préparer l'app pour une démo publique sans exposer les opérations destructives (upload/suppression) aux visiteurs.

### Réalisé
- [x] Chips Lumeo Boutique dans Forge.jsx (4 briefs pré-remplis, sans détails inventés)
- [x] Ligne de contexte démo au-dessus du textarea
- [x] Instruction RAG anti-hallucination dans le prompt système (`api/generate-stories.js`)
- [x] Upload, suppression et indexation désactivés en frontend (messages explicatifs, curseur non-cliquable)
- [x] Garde-fous backend : 403 dans `api/upload-doc.js` et `api/delete-doc.js` si `DEMO_MODE=true`
- [ ] Ajouter `DEMO_MODE=true` dans les variables d'env Vercel (Production uniquement)

---

## Session HISTORIQUE (2026-06-21) — Historique localStorage

**Objectif :** Remplacer les données factices du Dashboard et de la page Library par un vrai historique fonctionnel, stocké en localStorage (un historique par navigateur/visiteur, pas de backend).

### Structure d'une entrée
```json
{
  "id": "timestamp",
  "title": "30 premiers caractères du brief",
  "brief": "le brief original",
  "stories": "texte markdown complet",
  "sourcesUsed": ["filename1.pdf", "filename2.pdf"],
  "storiesCount": 4,
  "createdAt": "2026-06-21T14:00:00.000Z"
}
```
Clé localStorage : `storyforge_library`

### Plan de fichiers
| Fichier | Action | Détail |
|---|---|---|
| `src/utils/libraryStorage.js` | Créer | `saveGeneration`, `getGenerations`, `deleteGeneration` |
| `src/screens/Library.jsx` | Créer | Page Historique complète avec vue détail et suppression |
| `src/App.jsx` | Modifier | Remonter `brief`/`setBrief` en state global, brancher Library, passer `onNavigate` à Results |
| `src/screens/Forge.jsx` | Modifier | `brief`/`setBrief` deviennent des props (plus du state local) |
| `src/screens/Results.jsx` | Modifier | Bouton save fonctionnel + panel récents réels + SeeAllLink navigue vers library |
| `src/screens/Dashboard.jsx` | Modifier | Panel récents et stats calculés depuis `getGenerations()` |
| `src/components/layout/Sidebar.jsx` | Modifier | "Library" → "Historique" |

### Étapes
- [x] **Étape 1** — Créer `src/utils/libraryStorage.js`
- [x] **Étape 2** — Remonter `brief` dans `App.jsx`, passer `onNavigate` à `Results`
- [x] **Étape 3** — Adapter `Forge.jsx` (brief en prop)
- [x] **Étape 4** — Brancher "Sauvegarder" dans `Results.jsx` + panel récents réels
- [x] **Étape 5** — Mettre à jour `Dashboard.jsx` (stats + récents réels)
- [x] **Étape 6** — Créer `Library.jsx` (page Historique)
- [x] **Étape 7** — Brancher Library dans `App.jsx` + renommer dans Sidebar
- [ ] **Commiter**

---

## Tests recruteur — À valider

### Comportement réseau
| Test | Statut |
|---|---|
| Recharger page pendant génération | ⬜ À tester |
| Clic rapide multiple sur "Générer" | ⬜ À tester |
| Génération successive (2x) | ⬜ À tester |

### UX / Interface
| Test | Statut |
|---|---|
| Bouton "Copier" → coller dans éditeur | ⬜ À tester |
| Test sur vrai mobile | ⬜ À tester |
| Lien feedback Google Form | ⬜ À tester |

### Accessibilité
| Test | Statut |
|---|---|
| Navigation clavier uniquement (Tab/Enter) | ⬜ À tester |
| Zoom 200% navigateur | ⬜ À tester |

---

## Stack RAG — Référence

- Index Pinecone : `storyforge`, dimension 512, cosine, serverless AWS us-east-1
- Embedding : OpenAI `text-embedding-3-small` 512 dims
- Env vars : `OPENAI_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_URL`
- URL index : `https://storyforge-g08tbyk.svc.aped-4627-b74a.pinecone.io`
- ⚠️ Index partagé entre tous les visiteurs (pas d'isolation multi-tenant) — ne pas déployer avec de vrais docs sensibles

---

## Notes techniques

- **404 en local** : attendu — `vite dev` ne sert pas `/api`. Utiliser `vercel dev` pour tester l'API localement.
- **Rate limiting** : Map en mémoire, non persistant entre cold starts Vercel. À migrer vers Upstash Redis si mis en prod réelle.
