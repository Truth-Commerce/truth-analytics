import { describe, expect, it } from 'vitest';

import { computeTruthScore, type TruthScoreInput } from '@/modules/pipeline/steps/truth-score';

function base(overrides: Partial<TruthScoreInput>): TruthScoreInput {
  return {
    totalPeriodo: 0,
    totalPeriodoAnterior: null,
    vendasPorCanal: [],
    evolucao: [],
    posicaoPreco: [],
    diasPeriodo: 30,
    ...overrides,
  };
}

describe('computeTruthScore — tabela de cenários', () => {
  it('operação saudável → 91', () => {
    const r = computeTruthScore(base({
      totalPeriodo: 12000,
      totalPeriodoAnterior: 10000, // +20% → 25
      posicaoPreco: [
        { sku: 'A', nome: 'A', nossoPreco: 100, precoMercadoMediano: 105, fonte: 'ml_publico' }, // 0.952 → 1.0
        { sku: 'B', nome: 'B', nossoPreco: 110, precoMercadoMediano: 100, fonte: 'ml_publico' }, // 1.10 → 0.6
      ], // média 0.8 → 20; cobertura 2/2 → 10
      vendasPorCanal: [
        { canal: 'mercado_livre', total: 8000, pedidos: 80 },
        { canal: 'shopee', total: 3000, pedidos: 40 },
        { canal: 'site', total: 1000, pedidos: 10 },
      ], // 3 canais → 20
      evolucao: Array.from({ length: 24 }, (_, i) => ({
        data: `2026-06-${String(i + 1).padStart(2, '0')}`,
        total: 500,
      })), // 24/30 → 16
    }));
    expect(r.score).toBe(91); // 25+20+20+16+10
    expect(r.fatores.crescimento).toEqual({ pontos: 25, max: 25, variacaoPercentual: 20 });
    expect(r.fatores.posicaoPreco).toEqual({ pontos: 20, max: 25, itensAvaliados: 2 });
    expect(r.fatores.diversificacao).toEqual({ pontos: 20, max: 20, canaisComVenda: 3 });
    expect(r.fatores.regularidade).toEqual({ pontos: 16, max: 20, diasComVenda: 24, diasPeriodo: 30 });
    expect(r.fatores.cobertura).toEqual({ pontos: 10, max: 10, produtosComBenchmark: 2, produtosAvaliados: 2 });
  });

  it('primeiro relatório (sem base, sem benchmark, 1 canal) → 50 neutro', () => {
    const r = computeTruthScore(base({
      totalPeriodo: 5000,
      totalPeriodoAnterior: null, // neutro 15
      vendasPorCanal: [{ canal: 'mercado_livre', total: 5000, pedidos: 30 }], // 8
      evolucao: Array.from({ length: 10 }, (_, i) => ({ data: `2026-06-1${i}`, total: 500 })), // round(10/30*20)=7
      posicaoPreco: [], // preço neutro 15; cobertura neutra 5
    }));
    expect(r.score).toBe(50); // 15+15+8+7+5
    expect(r.fatores.crescimento.variacaoPercentual).toBeNull();
  });

  it('operação em queda forte → 26', () => {
    const r = computeTruthScore(base({
      totalPeriodo: 4000,
      totalPeriodoAnterior: 10000, // -60% → clamp 0
      posicaoPreco: [{ sku: 'A', nome: 'A', nossoPreco: 150, precoMercadoMediano: 100, fonte: 'serpapi' }], // 1.5 → 0.2 → 5; cobertura 1/1 → 10
      vendasPorCanal: [{ canal: 'mercado_livre', total: 4000, pedidos: 20 }], // 8
      evolucao: Array.from({ length: 5 }, (_, i) => ({ data: `2026-06-0${i + 1}`, total: 800 })), // round(5/30*20)=3
    }));
    expect(r.score).toBe(26); // 0+5+8+3+10
  });

  it('zero vendas no período (com benchmark coletado) → 25', () => {
    const r = computeTruthScore(base({
      totalPeriodo: 0,
      totalPeriodoAnterior: 5000, // -100% → 0
      posicaoPreco: [{ sku: 'A', nome: 'A', nossoPreco: 0, precoMercadoMediano: 90, fonte: 'ml_publico' }],
      // nossoPreco=0 → 0 itens avaliáveis → preço neutro 15; cobertura 1/1 → 10
    }));
    expect(r.score).toBe(25); // 0+15+0+0+10
    expect(r.fatores.posicaoPreco.itensAvaliados).toBe(0);
  });

  it('anterior = 0 → crescimento neutro (não divide por zero)', () => {
    const r = computeTruthScore(base({ totalPeriodo: 1000, totalPeriodoAnterior: 0 }));
    expect(r.fatores.crescimento).toEqual({ pontos: 15, max: 25, variacaoPercentual: null });
  });

  it('crescimento 0% → 13 pts (round de 12.5)', () => {
    const r = computeTruthScore(base({ totalPeriodo: 10000, totalPeriodoAnterior: 10000 }));
    expect(r.fatores.crescimento.pontos).toBe(13);
    expect(r.fatores.crescimento.variacaoPercentual).toBe(0);
  });
});
