import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAnthropic } from '@/modules/ai/claude';
import type { IaUsage } from '@/modules/pipeline/steps/analyze-ia';

// `maxItems` sai do schema (a API de structured output o rejeita com 400); o teto de 8
// vai no prompt e é garantido por `normalizarSugestoes` após o parse.
export const MAX_SUGESTOES_CALENDARIO = 8;

export const CalendarioIaSchema = z
  .object({
    sugestoes: z.array(
      z
        .object({
          dataISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          nomeData: z.string(),
          titulo: z.string().min(1).max(200),
          sugestao: z.string(),
          skus: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();

export type SugestaoCalendario = z.infer<typeof CalendarioIaSchema>['sugestoes'][number];

/** Aplica o teto que saiu do schema: corta em 8 sugestões. */
export function normalizarSugestoes(sugestoes: SugestaoCalendario[]): SugestaoCalendario[] {
  return sugestoes.slice(0, MAX_SUGESTOES_CALENDARIO);
}

// Build the JSON schema once at module load — pure, no I/O.
const _rawSchema = zodToJsonSchema(CalendarioIaSchema, { $refStrategy: 'none' });
if ('$schema' in _rawSchema) {
  delete (_rawSchema as Record<string, unknown>)['$schema'];
}
const CALENDARIO_JSON_SCHEMA: Record<string, unknown> = _rawSchema as Record<string, unknown>;

/** Orçamento único — resposta de calendário é pequena (sem retentativa via stream). */
const MAX_TOKENS_CALENDARIO = 4000;

export type CalendarioIaInput = {
  orgName: string;
  nicho: string | null;
  datas: { nome: string; dataISO: string; dica: string }[];
  topProdutos: { sku: string; nome: string }[];
};

/** Pura — prompt de sugestões do calendário sazonal (testável sem API). */
export function buildCalendarioMessages(
  input: CalendarioIaInput,
): { system: string; user: string } {
  const system = `Você é um consultor de e-commerce da Truth Commerce montando o CALENDÁRIO SAZONAL de um lojista brasileiro leigo.

REGRAS:
1. Para CADA data relevante do calendário proponha uma ação concreta — mas nem toda data precisa de sugestão; pule as que não fizerem sentido para esta loja.
2. Cite produtos REAIS da lista fornecida (skus verbatim) — não invente produtos fora da lista.
3. Respeite a antecedência: a ação deve ser algo para anunciar/preparar com 2-3 semanas antes da data.
4. "titulo" é curto e acionável (ex.: "Anuncie a Black Friday").
5. Máximo 8 sugestões. Se uma data não render sugestão boa, pule.

Responda EXCLUSIVAMENTE com um objeto JSON válido conforme o schema fornecido. Não inclua texto fora do JSON.`;

  const datasTexto = input.datas
    .map((d) => `- ${d.nome} (${d.dataISO}) — ${d.dica}`)
    .join('\n');

  const produtosTexto = input.topProdutos
    .map((p) => `- ${p.nome} (${p.sku})`)
    .join('\n');

  const user = `### Loja
${input.orgName} — nicho: ${input.nicho ?? 'não informado'}

### Datas comerciais dos próximos 90 dias
${datasTexto}

### Produtos mais vendidos (evidência real, 90 dias)
${produtosTexto}`;

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
 * graciosa (`sugestoes: null`) em refusal/truncado/parse-inválido-após-retentativa
 * — mas `usage` acumulado é sempre retornado (nunca descartado), mesmo
 * quando as sugestões falham, para a governança de custo não perder gasto
 * real. O chamador loga e o pipeline segue intacto (calendário é um "bônus",
 * nunca bloqueia o relatório principal).
 */
export async function gerarCalendarioComIA(
  input: CalendarioIaInput,
): Promise<{ sugestoes: SugestaoCalendario[] | null; usage: IaUsage }> {
  const { system, user } = buildCalendarioMessages(input);
  const usage: IaUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    tentativas: 0,
  };

  const callParams = {
    model: serverEnv.ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_CALENDARIO,
    output_config: {
      effort: 'high' as const,
      format: {
        type: 'json_schema' as const,
        schema: CALENDARIO_JSON_SCHEMA,
      },
    },
    system: [{ type: 'text' as const, text: system }],
    messages: [{ role: 'user' as const, content: user }],
  };

  let response: RespostaClaude;
  try {
    response = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  } catch (err) {
    logger.warn('calendario_ia.falha', {
      motivo: 'erro_rede',
      erro: err instanceof Error ? err.message : String(err),
    });
    return { sugestoes: null, usage };
  }
  acumularUsage(usage, response.usage);

  if (response.stop_reason === 'refusal') {
    logger.warn('calendario_ia.falha', { motivo: 'refusal' });
    return { sugestoes: null, usage };
  }
  if (response.stop_reason === 'max_tokens') {
    logger.warn('calendario_ia.falha', { motivo: 'max_tokens', maxTokens: MAX_TOKENS_CALENDARIO });
    return { sugestoes: null, usage };
  }

  const text1 = extractTextBlock(response.content);
  if (text1 !== null) {
    try {
      const parsed = CalendarioIaSchema.parse(JSON.parse(text1));
      return { sugestoes: normalizarSugestoes(parsed.sugestoes), usage };
    } catch {
      // cai para a retentativa abaixo
    }
  }

  // ---- Retentativa ÚNICA (mesmo prompt, sem stream) ------------------------
  let response2: RespostaClaude;
  try {
    response2 = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  } catch (err) {
    logger.warn('calendario_ia.falha', {
      motivo: 'erro_rede_retentativa',
      erro: err instanceof Error ? err.message : String(err),
    });
    return { sugestoes: null, usage };
  }
  acumularUsage(usage, response2.usage);

  if (response2.stop_reason === 'refusal') {
    logger.warn('calendario_ia.falha', { motivo: 'refusal_retentativa' });
    return { sugestoes: null, usage };
  }
  if (response2.stop_reason === 'max_tokens') {
    logger.warn('calendario_ia.falha', {
      motivo: 'max_tokens_retentativa',
      maxTokens: MAX_TOKENS_CALENDARIO,
    });
    return { sugestoes: null, usage };
  }

  const text2 = extractTextBlock(response2.content);
  if (text2 !== null) {
    try {
      const parsed2 = CalendarioIaSchema.parse(JSON.parse(text2));
      return { sugestoes: normalizarSugestoes(parsed2.sugestoes), usage };
    } catch (err) {
      logger.warn('calendario_ia.falha', {
        motivo: 'parse_invalido',
        erro: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      });
      return { sugestoes: null, usage };
    }
  }

  logger.warn('calendario_ia.falha', { motivo: 'sem_bloco_texto' });
  return { sugestoes: null, usage };
}
