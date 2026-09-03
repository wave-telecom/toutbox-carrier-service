import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  carrierCreateDeliveryOrderRequestSchema,
  carrierCreateDeliveryOrderResponseSchema,
} from '@wave-tech/framework/contracts';
import type { CarrierCreateDeliveryOrder } from '../../../application/use-cases/carrier-create-delivery-order/carrier-create-delivery-order.js';
import { httpErrorForStatus } from '../errors/http-error.js';
import { problemDetailResponses } from '../errors/problem-detail.schema.js';

export interface CarrierCreateDeliveryOrderRouteDeps {
  createDeliveryOrder: CarrierCreateDeliveryOrder;
}

/**
 * The `CarrierService`-facing contract `wave-delivery-api` (or any future BSS
 * module needing the same carrier) calls to create a delivery order. A thin
 * gateway: validates the shared request schema, calls the use case, maps its
 * `Result` to an HTTP response. This service owns no resource of its own, so
 * a success answers `200` rather than `201 + Location`.
 */
export function carrierCreateDeliveryOrderRoute(
  deps: CarrierCreateDeliveryOrderRouteDeps,
): FastifyPluginAsync {
  return async function register(app: FastifyInstance): Promise<void> {
    const routes = app.withTypeProvider<ZodTypeProvider>();

    routes.post(
      '/courier/delivery-orders',
      {
        schema: {
          tags: ['courier'],
          summary: 'Create a delivery order at the carrier',
          description:
            'Translates a delivery order into the configured carrier vendor\'s own wire format ' +
            'and submits it. Only resourceType "SIM" is implemented today.',
          body: carrierCreateDeliveryOrderRequestSchema,
          response: {
            200: carrierCreateDeliveryOrderResponseSchema,
            ...problemDetailResponses(400, 401, 409, 422, 500, 501, 502),
          },
        },
      },
      async (request, reply) => {
        const result = await deps.createDeliveryOrder.execute(request.body);
        if (!result.ok) {
          throw httpErrorForStatus(result.error.status, result.error.message);
        }
        return reply.status(200).send(result.value);
      },
    );
  };
}
