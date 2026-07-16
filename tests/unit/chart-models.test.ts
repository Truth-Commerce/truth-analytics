import { describe, expect, it } from 'vitest';

import {
  divergingPrecoModel,
  evolucaoComparadaModel,
  mediaMovel,
  paretoModel,
  stackedAreaModel,
} from '@/components/ui/charts/chart-models';

describe('mediaMovel', () => {
  it('janela 7 com preenchimento parcial no início', () => {
    expect(mediaMovel([10, 20, 30], 7)).toEqual([10, 15, 20]);
  });
  it('janela cheia desliza', () => {
    expect(mediaMovel([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
  });
});

describe('evolucaoComparadaModel', () => {
  it('formata x como dd/MM e alinha o anterior por índice', () => {
    const r = evolucaoComparadaModel(
      [
        { data: '2026-06-01', total: 100 },
        { data: '2026-06-02', total: 200 },
      ],
      [{ data: '2026-05-01', total: 80 }],
    );
    expect(r).toEqual([
      { x: '01/06', atual: 100, media: 100, anterior: 80 },
      { x: '02/06', atual: 200, media: 150, anterior: null },
    ]);
  });
  it('sem anterior → anterior null em todas as linhas', () => {
    expect(evolucaoComparadaModel([{ data: '2026-06-01', total: 100 }], null)[0].anterior).toBeNull();
  });
});

describe('stackedAreaModel', () => {
  it('keys por receita total desc, linhas com 0 para canal ausente no dia', () => {
    const r = stackedAreaModel([
      { data: '2026-06-01', canais: { shopee: 100 } },
      { data: '2026-06-02', canais: { mercadolivre: 500, shopee: 50 } },
    ]);
    expect(r.keys).toEqual(['mercadolivre', 'shopee']);
    expect(r.rows).toEqual([
      { x: '01/06', mercadolivre: 0, shopee: 100 },
      { x: '02/06', mercadolivre: 500, shopee: 50 },
    ]);
  });
});

describe('paretoModel', () => {
  it('concatena A+B+C com label = sku (fallback nome) e respeita o cap', () => {
    const item = (sku: string, receita: number, pct: number) => ({ sku, nome: `N${sku}`, receita, pctAcumulado: pct });
    const r = paretoModel({ a: [item('A1', 800, 80)], b: [item('B1', 150, 95)], c: [item('', 50, 100)] }, 2);
    expect(r).toEqual([
      { label: 'A1', receita: 800, acumulado: 80 },
      { label: 'B1', receita: 150, acumulado: 95 },
    ]);
  });
});

describe('divergingPrecoModel', () => {
  it('Δ% = (nosso-mercado)/mercado, 1 casa, só comparáveis, desc', () => {
    const r = divergingPrecoModel([
      { sku: 'A', nome: 'A', nossoPreco: 110, precoMercadoMediano: 100 },
      { sku: 'B', nome: 'B', nossoPreco: 90, precoMercadoMediano: 100 },
      { sku: 'C', nome: 'C', nossoPreco: 0, precoMercadoMediano: 100 }, // sem venda — fora
      { sku: 'D', nome: 'D', nossoPreco: 50, precoMercadoMediano: 0 }, // sem mercado — fora
    ]);
    expect(r).toEqual([
      { label: 'A', deltaPct: 10 },
      { label: 'B', deltaPct: -10 },
    ]);
  });
});
