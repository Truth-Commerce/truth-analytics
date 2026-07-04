import { describe, expect, it } from 'vitest';

import {
  evolucao,
  medianaPreco,
  posicaoPreco,
  ticketMedio,
  topProdutos,
  vendasPorCanal,
  type OrderRow,
  type ProductRow,
  type SnapshotRow,
} from '@/modules/pipeline/steps/compute-metrics';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeOrder(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    canal: 'loja',
    data: new Date('2024-01-15T12:00:00Z'),
    valor_total: 100,
    itens: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ticketMedio
// ---------------------------------------------------------------------------

describe('ticketMedio', () => {
  it('retorna 0 para lista vazia', () => {
    expect(ticketMedio([])).toBe(0);
  });

  it('retorna o próprio valor para 1 pedido', () => {
    expect(ticketMedio([makeOrder({ valor_total: 150 })])).toBe(150);
  });

  it('calcula a média correta para N pedidos', () => {
    const orders: OrderRow[] = [
      makeOrder({ valor_total: 100 }),
      makeOrder({ valor_total: 200 }),
      makeOrder({ valor_total: 300 }),
    ];
    expect(ticketMedio(orders)).toBe(200);
  });

  it('arredonda para 2 casas decimais', () => {
    const orders: OrderRow[] = [
      makeOrder({ valor_total: 100 }),
      makeOrder({ valor_total: 200 }),
    ];
    // (100+200)/2 = 150 — exact
    expect(ticketMedio(orders)).toBe(150);

    // (100+101)/3 não é inteiro — round2
    const orders2: OrderRow[] = [
      makeOrder({ valor_total: 100 }),
      makeOrder({ valor_total: 101 }),
      makeOrder({ valor_total: 102 }),
    ];
    // 303/3 = 101 — exact
    expect(ticketMedio(orders2)).toBe(101);
  });

  it('arredonda resultado com casas decimais não-exatas', () => {
    const orders: OrderRow[] = [
      makeOrder({ valor_total: 10 }),
      makeOrder({ valor_total: 10 }),
      makeOrder({ valor_total: 11 }),
    ];
    // 31/3 = 10.333... → 10.33
    expect(ticketMedio(orders)).toBe(10.33);
  });
});

// ---------------------------------------------------------------------------
// topProdutos
// ---------------------------------------------------------------------------

describe('topProdutos', () => {
  it('retorna lista vazia sem pedidos', () => {
    expect(topProdutos([])).toEqual([]);
  });

  it('retorna lista vazia para pedidos sem itens', () => {
    expect(topProdutos([makeOrder({ itens: [] })])).toEqual([]);
  });

  it('soma quantidade e receita de itens com o mesmo sku em pedidos diferentes', () => {
    const orders: OrderRow[] = [
      makeOrder({
        itens: [{ sku: 'SKU-A', nome: 'Produto A', quantidade: 2, valor: 50 }],
      }),
      makeOrder({
        itens: [{ sku: 'SKU-A', nome: 'Produto A', quantidade: 3, valor: 50 }],
      }),
    ];
    const result = topProdutos(orders);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ nome: 'Produto A', sku: 'SKU-A', quantidade: 5, receita: 250 });
  });

  it('ordena por receita desc', () => {
    const orders: OrderRow[] = [
      makeOrder({
        itens: [
          { sku: 'SKU-B', nome: 'Produto B', quantidade: 1, valor: 10 },
          { sku: 'SKU-A', nome: 'Produto A', quantidade: 5, valor: 20 },
        ],
      }),
    ];
    const result = topProdutos(orders);
    expect(result[0].sku).toBe('SKU-A'); // receita=100
    expect(result[1].sku).toBe('SKU-B'); // receita=10
  });

  it('usa sku vazio como fallback quando sku é undefined, agrupa por nome', () => {
    const orders: OrderRow[] = [
      makeOrder({
        itens: [
          { nome: 'Sem SKU', quantidade: 2, valor: 30 },
          { nome: 'Sem SKU', quantidade: 1, valor: 30 },
        ],
      }),
    ];
    const result = topProdutos(orders);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ nome: 'Sem SKU', sku: '', quantidade: 3, receita: 90 });
  });

  it('não mistura produto sem sku com produto de sku diferente de mesmo nome', () => {
    const orders: OrderRow[] = [
      makeOrder({
        itens: [
          { sku: 'SKU-X', nome: 'Produto X', quantidade: 1, valor: 100 },
          { nome: 'Produto X', quantidade: 2, valor: 50 },
        ],
      }),
    ];
    const result = topProdutos(orders);
    // SKU-X e '' são chaves diferentes
    expect(result).toHaveLength(2);
    const comSku = result.find((r) => r.sku === 'SKU-X');
    const semSku = result.find((r) => r.sku === '');
    expect(comSku?.receita).toBe(100);
    expect(semSku?.receita).toBe(100);
  });

  it('cap em 10 produtos', () => {
    const itens = Array.from({ length: 15 }, (_, i) => ({
      sku: `SKU-${i}`,
      nome: `Produto ${i}`,
      quantidade: 1,
      valor: 100 - i, // descending so order is stable
    }));
    const orders: OrderRow[] = [makeOrder({ itens })];
    const result = topProdutos(orders);
    expect(result).toHaveLength(10);
    // First must be highest receita
    expect(result[0].sku).toBe('SKU-0');
  });

  it('tie-break por nome asc quando receitas iguais', () => {
    const orders: OrderRow[] = [
      makeOrder({
        itens: [
          { sku: 'SKU-Z', nome: 'Zebra', quantidade: 1, valor: 50 },
          { sku: 'SKU-A', nome: 'Abacate', quantidade: 1, valor: 50 },
        ],
      }),
    ];
    const result = topProdutos(orders);
    expect(result[0].sku).toBe('SKU-A');
    expect(result[1].sku).toBe('SKU-Z');
  });
});

// ---------------------------------------------------------------------------
// medianaPreco
// ---------------------------------------------------------------------------

describe('medianaPreco', () => {
  it('retorna 0 para lista vazia', () => {
    expect(medianaPreco([])).toBe(0);
  });

  it('retorna o único elemento para lista de 1', () => {
    expect(medianaPreco([42])).toBe(42);
  });

  it('retorna o elemento do meio para lista ímpar', () => {
    expect(medianaPreco([1, 5, 3])).toBe(3);
    expect(medianaPreco([10, 30, 20])).toBe(20);
  });

  it('retorna a média dos dois do meio para lista par', () => {
    expect(medianaPreco([1, 2, 3, 4])).toBe(2.5);
    expect(medianaPreco([10, 20])).toBe(15);
    expect(medianaPreco([100, 200, 300, 400])).toBe(250);
  });

  it('funciona com lista não-ordenada', () => {
    expect(medianaPreco([50, 10, 30])).toBe(30);
    expect(medianaPreco([40, 10, 30, 20])).toBe(25);
  });

  it('arredonda para 2 casas (lista par)', () => {
    // (1 + 2) / 2 = 1.5 — exact; (1 + 4) / 2 = 2.5 — exact
    expect(medianaPreco([1, 4])).toBe(2.5);
    // (3 + 4) / 2 = 3.5
    expect(medianaPreco([4, 3])).toBe(3.5);
  });
});

// ---------------------------------------------------------------------------
// vendasPorCanal
// ---------------------------------------------------------------------------

describe('vendasPorCanal', () => {
  it('retorna lista vazia sem pedidos', () => {
    expect(vendasPorCanal([])).toEqual([]);
  });

  it('agrupa e soma por canal', () => {
    const orders: OrderRow[] = [
      makeOrder({ canal: 'bling', valor_total: 100 }),
      makeOrder({ canal: 'bling', valor_total: 200 }),
      makeOrder({ canal: 'shopee', valor_total: 50 }),
    ];
    const result = vendasPorCanal(orders);
    const bling = result.find((r) => r.canal === 'bling');
    const shopee = result.find((r) => r.canal === 'shopee');
    expect(bling).toEqual({ canal: 'bling', total: 300, pedidos: 2 });
    expect(shopee).toEqual({ canal: 'shopee', total: 50, pedidos: 1 });
  });

  it('ordena por total desc', () => {
    const orders: OrderRow[] = [
      makeOrder({ canal: 'a', valor_total: 50 }),
      makeOrder({ canal: 'b', valor_total: 200 }),
      makeOrder({ canal: 'c', valor_total: 100 }),
    ];
    const result = vendasPorCanal(orders);
    expect(result[0].canal).toBe('b');
    expect(result[1].canal).toBe('c');
    expect(result[2].canal).toBe('a');
  });

  it('tie-break por canal asc quando totais iguais', () => {
    const orders: OrderRow[] = [
      makeOrder({ canal: 'z_canal', valor_total: 100 }),
      makeOrder({ canal: 'a_canal', valor_total: 100 }),
    ];
    const result = vendasPorCanal(orders);
    expect(result[0].canal).toBe('a_canal');
    expect(result[1].canal).toBe('z_canal');
  });

  it('conta pedidos corretamente', () => {
    const orders: OrderRow[] = [
      makeOrder({ canal: 'ml', valor_total: 10 }),
      makeOrder({ canal: 'ml', valor_total: 20 }),
      makeOrder({ canal: 'ml', valor_total: 30 }),
    ];
    const result = vendasPorCanal(orders);
    expect(result[0].pedidos).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// evolucao
// ---------------------------------------------------------------------------

describe('evolucao', () => {
  it('retorna lista vazia sem pedidos', () => {
    expect(evolucao([])).toEqual([]);
  });

  it('agrupa por dia UTC e soma totais', () => {
    const orders: OrderRow[] = [
      makeOrder({ data: new Date('2024-01-10T00:00:00Z'), valor_total: 100 }),
      makeOrder({ data: new Date('2024-01-10T23:59:59Z'), valor_total: 50 }),
      makeOrder({ data: new Date('2024-01-11T12:00:00Z'), valor_total: 200 }),
    ];
    const result = evolucao(orders);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ data: '2024-01-10', total: 150 });
    expect(result[1]).toEqual({ data: '2024-01-11', total: 200 });
  });

  it('ordena ascendente por data string', () => {
    const orders: OrderRow[] = [
      makeOrder({ data: new Date('2024-01-15T00:00:00Z'), valor_total: 300 }),
      makeOrder({ data: new Date('2024-01-01T00:00:00Z'), valor_total: 100 }),
      makeOrder({ data: new Date('2024-01-08T00:00:00Z'), valor_total: 200 }),
    ];
    const result = evolucao(orders);
    expect(result[0].data).toBe('2024-01-01');
    expect(result[1].data).toBe('2024-01-08');
    expect(result[2].data).toBe('2024-01-15');
  });

  it('usa data UTC (não local) para agrupar — borda de meia-noite', () => {
    // These two times are the same UTC day
    const orders: OrderRow[] = [
      makeOrder({ data: new Date('2024-03-01T00:00:00Z'), valor_total: 10 }),
      makeOrder({ data: new Date('2024-03-01T23:00:00Z'), valor_total: 20 }),
    ];
    const result = evolucao(orders);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ data: '2024-03-01', total: 30 });
  });

  it('data field é string YYYY-MM-DD com min(1)', () => {
    const orders: OrderRow[] = [makeOrder({ data: new Date('2024-06-24T00:00:00Z') })];
    const result = evolucao(orders);
    expect(result[0].data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// posicaoPreco
// ---------------------------------------------------------------------------

describe('posicaoPreco', () => {
  const makeProduct = (overrides: Partial<ProductRow> = {}): ProductRow => ({
    nome: 'Produto Teste',
    sku: 'SKU-T',
    keywords: ['keyword-t'],
    ativo: true,
    ...overrides,
  });

  const makeSnapshot = (overrides: Partial<SnapshotRow> = {}): SnapshotRow => ({
    fonte: 'serpapi',
    keyword: 'keyword-t',
    dados: { precos: [100, 200] },
    ...overrides,
  });

  it('retorna lista vazia sem produtos', () => {
    expect(posicaoPreco([], [], [])).toEqual([]);
  });

  it('ignora produtos sem sku', () => {
    const p: ProductRow = makeProduct({ sku: null });
    expect(posicaoPreco([p], [], [])).toEqual([]);
  });

  it('ignora produtos inativos', () => {
    const p: ProductRow = makeProduct({ ativo: false });
    expect(posicaoPreco([p], [], [])).toEqual([]);
  });

  it('emite produto com sku mas sem snapshots (precoMercadoMediano=0, fonte="")', () => {
    const p: ProductRow = makeProduct({ sku: 'SKU-X', keywords: ['kw-x'] });
    const result = posicaoPreco([p], [], []);
    expect(result).toHaveLength(1);
    expect(result[0].precoMercadoMediano).toBe(0);
    expect(result[0].fonte).toBe('');
    expect(result[0].nossoPreco).toBe(0);
  });

  it('calcula nossoPreco como média dos valor de itens com esse sku', () => {
    const p: ProductRow = makeProduct({ sku: 'SKU-A' });
    const orders: OrderRow[] = [
      makeOrder({ itens: [{ sku: 'SKU-A', nome: 'A', quantidade: 1, valor: 100 }] }),
      makeOrder({ itens: [{ sku: 'SKU-A', nome: 'A', quantidade: 2, valor: 200 }] }),
    ];
    const result = posicaoPreco([p], [], orders);
    // unit prices = [100, 200] → avg = 150
    expect(result[0].nossoPreco).toBe(150);
  });

  it('ignora itens de outros skus ao calcular nossoPreco', () => {
    const p: ProductRow = makeProduct({ sku: 'SKU-A' });
    const orders: OrderRow[] = [
      makeOrder({
        itens: [
          { sku: 'SKU-A', nome: 'A', quantidade: 1, valor: 50 },
          { sku: 'SKU-B', nome: 'B', quantidade: 1, valor: 1000 },
        ],
      }),
    ];
    const result = posicaoPreco([p], [], orders);
    expect(result[0].nossoPreco).toBe(50);
  });

  it('calcula precoMercadoMediano via keyword mapping', () => {
    const p: ProductRow = makeProduct({ sku: 'SKU-A', keywords: ['kw-a'] });
    const snaps: SnapshotRow[] = [
      makeSnapshot({ keyword: 'kw-a', dados: { precos: [100, 200, 300] } }),
    ];
    const result = posicaoPreco([p], snaps, []);
    expect(result[0].precoMercadoMediano).toBe(200);
  });

  it('agrega precos de múltiplas keywords', () => {
    const p: ProductRow = makeProduct({ sku: 'SKU-M', keywords: ['kw-1', 'kw-2'] });
    const snaps: SnapshotRow[] = [
      makeSnapshot({ keyword: 'kw-1', dados: { precos: [10, 20] } }),
      makeSnapshot({ keyword: 'kw-2', dados: { precos: [30, 40] } }),
    ];
    // all precos: [10,20,30,40] → sorted: [10,20,30,40] → median = (20+30)/2 = 25
    const result = posicaoPreco([p], snaps, []);
    expect(result[0].precoMercadoMediano).toBe(25);
  });

  it('fonte predominante = mais frequente; tie-break asc', () => {
    const p: ProductRow = makeProduct({ sku: 'SKU-F', keywords: ['kw-f'] });
    const snaps: SnapshotRow[] = [
      makeSnapshot({ keyword: 'kw-f', fonte: 'serpapi', dados: { precos: [100] } }),
      makeSnapshot({ keyword: 'kw-f', fonte: 'serpapi', dados: { precos: [110] } }),
      makeSnapshot({ keyword: 'kw-f', fonte: 'ml_publico', dados: { precos: [90] } }),
    ];
    const result = posicaoPreco([p], snaps, []);
    expect(result[0].fonte).toBe('serpapi');
  });

  it('fonte tie-break alfabético asc', () => {
    const p: ProductRow = makeProduct({ sku: 'SKU-T', keywords: ['kw-t'] });
    const snaps: SnapshotRow[] = [
      makeSnapshot({ keyword: 'kw-t', fonte: 'serpapi', dados: { precos: [100] } }),
      makeSnapshot({ keyword: 'kw-t', fonte: 'ml_publico', dados: { precos: [90] } }),
    ];
    const result = posicaoPreco([p], snaps, []);
    // tie: both 1 snapshot → 'ml_publico' < 'serpapi'
    expect(result[0].fonte).toBe('ml_publico');
  });

  it('não usa snapshots de keywords fora do produto', () => {
    const p: ProductRow = makeProduct({ sku: 'SKU-X', keywords: ['kw-x'] });
    const snaps: SnapshotRow[] = [
      makeSnapshot({ keyword: 'kw-other', dados: { precos: [999] } }),
    ];
    const result = posicaoPreco([p], snaps, []);
    expect(result[0].precoMercadoMediano).toBe(0);
    expect(result[0].fonte).toBe('');
  });

  it('ordena resultado por sku asc', () => {
    const products: ProductRow[] = [
      makeProduct({ sku: 'SKU-Z', nome: 'Z', keywords: [] }),
      makeProduct({ sku: 'SKU-A', nome: 'A', keywords: [] }),
    ];
    const result = posicaoPreco(products, [], []);
    expect(result[0].sku).toBe('SKU-A');
    expect(result[1].sku).toBe('SKU-Z');
  });

  it('ignora itens sem sku ao calcular nossoPreco', () => {
    const p: ProductRow = makeProduct({ sku: 'SKU-A' });
    const orders: OrderRow[] = [
      makeOrder({
        itens: [
          { nome: 'Sem SKU', quantidade: 1, valor: 9999 }, // no sku
          { sku: 'SKU-A', nome: 'A', quantidade: 1, valor: 80 },
        ],
      }),
    ];
    const result = posicaoPreco([p], [], orders);
    expect(result[0].nossoPreco).toBe(80);
  });
});
