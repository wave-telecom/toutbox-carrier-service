import type { ProviderUseCase } from '@wave-tech/framework/contracts';
import type {
  CarrierCancelDeliveryOrderRequest,
  CarrierCancelDeliveryOrderResponse,
} from '@wave-tech/framework/contracts';
import type { CarrierOperationError } from '../../carrier-operation-error.js';

/**
 * The cancel-delivery-order operation's contract type — see ADR 0000
 * (`tim-network-adapter`), decision C. Request/response come from the shared
 * framework package; the error channel is this repository's own
 * {@link CarrierOperationError}, never shared. No class, no logic here: the
 * real implementation lives in
 * `infrastructure/vendor/toutbox/usecases/toutbox-cancel-delivery-order.ts`.
 */
export type CarrierCancelDeliveryOrder = ProviderUseCase<
  CarrierCancelDeliveryOrderRequest,
  CarrierCancelDeliveryOrderResponse,
  CarrierOperationError
>;
