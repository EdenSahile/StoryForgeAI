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
