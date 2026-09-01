import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { errorHandler, notFoundHandler } from './error-handler.js';
import { ConflictError, ERROR_TYPE_BASE_URI, ErrorTypes } from './errors/http-error.js';
import { problemDetailSchema } from './errors/problem-detail.schema.js';

/** Must never surface in a 500 body. */
const LEAKY_MESSAGE = 'connect ECONNREFUSED 10.0.0.1:5432 password=super-secret';

interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  errors?: Array<{ path: string; message: string; code: string }>;
}

/** Every problem detail response must satisfy these, whatever the status. */
function expectProblemDetail(
  res: { statusCode: number; headers: Record<string, unknown>; json: () => unknown },
  status: number,
): ProblemBody {
  expect(res.statusCode).toBe(status);
  expect(String(res.headers['content-type'])).toContain('application/problem+json');

  const body = res.json() as ProblemBody;
  expect(body.type.startsWith(`${ERROR_TYPE_BASE_URI}/`)).toBe(true);
  expect(typeof body.title).toBe('string');
  expect(body.title.length).toBeGreaterThan(0);
  // The body status must agree with the HTTP status.
  expect(body.status).toBe(status);
  expect(typeof body.instance).toBe('string');

  return body;
}

function buildTestApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  app.get('/conflict', async () => {
    throw new ConflictError('A resource with that name already exists');
  });

  app.get('/boom', async () => {
    throw new Error(LEAKY_MESSAGE);
  });

  // Parsed by hand inside the handler, the way a use case would.
  app.get('/zod', async () => {
    z.object({ id: z.string(), amount: z.number() }).parse({ amount: 'nope' });
    return { ok: true };
  });

  // Validated by the route's own Zod schema, via the type provider.
  app.post(
    '/examples',
    {
      schema: {
        body: z.object({ name: z.string().min(1), attributes: z.record(z.string(), z.unknown()) }),
        response: { 201: z.object({ id: z.string() }), 400: problemDetailSchema },
      },
    },
    async (_request, reply) => reply.status(201).send({ id: 'example-1' }),
  );

  return app;
}

describe('errorHandler', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves an HttpError as a problem detail carrying its type and detail', async () => {
    const res = await app.inject({ method: 'GET', url: '/conflict' });

    const body = expectProblemDetail(res, 409);
    expect(body.type).toBe(ErrorTypes.CONFLICT);
    expect(body.title).toBe('ConflictError');
    expect(body.detail).toBe('A resource with that name already exists');
    expect(body.instance).toBe('/conflict');
  });

  it('maps a route schema validation failure to a 400 with one entry per issue', async () => {
    const res = await app.inject({ method: 'POST', url: '/examples', payload: { name: '' } });

    const body = expectProblemDetail(res, 400);
    expect(body.type).toBe(ErrorTypes.VALIDATION_ERROR);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'name' }),
        expect.objectContaining({ path: 'attributes', code: 'invalid_type' }),
      ]),
    );
  });

  it('maps a hand-parsed ZodError to a 400 with one entry per issue', async () => {
    const res = await app.inject({ method: 'GET', url: '/zod' });

    const body = expectProblemDetail(res, 400);
    expect(body.type).toBe(ErrorTypes.VALIDATION_ERROR);
    expect(body.errors).toHaveLength(2);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'id', code: 'invalid_type' }),
        expect.objectContaining({ path: 'amount', code: 'invalid_type' }),
      ]),
    );
  });

  it('answers an unmatched route with a 404 problem detail', async () => {
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });

    const body = expectProblemDetail(res, 404);
    expect(body.type).toBe(ErrorTypes.NOT_FOUND);
  });

  it('leaks neither the underlying message nor a stack trace on a 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });

    const body = expectProblemDetail(res, 500);
    expect(body.type).toBe(ErrorTypes.INTERNAL_SERVER_ERROR);
    expect(body.detail).toBe('An unexpected error occurred');
    expect(res.body).not.toContain(LEAKY_MESSAGE);
    expect(res.body).not.toContain('ECONNREFUSED');
    expect(res.body).not.toMatch(/\bat .*\(.*:\d+:\d+\)/);
  });
});

describe('ErrorTypes', () => {
  it('namespaces every problem type under the canonical docs URI', () => {
    for (const type of Object.values(ErrorTypes)) {
      expect(type.startsWith(`${ERROR_TYPE_BASE_URI}/`)).toBe(true);
    }
  });

  it('declares the shared Wave baseline types', () => {
    expect(Object.keys(ErrorTypes)).toEqual(
      expect.arrayContaining([
        'VALIDATION_ERROR',
        'UNAUTHORIZED',
        'FORBIDDEN',
        'NOT_FOUND',
        'CONFLICT',
        'INVALID_STATUS_TRANSITION',
        'INTERNAL_SERVER_ERROR',
      ]),
    );
  });
});
