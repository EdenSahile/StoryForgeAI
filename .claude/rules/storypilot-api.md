---
paths:
  - "api/**"
---

# Règles API StoryPilot

- Ne jamais exposer la clé API Anthropic côté client, uniquement via variable d'environnement serveur
- Toute requête vers Claude doit avoir un timeout de 30 secondes maximum (implémenté via `AbortController` dans `api/generate-stories.js` — borne l'établissement de la réponse ; le streaming qui suit est borné par `config.maxDuration`)
- Gérer explicitement les codes d'erreur 401 (clé invalide), 429 (rate limit), 500 (serveur indisponible) avec un message utilisateur clair pour chacun, plus le timeout (504) et l'épuisement de budget Anthropic (`billing_error`)
- Le rate limiter en mémoire (Map) n'est pas persistant entre les cold starts Vercel — le signaler dans tout commentaire touchant à cette logique
- `max_tokens` de la réponse Claude est à 8000 (couvre 3-5 stories à 3 scénarios Gherkin, justifié par mesure réelle js-tiktoken — voir le commentaire dans `api/generate-stories.js` et CLAUDE.md). Pas de cap en nombre de caractères côté serveur ; le garde-fou anti-blocage UI est côté client (`MAX_OUTPUT_LENGTH` dans `claudeService.js`)
