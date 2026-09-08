import { Logger, success, failure, getHookCorrelationId, type Result } from '@wave-tech/framework/core';
import type { ToutboxOperationError } from '../../toutbox-operation-error.js';
import type { ToutboxHttpClient } from '../../toutbox-http-client.js';
import type {
  ToutboxCreateOrderPayload,
  ToutboxCreateOrderResponse,
  ToutboxCreateOrderResult,
} from './toutbox-create-order-payload.js';

/**
 * Calls Toutbox's own `POST /api/v1/External/Order` with a caller-supplied,
 * already-Toutbox-shaped payload and normalizes the response. Owns nothing
 * about *why* the payload looks the way it does — that mapping (sender
 * identity, sales channel, tracking-code derivation, which resource types are
 * even supported) is the caller's business knowledge, not this library's.
 */
export class ToutboxCreateDeliveryOrder {
  constructor(private readonly httpClient: ToutboxHttpClient) {}

  async execute(
    payload: ToutboxCreateOrderPayload,
  ): Promise<Result<ToutboxCreateOrderResult, ToutboxOperationError>> {
    let response;
    try {
      response = await this.httpClient.post('/api/v1/External/Order', payload);
    } catch (error) {
      Logger.error(
        'Toutbox order creation call failed',
        { numeroPedido: payload.numeroPedido, correlationId: getHookCorrelationId() },
        error,
      );
      return failure({
        status: 502,
        message: 'Toutbox could not be reached to create the delivery order.',
      });
    }

    return mapCreateResponse(response, payload);
  }
}

function mapCreateResponse(
  response: { status: number; body: unknown },
  payload: ToutboxCreateOrderPayload,
): Result<ToutboxCreateOrderResult, ToutboxOperationError> {
  const envelope = response.body as ToutboxCreateOrderResponse;

  if (response.status === 200 || response.status === 201) {
    if (envelope.error) {
      // "Pedido cadastrado, porém houve falha ao executar o despacho automático" —
      // the order was still created; log so the alert reaches the integrator.
      Logger.warn('Toutbox created the order with a dispatch/reversal alert', {
        numeroPedido: payload.numeroPedido,
        toutboxMessage: envelope.error.message,
        correlationId: getHookCorrelationId(),
      });
    }
    const transportadora = envelope.payload?.pedido?.itens?.[0]?.frete?.transportadora;
    return success({
      estimatedDelivery:
        typeof transportadora?.previsaoDeEntrega === 'string' ? transportadora.previsaoDeEntrega : null,
      slaDays: typeof transportadora?.prazoDiasUteis === 'number' ? transportadora.prazoDiasUteis : null,
      raw: envelope,
    });
  }

  const message = envelope.error?.message ?? 'Toutbox rejected the order.';
  if (response.status === 400 || response.status === 409) {
    return failure({ status: response.status, message });
  }

  Logger.error('Toutbox order creation returned an unexpected status', {
    numeroPedido: payload.numeroPedido,
    status: response.status,
    correlationId: getHookCorrelationId(),
  });
  return failure({ status: 502, message });
}
