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

const ANALISE: AnaliseIa = {
  resumoExecutivo: 'Desempenho sólido no período.',
  gargalos: ['Frete caro'],
  sugestoesMelhoria: ['Negociar tarifa'],
  ideiasVenda: ['Kit promocional'],
  recomendacoesPreco: [
    { sku: 'SKU-001', nome: 'Produto Teste', precoSugerido: 98, justificativa: 'Ajuste competitivo.' },
  ],
};

describe('report-pdf', () => {
  it('renderiza um PDF válido com métricas e análise', async () => {
    const buf = await renderReportPdf({
      orgName: 'Comercial Exemplo',
      periodo: '01/06/2026 – 30/06/2026',
      geradoEm: '01/07/2026',
      metricas: METRICAS,
      analise: ANALISE,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('renderiza sem análise IA (só métricas)', async () => {
    const buf = await renderReportPdf({
      orgName: 'Comercial Exemplo',
      periodo: '01/06/2026 – 30/06/2026',
      geradoEm: '01/07/2026',
      metricas: METRICAS,
      analise: null,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
