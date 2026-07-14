import { zodToJsonSchema } from 'zod-to-json-schema';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAnthropic } from '@/modules/ai/claude';
import { AnaliseIaSchema, type AnaliseIa, type Metricas } from '@/modules/pipeline/contracts';

// Build the JSON schema once at module load — pure, no I/O.
// $refStrategy:'none' inlines all $refs so the API gets a flat, self-contained schema.
// We defensively delete $schema if present (the API expects a plain JSON Schema object).
const _rawSchema = zodToJsonSchema(AnaliseIaSchema, { $refStrategy: 'none' });
if ('$schema' in _rawSchema) {
  delete (_rawSchema as Record<string, unknown>)['$schema'];
}
const ANALISE_JSON_SCHEMA: Record<string, unknown> = _rawSchema as Record<string, unknown>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Aviso de benchmark em 3 casos (G0):
 * (a) sem benchmark NENHUM → instrução positiva (mix/canais/regularidade,
 *     recomendacoesPreco vazio) — nada de hedging fantasma;
 * (b) parcial (provider ATIVO falhou) → cautela explícita (texto preservado);
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analisa as métricas usando Claude com saídas estruturadas (JSON Schema via output_config).
 * Em caso de falha de parse/validação, faz UMA re-tentativa. Após duas falhas → lança 'analise_ia_invalida'.
 */
export async function analyzeWithIA(metricas: Metricas, nicho: string | null): Promise<AnaliseIa> {
  const system = buildSystemPrompt(metricas);
  const userText = buildUserMessage(metricas, nicho);

  // Bloco de métricas marcado p/ prompt caching: o retry reaproveita o prefixo
  // inteiro (system + métricas) do cache e paga só o delta da correção.
  const userBlock = {
    type: 'text' as const,
    text: userText,
    cache_control: { type: 'ephemeral' as const },
  };
  const messages: MessageParam[] = [{ role: 'user', content: [userBlock] }];

  const callParams = {
    model: serverEnv.ANALYSIS_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' as const },
    output_config: {
      effort: 'high' as const,
      format: {
        type: 'json_schema' as const,
        schema: ANALISE_JSON_SCHEMA,
      },
    },
    // Bloco system estável marcado p/ prompt caching: toda geração (e o retry)
    // reaproveita o prefixo — reduz custo/latência da chamada Opus.
    system: [
      {
        type: 'text' as const,
        text: system,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages,
  };

  // First attempt
  const response = await getAnthropic().messages.create(callParams);
  const text1 = extractTextBlock(response.content as unknown[]);

  let parseError: string | null = null;
  if (text1 !== null) {
    try {
      const parsed = JSON.parse(text1);
      return AnaliseIaSchema.parse(parsed);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  } else {
    parseError = 'Nenhum bloco de texto encontrado na resposta';
  }

  // Retry de correção CURTO: em vez de refazer a chamada inteira (dobrando
  // latência e tokens de thinking), o turno final envia apenas o erro de
  // validação truncado + a instrução de corrigir. O prefixo (system + métricas)
  // vem do cache — o retry paga só o delta.
  const erroCurto = (parseError ?? 'resposta sem bloco de texto').slice(0, 500);
  logger.warn('análise IA: primeira tentativa inválida, re-tentando', { parseError: erroCurto });

  const correcao = `A resposta anterior falhou na validação do schema: ${erroCurto}. Responda APENAS com o objeto JSON válido conforme o schema, sem texto adicional.`;

  // Quando a 1ª resposta não trouxe bloco de texto (ex.: só thinking), NÃO enviar
  // um turno assistant vazio (a API pode rejeitar content '') — basta o bloco de
  // métricas cacheado + o turno user de correção. Caso contrário, espelhamos a
  // resposta inválida + correção.
  const retryMessages: MessageParam[] =
    text1 !== null
      ? [
          { role: 'user', content: [userBlock] }, // prefixo cacheado — não paga de novo
          { role: 'assistant', content: text1 },
          { role: 'user', content: correcao },
        ]
      : [
          { role: 'user', content: [userBlock] },
          { role: 'user', content: correcao },
        ];

  const response2 = await getAnthropic().messages.create({
    ...callParams,
    messages: retryMessages,
  });

  const text2 = extractTextBlock(response2.content as unknown[]);
  if (text2 !== null) {
    try {
      const parsed2 = JSON.parse(text2);
      return AnaliseIaSchema.parse(parsed2);
    } catch {
      // fall through
    }
  }

  logger.error('análise IA inválida após retry', { parseError: erroCurto });
  throw new Error('analise_ia_invalida');
}
