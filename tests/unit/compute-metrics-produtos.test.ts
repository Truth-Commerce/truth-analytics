import { describe, expect, it } from 'vitest';

import {
  agregarProdutos,
  curvaAbc,
  faixaMercado,
  freteStats,
  itensPorPedido,
  percentil,
  pioresProdutos,
  unidadesTotais,
  type OrderRow,
  type ProductRow,
  type SnapshotRow,
} from '@/modules/pipeline/steps/compute-metrics';

function pedidoComItens(itens: { sku: string; valor: number; quantidade: number }[], frete = 0): OrderRow {
  return {
    canal: 'shopee',
    data: new Date('2026-06-01T10:00:00Z'),
    valor_total: itens.reduce((a, i) => a + i.valor * i.quantidade, 0),
    frete,
    itens: itens.map((i) => ({ sku: i.sku, nome: `Produto ${i.sku}`, quantidade: i.quantidade, valor: i.valor })),
  };
}

// Receitas: A1=800, B1=150, C1=30, C2=20 → total 1000
const ORDERS: OrderRow[] = [
  pedidoComItens([{ sku: 'A1', valor: 80, quantidade: 10 }], 30),
  pedidoComItens(
    [
      { sku: 'B1', valor: 50, quantidade: 3 },
      { sku: 'C1', valor: 30, quantidade: 1 },
      { sku: 'C2', valor: 20, quantidade: 1 },
    ],
    20,
  ),
];

describe('curvaAbc', () => {
  it('classifica A≤80, B≤95, C resto e calcula concentração top 3', () => {
    const r = curvaAbc(ORDERS);
    expect(r?.a.map((p) => p.sku)).toEqual(['A1']); // 80% acumulado
    expect(r?.b.map((p) => p.sku)).toEqual(['B1']); // 95%
    expect(r?.c.map((p) => p.sku)).toEqual(['C1', 'C2']);
    expect(r?.a[0]).toEqual({ sku: 'A1', nome: 'Produto A1', receita: 800, pctAcumulado: 80 });
    expect(r?.concentracaoTop3Pct).toBe(98); // (800+150+30)/1000
  });

  it('primeiro produto sempre classe A mesmo acima de 80%', () => {
    const r = curvaAbc([pedidoComItens([{ sku: 'X', valor: 100, quantidade: 1 }])]);
    expect(r?.a).toHaveLength(1);
    expect(r?.a[0].pctAcumulado).toBe(100);
  });

  it('sem produtos com receita → undefined', () => {
    expect(curvaAbc([])).toBeUndefined();
  });
});

describe('pioresProdutos', () => {
  it('bottom 5 com venda > 0, pior primeiro (receita asc)', () => {
    expect(pioresProdutos(ORDERS).map((p) => p.sku)).toEqual(['C2', 'C1', 'B1', 'A1']);
    expect(pioresProdutos(ORDERS)[0]).toEqual({ sku: 'C2', nome: 'Produto C2', receita: 20, quantidade: 1 });
  });
});

describe('freteStats', () => {
  it('médio, % sobre receita e por canal', () => {
    const r = freteStats(ORDERS);
    expect(r?.freteMedio).toBe(25); // (30+20)/2
    expect(r?.pctFreteSobreReceita).toBe(5); // 50/1000
    expect(r?.fretePorCanal).toEqual([{ canal: 'shopee', freteMedio: 25, freteTotal: 50 }]);
  });

  it('0 pedidos → undefined', () => {
    expect(freteStats([])).toBeUndefined();
  });
});

describe('unidades e itens por pedido', () => {
  it('soma quantidades e divide por pedidos', () => {
    expect(unidadesTotais(ORDERS)).toBe(15); // 10 + 3 + 1 + 1
    expect(itensPorPedido(ORDERS)).toBe(7.5);
    expect(itensPorPedido([])).toBe(0);
  });
});

describe('percentil (interpolação linear)', () => {
  it('valores de tabela', () => {
    expect(percentil([10, 20, 30, 40], 0)).toBe(10);
    expect(percentil([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(percentil([10, 20, 30, 40], 0.5)).toBe(25); // = medianaPreco de lista par
    expect(percentil([10, 20, 30, 40], 1)).toBe(40);
    expect(percentil([], 0.5)).toBe(0);
  });
});

describe('faixaMercado', () => {
  const products: ProductRow[] = [
    { nome: 'Caneca', sku: 'CAN-1', keywords: ['caneca'], ativo: true },
    { nome: 'Sem mercado', sku: 'SEM-1', keywords: ['nada'], ativo: true },
  ];
  const snapshots: SnapshotRow[] = [
    { fonte: 'ml_publico', keyword: 'caneca', dados: { precos: [10, 20, 30, 40] } },
  ];

  it('min/p25/mediana/p75 + fonte predominante; produto sem snapshot é omitido', () => {
    expect(faixaMercado(products, snapshots)).toEqual([
      { sku: 'CAN-1', nome: 'Caneca', min: 10, p25: 17.5, mediana: 25, p75: 32.5, fonte: 'ml_publico' },
    ]);
  });
});

describe('agregarProdutos (compat com topProdutos)', () => {
  it('ordena receita desc sem cap', () => {
    expect(agregarProdutos(ORDERS).map((p) => p.sku)).toEqual(['A1', 'B1', 'C1', 'C2']);
  });
});
