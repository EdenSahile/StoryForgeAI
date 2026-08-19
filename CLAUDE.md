# StoryPilot AI

Générateur de user stories à partir d'un brief métier, avec streaming en temps réel via l'API Claude.

## Stack

- React 18+ avec Vite 5+ (bundler)
- styled-components pour le CSS-in-JS
- react-markdown pour le rendu des résultats
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
- `max_tokens` de la réponse Claude plafonné à 1000 côté serveur — ne pas augmenter sans raison documentée.
- Le rate limiting actuel (Map en mémoire dans `api/generate-stories.js`) n'est pas persistant entre cold starts Vercel. Le signaler dans tout commentaire ou PR touchant cette logique tant que la migration vers Vercel KV / Upstash Redis n'est pas faite.
- Les origins CORS autorisées viennent de `process.env.ALLOWED_ORIGINS`, jamais hardcodées dans le code.
- L'extension du fichier envoyé à `api/upload-doc.js` doit être `.txt`, `.pdf` ou `.docx`, validée côté serveur avant tout appel à `extractText()`. Extension absente ou non supportée → rejet 400 explicite (`Format non supporté : .xyz. Utilisez PDF, DOCX ou TXT.`), jamais via une exception.
- `topK` (`api/retrieve-context.js`) doit être un entier compris entre 1 et 20 inclus, validé côté serveur avant tout appel à Pinecone. Absent du body → valeur par défaut 5 (comportement inchangé). Présent mais invalide (non numérique, non entier, < 1, > 20, y compris une chaîne numérique comme `"5"`) → rejet 400 explicite, pas de coercition silencieuse.

## Discipline de branche

- **Avant de commencer tout travail (nouveau fichier, correction, feature), vérifier la branche courante (`git branch --show-current`).** Si elle est `main`, prévenir explicitement l'utilisateur avant de continuer ("Tu es sur `main`, tu veux que je crée une branche d'abord ?") plutôt que de commencer à modifier des fichiers dessus. Ne jamais créer une branche à sa place sans le dire.

## Conventions de code

- Composants fonctionnels avec hooks, pas de classes.
- Tout nouveau composant avec logique non triviale doit avoir un test associé (Vitest).
- JSDoc requis sur les fonctions exportées de `claudeService.js` (`@param`, `@throws`, description des callbacks).
- Pas de `console.error` actif en production côté client — conditionner au mode dev.
- Le prompt système envoyé à Claude est en français ; la réponse doit rester en français même si le brief est rédigé en anglais (comportement voulu, ne pas "corriger" sans demande explicite).

## Pour le suivi d'avancement, les sessions précédentes, et la grille de tests recruteur

Voir `context.md` à la racine du projet — ce fichier n'est pas chargé automatiquement, le mentionner explicitement si une tâche en dépend.
