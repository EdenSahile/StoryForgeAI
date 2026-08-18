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

function createMockReq({ method = 'GET', body = {}, headers = {} } = {}) {
  return {
    method,
    body,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

// Pas de Map de rate limiting au niveau module ici non plus (même constat que sur les
// 3 fichiers précédents) : pas d'état partagé entre requêtes à neutraliser. On réimporte
// quand même le module à chaque test pour repartir avec des mocks propres.
async function freshHandler() {
  vi.resetModules();
  const mod = await import('../../api/list-docs.js');
  return mod.default;
}

let mockListPaginated;
let mockFetch;
let mockIndex;

vi.mock('@pinecone-database/pinecone', () => {
  return {
    Pinecone: vi.fn().mockImplementation(function () {
      return {
        index: (...args) => mockIndex(...args),
      };
    }),
  };
});

beforeEach(() => {
  process.env.PINECONE_API_KEY = 'test-pinecone-key';
  process.env.PINECONE_INDEX_URL = 'https://fake-index.pinecone.io';

  mockListPaginated = vi.fn().mockResolvedValue({ vectors: [] });
  mockFetch = vi.fn().mockResolvedValue({ records: {} });
  mockIndex = vi.fn().mockReturnValue({
    listPaginated: (...args) => mockListPaginated(...args),
    fetch: (...args) => mockFetch(...args),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.PINECONE_API_KEY;
  delete process.env.PINECONE_INDEX_URL;
});

describe('api/list-docs — méthode et CORS', () => {
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

  // Même écart déjà signalé et validé sur les 3 fichiers précédents : "*" en dur
  // (ligne 7) au lieu de dériver l'origin de process.env.ALLOWED_ORIGINS.
  it("[ROUGE — écart CLAUDE.md] n'autorise pas toute origine sans restriction (Access-Control-Allow-Origin ne doit pas être '*')", async () => {
    const handler = await freshHandler();
    const req = createMockReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.headers['Access-Control-Allow-Origin']).not.toBe('*');
  });
});

describe('api/list-docs — configuration serveur manquante (règle CLAUDE.md : jamais de secret exposé)', () => {
  it('renvoie 500 générique si PINECONE_API_KEY est absente', async () => {
    delete process.env.PINECONE_API_KEY;
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Configuration serveur incomplète.' });
  });

  it('renvoie 500 générique si PINECONE_INDEX_URL est absente', async () => {
    delete process.env.PINECONE_INDEX_URL;
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Configuration serveur incomplète.' });
  });

  it('ne fuite aucune clé Pinecone dans la réponse quand la config est incomplète', async () => {
    delete process.env.PINECONE_API_KEY;
    process.env.PINECONE_INDEX_URL = 'https://fake-index.pinecone.io';
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(JSON.stringify(res.body)).not.toContain('test-pinecone-key');
  });
});

describe('api/list-docs — pagination', () => {
  it('parcourt toutes les pages via paginationToken avant de filtrer les IDs', async () => {
    mockListPaginated = vi
      .fn()
      .mockResolvedValueOnce({
        vectors: [{ id: 'docA_chunk_0' }, { id: 'docA_chunk_1' }],
        pagination: { next: 'token-page-2' },
      })
      .mockResolvedValueOnce({
        vectors: [{ id: 'docB_chunk_0' }],
        pagination: {},
      });
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        docA_chunk_0: { metadata: { filename: 'docA.txt', totalChunks: 2, uploadedAt: '2026-01-01' } },
        docB_chunk_0: { metadata: { filename: 'docB.txt', totalChunks: 1, uploadedAt: '2026-01-02' } },
      },
    });
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(mockListPaginated).toHaveBeenCalledTimes(2);
    expect(mockListPaginated).toHaveBeenNthCalledWith(2, expect.objectContaining({ paginationToken: 'token-page-2' }));
    // Seuls les IDs _chunk_0 doivent être passés à fetch (docA_chunk_1 exclu).
    expect(mockFetch).toHaveBeenCalledWith({ ids: ['docA_chunk_0', 'docB_chunk_0'] });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body.documents).toEqual([
      { filename: 'docA.txt', totalChunks: 2, uploadedAt: '2026-01-01' },
      { filename: 'docB.txt', totalChunks: 1, uploadedAt: '2026-01-02' },
    ]);
  });
});

describe('api/list-docs — filtrage métier', () => {
  it("renvoie une liste vide et n'appelle pas fetch si aucun ID _chunk_0 n'est trouvé", async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'docA_chunk_1' }, { id: 'docA_chunk_2' }],
      pagination: {},
    });
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ documents: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('exclut un record sans metadata.filename du résultat final', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'docA_chunk_0' }, { id: 'docB_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        docA_chunk_0: { metadata: { filename: 'docA.txt', totalChunks: 1, uploadedAt: '2026-01-01' } },
        // docB_chunk_0 volontairement absent des records (ou sans metadata.filename)
        docB_chunk_0: { metadata: {} },
      },
    });
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.body.documents).toEqual([
      { filename: 'docA.txt', totalChunks: 1, uploadedAt: '2026-01-01' },
    ]);
  });
});

describe('api/list-docs — valeurs par défaut si Pinecone omet les champs (bonus)', () => {
  it('ne casse pas si listPaginated renvoie une réponse sans vectors (fallback [])', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({});
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ documents: [] });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('ne casse pas si fetch renvoie une réponse sans records (fallback {})', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'docA_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({});
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ documents: [] });
  });
});

describe('api/list-docs — appels externes (règle CLAUDE.md : jamais de error.message brut au client)', () => {
  // Contrairement aux 3 fichiers précédents, ce catch renvoie déjà un message générique
  // fixe (ligne 57), pas error.message. Ces tests sont VERTS et confirment la conformité.
  it('renvoie un message générique conforme si listPaginated échoue (pas de fuite)', async () => {
    mockListPaginated = vi.fn().mockRejectedValue(
      new Error('Pinecone ECONNREFUSED index-host-interne.svc.cluster.local:443')
    );
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Erreur lors du listing des documents.' });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(res.body)).not.toContain('index-host-interne');
  });

  it('renvoie un message générique conforme si fetch échoue (pas de fuite)', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'docA_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockRejectedValue(
      new Error('Pinecone 403 — clé invalide sk-pine-XXXXXXXX ne doit jamais être exposée')
    );
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Erreur lors du listing des documents.' });
    expect(JSON.stringify(res.body)).not.toContain('sk-pine-XXXXXXXX');
    expect(JSON.stringify(res.body)).not.toContain('clé invalide');
  });
});

describe('api/list-docs — succès et non-fuite de secret', () => {
  it('renvoie 200 avec la liste des documents en cas de succès normal', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'docA_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        docA_chunk_0: { metadata: { filename: 'docA.txt', totalChunks: 3, uploadedAt: '2026-01-01' } },
      },
    });
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({
      documents: [{ filename: 'docA.txt', totalChunks: 3, uploadedAt: '2026-01-01' }],
    });
  });

  it('ne fuite aucune clé Pinecone dans la réponse de succès', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'docA_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: {
        docA_chunk_0: { metadata: { filename: 'docA.txt', totalChunks: 1, uploadedAt: '2026-01-01' } },
      },
    });
    const handler = await freshHandler();
    const req = createMockReq();
    const res = createMockRes();

    await handler(req, res);

    expect(JSON.stringify(res.body)).not.toContain('test-pinecone-key');
  });
});
