import { z } from 'zod';

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
            data: z.string(),
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
    benchmarkParcial: z.boolean(),
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
