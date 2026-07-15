import { describe, expect, it } from 'vitest';

import { renderReportPdf } from '@/modules/pdf/report-pdf';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

const METRICAS: Metricas = {
  vendasPorCanal: [{ canal: 'Mercado Livre', total: 1000, pedidos: 10 }],
  evolucao: [
    { data: '2026-06-01', total: 500 },
    { data: '2026-06-30', total: 500 },
  ],
  ticketMedio: 123.45,
  topProdutos: [{ nome: 'Produto Teste', sku: 'SKU-001', quantidade: 10, receita: 1000 }],
  posicaoPreco: [
    { sku: 'SKU-001', nome: 'Produto Teste', nossoPreco: 100, precoMercadoMediano: 95, fonte: 'Mercado Livre' },
  ],
  benchmarkParcial: false,
};

const METRICAS_RICA: Metricas = {
  ...METRICAS,
  truth_score: {
    score: 72,
    totalPeriodo: 1000,
    totalPeriodoAnterior: 890,
    fatores: {
      crescimento: { pontos: 18, max: 25, variacaoPercentual: 12.4 },
      posicaoPreco: { pontos: 15, max: 20, itensAvaliados: 3 },
      diversificacao: { pontos: 8, max: 15, canaisComVenda: 2 },
      regularidade: { pontos: 20, max: 25, diasComVenda: 22, diasPeriodo: 30 },
      cobertura: { pontos: 11, max: 15, produtosComBenchmark: 2, produtosAvaliados: 3 },
    },
  },
};

const ANALISE: AnaliseIa = {
  resumoExecutivo: 'Desempenho sólido no período.',
  gargalos: ['Frete caro'],
  sugestoesMelhoria: ['Negociar tarifa'],
  ideiasVenda: ['Kit promocional'],
  recomendacoesPreco: [
    { sku: 'SKU-001', nome: 'Produto Teste', precoSugerido: 98, justificativa: 'Ajuste competitivo.' },
  ],
};

const ANALISE_RICA: AnaliseIa = {
  ...ANALISE,
  recomendacoesPreco: [
    { sku: 'SKU-001', nome: 'Produto Teste', precoAtual: 100, precoSugerido: 98, justificativa: 'Ajuste competitivo.' },
  ],
  achados: [
    {
      titulo: 'Frete acima do mercado',
      descricao: 'A tarifa de frete corrói a margem nos pedidos do Mercado Livre.',
      tipo: 'logistica',
      prioridade: 'alta',
      impactoEstimadoMensalBRL: 1200,
      comoFazer: ['Renegociar tabela com a transportadora', 'Ativar frete grátis acima de R$ 200'],
      skus: ['SKU-001'],
    },
    {
      titulo: 'Catálogo pouco diversificado',
      descricao: 'Concentração de receita em poucos SKUs.',
      tipo: 'catalogo',
      prioridade: 'media',
      impactoEstimadoMensalBRL: null,
      comoFazer: ['Cadastrar variações de cor'],
      skus: [],
    },
  ],
  destaques: [{ label: 'Crescimento', valor: '+12,4%', direcao: 'up' }],
};

describe('report-pdf', () => {
  it('renderiza um PDF válido com métricas e análise', async () => {
    const buf = await renderReportPdf({
      orgName: 'Comercial Exemplo',
      periodo: '01/06/2026 – 30/06/2026',
      geradoEm: '01/07/2026',
      metricas: METRICAS,
      analise: ANALISE,
      analistaEmail: 'analista@truthcommerce.com.br',
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('renderiza sem análise IA e sem analista (só métricas)', async () => {
    const buf = await renderReportPdf({
      orgName: 'Comercial Exemplo',
      periodo: '01/06/2026 – 30/06/2026',
      geradoEm: '01/07/2026',
      metricas: METRICAS,
      analise: null,
      analistaEmail: null,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('renderiza v2 com Truth Score (gauge + breakdown) e top-3 achados', async () => {
    const buf = await renderReportPdf({
      orgName: 'Comercial Mattos & Cia',
      periodo: '01/06/2026 – 30/06/2026',
      geradoEm: '01/07/2026',
      metricas: METRICAS_RICA,
      analise: ANALISE_RICA,
      analistaEmail: 'analista@truthcommerce.com.br',
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });
});
