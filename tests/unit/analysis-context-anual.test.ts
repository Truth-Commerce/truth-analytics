import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MesDesempenho, PedidoRow } from '@/modules/desempenho/desempenho-anual';
import type { CoberturaHistorico } from '@/modules/desempenho/desempenho-anual.repository';
import type { Metricas } from '@/modules/pipeline/contracts';
import { buildAnalysisMessages, type AnalysisContext } from '@/modules/pipeline/steps/analyze-ia';

const getOrgSettings = vi.fn(async (): Promise<{ metaMensal: number | null } | null> => null);
const getTotalVendasMesCorrente = vi.fn(async (): Promise<number> => 0);
const getUltimosDoneDetalhados = vi.fn(async (): Promise<unknown[]> => []);
const getPedidos12Meses = vi.fn(async (): Promise<PedidoRow[]> => []);
const getCoberturaHistorico = vi.fn(
  async (): Promise<CoberturaHistorico> => ({ desde: null, pendentesEnriquecimento: 0 }),
);

vi.mock('@/modules/organizations/organization-settings.repository', () => ({
  getOrgSettings,
  getTotalVendasMesCorrente,
}));
vi.mock('@/modules/reports/report.repository', () => ({ getUltimosDoneDetalhados }));
vi.mock('@/modules/desempenho/desempenho-anual.repository', () => ({
  getPedidos12Meses,
  getCoberturaHistorico,
}));

const mes = (over: Partial<MesDesempenho>): MesDesempenho => ({
  mes: '2026-07', faturamento: 1000, pedidos: 10, ticketMedio: 100,
  unidades: 20, frete: 50, comissao: 120, receitaLiquida: 830, ...over,
});

// Fixture mínimo válido — `{} as Metricas` faria avisoBenchmark estourar em
// metricas.posicaoPreco.filter. Mesmo shape usado em tests/unit/analysis-prompt.test.ts.
const METRICAS: Metricas = {
  vendasPorCanal: [{ canal: 'shopee', total: 1000, pedidos: 10 }],
  evolucao: [{ data: '2026-07-01', total: 1000 }],
  ticketMedio: 100,
  topProdutos: [],
  posicaoPreco: [
    { sku: 'SKU-1', nome: 'Produto 1', nossoPreco: 100, precoMercadoMediano: 90, fonte: 'shopee' },
  ],
  benchmarkParcial: false,
};

const contextoBase: AnalysisContext = {
  orgName: 'Loja Teste', nicho: null, plano: 'monthly',
  periodo: { inicio: new Date('2026-07-01T00:00:00Z'), fim: new Date('2026-07-30T23:59:59Z') },
  metaMensal: null, totalMesCorrente: 0, relatorioAnterior: null, datasComerciais: [],
  contextoAnual: null, coberturaAnual: null,
};

// formatBRL usa Intl pt-BR, que separa "R$" do número com NBSP (U+00A0), não espaço comum.
const NB = ' ';

const AVISO_AUSENCIA =
  'Meses sem linha acima não tiveram pedidos coletados — o histórico pode estar incompleto se o backfill de 12 meses ainda não foi executado; não interprete ausência como queda de vendas.';

describe('contexto anual no prompt', () => {
  it('inclui a secao com uma linha por mes quando ha historico', () => {
    const contexto = {
      ...contextoBase,
      contextoAnual: [mes({ mes: '2026-06', faturamento: 2500.5, pedidos: 25, ticketMedio: 100.02 }), mes({})],
      coberturaAnual: { pendentesEnriquecimento: 0 },
    };
    const { user } = buildAnalysisMessages(METRICAS, contexto);
    expect(user).toContain('### Histórico dos últimos 12 meses');
    expect(user).toContain(
      `2026-06: R$${NB}2.500,50 · 25 pedidos · ticket R$${NB}100,02 · receita líquida R$${NB}830,00`,
    );
    expect(user.indexOf('### Histórico dos últimos 12 meses')).toBeLessThan(user.indexOf('### Métricas do período (JSON)'));
  });

  it('sem historico, informa explicitamente', () => {
    const { user } = buildAnalysisMessages(METRICAS, contextoBase);
    expect(user).toContain('### Histórico dos últimos 12 meses');
    expect(user).toContain('Sem histórico anual disponível (backfill ainda não executado).');
  });

  it('omite meses zerados — a IA nao pode ler backfill pendente como queda de vendas', () => {
    const contexto = {
      ...contextoBase,
      contextoAnual: [
        mes({ mes: '2026-05', faturamento: 0, pedidos: 0, ticketMedio: 0, receitaLiquida: 0 }),
        mes({ mes: '2026-06', faturamento: 2500.5, pedidos: 25, ticketMedio: 100.02 }),
        mes({ mes: '2026-07' }),
      ],
      coberturaAnual: { pendentesEnriquecimento: 0 },
    };
    const { user } = buildAnalysisMessages(METRICAS, contexto);
    expect(user).not.toContain('2026-05');
    expect(user).not.toContain('· 0 pedidos');
    expect(user).toContain('2026-06:');
    expect(user).toContain('2026-07:');
  });

  it('marca o mes corrente (ultimo da serie) como parcial', () => {
    const contexto = {
      ...contextoBase,
      contextoAnual: [mes({ mes: '2026-06', faturamento: 2500.5, pedidos: 25, ticketMedio: 100.02 }), mes({ mes: '2026-07' })],
      coberturaAnual: { pendentesEnriquecimento: 0 },
    };
    const { user } = buildAnalysisMessages(METRICAS, contexto);
    expect(user).toContain(
      `2026-07: R$${NB}1.000,00 · 10 pedidos · ticket R$${NB}100,00 · receita líquida R$${NB}830,00 (mês corrente, parcial)`,
    );
    expect(user).not.toContain('2026-06: R$ 2.500,50 · 25 pedidos · ticket R$ 100,02 · receita líquida R$ 830,00 (mês corrente, parcial)');
  });

  it('com pedidos pendentes de enriquecimento, omite receita liquida e avisa', () => {
    const contexto = {
      ...contextoBase,
      contextoAnual: [mes({ mes: '2026-06', faturamento: 2500.5, pedidos: 25, ticketMedio: 100.02 }), mes({ mes: '2026-07' })],
      coberturaAnual: { pendentesEnriquecimento: 137 },
    };
    const { user } = buildAnalysisMessages(METRICAS, contexto);
    expect(user).toContain(`2026-06: R$${NB}2.500,50 · 25 pedidos · ticket R$${NB}100,02\n`);
    expect(user).not.toContain('receita líquida R$');
    expect(user).toContain(
      'Atenção: há 137 pedidos ainda não enriquecidos; comissão/frete/receita líquida indisponíveis para o período.',
    );
  });

  it('sem cobertura conhecida, nao afirma receita liquida', () => {
    const contexto = {
      ...contextoBase,
      contextoAnual: [mes({ mes: '2026-06', faturamento: 2500.5, pedidos: 25, ticketMedio: 100.02 })],
      coberturaAnual: null,
    };
    const { user } = buildAnalysisMessages(METRICAS, contexto);
    expect(user).not.toContain('receita líquida R$');
    expect(user).toContain('Atenção: cobertura de enriquecimento indisponível');
  });

  it('sempre avisa que ausencia de mes nao e queda de vendas quando ha historico', () => {
    const contexto = {
      ...contextoBase,
      contextoAnual: [mes({ mes: '2026-07' })],
      coberturaAnual: { pendentesEnriquecimento: 0 },
    };
    const { user } = buildAnalysisMessages(METRICAS, contexto);
    expect(user).toContain(AVISO_AUSENCIA);
  });

  it('sem historico, nao inclui o aviso de ausencia de meses', () => {
    const { user } = buildAnalysisMessages(METRICAS, contextoBase);
    expect(user).not.toContain(AVISO_AUSENCIA);
  });
});

describe('buildAnalysisContext — leitura anual nao pode derrubar o relatorio', () => {
  const input = {
    orgId: 'org-1',
    orgName: 'Loja Teste',
    nicho: null,
    plano: 'monthly' as const,
    periodo: { inicio: new Date('2026-07-01T00:00:00Z'), fim: new Date('2026-07-30T23:59:59Z') },
    source: { orgId: 'org-1', provider: 'bling' as const, sourceGeneration: 1 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getOrgSettings.mockResolvedValue(null);
    getTotalVendasMesCorrente.mockResolvedValue(0);
    getUltimosDoneDetalhados.mockResolvedValue([]);
    getPedidos12Meses.mockResolvedValue([]);
    getCoberturaHistorico.mockResolvedValue({ desde: null, pendentesEnriquecimento: 0 });
  });

  it('falha do getPedidos12Meses vira contexto anual nulo, sem lancar', async () => {
    getPedidos12Meses.mockRejectedValueOnce(new Error('db_down'));
    const { buildAnalysisContext } = await import('@/modules/pipeline/steps/analysis-context');
    const ctx = await buildAnalysisContext(input);
    expect(ctx.contextoAnual).toBeNull();
    expect(ctx.coberturaAnual).toBeNull();
  });

  it('falha do getCoberturaHistorico nao derruba o contexto nem afirma receita liquida', async () => {
    getPedidos12Meses.mockResolvedValueOnce([
      { data: new Date('2026-07-10T12:00:00Z'), valor_total: '100', frete: '0', comissao: '0', canal: 'shopee', itens: [] },
    ]);
    getCoberturaHistorico.mockRejectedValueOnce(new Error('db_down'));
    const { buildAnalysisContext } = await import('@/modules/pipeline/steps/analysis-context');
    const ctx = await buildAnalysisContext(input);
    expect(ctx.contextoAnual).not.toBeNull();
    expect(ctx.coberturaAnual).toBeNull();
  });

  it('propaga a cobertura quando ha historico', async () => {
    getPedidos12Meses.mockResolvedValueOnce([
      { data: new Date('2026-07-10T12:00:00Z'), valor_total: '100', frete: '0', comissao: '0', canal: 'shopee', itens: [] },
    ]);
    getCoberturaHistorico.mockResolvedValueOnce({ desde: new Date('2025-08-01T00:00:00Z'), pendentesEnriquecimento: 12 });
    const { buildAnalysisContext } = await import('@/modules/pipeline/steps/analysis-context');
    const ctx = await buildAnalysisContext(input);
    expect(ctx.coberturaAnual).toEqual({ pendentesEnriquecimento: 12 });
  });
});
