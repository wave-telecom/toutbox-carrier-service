import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { success, failure } from '@wave-tech/framework/core';
import { buildApp } from '../app.js';
import { API_KEY_HEADER } from '../auth/api-key-auth.js';
import type { CarrierCreateDeliveryOrder } from '../../../application/use-cases/carrier-create-delivery-order/carrier-create-delivery-order.js';
import type { CarrierCancelDeliveryOrder } from '../../../application/use-cases/carrier-cancel-delivery-order/carrier-cancel-delivery-order.js';
import type { CarrierQuoteShipping } from '../../../application/use-cases/carrier-quote-shipping/carrier-quote-shipping.js';

const API_KEY = 'test-secret-key';

const successResponse = { slaDays: 3, priceInCents: 1890 };

function buildTestApp(execute: CarrierQuoteShipping['execute']): FastifyInstance {
  const createDeliveryOrder: CarrierCreateDeliveryOrder = {
    execute: async () => failure({ status: 500, message: 'not used in this test file' }),
  };
  const cancelDeliveryOrder: CarrierCancelDeliveryOrder = {
    execute: async () => failure({ status: 500, message: 'not used in this test file' }),
  };
  const quoteShipping: CarrierQuoteShipping = { execute };
  return buildApp({
    apiKey: API_KEY,
    createDeliveryOrder,
    cancelDeliveryOrder,
    quoteShipping,
    processDeliveryWebhook: { execute: async () => success(undefined) },
    webhookApiKey: 'test-webhook-key',
  });
}

describe('GET /courier/cost-and-delivery-time', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('rejects requests without an API key (401)', async () => {
    app = buildTestApp(async () => success(successResponse));
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/courier/cost-and-delivery-time?zipCode=01310100',
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with the carrier quote on success', async () => {
    app = buildTestApp(async () => success(successResponse));
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/courier/cost-and-delivery-time?zipCode=01310100',
      headers: { [API_KEY_HEADER]: API_KEY },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(successResponse);
  });

  it('returns 400 when zipCode is not 8 digits', async () => {
    app = buildTestApp(async () => success(successResponse));
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/courier/cost-and-delivery-time?zipCode=abc',
      headers: { [API_KEY_HEADER]: API_KEY },
    });

    expect(res.statusCode).toBe(400);
  });

  it.each([400, 404, 424, 500, 502])(
    'passes a %i carrier failure through as the response status',
    async (status) => {
      app = buildTestApp(async () => failure({ status, message: 'nope' }));
      await app.ready();

      const res = await app.inject({
        method: 'GET',
        url: '/courier/cost-and-delivery-time?zipCode=01310100',
        headers: { [API_KEY_HEADER]: API_KEY },
      });

      expect(res.statusCode).toBe(status);
      expect(res.headers['content-type']).toContain('application/problem+json');
    },
  );
});
