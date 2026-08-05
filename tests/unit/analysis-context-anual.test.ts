import { describe, expect, it } from 'vitest';

import type { MesDesempenho } from '@/modules/desempenho/desempenho-anual';
import type { Metricas } from '@/modules/pipeline/contracts';
import { buildAnalysisMessages, type AnalysisContext } from '@/modules/pipeline/steps/analyze-ia';

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
  contextoAnual: null,
};

// formatBRL usa Intl pt-BR, que separa "R$" do número com NBSP (U+00A0), não espaço comum.
const NB = ' ';

describe('contexto anual no prompt', () => {
  it('inclui a secao com uma linha por mes quando ha historico', () => {
    const contexto = {
      ...contextoBase,
      contextoAnual: [mes({ mes: '2026-06', faturamento: 2500.5, pedidos: 25, ticketMedio: 100.02 }), mes({})],
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
});
