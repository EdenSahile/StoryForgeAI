import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyCors } from '../../api/_cors.js';

function createMockRes() {
  const res = { headers: {}, statusCode: undefined, ended: false };
  res.setHeader = vi.fn((k, v) => {
    res.headers[k] = v;
    return res;
  });
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.end = vi.fn(() => {
    res.ended = true;
    return res;
  });
  return res;
}

const req = ({ method = 'POST', origin } = {}) => ({
  method,
  headers: origin === undefined ? {} : { origin },
});

const OLD_ENV = process.env.ALLOWED_ORIGINS;
beforeEach(() => {
  delete process.env.ALLOWED_ORIGINS;
});
afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = OLD_ENV;
});

describe('api/_cors applyCors — origines autorisées', () => {
  it('pose Access-Control-Allow-Origin pour une origine du fallback', () => {
    const res = createMockRes();
    applyCors(req({ origin: 'http://localhost:5173' }), res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
  });

  it('ne pose pas Access-Control-Allow-Origin pour une origine inconnue', () => {
    const res = createMockRes();
    applyCors(req({ origin: 'https://evil.example.com' }), res);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('trim chaque entrée de ALLOWED_ORIGINS : un espace après la virgule ne casse plus le matching', () => {
    process.env.ALLOWED_ORIGINS = 'https://a.example.com,  https://b.example.com , https://c.example.com';
    const res = createMockRes();
    applyCors(req({ origin: 'https://b.example.com' }), res);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://b.example.com');
  });

  it('ignore les entrées vides de ALLOWED_ORIGINS (virgule finale, etc.)', () => {
    process.env.ALLOWED_ORIGINS = 'https://a.example.com,,';
    const res = createMockRes();
    // Une origine "" ne doit pas être considérée autorisée.
    applyCors(req({ origin: '' }), res);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});

describe('api/_cors applyCors — en-têtes constants', () => {
  it('pose toujours Vary: Origin (origine autorisée)', () => {
    const res = createMockRes();
    applyCors(req({ origin: 'http://localhost:5173' }), res);
    expect(res.headers['Vary']).toBe('Origin');
  });

  it('pose toujours Vary: Origin (origine refusée)', () => {
    const res = createMockRes();
    applyCors(req({ origin: 'https://evil.example.com' }), res);
    expect(res.headers['Vary']).toBe('Origin');
  });

  it('pose Access-Control-Allow-Methods (paramétrable) et Allow-Headers', () => {
    const res = createMockRes();
    applyCors(req(), res, { methods: 'GET, OPTIONS' });
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
    expect(res.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
  });
});

describe('api/_cors applyCors — préflight OPTIONS', () => {
  it('répond 200 + end() et retourne true sur OPTIONS', () => {
    const res = createMockRes();
    const handled = applyCors(req({ method: 'OPTIONS', origin: 'http://localhost:5173' }), res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(true);
  });

  it('retourne false sur une requête non-OPTIONS', () => {
    const res = createMockRes();
    expect(applyCors(req({ method: 'POST' }), res)).toBe(false);
  });
});
