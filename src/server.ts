import { Logger } from '@wave-tech/framework/core';
import { loadEnv } from './infrastructure/config/env.js';
import { buildApp } from './infrastructure/http/app.js';
import { ToutboxHttpClient } from './infrastructure/vendor/toutbox/toutbox-http-client.js';
import { ToutboxCreateDeliveryOrder } from './infrastructure/vendor/toutbox/usecases/toutbox-create-delivery-order.js';
import { ToutboxCancelDeliveryOrder } from './infrastructure/vendor/toutbox/usecases/toutbox-cancel-delivery-order.js';
import { ToutboxQuoteShipping } from './infrastructure/vendor/toutbox/usecases/toutbox-quote-shipping.js';
import { ToutboxProcessDeliveryWebhook } from './infrastructure/vendor/toutbox/usecases/toutbox-process-delivery-webhook.js';
import { WaveDeliveryApiHttpClient } from './infrastructure/vendor/wave-delivery-api/wave-delivery-api-http-client.js';

/**
 * Composition root: load config, wire concrete adapters into the application,
 * start Fastify, and handle graceful shutdown.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  Logger.initialize(env.NEW_RELIC_APP_NAME);

  const toutboxHttpClient = new ToutboxHttpClient(env.TOUTBOX_BASE_URL, env.TOUTBOX_API_KEY);
  const waveDeliveryApiHttpClient = new WaveDeliveryApiHttpClient(
    env.WAVE_DELIVERY_API_BASE_URL,
    env.WAVE_DELIVERY_API_KEY,
  );

  const app = buildApp({
    apiKey: env.INTERNAL_API_KEY,
    createDeliveryOrder: new ToutboxCreateDeliveryOrder(toutboxHttpClient),
    cancelDeliveryOrder: new ToutboxCancelDeliveryOrder(toutboxHttpClient),
    quoteShipping: new ToutboxQuoteShipping(toutboxHttpClient),
    processDeliveryWebhook: new ToutboxProcessDeliveryWebhook(waveDeliveryApiHttpClient),
    webhookApiKey: env.TOUTBOX_WEBHOOK_API_KEY,
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
