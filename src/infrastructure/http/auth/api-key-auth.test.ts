import { describe, it, expect, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerApiKeyAuth, API_KEY_HEADER } from './api-key-auth.js';
import { errorHandler } from '../error-handler.js';
import { ErrorTypes } from '../errors/http-error.js';

const API_KEY = 'super-secret-key';

function buildTestApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setErrorHandler(errorHandler);
  registerApiKeyAuth(app, { apiKey: API_KEY });
  app.get('/', async () => ({ status: 'ok' })); // default public path
  app.get('/management/health', async () => ({ status: 'ok' })); // default public path
  app.get('/protected', async () => ({ ok: true }));
  return app;
}

describe('registerApiKeyAuth', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildTestApp();
  });

  it('allows the root public path without a key', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
  });

  it('allows the management health probe without a key', async () => {
    const res = await app.inject({ method: 'GET', url: '/management/health' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a protected route without a key (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });

    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ type: ErrorTypes.UNAUTHORIZED, status: 401 });
  });

  it('rejects a protected route with the wrong key (401)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { [API_KEY_HEADER]: 'wrong-key' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('allows a protected route with the correct key (200)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { [API_KEY_HEADER]: API_KEY },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('honours an explicit publicPaths list over the defaults', async () => {
    const app = Fastify({ logger: false });
    app.setErrorHandler(errorHandler);
    registerApiKeyAuth(app, { apiKey: API_KEY, publicPaths: ['/open'] });
    app.get('/open', async () => ({ ok: true }));
    app.get('/', async () => ({ ok: true }));

    expect((await app.inject({ method: 'GET', url: '/open' })).statusCode).toBe(200);
    // `/` is only public by default; an explicit list replaces the defaults.
    expect((await app.inject({ method: 'GET', url: '/' })).statusCode).toBe(401);
  });
});
