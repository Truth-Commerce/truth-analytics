import { z } from 'zod';

export const TruthScoreSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    totalPeriodo: z.number(),
    totalPeriodoAnterior: z.number().nullable(),
    fatores: z
      .object({
        crescimento: z
          .object({ pontos: z.number(), max: z.number(), variacaoPercentual: z.number().nullable() })
          .strict(),
        posicaoPreco: z
          .object({ pontos: z.number(), max: z.number(), itensAvaliados: z.number() })
          .strict(),
        diversificacao: z
          .object({ pontos: z.number(), max: z.number(), canaisComVenda: z.number() })
          .strict(),
        regularidade: z
          .object({ pontos: z.number(), max: z.number(), diasComVenda: z.number(), diasPeriodo: z.number() })
          .strict(),
        cobertura: z
          .object({ pontos: z.number(), max: z.number(), produtosComBenchmark: z.number(), produtosAvaliados: z.number() })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type TruthScore = z.infer<typeof TruthScoreSchema>;

export const MetricasSchema = z
  .object({
    vendasPorCanal: z
      .array(
        z
          .object({
            canal: z.string(),
            total: z.number(),
            pedidos: z.number(),
          })
          .strict(),
      ),
    evolucao: z
      .array(
        z
          .object({
            data: z.string().min(1),
            total: z.number(),
          })
          .strict(),
      ),
    ticketMedio: z.number(),
    topProdutos: z
      .array(
        z
          .object({
            nome: z.string(),
            sku: z.string(),
            quantidade: z.number(),
            receita: z.number(),
          })
          .strict(),
      ),
    posicaoPreco: z
      .array(
        z
          .object({
            sku: z.string(),
            nome: z.string(),
            nossoPreco: z.number(),
            precoMercadoMediano: z.number(),
            fonte: z.string(),
          })
          .strict(),
      ),
    evolucaoDetalhada: z
      .array(z.object({ data: z.string().min(1), total: z.number(), pedidos: z.number() }).strict())
      .optional(),
    canalPorDia: z
      .array(z.object({ data: z.string().min(1), canais: z.record(z.number()) }).strict())
      .optional(),
    porDiaSemana: z
      .array(
        z
          .object({
            diaSemana: z.number().int().min(0).max(6),
            label: z.string(),
            mediaVendas: z.number(),
            totalVendas: z.number(),
          })
          .strict(),
      )
      .optional(),
    ticketPorCanal: z.array(z.object({ canal: z.string(), ticket: z.number() }).strict()).optional(),
    benchmarkParcial: z.boolean(),
    truth_score: TruthScoreSchema.optional(),
  })
  .strict();

export type Metricas = z.infer<typeof MetricasSchema>;

export const AnaliseIaSchema = z
  .object({
    resumoExecutivo: z.string(),
    gargalos: z.array(z.string()),
    sugestoesMelhoria: z.array(z.string()),
    ideiasVenda: z.array(z.string()),
    recomendacoesPreco: z
      .array(
        z
          .object({
            sku: z.string(),
            nome: z.string(),
            precoSugerido: z.number(),
            justificativa: z.string(),
          })
          .strict(),
      ),
  })
  .strict();

export type AnaliseIa = z.infer<typeof AnaliseIaSchema>;
