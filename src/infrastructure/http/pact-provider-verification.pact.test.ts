import path from 'node:path';
import { execSync } from 'node:child_process';
import { Verifier } from '@pact-foundation/pact';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { ToutboxHttpClient } from '../vendor/toutbox/toutbox-http-client.js';
import { ToutboxCreateDeliveryOrder } from '../vendor/toutbox/usecases/toutbox-create-delivery-order.js';
import { ToutboxCancelDeliveryOrder } from '../vendor/toutbox/usecases/toutbox-cancel-delivery-order.js';

/**
 * Provider-side Pact verification against `wave-delivery-api`'s consumer
 * contract (ADR 0000, `tim-network-adapter`). Starts the real app wired to a
 * real `ToutboxHttpClient`, pointed at a WireMock container built from this
 * repo's own `wiremock/Dockerfile.wiremock` — the same image ADR 0001 uses
 * for local dev, CI, and (here) Pact provider verification — so the app
 * exercises its real request-schema validation, use case and mapping logic,
 * end to end, against the exact stub set that ships with this repo.
 *
 * Source of pacts: the Pact Broker at `PACT_BROKER_URL`. Skips entirely —
 * rather than failing `npm test` — when it isn't set, so this stays optional
 * outside CI or an environment with a broker configured.
 *
 * Authentication is optional (the local dev broker in `docker-compose.yml`
 * has none): set both `PACT_BROKER_USERNAME`/`PACT_BROKER_PASSWORD` for basic
 * auth against a real broker.
 */
const PACT_BROKER_URL = process.env.PACT_BROKER_URL;
const PACT_BROKER_USERNAME = process.env.PACT_BROKER_USERNAME;
const PACT_BROKER_PASSWORD = process.env.PACT_BROKER_PASSWORD;

describe.runIf(Boolean(PACT_BROKER_URL))('toutbox-carrier-service (Pact provider verification)', () => {
  let wiremock: StartedTestContainer;
  let app: FastifyInstance;
  let providerBaseUrl: string;

  beforeAll(async () => {
    wiremock = await (
      await GenericContainer.fromDockerfile(
        path.resolve(process.cwd(), 'wiremock'),
        'Dockerfile.wiremock',
      ).build()
    )
      .withExposedPorts(8080)
      .start();

    const toutboxBaseUrl = `http://${wiremock.getHost()}:${wiremock.getMappedPort(8080)}`;
    const toutboxHttpClient = new ToutboxHttpClient(toutboxBaseUrl, 'local-dev-toutbox-api-key');

    app = buildApp({
      apiKey: 'pact-verification-key',
      createDeliveryOrder: new ToutboxCreateDeliveryOrder(toutboxHttpClient),
      cancelDeliveryOrder: new ToutboxCancelDeliveryOrder(toutboxHttpClient),
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('Expected the Fastify server to bind to a TCP port.');
    }
    providerBaseUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await wiremock?.stop();
  });

  it('satisfies the wave-delivery-api consumer contract', async () => {
    const verifier = new Verifier({
      provider: 'toutbox-carrier-service',
      providerBaseUrl,
      customProviderHeaders: ['x-api-key: pact-verification-key'],
      pactBrokerUrl: PACT_BROKER_URL,
      ...(PACT_BROKER_USERNAME && PACT_BROKER_PASSWORD
        ? { pactBrokerUsername: PACT_BROKER_USERNAME, pactBrokerPassword: PACT_BROKER_PASSWORD }
        : {}),
      consumerVersionSelectors: [{ consumer: 'wave-delivery-api', latest: true }],
      // The git SHA is the version identity on both sides of a Pact exchange
      // (ADR 0000, `tim-network-adapter`) — required by the broker-mode
      // validator even when not actually publishing a result.
      providerVersion: execSync('git rev-parse HEAD').toString().trim(),
      publishVerificationResult: process.env.CI === 'true',
      // The two interactions the consumer defines carry no provider state
      // (`.given(...)`) today — WireMock's own static, body-matched stubs
      // already provide the determinism ADR 0001 describes.
      stateHandlers: {},
    });

    await verifier.verifyProvider();
  }, 120_000);
});
