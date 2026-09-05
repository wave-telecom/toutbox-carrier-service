import {
  Logger,
  success,
  failure,
  getHookCorrelationId,
  type Result,
} from '@wave-tech/framework/core';
import type {
  CarrierCancelDeliveryOrderRequest,
  CarrierCancelDeliveryOrderResponse,
} from '@wave-tech/framework/contracts';
import type { CarrierOperationError } from '../../../../application/carrier-operation-error.js';
import type { CarrierCancelDeliveryOrder } from '../../../../application/use-cases/carrier-cancel-delivery-order/carrier-cancel-delivery-order.js';
import type { ToutboxHttpClient } from '../toutbox-http-client.js';

/** The only `resourceType` Toutbox's payload shape (fixed chip-logistics fields) supports today. */
const SUPPORTED_RESOURCE_TYPE = 'SIM';

interface ToutboxSuspendOrCancelEnvelope {
  results: 'OK' | 'ERR';
  error: { message: string } | null;
  payload: {
    requestSucceeded?: boolean;
    error?: string | null;
    responseMessage?: string;
  } | null;
}

/**
 * Implements {@link CarrierCancelDeliveryOrder} against Toutbox's own
 * `PUT /api/v1/Parcel/SuspendOrCancel/Single`. Owns the full Wave-shape <->
 * Toutbox-shape translation — nothing about Toutbox's wire format leaks past
 * this file.
 */
export class ToutboxCancelDeliveryOrder implements CarrierCancelDeliveryOrder {
  constructor(private readonly httpClient: ToutboxHttpClient) {}

  async execute(
    input: CarrierCancelDeliveryOrderRequest,
  ): Promise<Result<CarrierCancelDeliveryOrderResponse, CarrierOperationError>> {
    if (input.resourceType !== SUPPORTED_RESOURCE_TYPE) {
      return failure({
        status: 501,
        message: `Cancelling a delivery order for resourceType "${input.resourceType}" is not implemented; only "${SUPPORTED_RESOURCE_TYPE}" is supported.`,
      });
    }

    let response;
    try {
      response = await this.httpClient.put('/api/v1/Parcel/SuspendOrCancel/Single', {
        action: 'CE',
        order_id: input.id,
      });
    } catch (error) {
      Logger.error(
        'Toutbox cancellation call failed',
        { deliveryOrderId: input.id, correlationId: getHookCorrelationId() },
        error,
      );
      return failure({
        status: 502,
        message: 'Toutbox could not be reached to cancel the delivery order.',
      });
    }

    return mapCancelResponse(response, input);
  }
}

function mapCancelResponse(
  response: { status: number; body: unknown },
  input: CarrierCancelDeliveryOrderRequest,
): Result<CarrierCancelDeliveryOrderResponse, CarrierOperationError> {
  const envelope = response.body as ToutboxSuspendOrCancelEnvelope;

  // 200 = fully confirmed by the carrier; 202 = registered but the carrier
  // transmission itself failed (Toutbox's own "partial success"). Both are
  // driven by `payload.requestSucceeded`, not the status code alone.
  if (response.status === 200 || response.status === 202) {
    if (envelope.payload?.requestSucceeded === true) {
      // Toutbox only ever acknowledges that the cancellation request was
      // accepted — actual completion arrives later via the delivery-status
      // webhook, so this is never immediately CANCELLED.
      return success({ status: 'CANCELLING' });
    }

    const message =
      envelope.payload?.error ??
      envelope.payload?.responseMessage ??
      'Toutbox rejected the cancellation request.';
    Logger.warn('Toutbox rejected the cancellation request', {
      deliveryOrderId: input.id,
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
    deliveryOrderId: input.id,
    status: response.status,
    correlationId: getHookCorrelationId(),
  });
  return failure({ status: 502, message });
}
