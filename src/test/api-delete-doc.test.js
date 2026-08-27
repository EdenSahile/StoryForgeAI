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

// Pas de Map de rate limiting au niveau module ici non plus (même constat que pour
// upload-doc.js) : pas d'état partagé entre requêtes à neutraliser. On réimporte quand
// même le module à chaque test pour repartir avec des mocks vi.mock() propres.
async function freshHandler() {
  vi.resetModules();
  const mod = await import('../../api/delete-doc.js');
  return mod.default;
}

let mockListPaginated;
let mockFetch;
let mockDeleteMany;
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
  delete process.env.DEMO_MODE;

  mockListPaginated = vi.fn().mockResolvedValue({ vectors: [] });
  mockFetch = vi.fn().mockResolvedValue({ records: {} });
  mockDeleteMany = vi.fn().mockResolvedValue({});
  mockIndex = vi.fn().mockReturnValue({
    listPaginated: (...args) => mockListPaginated(...args),
    fetch: (...args) => mockFetch(...args),
    deleteMany: (...args) => mockDeleteMany(...args),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.PINECONE_API_KEY;
  delete process.env.PINECONE_INDEX_URL;
  delete process.env.DEMO_MODE;
});

describe('api/delete-doc — méthode et CORS', () => {
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

  // Même écart déjà signalé et validé sur upload-doc.js : "*" en dur (ligne 7) au lieu
  // de dériver l'origin de process.env.ALLOWED_ORIGINS. Test ROUGE tant que non corrigé.
  it("[ROUGE — écart CLAUDE.md] n'autorise pas toute origine sans restriction (Access-Control-Allow-Origin ne doit pas être '*')", async () => {
    const handler = await freshHandler();
    const req = createMockReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.headers['Access-Control-Allow-Origin']).not.toBe('*');
  });
});

describe('api/delete-doc — mode démo', () => {
  it("bloque la suppression avec 403 si DEMO_MODE est 'true'", async () => {
    process.env.DEMO_MODE = 'true';
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body).toEqual({ error: 'Suppression désactivée en mode démo.' });
  });
});

describe('api/delete-doc — configuration serveur manquante (règle CLAUDE.md : jamais de secret exposé)', () => {
  it('renvoie 500 générique si PINECONE_API_KEY est absente', async () => {
    delete process.env.PINECONE_API_KEY;
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Configuration serveur incomplète.' });
  });

  it('renvoie 500 générique si PINECONE_INDEX_URL est absente', async () => {
    delete process.env.PINECONE_INDEX_URL;
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Configuration serveur incomplète.' });
  });

  it('ne fuite aucune clé Pinecone dans la réponse quand la config est incomplète', async () => {
    delete process.env.PINECONE_API_KEY;
    process.env.PINECONE_INDEX_URL = 'https://fake-index.pinecone.io';
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(JSON.stringify(res.body)).not.toContain('test-pinecone-key');
  });
});

describe('api/delete-doc — validation des entrées (règle CLAUDE.md : validée côté serveur)', () => {
  it('rejette une requête sans filename (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'Nom de fichier manquant.' });
  });

  it('rejette un filename chaîne vide (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: '' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'Nom de fichier manquant.' });
  });
});

describe('api/delete-doc — comportement métier (aucun chunk trouvé)', () => {
  it('renvoie 200 avec chunksDeleted: 0 si aucun chunk ne correspond au filename (comportement idempotent volontaire, pas 404)', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({ vectors: [] });
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'fichier-inexistant.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ success: true, filename: 'fichier-inexistant.txt', chunksDeleted: 0 });
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});

describe('api/delete-doc — pagination', () => {
  it('parcourt toutes les pages via paginationToken et supprime l\'union des IDs', async () => {
    mockListPaginated = vi
      .fn()
      .mockResolvedValueOnce({
        vectors: [{ id: 'doc_txt_chunk_0' }, { id: 'doc_txt_chunk_1' }],
        pagination: { next: 'token-page-2' },
      })
      .mockResolvedValueOnce({
        vectors: [{ id: 'doc_txt_chunk_2' }],
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
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockListPaginated).toHaveBeenCalledTimes(2);
    expect(mockListPaginated).toHaveBeenNthCalledWith(2, expect.objectContaining({ paginationToken: 'token-page-2' }));
    expect(mockDeleteMany).toHaveBeenCalledWith({
      ids: ['doc_txt_chunk_0', 'doc_txt_chunk_1', 'doc_txt_chunk_2'],
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ success: true, filename: 'doc.txt', chunksDeleted: 3 });
  });
});

describe('api/delete-doc — succès simple', () => {
  it('renvoie 200 avec success, filename et chunksDeleted quand une seule page de chunks existe', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc_txt_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: { doc_txt_chunk_0: { metadata: { filename: 'doc.txt' } } },
    });
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ success: true, filename: 'doc.txt', chunksDeleted: 1 });
  });

  it('ne fuite aucune clé Pinecone dans la réponse de succès', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc_txt_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: { doc_txt_chunk_0: { metadata: { filename: 'doc.txt' } } },
    });
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(JSON.stringify(res.body)).not.toContain('test-pinecone-key');
  });
});

describe('api/delete-doc — collision de préfixe assaini (deux filenames différents)', () => {
  it("ne supprime pas les chunks d'un autre fichier dont le nom assaini est identique (collision de préfixe)", async () => {
    // "doc!.txt" et "doc?.txt" s'assainissent tous les deux vers le préfixe "doc__txt_chunk_" :
    // sans vérification de metadata.filename, supprimer "doc?.txt" effacerait les chunks de
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
    const req = createMockReq({ body: { filename: 'doc?.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockDeleteMany).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ success: true, filename: 'doc?.txt', chunksDeleted: 0 });
  });

  it('supprime bien les chunks quand metadata.filename correspond exactement au filename reçu, malgré un préfixe partagé', async () => {
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
    const req = createMockReq({ body: { filename: 'doc?.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockDeleteMany).toHaveBeenCalledWith({ ids: ['doc__txt_chunk_0'] });
    expect(res.body).toEqual({ success: true, filename: 'doc?.txt', chunksDeleted: 1 });
  });
});

describe('api/delete-doc — appels externes (règle CLAUDE.md : jamais de error.message brut au client)', () => {
  // Même écart déjà signalé et validé sur upload-doc.js : catch générique (ligne 67-71)
  // renvoie error.message au lieu d'un message générique. Test ROUGE tant que non corrigé.
  it('[ROUGE — écart CLAUDE.md] renvoie un message générique si listPaginated échoue', async () => {
    mockListPaginated = vi.fn().mockRejectedValue(
      new Error('Pinecone ECONNREFUSED index-host-interne.svc.cluster.local:443')
    );
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Erreur lors de la suppression.' });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(res.body)).not.toContain('index-host-interne');
  });

  it('[ROUGE — écart CLAUDE.md] renvoie un message générique si deleteMany échoue', async () => {
    mockListPaginated = vi.fn().mockResolvedValue({
      vectors: [{ id: 'doc_txt_chunk_0' }],
      pagination: {},
    });
    mockFetch = vi.fn().mockResolvedValue({
      records: { doc_txt_chunk_0: { metadata: { filename: 'doc.txt' } } },
    });
    mockDeleteMany = vi.fn().mockRejectedValue(
      new Error('Pinecone 403 — clé invalide sk-pine-XXXXXXXX ne doit jamais être exposée')
    );
    const handler = await freshHandler();
    const req = createMockReq({ body: { filename: 'doc.txt' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Erreur lors de la suppression.' });
    expect(JSON.stringify(res.body)).not.toContain('sk-pine-XXXXXXXX');
    expect(JSON.stringify(res.body)).not.toContain('clé invalide');
  });
});
