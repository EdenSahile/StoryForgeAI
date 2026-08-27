import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Fabrique un faux `res` Vercel : seulement les méthodes que le handler utilise réellement.
function createMockRes() {
  const res = {
    statusCode: undefined,
    headers: {},
    body: undefined,
    ended: false,
    written: [],
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
  res.write = vi.fn((chunk) => {
    res.written.push(chunk);
    return res;
  });
  return res;
}

function createMockReq({ method = 'POST', body = {}, headers = {} } = {}) {
  return {
    method,
    body,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

// Contrairement à generate-stories.js, ce handler n'a pas de Map de rate limiting
// au niveau module : pas d'état partagé entre requêtes à neutraliser ici. On réimporte
// quand même le module à chaque test pour repartir avec des mocks vi.mock() propres.
async function freshHandler() {
  vi.resetModules();
  const mod = await import('../../api/upload-doc.js');
  return mod.default;
}

const b64 = (str) => Buffer.from(str, 'utf-8').toString('base64');

// Texte "métier" suffisamment long (>= 50 caractères après extraction) pour passer
// la validation de longueur minimale.
const TEXTE_VALIDE = 'Ceci est un document métier suffisamment long pour être indexé correctement.';

// Produit exactement 2 chunks avec la config du splitter de api/upload-doc.js
// (chunkSize: 500, chunkOverlap: 50) — vérifié empiriquement, pas une estimation.
const TEXTE_2_CHUNKS = 'Ceci est une phrase de test suffisamment longue pour remplir les chunks de maniere previsible. '.repeat(6);

let mockEmbeddingsCreate;
let mockUpsert;
let mockListPaginated;
let mockFetch;
let mockDeleteMany;
let mockIndex;

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        embeddings: {
          create: (...args) => mockEmbeddingsCreate(...args),
        },
      };
    }),
  };
});

vi.mock('@pinecone-database/pinecone', () => {
  return {
    Pinecone: vi.fn().mockImplementation(function () {
      return {
        index: (...args) => mockIndex(...args),
      };
    }),
  };
});

vi.mock('unpdf', () => ({
  getDocumentProxy: vi.fn().mockResolvedValue({ fakePdfDoc: true }),
  extractText: vi.fn().mockResolvedValue({ text: TEXTE_VALIDE }),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({ value: TEXTE_VALIDE }),
  },
  extractRawText: vi.fn().mockResolvedValue({ value: TEXTE_VALIDE }),
}));

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.PINECONE_API_KEY = 'test-pinecone-key';
  process.env.PINECONE_INDEX_URL = 'https://fake-index.pinecone.io';
  delete process.env.DEMO_MODE;

  mockUpsert = vi.fn().mockResolvedValue({});
  mockListPaginated = vi.fn().mockResolvedValue({ vectors: [] });
  mockFetch = vi.fn().mockResolvedValue({ records: {} });
  mockDeleteMany = vi.fn().mockResolvedValue({});
  mockIndex = vi.fn().mockReturnValue({
    upsert: mockUpsert,
    listPaginated: (...args) => mockListPaginated(...args),
    fetch: (...args) => mockFetch(...args),
    deleteMany: (...args) => mockDeleteMany(...args),
  });
  mockEmbeddingsCreate = vi.fn().mockResolvedValue({
    data: [{ embedding: new Array(512).fill(0) }],
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.PINECONE_API_KEY;
  delete process.env.PINECONE_INDEX_URL;
  delete process.env.DEMO_MODE;
});

describe('api/upload-doc — méthode et CORS', () => {
  it("rejette tout ce qui n'est pas POST (405)", async () => {
    const handler = await freshHandler();
    const req = createMockReq({ method: 'GET' });
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

  // Écart signalé et validé avec l'utilisateur : ce handler renvoie "*" en dur
  // (ligne 56 de api/upload-doc.js) au lieu de dériver l'origin de
  // process.env.ALLOWED_ORIGINS comme le fait generate-stories.js et comme
  // l'exige CLAUDE.md. Ce test est ROUGE tant que le source n'est pas corrigé —
  // il matérialise l'écart plutôt que de le corriger silencieusement.
  it("[ROUGE — écart CLAUDE.md] n'autorise pas toute origine sans restriction (Access-Control-Allow-Origin ne doit pas être '*')", async () => {
    const handler = await freshHandler();
    const req = createMockReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.headers['Access-Control-Allow-Origin']).not.toBe('*');
  });
});

describe('api/upload-doc — mode démo', () => {
  it("bloque l'upload avec 403 si DEMO_MODE est 'true'", async () => {
    process.env.DEMO_MODE = 'true';
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toEqual({ error: 'Upload désactivé en mode démo.' });
  });
});

describe('api/upload-doc — configuration serveur manquante (règle CLAUDE.md : jamais de secret exposé)', () => {
  it('renvoie 500 générique si OPENAI_API_KEY est absente', async () => {
    delete process.env.OPENAI_API_KEY;
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({
      error: "Configuration serveur incomplète. Vérifiez les variables d'environnement.",
    });
  });

  it('renvoie 500 générique si PINECONE_API_KEY est absente', async () => {
    delete process.env.PINECONE_API_KEY;
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({
      error: "Configuration serveur incomplète. Vérifiez les variables d'environnement.",
    });
  });

  it('renvoie 500 générique si PINECONE_INDEX_URL est absente', async () => {
    delete process.env.PINECONE_INDEX_URL;
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({
      error: "Configuration serveur incomplète. Vérifiez les variables d'environnement.",
    });
  });

  it("ne fuite aucune des 3 clés serveur dans la réponse quand la config est incomplète", async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.PINECONE_API_KEY = 'super-secret-pinecone-key';
    process.env.PINECONE_INDEX_URL = 'https://fake-index.pinecone.io';
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain('super-secret-pinecone-key');
    expect(payload).not.toContain('test-openai-key');
  });
});

describe('api/upload-doc — validation des entrées (règle CLAUDE.md : validée côté serveur)', () => {
  it('rejette une requête sans filename (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: 'Fichier manquant. Envoyez { filename, content (base64) }.',
    });
  });

  it('rejette une requête sans content (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: 'Fichier manquant. Envoyez { filename, content (base64) }.',
    });
  });

  // Ancien écart résolu le 2026-08-18 : l'extension est maintenant validée explicitement
  // dans le handler, juste après filename/content, avant tout appel à extractText() — donc
  // 400 (erreur de validation classique), pas 500 via une exception. Voir CLAUDE.md
  // "Règles non négociables" et le commentaire au-dessus du throw dans extractText().
  it('rejette une extension non supportée avec 400 et le message dédié, sans passer par une exception', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.exe', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: 'Format non supporté : .exe. Utilisez PDF, DOCX ou TXT.',
    });
    // Si extractText() avait malgré tout été atteinte et avait levé (chemin exception),
    // la requête serait retombée dans le catch générique et aurait renvoyé 500, pas 400 —
    // le 400 ci-dessus prouve donc, en creux, qu'on ne passe plus par cette exception.
    // Vérification directe côté aval : ni l'embedding OpenAI ni l'upsert Pinecone n'ont
    // été atteints, donc rien après le nouveau check d'extension n'a été exécuté.
    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('rejette un texte extrait vide ou trop court (< 50 caractères) (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64('trop court') } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({
      error: 'Le document est vide ou trop court pour être indexé.',
    });
  });

  it('accepte un texte extrait de exactement 50 caractères (limite basse incluse)', async () => {
    const handler = await freshHandler();
    const texte50 = 'a'.repeat(50);
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(texte50) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.body?.error).not.toBe('Le document est vide ou trop court pour être indexé.');
  });
});

describe('api/upload-doc — formats acceptés (PDF, DOCX, TXT)', () => {
  it('traite un .txt en décodant le base64 directement', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
  });

  it('traite un .pdf via unpdf (mocké)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.pdf', content: b64('contenu binaire pdf simulé') } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
  });

  it('traite un .docx via mammoth (mocké)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.docx', content: b64('contenu binaire docx simulé') } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.success).toBe(true);
  });
});

describe('api/upload-doc — appels externes (règle CLAUDE.md : jamais de error.message brut au client)', () => {
  // Écart signalé et validé : le catch générique (ligne 158-162) renvoie error.message
  // au lieu d'un message générique. Test ROUGE tant que le source n'est pas corrigé.
  it("[ROUGE — écart CLAUDE.md] renvoie un message générique si l'embedding OpenAI échoue", async () => {
    mockEmbeddingsCreate = vi.fn().mockRejectedValue(
      new Error('OpenAI 401 — clé invalide sk-proj-XXXXXXXX ne doit jamais être exposée')
    );
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: "Erreur lors de l'indexation du document." });
    expect(JSON.stringify(res.body)).not.toContain('sk-proj-XXXXXXXX');
    expect(JSON.stringify(res.body)).not.toContain('clé invalide');
  });

  // Même écart, côté Pinecone cette fois.
  it("[ROUGE — écart CLAUDE.md] renvoie un message générique si l'upsert Pinecone échoue", async () => {
    mockUpsert = vi.fn().mockRejectedValue(
      new Error('Pinecone ECONNREFUSED index-host-interne.svc.cluster.local:443')
    );
    mockIndex = vi.fn().mockReturnValue({ upsert: mockUpsert });
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: "Erreur lors de l'indexation du document." });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(res.body)).not.toContain('index-host-interne');
  });

  it('renvoie 200 avec succès, filename, chunks et characters quand tout réussit', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      success: true,
      filename: 'doc.txt',
      chunks: expect.any(Number),
      characters: TEXTE_VALIDE.length,
    });
  });

  it('ne fuite aucune clé API dans la réponse de succès (règle CLAUDE.md)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain('test-openai-key');
    expect(payload).not.toContain('test-pinecone-key');
  });
});

describe('api/upload-doc — remplacement (bug chunks orphelins)', () => {
  it("upsert d'abord, puis supprime les chunks orphelins seulement après coup (deleteMany appelé après upsert, jamais avant — pas de fenêtre de perte de données)", async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc_txt_chunk_0' }, { id: 'doc_txt_chunk_1' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        doc_txt_chunk_0: { metadata: { filename: 'doc.txt' } },
        doc_txt_chunk_1: { metadata: { filename: 'doc.txt' } },
      },
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
      fetch: (...args) => mockFetch(...args),
      deleteMany: (...args) => mockDeleteMany(...args),
    });

    const handler = await freshHandler();
    // TEXTE_VALIDE ne produit qu'1 chunk (doc_txt_chunk_0) : doc_txt_chunk_1 est orphelin.
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(callOrder).toEqual(['upsert', 'deleteMany']);
    expect(mockDeleteMany).toHaveBeenCalledWith({ ids: ['doc_txt_chunk_1'] });
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

  it("n'appelle pas deleteMany si aucun ID orphelin n'est trouvé (le nouveau contenu couvre exactement les mêmes IDs que l'ancien)", async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc_txt_chunk_0' }, { id: 'doc_txt_chunk_1' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        doc_txt_chunk_0: { metadata: { filename: 'doc.txt' } },
        doc_txt_chunk_1: { metadata: { filename: 'doc.txt' } },
      },
    });
    const handler = await freshHandler();
    // TEXTE_2_CHUNKS produit exactement 2 chunks (doc_txt_chunk_0 et _1) : aucun orphelin,
    // l'upsert réécrit les deux IDs existants en place.
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_2_CHUNKS) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.body.chunks).toBe(2);
    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("remplace proprement : totalChunks de la réponse reflète le nouveau contenu, et seuls les IDs orphelins (au-delà du nouveau compte) sont supprimés", async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc_txt_chunk_0' }, { id: 'doc_txt_chunk_1' }, { id: 'doc_txt_chunk_2' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        doc_txt_chunk_0: { metadata: { filename: 'doc.txt' } },
        doc_txt_chunk_1: { metadata: { filename: 'doc.txt' } },
        doc_txt_chunk_2: { metadata: { filename: 'doc.txt' } },
      },
    });
    const handler = await freshHandler();
    // TEXTE_VALIDE ne produit qu'1 chunk (bien plus court que l'ancien contenu à 3 chunks) :
    // doc_txt_chunk_0 est réutilisé par l'upsert, seuls _1 et _2 sont orphelins.
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.body.chunks).toBe(1);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      ids: ['doc_txt_chunk_1', 'doc_txt_chunk_2'],
    });
  });

  it('parcourt toutes les pages via paginationToken pour établir la liste des chunks existants confirmés', async () => {
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
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        doc_txt_chunk_0: { metadata: { filename: 'doc.txt' } },
        doc_txt_chunk_1: { metadata: { filename: 'doc.txt' } },
      },
    });
    const handler = await freshHandler();
    // TEXTE_VALIDE ne produit qu'1 chunk (doc_txt_chunk_0) : doc_txt_chunk_1 est orphelin.
    const req = createMockReq({ body: { filename: 'doc.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockListPaginated).toHaveBeenCalledTimes(2);
    expect(mockListPaginated).toHaveBeenNthCalledWith(2, expect.objectContaining({ paginationToken: 'token-page-2' }));
    expect(mockDeleteMany).toHaveBeenCalledWith({ ids: ['doc_txt_chunk_1'] });
  });
});

describe('api/upload-doc — collision de préfixe assaini (deux filenames différents)', () => {
  it("ne supprime pas les chunks d'un autre fichier dont le nom assaini est identique (collision de préfixe)", async () => {
    // "doc!.txt" et "doc?.txt" s'assainissent tous les deux vers le préfixe "doc__txt_chunk_" :
    // sans vérification de metadata.filename, uploader "doc?.txt" supprimerait les chunks de
    // "doc!.txt" déjà indexé sous ce même préfixe.
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc__txt_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        doc__txt_chunk_0: { metadata: { filename: 'doc!.txt' } },
      },
    });
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc?.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("ne supprime rien quand le seul chunk existant confirmé pour ce filename est réutilisé en place par l'upsert (même ID, pas d'orphelin)", async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc__txt_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        doc__txt_chunk_0: { metadata: { filename: 'doc?.txt' } },
      },
    });
    const handler = await freshHandler();
    // TEXTE_VALIDE produit 1 chunk (doc__txt_chunk_0), identique au seul ID existant
    // confirmé : l'upsert le réécrit en place, aucun orphelin à supprimer.
    const req = createMockReq({ body: { filename: 'doc?.txt', content: b64(TEXTE_VALIDE) } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(res.body.success).toBe(true);
  });
});
