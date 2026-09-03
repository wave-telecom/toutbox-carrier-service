import type { ProviderUseCase } from '@wave-tech/framework/contracts';
import type {
  CarrierCreateDeliveryOrderRequest,
  CarrierCreateDeliveryOrderResponse,
} from '@wave-tech/framework/contracts';
import type { CarrierOperationError } from '../../carrier-operation-error.js';

/**
 * The create-delivery-order operation's contract type — see ADR 0000
 * (`tim-network-adapter`), decision C. Request/response come from the shared
 * framework package; the error channel is this repository's own
 * {@link CarrierOperationError}, never shared. No class, no logic here: the
 * real implementation lives in
 * `infrastructure/vendor/toutbox/usecases/toutbox-create-delivery-order.ts`.
 */
export type CarrierCreateDeliveryOrder = ProviderUseCase<
  CarrierCreateDeliveryOrderRequest,
  CarrierCreateDeliveryOrderResponse,
  CarrierOperationError
>;
