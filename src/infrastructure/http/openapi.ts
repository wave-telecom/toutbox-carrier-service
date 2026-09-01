import type { FastifyInstance } from 'fastify';
import fastifySwagger, { type SwaggerTransformObject } from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';
import { API_KEY_HEADER } from './auth/api-key-auth.js';
import { PROBLEM_JSON_MEDIA_TYPE } from './errors/problem-detail.schema.js';

/** Security scheme name referenced by routes and the OpenAPI document. */
export const API_KEY_SECURITY = 'apiKey';

/** Media type `@fastify/swagger` assigns to every response by default. */
const DEFAULT_MEDIA_TYPE = 'application/json';

/** Minimal shape of the pieces of the OpenAPI document this module rewrites. */
interface MediaTypeObject {
  content?: Record<string, unknown>;
}
interface OperationObject {
  responses?: Record<string, MediaTypeObject>;
}
interface DocumentObject {
  paths?: Record<string, Record<string, OperationObject>>;
}

/**
 * Registers OpenAPI generation (`@fastify/swagger`) plus the interactive docs
 * UI (`@fastify/swagger-ui`, served at `/docs`).
 *
 * The document is generated from the routes' Zod schemas: `jsonSchemaTransform`
 * converts each route's schemas, and `jsonSchemaTransformObject` publishes every
 * schema carrying `.meta({ id })` under `components.schemas` so routes reference
 * it by `$ref` instead of inlining a copy.
 *
 * Must be called before route registration so the generator captures every
 * route's schema.
 *
 * The UI is intentionally prefix-agnostic: it needs no knowledge of any gateway
 * path prefix. `@fastify/swagger-ui` emits relative asset links (`./static/...`)
 * when the index is served from a trailing-slash URL, so we redirect `/docs` to
 * the relative `docs/` (see below). Those relative links resolve correctly
 * whether the API is served at the root or behind a path-stripping gateway.
 */
export function registerOpenApi(app: FastifyInstance): void {
  void app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'toutbox-carrier-service',
        // Describe what this service is for — the summary here is what every
        // consumer reads first in Swagger UI.
        description:
          "The Toutbox carrier's `CarrierProvider`-facing HTTP contract, translating between " +
          "Wave's delivery-order shape and Toutbox's own wire format.\n\n" +
          '## Authentication\n\n' +
          `All protected endpoints require an internal API key sent in the \`${API_KEY_HEADER}\` ` +
          'request header. Requests without a valid key receive a `401 Unauthorized` response.\n\n' +
          '## Conventions\n\n' +
          'Operational endpoints (e.g. the health probe) are served under the `/management` ' +
          'prefix. Errors are RFC 9457 problem details served as ' +
          `\`${PROBLEM_JSON_MEDIA_TYPE}\`.\n\n`,
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          [API_KEY_SECURITY]: {
            type: 'apiKey',
            name: API_KEY_HEADER,
            in: 'header',
            description: `Internal API key. Provide it in the \`${API_KEY_HEADER}\` header.`,
          },
        },
      },
      // Applied to every operation unless a route overrides it.
      security: [{ [API_KEY_SECURITY]: [] }],
      tags: [{ name: 'health', description: 'Operational / management probes' }],
    },
    transform: jsonSchemaTransform,
    transformObject: withProblemJsonErrors(jsonSchemaTransformObject),
  });

  void app.register(fastifySwaggerUi, { routePrefix: '/docs' });

  // Redirect the bare `/docs` to the relative `docs/`.
  //
  // WHY: @fastify/swagger-ui serves its index relative to the request URL, so it
  // only emits working relative asset links (`./static/...`) when reached from a
  // trailing-slash URL. Hit at `/docs` (no slash), those links resolve against
  // `/` and 404; hit at `/docs/`, they resolve against `/docs/` and load. The
  // redirect target is relative on purpose so it also preserves any gateway
  // prefix on the browser side (`/my-service/docs` -> `/my-service/docs/`),
  // keeping the app agnostic to where it is mounted.
  //
  // WHY A HOOK (not `app.get('/docs', ...)`): the plugin already owns `/docs`.
  // Its root route is `/` under the `/docs` prefix, and Fastify's default
  // `prefixTrailingSlash: 'both'` registers BOTH `/docs` and `/docs/` for it.
  // Declaring our own `/docs` route therefore throws FST_ERR_DUPLICATED_ROUTE at
  // boot. An `onRequest` hook runs before routing, so it can intercept `/docs`
  // before the plugin's handler ever sees it.
  app.addHook('onRequest', (request, reply, done) => {
    if (request.url === '/docs') {
      void reply.redirect('docs/', 302);
      return;
    }
    done();
  });
}

/**
 * Wraps a `transformObject` so every 4xx/5xx response is advertised as
 * `application/problem+json` instead of `application/json`.
 *
 * RFC 9457 mandates the media type, but the Zod transform has no notion of one:
 * it maps a response schema straight to a body and `@fastify/swagger` labels it
 * with the default media type. Rewriting once, here, keeps routes declaring
 * plain `response: { 404: problemDetailSchema }` entries — the alternative is a
 * hand-written `content` block on every error response of every route, which is
 * exactly the duplication the Zod-first setup exists to remove.
 */
function withProblemJsonErrors(transformObject: SwaggerTransformObject): SwaggerTransformObject {
  return (input) => {
    const document = transformObject(input) as DocumentObject;

    for (const operations of Object.values(document.paths ?? {})) {
      for (const operation of Object.values(operations)) {
        for (const [status, response] of Object.entries(operation.responses ?? {})) {
          if (!/^[45]/.test(status) || response.content === undefined) {
            continue;
          }

          const body = response.content[DEFAULT_MEDIA_TYPE];
          if (body !== undefined) {
            delete response.content[DEFAULT_MEDIA_TYPE];
            response.content[PROBLEM_JSON_MEDIA_TYPE] = body;
          }
        }
      }
    }

    return document as ReturnType<SwaggerTransformObject>;
  };
}
