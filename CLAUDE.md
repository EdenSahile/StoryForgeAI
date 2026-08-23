# StoryPilot AI

Générateur de user stories à partir d'un brief métier, avec streaming en temps réel via l'API Claude.

## Stack

- React 18+ avec Vite 5+ (bundler)
- styled-components pour le CSS-in-JS
- API Claude (Sonnet) appelée côté serveur via `api/generate-stories.js` (route serverless Vercel)
- Tests : Vitest + @testing-library/react

## Architecture

```
api/generate-stories.js     # route serverless, appelle Claude, gère rate limiting et CORS
src/components/services/claudeService.js   # client streaming SSE, gère timeout et erreurs
src/screens/Forge.jsx                      # formulaire de saisie du brief + upload RAG
src/screens/Results.jsx                    # parsing et rendu des user stories générées
src/App.jsx                                # état global, orchestration
```

## Règles non négociables

- Ne jamais exposer la clé API Anthropic côté client. Elle vit uniquement en variable d'environnement serveur (`ANTHROPIC_API_KEY`), jamais préfixée `VITE_`.
- Toute erreur serveur renvoyée au client doit être un message générique. Ne jamais renvoyer `error.message` brut au client (cf. SEC-001) — logger le détail côté serveur uniquement.
- Le brief utilisateur est limité à 2000 caractères, validé côté serveur (pas seulement côté client) et encadré par des délimiteurs `"""` dans le prompt envoyé à Claude pour limiter le risque d'injection.
- Timeout de 30 secondes max sur tout appel à l'API Claude.
- `max_tokens` de la réponse Claude actuellement à 8000 côté serveur (augmenté depuis 1000 pour couvrir 3-5 stories à 3 scénarios Gherkin chacune, justifié par mesure réelle via js-tiktoken, cf. commentaire dans api/generate-stories.js) — toute augmentation supplémentaire doit rester documentée par un calcul réel, jamais une estimation.
- Le rate limiting actuel (Map en mémoire dans `api/generate-stories.js`) n'est pas persistant entre cold starts Vercel. Le signaler dans tout commentaire ou PR touchant cette logique tant que la migration vers Vercel KV / Upstash Redis n'est pas faite.
- Les origins CORS autorisées viennent de `process.env.ALLOWED_ORIGINS`, jamais hardcodées dans le code.
- L'extension du fichier envoyé à `api/upload-doc.js` doit être `.txt`, `.pdf` ou `.docx`, validée côté serveur avant tout appel à `extractText()`. Extension absente ou non supportée → rejet 400 explicite (`Format non supporté : .xyz. Utilisez PDF, DOCX ou TXT.`), jamais via une exception.
- `unpdf` (extraction PDF dans `api/upload-doc.js`) est pin sur `~1.7.0`, pas `^1.6.2` : `1.8.0` introduit `"engines": {"node": ">=22"}`, incompatible avec le Node 20 verrouillé par ce projet (`.nvmrc`, `engines` de `package.json`, `engine-strict=true` dans `.npmrc`, cf. section CI). Ne pas repasser à `^1.7.0` ou plus sans revérifier cette contrainte `engines` sur la version ciblée — `engine-strict=true` la fait échouer en CI (Node 20.20.2) sans avertissement en local (`npm install` en environnement Node ≥22 ne verrait pas le problème).
- `topK` (`api/retrieve-context.js`) doit être un entier compris entre 1 et 20 inclus, validé côté serveur avant tout appel à Pinecone. Absent du body → valeur par défaut 5 (comportement inchangé). Présent mais invalide (non numérique, non entier, < 1, > 20, y compris une chaîne numérique comme `"5"`) → rejet 400 explicite, pas de coercition silencieuse.
- Tout champ dérivé de contenu utilisateur ou généré par le LLM et exporté en CSV doit neutraliser l'injection de formule (OWASP CSV Injection) : préfixer d'une apostrophe tout champ commençant par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot (`\r`, défense en profondeur — pas un déclencheur de formule reconnu en pratique), en plus de l'échappement RFC 4180. Voir `escapeCsvField` dans `src/logic/csvExport.js`.
- Le prompt système (`api/generate-stories.js`) doit toujours autoriser le modèle à rester générique sur un point précis du brief quand le contexte documentaire RAG injecté ne montre aucun équivalent métier chez ce client — jamais forcer un rattachement inventé (fausse caractéristique produit, faux prix, faux programme lié) juste parce qu'un chunk a passé le seuil de pertinence. Cas réel qui l'a motivé : brief hors-sujet "choisir la couleur de mon téléphone" sur la démo Lumeo Boutique (déco/luminaires, ne vend aucun téléphone) — un seul chunk FAQ à 43% (juste au-dessus du seuil 0.42) a suffi à faire inventer par le modèle que Lumeo vend des téléphones, avec un faux prix et un faux calcul de cashback sur le programme fidélité réel "Lumeo+". La clause doit rester équilibrée : elle ne doit ni se faire ignorer par les instructions `DOIS`/`INTERDIT` plus fortes situées juste au-dessus (testé : une formulation trop faible n'a rien changé), ni faire refuser toute génération ou demander une clarification au client (testé : une formulation trop absolue a fait produire une réponse méta au lieu de user stories). Toute modification de cette clause doit être revérifiée avec ce même brief de reproduction avant merge.

## CI (`claude-pr-review.yml`)

- Trois jobs sur chaque pull request : `test` (`npx vitest run`), `e2e` (`npx playwright install --with-deps chromium` puis `npx playwright test`), et `claude-review`, qui dépend des deux premiers (`needs: [test, e2e]`).
- `e2e` fait partie de la CI depuis le 2026-08-23 seulement. Avant cette date, seul `npx vitest run` tournait en CI : la suite Playwright (`e2e/generate-stories.spec.js`) n'existait qu'en local, via `npm run test:e2e`. Une régression e2e (deux bugs indépendants : un texte de heading Dashboard désynchronisé depuis 177d67a, et l'écran initial conditionnel introduit par dd5bff2 qui envoie désormais un nouvel utilisateur sans historique sur Forge plutôt que Dashboard) est passée inaperçue faute d'exécution automatique — d'où l'ajout du job `e2e`.
- Le job `claude-review` (`anthropics/claude-code-action@v1`) refuse de s'exécuter, et ne soumet donc jamais de review, tant que le fichier `.github/workflows/claude-pr-review.yml` de la branche de la PR diffère de celui sur `main` — protection anti-triche intentionnelle de l'action, pas un bug de ce projet. Une PR qui modifie ce fichier ne recevra donc jamais sa propre review automatique ; elle doit être mergée (bypass admin si la branch protection l'exige) avant que le nouveau comportement s'applique aux PR suivantes.
- Symptôme trompeur : le job apparaît vert ("succeeded"), mais aucune review n'existe (vérifiable via `GET /repos/.../pulls/<n>/reviews`). Le détail réel (message "Workflow validation failed…") n'apparaît qu'avec `show_full_output: true` sur l'action, désactivé par défaut.
- **Version Node/npm verrouillée** (`.nvmrc`, `engines` dans `package.json`, `engine-strict=true` dans `.npmrc`) : la CI (`actions/setup-node@v4`) tourne sur Node 20 / npm ~10.x. Sur PR #71, `package-lock.json` avait été régénéré en local avec npm 11.17.0, qui résout différemment une dépendance imbriquée d'`esbuild` dans `vitest` — `npm ci` échouait alors en CI (`Missing: esbuild@0.28.2 from lock file`) sans que rien ne le signale en local (`npm install` accepte silencieusement l'incohérence, `npm ci` non). `engine-strict=true` fait refuser `npm install`/`npm ci` si la version locale ne correspond pas à `engines`, pour empêcher de reproduire ce bug.

## Discipline de branche

- **Avant de commencer tout travail (nouveau fichier, correction, feature), vérifier la branche courante (`git branch --show-current`).** Si elle est `main`, prévenir explicitement l'utilisateur avant de continuer ("Tu es sur `main`, tu veux que je crée une branche d'abord ?") plutôt que de commencer à modifier des fichiers dessus. Ne jamais créer une branche à sa place sans le dire.

## Conventions de code

- Composants fonctionnels avec hooks, pas de classes.
- Tout nouveau composant avec logique non triviale doit avoir un test associé (Vitest).
- JSDoc requis sur les fonctions exportées de `claudeService.js` (`@param`, `@throws`, description des callbacks).
- Pas de `console.error` actif en production côté client — conditionner au mode dev.
- Le prompt système envoyé à Claude est en français ; la réponse doit rester en français même si le brief est rédigé en anglais (comportement voulu, ne pas "corriger" sans demande explicite).
- Toute couleur dans un composant passe par un token `theme.colors.*` (jamais de `#hex` ou `rgba()` codé en dur) — environ 85 valeurs en dur ont dû être traquées et corrigées le 2026-08-23 faute de cette discipline dès le départ.
- La logique métier réutilisable (parsing, calculs, formatage) est extraite en fonction pure dans `src/logic/`, testée dans `src/test/` (jamais colocalisée) — voir `storyParser.js`, `csvExport.js`, `initialScreen.js`, `themeStorage.js`, `dashboardStats.js`.

## Pour le suivi d'avancement, les sessions précédentes, et la grille de tests recruteur

Voir `context.md` à la racine du projet — ce fichier n'est pas chargé automatiquement, le mentionner explicitement si une tâche en dépend.
