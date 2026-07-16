import { describe, expect, it } from 'vitest';

import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { dadosEmailRelatorio } from '@/modules/pipeline/steps/finalize';

const PERIODO = { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-30T23:59:59Z') };

const METRICAS: Metricas = {
  vendasPorCanal: [{ canal: 'shopee', total: 10880, pedidos: 48 }],
  evolucao: [{ data: '2026-06-01', total: 10880 }],
  ticketMedio: 226.67,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
  truth_score: {
    score: 76,
    totalPeriodo: 10880,
    totalPeriodoAnterior: 9700,
    fatores: {
      crescimento: { pontos: 20, max: 25, variacaoPercentual: 12.16 },
      posicaoPreco: { pontos: 15, max: 25, itensAvaliados: 0 },
      diversificacao: { pontos: 8, max: 20, canaisComVenda: 1 },
      regularidade: { pontos: 20, max: 20, diasComVenda: 30, diasPeriodo: 30 },
      cobertura: { pontos: 5, max: 10, produtosComBenchmark: 0, produtosAvaliados: 0 },
    },
  },
};

const ANALISE: AnaliseIa = {
  resumoExecutivo: 'R.',
  gargalos: ['Gargalo legado'],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe('dadosEmailRelatorio (puro)', () => {
  it('monta totalPeriodo, deltaPct (via truth_score), score e primeiro gargalo', () => {
    const d = dadosEmailRelatorio({ reportId: 'r1', periodo: PERIODO, metricas: METRICAS, analise: ANALISE });
    expect(d).toEqual({
      reportId: 'r1',
      periodoInicio: PERIODO.inicio,
      periodoFim: PERIODO.fim,
      totalPeriodo: 10880,
      deltaPct: 12.2, // deltaNumero(10880, 9700) — 1 casa
      score: 76,
      primeiroGargalo: 'Gargalo legado',
    });
  });

  it('relatório sem score/anterior → deltaPct e score null; sem gargalos → null', () => {
    const semScore: Metricas = { ...METRICAS, truth_score: undefined };
    const d = dadosEmailRelatorio({
      reportId: 'r1',
      periodo: PERIODO,
      metricas: semScore,
      analise: { ...ANALISE, gargalos: [] },
    });
    expect(d.deltaPct).toBeNull();
    expect(d.score).toBeNull();
    expect(d.primeiroGargalo).toBeNull();
  });

  it('prefere o titulo do melhor achado quando presente', () => {
    const comAchados: AnaliseIa = {
      ...ANALISE,
      achados: [
        {
          titulo: 'Frete come 12% da receita',
          descricao: 'd',
          tipo: 'logistica',
          prioridade: 'alta',
          impactoEstimadoMensalBRL: 1200,
          comoFazer: [],
          skus: [],
        },
      ],
    };
    const d = dadosEmailRelatorio({ reportId: 'r1', periodo: PERIODO, metricas: METRICAS, analise: comAchados });
    expect(d.primeiroGargalo).toBe('Frete come 12% da receita');
  });
});
