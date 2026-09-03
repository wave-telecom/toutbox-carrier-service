import { failure, success } from '@wave-tech/framework/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { API_KEY_HEADER } from '../auth/api-key-auth.js';
import type { CarrierCreateDeliveryOrder } from '../../../application/use-cases/carrier-create-delivery-order/carrier-create-delivery-order.js';
import type { CarrierCancelDeliveryOrder } from '../../../application/use-cases/carrier-cancel-delivery-order/carrier-cancel-delivery-order.js';
import type { ProcessDeliveryWebhook } from '../../vendor/toutbox/usecases/toutbox-process-delivery-webhook.js';

const API_KEY = 'test-secret-key';
const WEBHOOK_API_KEY = 'test-webhook-key';

const createDeliveryOrder: CarrierCreateDeliveryOrder = {
  execute: async () => failure({ status: 500, message: 'not used in this test file' }),
};
const cancelDeliveryOrder: CarrierCancelDeliveryOrder = {
  execute: async () => failure({ status: 500, message: 'not used in this test file' }),
};

function buildTestApp(execute: ProcessDeliveryWebhook['execute']): FastifyInstance {
  return buildApp({
    apiKey: API_KEY,
    createDeliveryOrder,
    cancelDeliveryOrder,
    processDeliveryWebhook: { execute },
    webhookApiKey: WEBHOOK_API_KEY,
  });
}

describe('POST /webhook/delivery-orders', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('rejects a request with no API key (401)', async () => {
    app = buildTestApp(async () => success(undefined));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/delivery-orders',
      payload: { entregas: [] },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects a request carrying the internal API key instead of the webhook one (401)', async () => {
    app = buildTestApp(async () => success(undefined));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/delivery-orders',
      headers: { [API_KEY_HEADER]: API_KEY },
      payload: { entregas: [] },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 and forwards the parsed body to the use case', async () => {
    const execute = vi.fn(async () => success(undefined));
    app = buildTestApp(execute);
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/delivery-orders',
      headers: { [API_KEY_HEADER]: WEBHOOK_API_KEY },
      payload: {
        entregas: [{ numeroPedido: 'order-1', codOcorrencia: '6', codigoRastreio: 'TRACK-1' }],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      entregas: [{ numeroPedido: 'order-1', codOcorrencia: '6', codigoRastreio: 'TRACK-1' }],
    });
  });

  it('returns 200 for an unrecognised codOcorrencia instead of rejecting it', async () => {
    app = buildTestApp(async () => success(undefined));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/delivery-orders',
      headers: { [API_KEY_HEADER]: WEBHOOK_API_KEY },
      payload: { entregas: [{ numeroPedido: 'order-1', codOcorrencia: '999' }] },
    });

    expect(res.statusCode).toBe(200);
  });

  it('silently ignores fields it does not know about instead of rejecting the request', async () => {
    app = buildTestApp(async () => success(undefined));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/delivery-orders',
      headers: { [API_KEY_HEADER]: WEBHOOK_API_KEY },
      payload: {
        entregas: [{ numeroPedido: 'order-1', codOcorrencia: '6', somethingToutboxAddedLater: 'x' }],
        somethingElseUnknown: true,
      },
    });

    expect(res.statusCode).toBe(200);
  });

  it('answers 502 when the use case fails to apply a mapped entrega', async () => {
    app = buildTestApp(async () =>
      failure({ status: 502, message: 'Failed to apply the delivery status update on wave-delivery-api for: order-1.' }),
    );
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/delivery-orders',
      headers: { [API_KEY_HEADER]: WEBHOOK_API_KEY },
      payload: { entregas: [{ numeroPedido: 'order-1', codOcorrencia: '6' }] },
    });

    expect(res.statusCode).toBe(502);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('rejects an entrega missing numeroPedido (400)', async () => {
    app = buildTestApp(async () => success(undefined));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/delivery-orders',
      headers: { [API_KEY_HEADER]: WEBHOOK_API_KEY },
      payload: { entregas: [{ codOcorrencia: '6' }] },
    });

    expect(res.statusCode).toBe(400);
  });
});
