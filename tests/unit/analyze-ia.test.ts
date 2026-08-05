import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock the Anthropic SDK so no real network call is ever made.
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn(),
      },
    })),
  };
});

// We import the claude module lazily inside tests so we can spyOn getAnthropic
// after the mock above is established.

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

import type { AnaliseIa } from '@/modules/pipeline/contracts';
import type { Metricas } from '@/modules/pipeline/contracts';
import type { AnalysisContext } from '@/modules/pipeline/steps/analyze-ia';
import { serverEnv } from '@/lib/env';

const validAnalise: AnaliseIa = {
  resumoExecutivo: 'Performance positiva no período com crescimento em marketplaces.',
  gargalos: ['Frete elevado para a região Sul', 'Taxa de cancelamento acima da média'],
  sugestoesMelhoria: [
    'Negociar contrato com transportadora para reduzir frete',
    'Ativar revisão automática de pedidos suspeitos',
  ],
  ideiasVenda: ['Bundle do SKU-001 com acessório complementar', 'Promoção relâmpago às quintas-feiras'],
  recomendacoesPreco: [
    {
      sku: 'SKU-001',
      nome: 'Produto A',
      precoSugerido: 97.5,
      justificativa: 'Abaixar levemente para ganhar buy box no Mercado Livre',
    },
  ],
};

const validMetricas: Metricas = {
  vendasPorCanal: [{ canal: 'Mercado Livre', total: 5000, pedidos: 50 }],
  evolucao: [{ data: '2026-06-01', total: 5000 }],
  ticketMedio: 100,
  topProdutos: [{ nome: 'Produto A', sku: 'SKU-001', quantidade: 50, receita: 5000 }],
  posicaoPreco: [
    { sku: 'SKU-001', nome: 'Produto A', nossoPreco: 99.9, precoMercadoMediano: 97.5, fonte: 'ml_publico' },
  ],
  benchmarkParcial: false,
};

// Prompt v2 (Task 4): analyzeWithIA agora recebe AnalysisContext no lugar de `nicho`.
// Fixture mínimo — o conteúdo não afeta as asserções de mecânica (retry/parse/usage);
// o system continua checado via avisoBenchmark(metricas) e o user via as métricas em JSON.
const CONTEXTO: AnalysisContext = {
  orgName: 'Loja Teste',
  nicho: 'eletronicos',
  plano: 'monthly',
  periodo: { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-30T23:59:59Z') },
  metaMensal: null,
  totalMesCorrente: 0,
  relatorioAnterior: null,
  datasComerciais: [],
  contextoAnual: null,
};

/** Build a fake Anthropic Message with a thinking block followed by a text block */
function fakeMessage(textContent: string, stopReason: string = 'end_turn') {
  return {
    id: 'msg_fake',
    type: 'message' as const,
    role: 'assistant' as const,
    model: serverEnv.ANALYSIS_MODEL,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 200, thinking_tokens: 50 },
    content: [
      { type: 'thinking', thinking: 'Reasoning block that should be skipped' },
      { type: 'text', text: textContent },
    ],
  };
}

/** Build a fake Message with NO text block (only thinking) — extractTextBlock → null */
function fakeThinkingOnlyMessage() {
  return {
    id: 'msg_fake_thinking',
    type: 'message' as const,
    role: 'assistant' as const,
    model: serverEnv.ANALYSIS_MODEL,
    stop_reason: 'end_turn' as const,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 200, thinking_tokens: 80 },
    content: [{ type: 'thinking', thinking: 'Only reasoning, no text block emitted' }],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('analyzeWithIA', () => {
  // Dynamically import both modules after mocks are in place
  let getAnthropic: typeof import('@/modules/ai/claude').getAnthropic;
  let analyzeWithIA: typeof import('@/modules/pipeline/steps/analyze-ia').analyzeWithIA;
  let mockCreate: ReturnType<typeof vi.fn>;
  let mockStream: ReturnType<typeof vi.fn>;
  let claudeModuleRef: typeof import('@/modules/ai/claude');

  /** Registra a resposta da retentativa (via messages.stream(...).finalMessage()). */
  function streamDevolve(msg: unknown) {
    mockStream.mockReturnValueOnce({ finalMessage: async () => msg });
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Re-import after reset so we get fresh module instances
    const claudeModule = await import('@/modules/ai/claude');
    claudeModuleRef = claudeModule;
    getAnthropic = claudeModule.getAnthropic;

    const analyzeModule = await import('@/modules/pipeline/steps/analyze-ia');
    analyzeWithIA = analyzeModule.analyzeWithIA;

    // Set up fresh mocks for messages.create (1ª tentativa) e messages.stream (retentativa)
    mockCreate = vi.fn();
    mockStream = vi.fn();
    vi.spyOn(claudeModule, 'getAnthropic').mockReturnValue({
      messages: { create: mockCreate, stream: mockStream },
    } as unknown as import('@anthropic-ai/sdk').default);
  });

  // -----------------------------------------------------------------------
  // Case 1: Happy path — first call returns valid JSON with thinking block
  // -----------------------------------------------------------------------
  it('Case 1 — happy path: retorna AnaliseIa validada e usa output_config + modelo correto', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));

    const result = await analyzeWithIA(validMetricas, CONTEXTO);

    expect(result.analise).toEqual(validAnalise);

    // usage da 1ª tentativa persistível (fakeMessage: input 100 / output 200)
    expect(result.usage).toEqual({
      input_tokens: 100,
      output_tokens: 200,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      tentativas: 1,
    });

    // Verify create was called exactly once
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Verify request shape
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.model).toBe(serverEnv.ANALYSIS_MODEL);
    expect(callArgs.max_tokens).toBe(16000);
    expect(callArgs.thinking).toEqual({ type: 'adaptive' });
    expect(callArgs.output_config.format.type).toBe('json_schema');
    expect(callArgs.output_config.effort).toBe('high');
    // JSON schema must have the AnaliseIa fields
    expect(callArgs.output_config.format.schema).toHaveProperty('properties');
    // Must NOT have a top-level $schema key (stripped for API compatibility)
    expect(callArgs.output_config.format.schema).not.toHaveProperty('$schema');
    // System prompt must be um array de blocos de texto (prompt caching)
    expect(Array.isArray(callArgs.system)).toBe(true);
    expect(callArgs.system[0].type).toBe('text');
    expect(callArgs.system[0].text.length).toBeGreaterThan(0);
  });

  // -----------------------------------------------------------------------
  // Case 1b: prompt caching — cache_control no system e no bloco de métricas
  // -----------------------------------------------------------------------
  it('Case 1b — usa cache_control no system e no bloco de métricas', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));
    await analyzeWithIA(validMetricas, CONTEXTO);
    const params = mockCreate.mock.calls[0][0];

    // system como array de blocos com cache_control ephemeral
    expect(Array.isArray(params.system)).toBe(true);
    expect(params.system[0].type).toBe('text');
    expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });

    // 1º turno user: bloco de texto com métricas + cache_control
    const user = params.messages[0];
    expect(user.role).toBe('user');
    expect(user.content[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(user.content[0].text).toContain('Métricas do período');
  });

  // -----------------------------------------------------------------------
  // Case 1c: retry envia correção curta (só o erro + instrução, sem métricas)
  // -----------------------------------------------------------------------
  it('Case 1c — retry envia correção curta: só o erro + instrução, sem repetir as métricas', async () => {
    const invalidAnalise = {
      gargalos: ['Frete alto'],
      sugestoesMelhoria: ['Negociar frete'],
      ideiasVenda: ['Bundle'],
      recomendacoesPreco: [],
      // resumoExecutivo ausente → falha AnaliseIaSchema.parse
    };

    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(invalidAnalise)));
    streamDevolve(fakeMessage(JSON.stringify(validAnalise)));

    await analyzeWithIA(validMetricas, CONTEXTO);
    const paramsRetry = mockStream.mock.calls[0][0];
    const turnos = paramsRetry.messages;

    expect(paramsRetry.max_tokens).toBe(32000);
    expect(turnos).toHaveLength(3); // user(métricas, cacheada) + assistant(inválida) + user(correção)
    const correcao = turnos[2];
    expect(correcao.role).toBe('user');
    const textoCorrecao =
      typeof correcao.content === 'string' ? correcao.content : correcao.content[0].text;
    expect(textoCorrecao).not.toContain('Métricas do período'); // NÃO repete as métricas
    expect(textoCorrecao).toContain('JSON válido');
    expect(textoCorrecao.length).toBeLessThan(700); // erro truncado a 500 + instrução
  });

  // -----------------------------------------------------------------------
  // Case 2: Retry success — first call invalid, second valid
  // -----------------------------------------------------------------------
  it('Case 2 — retry: primeira resposta inválida, segunda válida → retorna resultado correto e chama create 2x', async () => {
    // First: missing required field resumoExecutivo
    const invalidAnalise = {
      gargalos: ['Frete alto'],
      sugestoesMelhoria: ['Negociar frete'],
      ideiasVenda: ['Bundle'],
      recomendacoesPreco: [],
      // resumoExecutivo missing — will fail AnaliseIaSchema.parse
    };

    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(invalidAnalise)));
    streamDevolve(fakeMessage(JSON.stringify(validAnalise)));

    const result = await analyzeWithIA(validMetricas, CONTEXTO);

    expect(result.analise).toEqual(validAnalise);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockStream).toHaveBeenCalledTimes(1);

    // usage somado das 2 tentativas (input 100 + 100 = 200; 2 tentativas)
    expect(result.usage.input_tokens).toBe(200);
    expect(result.usage.tentativas).toBe(2);

    // Second call must include the correction user message
    const secondCallMessages: { role: string; content: string }[] =
      mockStream.mock.calls[0][0].messages;
    const lastMsg = secondCallMessages[secondCallMessages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toMatch(/Responda APENAS com o objeto JSON válido/);
  });

  // -----------------------------------------------------------------------
  // Case 3: Both calls invalid → throws analise_ia_invalida
  // -----------------------------------------------------------------------
  it('Case 3 — ambas inválidas: lança analise_ia_invalida após exactamente 2 chamadas', async () => {
    // Both return non-JSON text
    mockCreate.mockResolvedValueOnce(fakeMessage('Não é JSON válido'));
    streamDevolve(fakeMessage('Também não é JSON'));

    await expect(analyzeWithIA(validMetricas, CONTEXTO)).rejects.toThrow('analise_ia_invalida');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockStream).toHaveBeenCalledTimes(1);
  });

  it('Case 3b — parse inválido na retentativa: loga o parseError antes do throw final', async () => {
    const loggerModule = await import('@/lib/logger');
    const errorSpy = vi.spyOn(loggerModule.logger, 'error').mockImplementation(() => {});

    mockCreate.mockResolvedValueOnce(fakeMessage('Não é JSON válido'));
    streamDevolve(fakeMessage('Também não é JSON'));

    await expect(analyzeWithIA(validMetricas, CONTEXTO)).rejects.toThrow('analise_ia_invalida');

    const chamada = errorSpy.mock.calls.find((c) => c[0] === 'analise_ia.retentativa_invalida');
    expect(chamada).toBeDefined();
    const ctx = chamada![1] as { parseError?: unknown };
    expect(typeof ctx.parseError).toBe('string');
    expect((ctx.parseError as string).length).toBeGreaterThan(0);
    // Mensagem curta — truncada em 500 chars como na 1ª tentativa
    expect((ctx.parseError as string).length).toBeLessThanOrEqual(500);

    errorSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // Case 4: benchmarkParcial=true → system prompt inclui aviso de dados incompletos
  // -----------------------------------------------------------------------
  it('Case 4 — benchmarkParcial: system prompt inclui aviso sobre benchmark incompleto', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));

    const metricasParciais: Metricas = { ...validMetricas, benchmarkParcial: true };
    await analyzeWithIA(metricasParciais, CONTEXTO);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system[0].text).toMatch(/benchmarkParcial=true/);
    expect(callArgs.system[0].text).toMatch(/NÃO infira/);
  });

  it('Case 4b — sem benchmark NENHUM: instrução positiva (mix/canais/regularidade, sem recomendacoesPreco)', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));
    const semMercado: Metricas = {
      ...validMetricas,
      benchmarkParcial: true,
      posicaoPreco: [
        { sku: 'SKU-001', nome: 'Produto A', nossoPreco: 99.9, precoMercadoMediano: 0, fonte: '' },
      ],
    };
    await analyzeWithIA(semMercado, CONTEXTO);
    const sys = mockCreate.mock.calls[0][0].system[0].text;
    expect(sys).toMatch(/NENHUM benchmark/);
    expect(sys).toMatch(/recomendacoesPreco/);
    expect(sys).toMatch(/canais/);
    expect(sys).not.toMatch(/benchmarkParcial=true/); // não é o aviso de parcial
  });

  it('Case 4c — fonte única com benchmark completo: cita a fonte, sem hedging', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));
    await analyzeWithIA(validMetricas, CONTEXTO); // benchmarkParcial=false, fonte única ml_publico
    const sys = mockCreate.mock.calls[0][0].system[0].text;
    expect(sys).toMatch(/única fonte \(ml_publico\)/);
    expect(sys).not.toMatch(/INCOMPLETO/);
  });

  // -----------------------------------------------------------------------
  // Case 5: Content array com thinking block primeiro — extrai o bloco texto corretamente
  // -----------------------------------------------------------------------
  it('Case 5 — thinking block: extrai texto do bloco correto quando thinking vem primeiro', async () => {
    // fakeMessage already puts thinking first — this is explicit verification
    const msg = fakeMessage(JSON.stringify(validAnalise));
    expect(msg.content[0].type).toBe('thinking'); // ensure fixture order
    expect(msg.content[1].type).toBe('text');

    mockCreate.mockResolvedValueOnce(msg);

    const result = await analyzeWithIA(validMetricas, CONTEXTO);
    expect(result.analise.resumoExecutivo).toBe(validAnalise.resumoExecutivo);
  });

  // -----------------------------------------------------------------------
  // Case 6: sem chave — getAnthropic lança ia_nao_configurada e propaga
  // -----------------------------------------------------------------------
  it('Case 6 — sem chave: propaga ia_nao_configurada sem ser capturado como erro de parse', async () => {
    vi.spyOn(claudeModuleRef, 'getAnthropic').mockImplementation(() => {
      throw new Error('ia_nao_configurada');
    });

    await expect(analyzeWithIA(validMetricas, CONTEXTO)).rejects.toThrow('ia_nao_configurada');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Case 7: 1ª resposta sem bloco de texto (só thinking) → retry sem turno
  // assistant vazio; 2ª válida → resultado correto
  // -----------------------------------------------------------------------
  it('Case 7 — resposta sem texto: faz retry com turno user único (sem assistant vazio) e resolve na 2ª', async () => {
    mockCreate.mockResolvedValueOnce(fakeThinkingOnlyMessage());
    streamDevolve(fakeMessage(JSON.stringify(validAnalise)));

    const result = await analyzeWithIA(validMetricas, CONTEXTO);

    expect(result.analise).toEqual(validAnalise);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockStream).toHaveBeenCalledTimes(1);

    // A 2ª chamada NÃO deve conter um turno assistant (evita content '' rejeitado pela API):
    // apenas o bloco de métricas cacheado + o turno user de correção curta.
    const retryMessages: { role: string; content: unknown }[] = mockStream.mock.calls[0][0].messages;
    expect(retryMessages.every((m) => m.role !== 'assistant')).toBe(true);
    expect(retryMessages).toHaveLength(2);
    expect(retryMessages[0].role).toBe('user');
    expect(retryMessages[1].role).toBe('user');
    const corr =
      typeof retryMessages[1].content === 'string'
        ? retryMessages[1].content
        : (retryMessages[1].content as { text: string }[])[0].text;
    expect(corr).toMatch(/Responda APENAS com o objeto JSON válido/);
    expect(corr).not.toContain('Métricas do período');
  });

  // -----------------------------------------------------------------------
  // Case 8: refusal na 1ª tentativa → analise_ia_recusada, sem retry
  // -----------------------------------------------------------------------
  it('Case 8 — refusal na 1ª tentativa: lança analise_ia_recusada sem retry', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage('', 'refusal'));
    await expect(analyzeWithIA(validMetricas, CONTEXTO)).rejects.toThrow('analise_ia_recusada');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockStream).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Case 9: max_tokens na 1ª → retenta via stream (32000, MESMAS mensagens)
  // -----------------------------------------------------------------------
  it('Case 9 — max_tokens na 1ª: retenta via stream com 32000 e as MESMAS mensagens (sem turno de correção)', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage('{"truncado":', 'max_tokens'));
    streamDevolve(fakeMessage(JSON.stringify(validAnalise)));

    const result = await analyzeWithIA(validMetricas, CONTEXTO);
    expect(result.analise).toEqual(validAnalise);
    expect(result.usage.tentativas).toBe(2);

    const retry = mockStream.mock.calls[0][0];
    expect(retry.max_tokens).toBe(32000);
    // truncamento NÃO adiciona turno de correção: só o turno user original
    expect(retry.messages).toHaveLength(1);
    expect(retry.messages[0].role).toBe('user');
  });

  // -----------------------------------------------------------------------
  // Case 10: max_tokens nas DUAS tentativas → analise_ia_truncada
  // -----------------------------------------------------------------------
  it('Case 10 — max_tokens nas DUAS tentativas: lança analise_ia_truncada', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage('{"truncado":', 'max_tokens'));
    streamDevolve(fakeMessage('{"ainda_truncado":', 'max_tokens'));
    await expect(analyzeWithIA(validMetricas, CONTEXTO)).rejects.toThrow('analise_ia_truncada');
  });

  // -----------------------------------------------------------------------
  // Case 11: refusal na retentativa → analise_ia_recusada
  // -----------------------------------------------------------------------
  it('Case 11 — refusal na retentativa: lança analise_ia_recusada', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage('Não é JSON válido'));
    streamDevolve(fakeMessage('', 'refusal'));
    await expect(analyzeWithIA(validMetricas, CONTEXTO)).rejects.toThrow('analise_ia_recusada');
  });
});
