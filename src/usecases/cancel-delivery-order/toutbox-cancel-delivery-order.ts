import { Logger, success, failure, getHookCorrelationId, type Result } from '@wave-tech/framework/core';
import type { ToutboxOperationError } from '../../toutbox-operation-error.js';
import type { ToutboxHttpClient } from '../../toutbox-http-client.js';

/** The raw envelope Toutbox answers `PUT /api/v1/Parcel/SuspendOrCancel/Single` with. */
export interface ToutboxCancelOrderResponse {
  results: 'OK' | 'ERR';
  error: { message: string } | null;
  payload: {
    requestSucceeded?: boolean;
    error?: string | null;
    responseMessage?: string;
  } | null;
}

export interface ToutboxCancelOrderResult {
  status: 'CANCELLING';
}

/**
 * Calls Toutbox's own `PUT /api/v1/Parcel/SuspendOrCancel/Single` and
 * normalizes the response. Toutbox only ever acknowledges that the
 * cancellation request was accepted — actual completion arrives later via the
 * delivery-status webhook — so a successful call never resolves to anything
 * but `CANCELLING`.
 */
export class ToutboxCancelDeliveryOrder {
  constructor(private readonly httpClient: ToutboxHttpClient) {}

  async execute(input: { orderId: string }): Promise<Result<ToutboxCancelOrderResult, ToutboxOperationError>> {
    let response;
    try {
      response = await this.httpClient.put('/api/v1/Parcel/SuspendOrCancel/Single', {
        action: 'CE',
        order_id: input.orderId,
      });
    } catch (error) {
      Logger.error(
        'Toutbox cancellation call failed',
        { orderId: input.orderId, correlationId: getHookCorrelationId() },
        error,
      );
      return failure({
        status: 502,
        message: 'Toutbox could not be reached to cancel the delivery order.',
      });
    }

    return mapCancelResponse(response, input.orderId);
  }
}

function mapCancelResponse(
  response: { status: number; body: unknown },
  orderId: string,
): Result<ToutboxCancelOrderResult, ToutboxOperationError> {
  const envelope = response.body as ToutboxCancelOrderResponse;

  // 200 = fully confirmed by the carrier; 202 = registered but the carrier
  // transmission itself failed (Toutbox's own "partial success"). Both are
  // driven by `payload.requestSucceeded`, not the status code alone.
  if (response.status === 200 || response.status === 202) {
    if (envelope.payload?.requestSucceeded === true) {
      return success({ status: 'CANCELLING' });
    }

    const message =
      envelope.payload?.error ??
      envelope.payload?.responseMessage ??
      'Toutbox rejected the cancellation request.';
    Logger.warn('Toutbox rejected the cancellation request', {
      orderId,
      toutboxMessage: message,
      correlationId: getHookCorrelationId(),
    });
    return failure({ status: 422, message });
  }

  const message = envelope.error?.message ?? 'Toutbox rejected the cancellation.';
  if (response.status === 400) {
    return failure({ status: 400, message });
  }

  Logger.error('Toutbox cancellation returned an unexpected status', {
    orderId,
    status: response.status,
    correlationId: getHookCorrelationId(),
  });
  return failure({ status: 502, message });
}
