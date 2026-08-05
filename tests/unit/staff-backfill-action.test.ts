import { beforeEach, describe, expect, it, vi } from 'vitest';

const autorizado = { id: 'user-1', orgId: 'org-interna', role: 'analista', orgStatus: 'active', plano: null };
const requireAnalista = vi.fn(async () => autorizado);
const assertOrgAccess = vi.fn(async () => undefined);
const getActiveErpConnection = vi.fn();
const collectOrders = vi.fn(async () => ({ processados: 42, total: 42 }));
const enrichOrders = vi.fn(async () => ({ enriquecidos: 10, falhas: 0, restantes: 32, incompleto: true, quarentenados: 0 }));
const recordAudit = vi.fn(async () => undefined);

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/auth/require-analista', () => ({ requireAnalista }));
vi.mock('@/modules/analista/analista.repository', () => ({ assertOrgAccess }));
vi.mock('@/modules/connections/active-provider.repository', () => ({ getActiveErpConnection }));
vi.mock('@/modules/pipeline/steps/collect-orders', () => ({ collectOrders }));
vi.mock('@/modules/pipeline/steps/enrich-orders', () => ({ enrichOrders }));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit }));

const form = (orgId: string) => {
  const fd = new FormData();
  fd.set('orgId', orgId);
  return fd;
};

describe('staffBackfillHistoricoAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('coleta 12 meses, roda um lote de enriquecimento e devolve pendencias', async () => {
    getActiveErpConnection.mockResolvedValue({ orgId: 'org-a', provider: 'bling', sourceGeneration: 1 });
    const { staffBackfillHistoricoAction } = await import('@/actions/staff.actions');
    const result = await staffBackfillHistoricoAction({}, form('org-a'));
    expect(result).toMatchObject({ ok: true, processados: 42, pendentesEnriquecimento: 32 });
    const [, periodo] = collectOrders.mock.calls[0] as unknown as [unknown, { inicio: Date; fim: Date }];
    expect(periodo.inicio.toISOString()).toMatch(/-01T03:00:00\.000Z$/); // 1º do mês SP
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'desempenho.backfill_disparado' }));
  });

  it('falha parcial nao corrompe: erro do Bling vira mensagem pt-BR sem lancar e sem gravar auditoria', async () => {
    getActiveErpConnection.mockResolvedValue({ orgId: 'org-a', provider: 'bling', sourceGeneration: 1 });
    collectOrders.mockRejectedValueOnce(new Error('bling_timeout'));
    const { staffBackfillHistoricoAction } = await import('@/actions/staff.actions');
    await expect(staffBackfillHistoricoAction({}, form('org-a'))).resolves.toEqual({
      error: 'Falha ao sincronizar com o Bling. Tente novamente em alguns minutos.',
    });
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('recusa org sem ERP ativo', async () => {
    getActiveErpConnection.mockResolvedValue(null);
    const { staffBackfillHistoricoAction } = await import('@/actions/staff.actions');
    expect(await staffBackfillHistoricoAction({}, form('org-a'))).toEqual({ error: 'Nenhum ERP ativo para este cliente.' });
  });

  it('recusa ERP ativo que nao seja Bling', async () => {
    getActiveErpConnection.mockResolvedValue({ orgId: 'org-a', provider: 'olist', sourceGeneration: 1 });
    const { staffBackfillHistoricoAction } = await import('@/actions/staff.actions');
    expect(await staffBackfillHistoricoAction({}, form('org-a'))).toEqual({ error: 'Backfill de historico disponivel apenas para Bling.' });
  });

  it('acesso negado fora da carteira', async () => {
    assertOrgAccess.mockRejectedValueOnce(new Error('acesso_negado'));
    const { staffBackfillHistoricoAction } = await import('@/actions/staff.actions');
    expect(await staffBackfillHistoricoAction({}, form('org-x'))).toEqual({ error: 'Acesso negado.' });
  });
});
