import { describe, expect, it } from 'vitest';

import {
  acaoNumeroUm,
  chipsDoRelatorio,
  linhaDoTempoScore,
  statCardsModel,
} from '@/modules/reports/dashboard-model';
import type { Achado, AnaliseIa, Metricas, TruthScore } from '@/modules/pipeline/contracts';
import type { HistoricoDashboardRow } from '@/modules/reports/report.repository';
import type { ReportDetail } from '@/modules/reports/report.types';

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

function detail(over: Partial<ReportDetail>): ReportDetail {
  return {
    id: 'r-1',
    status: 'done',
    periodoInicio: new Date('2026-06-01T00:00:00Z'),
    periodoFim: new Date('2026-06-30T23:59:59Z'),
    createdAt: new Date('2026-07-01T12:00:00Z'),
    metricas: metricas({}),
    analiseIa: null,
    erro: null,
    ...over,
  };
}

function achado(over: Partial<Achado>): Achado {
  return {
    titulo: 'Achado',
    descricao: 'Descrição.',
    tipo: 'outro',
    prioridade: 'media',
    impactoEstimadoMensalBRL: null,
    comoFazer: [],
    skus: [],
    ...over,
  };
}

const ANALISE_BASE: AnaliseIa = {
  resumoExecutivo: 'ok',
  gargalos: ['Frete caro no Mercado Livre'],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe('chipsDoRelatorio', () => {
  it('done com análise → 3 chips apontando para as seções do relatório', () => {
    const chips = chipsDoRelatorio(detail({ analiseIa: ANALISE_BASE }));
    expect(chips).toEqual([
      { label: 'Métricas do período', href: '/dashboard/relatorios/r-1#metricas' },
      { label: 'Análise da IA', href: '/dashboard/relatorios/r-1#resumo' },
      { label: 'Recomendações', href: '/dashboard/relatorios/r-1#recomendacoes' },
    ]);
  });

  it('done sem análise → só o chip de métricas; sem done → []', () => {
    expect(chipsDoRelatorio(detail({}))).toEqual([
      { label: 'Métricas do período', href: '/dashboard/relatorios/r-1#metricas' },
    ]);
    expect(chipsDoRelatorio(null)).toEqual([]);
    expect(chipsDoRelatorio(detail({ metricas: null }))).toEqual([]);
  });
});

describe('acaoNumeroUm', () => {
  it('com achados v2 → melhor achado por impacto, com índice ORIGINAL', () => {
    const analise: AnaliseIa = {
      ...ANALISE_BASE,
      achados: [
        achado({ titulo: 'Menor', impactoEstimadoMensalBRL: 100 }),
        achado({ titulo: 'Maior', impactoEstimadoMensalBRL: 2000, descricao: 'Vale muito.' }),
      ],
    };
    expect(acaoNumeroUm(analise)).toEqual({
      titulo: 'Maior',
      descricao: 'Vale muito.',
      impactoBRL: 2000,
      fonte: 'achados',
      indice: 1,
    });
  });

  it('relatório antigo → fallback gargalos[0] com fonte/indice do fluxo legado', () => {
    expect(acaoNumeroUm(ANALISE_BASE)).toEqual({
      titulo: 'Frete caro no Mercado Livre',
      descricao: null,
      impactoBRL: null,
      fonte: 'gargalos',
      indice: 0,
    });
  });

  it('sem análise ou sem itens → null', () => {
    expect(acaoNumeroUm(null)).toBeNull();
    expect(acaoNumeroUm({ ...ANALISE_BASE, gargalos: [] })).toBeNull();
  });
});

function linha(over: Partial<HistoricoDashboardRow>): HistoricoDashboardRow {
  return {
    id: `r-${Math.random()}`,
    status: 'done',
    periodoInicio: new Date('2026-06-01T00:00:00Z'),
    periodoFim: new Date('2026-06-07T23:59:59Z'),
    createdAt: new Date('2026-06-08T12:00:00Z'),
    score: null,
    totalPeriodo: null,
    ...over,
  };
}

describe('linhaDoTempoScore', () => {
  it('ordena cronologicamente (input é desc), ignora failed/sem score e narra a evolução', () => {
    const historico = [
      linha({ status: 'failed' }), // mais recente, sem score
      linha({ score: 76, totalPeriodo: 1000 }),
      linha({ score: 71, totalPeriodo: 900 }),
      linha({ score: 64, totalPeriodo: 850 }),
      linha({ score: 58, totalPeriodo: 800 }), // mais antigo
    ];
    expect(linhaDoTempoScore(historico)).toEqual({
      serie: [58, 64, 71, 76],
      texto: 'De 58 para 76 em 4 relatórios',
    });
  });

  it('1 score só → serie de 1 SEM texto; nenhum score → vazio', () => {
    expect(linhaDoTempoScore([linha({ score: 70 })])).toEqual({ serie: [70], texto: null });
    expect(linhaDoTempoScore([linha({})])).toEqual({ serie: [], texto: null });
    expect(linhaDoTempoScore([])).toEqual({ serie: [], texto: null });
  });
});
