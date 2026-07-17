import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/connections/connection.repository', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('token-teste'),
}));

import { fetchStock, mapProduto } from '@/modules/providers/bling/stock';

function pagina(produtos: unknown[]): Response {
  return new Response(JSON.stringify({ data: produtos }), { status: 200 });
}

describe('mapProduto', () => {
  it('mapeia codigo→sku, nome e saldoVirtualTotal→saldo', () => {
    expect(
      mapProduto({ codigo: 'SKU-1', nome: 'Caneca', estoque: { saldoVirtualTotal: 12 } }),
    ).toEqual({ sku: 'SKU-1', nome: 'Caneca', saldo: 12 });
  });

  it('defaults seguros: sem codigo → sku undefined; sem estoque → saldo 0', () => {
    expect(mapProduto({ nome: 'X' })).toEqual({ sku: undefined, nome: 'X', saldo: 0 });
    expect(mapProduto({ codigo: 'A', nome: null, estoque: null })).toEqual({
      sku: 'A',
      nome: '',
      saldo: 0,
    });
  });
});

describe('fetchStock', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pagina até a página curta e concatena', async () => {
    // PAGE_SIZE=100: 1ª página cheia (100 itens) força a 2ª; 2ª curta encerra.
    const cheia = Array.from({ length: 100 }, (_, i) => ({
      codigo: `SKU-${i}`,
      nome: `P${i}`,
      estoque: { saldoVirtualTotal: i },
    }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(pagina(cheia))
      .mockResolvedValueOnce(pagina([{ codigo: 'FIM', nome: 'Fim', estoque: { saldoVirtualTotal: 1 } }]));
    vi.stubGlobal('fetch', fetchMock);

    const itens = await fetchStock('org-1');
    expect(itens).toHaveLength(101);
    expect(itens[100]).toEqual({ sku: 'FIM', nome: 'Fim', saldo: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 2ª chamada pede a página 2.
    expect(String(fetchMock.mock.calls[1]![0])).toContain('pagina=2');
  });

  it('página vazia na 1ª → lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(pagina([])));
    await expect(fetchStock('org-1')).resolves.toEqual([]);
  });
});
