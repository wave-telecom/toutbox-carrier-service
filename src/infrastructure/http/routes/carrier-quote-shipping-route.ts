import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  carrierQuoteShippingRequestSchema,
  carrierQuoteShippingResponseSchema,
} from '@wave-tech/framework/contracts';
import type { CarrierQuoteShipping } from '../../../application/use-cases/carrier-quote-shipping/carrier-quote-shipping.js';
import { httpErrorForStatus } from '../errors/http-error.js';
import { problemDetailResponses } from '../errors/problem-detail.schema.js';

export interface CarrierQuoteShippingRouteDeps {
  quoteShipping: CarrierQuoteShipping;
}

/**
 * The `CarrierService`-facing contract `wave-delivery-api` (or any future BSS
 * module needing the same carrier) calls to quote shipping price and SLA for
 * a zip code. A thin gateway: validates the shared request schema, calls the
 * use case, maps its `Result` to an HTTP response.
 */
export function carrierQuoteShippingRoute(deps: CarrierQuoteShippingRouteDeps): FastifyPluginAsync {
  return async function register(app: FastifyInstance): Promise<void> {
    const routes = app.withTypeProvider<ZodTypeProvider>();

    routes.get(
      '/courier/cost-and-delivery-time',
      {
        schema: {
          tags: ['courier'],
          summary: 'Quote shipping price and SLA for a zip code',
          description:
            'Translates a zip code into the configured carrier vendor\'s own cost/delivery-time ' +
            'query and returns the price (in cents) and SLA (in days).',
          querystring: carrierQuoteShippingRequestSchema,
          response: {
            200: carrierQuoteShippingResponseSchema,
            ...problemDetailResponses(400, 401, 404, 424, 500, 502),
          },
        },
      },
      async (request, reply) => {
        const result = await deps.quoteShipping.execute(request.query);
        if (!result.ok) {
          throw httpErrorForStatus(result.error.status, result.error.message);
        }
        return reply.status(200).send(result.value);
      },
    );
  };
}
