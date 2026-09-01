import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '../errors/http-error.js';

/** Header clients must send carrying the internal API key. */
export const API_KEY_HEADER = 'x-api-key';

export interface ApiKeyAuthOptions {
  /** The expected internal API key (from `INTERNAL_API_KEY`). */
  apiKey: string;
  /**
   * Paths that bypass authentication entirely (probes, docs). Matched by
   * exact value or as a prefix (e.g. `/docs` also guards `/docs/json`).
   */
  publicPaths?: string[];
}

const DEFAULT_PUBLIC_PATHS = ['/', '/management/health', '/docs'];

function isPublic(path: string, publicPaths: string[]): boolean {
  return publicPaths.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Registers an `onRequest` hook that rejects any request whose `x-api-key`
 * header does not match the configured internal API key. Public paths
 * (root, management health probe, OpenAPI docs) are exempt.
 *
 * Authentication is an HTTP transport concern, so it lives here in
 * infrastructure rather than leaking into use cases or the domain.
 */
export function registerApiKeyAuth(app: FastifyInstance, options: ApiKeyAuthOptions): void {
  const publicPaths = options.publicPaths ?? DEFAULT_PUBLIC_PATHS;

  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    if (isPublic(request.routeOptions.url ?? request.url, publicPaths)) {
      return;
    }

    const provided = request.headers[API_KEY_HEADER];
    if (typeof provided !== 'string' || provided !== options.apiKey) {
      throw new UnauthorizedError('A valid API key must be provided in the x-api-key header');
    }
  });
}
