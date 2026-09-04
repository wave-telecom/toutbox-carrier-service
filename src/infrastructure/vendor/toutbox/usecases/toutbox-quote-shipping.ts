import { Logger, success, failure, getHookCorrelationId, type Result } from '@wave-tech/framework/core';
import type {
  CarrierQuoteShippingRequest,
  CarrierQuoteShippingResponse,
} from '@wave-tech/framework/contracts';
import type { CarrierOperationError } from '../../../../application/carrier-operation-error.js';
import type { CarrierQuoteShipping } from '../../../../application/use-cases/carrier-quote-shipping/carrier-quote-shipping.js';
import type { ToutboxHttpClient } from '../toutbox-http-client.js';

/**
 * Fixed fields Toutbox's `POST /api/v1/Courier/CostAndDeliveryTime` requires
 * on every request, agreed with the team (see the "Consulta de frete (preço e
 * SLA)" integration spec) — only `cepDestino` varies per call.
 */
const FIXED_REQUEST_FIELDS = {
  transportadora: 122,
  codigoServico: '100',
  infosAdicionais: null,
  cepOrigem: '22775057',
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
} as const;

/**
 * Implements {@link CarrierQuoteShipping} against Toutbox's own
 * `POST /api/v1/Courier/CostAndDeliveryTime`. Owns the full Wave-shape <->
 * Toutbox-shape translation — nothing about Toutbox's wire format leaks past
 * this file.
 */
export class ToutboxQuoteShipping implements CarrierQuoteShipping {
  constructor(private readonly httpClient: ToutboxHttpClient) {}

  async execute(
    input: CarrierQuoteShippingRequest,
  ): Promise<Result<CarrierQuoteShippingResponse, CarrierOperationError>> {
    const payload = { ...FIXED_REQUEST_FIELDS, cepDestino: input.zipCode };

    let response;
    try {
      response = await this.httpClient.post('/api/v1/Courier/CostAndDeliveryTime', payload);
    } catch (error) {
      Logger.error(
        'Toutbox shipping quote call failed',
        { zipCode: input.zipCode, correlationId: getHookCorrelationId() },
        error,
      );
      return failure({
        status: 502,
        message: 'Toutbox could not be reached to quote shipping.',
      });
    }

    return mapQuoteResponse(response, input);
  }
}

interface ToutboxQuoteEnvelope {
  results: 'OK' | 'ERR';
  error: { message: string } | null;
  payload?: Array<{
    valorTotal?: unknown;
    prazo?: unknown;
    erros?: string[];
  }>;
}

function mapQuoteResponse(
  response: { status: number; body: unknown },
  input: CarrierQuoteShippingRequest,
): Result<CarrierQuoteShippingResponse, CarrierOperationError> {
  const envelope = response.body as ToutboxQuoteEnvelope;
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
    zipCode: input.zipCode,
    status: response.status,
    correlationId: getHookCorrelationId(),
  });
  return failure({ status: 502, message });
}
