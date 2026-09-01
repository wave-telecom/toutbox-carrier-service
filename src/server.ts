import { Logger } from '@wave-tech/framework/core';
import { loadEnv } from './infrastructure/config/env.js';
import { buildApp } from './infrastructure/http/app.js';

/**
 * Composition root: load config, wire concrete adapters into the application,
 * start Fastify, and handle graceful shutdown.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  Logger.initialize(env.NEW_RELIC_APP_NAME);

  // `buildApp` takes concrete adapters — Toutbox use case implementations,
  // built from a `ToutboxHttpClient` — and wires them to their `application/`
  // type and route. Construct the vendor HTTP client and each operation here:
  //
  //   const toutboxHttpClient = new ToutboxHttpClient(env.toutboxConfig);
  //   const createDeliveryOrder: CarrierCreateDeliveryOrder =
  //     new ToutboxCreateDeliveryOrder(toutboxHttpClient);
  //
  // then pass it below.
  const app = buildApp({
    apiKey: env.INTERNAL_API_KEY,
  });

  const shutdown = async (signal: string): Promise<void> => {
    Logger.info('Shutting down gracefully', { signal });
    await app.close();
    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  await app.listen({ host: env.HOST, port: env.PORT });
  Logger.info('Server listening', { host: env.HOST, port: env.PORT });
}

main().catch((error: unknown) => {
  Logger.error('Fatal error during startup', { notify: true }, error);
  process.exit(1);
});
