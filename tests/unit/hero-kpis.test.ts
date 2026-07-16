import { describe, expect, it } from 'vitest';

import type { Metricas } from '@/modules/pipeline/contracts';
import { heroKpis } from '@/modules/reports/report-view-model';

function metricas(over: Partial<Metricas>): Metricas {
  return {
    vendasPorCanal: [{ canal: 'shopee', total: 1000, pedidos: 10 }],
    evolucao: [{ data: '2026-06-01', total: 1000 }],
    ticketMedio: 100,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
    ...over,
  };
}

const SCORE = {
  score: 76,
  totalPeriodo: 1000,
  totalPeriodoAnterior: 800,
  fatores: {
    crescimento: { pontos: 25, max: 25, variacaoPercentual: 25 },
    posicaoPreco: { pontos: 15, max: 25, itensAvaliados: 0 },
    diversificacao: { pontos: 8, max: 20, canaisComVenda: 1 },
    regularidade: { pontos: 20, max: 20, diasComVenda: 30, diasPeriodo: 30 },
    cobertura: { pontos: 8, max: 10, produtosComBenchmark: 0, produtosAvaliados: 0 },
  },
};

describe('heroKpis', () => {
  it('com relatório anterior → deltas de total, pedidos, ticket e score', () => {
    const anterior = metricas({
      vendasPorCanal: [{ canal: 'shopee', total: 800, pedidos: 8 }],
      evolucao: [{ data: '2026-05-01', total: 800 }],
      ticketMedio: 100,
      truth_score: { ...SCORE, score: 64, totalPeriodo: 800, totalPeriodoAnterior: null },
    });
    const r = heroKpis(metricas({ truth_score: SCORE }), anterior);
    expect(r.total).toEqual({ valor: 1000, deltaPct: 25 });
    expect(r.pedidos).toEqual({ valor: 10, deltaPct: 25 });
    expect(r.ticket).toEqual({ valor: 100, deltaPct: 0 });
    expect(r.score).toEqual({ valor: 76, deltaAbs: 12 });
  });

  it('sem relatório anterior → fallback do delta de total via truth_score', () => {
    const r = heroKpis(metricas({ truth_score: SCORE }), null);
    expect(r.total).toEqual({ valor: 1000, deltaPct: 25 });
    expect(r.pedidos.deltaPct).toBeNull();
    expect(r.ticket.deltaPct).toBeNull();
    expect(r.score).toEqual({ valor: 76, deltaAbs: null });
  });

  it('relatório antigo sem truth_score → total via evolucao, score null', () => {
    const r = heroKpis(metricas({}), null);
    expect(r.total).toEqual({ valor: 1000, deltaPct: null });
    expect(r.score).toBeNull();
  });
});
