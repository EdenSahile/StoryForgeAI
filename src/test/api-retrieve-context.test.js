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

// Pas de Map de rate limiting au niveau module ici non plus (même constat que sur
// upload-doc.js et delete-doc.js) : pas d'état partagé entre requêtes à neutraliser.
// On réimporte quand même le module à chaque test pour repartir avec des mocks propres.
async function freshHandler() {
  vi.resetModules();
  const mod = await import('../../api/retrieve-context.js');
  return mod.default;
}

const BRIEF_VALIDE = 'Un brief métier suffisamment long pour la recherche';

let mockEmbeddingsCreate;
let mockQuery;
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

beforeEach(() => {
  process.env.OPENAI_API_KEY = 'test-openai-key';
  process.env.PINECONE_API_KEY = 'test-pinecone-key';
  process.env.PINECONE_INDEX_URL = 'https://fake-index.pinecone.io';

  mockEmbeddingsCreate = vi.fn().mockResolvedValue({
    data: [{ embedding: new Array(512).fill(0) }],
  });
  mockQuery = vi.fn().mockResolvedValue({ matches: [] });
  mockIndex = vi.fn().mockReturnValue({
    query: (...args) => mockQuery(...args),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.PINECONE_API_KEY;
  delete process.env.PINECONE_INDEX_URL;
});

describe('api/retrieve-context — méthode et CORS', () => {
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

  // Même écart déjà signalé et validé sur upload-doc.js et delete-doc.js : "*" en dur
  // (ligne 9) au lieu de dériver l'origin de process.env.ALLOWED_ORIGINS.
  it("[ROUGE — écart CLAUDE.md] n'autorise pas toute origine sans restriction (Access-Control-Allow-Origin ne doit pas être '*')", async () => {
    const handler = await freshHandler();
    const req = createMockReq({ method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.headers['Access-Control-Allow-Origin']).not.toBe('*');
  });
});

describe('api/retrieve-context — configuration serveur manquante (règle CLAUDE.md : jamais de secret exposé)', () => {
  it('renvoie 500 générique si OPENAI_API_KEY est absente', async () => {
    delete process.env.OPENAI_API_KEY;
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Configuration serveur incomplète.' });
  });

  it('renvoie 500 générique si PINECONE_API_KEY est absente', async () => {
    delete process.env.PINECONE_API_KEY;
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Configuration serveur incomplète.' });
  });

  it('renvoie 500 générique si PINECONE_INDEX_URL est absente', async () => {
    delete process.env.PINECONE_INDEX_URL;
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Configuration serveur incomplète.' });
  });

  it('ne fuite aucune des clés serveur dans la réponse quand la config est incomplète', async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.PINECONE_API_KEY = 'super-secret-pinecone-key';
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain('super-secret-pinecone-key');
    expect(payload).not.toContain('test-openai-key');
  });
});

describe('api/retrieve-context — validation du brief (règle CLAUDE.md : validée côté serveur)', () => {
  it('rejette une requête sans brief (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: {} });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'Brief trop court pour la recherche contextuelle.' });
  });

  it('rejette un brief vide (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: '' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'Brief trop court pour la recherche contextuelle.' });
  });

  it('rejette un brief de moins de 10 caractères après trim (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: '  court  ' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'Brief trop court pour la recherche contextuelle.' });
  });

  it('accepte un brief de exactement 10 caractères (limite basse incluse)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: 'a'.repeat(10) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.body?.error).not.toBe('Brief trop court pour la recherche contextuelle.');
  });
});

describe('api/retrieve-context — topK (comportement actuel, non couvert par une règle explicite de CLAUDE.md)', () => {
  it('utilise topK = 5 par défaut quand il est omis', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 5 }));
  });

  it('transmet topK tel quel à Pinecone quand il est fourni', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE, topK: 12 } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: 12 }));
  });

  // Documente le comportement actuel : aucune validation de topK côté serveur (pas de
  // borne, pas de contrôle de type). Ce test constate l'existant, il n'affirme pas que
  // c'est correct. Si Pinecone rejette une valeur absurde, l'erreur remonte par le même
  // catch générique que les tests ROUGE ci-dessous (fuite de error.message).
  it('transmet un topK invalide (négatif) tel quel à Pinecone, sans validation serveur', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE, topK: -1 } });
    const res = createMockRes();

    await handler(req, res);

    expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ topK: -1 }));
  });
});

describe('api/retrieve-context — appels externes (règle CLAUDE.md : jamais de error.message brut au client)', () => {
  // Même écart déjà signalé et validé sur upload-doc.js et delete-doc.js : catch
  // générique renvoie error.message au lieu d'un message générique.
  it("[ROUGE — écart CLAUDE.md] renvoie un message générique si l'embedding OpenAI échoue", async () => {
    mockEmbeddingsCreate = vi.fn().mockRejectedValue(
      new Error('OpenAI 401 — clé invalide sk-proj-XXXXXXXX ne doit jamais être exposée')
    );
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Erreur lors de la recherche contextuelle.' });
    expect(JSON.stringify(res.body)).not.toContain('sk-proj-XXXXXXXX');
    expect(JSON.stringify(res.body)).not.toContain('clé invalide');
  });

  it('[ROUGE — écart CLAUDE.md] renvoie un message générique si la requête Pinecone échoue', async () => {
    mockQuery = vi.fn().mockRejectedValue(
      new Error('Pinecone ECONNREFUSED index-host-interne.svc.cluster.local:443')
    );
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Erreur lors de la recherche contextuelle.' });
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(res.body)).not.toContain('index-host-interne');
  });
});

describe('api/retrieve-context — succès (filtrage et formatage des résultats)', () => {
  it('filtre les matches sous le seuil de pertinence (score <= 0.42) et formate les autres', async () => {
    mockQuery = vi.fn().mockResolvedValue({
      matches: [
        {
          score: 0.91,
          metadata: { text: 'chunk pertinent', filename: 'doc.txt', chunkIndex: 0 },
        },
        {
          score: 0.42,
          metadata: { text: 'chunk à la limite exacte', filename: 'doc.txt', chunkIndex: 1 },
        },
        {
          score: 0.1,
          metadata: { text: 'chunk non pertinent', filename: 'doc.txt', chunkIndex: 2 },
        },
      ],
    });
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    // score > 0.42 strictement : le match à 0.42 pile est exclu, seul le premier passe.
    expect(res.body.chunks).toEqual([
      { text: 'chunk pertinent', score: 91, filename: 'doc.txt', chunkIndex: 0 },
    ]);
    expect(res.body.totalMatches).toBe(3);
  });

  it('renvoie une liste vide si aucun match trouvé (pas une erreur)', async () => {
    mockQuery = vi.fn().mockResolvedValue({ matches: [] });
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toEqual({ success: true, chunks: [], totalMatches: 0 });
  });

  it('ne fuite aucune clé API dans la réponse de succès', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: BRIEF_VALIDE } });
    const res = createMockRes();

    await handler(req, res);

    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain('test-openai-key');
    expect(payload).not.toContain('test-pinecone-key');
  });
});
