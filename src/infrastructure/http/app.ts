import { randomUUID } from 'node:crypto';
import { Logger, setHookContext, setHookCorrelationId } from '@wave-tech/framework/core';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { errorHandler, notFoundHandler } from './error-handler.js';
import { registerOpenApi } from './openapi.js';
import { registerApiKeyAuth } from './auth/api-key-auth.js';
import { managementRoutes } from './routes/management-routes.js';
import { carrierCreateDeliveryOrderRoute } from './routes/carrier-create-delivery-order-route.js';
import { carrierCancelDeliveryOrderRoute } from './routes/carrier-cancel-delivery-order-route.js';
import type { CarrierCreateDeliveryOrder } from '../../application/use-cases/carrier-create-delivery-order/carrier-create-delivery-order.js';
import type { CarrierCancelDeliveryOrder } from '../../application/use-cases/carrier-cancel-delivery-order/carrier-cancel-delivery-order.js';

/**
 * Concrete adapters the application is built from. Per operation, `server.ts`
 * constructs the Toutbox use case implementation (`infrastructure/vendor/toutbox/usecases/`)
 * and passes it here typed as its `application/use-cases/` contract — a route
 * never depends on the concrete `Toutbox...` class directly.
 */
export interface AppDeps {
  /** Internal API key required on the `x-api-key` header for protected routes. */
  apiKey: string;
  createDeliveryOrder: CarrierCreateDeliveryOrder;
  cancelDeliveryOrder: CarrierCancelDeliveryOrder;
}

/**
 * Builds and configures the Fastify instance: Zod validation/serialisation,
 * OpenAPI docs, API key authentication, request logging and the global error
 * handler. Register new feature routes at the bottom as the API grows; wiring
 * use cases to their adapters happens in server.ts.
 */
export function buildApp(deps: AppDeps): FastifyInstance {
  // Pino off: the framework `Logger` is the single log sink.
  const app = Fastify({ logger: false });

  // Zod is the single source of truth for every route contract: the same schema
  // validates the request, serialises the response and produces the OpenAPI doc
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.setErrorHandler(errorHandler);
  // Unmatched routes must answer with a problem detail too, not Fastify's
  // default `{"message":"Route ... not found"}` body.
  app.setNotFoundHandler(notFoundHandler);

  // Registered before authentication on purpose: onRequest hooks run in
  // registration order, so establishing the correlation context first is what
  // makes a rejected request (401) carry a correlation id in its logs too.
  app.addHook('onRequest', (request: FastifyRequest, _reply: FastifyReply, done: () => void) => {
    setHookContext(() => {
      const correlationId = (request.headers['x-correlation-id'] as string) || randomUUID();
      setHookCorrelationId(correlationId);

      Logger.http('Incoming request', {
        method: request.method,
        url: request.url,
      });

      done();
    });
  });

  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    Logger.http('Request completed', {
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    });
  });

  // OpenAPI must be registered before routes so the generator's onRoute hook is
  // in place and captures every route's schema.
  registerOpenApi(app);
  registerApiKeyAuth(app, { apiKey: deps.apiKey });

  void app.register(managementRoutes);
  void app.register(carrierCreateDeliveryOrderRoute({ createDeliveryOrder: deps.createDeliveryOrder }));
  void app.register(carrierCancelDeliveryOrderRoute({ cancelDeliveryOrder: deps.cancelDeliveryOrder }));

  return app;
}
