/**
 * Teste de integração fim-a-fim do orquestrador generateReport.
 *
 * Todos os externos são mockados:
 * - blingProvider.fetchOrders  → vi.spyOn (sem chamada real ao Bling)
 * - serpapiProvider.search / mlPublicoProvider.search → vi.spyOn (sem chamada real à API)
 * - analyzeWithIA (módulo analyze-ia) → vi.spyOn (sem chamada real ao Claude)
 * - email (sendReportReadyEmail / sendPipelineFailedEmail) → vi.spyOn (no-op spy)
 *
 * NOTA: generateReportAction (Server Action) não é testada aqui porque requer
 * sessão + redirect do Next.js — esses fluxos são cobertos por testes E2E.
 * A cobertura do orquestrador + plan-lock é a prioridade desta suite.
 */

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  connections,
  marketSnapshots,
  orders,
  organizations,
  reports,
  trackedProducts,
  users,
} from '@/db/schema';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { createQueuedReport } from '@/modules/reports/report.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ORDERS = [
  {
    blingOrderId: `bling-orch-${RUN}-1`,
    canal: 'Mercado Livre',
    data: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 dias atrás
    valorTotal: 300.0,
    frete: 10.0,
    itens: [{ sku: `SKU-ORCH-${RUN}`, nome: 'Produto Orq', quantidade: 3, valor: 90.0 }],
  },
];

const MOCK_MARKET_RESULT = {
  precos: [85.0, 95.0],
  bruto: { results: [] },
};

const MOCK_ANALISE: AnaliseIa = {
  resumoExecutivo: 'Desempenho positivo no período analisado.',
  gargalos: ['Custo de frete elevado'],
  sugestoesMelhoria: ['Negociar frete com transportadora'],
  ideiasVenda: ['Bundle com acessório complementar'],
  recomendacoesPreco: [
    {
      sku: `SKU-ORCH-${RUN}`,
      nome: 'Produto Orq',
      precoSugerido: 88.0,
      justificativa: 'Levemente abaixo da mediana do mercado para ganhar buy box',
    },
  ],
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.skipIf(!url)('orchestrator — integração fim-a-fim', () => {
  let orgId = '';
  const CLIENT_EMAIL = `client-orch-${RUN}@test.local`;

  beforeAll(async () => {
    // Seed org active com plano weekly
    const [o] = await tdb
      .insert(organizations)
      .values({
        name: `ta-test-orch-${RUN}`,
        status: 'active',
        plano: 'weekly',
        nicho: 'eletrônicos',
        proximo_relatorio_liberado_em: null,
      })
      .returning({ id: organizations.id });
    orgId = o.id;

    // Seed usuário cliente para que getOrgPrimaryEmail retorne um e-mail real
    await tdb.insert(users).values({
      org_id: orgId,
      email: CLIENT_EMAIL,
      senha_hash: 'hash-fake-test',
      role: 'client',
    });

    // Seed conexão Bling (status ok, token qualquer — fetchOrders é mockado)
    await tdb.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: 'fake-encrypted-access',
      refresh_token: 'fake-encrypted-refresh',
      expira_em: new Date(Date.now() + 3600 * 1000),
      status: 'ok',
    });

    // Seed um produto rastreado ativo para que collectMarket tenha algo a coletar
    await tdb.insert(trackedProducts).values({
      org_id: orgId,
      nome: `Produto Orq ${RUN}`,
      sku: `SKU-ORCH-${RUN}`,
      keywords: [`keyword-orch-${RUN}`],
      ativo: true,
    });
  });

  afterAll(async () => {
    // Cleanup na ordem de dependência (FK): filhos antes dos pais
    await tdb.delete(marketSnapshots).where(eq(marketSnapshots.org_id, orgId));
    await tdb.delete(orders).where(eq(orders.org_id, orgId));
    await tdb.delete(reports).where(eq(reports.org_id, orgId));
    await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, orgId));
    await tdb.delete(connections).where(eq(connections.org_id, orgId));
    await tdb.delete(users).where(eq(users.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------
  it('happy path: retorna done, report persiste metricas+analise_ia, trava setada', async () => {
    // Mock Bling
    const blingMod = await import('@/modules/providers/bling/provider');
    vi.spyOn(blingMod.blingProvider, 'fetchOrders').mockResolvedValueOnce(MOCK_ORDERS);

    // Mock provedores de mercado
    const serpapiMod = await import('@/modules/market/serpapi');
    const mlMod = await import('@/modules/market/ml-publico');
    vi.spyOn(serpapiMod.serpapiProvider, 'search').mockResolvedValue(MOCK_MARKET_RESULT);
    vi.spyOn(mlMod.mlPublicoProvider, 'search').mockResolvedValue(MOCK_MARKET_RESULT);

    // Mock analyzeWithIA (evita chamada real ao Claude — sem ANTHROPIC_API_KEY necessária)
    const analyzeMod = await import('@/modules/pipeline/steps/analyze-ia');
    const analyzeSpyHappy = vi.spyOn(analyzeMod, 'analyzeWithIA').mockResolvedValueOnce(MOCK_ANALISE);

    // Mock e-mail (no-op spies)
    const emailMod = await import('@/modules/notifications/email');
    const readySpy = vi.spyOn(emailMod, 'sendReportReadyEmail').mockResolvedValue(undefined);
    const failedSpy = vi.spyOn(emailMod, 'sendPipelineFailedEmail').mockResolvedValue(undefined);

    const { generateReport } = await import('@/modules/pipeline/orchestrator');
    const agora = new Date();
    const inicio = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const queuedId = await createQueuedReport(orgId, { inicio, fim: agora });
    const result = await generateReport(queuedId);

    // Retorno correto
    expect(result.status).toBe('done');
    expect(result.reportId).toBe(queuedId);

    // Report no banco: done + metricas + analise_ia preenchidos
    const [reportRow] = await tdb
      .select()
      .from(reports)
      .where(and(eq(reports.id, result.reportId), eq(reports.org_id, orgId)));

    expect(reportRow).toBeDefined();
    expect(reportRow.status).toBe('done');
    expect(reportRow.etapa).toBeNull();
    expect(reportRow.metricas).not.toBeNull();
    expect(reportRow.analise_ia).not.toBeNull();
    expect(reportRow.erro).toBeNull();

    // Métricas: ao menos ticketMedio presente
    const metricas = reportRow.metricas as Metricas;
    expect(typeof metricas.ticketMedio).toBe('number');
    expect(metricas.benchmarkParcial).toBe(false);

    // Analise IA: vinda do mock
    const analise = reportRow.analise_ia as AnaliseIa;
    expect(analise.resumoExecutivo).toBe(MOCK_ANALISE.resumoExecutivo);

    // Trava do plano: proximo_relatorio_liberado_em ≈ agora + 7d (weekly)
    const [orgRow] = await tdb
      .select({ proximo: organizations.proximo_relatorio_liberado_em })
      .from(organizations)
      .where(eq(organizations.id, orgId));

    expect(orgRow.proximo).not.toBeNull();
    const agoraMs = Date.now();
    const semanaMsMin = agoraMs + 7 * 24 * 60 * 60 * 1000 - 60_000; // tolerância ±1 min
    const semanaMsMax = agoraMs + 7 * 24 * 60 * 60 * 1000 + 60_000;
    expect(orgRow.proximo!.getTime()).toBeGreaterThanOrEqual(semanaMsMin);
    expect(orgRow.proximo!.getTime()).toBeLessThanOrEqual(semanaMsMax);

    // analyzeWithIA foi chamado
    expect(analyzeSpyHappy).toHaveBeenCalledTimes(1);

    // E-mail de relatório pronto enviado ao cliente (clientEmail resolvido via getOrgPrimaryEmail)
    expect(readySpy).toHaveBeenCalledTimes(1);
    expect(readySpy).toHaveBeenCalledWith(CLIENT_EMAIL, result.reportId);

    // E-mail de falha NÃO deve ter sido chamado
    expect(failedSpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Bling hard-fail path
  // -------------------------------------------------------------------------
  it('bling hard-fail: retorna failed, report.erro setado, trava NÃO consumida', async () => {
    // Limpar trava setada pelo happy path para este teste ser isolado
    await tdb
      .update(organizations)
      .set({ proximo_relatorio_liberado_em: null })
      .where(eq(organizations.id, orgId));

    // Mock Bling lançando erro (falha dura)
    const blingMod = await import('@/modules/providers/bling/provider');
    vi.spyOn(blingMod.blingProvider, 'fetchOrders').mockRejectedValueOnce(
      new Error('bling_indisponivel_503'),
    );

    // Mock provedores de mercado (não devem chegar a ser chamados neste path,
    // mas mockamos para evitar chamadas reais caso a lógica mude)
    const serpapiMod = await import('@/modules/market/serpapi');
    const mlMod = await import('@/modules/market/ml-publico');
    vi.spyOn(serpapiMod.serpapiProvider, 'search').mockResolvedValue(MOCK_MARKET_RESULT);
    vi.spyOn(mlMod.mlPublicoProvider, 'search').mockResolvedValue(MOCK_MARKET_RESULT);

    // Mock analyzeWithIA (não deve ser chamado)
    const analyzeMod = await import('@/modules/pipeline/steps/analyze-ia');
    const analyzeSpyFail = vi.spyOn(analyzeMod, 'analyzeWithIA').mockResolvedValue(MOCK_ANALISE);

    // Mock e-mail
    const emailMod = await import('@/modules/notifications/email');
    const readySpy = vi.spyOn(emailMod, 'sendReportReadyEmail').mockResolvedValue(undefined);
    const failedSpy = vi.spyOn(emailMod, 'sendPipelineFailedEmail').mockResolvedValue(undefined);

    // Mock getAdminAlertEmail para retornar um e-mail de alerta (evita dependência de env)
    const recipientsMod = await import('@/modules/notifications/recipients');
    vi.spyOn(recipientsMod, 'getAdminAlertEmail').mockReturnValue('admin@truth.com');

    const { generateReport } = await import('@/modules/pipeline/orchestrator');
    const agora = new Date();
    const inicio = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const queuedId = await createQueuedReport(orgId, { inicio, fim: agora });
    const result = await generateReport(queuedId);

    // Retorno: failed
    expect(result.status).toBe('failed');
    expect(result.reportId).toBe(queuedId);

    // Report no banco: failed + erro preenchido
    const [reportRow] = await tdb
      .select()
      .from(reports)
      .where(and(eq(reports.id, result.reportId), eq(reports.org_id, orgId)));

    expect(reportRow).toBeDefined();
    expect(reportRow.status).toBe('failed');
    expect(reportRow.erro).toContain('bling_indisponivel_503');
    // etapa preservada onde o pipeline morreu (coleta) — diagnóstico
    expect(reportRow.etapa).toBe('coletando_vendas');
    // metricas e analise_ia devem ser null
    expect(reportRow.metricas).toBeNull();
    expect(reportRow.analise_ia).toBeNull();

    // TRAVA NÃO CONSUMIDA: proximo permanece null
    const [orgRow] = await tdb
      .select({ proximo: organizations.proximo_relatorio_liberado_em })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(orgRow.proximo).toBeNull();

    // analyzeWithIA NÃO chamado (pipeline falhou antes)
    expect(analyzeSpyFail).not.toHaveBeenCalled();

    // E-mail de falha chamado 1x com nova assinatura: (to, orgId, reportId, erro)
    expect(failedSpy).toHaveBeenCalledTimes(1);
    expect(failedSpy).toHaveBeenCalledWith(
      'admin@truth.com',
      orgId,
      result.reportId,
      expect.stringContaining('bling_indisponivel_503'),
    );

    // E-mail de sucesso NÃO chamado
    expect(readySpy).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Idempotência de re-POST
  // -------------------------------------------------------------------------
  it('re-executar generateReport de um report não-queued retorna ignorado', async () => {
    // Mock Bling rejeitando: 1ª execução falha rápido (sem chamada real), consome o queued
    const blingMod = await import('@/modules/providers/bling/provider');
    vi.spyOn(blingMod.blingProvider, 'fetchOrders').mockRejectedValue(
      new Error('bling_indisponivel_503'),
    );

    // Mercado mockado para evitar chamada real (roda em paralelo à coleta Bling)
    const serpapiMod = await import('@/modules/market/serpapi');
    const mlMod = await import('@/modules/market/ml-publico');
    vi.spyOn(serpapiMod.serpapiProvider, 'search').mockResolvedValue(MOCK_MARKET_RESULT);
    vi.spyOn(mlMod.mlPublicoProvider, 'search').mockResolvedValue(MOCK_MARKET_RESULT);

    // Sem e-mail de alerta admin: evita envio real na 1ª (failed)
    const recipientsMod = await import('@/modules/notifications/recipients');
    vi.spyOn(recipientsMod, 'getAdminAlertEmail').mockReturnValue(null);

    const { generateReport } = await import('@/modules/pipeline/orchestrator');
    const agora = new Date();
    const inicio = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const reportId = await createQueuedReport(orgId, { inicio, fim: agora });

    await generateReport(reportId); // 1ª execução consome o queued (→ failed)
    const segunda = await generateReport(reportId);
    expect(segunda.status).toBe('ignorado');
    expect(segunda.reportId).toBe(reportId);
  });
});
