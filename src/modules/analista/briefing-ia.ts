import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAnthropic } from '@/modules/ai/claude';
import type { IaUsage } from '@/modules/pipeline/steps/analyze-ia';

export const BriefingIaSchema = z
  .object({
    prioridades: z.array(z.string()).max(5),
    argumentosReuniao: z.array(z.string()).max(5),
    riscos: z.array(z.string()).max(4),
  })
  .strict();

export type BriefingIa = z.infer<typeof BriefingIaSchema>;

// Build the JSON schema once at module load — pure, no I/O.
const _rawSchema = zodToJsonSchema(BriefingIaSchema, { $refStrategy: 'none' });
if ('$schema' in _rawSchema) {
  delete (_rawSchema as Record<string, unknown>)['$schema'];
}
const BRIEFING_JSON_SCHEMA: Record<string, unknown> = _rawSchema as Record<string, unknown>;

/** Orçamento único — resposta de pauta é pequena (sem retentativa via stream). */
const MAX_TOKENS_BRIEFING = 2000;

export type BriefingIaInput = {
  orgName: string;
  nicho: string | null;
  resumoExecutivo: string;
  achadosTitulos: string[];
  truthScore: number | null;
};

/** Pura — prompt da pauta de reunião do analista (testável sem API). */
export function buildBriefingMessages(
  input: BriefingIaInput,
): { system: string; user: string } {
  const system = `Você é o consultor de e-commerce da Truth Commerce preparando a PAUTA DA REUNIÃO com um cliente lojista brasileiro leigo.

REGRAS:
1. Isto é uma PAUTA PARA FALAR na reunião — NÃO repita o relatório nem descreva achados literalmente; traduza em pontos de conversa.
2. Priorize DINHEIRO: o que move receita/margem primeiro, antes de detalhes operacionais.
3. "prioridades" são os assuntos que abrem a reunião (máximo 5), em ordem de importância.
4. "argumentosReuniao" são frases PRONTAS para o consultor falar diretamente com o lojista (máximo 5) — tom direto, sem jargão.
5. "riscos" são alertas que merecem atenção nesta conversa (máximo 4) — só inclua o que for relevante; pode ficar vazio.

Responda EXCLUSIVAMENTE com um objeto JSON válido conforme o schema fornecido. Não inclua texto fora do JSON.`;

  const achadosTexto =
    input.achadosTitulos.length > 0
      ? input.achadosTitulos.map((t) => `- ${t}`).join('\n')
      : '(nenhum achado registrado neste ciclo)';

  const user = `### Loja
${input.orgName} — nicho: ${input.nicho ?? 'não informado'}

### Truth Score do ciclo
${input.truthScore ?? 'não disponível'}

### Resumo executivo do relatório
${input.resumoExecutivo}

### Achados do relatório (títulos)
${achadosTexto}`;

  return { system, user };
}

// ---------------------------------------------------------------------------
// Chamada Claude — espelha gerarCalendarioComIA (src/modules/calendario/calendario-ia.ts)
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
 * graciosa (`briefing: null`) em refusal/truncado/parse-inválido-após-retentativa
 * — mas `usage` acumulado é sempre retornado (nunca descartado), mesmo
 * quando a pauta falha, para a governança de custo não perder gasto
 * real. O chamador loga e o pipeline segue intacto (briefing é um "bônus",
 * nunca bloqueia o relatório principal).
 */
export async function gerarBriefingComIA(
  input: BriefingIaInput,
): Promise<{ briefing: BriefingIa | null; usage: IaUsage }> {
  const { system, user } = buildBriefingMessages(input);
  const usage: IaUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    tentativas: 0,
  };

  const callParams = {
    model: serverEnv.ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_BRIEFING,
    output_config: {
      effort: 'high' as const,
      format: {
        type: 'json_schema' as const,
        schema: BRIEFING_JSON_SCHEMA,
      },
    },
    system: [{ type: 'text' as const, text: system }],
    messages: [{ role: 'user' as const, content: user }],
  };

  let response: RespostaClaude;
  try {
    response = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  } catch (err) {
    logger.warn('briefing_ia.falha', {
      motivo: 'erro_rede',
      erro: err instanceof Error ? err.message : String(err),
    });
    return { briefing: null, usage };
  }
  acumularUsage(usage, response.usage);

  if (response.stop_reason === 'refusal') {
    logger.warn('briefing_ia.falha', { motivo: 'refusal' });
    return { briefing: null, usage };
  }
  if (response.stop_reason === 'max_tokens') {
    logger.warn('briefing_ia.falha', { motivo: 'max_tokens', maxTokens: MAX_TOKENS_BRIEFING });
    return { briefing: null, usage };
  }

  const text1 = extractTextBlock(response.content);
  if (text1 !== null) {
    try {
      const parsed = BriefingIaSchema.parse(JSON.parse(text1));
      return { briefing: parsed, usage };
    } catch {
      // cai para a retentativa abaixo
    }
  }

  // ---- Retentativa ÚNICA (mesmo prompt, sem stream) ------------------------
  let response2: RespostaClaude;
  try {
    response2 = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  } catch (err) {
    logger.warn('briefing_ia.falha', {
      motivo: 'erro_rede_retentativa',
      erro: err instanceof Error ? err.message : String(err),
    });
    return { briefing: null, usage };
  }
  acumularUsage(usage, response2.usage);

  if (response2.stop_reason === 'refusal') {
    logger.warn('briefing_ia.falha', { motivo: 'refusal_retentativa' });
    return { briefing: null, usage };
  }
  if (response2.stop_reason === 'max_tokens') {
    logger.warn('briefing_ia.falha', {
      motivo: 'max_tokens_retentativa',
      maxTokens: MAX_TOKENS_BRIEFING,
    });
    return { briefing: null, usage };
  }

  const text2 = extractTextBlock(response2.content);
  if (text2 !== null) {
    try {
      const parsed2 = BriefingIaSchema.parse(JSON.parse(text2));
      return { briefing: parsed2, usage };
    } catch (err) {
      logger.warn('briefing_ia.falha', {
        motivo: 'parse_invalido',
        erro: (err instanceof Error ? err.message : String(err)).slice(0, 500),
      });
      return { briefing: null, usage };
    }
  }

  logger.warn('briefing_ia.falha', { motivo: 'sem_bloco_texto' });
  return { briefing: null, usage };
}
