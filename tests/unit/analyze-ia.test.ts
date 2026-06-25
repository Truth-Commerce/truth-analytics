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

/** Build a fake Anthropic Message with a thinking block followed by a text block */
function fakeMessage(textContent: string) {
  return {
    id: 'msg_fake',
    type: 'message' as const,
    role: 'assistant' as const,
    model: serverEnv.ANALYSIS_MODEL,
    stop_reason: 'end_turn' as const,
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
  let claudeModuleRef: typeof import('@/modules/ai/claude');

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Re-import after reset so we get fresh module instances
    const claudeModule = await import('@/modules/ai/claude');
    claudeModuleRef = claudeModule;
    getAnthropic = claudeModule.getAnthropic;

    const analyzeModule = await import('@/modules/pipeline/steps/analyze-ia');
    analyzeWithIA = analyzeModule.analyzeWithIA;

    // Set up a fresh mock for messages.create
    mockCreate = vi.fn();
    vi.spyOn(claudeModule, 'getAnthropic').mockReturnValue({
      messages: { create: mockCreate },
    } as unknown as import('@anthropic-ai/sdk').default);
  });

  // -----------------------------------------------------------------------
  // Case 1: Happy path — first call returns valid JSON with thinking block
  // -----------------------------------------------------------------------
  it('Case 1 — happy path: retorna AnaliseIa validada e usa output_config + modelo correto', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));

    const result = await analyzeWithIA(validMetricas, 'eletronicos');

    expect(result).toEqual(validAnalise);

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
    // System prompt must be a string
    expect(typeof callArgs.system).toBe('string');
    expect(callArgs.system.length).toBeGreaterThan(0);
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

    mockCreate
      .mockResolvedValueOnce(fakeMessage(JSON.stringify(invalidAnalise)))
      .mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));

    const result = await analyzeWithIA(validMetricas, null);

    expect(result).toEqual(validAnalise);
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Second call must include the correction user message
    const secondCallMessages: { role: string; content: string }[] =
      mockCreate.mock.calls[1][0].messages;
    const lastMsg = secondCallMessages[secondCallMessages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toMatch(/responda APENAS com JSON válido/);
  });

  // -----------------------------------------------------------------------
  // Case 3: Both calls invalid → throws analise_ia_invalida
  // -----------------------------------------------------------------------
  it('Case 3 — ambas inválidas: lança analise_ia_invalida após exactamente 2 chamadas', async () => {
    // Both return non-JSON text
    mockCreate
      .mockResolvedValueOnce(fakeMessage('Não é JSON válido'))
      .mockResolvedValueOnce(fakeMessage('Também não é JSON'));

    await expect(analyzeWithIA(validMetricas, 'moda')).rejects.toThrow('analise_ia_invalida');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Case 4: benchmarkParcial=true → system prompt inclui aviso de dados incompletos
  // -----------------------------------------------------------------------
  it('Case 4 — benchmarkParcial: system prompt inclui aviso sobre benchmark incompleto', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));

    const metricasParciais: Metricas = { ...validMetricas, benchmarkParcial: true };
    await analyzeWithIA(metricasParciais, null);

    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.system).toMatch(/benchmarkParcial=true/);
    expect(callArgs.system).toMatch(/NÃO infira/);
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

    const result = await analyzeWithIA(validMetricas, null);
    expect(result.resumoExecutivo).toBe(validAnalise.resumoExecutivo);
  });

  // -----------------------------------------------------------------------
  // Case 6: sem chave — getAnthropic lança ia_nao_configurada e propaga
  // -----------------------------------------------------------------------
  it('Case 6 — sem chave: propaga ia_nao_configurada sem ser capturado como erro de parse', async () => {
    vi.spyOn(claudeModuleRef, 'getAnthropic').mockImplementation(() => {
      throw new Error('ia_nao_configurada');
    });

    await expect(analyzeWithIA(validMetricas, null)).rejects.toThrow('ia_nao_configurada');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Case 7: 1ª resposta sem bloco de texto (só thinking) → retry sem turno
  // assistant vazio; 2ª válida → resultado correto
  // -----------------------------------------------------------------------
  it('Case 7 — resposta sem texto: faz retry com turno user único (sem assistant vazio) e resolve na 2ª', async () => {
    mockCreate
      .mockResolvedValueOnce(fakeThinkingOnlyMessage())
      .mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));

    const result = await analyzeWithIA(validMetricas, null);

    expect(result).toEqual(validAnalise);
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // A 2ª chamada NÃO deve conter um turno assistant (evita content '' rejeitado pela API)
    const retryMessages: { role: string; content: string }[] = mockCreate.mock.calls[1][0].messages;
    expect(retryMessages.every((m) => m.role !== 'assistant')).toBe(true);
    expect(retryMessages).toHaveLength(1);
    expect(retryMessages[0].role).toBe('user');
    expect(retryMessages[0].content).toMatch(/não continha um bloco de texto/);
  });
});
