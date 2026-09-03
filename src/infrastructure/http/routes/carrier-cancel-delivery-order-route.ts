import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  carrierCancelDeliveryOrderRequestSchema,
  carrierCancelDeliveryOrderResponseSchema,
} from '@wave-tech/framework/contracts';
import type { CarrierCancelDeliveryOrder } from '../../../application/use-cases/carrier-cancel-delivery-order/carrier-cancel-delivery-order.js';
import { httpErrorForStatus } from '../errors/http-error.js';
import { problemDetailResponses } from '../errors/problem-detail.schema.js';

export interface CarrierCancelDeliveryOrderRouteDeps {
  cancelDeliveryOrder: CarrierCancelDeliveryOrder;
}

const paramsSchema = z.object({
  id: z.string().min(1).describe('The delivery order identifier.'),
});

/**
 * The `CarrierService`-facing contract `wave-delivery-api` (or any future BSS
 * module needing the same carrier) calls to cancel a delivery order. A thin
 * gateway: validates the shared request schema, calls the use case, maps its
 * `Result` to an HTTP response. This service owns no resource of its own, so
 * a success answers `200`.
 */
export function carrierCancelDeliveryOrderRoute(
  deps: CarrierCancelDeliveryOrderRouteDeps,
): FastifyPluginAsync {
  return async function register(app: FastifyInstance): Promise<void> {
    const routes = app.withTypeProvider<ZodTypeProvider>();

    routes.post(
      '/courier/delivery-orders/:id/cancel',
      {
        schema: {
          tags: ['courier'],
          summary: 'Cancel a delivery order at the carrier',
          description:
            'Translates a cancellation request into the configured carrier vendor\'s own wire ' +
            'format and submits it. Only resourceType "SIM" is implemented today.',
          params: paramsSchema,
          body: carrierCancelDeliveryOrderRequestSchema,
          response: {
            200: carrierCancelDeliveryOrderResponseSchema,
            ...problemDetailResponses(400, 401, 409, 422, 500, 501, 502),
          },
        },
      },
      async (request, reply) => {
        const result = await deps.cancelDeliveryOrder.execute({
          ...request.body,
          id: request.params.id,
        });
        if (!result.ok) {
          throw httpErrorForStatus(result.error.status, result.error.message);
        }
        return reply.status(200).send(result.value);
      },
    );
  };
}
