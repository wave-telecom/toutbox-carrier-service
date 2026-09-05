import { afterEach, describe, expect, it, vi } from 'vitest';
import { WaveDeliveryApiHttpClient } from './wave-delivery-api-http-client.js';

function fakeFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  } as Response);
}

describe('WaveDeliveryApiHttpClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('omits Content-Type on a bodyless post (wave-delivery-api\'s JSON parser rejects an empty body with it set)', async () => {
    const fetchMock = fakeFetch(200, {});
    vi.stubGlobal('fetch', fetchMock);

    const client = new WaveDeliveryApiHttpClient('http://wave-delivery-api.example.com', 'internal-key');
    await client.post('/private/delivery-orders/order-1/cancelled', undefined);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({ 'x-api-key': 'internal-key' });
    expect(init.body).toBeUndefined();
  });

  it('sends Content-Type and a JSON body when a body is given', async () => {
    const fetchMock = fakeFetch(200, {});
    vi.stubGlobal('fetch', fetchMock);

    const client = new WaveDeliveryApiHttpClient('http://wave-delivery-api.example.com', 'internal-key');
    await client.patch('/delivery-orders/order-1', { deliveryStatus: 'DELIVERED' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toEqual({
      'Content-Type': 'application/json',
      'x-api-key': 'internal-key',
    });
    expect(init.body).toBe(JSON.stringify({ deliveryStatus: 'DELIVERED' }));
  });

  it('returns the status and parsed JSON body', async () => {
    vi.stubGlobal('fetch', fakeFetch(200, { ok: true }));

    const client = new WaveDeliveryApiHttpClient('http://wave-delivery-api.example.com', 'internal-key');
    const response = await client.post('/private/delivery-orders/order-1/cancelled', undefined);

    expect(response).toEqual({ status: 200, body: { ok: true } });
  });
});
