import { zodToJsonSchema } from 'zod-to-json-schema';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';

import { serverEnv } from '@/lib/env';
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

function buildSystemPrompt(benchmarkParcial: boolean): string {
  const aviso = benchmarkParcial
    ? `\n\nATENÇÃO: O benchmark de mercado está INCOMPLETO (benchmarkParcial=true). NÃO infira nem invente conclusões sobre concorrentes, participação de mercado ou posição relativa a partir de dados ausentes. Em recomendações de preço, deixe claro explicitamente que a base comparativa é limitada e evite afirmações categóricas sobre competitividade.`
    : '';

  return `Você é um analista sênior de e-commerce e marketplaces brasileiro. A partir das métricas fornecidas pelo usuário, produza uma análise estratégica completa em português do Brasil com os seguintes componentes:

1. **resumoExecutivo**: síntese dos resultados do período (pontos fortes e fracos).
2. **gargalos**: lista dos principais obstáculos ao crescimento identificados nas métricas.
3. **sugestoesMelhoria**: ações concretas e priorizadas para melhorar os resultados.
4. **ideiasVenda**: ideias de campanhas, bundles, estratégias de cross-sell ou up-sell adequadas ao perfil dos produtos.
5. **recomendacoesPreco**: para cada produto com posição de preço disponível, sugira um preço otimizado com justificativa clara baseada nos dados.

Use o nicho informado para contextualizar suas recomendações. Seja direto, prático e orientado a dados.${aviso}

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
  const system = buildSystemPrompt(metricas.benchmarkParcial);
  const userText = buildUserMessage(metricas, nicho);

  const messages: MessageParam[] = [{ role: 'user', content: userText }];

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
    system,
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

  // Retry: append assistant response + correction request
  console.warn('[analyzeWithIA] Primeira tentativa inválida — re-tentando. Erro:', parseError);

  // Quando a 1ª resposta não trouxe bloco de texto (ex.: só thinking), NÃO enviar
  // um turno assistant vazio (a API pode rejeitar content '') — basta um turno
  // user com a correção. Caso contrário, espelhamos a resposta inválida + correção.
  const retryMessages: MessageParam[] =
    text1 !== null
      ? [
          { role: 'user', content: userText },
          { role: 'assistant', content: text1 },
          {
            role: 'user',
            content: `A resposta anterior falhou na validação do schema: ${parseError}. responda APENAS com JSON válido conforme o schema, sem texto adicional.`,
          },
        ]
      : [
          {
            role: 'user',
            content: `${userText}\n\nNOTA: a resposta anterior não continha um bloco de texto com JSON (${parseError}). Responda APENAS com JSON válido conforme o schema, sem texto adicional.`,
          },
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

  throw new Error('analise_ia_invalida');
}
