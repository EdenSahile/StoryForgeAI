# Handoff — StoryPilot AI

**Dernière mise à jour :** 2026-08-05
**Branche par défaut :** `main`

Ce fichier donne un état des lieux du projet à un instant T pour reprendre le travail rapidement. Pour l'historique détaillé session par session (bugs résolus, décisions, pièges rencontrés), voir `context.md` — non chargé automatiquement, à mentionner explicitement si une tâche en dépend.

---

## État général

- Application déployée et fonctionnelle : [storypilot-ai.vercel.app](https://storypilot-ai.vercel.app)
- Repo GitHub : `EdenSahile/StoryPilot-ai`
- Stack, architecture et conventions de code : voir `CLAUDE.md` (chargé automatiquement) et `README.md`.

## CI/CD

Le workflow `.github/workflows/claude-pr-review.yml` est pleinement opérationnel depuis le 2026-07-13 : chaque PR déclenche un job de tests (`vitest`) puis une review Claude automatique qui approuve ou demande des changements selon `CLAUDE.md`. L'auto-merge natif GitHub prend le relais une fois les checks requis au vert (à activer PR par PR, pas automatique par défaut).

Branch protection sur `main` : 1 review approuvante requise + check "Tests" requis. Les admins peuvent bypasser (`gh pr merge --admin`) — nécessaire pour toute PR qui modifie le workflow CI lui-même (protection anti-triche de `claude-code-action`, voir `context.md` session CI/PR-REVIEW pour le détail).

**Règles de collaboration git en vigueur** (voir mémoire `feedback_git_workflow.md`) : jamais de push direct sur `main` sans PR, jamais de PR créée sans autorisation explicite préalable.

## Secrets / variables d'environnement

```
ANTHROPIC_API_KEY       # app en prod uniquement (api/generate-stories.js) — clé pay-per-use, solde prépayé à surveiller sur console.anthropic.com
CLAUDE_CODE_OAUTH_TOKEN # CI uniquement (review de PR) — lié à l'abonnement Claude.ai, découplé du budget prod
OPENAI_API_KEY          # embeddings RAG (text-embedding-3-small, 512 dims)
PINECONE_API_KEY
PINECONE_INDEX_URL      # index storyforge (nom technique historique, pas renommé lors du rebrand StoryPilot)
ALLOWED_ORIGINS         # CORS, jamais hardcodé dans le code
DEMO_MODE               # true en prod publique — désactive upload/suppression de documents
```

⚠️ Ne jamais réutiliser `ANTHROPIC_API_KEY` pour un usage CI/tooling — les deux budgets se cumuleraient silencieusement (déjà arrivé une fois, voir `context.md`).

## RAG

Index Pinecone `storyforge`, partagé entre tous les visiteurs de la démo publique (pas d'isolation multi-tenant) — ne pas y indexer de documents sensibles. Chunking via `RecursiveCharacterTextSplitter` (`@langchain/textsplitters`). Voir `README.md` section "Pipeline RAG" pour le détail technique à jour.

## Points d'attention connus

- Rate limiting (`api/generate-stories.js`) : Map en mémoire, non persistant entre cold starts Vercel — à migrer vers Vercel KV / Upstash Redis si le trafic le justifie un jour (rappelé dans `CLAUDE.md`).
- `404` en local sur les routes `/api/*` : attendu, `vite dev` ne sert pas les fonctions serverless. Utiliser `vercel dev` pour tester l'API en local.

## Pour aller plus loin

- Historique complet des sessions, bugs résolus et décisions de design : `context.md`.
- Reproduire le setup CI Claude sur un autre projet : `docs/ci-claude-pr-review-workflow.md` (gardé en local, non commité — voir `.gitignore`).
- Specs et plans issus de sessions de brainstorming : `docs/superpowers/specs/` et `docs/superpowers/plans/`.
