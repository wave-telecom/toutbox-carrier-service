import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import { registerOpenApi } from './openapi.js';
import {
  PROBLEM_JSON_MEDIA_TYPE,
  problemDetailResponses,
} from './errors/problem-detail.schema.js';

/** An OpenAPI response object keyed by media type. */
interface MediaTypeResponse {
  content?: Record<string, { schema?: { $ref?: string } }>;
}

interface OpenApiDoc {
  info: { description?: string };
  servers?: Array<{ url: string }>;
  security?: Array<Record<string, string[]>>;
  components?: {
    securitySchemes?: Record<string, { type: string; in: string; name: string }>;
    schemas?: Record<string, unknown>;
  };
  paths?: Record<string, Record<string, { security?: unknown[]; responses?: Record<string, unknown> }>>;
}

/** A representative route: one success body, two documented error statuses. */
const exampleResponseSchema = z
  .object({ id: z.uuid(), name: z.string() })
  .meta({ id: 'ExampleResponse' });

function buildTestApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerOpenApi(app);

  // Routes must be registered as a plugin, not synchronously on the root: the
  // swagger plugin only sees routes added after its own onRoute hook is in
  // place, and `app.register` is what puts them in that order.
  void app.register(async (instance) => {
    instance.withTypeProvider<ZodTypeProvider>().get(
      '/examples/:id',
      {
        schema: {
          tags: ['examples'],
          summary: 'Fetch an example resource',
          params: z.object({ id: z.uuid() }),
          response: {
            200: exampleResponseSchema,
            ...problemDetailResponses(401, 404),
          },
        },
      },
      async () => ({ id: '00000000-0000-4000-8000-000000000000', name: 'example' }),
    );

    // A public route overriding the global security requirement, like the probe.
    instance.withTypeProvider<ZodTypeProvider>().get(
      '/management/health',
      {
        schema: {
          tags: ['health'],
          security: [],
          response: { 200: z.object({ status: z.string() }) },
        },
      },
      async () => ({ status: 'ok' }),
    );
  });

  return app;
}

describe('registerOpenApi', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the OpenAPI document', async () => {
    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(response.statusCode).toBe(200);
  });

  it('documents API key authentication via the x-api-key header', () => {
    const doc = app.swagger() as unknown as OpenApiDoc;
    const scheme = doc.components?.securitySchemes?.apiKey;

    expect(scheme).toMatchObject({ type: 'apiKey', in: 'header', name: 'x-api-key' });
    expect(doc.security).toContainEqual({ apiKey: [] });
    expect(doc.info.description).toContain('API key');
  });

  it('publishes schemas tagged with a meta id as named components', () => {
    const doc = app.swagger() as unknown as OpenApiDoc;

    expect(doc.components?.schemas?.ProblemDetail).toBeDefined();
    expect(doc.components?.schemas?.ExampleResponse).toBeDefined();
  });

  it('declares error responses as application/problem+json referencing ProblemDetail', () => {
    const doc = app.swagger() as unknown as OpenApiDoc;
    const responses = doc.paths?.['/examples/{id}']?.get?.responses ?? {};

    for (const status of ['401', '404']) {
      const content = (responses[status] as MediaTypeResponse | undefined)?.content;

      expect(content?.[PROBLEM_JSON_MEDIA_TYPE]).toBeDefined();
      expect(content?.[PROBLEM_JSON_MEDIA_TYPE]?.schema?.$ref).toContain('ProblemDetail');
      // The default media type must be gone, not merely accompanied.
      expect(content?.['application/json']).toBeUndefined();
    }
  });

  it('leaves success responses on application/json', () => {
    const doc = app.swagger() as unknown as OpenApiDoc;
    const content = (
      doc.paths?.['/examples/{id}']?.get?.responses?.['200'] as MediaTypeResponse | undefined
    )?.content;

    expect(content?.['application/json']).toBeDefined();
    expect(content?.[PROBLEM_JSON_MEDIA_TYPE]).toBeUndefined();
  });

  it('keeps a route-level security override, so public endpoints stay public', () => {
    const doc = app.swagger() as unknown as OpenApiDoc;

    expect(doc.paths?.['/management/health']?.get?.security).toEqual([]);
  });

  it('redirects the bare /docs to the relative docs/ (trailing slash)', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs' });

    expect(res.statusCode).toBe(302);
    // Relative target so any gateway prefix is preserved on the browser side.
    expect(res.headers.location).toBe('docs/');
  });

  it('serves the docs index with relative asset links from /docs/', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/' });

    expect(res.statusCode).toBe(200);
    // Relative links make the UI prefix-agnostic — no leading slash, no prefix.
    expect(res.body).toContain('./static/swagger-ui.css');
    expect(res.body).not.toContain('"/docs/static/swagger-ui.css"');
  });

  it('serves the static assets under /docs/static', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/static/swagger-ui.css' });
    expect(res.statusCode).toBe(200);
  });

  it('does not declare a server base path', () => {
    const doc = app.swagger() as unknown as OpenApiDoc;
    expect(doc.servers).toBeUndefined();
  });
});
