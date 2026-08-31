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

// La fonction gère son rate limiting dans une Map au niveau module.
// On réimporte le module à chaque test pour repartir avec un compteur vierge.
async function freshHandler() {
  vi.resetModules();
  const mod = await import('../../api/generate-stories.js');
  return mod.default;
}

describe('api/generate-stories — méthode et CORS', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('rejette tout ce qui n\'est pas POST (405)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ method: 'GET' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.body).toEqual({ error: 'Method not allowed' });
  });

  it('répond 200 et coupe court sur une requête OPTIONS (préflight CORS)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ method: 'OPTIONS' });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.ended).toBe(true);
  });
});

describe('api/generate-stories — validation du brief (règle CLAUDE.md : validée côté serveur)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('rejette un brief vide (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: '' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'Veuillez entrer un brief métier.' });
  });

  it('rejette un brief de moins de 10 caractères (400)', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: 'court' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'Le brief doit contenir au moins 10 caractères.' });
  });

  // L'exemple que tu voulais : 2001 caractères, doit être rejeté côté serveur,
  // même si le frontend a déjà sa propre validation à 2000.
  it('rejette un brief de 2001 caractères (400), indépendamment de toute validation frontend', async () => {
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: 'a'.repeat(2001) } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: 'Le brief ne peut pas dépasser 2000 caractères.' });
  });

  it('accepte un brief de exactement 2000 caractères (limite haute incluse)', async () => {
    const handler = await freshHandler();
    // Statut volontairement différent de ceux gérés explicitement par le handler (401/429/500),
    // pour ne pas confondre un 400 venant de l'appel Claude simulé avec un 400 de validation.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'peu importe ici' }),
    });
    const req = createMockReq({ body: { brief: 'a'.repeat(2000) } });
    const res = createMockRes();

    await handler(req, res);

    // La seule chose qui nous intéresse : ce n'est jamais l'erreur de validation "dépasse 2000".
    expect(res.body?.error).not.toBe('Le brief ne peut pas dépasser 2000 caractères.');
  });
});

describe('api/generate-stories — pas de clé API (config serveur)', () => {
  it('renvoie 500 générique si ANTHROPIC_API_KEY est absente', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const handler = await freshHandler();
    const req = createMockReq({ body: { brief: 'Un brief métier suffisamment long' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Clé API manquante sur le serveur.' });
  });
});

describe('api/generate-stories — jamais de error.message brut au client (règle CLAUDE.md)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });

  it('renvoie un message générique si fetch() lève une exception inattendue', async () => {
    const handler = await freshHandler();
    // On simule une exception avec un message qui NE DOIT JAMAIS atterrir dans la réponse
    // (ex: détail interne, stack, info sensible).
    global.fetch = vi.fn().mockRejectedValue(
      new Error('ECONNREFUSED 10.0.4.2:443 — secret interne à ne jamais exposer')
    );
    const req = createMockReq({ body: { brief: 'Un brief métier suffisamment long' } });
    const res = createMockRes();

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body).toEqual({ error: 'Une erreur est survenue. Veuillez réessayer.' });
    // La vraie assertion de la règle : le message d'exception ne doit apparaître nulle part.
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(res.body)).not.toContain('secret interne');
  });
});

describe('api/generate-stories — erreurs upstream Anthropic (budget vs générique)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    // Silence le console.error de diagnostic serveur (SEC-001 : le détail y est loggé, pas renvoyé).
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.mocked(console.error).mockRestore();
  });

  const briefValide = { brief: 'Un brief métier suffisamment long pour passer la validation' };

  it('402 billing_error → message budget clair et distinct (crédit / paiement épuisé)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      json: async () => ({
        type: 'error',
        error: { type: 'billing_error', message: 'Your credit balance is too low to access the Anthropic API.' },
      }),
    });
    const handler = await freshHandler();
    const res = createMockRes();

    await handler(createMockReq({ body: briefValide }), res);

    expect(res.body).toEqual({ error: 'La démo a atteint son budget mensuel — réessaie le mois prochain.' });
  });

  it('429 avec "spend cap" dans le message → message budget, pas "Trop de requêtes"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        type: 'error',
        error: { type: 'rate_limit_error', message: "You have reached your usage tier's monthly spend cap." },
      }),
    });
    const handler = await freshHandler();
    const res = createMockRes();

    await handler(createMockReq({ body: briefValide }), res);

    expect(res.body).toEqual({ error: 'La démo a atteint son budget mensuel — réessaie le mois prochain.' });
  });

  it('429 rate limit standard (RPM/TPM, sans mot-clé budget) → toujours "Trop de requêtes"', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({
        type: 'error',
        error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit for this model.' },
      }),
    });
    const handler = await freshHandler();
    const res = createMockRes();

    await handler(createMockReq({ body: briefValide }), res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.body).toEqual({ error: 'Trop de requêtes. Réessayez dans quelques secondes.' });
  });

  it("erreur upstream inattendue → message générique, jamais le error.message brut d'Anthropic (SEC-001)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        type: 'error',
        error: { type: 'invalid_request_error', message: 'internal-host-42: prompt rejected — détail sensible à ne pas exposer' },
      }),
    });
    const handler = await freshHandler();
    const res = createMockRes();

    await handler(createMockReq({ body: briefValide }), res);

    expect(res.body).toEqual({ error: 'Erreur lors de la génération. Réessaie plus tard.' });
    expect(JSON.stringify(res.body)).not.toContain('détail sensible');
    expect(JSON.stringify(res.body)).not.toContain('internal-host-42');
  });
});

describe('api/generate-stories — timeout 30 s sur l\'appel à Claude (règle CLAUDE.md)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(console.error).mockRestore();
  });

  it('abandonne l\'appel après 30 s et renvoie un 504 générique (pas de error.message brut)', async () => {
    // fetch qui ne répond jamais, mais rejette avec une AbortError quand le signal est abort.
    global.fetch = vi.fn(
      (url, opts) =>
        new Promise((_resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
          });
        }),
    );
    const handler = await freshHandler();
    const res = createMockRes();

    const pending = handler(
      createMockReq({ body: { brief: 'Un brief métier suffisamment long pour passer la validation' } }),
      res,
    );

    // Rien avant l'échéance.
    await vi.advanceTimersByTimeAsync(29_000);
    expect(res.status).not.toHaveBeenCalledWith(504);

    // Au-delà de 30 s, l'AbortController coupe l'appel.
    await vi.advanceTimersByTimeAsync(2_000);
    await pending;

    expect(res.status).toHaveBeenCalledWith(504);
    expect(res.body).toEqual({
      error: 'Le serveur a mis trop de temps à répondre. Réessaie dans un instant.',
    });
  });

  it('ne déclenche pas le timeout quand Claude répond avant 30 s', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { type: 'authentication_error', message: 'x' } }),
    });
    const handler = await freshHandler();
    const res = createMockRes();

    await handler(
      createMockReq({ body: { brief: 'Un brief métier suffisamment long pour passer la validation' } }),
      res,
    );
    // Laisser filer un hypothétique timer résiduel : il ne doit rien faire.
    await vi.advanceTimersByTimeAsync(60_000);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.status).not.toHaveBeenCalledWith(504);
  });
});

describe('api/generate-stories — rate limiting (10 requêtes / 15 min / IP)', () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'peu importe ici' }),
    });
  });

  it('bloque la 11e requête de la même IP avec 429', async () => {
    const handler = await freshHandler(); // un seul import : on veut que le compteur persiste entre les appels
    const brief = 'Un brief métier suffisamment long pour passer la validation';

    for (let i = 0; i < 10; i++) {
      const req = createMockReq({ body: { brief }, headers: { 'x-forwarded-for': '203.0.113.5' } });
      const res = createMockRes();
      await handler(req, res);
      expect(res.status).not.toHaveBeenCalledWith(429);
    }

    const req11 = createMockReq({ body: { brief }, headers: { 'x-forwarded-for': '203.0.113.5' } });
    const res11 = createMockRes();
    await handler(req11, res11);

    expect(res11.status).toHaveBeenCalledWith(429);
  });

  it('n\'affecte pas une IP différente', async () => {
    const handler = await freshHandler();
    const brief = 'Un brief métier suffisamment long pour passer la validation';

    for (let i = 0; i < 10; i++) {
      const req = createMockReq({ body: { brief }, headers: { 'x-forwarded-for': '203.0.113.5' } });
      await handler(req, createMockRes());
    }

    const reqAutreIp = createMockReq({ body: { brief }, headers: { 'x-forwarded-for': '198.51.100.9' } });
    const resAutreIp = createMockRes();
    await handler(reqAutreIp, resAutreIp);

    expect(resAutreIp.status).not.toHaveBeenCalledWith(429);
  });

  // Le check OPTIONS a été déplacé avant "method !== 'POST'" pour corriger le préflight
  // CORS cassé. On vérifie ici que ce réordonnancement n'a pas changé le comportement du
  // rate limiting : une requête OPTIONS doit toujours sortir via le `return res.status(200).end()`
  // AVANT d'atteindre checkRateLimit (donc sans jamais consommer de crédit), et une requête
  // POST valide doit toujours déclencher checkRateLimit au même seuil qu'avant (10 passent, la 11e bloque).
  it('une requête OPTIONS ne consomme aucun crédit de rate limit, même répétée au-delà de la limite POST', async () => {
    const handler = await freshHandler();
    const brief = 'Un brief métier suffisamment long pour passer la validation';
    const ip = '203.0.113.42';

    // 15 OPTIONS, soit plus que la limite de 10 : aucune ne doit être bloquée ni consommer de crédit.
    for (let i = 0; i < 15; i++) {
      const reqOptions = createMockReq({ method: 'OPTIONS', headers: { 'x-forwarded-for': ip } });
      const resOptions = createMockRes();
      await handler(reqOptions, resOptions);
      expect(resOptions.status).toHaveBeenCalledWith(200);
      expect(resOptions.status).not.toHaveBeenCalledWith(429);
    }

    // Si les OPTIONS avaient consommé du crédit, on serait déjà bloqué ici. On vérifie que
    // les 10 premières requêtes POST de la même IP passent toujours sans 429...
    for (let i = 0; i < 10; i++) {
      const reqPost = createMockReq({ body: { brief }, headers: { 'x-forwarded-for': ip } });
      const resPost = createMockRes();
      await handler(reqPost, resPost);
      expect(resPost.status).not.toHaveBeenCalledWith(429);
    }

    // ...et que la 11e POST déclenche bien le 429, exactement comme sans les OPTIONS
    // préalables (même seuil qu'avant le réordonnancement du check OPTIONS).
    const reqPost11 = createMockReq({ body: { brief }, headers: { 'x-forwarded-for': ip } });
    const resPost11 = createMockRes();
    await handler(reqPost11, resPost11);

    expect(resPost11.status).toHaveBeenCalledWith(429);
  });
});
