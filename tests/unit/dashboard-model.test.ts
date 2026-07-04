import { describe, expect, it } from 'vitest';

import { dashboardStats, insightsFromAnalise } from '@/modules/reports/dashboard-model';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

const METRICAS: Metricas = {
  vendasPorCanal: [
    { canal: 'Mercado Livre', total: 1000, pedidos: 10 },
    { canal: 'Shopee', total: 500, pedidos: 8 },
  ],
  evolucao: [
    { data: '2026-06-01', total: 700 },
    { data: '2026-06-15', total: 800 },
  ],
  ticketMedio: 83.33,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
};

const ANALISE: AnaliseIa = {
  resumoExecutivo: 'ok',
  gargalos: ['Frete caro'],
  sugestoesMelhoria: ['Negociar tarifa'],
  ideiasVenda: ['Kit promocional'],
  recomendacoesPreco: [],
};

describe('dashboard-model', () => {
  it('dashboardStats agrega faturamento, pedidos e série da evolução', () => {
    expect(dashboardStats(METRICAS)).toEqual({
      faturamento: 1500,
      pedidos: 18,
      ticketMedio: 83.33,
      evolucaoTotais: [700, 800],
    });
  });

  it('insightsFromAnalise prefixa por origem e limita a 8', () => {
    expect(insightsFromAnalise(ANALISE)).toEqual([
      'Gargalo: Frete caro',
      'Sugestão: Negociar tarifa',
      'Ideia: Kit promocional',
    ]);
    const cheia: AnaliseIa = {
      ...ANALISE,
      gargalos: Array.from({ length: 10 }, (_, i) => `g${i}`),
    };
    expect(insightsFromAnalise(cheia)).toHaveLength(8);
  });

  it('sem análise = sem insights', () => {
    expect(insightsFromAnalise(null)).toEqual([]);
  });
});
