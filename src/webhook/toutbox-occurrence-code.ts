/**
 * The delivery statuses a Toutbox webhook occurrence code can resolve to.
 * `CANCELLED` is meant to be handled separately from the others by whoever
 * processes the webhook — it typically completes via a dedicated
 * cancellation endpoint, not a generic status-update call the other two use.
 */
export type ToutboxOccurrenceStatus = 'CREATED' | 'DELIVERED' | 'CANCELLED';

/**
 * De<>Para between Toutbox's `codOcorrencia` and Wave's `DeliveryStatus`
 * (Manual de 01/07, "Ômega" project). Only the codes confirmed there are
 * listed — any other code is deliberately left unmapped: the webhook must
 * accept every `codOcorrencia` without rejecting it (return 200 regardless),
 * it just doesn't act on codes it doesn't recognise yet.
 */
export const TOUTBOX_OCCURRENCE_STATUS_MAP: Record<string, ToutboxOccurrenceStatus> = {
  '6': 'DELIVERED', // Entregue
  '91': 'CREATED', // Pedido Integrado
  '155': 'CANCELLED', // Entrega Cancelada
};

/** Resolves a `codOcorrencia` to its `DeliveryStatus`, or `undefined` if unmapped. */
export function mapOccurrenceCode(codOcorrencia: string): ToutboxOccurrenceStatus | undefined {
  return TOUTBOX_OCCURRENCE_STATUS_MAP[codOcorrencia];
}
