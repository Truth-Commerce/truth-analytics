import { describe, expect, it } from 'vitest';

import { compararMetricas, deltaNumero } from '@/modules/reports/compare';
import type { Metricas, TruthScore } from '@/modules/pipeline/contracts';

const mA: Metricas = {
  vendasPorCanal: [
    { canal: 'mercado_livre', total: 8000, pedidos: 80 },
    { canal: 'site', total: 2000, pedidos: 20 },
  ],
  evolucao: [
    { data: '2026-06-01', total: 6000 },
    { data: '2026-06-02', total: 4000 },
  ],
  ticketMedio: 100,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
};
const mB: Metricas = {
  vendasPorCanal: [
    { canal: 'mercado_livre', total: 5000, pedidos: 50 },
    { canal: 'shopee', total: 3000, pedidos: 30 },
  ],
  evolucao: [{ data: '2026-05-01', total: 8000 }],
  ticketMedio: 100,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
};

const scoreStub: TruthScore = {
  score: 50,
  totalPeriodo: 0,
  totalPeriodoAnterior: null,
  fatores: {
    crescimento: { pontos: 15, max: 25, variacaoPercentual: null },
    posicaoPreco: { pontos: 15, max: 25, itensAvaliados: 0 },
    diversificacao: { pontos: 0, max: 20, canaisComVenda: 0 },
    regularidade: { pontos: 0, max: 20, diasComVenda: 0, diasPeriodo: 30 },
    cobertura: { pontos: 5, max: 10, produtosComBenchmark: 0, produtosAvaliados: 0 },
  },
};

describe('compararMetricas', () => {
  it('compara totais, pedidos, ticket e canais (união, incluindo canal só de um lado)', () => {
    const c = compararMetricas(mA, mB);
    expect(c.totalVendas).toEqual({ atual: 10000, anterior: 8000, deltaAbs: 2000, deltaPct: 25 });
    expect(c.pedidos).toEqual({ atual: 100, anterior: 80, deltaAbs: 20, deltaPct: 25 });
    expect(c.ticketMedio.deltaPct).toBe(0);
    expect(c.truthScore).toBeNull(); // nenhum lado tem score
    expect(c.porCanal).toEqual([
      { canal: 'mercado_livre', delta: { atual: 8000, anterior: 5000, deltaAbs: 3000, deltaPct: 60 } },
      { canal: 'site', delta: { atual: 2000, anterior: 0, deltaAbs: 2000, deltaPct: null } },
      { canal: 'shopee', delta: { atual: 0, anterior: 3000, deltaAbs: -3000, deltaPct: -100 } },
    ]);
  });

  it('deltaNumero: anterior 0 → deltaPct null; queda → negativo com 1 casa', () => {
    expect(deltaNumero(500, 0)).toEqual({ atual: 500, anterior: 0, deltaAbs: 500, deltaPct: null });
    expect(deltaNumero(667, 1000)).toEqual({ atual: 667, anterior: 1000, deltaAbs: -333, deltaPct: -33.3 });
  });

  it('truthScore comparado quando ambos têm score', () => {
    const a = { ...mA, truth_score: { ...scoreStub, score: 80 } };
    const b = { ...mB, truth_score: { ...scoreStub, score: 60 } };
    expect(compararMetricas(a, b).truthScore).toEqual({ atual: 80, anterior: 60, deltaAbs: 20, deltaPct: 33.3 });
  });
});
