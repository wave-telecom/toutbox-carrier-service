import { Logger, success, failure, getHookCorrelationId, type Result } from '@wave-tech/framework/core';
import type { ToutboxOperationError } from '../../toutbox-operation-error.js';
import type { ToutboxHttpClient } from '../../toutbox-http-client.js';

export interface ToutboxQuoteProduct {
  peso: number;
  comprimento: number;
  altura: number;
  largura: number;
  diametro: number;
  maoPropria: string;
  avisoRecebimento: string;
  formato: string;
  valorDeclarado: number;
}

/** The full wire body Toutbox's `POST /api/v1/Courier/CostAndDeliveryTime` expects. */
export interface ToutboxQuoteRequest {
  transportadora: number;
  codigoServico: string;
  infosAdicionais: null;
  cepOrigem: string;
  cepDestino: string;
  produtos: ToutboxQuoteProduct[];
}

/** The raw envelope Toutbox answers `POST /api/v1/Courier/CostAndDeliveryTime` with. */
export interface ToutboxQuoteResponse {
  results: 'OK' | 'ERR';
  error: { message: string } | null;
  payload?: Array<{
    valorTotal?: unknown;
    prazo?: unknown;
    erros?: string[];
  }>;
}

export interface ToutboxQuoteResult {
  slaDays: number;
  priceInCents: number;
}

/**
 * Calls Toutbox's own `POST /api/v1/Courier/CostAndDeliveryTime` with a
 * caller-supplied, already-Toutbox-shaped request and normalizes the
 * response. Which carrier/service id to quote against, and what origin CEP
 * and product dimensions to send, are the caller's own business knowledge —
 * this library sends exactly the request it's given.
 */
export class ToutboxQuoteShipping {
  constructor(private readonly httpClient: ToutboxHttpClient) {}

  async execute(request: ToutboxQuoteRequest): Promise<Result<ToutboxQuoteResult, ToutboxOperationError>> {
    let response;
    try {
      response = await this.httpClient.post('/api/v1/Courier/CostAndDeliveryTime', request);
    } catch (error) {
      Logger.error(
        'Toutbox shipping quote call failed',
        { cepDestino: request.cepDestino, correlationId: getHookCorrelationId() },
        error,
      );
      return failure({
        status: 502,
        message: 'Toutbox could not be reached to quote shipping.',
      });
    }

    return mapQuoteResponse(response, request);
  }
}

function mapQuoteResponse(
  response: { status: number; body: unknown },
  request: ToutboxQuoteRequest,
): Result<ToutboxQuoteResult, ToutboxOperationError> {
  const envelope = response.body as ToutboxQuoteResponse;
  const item = envelope.payload?.[0];

  if (response.status === 200 && envelope.results !== 'ERR') {
    return success({
      slaDays: typeof item?.prazo === 'number' ? item.prazo : 0,
      priceInCents: typeof item?.valorTotal === 'number' ? Math.round(item.valorTotal * 100) : 0,
    });
  }

  const message = envelope.error?.message ?? item?.erros?.[0] ?? 'Toutbox rejected the quote request.';
  if (response.status === 400 || response.status === 404 || response.status === 424) {
    return failure({ status: response.status, message });
  }

  Logger.error('Toutbox shipping quote returned an unexpected status', {
    cepDestino: request.cepDestino,
    status: response.status,
    correlationId: getHookCorrelationId(),
  });
  return failure({ status: 502, message });
}
