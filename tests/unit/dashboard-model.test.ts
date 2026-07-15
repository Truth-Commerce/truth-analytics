import { describe, expect, it } from 'vitest';

import { insightsFromAnalise, statCardsModel } from '@/modules/reports/dashboard-model';
import type { AnaliseIa, Metricas, TruthScore } from '@/modules/pipeline/contracts';

const SCORE: TruthScore = {
  score: 76,
  totalPeriodo: 1000,
  totalPeriodoAnterior: 800,
  fatores: {
    crescimento: { pontos: 20, max: 25, variacaoPercentual: 25 },
    posicaoPreco: { pontos: 20, max: 25, itensAvaliados: 2 },
    diversificacao: { pontos: 15, max: 20, canaisComVenda: 2 },
    regularidade: { pontos: 15, max: 20, diasComVenda: 6, diasPeriodo: 7 },
    cobertura: { pontos: 6, max: 10, produtosComBenchmark: 1, produtosAvaliados: 2 },
  },
};

function metricas(over: Partial<Metricas>): Metricas {
  return {
    vendasPorCanal: [
      { canal: 'Mercado Livre', total: 600, pedidos: 6 },
      { canal: 'Shopee', total: 400, pedidos: 4 },
    ],
    evolucao: [
      { data: '2026-06-01', total: 700 },
      { data: '2026-06-15', total: 300 },
    ],
    ticketMedio: 100,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
    ...over,
  };
}

describe('statCardsModel', () => {
  it('com relatório anterior → 4 cards e o 4º é a variação % vs anterior', () => {
    const anterior = metricas({ evolucao: [{ data: '2026-05-01', total: 800 }] });
    const itens = statCardsModel(metricas({}), anterior);
    expect(itens.map((i) => i.label)).toEqual([
      'Faturamento do período',
      'Pedidos',
      'Ticket médio',
      'Variação vs análise anterior',
    ]);
    expect(itens[0]).toEqual({
      label: 'Faturamento do período',
      value: 1000, // totalVendas = soma de evolucao (fonte de verdade do compare.ts)
      format: 'brl',
      spark: [700, 300],
    });
    expect(itens[1]).toEqual({ label: 'Pedidos', value: 10, format: 'int' });
    expect(itens[3]).toEqual({ label: 'Variação vs análise anterior', value: 25, format: 'pct' });
  });

  it('sem anterior mas com truth_score → fallback via totalPeriodoAnterior', () => {
    const itens = statCardsModel(metricas({ truth_score: SCORE }), null);
    expect(itens[3]).toEqual({ label: 'Variação vs análise anterior', value: 25, format: 'pct' });
  });

  it('relatório antigo sem anterior nem score → só 3 cards (nunca métrica de vaidade)', () => {
    expect(statCardsModel(metricas({}), null)).toHaveLength(3);
  });

  it('anterior com total 0 → deltaPct null → card de variação omitido', () => {
    const anterior = metricas({ evolucao: [] });
    expect(statCardsModel(metricas({}), anterior)).toHaveLength(3);
  });
});

describe('insightsFromAnalise (removido na Task 2 — mantido até lá)', () => {
  const ANALISE: AnaliseIa = {
    resumoExecutivo: 'ok',
    gargalos: ['Frete caro'],
    sugestoesMelhoria: ['Negociar tarifa'],
    ideiasVenda: ['Kit promocional'],
    recomendacoesPreco: [],
  };

  it('prefixa por origem', () => {
    expect(insightsFromAnalise(ANALISE)[0]).toBe('Gargalo: Frete caro');
  });
});
