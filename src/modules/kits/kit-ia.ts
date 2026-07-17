import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { serverEnv } from '@/lib/env';
import { formatBRL } from '@/lib/format';
import { logger } from '@/lib/logger';
import { getAnthropic } from '@/modules/ai/claude';
import type { KitCandidato } from '@/modules/kits/market-basket';
import type { IaUsage } from '@/modules/pipeline/steps/analyze-ia';

export const KitsIaSchema = z
  .object({
    kits: z
      .array(
        z
          .object({
            nome: z.string().min(1).max(200),
            itens: z
              .array(z.object({ sku: z.string(), nome: z.string() }).strict())
              .min(2),
            precoSugerido: z.number(),
            argumento: z.string(),
            canalRecomendado: z.string(),
          })
          .strict(),
      )
      .max(6),
  })
  .strict();

export type KitIa = z.infer<typeof KitsIaSchema>['kits'][number];

// Build the JSON schema once at module load — pure, no I/O.
const _rawSchema = zodToJsonSchema(KitsIaSchema, { $refStrategy: 'none' });
if ('$schema' in _rawSchema) {
  delete (_rawSchema as Record<string, unknown>)['$schema'];
}
const KITS_JSON_SCHEMA: Record<string, unknown> = _rawSchema as Record<string, unknown>;

/** Orçamento único — resposta de kits é pequena (sem retentativa via stream). */
const MAX_TOKENS_KITS = 4000;

export type KitIaInput = {
  orgName: string;
  nicho: string | null;
  candidatos: KitCandidato[];
  ticketMedio: number | null;
};

/** Pura — prompt de kits (testável sem API). */
export function buildKitMessages(input: KitIaInput): { system: string; user: string } {
  const system = `Você é um consultor de e-commerce da Truth Commerce montando KITS DE PRODUTOS para um lojista brasileiro leigo.

REGRAS:
1. Baseie-se APENAS nos pares fornecidos (comprados juntos de verdade) — não invente produtos fora da lista.
2. Cada kit tem no mínimo 2 itens, nome comercial vendedor (pt-BR), preço sugerido em reais (âncora: ticket informado; kit deve parecer vantajoso vs comprar separado) e argumento de venda de 1-2 frases citando a evidência.
3. "canalRecomendado" = um canal brasileiro plausível (ex.: Shopee, Mercado Livre, Loja Virtual).
4. Máximo 6 kits. Se um par não render kit bom, pule.

Responda EXCLUSIVAMENTE com um objeto JSON válido conforme o schema fornecido. Não inclua texto fora do JSON.`;

  const candidatosTexto = input.candidatos
    .map(
      (c) =>
        `- ${c.nomes[0]} (${c.skus[0]}) + ${c.nomes[1]} (${c.skus[1]}) — comprados juntos em ${c.pedidosJuntos} pedido(s)`,
    )
    .join('\n');

  const user = `### Loja
${input.orgName} — nicho: ${input.nicho ?? 'não informado'}
Ticket médio do período: ${input.ticketMedio !== null ? formatBRL(input.ticketMedio) : 'não informado'}

### Pares comprados juntos (evidência real dos pedidos, 90 dias)
${candidatosTexto}`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Chamada Claude — espelha analyzeWithIA (src/modules/pipeline/steps/analyze-ia.ts)
// ---------------------------------------------------------------------------

type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

function acumularUsage(acc: IaUsage, usage: UsageLike | undefined | null): void {
  acc.input_tokens += usage?.input_tokens ?? 0;
  acc.output_tokens += usage?.output_tokens ?? 0;
  acc.cache_read_input_tokens += usage?.cache_read_input_tokens ?? 0;
  acc.cache_creation_input_tokens += usage?.cache_creation_input_tokens ?? 0;
  acc.tentativas += 1;
}

function extractTextBlock(content: unknown[]): string | null {
  const block = content.find(
    (b) => typeof b === 'object' && b !== null && (b as { type: string }).type === 'text',
  ) as { type: 'text'; text: string } | undefined;
  return block?.text ?? null;
}

type RespostaClaude = {
  stop_reason?: string | null;
  usage?: UsageLike;
  content: unknown[];
};

/**
 * 1 chamada por ciclo (+ 1 retentativa idêntica se o parse falhar); falha
 * graciosa (null) em refusal/truncado/parse-inválido-após-retentativa — o
 * chamador loga e o pipeline segue intacto (kits são um "bônus", nunca
 * bloqueiam o relatório principal).
 */
export async function gerarKitsComIA(
  input: KitIaInput,
): Promise<{ kits: KitIa[]; usage: IaUsage } | null> {
  const { system, user } = buildKitMessages(input);
  const usage: IaUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    tentativas: 0,
  };

  const callParams = {
    model: serverEnv.ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_KITS,
    output_config: {
      effort: 'high' as const,
      format: {
        type: 'json_schema' as const,
        schema: KITS_JSON_SCHEMA,
      },
    },
    system: [{ type: 'text' as const, text: system }],
    messages: [{ role: 'user' as const, content: user }],
  };

  let response: RespostaClaude;
  try {
    response = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  } catch (err) {
    logger.warn('kits_ia.falha', { motivo: 'erro_rede', erro: err instanceof Error ? err.message : String(err) });
    return null;
  }
  acumularUsage(usage, response.usage);

  if (response.stop_reason === 'refusal') {
    logger.warn('kits_ia.falha', { motivo: 'refusal' });
    return null;
  }
  if (response.stop_reason === 'max_tokens') {
    logger.warn('kits_ia.falha', { motivo: 'max_tokens', maxTokens: MAX_TOKENS_KITS });
    return null;
  }

  const text1 = extractTextBlock(response.content);
  if (text1 !== null) {
    try {
      const parsed = KitsIaSchema.parse(JSON.parse(text1));
      return { kits: parsed.kits, usage };
    } catch {
      // cai para a retentativa abaixo
    }
  }

  // ---- Retentativa ÚNICA (mesmo prompt, sem stream) ------------------------
  let response2: RespostaClaude;
  try {
    response2 = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  } catch (err) {
    logger.warn('kits_ia.falha', { motivo: 'erro_rede_retentativa', erro: err instanceof Error ? err.message : String(err) });
    return null;
  }
  acumularUsage(usage, response2.usage);

  if (response2.stop_reason === 'refusal') {
    logger.warn('kits_ia.falha', { motivo: 'refusal_retentativa' });
    return null;
  }
  if (response2.stop_reason === 'max_tokens') {
    logger.warn('kits_ia.falha', { motivo: 'max_tokens_retentativa', maxTokens: MAX_TOKENS_KITS });
    return null;
  }

  const text2 = extractTextBlock(response2.content);
  if (text2 !== null) {
    try {
      const parsed2 = KitsIaSchema.parse(JSON.parse(text2));
      return { kits: parsed2.kits, usage };
    } catch (err) {
      logger.warn('kits_ia.falha', {
        motivo: 'parse_invalido',
        erro: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      });
      return null;
    }
  }

  logger.warn('kits_ia.falha', { motivo: 'sem_bloco_texto' });
  return null;
}
