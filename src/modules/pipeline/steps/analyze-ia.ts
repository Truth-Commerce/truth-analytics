import { zodToJsonSchema } from 'zod-to-json-schema';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAnthropic } from '@/modules/ai/claude';
import { AnaliseIaSchema, type AnaliseIa, type Metricas } from '@/modules/pipeline/contracts';

// Build the JSON schema once at module load — pure, no I/O.
const _rawSchema = zodToJsonSchema(AnaliseIaSchema, { $refStrategy: 'none' });
if ('$schema' in _rawSchema) {
  delete (_rawSchema as Record<string, unknown>)['$schema'];
}
const ANALISE_JSON_SCHEMA: Record<string, unknown> = _rawSchema as Record<string, unknown>;

/** Orçamento padrão da 1ª tentativa. */
const MAX_TOKENS_PADRAO = 16000;
/** Orçamento da retentativa (via stream — max_tokens alto exige streaming). */
const MAX_TOKENS_RETENTATIVA = 32000;

// ---------------------------------------------------------------------------
// Usage (Task 5 — persistido em reports.ia_usage)
// ---------------------------------------------------------------------------

/** Usage somado das tentativas da chamada Claude — persistido em reports.ia_usage. */
export type IaUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  tentativas: number;
};

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Aviso de benchmark em 3 casos (G0/Task 4):
 * (a) sem benchmark NENHUM → focar mix/canais/regularidade, recomendacoesPreco vazio;
 * (b) parcial (provider ATIVO falhou) → cautela explícita;
 * (c) fonte única completa → analisar preço normalmente citando a fonte.
 */
function avisoBenchmark(metricas: Metricas): string {
  const comMercado = metricas.posicaoPreco.filter((p) => p.precoMercadoMediano > 0);
  if (comMercado.length === 0) {
    return `\n\nATENÇÃO: NENHUM benchmark de mercado está disponível neste período. NÃO invente preços de concorrentes nem posição competitiva. Deixe "recomendacoesPreco" como lista vazia e concentre a análise no mix de produtos, nos canais de venda e na regularidade das vendas — há muito valor nesses dados.`;
  }
  if (metricas.benchmarkParcial) {
    return `\n\nATENÇÃO: O benchmark de mercado está INCOMPLETO (benchmarkParcial=true). NÃO infira nem invente conclusões sobre concorrentes, participação de mercado ou posição relativa a partir de dados ausentes. Em recomendações de preço, deixe claro explicitamente que a base comparativa é limitada e evite afirmações categóricas sobre competitividade.`;
  }
  const fontes = [...new Set(comMercado.map((p) => p.fonte).filter((f) => f !== ''))];
  if (fontes.length === 1) {
    return `\n\nO benchmark de mercado vem de uma única fonte (${fontes[0]}). Analise preços normalmente e cite essa fonte nas recomendações de preço.`;
  }
  return '';
}

function buildSystemPrompt(metricas: Metricas): string {
  const aviso = avisoBenchmark(metricas);
  const truthScore = metricas.truth_score?.score;

  const scoreTexto =
    truthScore === undefined
      ? ''
      : `\n\nAs métricas incluem um "truth_score" (${truthScore}/100) — índice de saúde da operação composto por: crescimento vs período anterior, posição de preço vs mercado, diversificação de canais, regularidade de vendas e cobertura de benchmark (detalhes no campo "fatores"). No resumoExecutivo, comente o score e cite os fatores mais fracos; conecte gargalos e sugestoesMelhoria aos fatores que mais penalizaram o score.`;

  return `Você é um analista sênior de e-commerce e marketplaces brasileiro. A partir das métricas fornecidas pelo usuário, produza uma análise estratégica completa em português do Brasil com os seguintes componentes:

1. **resumoExecutivo**: síntese dos resultados do período (pontos fortes e fracos).
2. **gargalos**: lista dos principais obstáculos ao crescimento identificados nas métricas.
3. **sugestoesMelhoria**: ações concretas e priorizadas para melhorar os resultados.
4. **ideiasVenda**: ideias de campanhas, bundles, estratégias de cross-sell ou up-sell adequadas ao perfil dos produtos.
5. **recomendacoesPreco**: para cada produto com posição de preço disponível, sugira um preço otimizado com justificativa clara baseada nos dados.

Use o nicho informado para contextualizar suas recomendações. Seja direto, prático e orientado a dados.${aviso}${scoreTexto}

Responda EXCLUSIVAMENTE com um objeto JSON válido conforme o schema fornecido. Não inclua texto fora do JSON.`;
}

function buildUserMessage(metricas: Metricas, nicho: string | null): string {
  const nichoTexto = nicho ? `Nicho de mercado: ${nicho}\n\n` : '';
  return `${nichoTexto}Métricas do período:\n${JSON.stringify(metricas, null, 2)}`;
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

function logTentativa(tentativa: number, r: RespostaClaude): void {
  logger.info('analise_ia.tentativa', {
    tentativa,
    stopReason: r.stop_reason ?? null,
    inputTokens: r.usage?.input_tokens ?? 0,
    outputTokens: r.usage?.output_tokens ?? 0,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analisa as métricas usando Claude com saídas estruturadas (JSON Schema via
 * output_config) e devolve também o usage somado (Task 5).
 *
 * Robustez (G0/Task 6) — `stop_reason` é checado ANTES do parse:
 * - 'refusal'    → Error('analise_ia_recusada') — sem retry (repetir o mesmo
 *                  prompt tende a ser recusado de novo).
 * - 'max_tokens' → resposta TRUNCADA (thinking pode consumir o orçamento):
 *                  retentativa com as MESMAS mensagens via messages.stream()
 *                  + finalMessage() e max_tokens 32000. Truncou de novo →
 *                  Error('analise_ia_truncada').
 * - parse/validação inválidos → retentativa de correção CURTA (erro truncado
 *   + instrução), também via stream/32000. Falhou de novo →
 *   Error('analise_ia_invalida').
 *
 * O orquestrador mapeia a mensagem do Error para report.erro — contrato
 * preservado. O prefixo (system + métricas) tem cache_control: o retry paga
 * só o delta.
 */
export async function analyzeWithIA(
  metricas: Metricas,
  nicho: string | null,
): Promise<{ analise: AnaliseIa; usage: IaUsage }> {
  const system = buildSystemPrompt(metricas);
  const userText = buildUserMessage(metricas, nicho);
  const usage: IaUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    tentativas: 0,
  };

  const userBlock = {
    type: 'text' as const,
    text: userText,
    cache_control: { type: 'ephemeral' as const },
  };
  const messages: MessageParam[] = [{ role: 'user', content: [userBlock] }];

  const callParams = {
    model: serverEnv.ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_PADRAO,
    thinking: { type: 'adaptive' as const },
    output_config: {
      effort: 'high' as const,
      format: {
        type: 'json_schema' as const,
        schema: ANALISE_JSON_SCHEMA,
      },
    },
    system: [
      {
        type: 'text' as const,
        text: system,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages,
  };

  // ---- Tentativa 1 (create) ------------------------------------------------
  const response = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  acumularUsage(usage, response.usage);
  logTentativa(1, response);

  if (response.stop_reason === 'refusal') {
    throw new Error('analise_ia_recusada');
  }

  const truncou1 = response.stop_reason === 'max_tokens';
  const text1 = truncou1 ? null : extractTextBlock(response.content);

  let parseError: string | null = null;
  if (text1 !== null) {
    try {
      const parsed = JSON.parse(text1);
      return { analise: AnaliseIaSchema.parse(parsed), usage };
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  } else if (!truncou1) {
    parseError = 'Nenhum bloco de texto encontrado na resposta';
  }

  // ---- Retentativa ÚNICA (stream + orçamento maior) ------------------------
  // Truncamento → MESMAS mensagens (a resposta era incompleta, não inválida).
  // Parse inválido → correção curta (prefixo cacheado + erro + instrução).
  let retryMessages: MessageParam[];
  if (truncou1) {
    logger.warn('análise IA: resposta truncada (max_tokens), re-tentando com orçamento maior', {
      maxTokens: MAX_TOKENS_RETENTATIVA,
    });
    retryMessages = messages;
  } else {
    const erroCurto = (parseError ?? 'resposta sem bloco de texto').slice(0, 500);
    logger.warn('análise IA: primeira tentativa inválida, re-tentando', { parseError: erroCurto });
    const correcao = `A resposta anterior falhou na validação do schema: ${erroCurto}. Responda APENAS com o objeto JSON válido conforme o schema, sem texto adicional.`;
    retryMessages =
      text1 !== null
        ? [
            { role: 'user', content: [userBlock] },
            { role: 'assistant', content: text1 },
            { role: 'user', content: correcao },
          ]
        : [
            { role: 'user', content: [userBlock] },
            { role: 'user', content: correcao },
          ];
  }

  const response2 = (await getAnthropic()
    .messages.stream({
      ...callParams,
      max_tokens: MAX_TOKENS_RETENTATIVA,
      messages: retryMessages,
    })
    .finalMessage()) as RespostaClaude;
  acumularUsage(usage, response2.usage);
  logTentativa(2, response2);

  if (response2.stop_reason === 'refusal') {
    throw new Error('analise_ia_recusada');
  }
  if (response2.stop_reason === 'max_tokens') {
    logger.error('análise IA truncada após retentativa com orçamento maior', {
      maxTokens: MAX_TOKENS_RETENTATIVA,
    });
    throw new Error('analise_ia_truncada');
  }

  const text2 = extractTextBlock(response2.content);
  let parseError2: string | null = null;
  if (text2 !== null) {
    try {
      const parsed2 = JSON.parse(text2);
      return { analise: AnaliseIaSchema.parse(parsed2), usage };
    } catch (err) {
      parseError2 = err instanceof Error ? err.message : String(err);
    }
  }

  logger.error('analise_ia.retentativa_invalida', {
    parseError: (parseError2 ?? 'resposta sem bloco de texto').slice(0, 500),
  });
  throw new Error('analise_ia_invalida');
}
