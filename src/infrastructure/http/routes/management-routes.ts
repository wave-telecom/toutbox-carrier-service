import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const healthResponseSchema = z
  .object({ status: z.literal('ok') })
  .meta({ id: 'HealthResponse', description: 'Liveness/readiness probe response.' });

/**
 * Liveness/readiness and management probes. Kept dependency-free so they always
 * answer: a probe that can fail because a downstream is unavailable would take
 * the instance out of rotation for something it cannot fix by restarting.
 *
 * `GET /management/health` is a platform-wide contract — it is the single path
 * consumed by the Cloud Run probes, the App Engine checks and the load balancer.
 * Never move it or put it behind auth.
 */
export async function managementRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/',
    {
      schema: {
        tags: ['health'],
        summary: 'Root liveness probe',
        // Public endpoint — no API key required.
        security: [],
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({ status: 'ok' }) as const,
  );

  routes.get(
    '/management/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Management health probe',
        // Public endpoint — no API key required.
        security: [],
        response: { 200: healthResponseSchema },
      },
    },
    async () => ({ status: 'ok' }) as const,
  );
}
