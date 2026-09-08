import { describe, expect, it, vi } from 'vitest';
import { ToutboxQuoteShipping } from './toutbox-quote-shipping.js';
import type { ToutboxQuoteRequest } from './toutbox-quote-shipping.js';
import type { ToutboxHttpClient, ToutboxHttpResponse } from '../../toutbox-http-client.js';

function fakeClient(post: (path: string, body: unknown) => Promise<ToutboxHttpResponse>) {
  return { post, put: vi.fn() } as unknown as ToutboxHttpClient;
}

function validRequest(overrides: Partial<ToutboxQuoteRequest> = {}): ToutboxQuoteRequest {
  return {
    transportadora: 122,
    codigoServico: '100',
    infosAdicionais: null,
    cepOrigem: '22775057',
    cepDestino: '01310100',
    produtos: [
      {
        peso: 1,
        comprimento: 10,
        altura: 10,
        largura: 10,
        diametro: 0,
        maoPropria: 'N',
        avisoRecebimento: 'N',
        formato: 'Box',
        valorDeclarado: 0,
      },
    ],
    ...overrides,
  };
}

describe('ToutboxQuoteShipping', () => {
  it('sends the exact request it was given to POST /api/v1/Courier/CostAndDeliveryTime', async () => {
    let sentPath: string | undefined;
    let sentBody: unknown;
    const request = validRequest();
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async (path, body) => {
        sentPath = path;
        sentBody = body;
        return { status: 200, body: { results: 'OK', error: null, payload: [{ valorTotal: 18.9, prazo: 3 }] } };
      }),
    );

    await useCase.execute(request);

    expect(sentPath).toBe('/api/v1/Courier/CostAndDeliveryTime');
    expect(sentBody).toBe(request);
  });

  it('maps a 200 success response, converting valorTotal (reais) to priceInCents', async () => {
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async () => ({
        status: 200,
        body: { results: 'OK', error: null, payload: [{ valorTotal: 18.9, prazo: 3 }] },
      })),
    );

    const result = await useCase.execute(validRequest());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slaDays).toBe(3);
      expect(result.value.priceInCents).toBe(1890);
    }
  });

  it('passes a 400 (invalid CEP) through as-is', async () => {
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async () => ({
        status: 400,
        body: { results: 'ERR', error: { message: 'Cep origem e cep destino precisam ser ceps válidos' }, payload: [] },
      })),
    );

    const result = await useCase.execute(validRequest({ cepDestino: '00000000' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(400);
  });

  it('passes a 404 (no SLA for the CEP) through as-is', async () => {
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async () => ({
        status: 404,
        body: {
          results: 'ERR',
          error: { message: 'não possui entrada de sla para os ceps informados' },
          payload: [{ valorTotal: 0, prazo: 0, erros: ['não possui entrada de sla'] }],
        },
      })),
    );

    const result = await useCase.execute(validRequest({ cepDestino: '99999999' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(404);
  });

  it('passes a 424 (carrier/service mismatch) through as-is', async () => {
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async () => ({
        status: 424,
        body: { results: 'ERR', error: { message: 'transportadora divergente' }, payload: [] },
      })),
    );

    const result = await useCase.execute(validRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(424);
  });

  it('maps a 500 to a 502', async () => {
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async () => ({
        status: 500,
        body: { results: 'ERR', error: { message: 'internal error' }, payload: [] },
      })),
    );

    const result = await useCase.execute(validRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(502);
  });

  it('maps a network-level failure to a 502 without throwing', async () => {
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const result = await useCase.execute(validRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(502);
  });
});
