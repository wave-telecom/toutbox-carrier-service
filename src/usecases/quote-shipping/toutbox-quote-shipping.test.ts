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

  // RSK-DLV-006 / TST-DLV-006-01 - `valorTotal` outside the expected type silently
  // collapses to `priceInCents: 0`: the caller cannot tell "shipping is free" from
  // "Toutbox sent something we could not read". A zero price flows straight to the
  // sales channel. A quote whose price cannot be read is a failure, not a zero.
  //
  // `it.fails` because the fallback is live today. Once the mapper rejects a
  // non-numeric `valorTotal`, this test errors out and must become a plain `it`.
  it.fails('fails instead of quoting 0 when valorTotal is not a number', async () => {
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async () => ({
        status: 200,
        body: { results: 'OK', error: null, payload: [{ valorTotal: '12,34', prazo: 5 }] },
      })),
    );

    const result = await useCase.execute(validRequest());

    expect(result.ok).toBe(false);
  });

  // Same defect on the SLA side of the same payload.
  it.fails('fails instead of quoting 0 days when prazo is not a number', async () => {
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async () => ({
        status: 200,
        body: { results: 'OK', error: null, payload: [{ valorTotal: 12.34, prazo: 'cinco' }] },
      })),
    );

    const result = await useCase.execute(validRequest());

    expect(result.ok).toBe(false);
  });

  // RSK-DLV-006 / TST-DLV-006-02 - Toutbox answers its own errors with HTTP 200 and
  // `results: 'ERR'`, carrying valorTotal 0 / prazo 0 (the spec's own error examples
  // look exactly like this). Passes today; here as a regression guard, because it is
  // the case that makes the 0 fallback above indistinguishable from a real quote.
  it('treats a 200 with results ERR as a failure, never as a 0 quote', async () => {
    const useCase = new ToutboxQuoteShipping(
      fakeClient(async () => ({
        status: 200,
        body: {
          results: 'ERR',
          error: null,
          payload: [{ valorTotal: 0, prazo: 0, erros: ['CEP nao atendido'] }],
        },
      })),
    );

    const result = await useCase.execute(validRequest());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toBe('CEP nao atendido');
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
