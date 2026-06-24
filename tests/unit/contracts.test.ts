import { describe, expect, it } from 'vitest';
import { MetricasSchema, AnaliseIaSchema } from '@/modules/pipeline/contracts';

const validMetricas = {
  vendasPorCanal: [{ canal: 'mercado_livre', total: 1000, pedidos: 10 }],
  evolucao: [{ data: '2026-06-01', total: 1000 }],
  ticketMedio: 100,
  topProdutos: [{ nome: 'Produto A', sku: 'SKU-001', quantidade: 5, receita: 500 }],
  posicaoPreco: [
    {
      sku: 'SKU-001',
      nome: 'Produto A',
      nossoPreco: 99.9,
      precoMercadoMediano: 105,
      fonte: 'ml_publico',
    },
  ],
  benchmarkParcial: false,
};

const validAnaliseIa = {
  resumoExecutivo: 'Boa performance no mês.',
  gargalos: ['Frete alto para RJ'],
  sugestoesMelhoria: ['Negociar frete com transportadora'],
  ideiasVenda: ['Criar bundle com produto complementar'],
  recomendacoesPreco: [
    {
      sku: 'SKU-001',
      nome: 'Produto A',
      precoSugerido: 97.5,
      justificativa: 'Abaixar levemente para ganhar buy box',
    },
  ],
};

describe('contracts Zod', () => {
  describe('MetricasSchema', () => {
    it('aceita objeto válido', () => {
      expect(() => MetricasSchema.parse(validMetricas)).not.toThrow();
    });

    it('rejeita campo extra no topo (strict)', () => {
      expect(() =>
        MetricasSchema.parse({ ...validMetricas, campoExtra: 'x' }),
      ).toThrow();
    });

    it('rejeita campo extra em objeto aninhado (strict)', () => {
      expect(() =>
        MetricasSchema.parse({
          ...validMetricas,
          vendasPorCanal: [{ canal: 'ml', total: 100, pedidos: 1, campoExtra: 'x' }],
        }),
      ).toThrow();
    });

    it('rejeita ticketMedio string', () => {
      expect(() =>
        MetricasSchema.parse({ ...validMetricas, ticketMedio: 'cem' }),
      ).toThrow();
    });
  });

  describe('AnaliseIaSchema', () => {
    it('aceita objeto válido', () => {
      expect(() => AnaliseIaSchema.parse(validAnaliseIa)).not.toThrow();
    });

    it('rejeita campo extra no topo (strict)', () => {
      expect(() =>
        AnaliseIaSchema.parse({ ...validAnaliseIa, campoInvalido: true }),
      ).toThrow();
    });

    it('rejeita campo extra em recomendacoesPreco (strict)', () => {
      expect(() =>
        AnaliseIaSchema.parse({
          ...validAnaliseIa,
          recomendacoesPreco: [
            { sku: 'SKU-001', nome: 'A', precoSugerido: 10, justificativa: 'ok', extra: true },
          ],
        }),
      ).toThrow();
    });

    it('rejeita resumoExecutivo ausente', () => {
      const { resumoExecutivo: _, ...sem } = validAnaliseIa;
      expect(() => AnaliseIaSchema.parse(sem)).toThrow();
    });
  });
});
