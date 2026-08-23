# StoryPilot AI

**Générateur de user stories contextualisé par IA — pour les Product Owners qui veulent des specs précises, pas des généricités.**

StoryPilot transforme un brief métier en user stories structurées avec critères d'acceptation, estimation de complexité et scénarios Gherkin multi-cas — le tout généré par Claude en streaming temps réel, optionnellement enrichi par une base de connaissance documentaire (RAG).

🔗 **[Démo live](https://storypilot-ai.vercel.app)**

---

## Ce que fait StoryPilot

Un PO écrit un brief en langage naturel. StoryPilot génère instantanément des user stories complètes, prêtes à intégrer dans un backlog Jira/Linear :

- **Statement** structuré : En tant que / Je veux / Afin de
- **Description métier** : contexte fonctionnel détaillé
- **Critères d'acceptation** : 4-6 critères précis et testables
- **Scénarios Gherkin** : 3 scénarios par story (nominal, alternatif, cas d'erreur/limite), avec coloration syntaxique des mots-clés (Étant donné / Quand / Alors / Et)
- **Complexité** : estimation S / M / L

Le tout arrive en streaming — l'utilisateur voit la génération en temps réel.

Si des documents métier ont été indexés dans la base de connaissance, StoryPilot récupère automatiquement les passages pertinents (RAG) et les injecte dans le prompt : les stories générées réutilisent alors le vocabulaire, les règles de gestion et les contraintes réelles du client, plutôt que des généralités. Un toggle permet de désactiver ce comportement pour une génération donnée et forcer une sortie générique — utile pour comparer, ou pour tester rapidement sans dépendre de la base de connaissance.

---

## Screens

### Dashboard
Vue d'ensemble avec statistiques de génération (calculées depuis l'historique local), générations récentes et accès rapide à la Forge.

### Forge
L'écran principal. Deux colonnes : le brief à gauche, la base de connaissance à droite.
- Chips de briefs pré-remplis (mode démo : contexte fictif "Lumeo Boutique", e-commerce déco/luminaires)
- Toggle **"Générer sans RAG (US génériques)"** en haut à droite du textarea — désactive la récupération de contexte pour cette génération
- Pendant la génération : les chunks RAG récupérés s'affichent avec leur document source, et le résultat arrive en streaming
- Panel base de connaissance : upload de documents (PDF, DOCX, TXT), liste des documents indexés — désactivé en mode démo publique pour préserver l'expérience des autres visiteurs (la base de connaissance y est pré-chargée)

### Results
Les user stories parsées et structurées en cards visuelles (composant `StoryCard`). Chaque card affiche le statement colorisé, la description, les critères avec checkmarks, et les scénarios Gherkin colorés. Badge **"RAG actif"** ou **"RAG non utilisé — US Générique"** selon qu'un contexte documentaire ait été utilisé, avec un panel "Sources utilisées" listant les documents mobilisés.

Export CSV compatible avec l'import natif de Jira, par story ou pour toutes les stories d'un coup, généré côté client avec neutralisation de l'injection de formule CSV (OWASP CSV Injection). Export Trello listé mais volontairement non implémenté pour la démo — nécessiterait une authentification OAuth par utilisateur, absente d'une démo publique — un message explicite le précise plutôt que de simuler un succès. Boutons de copie (par story et globale) et bouton de sauvegarde dans l'historique.

### Historique (Library)
Historique des générations sauvegardées, stocké en `localStorage` (local au navigateur, non synchronisé entre appareils). Vue liste + vue détail par génération, avec la même mise en forme riche que l'écran Results (le composant `StoryCard` est partagé entre les deux écrans, plutôt qu'un texte brut). Suppression individuelle ou totale.

### Réglages (Settings)
Trois sections : Apparence (bascule thème sombre / thème clair, chip dédié dans Réglages ou icône dans le header sur les 5 écrans), Données locales (effacer l'historique), À propos (stack technique, version).

---

## Stack technique

| Technologie | Rôle |
|---|---|
| React 18 + Vite | Framework UI + bundler |
| styled-components | CSS-in-JS, design tokens centralisés (`theme.js`) |
| Claude API (Sonnet) | Génération des user stories, streaming SSE |
| OpenAI (`text-embedding-3-small`) | Embeddings pour la recherche sémantique (512 dimensions) |
| Pinecone | Base vectorielle pour le RAG (index serverless, cosine) |
| `@langchain/textsplitters` | Chunking des documents (`RecursiveCharacterTextSplitter`) |
| Vercel | Déploiement + serverless functions |
| Vitest + Testing Library | Tests unitaires/composants |
| Playwright | Tests end-to-end |

---

## Architecture

```
src/
├── theme.js                          # Design tokens (couleurs, spacing, fonts)
├── App.jsx                           # Navigation par état + orchestration globale
├── components/
│   ├── layout/
│   │   ├── Sidebar.jsx               # Navigation desktop
│   │   └── BottomNav.jsx             # Navigation mobile
│   ├── services/
│   │   ├── claudeService.js          # Client API Claude (streaming SSE)
│   │   └── ragService.js             # Client upload/retrieval/suppression documents
│   ├── StoryCard.jsx                 # Card story — partagée entre Results et Library
│   ├── ErrorBoundary.jsx             # Catch erreurs React
│   └── Footer.jsx
├── screens/
│   ├── Dashboard.jsx                 # Stats + générations récentes
│   ├── Forge.jsx                     # Brief + base de connaissance + streaming
│   ├── Results.jsx                   # Stories structurées + Gherkin + export CSV/Trello
│   ├── Library.jsx                   # Historique des générations (localStorage)
│   └── Settings.jsx                  # Apparence (thème), données locales, à propos
├── logic/                            # Logique métier pure, sans dépendance React — testée en Vitest sans rendu
│   ├── storyParser.js                # Parsing du texte brut Claude → stories structurées
│   ├── csvExport.js                  # Génération du CSV compatible import Jira
│   ├── dashboardStats.js             # Calcul des stats Dashboard depuis l'historique
│   ├── themeStorage.js               # Persistance du thème choisi (localStorage)
│   └── initialScreen.js              # Écran de démarrage selon l'historique existant
├── utils/
│   └── libraryStorage.js             # CRUD historique localStorage
└── test/                             # Suites Vitest (18 fichiers, 273 tests)

api/
├── generate-stories.js               # Serverless — proxy Claude API, streaming, rate limiting
├── retrieve-context.js               # Serverless — embed le brief, requête Pinecone
├── upload-doc.js                     # Serverless — extraction texte, chunking, embed, indexation
├── delete-doc.js                     # Serverless — suppression d'un document indexé
└── list-docs.js                      # Serverless — liste des documents indexés
```

### Flow de données

```
[Dashboard] → clic "New Story"
     ↓
[Forge] → brief + base de connaissance (toggle "sans RAG" optionnel)
     ↓  clic "Générer"
[Forge loading] → retrieveContext() si RAG actif → chunks affichés
                → generateStories() en streaming (contexte injecté ou non)
     ↓  génération terminée
[Results] → stories parsées en cards + badge RAG actif/non utilisé
     ↓  clic "Sauvegarder"          ↓  clic "Nouvelle génération"
[Historique] (localStorage)      [Forge] ← retour
```

### Pipeline RAG

1. **Indexation** (`upload-doc.js`) : extraction du texte (PDF via `unpdf`, DOCX via `mammoth`, TXT brut) → chunking (`RecursiveCharacterTextSplitter`, taille 500 caractères, overlap 50) → embedding OpenAI `text-embedding-3-small` (512 dims) → stockage Pinecone (index `storyforge`, métrique cosine).
2. **Retrieval** (`retrieve-context.js`) : le brief est embeddé, une requête `topK=5` est envoyée à Pinecone, seuls les chunks avec un score de pertinence **> 0.42** sont retenus.
3. **Génération** (`generate-stories.js`) : si des chunks ont été retenus, ils sont injectés dans le prompt système avec des instructions impératives de réutilisation du vocabulaire et des règles métier du client. Le toggle "Générer sans RAG" côté client saute simplement l'étape 2 — aucune modification du backend n'est nécessaire pour ce cas.

⚠️ L'index Pinecone est partagé entre tous les visiteurs de la démo (pas d'isolation multi-tenant) — ne pas y indexer de documents sensibles.

---

## Mode démo

Le déploiement public désactive l'upload, l'indexation et la suppression de documents (frontend + garde-fou serveur via `DEMO_MODE=true`, réponses 403 dans `upload-doc.js`/`delete-doc.js`) pour préserver l'expérience des autres visiteurs. La base de connaissance est pré-chargée avec 8 documents fictifs sur un contexte "Lumeo Boutique" (e-commerce déco/luminaires), et des briefs suggérés sont proposés en un clic. Le budget de génération est plafonné (~$5/mois, ~660 générations) ; au-delà, une erreur explicite s'affiche.

---

## Installation

```bash
git clone https://github.com/EdenSahile/StoryPilot-ai.git
cd StoryPilot-ai
npm install
```

### Variables d'environnement

```bash
cp .env.example .env
```

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Clé API Claude — génération des user stories |
| `OPENAI_API_KEY` | Clé API OpenAI — embeddings pour le RAG |
| `PINECONE_API_KEY` | Clé API Pinecone — base vectorielle |
| `PINECONE_INDEX_URL` | URL de l'index Pinecone (`storyforge`) |
| `ALLOWED_ORIGINS` | Origins autorisées en CORS (séparées par des virgules) |
| `DEMO_MODE` | `true` pour désactiver upload/suppression de documents (déploiement démo publique) |

Sans `OPENAI_API_KEY`/`PINECONE_API_KEY`/`PINECONE_INDEX_URL`, l'application fonctionne toujours (génération sans RAG), mais l'upload et la récupération de contexte renvoient une erreur de configuration serveur.

### Développement

```bash
# Avec Vercel CLI (recommandé — les serverless functions marchent)
npm i -g vercel
vercel dev

# Ou sans l'API (front uniquement — les appels /api renverront 404)
npm run dev
```

### Tests

```bash
npx vitest run
npx playwright test
```

### Déploiement

Push sur `main` → Vercel déploie automatiquement. Ajoute les variables d'environnement ci-dessus dans Vercel → Settings → Environment Variables (Production + Preview).

---

## Gestion des erreurs et limites

- Brief vide, trop court (< 10 caractères) ou trop long (> 2000 caractères), validé côté serveur
- Clé API manquante ou invalide (401)
- Rate limiting Claude (429) — 10 requêtes / 15 min, limiteur en mémoire (non persistant entre cold starts Vercel, cf. limitation connue ci-dessous)
- Timeout de 30s sur l'appel Claude
- `max_tokens` à 8000 côté serveur (mesuré via js-tiktoken sur un exemple réel plutôt qu'estimé, marge documentée dans `CLAUDE.md`)
- `topK` (retrieval RAG) validé côté serveur : entier entre 1 et 20, rejet 400 explicite sinon
- Extension de fichier non supportée à l'upload (hors PDF/DOCX/TXT) : rejet 400 explicite, pas d'exception
- Modèle indisponible (500)

Chaque erreur renvoyée au client est un message générique — jamais le détail brut de l'erreur serveur (voir `CLAUDE.md`, règle SEC-001).

### Limitation connue

Le rate limiting (`api/generate-stories.js`) utilise une `Map` en mémoire, qui ne persiste pas entre les cold starts des fonctions serverless Vercel — la fenêtre de 10 req/15 min est donc appliquée par instance, pas globalement. Suffisant comme dissuasion basique pour un projet à faible trafic ; une migration vers Vercel KV / Upstash Redis serait nécessaire pour une garantie stricte en production.

---

## Roadmap

### v2 — UI complète ✅
- [x] Dashboard avec stats et historique
- [x] Forge : brief + base de connaissance + streaming
- [x] Results : cards structurées + Gherkin multi-scénarios
- [x] Navigation sidebar desktop + bottom nav mobile
- [x] Design tokens centralisés (theme.js)
- [x] Prompt enrichi : description + critères + Gherkin

### v3 — RAG contextuel ✅
- [x] Upload documents client (PDF, DOCX, TXT)
- [x] Chunking + embeddings via OpenAI
- [x] Stockage vectoriel Pinecone
- [x] Retrieval sémantique sur le brief, avec seuil de pertinence calibré
- [x] Stories ancrées dans le vocabulaire et les contraintes du client
- [x] Historique des générations en local (Library) — persistance `localStorage`, pas de backend
- [x] Toggle manuel pour désactiver le RAG sur une génération donnée
- [x] Mode démo publique (upload désactivé, base de connaissance pré-chargée)
- [x] Thème sombre / clair avec bascule utilisateur (chip Réglages + icône header)
- [x] Export CSV compatible import Jira, par story ou en masse, avec neutralisation d'injection de formule
- [x] Historique avec la même mise en forme riche que Results (composant `StoryCard` partagé)

### v4 — Robustesse & intégrations
- [ ] Rate limiting persistant (Vercel KV / Upstash Redis)
- [ ] Export Trello réel (API Trello + OAuth par utilisateur — le bouton actuel indique clairement l'indisponibilité, pas de simulation trompeuse)
- [ ] Persistance des générations côté serveur (au-delà du `localStorage` par navigateur)
- [ ] Support multilingue (FR/EN)

---

## Méthode de développement

Ce projet est développé avec Claude Code, piloté et relu à chaque étape plutôt que laissé en génération libre. Mon rôle n'est pas d'écrire le code ligne à ligne, mais de cadrer le travail, vérifier chaque résultat contre le code réel, et corriger quand l'agent se trompe.

**Les règles avant le code.** `CLAUDE.md` fixe les règles non négociables du repo (validation serveur, pas de fuite de détail d'erreur au client, CORS restreint par allowlist, timeouts, plafond de tokens) et une discipline de branche stricte (jamais d'édition directe sur `main`). C'est la référence unique, aussi bien pour moi que pour l'agent.

**Une couverture de tests vérifiée, pas déclarée.** 273 tests unitaires/composants (Vitest + Testing Library, 18 fichiers) sur les 5 routes serverless, la logique métier et les 5 écrans, plus 4 parcours end-to-end (Playwright) sur le chemin critique, intégrés à la CI. Ces chiffres sont confirmés par exécution réelle (`npx vitest run`, `npx playwright test`) avant d'être inscrits dans `testing/inventaire-tests.md`, pas recopiés depuis le résumé de l'agent.

**Une revue à deux niveaux.** Chaque Pull Request est relue automatiquement par Claude (`claude-pr-review.yml`) selon les règles de `CLAUDE.md`, en plus de ma propre revue avant merge. Cette double revue a permis de détecter et corriger, en cours de développement, une politique CORS trop permissive, une fuite de détails d'erreur serveur sur plusieurs routes, et une vulnérabilité d'injection de formule CSV (OWASP CSV Injection) sur l'export Jira.

**Diagnostiquer, pas seulement accepter.** Le pipeline CI a connu trois pannes silencieuses distinctes (la revue automatique restait bloquée malgré des checks verts) : une protection anti-triche du workflow déclenchée sans le savoir, puis deux permissions manquantes sur les commandes `gh` utilisées par l'agent pour s'auto-vérifier. Chacune a été diagnostiquée en isolant les logs d'exécution réels, pas le résumé affiché par défaut, puis corrigée à la source dans le prompt de review plutôt que contournée.

**Reproduire l'environnement CI, pas le deviner.** Une PR de documentation a fait échouer `npm ci` en CI : le lock file avait été régénéré avec une version npm locale plus récente que celle de la CI, ce qui en a fait disparaître une dépendance imbriquée — invisible avec `npm install` (permissif), bloquant avec `npm ci` (strict, utilisé en CI). Diagnostiqué en comparant le lock file commit par commit plutôt qu'en supposant, corrigé en régénérant avec la version npm exacte de la CI, puis verrouillé durablement (`.nvmrc`, `engines`, `engine-strict=true`) pour que l'écart ne puisse plus passer inaperçu. Le correctif suivant a lui-même reproduit brièvement le même bug, pour la même raison — repéré immédiatement dans le log CI et corrigé en isolant explicitement la version npm attendue, pas en réessayant à l'aveugle.

**Vérifier plutôt que valider par défaut.** Les changements structurels proposés par l'agent (extraction de logique métier, suppression de code mort, déplacement de fichiers de test) sont relus avant merge : un chiffre de test périmé dans un résumé, une convention de test incohérente avec le reste du repo, un fichier légitimement disparu mais resté référencé dans la documentation ont été corrigés en cours de route plutôt qu'acceptés tels quels.

---

## Pourquoi ce projet

StoryPilot n'est pas un wrapper ChatGPT. C'est un outil de Product Owner conçu par une PO.

Le RAG est ce qui fait la différence : un client alimente l'outil avec ses docs métier, et les user stories générées utilisent **son vocabulaire, ses règles de gestion, ses contraintes techniques** — pas des généricités.

---

## Auteur

**Eden Sahilé** — PO technique & AI Product Builder

- 🔗 [LinkedIn](https://www.linkedin.com/in/eden-sahil%C3%A9-99b088112/)

---

© 2025-2026 Eden Sahilé
