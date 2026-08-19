# Inventaire des tests — StoryPilot AI

État réel de la couverture de test, fonctionnalité par fonctionnalité, tel que le code se présente aujourd'hui (pas un plan pour du code à venir).

## Légende

- 🟢 **testable en unitaire** — logique pure, déjà extractible ou extractible dans `src/logic/`, ou déjà couvert par un test de handler `api/*.js` appelé directement, sans rendu.
- 🟠 **mixte** — une part unitaire + une part qui a besoin d'un vrai rendu (React Testing Library / jsdom) ou d'un vrai navigateur.
- 🔴 **nécessite un vrai navigateur** — parcours utilisateur, interaction visuelle, résultat observable seulement à l'écran (Playwright).

## Inventaire

| Fonctionnalité | Classement | Ce qui existe déjà | Ce qui manque |
|---|---|---|---|
| `api/generate-stories.js` | 🟢 déjà fait | `src/test/api-generate-stories.test.js` — CORS/méthode, validation brief (vide, < 10, > 2000, limite haute incluse), config serveur manquante (500 générique), non-fuite d'`error.message`, rate limiting (10 req/15 min/IP, isolation par IP, OPTIONS non compté). | Rien de significatif côté handler. Le streaming SSE réel émis par la route n'est testé qu'indirectement via l'e2e. |
| `api/upload-doc.js` | 🟢 déjà fait | `src/test/api-upload-doc.test.js` — CORS, mode démo (403), config manquante (3 clés), validation filename/content/extension/longueur texte extrait, formats PDF/DOCX/TXT (libs mockées), non-fuite d'erreur, succès avec chunks/characters. | Rien de significatif. |
| `api/retrieve-context.js` | 🟢 déjà fait | `src/test/api-retrieve-context.test.js` — CORS, config manquante (3 clés), validation brief, `topK` : toutes les bornes (défaut 5, 1, 20, 0, 21, négatif, décimal, chaîne numérique, non numérique), non-fuite, filtrage par score. | Rien de significatif. |
| `api/list-docs.js` | 🟢 déjà fait | `src/test/api-list-docs.test.js` — CORS, config manquante, pagination Pinecone, filtrage métier (IDs `_chunk_0`, records sans filename), valeurs par défaut si champs absents, non-fuite, succès. | Rien de significatif. |
| `api/delete-doc.js` | 🟢 déjà fait | `src/test/api-delete-doc.test.js` — CORS, mode démo, config manquante, validation filename, pagination avant suppression, comportement idempotent (200 + `chunksDeleted: 0` si rien trouvé), non-fuite. | Rien de significatif. |
| `Dashboard.jsx` | 🟢 déjà fait | `src/logic/dashboardStats.js` + `dashboardStats.test.js` (15 tests, `formatRelativeDate` et `getMonthlyStats` extraits en fonctions pures) et `src/test/Dashboard.test.jsx` (9 tests de rendu). | Rien de significatif. |
| `Settings.jsx` | 🟢 déjà fait | `src/test/Settings.test.jsx` (9 tests : compteur de générations, flux de confirmation "Effacer l'historique", bloc "À propos"). | Rien de significatif. |
| `ragService.js` | 🟢 déjà fait | `src/test/ragService.test.js` — même patron que `claudeService.js` (`fetch` mocké, aucun rendu) : `uploadDocument`, `retrieveContext`, `listDocuments`, `deleteDocument`, cas d'erreur HTTP et fallback de message. | Rien de significatif. |
| `libraryStorage.js` | 🟢 déjà fait | `src/test/libraryStorage.test.js` — fonctions pures manipulant `localStorage` : troncature du titre, tri décroissant dans `getGenerations`, `deleteGeneration`, `updateGeneration` (merge partiel), `clearGenerations`, JSON corrompu (`catch` → `[]`). | Rien de significatif. |
| `Forge.jsx` | 🟢 déjà fait | `src/test/Forge.test.jsx` (13 tests au total : toggle "Générer sans RAG" existant + soumission bloquée, limite 2000 caractères, Ctrl+Entrée, erreurs, panneau RAG streaming, navigation auto, restauration du brief). | Rien de significatif. Note : le "flux complet d'upload" mentionné dans l'ancienne version de cet inventaire n'existe plus — code mort supprimé le 2026-08-19 (mode démo verrouillé, voir `context.md`). |
| `Results.jsx` | 🟢 déjà fait | `src/logic/storyParser.js` + `storyParser.test.js` (22 tests, `parseStories()` extraite) et `src/test/Results.test.jsx` existant (5 tests de rendu, inchangé). | Rien de significatif. |
| `Library.jsx` | 🟢 déjà fait | `src/test/Library.test.jsx` (21 tests au total : "Supprimer tout" existant + navigation liste/détail, renommage, suppression individuelle, copier, chips de documents source). | Rien de significatif. |
| ~~`BriefInput.jsx`~~ | — | — | **Supprimé le 2026-08-19** (composant + `src/test/BriefInput.test.jsx`), confirmé mort (non importé nulle part), déjà noté "legacy v1" dans `README.md`. Voir `context.md`. |
| ~~`StoriesOutput.jsx`~~ | — | — | **Supprimé le 2026-08-19** (composant + `src/test/StoriesOutput.test.jsx`), même constat. Voir `context.md`. |
| `claudeService.js` | 🟢 déjà fait | `src/test/claudeService.test.js` — validation du brief, erreurs réseau, **+ parsing du streaming SSE (buffer recollé entre deux `read()`, JSON malformé ignoré, marqueur `[DONE]`), les 3 déclencheurs de troncature (`MAX_OUTPUT_LENGTH`, flag `truncated` explicite, coupure silencieuse sans `stop`), timeout 90s (`AbortController`, avec/sans contenu partiel)** — 16 tests au total. Comblé le 2026-08-19 (PR #41). | Rien de significatif. Dette technique mineure trackée séparément dans `context.md` : `onTruncated` appelé deux fois sur le flag `truncated` explicite (comportement testé tel quel, pas corrigé). |
| Parcours e2e (brief → génération → résultats) | 🔴 déjà fait | `e2e/generate-stories.spec.js` (Playwright, 4 tests au total) — même `describe`, mêmes routes API mockées (`list-docs`, `retrieve-context`, `generate-stories` en SSE simulé) réutilisées entre les tests : (1) saisie du brief → clic "Générer" → arrivée sur l'écran de résultats avec la story affichée ; (2) sauvegarde automatique en historique après génération réussie, entrée retrouvée dans "Historique" et vue détail ; (3) erreur API (429) pendant la génération affichée à l'écran, app toujours utilisable, fermeture du message ; (4) navigation complète entre tous les écrans via la Sidebar (Dashboard → Forge → Historique → Settings → Dashboard). | Rien de significatif sur le chemin critique — reste hors périmètre : viewport mobile (BottomNav), pas testé par choix (noté dans les tests eux-mêmes). |

## Priorités

Toutes les priorités identifiées dans cet inventaire sont couvertes au 2026-08-19 (232 tests unitaires, 15 fichiers de test — `npm run test:run` ; 4 tests e2e — `npx playwright test`). Le parcours e2e étendu (sauvegarde auto en historique, flux d'erreur visible à l'écran, navigation complète entre écrans) a été comblé par les PR #57, #58 et #59. Le seul gap restant (viewport mobile / BottomNav) est un choix volontaire, hors périmètre, et non un trou non traité.

*Note hors tableau :* `BriefInput.jsx` et `StoriesOutput.jsx`, repérés dans cet inventaire comme morts (meilleure couverture de test du projet, mais non branchés dans l'app réelle), ont été supprimés le 2026-08-19 — composants et tests associés. Voir `context.md` pour la trace de ce nettoyage.
