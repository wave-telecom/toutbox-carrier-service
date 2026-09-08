import { describe, expect, it, vi } from 'vitest';
import { ToutboxCreateDeliveryOrder } from './toutbox-create-delivery-order.js';
import type { ToutboxCreateOrderPayload } from './toutbox-create-order-payload.js';
import type { ToutboxHttpClient, ToutboxHttpResponse } from '../../toutbox-http-client.js';

function fakeClient(post: (path: string, body: unknown) => Promise<ToutboxHttpResponse>) {
  return { post, put: vi.fn() } as unknown as ToutboxHttpClient;
}

function validPayload(overrides: Partial<ToutboxCreateOrderPayload> = {}): ToutboxCreateOrderPayload {
  return {
    criacaoPedido: '2026-01-01T00:00:00.000Z',
    dataPagamento: '2026-01-01T00:00:00.000Z',
    numeroPedido: 'a1b2c3d4-0000-0000-0000-000000000001',
    numeroPedidoMarketplace: 'a1b2c3d4-0000-0000-0000-000000000001',
    numeroPedidoErp: 'a1b2c3d4-0000-0000-0000-000000000001',
    idsAuxiliares: [],
    numeroPedidoAux: null,
    marketplace: null,
    marca: null,
    seller: null,
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
            codigoRastreio: 'a1b2c3d400000000000000000000000101',
            idServico: '100',
            reversa: false,
            dispatch: false,
            alocacaoAutomatica: false,
            coleta: false,
          },
          destinatario: {
            nome: 'Ada Lovelace',
            cpfcnpj: '12345678900',
            telefone: '+5511999999999',
            email: '',
            empresa: null,
            endereco: 'Rua A',
            numero: '100',
            complemento: null,
            referencia: '',
            bairro: 'Centro',
            cidade: 'São Paulo',
            estado: 'SP',
            pais: 'Brasil',
            cep: '01000-000',
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
    ...overrides,
  };
}

describe('ToutboxCreateDeliveryOrder', () => {
  it('sends the exact payload it was given to POST /api/v1/External/Order', async () => {
    let sentPath: string | undefined;
    let sentBody: unknown;
    const payload = validPayload();
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async (path, body) => {
        sentPath = path;
        sentBody = body;
        return { status: 200, body: { results: 'OK', error: null, payload: {} } };
      }),
    );

    await useCase.execute(payload);

    expect(sentPath).toBe('/api/v1/External/Order');
    expect(sentBody).toBe(payload);
  });

  it('maps a 200 success response', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 200,
        body: { results: 'OK', error: null, payload: { numeroPedido: 'x', status: 'RECEBIDO' } },
      })),
    );

    const result = await useCase.execute(validPayload());

    expect(result.ok).toBe(true);
  });

  it('maps estimatedDelivery and slaDays from payload.pedido.itens[0].frete.transportadora when Toutbox sends them', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 200,
        body: {
          results: 'OK',
          error: null,
          payload: {
            numeroPedido: 'x',
            status: 'RECEBIDO',
            pedido: {
              itens: [
                { frete: { transportadora: { previsaoDeEntrega: '2026-09-10', prazoDiasUteis: 3 } } },
              ],
            },
          },
        },
      })),
    );

    const result = await useCase.execute(validPayload());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.estimatedDelivery).toBe('2026-09-10');
      expect(result.value.slaDays).toBe(3);
    }
  });

  it('leaves estimatedDelivery and slaDays null when Toutbox does not send payload.pedido', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 200,
        body: { results: 'OK', error: null, payload: { numeroPedido: 'x', status: 'RECEBIDO' } },
      })),
    );

    const result = await useCase.execute(validPayload());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.estimatedDelivery).toBeNull();
      expect(result.value.slaDays).toBeNull();
    }
  });

  it('still succeeds on a 201 with a dispatch-alert error attached', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 201,
        body: {
          results: 'OK',
          error: { message: 'despacho automático falhou' },
          payload: { numeroPedido: 'x', status: 'RECEBIDO_COM_ALERTA' },
        },
      })),
    );

    const result = await useCase.execute(validPayload());

    expect(result.ok).toBe(true);
  });

  it('passes a 400 through as-is', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 400,
        body: { results: 'ERR', error: { message: 'invalid' }, payload: null },
      })),
    );

    const result = await useCase.execute(validPayload());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(400);
  });

  it('passes a 409 through as-is', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status: 409,
        body: { results: 'ERR', error: { message: 'duplicate' }, payload: null },
      })),
    );

    const result = await useCase.execute(validPayload());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(409);
  });

  it.each([500, 401])('maps a %i status to a 502', async (status) => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => ({
        status,
        body: { results: 'ERR', error: { message: 'oops' }, payload: null },
      })),
    );

    const result = await useCase.execute(validPayload());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(502);
  });

  it('maps a network-level failure to a 502 without throwing', async () => {
    const useCase = new ToutboxCreateDeliveryOrder(
      fakeClient(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const result = await useCase.execute(validPayload());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.status).toBe(502);
  });
});
