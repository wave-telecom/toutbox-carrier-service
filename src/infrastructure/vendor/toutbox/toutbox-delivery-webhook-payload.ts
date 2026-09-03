import { z } from 'zod';

/**
 * Shape of one `entrega` in a Toutbox delivery-status webhook. `looseObject`
 * on purpose (both here and on the envelope): the webhook must silently
 * ignore fields it doesn't know about rather than reject the request.
 * `numeroPedido` is the one field that must be present — it's the
 * `DeliveryOrder.id` this entrega applies to.
 */
const toutboxDeliveryWebhookEntregaSchema = z.looseObject({
  numeroPedido: z.string().min(1),
  codOcorrencia: z.string(),
  descOcorrencia: z.string().optional(),
  codigoRastreio: z.string().nullish(),
  linkRastreio: z.string().nullish(),
  iccid: z.string().nullish(),
});

export const toutboxDeliveryWebhookBodySchema = z.looseObject({
  entregas: z.array(toutboxDeliveryWebhookEntregaSchema),
});

export type ToutboxDeliveryWebhookEntrega = z.infer<typeof toutboxDeliveryWebhookEntregaSchema>;
export type ToutboxDeliveryWebhookBody = z.infer<typeof toutboxDeliveryWebhookBodySchema>;
