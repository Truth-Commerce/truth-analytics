import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchOrderDetail } from '@/modules/providers/bling/order-detail';

/** Payload real capturado de GET /pedidos/vendas/26409406052 (Farmacia Sao Geraldo). */
const DETALHE_REAL = {
  data: {
    id: 26409406052,
    numero: 3549,
    total: 10.9,
    loja: { id: 205976832 },
    itens: [
      {
        id: 19746541776,
        codigo: '11034',
        unidade: 'UN',
        quantidade: 1,
        valor: 10.9,
        descricao: 'VIOLETA GENCIANA 30ML UNIPHAR',
      },
    ],
    transporte: { fretePorConta: 0, frete: 12.5, quantidadeVolumes: 1 },
    taxas: { taxaComissao: 6.18, custoFrete: 0, valorBase: 10.9 },
  },
};

function resposta(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('fetchOrderDetail', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('extrai itens, frete e comissao do payload real', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string | URL) =>
        Promise.resolve(
          String(url).includes('/canais-venda')
            ? resposta({ data: [{ id: 205976832, descricao: 'Shopee' }] })
            : resposta(DETALHE_REAL),
        ),
      ),
    );

    const detalhe = await fetchOrderDetail('org-1', '26409406052', 'token');

    expect(detalhe.itens).toEqual([
      { sku: '11034', nome: 'VIOLETA GENCIANA 30ML UNIPHAR', quantidade: 1, valor: 10.9 },
    ]);
    expect(detalhe.frete).toBe(12.5);
    expect(detalhe.comissao).toBe(6.18);
    expect(detalhe.canal).toBe('Shopee');
  });

  it('pedido sem itens/transporte/taxas devolve zeros em vez de NaN', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({ data: { id: 1 } })));

    const detalhe = await fetchOrderDetail('org-1', '1', 'token');

    expect(detalhe.itens).toEqual([]);
    expect(detalhe.frete).toBe(0);
    expect(detalhe.comissao).toBe(0);
    expect(detalhe.canal).toBeUndefined();
  });

  it('valores como string (o Bling alterna) viram number', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        resposta({
          data: {
            itens: [{ codigo: 'A', descricao: 'X', quantidade: '3', valor: '9.90' }],
            transporte: { frete: '7.00' },
            taxas: { taxaComissao: '1.23' },
          },
        }),
      ),
    );

    const detalhe = await fetchOrderDetail('org-1', '1', 'token');

    expect(detalhe.itens[0]).toEqual({ sku: 'A', nome: 'X', quantidade: 3, valor: 9.9 });
    expect(detalhe.frete).toBe(7);
    expect(detalhe.comissao).toBe(1.23);
  });

  it('valor nao numerico vira 0, nunca NaN (NaN corromperia a metrica)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        resposta({ data: { transporte: { frete: 'gratis' }, taxas: { taxaComissao: '-' } } }),
      ),
    );

    const detalhe = await fetchOrderDetail('org-1', '1', 'token');

    expect(detalhe.frete).toBe(0);
    expect(detalhe.comissao).toBe(0);
  });

  it('resposta sem data lanca bling_detalhe_vazio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(resposta({})));
    await expect(fetchOrderDetail('org-1', '1', 'token')).rejects.toThrow('bling_detalhe_vazio');
  });

  it('escapa o id na URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(resposta(DETALHE_REAL));
    vi.stubGlobal('fetch', fetchMock);

    await fetchOrderDetail('org-1', 'a/b', 'token');

    expect(String(fetchMock.mock.calls[0][0])).toContain('/pedidos/vendas/a%2Fb');
  });
});
