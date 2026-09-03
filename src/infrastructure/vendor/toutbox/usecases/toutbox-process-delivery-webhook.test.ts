import { Logger } from '@wave-tech/framework/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToutboxProcessDeliveryWebhook } from './toutbox-process-delivery-webhook.js';
import type {
  WaveDeliveryApiHttpClient,
  WaveDeliveryApiHttpResponse,
} from '../../wave-delivery-api/wave-delivery-api-http-client.js';
import type {
  ToutboxDeliveryWebhookBody,
  ToutboxDeliveryWebhookEntrega,
} from '../toutbox-delivery-webhook-payload.js';

function fakeClient(
  overrides: Partial<{
    patch: (path: string, body: unknown) => Promise<WaveDeliveryApiHttpResponse>;
    post: (path: string, body: unknown) => Promise<WaveDeliveryApiHttpResponse>;
  }> = {},
) {
  return {
    patch: overrides.patch ?? vi.fn(async () => ({ status: 200, body: {} })),
    post: overrides.post ?? vi.fn(async () => ({ status: 200, body: {} })),
  } as unknown as WaveDeliveryApiHttpClient;
}

function payload(overrides: Partial<ToutboxDeliveryWebhookEntrega> = {}): ToutboxDeliveryWebhookBody {
  return {
    entregas: [
      {
        numeroPedido: 'order-1',
        codOcorrencia: '6',
        descOcorrencia: 'Entregue',
        codigoRastreio: 'TRACK-1',
        linkRastreio: 'https://tim.trakin.co/o/order-1',
        iccid: null,
        ...overrides,
      },
    ],
  };
}

describe('ToutboxProcessDeliveryWebhook', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls PATCH /delivery-orders/:id for a DELIVERED occurrence code', async () => {
    const patch = vi.fn(async () => ({ status: 200, body: {} }));
    const useCase = new ToutboxProcessDeliveryWebhook(fakeClient({ patch }));

    await useCase.execute(payload({ codOcorrencia: '6' }));

    expect(patch).toHaveBeenCalledWith('/delivery-orders/order-1', {
      deliveryStatus: 'DELIVERED',
      providerTrackingCode: 'TRACK-1',
      providerTrackingUrl: 'https://tim.trakin.co/o/order-1',
    });
  });

  it('calls PATCH /delivery-orders/:id for a CREATED occurrence code', async () => {
    const patch = vi.fn(async () => ({ status: 200, body: {} }));
    const useCase = new ToutboxProcessDeliveryWebhook(fakeClient({ patch }));

    await useCase.execute(payload({ codOcorrencia: '91' }));

    expect(patch).toHaveBeenCalledWith(
      '/delivery-orders/order-1',
      expect.objectContaining({ deliveryStatus: 'CREATED' }),
    );
  });

  it('includes iccid as metadata when Toutbox sends it', async () => {
    const patch = vi.fn(async () => ({ status: 200, body: {} }));
    const useCase = new ToutboxProcessDeliveryWebhook(fakeClient({ patch }));

    await useCase.execute(payload({ codOcorrencia: '6', iccid: '8955032000077637' }));

    expect(patch).toHaveBeenCalledWith(
      '/delivery-orders/order-1',
      expect.objectContaining({ metadata: { iccid: '8955032000077637' } }),
    );
  });

  it('omits providerTrackingCode/providerTrackingUrl when Toutbox does not send them', async () => {
    const patch = vi.fn(async () => ({ status: 200, body: {} }));
    const useCase = new ToutboxProcessDeliveryWebhook(fakeClient({ patch }));

    await useCase.execute(payload({ codOcorrencia: '6', codigoRastreio: null, linkRastreio: null }));

    expect(patch).toHaveBeenCalledWith('/delivery-orders/order-1', { deliveryStatus: 'DELIVERED' });
  });

  it('calls the private cancellation endpoint for a CANCELLED occurrence code, with no body', async () => {
    const post = vi.fn(async () => ({ status: 200, body: {} }));
    const useCase = new ToutboxProcessDeliveryWebhook(fakeClient({ post }));

    await useCase.execute(payload({ codOcorrencia: '155', numeroPedido: 'order-2' }));

    expect(post).toHaveBeenCalledWith('/private/delivery-orders/order-2/cancelled', undefined);
  });

  it('does not call wave-delivery-api for an unmapped occurrence code', async () => {
    const patch = vi.fn();
    const post = vi.fn();
    const useCase = new ToutboxProcessDeliveryWebhook(fakeClient({ patch, post }));
    vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

    await useCase.execute(payload({ codOcorrencia: '999' }));

    expect(patch).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(Logger.warn).toHaveBeenCalled();
  });

  it('logs and returns a failure Result when wave-delivery-api rejects the update', async () => {
    const patch = vi.fn(async () => ({ status: 422, body: { detail: 'nope' } }));
    const useCase = new ToutboxProcessDeliveryWebhook(fakeClient({ patch }));
    vi.spyOn(Logger, 'error').mockImplementation(() => undefined);

    const result = await useCase.execute(payload({ codOcorrencia: '6', numeroPedido: 'order-1' }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.status).toBe(502);
      expect(result.error.message).toContain('order-1');
    }
    expect(Logger.error).toHaveBeenCalled();
  });

  it('logs and returns a failure Result on a network failure', async () => {
    const patch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const useCase = new ToutboxProcessDeliveryWebhook(fakeClient({ patch }));
    vi.spyOn(Logger, 'error').mockImplementation(() => undefined);

    const result = await useCase.execute(payload({ codOcorrencia: '6' }));

    expect(result.ok).toBe(false);
    expect(Logger.error).toHaveBeenCalled();
  });

  it('processes multiple entregas independently', async () => {
    const patch = vi.fn(async () => ({ status: 200, body: {} }));
    const post = vi.fn(async () => ({ status: 200, body: {} }));
    const useCase = new ToutboxProcessDeliveryWebhook(fakeClient({ patch, post }));

    await useCase.execute({
      entregas: [
        {
          numeroPedido: 'order-1',
          codOcorrencia: '6',
          codigoRastreio: null,
          linkRastreio: null,
          iccid: null,
        },
        {
          numeroPedido: 'order-2',
          codOcorrencia: '155',
          codigoRastreio: null,
          linkRastreio: null,
          iccid: null,
        },
      ],
    });

    expect(patch).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledTimes(1);
  });
});
