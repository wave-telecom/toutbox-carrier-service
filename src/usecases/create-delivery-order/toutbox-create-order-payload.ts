export interface ToutboxOrderSalesChannel {
  id: string;
  nome: string;
  tipo: string;
}

export interface ToutboxOrderIntegrator {
  id: string;
  nome: string;
}

export interface ToutboxOrderProduct {
  descricao: string;
  altura: number;
  comprimento: number;
  largura: number;
  peso: number;
  preco: number;
  quantidade: number;
  sku: string | null;
  codigoProduto: string | null;
  numeroDeSerie: string | null;
  fabricante: string | null;
}

export interface ToutboxOrderCarrier {
  id: string;
  nome: string;
  nomeServico: string;
  codigoRastreio: string;
  idServico: string;
  reversa: boolean;
  dispatch: boolean;
  alocacaoAutomatica: boolean;
  coleta: boolean;
}

export interface ToutboxOrderRecipient {
  nome: string;
  cpfcnpj: string;
  telefone: string;
  email: string;
  empresa: string | null;
  endereco: string;
  numero: string;
  complemento: string | null;
  referencia: string;
  bairro: string;
  cidade: string;
  estado: string;
  pais: string;
  cep: string;
  ie: string | null;
  lat: string | null;
  long: string | null;
}

/** The shipment's sender — Toutbox's `remetente`. */
export interface ToutboxOrderSender {
  nome: string;
  loja: string | null;
  nomeCentroDistribuicao: string | null;
  codigoCentroDistribuicao: string | null;
  endereco: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  pais: string;
  cep: string;
  ie: string | null;
  cpfcnpj: string;
}

/** The shipment's billing party — Toutbox's `tomador`. */
export interface ToutboxOrderBillingParty {
  nome: string;
  endereco: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  pais: string;
  cep: string;
  ie: string | null;
  cpfcnpj: string;
}

export interface ToutboxOrderShipping {
  transportadora: ToutboxOrderCarrier;
  destinatario: ToutboxOrderRecipient;
  remetente: ToutboxOrderSender;
  tomador: ToutboxOrderBillingParty;
}

export interface ToutboxOrderItem {
  volumes: number;
  largura: number;
  peso: number;
  altura: number;
  comprimento: number;
  formato: string;
  produtos: ToutboxOrderProduct[];
  frete: ToutboxOrderShipping;
}

export interface ToutboxOrderAdditionalInfo {
  portabilidade: string;
  segmentoCliente: string;
  integrador: string;
  dispatch: string;
  geocode: boolean;
  geoAlocacao: boolean;
  alocacaoRange: boolean;
  tipoCliente: string | null;
  tipoMailing: string | null;
}

/**
 * The full wire body Toutbox's `POST /api/v1/External/Order` expects. Every
 * field this endpoint requires is a required field here — including the ones
 * that carry a caller's own sender/billing/sales-channel identity
 * (`canalDeVenda`, `frete.remetente`, `frete.tomador`, `frete.transportadora`)
 * — this library performs no mapping, defaulting, or business decision of its
 * own; it only knows Toutbox's own wire shape.
 */
export interface ToutboxCreateOrderPayload {
  criacaoPedido: string;
  dataPagamento: string;
  numeroPedido: string;
  numeroPedidoMarketplace: string;
  numeroPedidoErp: string;
  idsAuxiliares: unknown[];
  numeroPedidoAux: null;
  marketplace: null;
  marca: null;
  seller: null;
  canalDeVenda: ToutboxOrderSalesChannel;
  integrador: ToutboxOrderIntegrator;
  warehouse: null;
  unidadeDeNegocio: null;
  rede: null;
  campanha: null;
  itens: ToutboxOrderItem[];
  notaFiscal: null;
  infosAdicionais: ToutboxOrderAdditionalInfo;
}

/** The raw envelope Toutbox answers `POST /api/v1/External/Order` with. */
export interface ToutboxCreateOrderResponse {
  results: 'OK' | 'ERR';
  error: { message: string } | null;
  payload?: {
    numeroPedido?: string;
    status?: string;
    pedido?: {
      itens?: Array<{
        frete?: { transportadora?: { previsaoDeEntrega?: unknown; prazoDiasUteis?: unknown } };
      }>;
    };
  };
}

/**
 * The normalized outcome of a successful create-order call. Deliberately
 * doesn't echo back anything the caller already supplied in the payload
 * (e.g. the tracking code) — only what Toutbox itself decided.
 */
export interface ToutboxCreateOrderResult {
  estimatedDelivery: string | null;
  slaDays: number | null;
  raw: ToutboxCreateOrderResponse;
}
