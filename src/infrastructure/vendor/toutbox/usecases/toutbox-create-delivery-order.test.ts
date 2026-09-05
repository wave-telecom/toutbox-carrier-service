import { describe, expect, it, vi } from 'vitest';
import type { CarrierCreateDeliveryOrderRequest } from '@wave-tech/framework/contracts';
import { ToutboxCreateDeliveryOrder } from './toutbox-create-delivery-order.js';
import type { ToutboxHttpClient, ToutboxHttpResponse } from '../toutbox-http-client.js';

function fakeClient(post: (path: string, body: unknown) => Promise<ToutboxHttpResponse>) {
  return { post, put: vi.fn() } as unknown as ToutboxHttpClient;
}

function validInput(overrides: Partial<CarrierCreateDeliveryOrderRequest> = {}): CarrierCreateDeliveryOrderRequest {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    brokerId: 'broker-1',
    externalCode: null,
    metadata: null,
    purchaseOrderId: 'po-1',
    resourceId: 'chip-1',
    resourceType: 'SIM',
    deliveryConfigId: 'config-1',
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
      addressZipCode: '01000-000',
    },
    ...overrides,
  };
}

describe('ToutboxCreateDeliveryOrder', () => {
  it('returns a 501 without calling Toutbox when resourceType is not SIM', async () => {
    const post = vi.fn();
    const useCase = new ToutboxCreateDeliveryOrder(fakeClient(post));

    const result = await useCase.execute(
      validInput({
        resourceType: 'MSISDN' as unknown as CarrierCreateDeliveryOrderRequest['resourceType'],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(501);
    expect(post).not.toHaveBeenCalled();
  });

  it('maps a 200 success response, deriving the tracking code from the order id', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 200,
        body: { results: 'OK', error: null, payload: { numeroPedido: 'x', status: 'RECEBIDO' } },
      })),
    );
    const input = validInput();

    const result = await useCase.execute(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.providerTrackingCode).toBe(`${input.id.replaceAll('-', '')}01`);
      expect(result.value.providerTrackingUrl).toBeNull();
    }
  });

  it('maps estimatedDelivery and slaDays from payload.pedido.itens[0].frete.transportadora when Toutbox sends them', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 200,
        body: {
          results: 'OK',
          error: null,
          payload: {
            numeroPedido: 'x',
            status: 'RECEBIDO',
            pedido: {
              itens: [
                { frete: { transportadora: { previsaoDeEntrega: '2026-09-10', prazoDiasUteis: 3 } } },
              ],
            },
          },
        },
      })),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.estimatedDelivery).toBe('2026-09-10');
      expect(result.value.slaDays).toBe(3);
    }
  });

  it('leaves estimatedDelivery and slaDays null when Toutbox does not send payload.pedido', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 200,
        body: { results: 'OK', error: null, payload: { numeroPedido: 'x', status: 'RECEBIDO' } },
      })),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.estimatedDelivery).toBeNull();
      expect(result.value.slaDays).toBeNull();
    }
  });

  it('sends the recipient zip code nested at itens[0].frete.destinatario.cep', async () => {
    let sentBody: unknown;
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async (_path, body) => {
        sentBody = body;
        return { status: 200, body: { results: 'OK', error: null, payload: {} } };
      }),
    );

    await useCase.execute(validInput({ recipient: { ...validInput().recipient, addressZipCode: '11111111' } }));

    const body = sentBody as { itens: [{ frete: { destinatario: { cep: string } } }] };
    expect(body.itens[0].frete.destinatario.cep).toBe('11111111');
  });

  it('still succeeds on a 201 with a dispatch-alert error attached', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 201,
        body: {
          results: 'OK',
          error: { message: 'despacho automático falhou' },
          payload: { numeroPedido: 'x', status: 'RECEBIDO_COM_ALERTA' },
        },
      })),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(true);
  });

  it('passes a 400 through as-is', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 400,
        body: { results: 'ERR', error: { message: 'invalid' }, payload: null },
      })),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(400);
  });

  it('passes a 409 through as-is', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 409,
        body: { results: 'ERR', error: { message: 'duplicate' }, payload: null },
      })),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(409);
  });

  it.each([500, 401])('maps a %i status to a 502', async (status) => {
    const useCase = new ToutboxCreateDeliveryOrder(
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
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const result = await useCase.execute(validInput());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(502);
  });
});
