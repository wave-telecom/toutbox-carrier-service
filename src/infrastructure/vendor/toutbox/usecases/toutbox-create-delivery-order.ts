import {
  Logger,
  success,
  failure,
  getHookCorrelationId,
  type Result,
} from '@wave-tech/framework/core';
import type {
  CarrierCreateDeliveryOrderRequest,
  CarrierCreateDeliveryOrderResponse,
} from '@wave-tech/framework/contracts';
import type { CarrierOperationError } from '../../../../application/carrier-operation-error.js';
import type { CarrierCreateDeliveryOrder } from '../../../../application/use-cases/carrier-create-delivery-order/carrier-create-delivery-order.js';
import type { ToutboxHttpClient } from '../toutbox-http-client.js';

/** The only `resourceType` Toutbox's payload shape (fixed chip-logistics fields) supports today. */
const SUPPORTED_RESOURCE_TYPE = 'SIM';

/**
 * Implements {@link CarrierCreateDeliveryOrder} against Toutbox's own
 * `POST /api/v1/external/orders`. Owns the full Wave-shape <-> Toutbox-shape
 * translation — nothing about Toutbox's wire format leaks past this file.
 */
export class ToutboxCreateDeliveryOrder implements CarrierCreateDeliveryOrder {
  constructor(private readonly httpClient: ToutboxHttpClient) {}

  async execute(
    input: CarrierCreateDeliveryOrderRequest,
  ): Promise<Result<CarrierCreateDeliveryOrderResponse, CarrierOperationError>> {
    if (input.resourceType !== SUPPORTED_RESOURCE_TYPE) {
      return failure({
        status: 501,
        message: `Creating a delivery order for resourceType "${input.resourceType}" is not implemented; only "${SUPPORTED_RESOURCE_TYPE}" is supported.`,
      });
    }

    const trackingCode = toTrackingCode(input.id);
    const payload = toToutboxOrderPayload(input, trackingCode);

    let response;
    try {
      response = await this.httpClient.post('/api/v1/external/orders', payload);
    } catch (error) {
      Logger.error(
        'Toutbox order creation call failed',
        { deliveryOrderId: input.id, correlationId: getHookCorrelationId() },
        error,
      );
      return failure({
        status: 502,
        message: 'Toutbox could not be reached to create the delivery order.',
      });
    }

    return mapCreateResponse(response, input, trackingCode);
  }
}

interface ToutboxEnvelope {
  results: 'OK' | 'ERR';
  error: { message: string } | null;
  payload?: {
    pedido?: {
      itens?: Array<{
        previsaoDeEntrega?: unknown;
        frete?: { prazoDiasUteis?: unknown };
      }>;
    };
  };
}

function mapCreateResponse(
  response: { status: number; body: unknown },
  input: CarrierCreateDeliveryOrderRequest,
  trackingCode: string,
): Result<CarrierCreateDeliveryOrderResponse, CarrierOperationError> {
  const envelope = response.body as ToutboxEnvelope;

  if (response.status === 200 || response.status === 201) {
    if (envelope.error) {
      // "Pedido cadastrado, porém houve falha ao executar o despacho automático" —
      // the order was still created; log so the alert reaches TIM/the integrator.
      Logger.warn('Toutbox created the order with a dispatch/reversal alert', {
        deliveryOrderId: input.id,
        toutboxMessage: envelope.error.message,
        correlationId: getHookCorrelationId(),
      });
    }
    const item = envelope.payload?.pedido?.itens?.[0];
    return success({
      providerTrackingCode: trackingCode,
      // Toutbox has no tracking URL to offer at creation time — it only ever
      // arrives later, via the delivery-status webhook.
      providerTrackingUrl: null,
      estimatedDelivery: typeof item?.previsaoDeEntrega === 'string' ? item.previsaoDeEntrega : null,
      slaDays: typeof item?.frete?.prazoDiasUteis === 'number' ? item.frete.prazoDiasUteis : null,
      metadata: null,
    });
  }

  const message = envelope.error?.message ?? 'Toutbox rejected the order.';
  if (response.status === 400 || response.status === 409) {
    return failure({ status: response.status, message });
  }

  Logger.error('Toutbox order creation returned an unexpected status', {
    deliveryOrderId: input.id,
    status: response.status,
    correlationId: getHookCorrelationId(),
  });
  return failure({ status: 502, message });
}

/** `${id without dashes}01` — the rule the team agreed on for Toutbox's own tracking code. */
function toTrackingCode(deliveryOrderId: string): string {
  return `${deliveryOrderId.replaceAll('-', '')}01`;
}

/** Maps the shared Wave contract to Toutbox's own `POST /api/v1/external/orders` body shape. */
function toToutboxOrderPayload(input: CarrierCreateDeliveryOrderRequest, trackingCode: string) {
  return {
    criacaoPedido: new Date().toISOString(),
    dataPagamento: new Date().toISOString(),
    numeroPedido: input.id,
    numeroPedidoMarketplace: input.id,
    numeroPedidoErp: input.id,
    idsAuxiliares: [],
    numeroPedidoAux: null,
    marketplace: null,
    marca: null,
    seller: null,
    // TODO: canalDeVenda is hardcoded to a single sales channel — revisit once
    // this integration needs to distinguish between brokers/tenants.
    canalDeVenda: { id: '10', nome: 'ALERT BRASIL', tipo: 'Remote' },
    integrador: { id: 'WAVE', nome: 'Wave BMOB' },
    warehouse: null,
    unidadeDeNegocio: null,
    rede: null,
    campanha: null,
    itens: [
      {
        volumes: 1,
        largura: 10,
        peso: 1000,
        altura: 10,
        comprimento: 10,
        formato: 'BOX',
        produtos: [
          {
            descricao: 'NAKED',
            altura: 10,
            comprimento: 10,
            largura: 0,
            peso: 1000,
            preco: 5,
            quantidade: 1,
            sku: null,
            codigoProduto: null,
            numeroDeSerie: null,
            fabricante: null,
          },
        ],
        frete: {
          transportadora: {
            id: '122',
            nome: 'TIM',
            nomeServico: 'Chip Express',
            codigoRastreio: trackingCode,
            idServico: '100',
            reversa: false,
            dispatch: false,
            alocacaoAutomatica: false,
            coleta: false,
          },
          destinatario: {
            nome: input.recipient.name,
            cpfcnpj: input.recipient.document,
            telefone: input.recipient.phone,
            email: '',
            empresa: null,
            endereco: input.recipient.addressStreet,
            numero: input.recipient.addressNumber,
            complemento: input.recipient.addressComplement,
            referencia: '',
            bairro: input.recipient.addressNeighborhood,
            cidade: input.recipient.addressCity,
            estado: input.recipient.addressState,
            pais: 'Brasil',
            cep: input.recipient.addressZipCode,
            ie: null,
            lat: null,
            long: null,
          },
          remetente: {
            nome: 'CD - TIM',
            loja: null,
            nomeCentroDistribuicao: 'CD TIM',
            codigoCentroDistribuicao: 'CD TIM',
            endereco: 'AV. Joao Cabral de Melo Neto',
            numero: '850',
            complemento: null,
            bairro: 'Barra da Tijuca',
            cidade: 'Rio de Janeiro',
            estado: 'RJ',
            pais: 'Brasil',
            cep: '22775057',
            ie: null,
            cpfcnpj: '02421421012713',
          },
          tomador: {
            nome: 'TIM Brasil SA',
            endereco: 'AV. Joao Cabral de Melo Neto',
            numero: '850',
            complemento: null,
            bairro: 'Barra da Tijuca',
            cidade: 'Rio de Janeiro',
            estado: 'RJ',
            pais: 'Brasil',
            cep: '22775057',
            ie: null,
            cpfcnpj: '02421421012713',
          },
        },
      },
    ],
    notaFiscal: null,
    infosAdicionais: {
      portabilidade: 'True',
      segmentoCliente: 'Controle',
      integrador: 'WAVE',
      dispatch: 'automatic',
      geocode: true,
      geoAlocacao: true,
      alocacaoRange: true,
      tipoCliente: null,
      tipoMailing: null,
    },
  };
}

