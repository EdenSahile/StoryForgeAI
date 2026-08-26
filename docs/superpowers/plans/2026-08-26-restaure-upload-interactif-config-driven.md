# Restaure upload interactif config-driven — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restaurer une vraie fonctionnalité d'upload de document dans Forge.jsx (drag & drop + file picker, remplacement, suppression), pilotée par un flag serveur `demoMode` récupéré via une nouvelle route `/api/config` plutôt que par un `disabled` en dur — et corriger un bug de chunks Pinecone orphelins lors du remplacement d'un fichier déjà indexé.

**Architecture:** Une route GET `api/config.js` expose `{ demoMode }` (dérivé de `process.env.DEMO_MODE`, jamais de secret). Le front (`ragService.js`) l'appelle une fois au montage de `Forge.jsx` et stocke le résultat en state ; ce state remplace tous les `disabled`/`$disabled` en dur sur `UploadZone`, `IndexBtn`, `DeleteDocBtn`. La logique d'upload (handlers, states, JSX) restaurée est celle qui existait avant la PR #52 (commit `2907447~1`), complétée par le câblage réel du drag & drop et de l'`<input type="file">` qui existait encore plus tôt (commit `24c70cd~1`, avant le verrouillage démo) — sans ce câblage, `UploadZone` resterait cliquable sans jamais ouvrir de sélecteur de fichier. Côté serveur, `api/upload-doc.js` supprime les chunks existants du même filename (même logique `listPaginated`/`deleteMany` que `api/delete-doc.js`) avant l'upsert, pour que toute réindexation soit un remplacement propre.

**Tech Stack:** React 18 (hooks), styled-components, Vitest + @testing-library/react, API serverless Vercel, Pinecone, OpenAI embeddings.

**Spec:** Instructions utilisateur données en conversation (pas de fichier séparé) — reproduites dans les tâches ci-dessous. Référence historique : `git show 2907447` (dead code list) et `git show 24c70cd~1:src/screens/Forge.jsx` (câblage complet UploadZone/input file, avant verrouillage démo en `24c70cd`).

## Global Constraints

- Ne jamais exposer de secret côté client (`api/config.js` ne renvoie que `{ demoMode: boolean }`).
- CORS : même pattern que les autres routes — `process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'https://storypilot-ai.vercel.app']`, header posé seulement si `origin` est dans la liste.
- Toute couleur passe par un token `theme.colors.*` — jamais de `#hex`/`rgba()` en dur (règle CLAUDE.md, ~85 valeurs déjà corrigées le 2026-08-23).
- Logique métier réutilisable testée dans `src/test/`, jamais colocalisée.
- Pas de `console.error` actif en production côté client — conditionner à `import.meta.env.DEV`.
- `demoMode` démarre à `true` (fail-closed) tant que `getConfig()` n'a pas résolu, pour ne jamais flasher une UI d'upload active à un visiteur de la démo publique pendant le chargement.
- Ne pas merger — la tâche s'arrête à l'ouverture de la PR.

---

## File Structure

- Create: `api/config.js` — route GET, renvoie `{ demoMode }`.
- Create: `src/test/api-config.test.js` — tests de la route.
- Modify: `src/components/services/ragService.js` — ajoute `getConfig()`.
- Modify: `api/upload-doc.js` — supprime les chunks existants avant l'upsert (étape 4).
- Modify: `src/test/api-upload-doc.test.js` — mocks `listPaginated`/`deleteMany` + nouveaux tests.
- Modify: `src/screens/Forge.jsx` — restaure imports/states/handlers/JSX d'upload, câble `demoMode`.
- Modify: `src/test/Forge.test.jsx` — mock `getConfig`, tests zone d'upload activée/désactivée.

---

### Task 1: Route `api/config.js`

**Files:**
- Create: `api/config.js`
- Test: `src/test/api-config.test.js`

**Interfaces:**
- Produces: `GET /api/config` → `200 { demoMode: boolean }` (utilisé par `ragService.getConfig()` en Task 2).

- [ ] **Step 1: Write the failing test**

```js
// src/test/api-config.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function createMockRes() {
  const res = {
    statusCode: undefined,
    headers: {},
    body: undefined,
    ended: false,
  };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((payload) => {
    res.body = payload;
    return res;
  });
  res.setHeader = vi.fn((key, value) => {
    res.headers[key] = value;
    return res;
  });
  res.end = vi.fn(() => {
    res.ended = true;
    return res;
  });
  return res;
}

function createMockReq({ method = 'GET', headers = {} } = {}) {
  return { method, headers };
}

async function freshHandler() {
  vi.resetModules();
  const mod = await import('../../api/config.js');
  return mod.default;
}

beforeEach(() => {
  delete process.env.DEMO_MODE;
});

afterEach(() => {
  delete process.env.DEMO_MODE;
});

describe('api/config — méthode et CORS', () => {
  it("rejette tout ce qui n'est pas GET (405)", async () => {
    const handler = await freshHandler();
    const req = createMockReq({ method: 'POST' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.body).toEqual({ error: 'Méthode non autorisée' });
  });

  it('répond 200 et coupe court sur une requête OPTIONS (préflight CORS)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ method: 'OPTIONS' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.ended).toBe(true);
  });

  it('pose Access-Control-Allow-Origin uniquement pour une origin autorisée', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ headers: { origin: 'http://localhost:5173' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
  });

  it("ne pose pas d'header pour une origin non autorisée", async () => {
    const handler = await freshHandler();
    const req = createMockReq({ headers: { origin: 'https://evil.example.com' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('api/config — demoMode', () => {
  it('renvoie demoMode: true si DEMO_MODE="true"', async () => {
    process.env.DEMO_MODE = 'true';
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ demoMode: true });
  });

  it('renvoie demoMode: false si DEMO_MODE="false"', async () => {
    process.env.DEMO_MODE = 'false';
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.body).toEqual({ demoMode: false });
  });

  it('renvoie demoMode: false par défaut quand DEMO_MODE est absente', async () => {
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.body).toEqual({ demoMode: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/api-config.test.js`
Expected: FAIL — `Cannot find module '../../api/config.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// api/config.js
// Expose des flags de configuration non sensibles au client (ex: mode démo).
// Pas de données sensibles, pas d'authentification nécessaire.

export default function handler(req, res) {
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173', 'https://storypilot-ai.vercel.app'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Méthode non autorisée" });

  return res.status(200).json({ demoMode: process.env.DEMO_MODE === "true" });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/api-config.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add api/config.js src/test/api-config.test.js
git commit -m "feat(api): ajoute la route /api/config (expose demoMode)"
```

---

### Task 2: `ragService.getConfig()`

**Files:**
- Modify: `src/components/services/ragService.js` — ajoute la fonction en fin de fichier.
- Modify: `src/test/ragService.test.js` — ajoute un describe `getConfig`.

**Interfaces:**
- Consumes: `GET /api/config` (Task 1).
- Produces: `getConfig(): Promise<{ demoMode: boolean }>`, importé par `Forge.jsx` en Task 4.

- [ ] **Step 1: Write the failing test**

Ajouter à la fin de `src/test/ragService.test.js` :

```js
describe('getConfig', () => {
  it('appelle GET sur /api/config sans body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ demoMode: false }),
    });

    await getConfig();

    expect(fetch).toHaveBeenCalledWith('/api/config');
  });

  it('résout avec { demoMode } en cas de succès', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ demoMode: true }),
    });

    const result = await getConfig();

    expect(result).toEqual({ demoMode: true });
  });

  it('rejette avec le message de l\'API quand la réponse est non-ok et contient un JSON avec error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Config indisponible' }),
    });

    await expect(getConfig()).rejects.toThrow('Config indisponible');
  });

  it('rejette avec le fallback quand la réponse non-ok n\'a pas de JSON valide', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });

    await expect(getConfig()).rejects.toThrow('Erreur lors de la récupération de la configuration.');
  });
});
```

And update the top-of-file import:

```js
import {
  uploadDocument,
  retrieveContext,
  listDocuments,
  deleteDocument,
  getConfig,
} from '../components/services/ragService';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/ragService.test.js`
Expected: FAIL — `getConfig is not a function` / import error

- [ ] **Step 3: Write minimal implementation**

Append to `src/components/services/ragService.js`:

```js
/**
 * Récupère la configuration serveur exposée au client (ex: mode démo)
 * @returns {Promise<{demoMode: boolean}>}
 */
export async function getConfig() {
  const response = await fetch("/api/config");

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Erreur lors de la récupération de la configuration.");
  }

  return response.json();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/ragService.test.js`
Expected: PASS (all tests, including the 4 new `getConfig` ones)

- [ ] **Step 5: Commit**

```bash
git add src/components/services/ragService.js src/test/ragService.test.js
git commit -m "feat(rag): ajoute getConfig() au client RAG"
```

---

### Task 3: Corrige les chunks orphelins dans `api/upload-doc.js`

**Files:**
- Modify: `api/upload-doc.js:138-144` (juste avant l'étape 4 "Upsert into Pinecone")
- Modify: `src/test/api-upload-doc.test.js` — le mock `mockIndex` doit exposer `listPaginated`/`deleteMany` (sinon les tests existants cassent dès que le handler les appelle), + nouveaux tests.

**Interfaces:**
- Consumes: `index.listPaginated({ prefix, limit, paginationToken })` / `index.deleteMany({ ids })` — même signature que dans `api/delete-doc.js:48-66`.

- [ ] **Step 1: Update the existing mock so current tests keep passing, then write the failing tests**

In `src/test/api-upload-doc.test.js`, replace the `beforeEach` mock setup:

```js
beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.PINECONE_API_KEY = 'test-pinecone-key';
  process.env.PINECONE_INDEX_URL = 'https://fake-index.pinecone.io';
  delete process.env.DEMO_MODE;

  mockUpsert = vi.fn().mockResolvedValue({});
  mockListPaginated = vi.fn().mockResolvedValue({ vectors: [] });
  mockDeleteMany = vi.fn().mockResolvedValue({});
  mockIndex = vi.fn().mockReturnValue({
    upsert: mockUpsert,
    listPaginated: (...args) => mockListPaginated(...args),
    deleteMany: (...args) => mockDeleteMany(...args),
  });
  mockEmbeddingsCreate = vi.fn().mockResolvedValue({
    data: [{ embedding: new Array(512).fill(0) }],
  });
});
```

Add the matching `let` declaration near the existing ones:

```js
let mockEmbeddingsCreate;
let mockUpsert;
let mockListPaginated;
let mockDeleteMany;
let mockIndex;
```

Then add a new describe block at the end of the file:

```js
describe('api/upload-doc — remplacement (bug chunks orphelins)', () => {
  it('supprime les chunks existants du même filename avant l\'upsert (deleteMany appelé avant upsert)', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc_txt_chunk_0' }, { id: 'doc_txt_chunk_1' }],
      pagination: {},
    });
    const callOrder = [];
    mockDeleteMany = vi.fn().mockImplementation(async () => {
      callOrder.push('deleteMany');
      return {};
    });
    mockUpsert = vi.fn().mockImplementation(async () => {
      callOrder.push('upsert');
      return {};
    });
    mockIndex = vi.fn().mockReturnValue({
      upsert: mockUpsert,
      listPaginated: (...args) => mockListPaginated(...args),
      deleteMany: (...args) => mockDeleteMany(...args),
    });

    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockDeleteMany).toHaveBeenCalledWith({ ids: ['doc_txt_chunk_0', 'doc_txt_chunk_1'] });
    expect(callOrder).toEqual(['deleteMany', 'upsert']);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('utilise le même préfixe que api/delete-doc.js pour lister les chunks existants', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({ vectors: [], pagination: {} });
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc rare!.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockListPaginated).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'doc_rare__txt_chunk_' }),
    );
  });

  it("n'appelle pas deleteMany si aucun chunk existant n'est trouvé pour ce filename (premier upload)", async () => {
    mockListPaginated = vi.fn().mockResolvedValue({ vectors: [], pagination: {} });
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'nouveau.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('remplace proprement : totalChunks de la réponse reflète le nouveau contenu, pas l\'ancien', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc_txt_chunk_0' }, { id: 'doc_txt_chunk_1' }, { id: 'doc_txt_chunk_2' }],
      pagination: {},
    });
    const handler = await freshHandler();
    // TEXTE_VALIDE ne produit qu'1 chunk (bien plus court que l'ancien contenu à 3 chunks).
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.body.chunks).toBe(1);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      ids: ['doc_txt_chunk_0', 'doc_txt_chunk_1', 'doc_txt_chunk_2'],
    });
  });

  it('parcourt toutes les pages via paginationToken avant de supprimer (même logique que api/delete-doc.js)', async () => {
    mockListPaginated = vi
      .fn()
      .mockResolvedValueOnce({
        vectors: [{ id: 'doc_txt_chunk_0' }],
        pagination: { next: 'token-page-2' },
      })
      .mockResolvedValueOnce({
        vectors: [{ id: 'doc_txt_chunk_1' }],
        pagination: {},
      });
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockListPaginated).toHaveBeenCalledTimes(2);
    expect(mockListPaginated).toHaveBeenNthCalledWith(2, expect.objectContaining({ paginationToken: 'token-page-2' }));
    expect(mockDeleteMany).toHaveBeenCalledWith({ ids: ['doc_txt_chunk_0', 'doc_txt_chunk_1'] });
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/test/api-upload-doc.test.js`
Expected: the 5 new tests FAIL (`mockDeleteMany` never called — no delete-before-upsert logic yet); all pre-existing tests still PASS (the mock update in Step 1 is backward-compatible).

- [ ] **Step 3: Write minimal implementation**

In `api/upload-doc.js`, insert between step 3 (embedding, ends at line ~136 `const embeddings = ...`) and step 4 (`// 4. Upsert into Pinecone`):

```js
    // 4. Delete existing chunks for this filename (bug chunks orphelins : un
    // remplacement qui génère moins de chunks que l'ancien laissait les chunks
    // en trop de l'ancienne version dans Pinecone). Même logique de listing par
    // préfixe que api/delete-doc.js — réutilisée ici, pas dupliquée en apparence
    // seulement : le préfixe et la boucle de pagination sont identiques.
    console.log(`[upload] Checking for existing chunks of ${filename}...`);
    const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
    const indexHost = PINECONE_INDEX_URL.replace("https://", "");
    const index = pc.index("storyforge", indexHost);

    const prefix = `${filename.replace(/[^a-zA-Z0-9]/g, "_")}_chunk_`;
    const existingIds = [];
    let paginationToken;
    while (true) {
      const params = { prefix, limit: 100 };
      if (paginationToken) params.paginationToken = paginationToken;
      const result = await index.listPaginated(params);
      existingIds.push(...(result.vectors || []).map((v) => v.id));
      paginationToken = result.pagination?.next;
      if (!paginationToken) break;
    }

    if (existingIds.length > 0) {
      console.log(`[upload] Removing ${existingIds.length} existing chunk(s) for ${filename}`);
      await index.deleteMany({ ids: existingIds });
    }

    // 5. Upsert into Pinecone
    console.log(`[upload] Upserting into Pinecone...`);
```

Remove the now-duplicate `Pinecone`/`indexHost`/`index` declarations a few lines below (originally step 4, now step 5) — keep only the ones just added above:

```js
    const vectors = chunks.map((chunk, i) => ({
```

i.e. delete these three lines that immediately followed the old `// 4. Upsert into Pinecone` comment:

```js
    const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
    const indexHost = PINECONE_INDEX_URL.replace("https://", "");
    const index = pc.index("storyforge", indexHost);
```

(They're now declared once, earlier, and reused for both the delete and the upsert.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/api-upload-doc.test.js`
Expected: PASS — all pre-existing tests plus the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add api/upload-doc.js src/test/api-upload-doc.test.js
git commit -m "fix(api): supprime les chunks orphelins avant réindexation d'un fichier existant"
```

---

### Task 4: Restaure la logique d'upload dans `Forge.jsx` (imports, states, handlers)

**Files:**
- Modify: `src/screens/Forge.jsx:1-6` (imports)
- Modify: `src/screens/Forge.jsx:1051-1106` (states + effects, avant `handleSubmit`)
- Modify: `src/screens/Forge.jsx:1104-1106` (juste après `handleKeyDown`, avant le `return`)

**Interfaces:**
- Consumes: `getConfig()` (Task 2), `uploadDocument`/`deleteDocument` (existing in `ragService.js`).
- Produces: `demoMode` state, `dragOver`/`uploadingFile`/`uploadProgress`/`pendingReplaceFile` states, `fileInputRef`, `handleFileUpload`/`uploadSingleFile`/`handleConfirmReplace`/`handleCancelReplace`/`handleDeleteDoc`/`handleDrop` — all consumed by the JSX wiring in Task 5.

- [ ] **Step 1: Update imports**

Replace lines 2-6:

```js
import { useState, useRef, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import { theme } from "../theme";
import { generateStories } from "../components/services/claudeService";
import {
  uploadDocument,
  deleteDocument,
  retrieveContext,
  getConfig,
} from "../components/services/ragService";
```

- [ ] **Step 2: Add states, refs and the config-loading effect**

Right after `const [uploadError, setUploadError] = useState(null);` (line 1055), add:

```js
  const [dragOver, setDragOver] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingReplaceFile, setPendingReplaceFile] = useState(null);
  // Fail-closed : reste verrouillé tant que /api/config n'a pas répondu, pour ne
  // jamais laisser l'UI d'upload s'afficher active à un visiteur de la démo
  // publique pendant le chargement.
  const [demoMode, setDemoMode] = useState(true);
  const fileInputRef = useRef(null);
  const documentsRef = useRef(documents);
  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  useEffect(() => {
    getConfig()
      .then(({ demoMode }) => setDemoMode(demoMode))
      .catch((err) => {
        console.warn("[config] Échec du chargement de la configuration, upload resté verrouillé :", err);
      });
  }, []);
```

- [ ] **Step 3: Add the upload handlers**

Right after `handleKeyDown` (ends around line 1106, before `return (`), add:

```js
  const handleFileUpload = async (files) => {
    for (const file of files) {
      const alreadyIndexed = documentsRef.current.some(
        (d) => d.name === file.name && d.status === "indexed",
      );
      if (alreadyIndexed) {
        setPendingReplaceFile(file);
        return;
      }
      await uploadSingleFile(file);
    }
  };

  const uploadSingleFile = async (file) => {
    try {
      setUploadError(null);
      const newDoc = {
        id: Date.now(),
        name: file.name,
        size: file.size,
        status: "loading",
        pct: 0,
        chunks: 0,
      };
      setDocuments((prev) => [...prev, newDoc]);
      setUploadingFile(file.name);

      const result = await uploadDocument(file, (pct) => {
        setUploadProgress(pct);
        setDocuments((prev) =>
          prev.map((d) => (d.name === file.name ? { ...d, pct } : d)),
        );
      });

      setDocuments((prev) =>
        prev.map((d) =>
          d.name === file.name
            ? { ...d, status: "indexed", chunks: result.chunks, pct: 100 }
            : d,
        ),
      );
      setUploadingFile(null);
    } catch (err) {
      if (import.meta.env.DEV) console.error("uploadDocument failed:", err);
      setDocuments((prev) =>
        prev.map((d) => (d.name === file.name ? { ...d, status: "error" } : d)),
      );
      setUploadError(err.message);
      setUploadingFile(null);
    }
  };

  const handleConfirmReplace = async () => {
    const file = pendingReplaceFile;
    setPendingReplaceFile(null);
    setDocuments((prev) => prev.filter((d) => d.name !== file.name));
    await uploadSingleFile(file);
  };

  const handleCancelReplace = () => setPendingReplaceFile(null);

  const handleDeleteDoc = async (doc) => {
    if (!confirm(`Supprimer "${doc.name}" et ses ${doc.chunks || 0} chunks ?`))
      return;
    try {
      await deleteDocument(doc.name);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setUploadError(err.message);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleFileUpload(files);
  };
```

- [ ] **Step 4: Sanity-check the file still parses (no test exists yet for this task alone — Task 5 wires the JSX that exercises these handlers)**

Run: `npx vitest run src/test/Forge.test.jsx`
Expected: PASS — existing tests are unaffected (new states/handlers aren't referenced by JSX yet, so nothing observable changed). This confirms no syntax error before wiring the JSX in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/screens/Forge.jsx
git commit -m "feat(forge): restaure les handlers d'upload (imports, states, logique)"
```

---

### Task 5: Câble la JSX (UploadZone, DeleteDocBtn, IndexBtn, ConfirmBanner) sur `demoMode`

**Files:**
- Modify: `src/screens/Forge.jsx:900` (nouveau styled-component `ConfirmBanner`, juste avant `ErrorMsg`)
- Modify: `src/screens/Forge.jsx:1367-1375` (bloc `DeleteDocBtn`)
- Modify: `src/screens/Forge.jsx:1380-1396` (bloc `uploadError` + `UploadZone`, insertion du `ConfirmBanner` avant)
- Modify: `src/screens/Forge.jsx:1398-1404` (bloc `IndexBtn`)

**Interfaces:**
- Consumes: `demoMode`, `dragOver`, `pendingReplaceFile`, `fileInputRef`, `handleDrop`, `handleFileUpload`, `handleDeleteDoc`, `handleConfirmReplace`, `handleCancelReplace` (all from Task 4).

- [ ] **Step 1: Add the `ConfirmBanner` styled-component**

Just above `// ─── Error / Copy ─────────────────────────────────────────` / `const ErrorMsg = styled.div` (line 960), insert:

```js
const ConfirmBanner = styled.div`
  background: ${theme.colors.bgWarning};
  border: 1px solid color-mix(in srgb, ${theme.colors.amber} 30%, transparent);
  border-radius: ${theme.radii.lg};
  padding: ${theme.spacing.sm} ${theme.spacing.md};
  font-size: ${theme.fontSizes.sm};
  color: ${theme.colors.onSurface};

  .message {
    margin-bottom: ${theme.spacing.sm};
  }

  .filename {
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: ${theme.spacing.sm};
  }

  button {
    padding: 4px 12px;
    border-radius: ${theme.radii.md};
    font-size: ${theme.fontSizes.xs};
    font-weight: 600;
    cursor: pointer;
    border: none;
  }

  .btn-replace {
    background: ${theme.colors.primary};
    color: ${theme.colors.onPrimary};
  }

  .btn-cancel {
    background: ${theme.colors.surfaceContainerHighest};
    color: ${theme.colors.onSurfaceVariant};
  }
`;

```

- [ ] **Step 2: Wire `DeleteDocBtn` on `demoMode`**

Replace the hardcoded block (inside the `documents.map`, `doc.status !== "loading"` branch):

```jsx
                  {doc.status !== "loading" && (
                    <DeleteDocBtn
                      disabled
                      title="Suppression désactivée en mode démo — pour préserver l'expérience des autres visiteurs."
                      style={{ opacity: 0.35, cursor: "not-allowed" }}
                    >
                      delete
                    </DeleteDocBtn>
                  )}
```

with:

```jsx
                  {doc.status !== "loading" && (
                    <DeleteDocBtn
                      disabled={demoMode}
                      title={
                        demoMode
                          ? "Suppression désactivée en mode démo — pour préserver l'expérience des autres visiteurs."
                          : `Supprimer ${doc.name}`
                      }
                      onClick={demoMode ? undefined : () => handleDeleteDoc(doc)}
                      style={demoMode ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
                    >
                      delete
                    </DeleteDocBtn>
                  )}
```

- [ ] **Step 3: Insert the `ConfirmBanner` JSX and wire `UploadZone`**

Replace this block (right after `</DocList>`):

```jsx
            {uploadError && (
              <ErrorMsg>
                <span>{uploadError}</span>
                <button onClick={() => setUploadError(null)}>✕</button>
              </ErrorMsg>
            )}

            <UploadZone $disabled>
              <span className="upload-icon">cloud_upload</span>
              <p className="upload-title">
                Upload désactivé en mode démo publique
              </p>
              <p className="upload-sub">
                La base de connaissance (8 documents fictifs sur Lumeo Boutique)
                est pré-configurée pour cette démo.
              </p>
            </UploadZone>
```

with:

```jsx
            {pendingReplaceFile && (
              <ConfirmBanner>
                <p className="message">
                  <span className="filename">{pendingReplaceFile.name}</span>{" "}
                  est déjà indexé. Remplacer ?
                </p>
                <div className="actions">
                  <button
                    className="btn-replace"
                    onClick={handleConfirmReplace}
                  >
                    Remplacer
                  </button>
                  <button className="btn-cancel" onClick={handleCancelReplace}>
                    Annuler
                  </button>
                </div>
              </ConfirmBanner>
            )}

            {uploadError && (
              <ErrorMsg>
                <span>{uploadError}</span>
                <button onClick={() => setUploadError(null)}>✕</button>
              </ErrorMsg>
            )}

            {demoMode ? (
              <UploadZone $disabled>
                <span className="upload-icon">cloud_upload</span>
                <p className="upload-title">
                  Upload désactivé en mode démo publique
                </p>
                <p className="upload-sub">
                  La base de connaissance (8 documents fictifs sur Lumeo Boutique)
                  est pré-configurée pour cette démo.
                </p>
              </UploadZone>
            ) : (
              <UploadZone
                $dragOver={dragOver}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  multiple
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    handleFileUpload(files);
                  }}
                />
                <span className="upload-icon">cloud_upload</span>
                <p className="upload-title">Glissez vos docs ici</p>
                <p className="upload-sub">ou cliquez pour parcourir — Max 10 Mo</p>
                <div className="format-badges">
                  <span className="format-badge">PDF</span>
                  <span className="format-badge">DOCX</span>
                  <span className="format-badge">TXT</span>
                </div>
              </UploadZone>
            )}
```

- [ ] **Step 4: Wire `IndexBtn`**

Replace:

```jsx
            <IndexBtn
              disabled
              title="Indexation désactivée en mode démo — pour préserver l'expérience des autres visiteurs."
              style={{ opacity: 0.35, cursor: "not-allowed" }}
            >
              Indexer les documents
            </IndexBtn>
```

with:

```jsx
            <IndexBtn
              disabled={demoMode}
              title={
                demoMode
                  ? "Indexation désactivée en mode démo — pour préserver l'expérience des autres visiteurs."
                  : undefined
              }
              style={demoMode ? { opacity: 0.35, cursor: "not-allowed" } : undefined}
            >
              Indexer les documents
            </IndexBtn>
```

(Ce bouton n'a jamais eu de handler dans l'historique du projet — l'indexation se fait automatiquement dans `uploadSingleFile` via `uploadDocument`. On restaure fidèlement son état non-disabled hors démo, sans lui inventer un comportement qu'il n'a jamais eu.)

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: All existing tests still PASS (Forge.test.jsx's default mock resolves `getConfig` to nothing yet — Task 6 adds that mock; until then, `getConfig()` will reject in jsdom's fetch-less environment and hit the `.catch`, which is harmless and leaves `demoMode` at its default `true` — matching the current hardcoded-disabled behavior, so no existing assertion breaks).

- [ ] **Step 6: Commit**

```bash
git add src/screens/Forge.jsx
git commit -m "feat(forge): cable UploadZone/DeleteDocBtn/IndexBtn sur demoMode (config serveur)"
```

---

### Task 6: Tests `Forge.test.jsx` — zone d'upload activée/désactivée selon `getConfig()`

**Files:**
- Modify: `src/test/Forge.test.jsx`

**Interfaces:**
- Consumes: `getConfig` mock (mirrors the existing `retrieveContext`/`uploadDocument`/`deleteDocument` mocks already declared at the top of this file).

- [ ] **Step 1: Write the failing tests**

Update the top-of-file mock:

```js
vi.mock('../components/services/ragService', () => ({
  retrieveContext: vi.fn().mockResolvedValue({ chunks: [] }),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
  getConfig: vi.fn().mockResolvedValue({ demoMode: false }),
}));
```

Update the import line to include `getConfig`:

```js
import { retrieveContext, getConfig } from '../components/services/ragService';
```

Update the top-level `beforeEach` to reset the new mock's default too:

```js
beforeEach(() => {
  vi.clearAllMocks();
  retrieveContext.mockResolvedValue({ chunks: [] });
  generateStories.mockResolvedValue(undefined);
  getConfig.mockResolvedValue({ demoMode: false });
});
```

Add a new describe block at the end of the file:

```js
describe('Forge — zone d\'upload pilotée par getConfig (demoMode)', () => {
  it('active la zone d\'upload et les actions (delete, index) quand demoMode=false', async () => {
    getConfig.mockResolvedValue({ demoMode: false });
    renderForge({
      documents: [{ id: 1, name: 'doc.pdf', status: 'indexed', chunks: 3 }],
    });

    await waitFor(() => {
      expect(screen.getByText('Glissez vos docs ici')).toBeInTheDocument();
    });
    expect(screen.queryByText('Upload désactivé en mode démo publique')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indexer les documents' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'delete' })).not.toBeDisabled();
  });

  it('désactive la zone d\'upload et les actions quand demoMode=true', async () => {
    getConfig.mockResolvedValue({ demoMode: true });
    renderForge({
      documents: [{ id: 1, name: 'doc.pdf', status: 'indexed', chunks: 3 }],
    });

    await waitFor(() => {
      expect(screen.getByText('Upload désactivé en mode démo publique')).toBeInTheDocument();
    });
    expect(screen.queryByText('Glissez vos docs ici')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Indexer les documents' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'delete' })).toBeDisabled();
  });

  it('reste verrouillée (fail-closed) tant que getConfig() n\'a pas résolu', () => {
    getConfig.mockImplementation(() => new Promise(() => {}));
    renderForge();

    expect(screen.getByText('Upload désactivé en mode démo publique')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/Forge.test.jsx`
Expected: FAIL on the first two new tests (`demoMode=false` never applied, since `Forge.jsx` hasn't been touched by this task — wait, Task 5 already wired the JSX, so this should actually PASS once the mock is in place. If it still shows the demo-locked UI regardless of the mocked value, that means the `getConfig` mock isn't being picked up — check the mock is declared before the component import, per Vitest hoisting rules already followed by the existing `vi.mock` calls in this file).

- [ ] **Step 3: Fix if needed, then run again**

Run: `npx vitest run src/test/Forge.test.jsx`
Expected: PASS — all tests in the file, old and new.

- [ ] **Step 4: Run the full suite one more time**

Run: `npx vitest run`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/test/Forge.test.jsx
git commit -m "test(forge): couvre la zone d'upload pilotée par getConfig (demoMode)"
```

---

### Task 7: Vérification manuelle (`vercel dev`) + ouverture de la PR

**Files:** none (manual verification + PR).

- [ ] **Step 1: Run the full automated suite one last time**

Run: `npm run build && npx vitest run`
Expected: build succeeds, all tests PASS.

- [ ] **Step 2: Manual check with `vercel dev` — demoMode: false (no `DEMO_MODE` in `.env`)**

- Start `vercel dev`.
- Open Forge, confirm the upload zone is interactive (not the "Upload désactivé" message).
- Upload a text file long enough to produce multiple chunks (e.g. several paragraphs, >2500 characters given `chunkSize: 500`).
- Confirm it appears as "indexed" with the expected chunk count, and cross-check via `/api/list-docs`.
- Re-upload the same filename with a shorter content (fewer chunks) — confirm the `ConfirmBanner` prompts to replace, confirm it, and check the new `totalChunks` in `/api/list-docs` matches the new (smaller) count — not the old one.
- Query `/api/retrieve-context` with a brief that would only match content from the deleted version — confirm it's no longer retrieved.

- [ ] **Step 3: Manual check with `DEMO_MODE=true`**

- Set `DEMO_MODE=true` in the local env, restart `vercel dev`.
- Confirm Forge falls back to the read-only demo UI: "Upload désactivé en mode démo publique" message, `IndexBtn` and `DeleteDocBtn` disabled with their explanatory tooltips.

- [ ] **Step 4: Open the PR**

Use the `open-pr` skill (quality gate: build + tests, push branch, open PR to `main`, do not merge) once Steps 1-3 are green.
