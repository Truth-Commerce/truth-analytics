import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { db } from '@/db/client';
import { organizations } from '@/db/schema';
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAnthropic } from '@/modules/ai/claude';
import type { IaUsage } from '@/modules/pipeline/steps/analyze-ia';

export const NichoIaSchema = z
  .object({
    nicho: z.string().min(1).max(60),
  })
  .strict();

export type NichoIa = z.infer<typeof NichoIaSchema>;

// Build the JSON schema once at module load — pure, no I/O.
const _rawSchema = zodToJsonSchema(NichoIaSchema, { $refStrategy: 'none' });
if ('$schema' in _rawSchema) {
  delete (_rawSchema as Record<string, unknown>)['$schema'];
}
const NICHO_JSON_SCHEMA: Record<string, unknown> = _rawSchema as Record<string, unknown>;

/** Orçamento único — resposta de nicho é minúscula (sem retentativa via stream). */
const MAX_TOKENS_NICHO = 300;

export type NichoIaInput = {
  orgName: string;
  topProdutos: string[];
};

/** Pura — prompt de inferência de nicho (testável sem API). */
export function buildNichoMessages(input: NichoIaInput): { system: string; user: string } {
  const system = `Você é um consultor de e-commerce da Truth Commerce definindo o NICHO de uma loja brasileira a partir dos produtos mais vendidos.

REGRAS:
1. Responda com UMA palavra ou expressão curta em português, minúscula (ex.: "papelaria", "moda fitness", "cozinha e utilidades").
2. Baseie-se apenas nos produtos fornecidos — não invente informações fora da lista.
3. Não use pontuação nem explicações, apenas o nicho.

Responda EXCLUSIVAMENTE com um objeto JSON válido conforme o schema fornecido. Não inclua texto fora do JSON.`;

  const user = `### Loja
${input.orgName}

### Produtos mais vendidos
${input.topProdutos.map((nome) => `- ${nome}`).join('\n')}`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Chamada Claude — espelha gerarKitsComIA (src/modules/kits/kit-ia.ts)
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
 * graciosa (`nicho: null`) em refusal/truncado/parse-inválido-após-retentativa
 * — mas `usage` acumulado é sempre retornado (nunca descartado), mesmo
 * quando a inferência falha, para a governança de custo não perder gasto
 * real. O chamador loga e o pipeline segue intacto (nicho é um "bônus", nunca
 * bloqueia o relatório principal).
 */
export async function inferirNichoComIA(
  input: NichoIaInput,
): Promise<{ nicho: string | null; usage: IaUsage }> {
  const { system, user } = buildNichoMessages(input);
  const usage: IaUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    tentativas: 0,
  };

  const callParams = {
    model: serverEnv.ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_NICHO,
    output_config: {
      effort: 'high' as const,
      format: {
        type: 'json_schema' as const,
        schema: NICHO_JSON_SCHEMA,
      },
    },
    system: [{ type: 'text' as const, text: system }],
    messages: [{ role: 'user' as const, content: user }],
  };

  let response: RespostaClaude;
  try {
    response = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  } catch (err) {
    logger.warn('nicho_ia.falha', { motivo: 'erro_rede', erro: err instanceof Error ? err.message : String(err) });
    return { nicho: null, usage };
  }
  acumularUsage(usage, response.usage);

  if (response.stop_reason === 'refusal') {
    logger.warn('nicho_ia.falha', { motivo: 'refusal' });
    return { nicho: null, usage };
  }
  if (response.stop_reason === 'max_tokens') {
    logger.warn('nicho_ia.falha', { motivo: 'max_tokens', maxTokens: MAX_TOKENS_NICHO });
    return { nicho: null, usage };
  }

  const text1 = extractTextBlock(response.content);
  if (text1 !== null) {
    try {
      const parsed = NichoIaSchema.parse(JSON.parse(text1));
      return { nicho: parsed.nicho, usage };
    } catch {
      // cai para a retentativa abaixo
    }
  }

  // ---- Retentativa ÚNICA (mesmo prompt, sem stream) ------------------------
  let response2: RespostaClaude;
  try {
    response2 = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  } catch (err) {
    logger.warn('nicho_ia.falha', { motivo: 'erro_rede_retentativa', erro: err instanceof Error ? err.message : String(err) });
    return { nicho: null, usage };
  }
  acumularUsage(usage, response2.usage);

  if (response2.stop_reason === 'refusal') {
    logger.warn('nicho_ia.falha', { motivo: 'refusal_retentativa' });
    return { nicho: null, usage };
  }
  if (response2.stop_reason === 'max_tokens') {
    logger.warn('nicho_ia.falha', { motivo: 'max_tokens_retentativa', maxTokens: MAX_TOKENS_NICHO });
    return { nicho: null, usage };
  }

  const text2 = extractTextBlock(response2.content);
  if (text2 !== null) {
    try {
      const parsed2 = NichoIaSchema.parse(JSON.parse(text2));
      return { nicho: parsed2.nicho, usage };
    } catch (err) {
      logger.warn('nicho_ia.falha', {
        motivo: 'parse_invalido',
        erro: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      });
      return { nicho: null, usage };
    }
  }

  logger.warn('nicho_ia.falha', { motivo: 'sem_bloco_texto' });
  return { nicho: null, usage };
}

/**
 * Grava o nicho inferido SE a org ainda não tiver um (guard de concorrência
 * via `isNull` no próprio WHERE — evita sobrescrever um nicho editado
 * manualmente entre a leitura e esta gravação). Retorna se gravou.
 */
export async function gravarNichoSeVazio(orgId: string, nicho: string): Promise<boolean> {
  const gravado = await db
    .update(organizations)
    .set({ nicho })
    .where(and(eq(organizations.id, orgId), isNull(organizations.nicho)))
    .returning({ id: organizations.id });

  return gravado.length > 0;
}
