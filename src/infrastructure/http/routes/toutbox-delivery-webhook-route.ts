import { z } from 'zod';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { toutboxDeliveryWebhookBodySchema } from '../../vendor/toutbox/toutbox-delivery-webhook-payload.js';
import type { ProcessDeliveryWebhook } from '../../vendor/toutbox/usecases/toutbox-process-delivery-webhook.js';
import { API_KEY_HEADER } from '../auth/api-key-auth.js';
import { UnauthorizedError, httpErrorForStatus } from '../errors/http-error.js';
import { problemDetailResponses } from '../errors/problem-detail.schema.js';

export interface ToutboxDeliveryWebhookRouteDeps {
  processDeliveryWebhook: ProcessDeliveryWebhook;
  /**
   * Authenticates the Toutbox webhook call itself — deliberately not
   * `INTERNAL_API_KEY`. That key authenticates BSS modules calling into this
   * service; Toutbox is an external vendor, a different trust domain.
   */
  webhookApiKey: string;
}

/**
 * Receives Toutbox's delivery-status webhook. Public as far as the global
 * `x-api-key`/`INTERNAL_API_KEY` auth is concerned (this path is listed in
 * `buildApp`'s `publicPaths`) — this plugin's own `onRequest` hook is what
 * actually guards it, checking the same header against a separate webhook
 * key instead.
 */
export function toutboxDeliveryWebhookRoute(
  deps: ToutboxDeliveryWebhookRouteDeps,
): FastifyPluginAsync {
  return async function register(app: FastifyInstance): Promise<void> {
    app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
      const provided = request.headers[API_KEY_HEADER];
      if (typeof provided !== 'string' || provided !== deps.webhookApiKey) {
        throw new UnauthorizedError('A valid API key must be provided in the x-api-key header');
      }
    });

    const routes = app.withTypeProvider<ZodTypeProvider>();

    routes.post(
      '/webhook/delivery-orders',
      {
        schema: {
          tags: ['webhook'],
          summary: 'Receive delivery status updates from Toutbox',
          description:
            'Never rejects on an unrecognised codOcorrencia or on unknown fields — Toutbox ' +
            'has no retry-on-4xx handling for those. Each "entrega" is translated into its ' +
            'own call to wave-delivery-api and applied independently: one failing does not ' +
            'stop the others from being attempted. If any mapped entrega genuinely fails to ' +
            'apply (wave-delivery-api rejected it or could not be reached), the whole request ' +
            'answers with a 502 so Toutbox retries the batch — safe to do since re-applying an ' +
            'already-applied entrega is a no-op.',
          body: toutboxDeliveryWebhookBodySchema,
          response: {
            200: z.looseObject({}),
            ...problemDetailResponses(401, 502),
          },
        },
      },
      async (request, reply) => {
        const result = await deps.processDeliveryWebhook.execute(request.body);
        if (!result.ok) {
          throw httpErrorForStatus(result.error.status, result.error.message);
        }
        return reply.status(200).send({});
      },
    );
  };
}
