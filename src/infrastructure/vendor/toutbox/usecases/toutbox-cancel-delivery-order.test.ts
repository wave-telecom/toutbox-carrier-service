import { describe, expect, it, vi } from 'vitest';
import type { CarrierCancelDeliveryOrderRequest } from '@wave-tech/framework/contracts';
import { ToutboxCancelDeliveryOrder } from './toutbox-cancel-delivery-order.js';
import type { ToutboxHttpClient, ToutboxHttpResponse } from '../toutbox-http-client.js';

function fakeClient(put: (path: string, body: unknown) => Promise<ToutboxHttpResponse>) {
  return { post: vi.fn(), put } as unknown as ToutboxHttpClient;
}

function validInput(overrides: Partial<CarrierCancelDeliveryOrderRequest> = {}): CarrierCancelDeliveryOrderRequest {
  return {
    id: 'order-1',
    brokerId: 'broker-1',
    externalCode: null,
    metadata: null,
    purchaseOrderId: 'po-1',
    resourceId: 'chip-1',
    resourceType: 'SIM',
    deliveryConfigId: 'config-1',
    deliveryStatus: 'CANCELLING',
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
      addressZipCode: '01000-000',
    },
    reason: 'customer gave up',
    ...overrides,
  };
}

describe('ToutboxCancelDeliveryOrder', () => {
  it('returns a 501 without calling Toutbox when resourceType is not SIM', async () => {
    const put = vi.fn();
    const useCase = new ToutboxCancelDeliveryOrder(fakeClient(put));

    const result = await useCase.execute(
      validInput({
        resourceType: 'MSISDN' as unknown as CarrierCancelDeliveryOrderRequest['resourceType'],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(501);
    expect(put).not.toHaveBeenCalled();
  });

  it('sends { action: "CE", order_id } to Toutbox', async () => {
    let sentBody: unknown;
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async (_path, body) => {
        sentBody = body;
        return {
          status: 202,
          body: { results: 'OK', error: null, payload: { requestSucceeded: true } },
        };
      }),
    );

    await useCase.execute(validInput({ id: 'order-42' }));

    expect(sentBody).toEqual({ action: 'CE', order_id: 'order-42' });
  });

  it('maps a 202 with requestSucceeded:true to a CANCELLING success', async () => {
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async () => ({
        status: 202,
        body: { results: 'OK', error: null, payload: { requestSucceeded: true } },
      })),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('CANCELLING');
  });

  it('maps a 202 with requestSucceeded:false to a 422', async () => {
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async () => ({
        status: 202,
        body: {
          results: 'OK',
          error: null,
          payload: { requestSucceeded: false, error: 'order not found at the carrier' },
        },
      })),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(422);
      expect(result.error.message).toBe('order not found at the carrier');
    }
  });

  it('passes a 400 through as-is', async () => {
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async () => ({
        status: 400,
        body: { results: 'ERR', error: { message: 'invalid' }, payload: null },
      })),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(400);
  });

  it.each([500, 401])('maps a %i status to a 502', async (status) => {
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async () => ({
        status,
        body: { results: 'ERR', error: { message: 'oops' }, payload: null },
      })),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(502);
  });

  it('maps a network-level failure to a 502 without throwing', async () => {
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(502);
  });
});
