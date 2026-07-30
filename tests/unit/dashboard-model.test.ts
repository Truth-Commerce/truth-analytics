import { describe, expect, it } from 'vitest';

import {
  acaoNumeroUm,
  chipsDoRelatorio,
  copyProximaAnalise,
  historicoComDeltas,
  linhaDoTempoScore,
  posicaoPrecoResumo,
  proximaAnaliseInfo,
  srSummaryEvolucao,
  statCardsModel,
  topProdutosDashboard,
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
    sourceProvider: null,
    sourceGeneration: null,
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
    sourceProvider: null,
    sourceGeneration: null,
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

describe('historicoComDeltas', () => {
  it('delta vs o done anterior mais próximo, pulando failed', () => {
    const historico = [
      linha({ id: 'd', score: 76, totalPeriodo: 1000 }), // mais recente
      linha({ id: 'c', status: 'failed' }),              // pulado como base
      linha({ id: 'b', score: 64, totalPeriodo: 850 }),
      linha({ id: 'a', score: 58, totalPeriodo: 800 }),  // mais antigo
    ];
    const r = historicoComDeltas(historico);
    expect(r[0]).toMatchObject({ id: 'd', deltaScore: 12, deltaFaturamento: 150 }); // vs 'b' (pula 'c')
    expect(r[1]).toMatchObject({ id: 'c', deltaScore: null, deltaFaturamento: null }); // failed sem valores
    expect(r[2]).toMatchObject({ id: 'b', deltaScore: 6, deltaFaturamento: 50 });
    expect(r[3]).toMatchObject({ id: 'a', deltaScore: null, deltaFaturamento: null }); // primeiro
  });

  it('done antigo sem truth_score não serve de base (procura o próximo que tem)', () => {
    const historico = [
      linha({ id: 'c', score: 70, totalPeriodo: 900 }),
      linha({ id: 'b', status: 'done' }), // done PRÉ-F3a: sem score/total
      linha({ id: 'a', score: 60, totalPeriodo: 700 }),
    ];
    const r = historicoComDeltas(historico);
    expect(r[0]).toMatchObject({ deltaScore: 10, deltaFaturamento: 200 }); // 'c' vs 'a'
  });

  it('lista vazia → []', () => {
    expect(historicoComDeltas([])).toEqual([]);
  });
});

describe('topProdutosDashboard', () => {
  it('corta em 5 preservando a ordem por receita (já vem ordenado do pipeline)', () => {
    const top = Array.from({ length: 8 }, (_, i) => ({
      nome: `P${i}`,
      sku: `S${i}`,
      quantidade: 1,
      receita: 800 - i * 100,
    }));
    const r = topProdutosDashboard(metricas({ topProdutos: top }));
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual({ nome: 'P0', sku: 'S0', receita: 800 });
    expect(r[4].sku).toBe('S4');
  });

  it('sem métricas ou sem produtos → []', () => {
    expect(topProdutosDashboard(null)).toEqual([]);
    expect(topProdutosDashboard(metricas({}))).toEqual([]);
  });
});

describe('proximaAnaliseInfo', () => {
  const agora = new Date('2026-07-14T12:00:00Z');

  it('conta dias-calendário BRT e formata dd/mm', () => {
    expect(proximaAnaliseInfo(true, new Date('2026-07-19T12:00:00Z'), agora)).toEqual({
      dias: 5,
      data: '19/07',
    });
  });

  it('15/07 01:00Z = ainda 14/07 no BRT → 0 dias ("sai hoje")', () => {
    expect(proximaAnaliseInfo(true, new Date('2026-07-15T01:00:00Z'), agora)).toEqual({
      dias: 0,
      data: '14/07',
    });
  });

  it('null quando automática desligada, sem data ou data no passado', () => {
    expect(proximaAnaliseInfo(false, new Date('2026-07-19T12:00:00Z'), agora)).toBeNull();
    expect(proximaAnaliseInfo(true, null, agora)).toBeNull();
    expect(proximaAnaliseInfo(true, new Date('2026-07-10T12:00:00Z'), agora)).toBeNull();
  });
});

describe('copyProximaAnalise', () => {
  it('hoje / singular / plural', () => {
    expect(copyProximaAnalise({ dias: 0, data: '14/07' })).toBe('Sua próxima análise sai hoje (14/07).');
    expect(copyProximaAnalise({ dias: 1, data: '15/07' })).toBe(
      'Sua próxima análise sai automaticamente em 1 dia (15/07).',
    );
    expect(copyProximaAnalise({ dias: 5, data: '19/07' })).toBe(
      'Sua próxima análise sai automaticamente em 5 dias (19/07).',
    );
  });
});

describe('srSummaryEvolucao', () => {
  it('resume período, total e melhor dia em pt-BR', () => {
    const s = srSummaryEvolucao([
      { data: '2026-06-01', total: 500 },
      { data: '2026-06-15', total: 1500 },
      { data: '2026-06-30', total: 1000 },
    ]);
    expect(s).toContain('01/06 a 30/06');
    // "R$" e o número são separados por NBSP no Intl pt-BR — asserção pelo trecho numérico.
    expect(s).toContain('3.000,00');
    expect(s).toContain('melhor dia 15/06');
    expect(s).toContain('1.500,00');
  });

  it('sem dados → mensagem honesta', () => {
    expect(srSummaryEvolucao([])).toBe('Sem dados de evolução de vendas no período.');
  });
});

describe('posicaoPrecoResumo', () => {
  const item = (sku: string, nosso: number, mercado: number) => ({
    sku,
    nome: `Produto ${sku}`,
    nossoPreco: nosso,
    precoMercadoMediano: mercado,
    fonte: 'ml_publico',
  });

  it('conta acima/abaixo/na média (tolerância ±2%) e monta a leitura', () => {
    const m = metricas({
      posicaoPreco: [
        item('A', 110, 100), // +10% → acima
        item('B', 120, 100), // +20% → acima
        item('C', 90, 100), // -10% → abaixo
        item('D', 80, 100), // -20% → abaixo
        item('E', 70, 100), // -30% → abaixo
        item('F', 101, 100), // +1% → na média
      ],
    });
    expect(posicaoPrecoResumo(m)).toEqual({
      acima: 2,
      abaixo: 3,
      naMedia: 1,
      total: 6,
      leitura: '2 acima / 3 abaixo do mercado · 1 na média',
    });
  });

  it('exclui itens com nossoPreco 0 ou mercado 0 (nunca conta "R$ 0,00" como preço)', () => {
    const m = metricas({ posicaoPreco: [item('A', 0, 100), item('B', 100, 0)] });
    expect(posicaoPrecoResumo(m)).toBeNull();
  });

  it('sem métricas / lista vazia → null; sem "na média" a leitura fica curta', () => {
    expect(posicaoPrecoResumo(null)).toBeNull();
    expect(posicaoPrecoResumo(metricas({}))).toBeNull();
    const m = metricas({ posicaoPreco: [item('A', 110, 100), item('B', 90, 100)] });
    expect(posicaoPrecoResumo(m)?.leitura).toBe('1 acima / 1 abaixo do mercado');
  });
});
