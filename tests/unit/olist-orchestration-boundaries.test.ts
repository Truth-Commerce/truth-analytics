import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimQueuedReport: vi.fn(),
  markReportFailed: vi.fn(),
  selectResult: [] as Array<{ orgId: string }>,
  getOrganizationById: vi.fn(),
  collectOrders: vi.fn(),
  collectMarket: vi.fn(),
  enrichOrders: vi.fn(),
  computeMetrics: vi.fn(),
  buildAnalysisContext: vi.fn(),
  analyzeWithIA: vi.fn(),
  finalize: vi.fn(),
  executarExtrasPosFinalize: vi.fn(),
  getLastSyncAtForSource: vi.fn(),
  touchLastSyncAtForSource: vi.fn(),
  collectBlingOrders: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
vi.mock('@/db/schema', () => ({ reports: { id: 'id', org_id: 'org_id' } }));
vi.mock('@/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => mocks.selectResult }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  },
}));
vi.mock('@/modules/reports/report.repository', () => ({
  claimQueuedReport: mocks.claimQueuedReport,
  markReportFailed: mocks.markReportFailed,
}));
vi.mock('@/modules/admin/admin.repository', () => ({ getOrganizationById: mocks.getOrganizationById }));
vi.mock('@/modules/notifications/email', () => ({ sendPipelineFailedEmail: vi.fn() }));
vi.mock('@/modules/notifications/recipients', () => ({ getAdminAlertEmail: vi.fn(), getOrgPrimaryEmail: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }) }));
vi.mock('@/modules/pipeline/steps/collect-orders', () => ({ collectOrders: mocks.collectOrders }));
vi.mock('@/modules/pipeline/steps/collect-market', () => ({ collectMarket: mocks.collectMarket }));
vi.mock('@/modules/pipeline/steps/enrich-orders', () => ({ enrichOrders: mocks.enrichOrders }));
vi.mock('@/modules/pipeline/steps/compute-metrics', () => ({ computeMetrics: mocks.computeMetrics }));
vi.mock('@/modules/pipeline/steps/analysis-context', () => ({ buildAnalysisContext: mocks.buildAnalysisContext }));
vi.mock('@/modules/pipeline/steps/analyze-ia', () => ({ analyzeWithIA: mocks.analyzeWithIA }));
vi.mock('@/modules/pipeline/steps/finalize', () => ({ finalize: mocks.finalize }));
vi.mock('@/modules/pipeline/steps/pos-finalize-extras', () => ({ executarExtrasPosFinalize: mocks.executarExtrasPosFinalize }));
vi.mock('@/modules/connections/provider-connection.repository', () => ({
  getLastSyncAtForSource: mocks.getLastSyncAtForSource,
  touchLastSyncAtForSource: mocks.touchLastSyncAtForSource,
}));
vi.mock('@/modules/pipeline/steps/collect-bling', () => ({ collectBlingOrders: mocks.collectBlingOrders }));

const reportId = '11111111-1111-1111-1111-111111111111';
const source = { orgId: 'org-olist', provider: 'olist' as const, sourceGeneration: 4 };

function arrangeSuccessfulOlistReport() {
  mocks.claimQueuedReport.mockResolvedValue({
    ...source,
    periodo: { inicio: new Date('2026-07-01T00:00:00Z'), fim: new Date('2026-07-31T00:00:00Z') },
  });
  mocks.getOrganizationById.mockResolvedValue({ id: source.orgId, name: 'Org', plano: 'weekly', nicho: 'casa' });
  mocks.collectOrders.mockResolvedValue({ processados: 1, total: 1, incompleto: false });
  mocks.collectMarket.mockResolvedValue({ benchmarkParcial: false });
  mocks.enrichOrders.mockResolvedValue({ processados: 1, incompleto: false });
  mocks.computeMetrics.mockResolvedValue({ ticketMedio: 10, topProdutos: [] });
  mocks.buildAnalysisContext.mockResolvedValue({});
  mocks.analyzeWithIA.mockResolvedValue({ analise: {}, usage: {} });
  mocks.finalize.mockResolvedValue(undefined);
  mocks.executarExtrasPosFinalize.mockResolvedValue(undefined);
}

afterEach(() => {
  vi.clearAllMocks();
  mocks.selectResult = [];
  vi.useRealTimers();
});

describe('generateReport — falhas durante o claim', () => {
  it('persiste failed e retorna failed quando o CAS aceita um erro inesperado de claim', async () => {
    const unexpected = new Error('falha_inesperada_claim');
    mocks.claimQueuedReport.mockRejectedValue(unexpected);
    mocks.markReportFailed.mockResolvedValue(true);

    const { generateReport } = await import('@/modules/pipeline/orchestrator');

    await expect(generateReport(reportId)).resolves.toEqual({ reportId, status: 'failed' });
    expect(mocks.markReportFailed).toHaveBeenCalledWith(reportId, 'falha_inesperada_claim');
  });

  it('relança o erro inesperado quando outro executor já venceu o CAS', async () => {
    const unexpected = new Error('falha_inesperada_claim');
    mocks.claimQueuedReport.mockRejectedValue(unexpected);
    mocks.markReportFailed.mockResolvedValue(false);

    const { generateReport } = await import('@/modules/pipeline/orchestrator');

    await expect(generateReport(reportId)).rejects.toBe(unexpected);
    expect(mocks.markReportFailed).toHaveBeenCalledWith(reportId, 'falha_inesperada_claim');
  });

  it('não tenta um segundo CAS quando claim já persistiu sem_conexao_erp', async () => {
    mocks.claimQueuedReport.mockRejectedValue(new Error('sem_conexao_erp'));

    const { generateReport } = await import('@/modules/pipeline/orchestrator');

    await expect(generateReport(reportId)).resolves.toEqual({ reportId, status: 'failed' });
    expect(mocks.markReportFailed).not.toHaveBeenCalled();
  });
});

describe('Olist — orçamento de deadline compartilhado', () => {
  it('repassa o mesmo deadline de coleta para enriquecimento do report', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'));
    arrangeSuccessfulOlistReport();

    const { generateReport } = await import('@/modules/pipeline/orchestrator');

    await expect(generateReport(reportId)).resolves.toEqual({ reportId, status: 'done' });
    const collectDeadline = vi.mocked(mocks.collectOrders).mock.calls[0]![2]!.deadlineAt;
    const enrichDeadline = vi.mocked(mocks.enrichOrders).mock.calls[0]![1]!.deadlineAt;
    expect(collectDeadline).toBe(Date.now() + 240_000);
    expect(enrichDeadline).toBe(collectDeadline);
  });

  it('repassa o mesmo deadline de coleta para enriquecimento do sync', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-30T12:00:00Z'));
    mocks.getLastSyncAtForSource.mockResolvedValue(new Date('2026-07-30T11:00:00Z'));
    mocks.collectOrders.mockResolvedValue({ processados: 1, total: 1, incompleto: false });
    mocks.enrichOrders.mockResolvedValue({ processados: 1, incompleto: false });

    const { sincronizarPedidosDaOrg } = await import('@/modules/pipeline/sync-pedidos');

    await sincronizarPedidosDaOrg(source, new Date('2026-07-30T12:00:00Z'));
    const collectDeadline = vi.mocked(mocks.collectOrders).mock.calls[0]![2]!.deadlineAt;
    const enrichDeadline = vi.mocked(mocks.enrichOrders).mock.calls[0]![1]!.deadlineAt;
    expect(collectDeadline).toBe(Date.now() + 240_000);
    expect(enrichDeadline).toBe(collectDeadline);
  });
});
