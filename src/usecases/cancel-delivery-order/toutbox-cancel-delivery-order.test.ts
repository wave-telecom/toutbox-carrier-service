import { describe, expect, it, vi } from 'vitest';
import { ToutboxCancelDeliveryOrder } from './toutbox-cancel-delivery-order.js';
import type { ToutboxHttpClient, ToutboxHttpResponse } from '../../toutbox-http-client.js';

function fakeClient(put: (path: string, body: unknown) => Promise<ToutboxHttpResponse>) {
  return { post: vi.fn(), put } as unknown as ToutboxHttpClient;
}

describe('ToutboxCancelDeliveryOrder', () => {
  it('sends { action: "CE", order_id } to Toutbox', async () => {
    let sentPath: string | undefined;
    let sentBody: unknown;
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async (path, body) => {
        sentPath = path;
        sentBody = body;
        return {
          status: 202,
          body: { results: 'OK', error: null, payload: { requestSucceeded: true } },
        };
      }),
    );

    await useCase.execute({ orderId: 'order-42' });

    expect(sentPath).toBe('/api/v1/Parcel/SuspendOrCancel/Single');
    expect(sentBody).toEqual({ action: 'CE', order_id: 'order-42' });
  });

  it('maps a 200 with requestSucceeded:true to a CANCELLING success (Toutbox\'s real "full success" status)', async () => {
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async () => ({
        status: 200,
        body: {
          results: 'OK',
          error: null,
          payload: { requestSucceeded: true, responseMessage: '200 - OK, Solicitação Recebida' },
        },
      })),
    );

    const result = await useCase.execute({ orderId: 'order-1' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('CANCELLING');
  });

  it('maps a 202 with requestSucceeded:true to a CANCELLING success', async () => {
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async () => ({
        status: 202,
        body: { results: 'OK', error: null, payload: { requestSucceeded: true } },
      })),
    );

    const result = await useCase.execute({ orderId: 'order-1' });

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

    const result = await useCase.execute({ orderId: 'order-1' });

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

    const result = await useCase.execute({ orderId: 'order-1' });

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

    const result = await useCase.execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(502);
  });

  it('maps a network-level failure to a 502 without throwing', async () => {
    const useCase = new ToutboxCancelDeliveryOrder(
      fakeClient(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const result = await useCase.execute({ orderId: 'order-1' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(502);
  });
});
