// Transport
export { ToutboxHttpClient } from './toutbox-http-client.js';
export type { ToutboxHttpResponse } from './toutbox-http-client.js';

// Error
export type { ToutboxOperationError } from './toutbox-operation-error.js';

// Create delivery order
export { ToutboxCreateDeliveryOrder } from './usecases/create-delivery-order/toutbox-create-delivery-order.js';
export type {
  ToutboxCreateOrderPayload,
  ToutboxCreateOrderResponse,
  ToutboxCreateOrderResult,
  ToutboxOrderSalesChannel,
  ToutboxOrderIntegrator,
  ToutboxOrderProduct,
  ToutboxOrderCarrier,
  ToutboxOrderRecipient,
  ToutboxOrderSender,
  ToutboxOrderBillingParty,
  ToutboxOrderShipping,
  ToutboxOrderItem,
  ToutboxOrderAdditionalInfo,
} from './usecases/create-delivery-order/toutbox-create-order-payload.js';

// Cancel delivery order
export { ToutboxCancelDeliveryOrder } from './usecases/cancel-delivery-order/toutbox-cancel-delivery-order.js';
export type {
  ToutboxCancelOrderResponse,
  ToutboxCancelOrderResult,
} from './usecases/cancel-delivery-order/toutbox-cancel-delivery-order.js';

// Quote shipping
export { ToutboxQuoteShipping } from './usecases/quote-shipping/toutbox-quote-shipping.js';
export type {
  ToutboxQuoteProduct,
  ToutboxQuoteRequest,
  ToutboxQuoteResponse,
  ToutboxQuoteResult,
} from './usecases/quote-shipping/toutbox-quote-shipping.js';

// Delivery-status webhook — schema/types and reference data only, no
// orchestration: calling back into a consuming BSS module is the caller's
// concern, not this library's.
export {
  toutboxDeliveryWebhookBodySchema,
} from './webhook/toutbox-delivery-webhook-payload.js';
export type {
  ToutboxDeliveryWebhookBody,
  ToutboxDeliveryWebhookDelivery,
} from './webhook/toutbox-delivery-webhook-payload.js';
export { mapOccurrenceCode, TOUTBOX_OCCURRENCE_STATUS_MAP } from './webhook/toutbox-occurrence-code.js';
export type { ToutboxOccurrenceStatus } from './webhook/toutbox-occurrence-code.js';
