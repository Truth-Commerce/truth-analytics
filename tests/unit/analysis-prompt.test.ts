import { describe, expect, it } from 'vitest';

import type { Metricas } from '@/modules/pipeline/contracts';
import { buildAnalysisMessages, type AnalysisContext } from '@/modules/pipeline/steps/analyze-ia';

// NOTA (integração G0): posicaoPreco é populado (o brief original usava []) para
// que a função avisoBenchmark de 3 casos preservada da G0 caia no ramo "parcial"
// (INCOMPLETO) quando benchmarkParcial=true — com posicaoPreco vazio o ramo seria
// "NENHUM benchmark" e nunca produziria "INCOMPLETO". Ver task-4-report.md.
const METRICAS: Metricas = {
  vendasPorCanal: [{ canal: 'shopee', total: 1000, pedidos: 10 }],
  evolucao: [{ data: '2026-06-01', total: 1000 }],
  ticketMedio: 100,
  topProdutos: [],
  posicaoPreco: [
    { sku: 'SKU-1', nome: 'Produto 1', nossoPreco: 100, precoMercadoMediano: 90, fonte: 'shopee' },
  ],
  benchmarkParcial: false,
};

const CONTEXTO: AnalysisContext = {
  orgName: 'Bazar Estrela do Mar',
  nicho: 'utilidades domésticas',
  plano: 'monthly',
  periodo: { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-30T23:59:59Z') },
  metaMensal: 45000,
  totalMesCorrente: 23400,
  relatorioAnterior: {
    periodo: { inicio: new Date('2026-05-01T00:00:00Z'), fim: new Date('2026-05-31T23:59:59Z') },
    resumoExecutivo: 'Mês anterior estável.',
    recomendacoes: ['Reduzir frete no ML'],
    totalPeriodo: 9800,
  },
  datasComerciais: [
    { nome: 'Dia dos Pais', data: new Date('2026-08-09T00:00:00Z'), dica: 'Kits presenteáveis.' },
  ],
  contextoAnual: null,
};

describe('buildAnalysisMessages — system', () => {
  it('define a persona consultor Truth para lojista leigo, com limites e regras de qualidade', () => {
    const { system } = buildAnalysisMessages(METRICAS, CONTEXTO);
    expect(system).toContain('consultor sênior');
    expect(system).toContain('LEIGO');
    expect(system).toContain('máximo 4');
    expect(system).toContain('achados');
    expect(system).toContain('JSON');
  });

  it('inclui o aviso de benchmark parcial só quando benchmarkParcial=true', () => {
    const sem = buildAnalysisMessages(METRICAS, CONTEXTO).system;
    const com = buildAnalysisMessages({ ...METRICAS, benchmarkParcial: true }, CONTEXTO).system;
    expect(sem).not.toContain('INCOMPLETO');
    expect(com).toContain('INCOMPLETO');
  });
});

describe('buildAnalysisMessages — user', () => {
  it('injeta loja, nicho, período, meta com progresso, relatório anterior e calendário', () => {
    const { user } = buildAnalysisMessages(METRICAS, CONTEXTO);
    expect(user).toContain('Bazar Estrela do Mar');
    expect(user).toContain('utilidades domésticas');
    expect(user).toContain('Mensal');
    expect(user).toContain('01/06/2026');
    expect(user).toContain('45.000');
    expect(user).toContain('52%'); // 23400/45000
    expect(user).toContain('Mês anterior estável.');
    expect(user).toContain('Reduzir frete no ML');
    expect(user).toContain('surtiram efeito');
    expect(user).toContain('Dia dos Pais');
    expect(user).toContain('"ticketMedio": 100'); // métricas em JSON
  });

  it('sem meta e sem anterior → seções honestas', () => {
    const { user } = buildAnalysisMessages(METRICAS, {
      ...CONTEXTO,
      metaMensal: null,
      relatorioAnterior: null,
      datasComerciais: [],
    });
    expect(user).toContain('Sem meta mensal definida');
    expect(user).toContain('primeiro relatório');
    expect(user).toContain('Nenhuma data comercial relevante');
  });
});
