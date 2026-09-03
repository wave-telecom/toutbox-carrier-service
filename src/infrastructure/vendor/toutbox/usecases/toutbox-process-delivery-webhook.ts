import { Logger, getHookCorrelationId, success, failure, type Result } from '@wave-tech/framework/core';
import { mapOccurrenceCode } from '../toutbox-occurrence-code.js';
import type {
  ToutboxDeliveryWebhookBody,
  ToutboxDeliveryWebhookEntrega,
} from '../toutbox-delivery-webhook-payload.js';
import type { WaveDeliveryApiHttpClient } from '../../wave-delivery-api/wave-delivery-api-http-client.js';
import type { CarrierOperationError } from '../../../../application/carrier-operation-error.js';

/**
 * Contract for processing a Toutbox delivery-status webhook. Declared as an
 * interface (same shape as `CarrierCreateDeliveryOrder`/
 * `CarrierCancelDeliveryOrder`) purely so `AppDeps` and route tests can
 * depend on it instead of the concrete class below — there's no cross-repo
 * contract to share here, unlike those two, so this stays in the same file
 * as its only implementation rather than under `application/`.
 */
export interface ProcessDeliveryWebhook {
  execute(payload: ToutboxDeliveryWebhookBody): Promise<Result<void, CarrierOperationError>>;
}

/**
 * Processes a Toutbox delivery-status webhook: translates each `entrega`
 * into a call to `wave-delivery-api` and applies it independently of the
 * others — one `entrega` failing doesn't stop the rest from being attempted.
 *
 * An unmapped `codOcorrencia` is *not* a failure: the webhook must accept
 * every code without rejecting it (Toutbox has no retry-on-4xx handling for
 * unrecognised codes), so those entries are logged and skipped. A genuine
 * failure to apply a *mapped* update (wave-delivery-api rejected the call, or
 * couldn't be reached) *is* a failure: it's returned so the route answers
 * with an error status, because Toutbox does retry the whole webhook on a
 * non-2xx response — silently swallowing it here would drop the update on
 * the floor with no way to recover it.
 */
export class ToutboxProcessDeliveryWebhook implements ProcessDeliveryWebhook {
  constructor(private readonly waveDeliveryApiClient: WaveDeliveryApiHttpClient) {}

  async execute(payload: ToutboxDeliveryWebhookBody): Promise<Result<void, CarrierOperationError>> {
    const failedOrders: string[] = [];
    for (const entrega of payload.entregas) {
      const ok = await this.processEntrega(entrega);
      if (!ok) {
        failedOrders.push(entrega.numeroPedido);
      }
    }

    if (failedOrders.length > 0) {
      return failure({
        status: 502,
        message: `Failed to apply the delivery status update on wave-delivery-api for: ${failedOrders.join(', ')}.`,
      });
    }
    return success(undefined);
  }

  /** Returns whether the entrega was applied (or deliberately skipped) successfully. */
  private async processEntrega(entrega: ToutboxDeliveryWebhookEntrega): Promise<boolean> {
    const status = mapOccurrenceCode(entrega.codOcorrencia);
    if (!status) {
      Logger.warn('Ignoring a Toutbox delivery webhook entry with an unmapped occurrence code', {
        numeroPedido: entrega.numeroPedido,
        codOcorrencia: entrega.codOcorrencia,
        descOcorrencia: entrega.descOcorrencia,
        correlationId: getHookCorrelationId(),
      });
      return true;
    }

    try {
      const response =
        status === 'CANCELLED'
          ? await this.waveDeliveryApiClient.post(
              `/private/delivery-orders/${entrega.numeroPedido}/cancelled`,
              undefined,
            )
          : await this.waveDeliveryApiClient.patch(
              `/delivery-orders/${entrega.numeroPedido}`,
              toUpdateBody(status, entrega),
            );

      if (response.status >= 400) {
        Logger.error('wave-delivery-api rejected a Toutbox delivery status update', {
          numeroPedido: entrega.numeroPedido,
          codOcorrencia: entrega.codOcorrencia,
          mappedStatus: status,
          responseStatus: response.status,
          responseBody: response.body,
          correlationId: getHookCorrelationId(),
        });
        return false;
      }
      return true;
    } catch (error) {
      Logger.error(
        'Failed to call wave-delivery-api with a Toutbox delivery status update',
        {
          numeroPedido: entrega.numeroPedido,
          codOcorrencia: entrega.codOcorrencia,
          mappedStatus: status,
          correlationId: getHookCorrelationId(),
        },
        error,
      );
      return false;
    }
  }
}

/**
 * Builds the `PATCH /delivery-orders/:id` body. `providerTrackingCode` and
 * `providerTrackingUrl` are only included when Toutbox actually sent a
 * value — wave-delivery-api treats an *absent* field as "leave it alone" but
 * an explicit `null` as "clear it", so a notification that happens not to
 * carry these must not accidentally wipe a value set by an earlier one.
 * `metadata.iccid` is included the same way, merged (not replaced) on the
 * wave-delivery-api side once present.
 */
function toUpdateBody(
  status: 'CREATED' | 'DELIVERED',
  entrega: ToutboxDeliveryWebhookEntrega,
): Record<string, unknown> {
  const body: Record<string, unknown> = { deliveryStatus: status };
  if (entrega.codigoRastreio != null) {
    body.providerTrackingCode = entrega.codigoRastreio;
  }
  if (entrega.linkRastreio != null) {
    body.providerTrackingUrl = entrega.linkRastreio;
  }
  if (entrega.iccid != null) {
    body.metadata = { iccid: entrega.iccid };
  }
  return body;
}
