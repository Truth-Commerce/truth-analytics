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

export const ProdutoAbcSchema = z
  .object({ sku: z.string(), nome: z.string(), receita: z.number(), pctAcumulado: z.number() })
  .strict();
export type ProdutoAbc = z.infer<typeof ProdutoAbcSchema>;

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
    curvaAbc: z
      .object({
        a: z.array(ProdutoAbcSchema),
        b: z.array(ProdutoAbcSchema),
        c: z.array(ProdutoAbcSchema),
        concentracaoTop3Pct: z.number(),
      })
      .strict()
      .optional(),
    piores: z
      .array(z.object({ sku: z.string(), nome: z.string(), receita: z.number(), quantidade: z.number() }).strict())
      .optional(),
    frete: z
      .object({
        freteMedio: z.number(),
        pctFreteSobreReceita: z.number(),
        fretePorCanal: z
          .array(z.object({ canal: z.string(), freteMedio: z.number(), freteTotal: z.number() }).strict()),
      })
      .strict()
      .optional(),
    unidadesTotais: z.number().optional(),
    itensPorPedido: z.number().optional(),
    faixaMercado: z
      .array(
        z
          .object({
            sku: z.string(),
            nome: z.string(),
            min: z.number(),
            p25: z.number(),
            mediana: z.number(),
            p75: z.number(),
            fonte: z.string(),
          })
          .strict(),
      )
      .optional(),
    benchmarkParcial: z.boolean(),
    truth_score: TruthScoreSchema.optional(),
  })
  .strict();

export type Metricas = z.infer<typeof MetricasSchema>;

export const ACHADO_TIPOS = ['preco', 'anuncio', 'logistica', 'catalogo', 'conta', 'outro'] as const;
// mesmos valores de TASK_TIPOS (src/modules/tasks/task.types.ts) — conversão achado→task é direta

export const AchadoSchema = z
  .object({
    titulo: z.string().min(1).max(80),
    descricao: z.string(),
    tipo: z.enum(ACHADO_TIPOS),
    prioridade: z.enum(['alta', 'media', 'baixa']),
    impactoEstimadoMensalBRL: z.number().nullable(),
    comoFazer: z.array(z.string()),
    skus: z.array(z.string()),
  })
  .strict();

export type Achado = z.infer<typeof AchadoSchema>;

export const DestaqueSchema = z
  .object({ label: z.string(), valor: z.string(), direcao: z.enum(['up', 'down', 'flat']) })
  .strict();
export type Destaque = z.infer<typeof DestaqueSchema>;

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
            precoAtual: z.number().optional(),
            precoSugerido: z.number(),
            justificativa: z.string(),
          })
          .strict(),
      ),
    achados: z.array(AchadoSchema).optional(),
    destaques: z.array(DestaqueSchema).optional(),
  })
  .strict();

export type AnaliseIa = z.infer<typeof AnaliseIaSchema>;
