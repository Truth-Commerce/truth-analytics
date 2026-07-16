import { describe, expect, it } from 'vitest';

import type { Metricas } from '@/modules/pipeline/contracts';
import { compararMetricas, compararTopProdutos, leituraComparacao } from '@/modules/reports/compare';

function metricas(
  canais: { canal: string; total: number; pedidos: number }[],
  produtos: { sku: string; receita: number }[],
): Metricas {
  return {
    vendasPorCanal: canais,
    evolucao: [{ data: '2026-06-01', total: canais.reduce((a, c) => a + c.total, 0) }],
    ticketMedio: 100,
    topProdutos: produtos.map((p) => ({ nome: `Prod ${p.sku}`, sku: p.sku, quantidade: 1, receita: p.receita })),
    posicaoPreco: [],
    benchmarkParcial: false,
  };
}

describe('compararTopProdutos', () => {
  it('classifica subiu/caiu/estavel/entrou/saiu por sku, ordenado por receita atual desc', () => {
    const atual = metricas([{ canal: 'shopee', total: 1000, pedidos: 10 }], [
      { sku: 'A', receita: 500 },
      { sku: 'B', receita: 300 },
      { sku: 'N', receita: 100 },
      { sku: 'E', receita: 50 },
    ]);
    const anterior = metricas([{ canal: 'shopee', total: 900, pedidos: 9 }], [
      { sku: 'A', receita: 400 },
      { sku: 'B', receita: 350 },
      { sku: 'E', receita: 50 },
      { sku: 'S', receita: 200 },
    ]);
    const r = compararTopProdutos(atual, anterior);
    expect(r.map((p) => [p.sku, p.situacao])).toEqual([
      ['A', 'subiu'],
      ['B', 'caiu'],
      ['N', 'entrou'],
      ['E', 'estavel'],
      ['S', 'saiu'],
    ]);
    expect(r[0]).toMatchObject({ receitaAtual: 500, receitaAnterior: 400 });
  });
});

describe('leituraComparacao', () => {
  it('crescimento → cita % e o canal que mais cresceu em R$', () => {
    const comp = compararMetricas(
      metricas([{ canal: 'mercadolivre', total: 800, pedidos: 8 }, { canal: 'shopee', total: 400, pedidos: 4 }], []),
      metricas([{ canal: 'mercadolivre', total: 500, pedidos: 5 }, { canal: 'shopee', total: 500, pedidos: 5 }], []),
    );
    expect(leituraComparacao(comp)).toBe('Crescimento de 20% nas vendas, puxado por mercadolivre.');
  });

  it('queda → cita % e o canal que mais caiu', () => {
    const comp = compararMetricas(
      metricas([{ canal: 'shopee', total: 500, pedidos: 5 }], []),
      metricas([{ canal: 'shopee', total: 1000, pedidos: 10 }], []),
    );
    expect(leituraComparacao(comp)).toBe('Queda de 50% nas vendas, com maior recuo em shopee.');
  });

  it('estável e sem base → frases honestas', () => {
    const iguais = compararMetricas(
      metricas([{ canal: 'shopee', total: 500, pedidos: 5 }], []),
      metricas([{ canal: 'shopee', total: 500, pedidos: 5 }], []),
    );
    expect(leituraComparacao(iguais)).toBe('Vendas estáveis em relação ao período anterior.');
    const semBase = compararMetricas(
      metricas([{ canal: 'shopee', total: 500, pedidos: 5 }], []),
      metricas([], []),
    );
    expect(leituraComparacao(semBase)).toBe('Sem base de comparação no período anterior.');
  });
});
