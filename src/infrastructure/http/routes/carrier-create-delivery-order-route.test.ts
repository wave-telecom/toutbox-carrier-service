import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { success, failure } from '@wave-tech/framework/core';
import type { CarrierCreateDeliveryOrderRequest } from '@wave-tech/framework/contracts';
import { buildApp } from '../app.js';
import { API_KEY_HEADER } from '../auth/api-key-auth.js';
import type { CarrierCreateDeliveryOrder } from '../../../application/use-cases/carrier-create-delivery-order/carrier-create-delivery-order.js';
import type { CarrierCancelDeliveryOrder } from '../../../application/use-cases/carrier-cancel-delivery-order/carrier-cancel-delivery-order.js';

const API_KEY = 'test-secret-key';

function validBody(): CarrierCreateDeliveryOrderRequest {
  return {
    id: '10000000-1000-4100-8100-100000000000',
    brokerId: '20000000-2000-4200-8200-200000000000',
    externalCode: null,
    metadata: null,
    purchaseOrderId: 'po-1',
    resourceId: 'chip-1',
    resourceType: 'SIM',
    deliveryConfigId: '30000000-3000-4300-8300-300000000000',
    deliveryStatus: 'CREATED',
    recipient: {
      name: 'Ada Lovelace',
      document: '12345678900',
      phone: '+5511999999999',
      addressStreet: 'Rua A',
      addressNumber: '100',
      addressComplement: null,
      addressNeighborhood: 'Centro',
      addressCity: 'São Paulo',
      addressState: 'SP',
      addressZipCode: '01000000',
    },
  };
}

const successResponse = {
  providerTrackingCode: 'TRACK-1',
  providerTrackingUrl: null,
  estimatedDelivery: null,
  slaDays: null,
  metadata: null,
};

function buildTestApp(execute: CarrierCreateDeliveryOrder['execute']): FastifyInstance {
  const createDeliveryOrder: CarrierCreateDeliveryOrder = { execute };
  const cancelDeliveryOrder: CarrierCancelDeliveryOrder = {
    execute: async () => failure({ status: 500, message: 'not used in this test file' }),
  };
  return buildApp({ apiKey: API_KEY, createDeliveryOrder, cancelDeliveryOrder });
}

describe('POST /courier/delivery-orders', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('rejects requests without an API key (401)', async () => {
    app = buildTestApp(async () => success(successResponse));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/courier/delivery-orders',
      payload: validBody(),
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with the carrier response on success', async () => {
    app = buildTestApp(async () => success(successResponse));
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/courier/delivery-orders',
      headers: { [API_KEY_HEADER]: API_KEY },
      payload: validBody(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ providerTrackingCode: 'TRACK-1' });
  });

  it('returns 400 when the payload is invalid', async () => {
    app = buildTestApp(async () => success(successResponse));
    await app.ready();

    const { brokerId: _omit, ...invalid } = validBody();
    const res = await app.inject({
      method: 'POST',
      url: '/courier/delivery-orders',
      headers: { [API_KEY_HEADER]: API_KEY },
      payload: invalid,
    });

    expect(res.statusCode).toBe(400);
  });

  it.each([400, 409, 422, 501, 502, 500])(
    'passes a %i carrier failure through as the response status',
    async (status) => {
      app = buildTestApp(async () => failure({ status, message: 'nope' }));
      await app.ready();

      const res = await app.inject({
        method: 'POST',
        url: '/courier/delivery-orders',
        headers: { [API_KEY_HEADER]: API_KEY },
        payload: validBody(),
      });

      expect(res.statusCode).toBe(status);
      expect(res.headers['content-type']).toContain('application/problem+json');
    },
  );
});
