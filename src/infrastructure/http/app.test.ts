import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Logger, getHookCorrelationId, failure, success } from '@wave-tech/framework/core';
import { buildApp } from './app.js';
import { API_KEY_HEADER } from './auth/api-key-auth.js';
import { ErrorTypes } from './errors/http-error.js';
import type { CarrierCreateDeliveryOrder } from '../../application/use-cases/carrier-create-delivery-order/carrier-create-delivery-order.js';
import type { CarrierCancelDeliveryOrder } from '../../application/use-cases/carrier-cancel-delivery-order/carrier-cancel-delivery-order.js';
import type { ProcessDeliveryWebhook } from '../vendor/toutbox/usecases/toutbox-process-delivery-webhook.js';

const API_KEY = 'test-secret-key';
const WEBHOOK_API_KEY = 'test-webhook-key';

/** Never actually exercised by this suite's own tests — a trivial stub is enough. */
const createDeliveryOrder: CarrierCreateDeliveryOrder = {
  execute: async () => failure({ status: 500, message: 'not used in this test file' }),
};
const cancelDeliveryOrder: CarrierCancelDeliveryOrder = {
  execute: async () => failure({ status: 500, message: 'not used in this test file' }),
};
const processDeliveryWebhook: ProcessDeliveryWebhook = {
  execute: async () => success(undefined),
};

describe('buildApp', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp({
      apiKey: API_KEY,
      createDeliveryOrder,
      cancelDeliveryOrder,
      processDeliveryWebhook,
      webhookApiKey: WEBHOOK_API_KEY,
    });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  it('answers the root liveness probe without a key', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('answers the management health probe without a key', async () => {
    const res = await app.inject({ method: 'GET', url: '/management/health' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('does not serve the health probe at a bare /health', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { [API_KEY_HEADER]: API_KEY },
    });

    expect(res.statusCode).toBe(404);
  });

  it('answers an unmatched route with a 404 problem detail', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/does-not-exist',
      headers: { [API_KEY_HEADER]: API_KEY },
    });

    expect(res.statusCode).toBe(404);
    expect(String(res.headers['content-type'])).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ type: ErrorTypes.NOT_FOUND, status: 404 });
  });

  it('rejects an unmatched route with no key before routing decides (401)', async () => {
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ type: ErrorTypes.UNAUTHORIZED });
  });

  it('documents both probes in the OpenAPI document', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const doc = res.json() as { paths?: Record<string, unknown> };

    expect(res.statusCode).toBe(200);
    expect(doc.paths?.['/']).toBeDefined();
    expect(doc.paths?.['/management/health']).toBeDefined();
  });

  it('propagates an inbound x-correlation-id into the logging context', async () => {
    const seen: Array<string | undefined> = [];
    vi.spyOn(Logger, 'http').mockImplementation(() => {
      seen.push(getHookCorrelationId());
    });

    await app.inject({
      method: 'GET',
      url: '/management/health',
      headers: { 'x-correlation-id': 'correlation-from-caller' },
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBe('correlation-from-caller');
  });

  it('generates a correlation id when the caller does not send one', async () => {
    const seen: Array<string | undefined> = [];
    vi.spyOn(Logger, 'http').mockImplementation(() => {
      seen.push(getHookCorrelationId());
    });

    await app.inject({ method: 'GET', url: '/management/health' });

    expect(seen[0]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
