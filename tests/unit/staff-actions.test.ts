import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/auth/require-analista', () => ({
  requireAnalista: vi.fn().mockResolvedValue({
    id: 'staff1', orgId: 'org-interna', role: 'analista', orgStatus: 'active', plano: null,
  }),
}));
vi.mock('@/modules/analista/analista.repository', () => ({ assertOrgAccess: vi.fn() }));
vi.mock('@/modules/admin/admin.repository', () => ({ getOrganizationById: vi.fn() }));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit: vi.fn() }));
vi.mock('@/modules/connections/active-provider.repository', () => ({ getActiveErpConnection: vi.fn() }));
vi.mock('@/modules/pipeline/enqueue', () => ({ enqueueReport: vi.fn() }));
vi.mock('@/modules/tracked-products/tracked-product.repository', () => ({
  addTrackedProduct: vi.fn(),
  removeTrackedProduct: vi.fn(),
}));

import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import { enqueueReport } from '@/modules/pipeline/enqueue';
import {
  addTrackedProduct,
  removeTrackedProduct,
} from '@/modules/tracked-products/tracked-product.repository';
import {
  staffAddTrackedProductAction,
  staffGenerateReportAction,
  staffRemoveTrackedProductAction,
} from '@/actions/staff.actions';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const ORG = {
  id: 'org-cliente', name: 'Loja', status: 'active' as const, plano: 'weekly' as const,
  nicho: null, created_at: new Date(), proximo_relatorio_liberado_em: null,
};

// clearAllMocks zera só o histórico de chamadas — a implementação de
// requireAnalista (mockResolvedValue no factory) permanece entre os testes.
beforeEach(() => {
  vi.clearAllMocks();
});

describe('staffAddTrackedProductAction', () => {
  it('analista fora da carteira → Acesso negado (assertOrgAccess barra ANTES do repositório)', async () => {
    vi.mocked(assertOrgAccess).mockRejectedValueOnce(new Error('acesso_negado'));
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'Produto X', sku: '', keywords: 'a, b',
    }));
    expect(res.error).toBe('Acesso negado.');
    expect(addTrackedProduct).not.toHaveBeenCalled();
  });

  it('usa o plano REAL da org (não o da sessão do staff) e audita', async () => {
    vi.mocked(getOrganizationById).mockResolvedValueOnce(ORG);
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'Produto X', sku: 'PX-1', keywords: 'a, b',
    }));
    expect(res).toEqual({ ok: true });
    expect(addTrackedProduct).toHaveBeenCalledWith({
      orgId: 'org-cliente', nome: 'Produto X', sku: 'PX-1', keywords: ['a', 'b'], plano: 'weekly',
    });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-cliente', userId: 'staff1', acao: 'tracked_product.criado_staff',
    }));
  });

  it('limite do plano do cliente → mensagem clara', async () => {
    vi.mocked(getOrganizationById).mockResolvedValueOnce(ORG);
    vi.mocked(addTrackedProduct).mockRejectedValueOnce(new Error('limite_tracked_products'));
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'Produto X', sku: '', keywords: '',
    }));
    expect(res.error).toBe('Limite de produtos do plano deste cliente atingido.');
  });

  it('nome curto → erro de validação sem tocar o repositório', async () => {
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'X', sku: '', keywords: '',
    }));
    expect(res.error).toBe('Informe o nome do produto.');
    expect(addTrackedProduct).not.toHaveBeenCalled();
  });
});

describe('staffRemoveTrackedProductAction', () => {
  it('remove escopado pela org e audita', async () => {
    const res = await staffRemoveTrackedProductAction({}, form({
      orgId: 'org-cliente', id: 'prod-1',
    }));
    expect(res).toEqual({ ok: true });
    expect(removeTrackedProduct).toHaveBeenCalledWith({ orgId: 'org-cliente', id: 'prod-1' });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-cliente', userId: 'staff1', acao: 'tracked_product.removido_staff',
      detalhes: { id: 'prod-1' },
    }));
  });
});

describe('staffGenerateReportAction', () => {
  it('analista atribuído gera relatório com Olist ativo', async () => {
    vi.mocked(getActiveErpConnection).mockResolvedValueOnce({
      orgId: 'org-cliente', provider: 'olist', sourceGeneration: 2,
      accountFingerprint: 'a'.repeat(64), lastSyncAt: new Date(),
    });
    vi.mocked(enqueueReport).mockResolvedValueOnce({ ok: true, reportId: 'report-1' });

    const result = await staffGenerateReportAction({}, form({ orgId: 'org-cliente', periodDays: '30' }));

    expect(result).toEqual({ ok: true, reportId: 'report-1' });
    expect(assertOrgAccess).toHaveBeenCalledWith(expect.objectContaining({ role: 'analista' }), 'org-cliente');
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-cliente', userId: 'staff1', acao: 'report.disparado_staff',
      detalhes: expect.objectContaining({ reportId: 'report-1', provider: 'olist', periodDays: 30 }),
    }));
  });

  it('encaminha 180 dias fechados e audita as fronteiras escolhidas', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T15:00:00Z'));
    vi.mocked(getActiveErpConnection).mockResolvedValueOnce({
      orgId: 'org-cliente', provider: 'olist', sourceGeneration: 2,
      accountFingerprint: 'a'.repeat(64), lastSyncAt: new Date(),
    });
    vi.mocked(enqueueReport).mockResolvedValueOnce({ ok: true, reportId: 'report-180' });

    try {
      const result = await staffGenerateReportAction({}, form({
        orgId: 'org-cliente', periodDays: '180',
      }));

      expect(result).toEqual({ ok: true, reportId: 'report-180' });
      expect(enqueueReport).toHaveBeenCalledWith('org-cliente', {
        inicio: new Date('2026-02-06T00:00:00.000Z'),
        fim: new Date('2026-08-04T23:59:59.999Z'),
      });
      expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
        detalhes: {
          reportId: 'report-180', provider: 'olist', periodDays: 180,
          periodStart: '2026-02-06T00:00:00.000Z',
          periodEnd: '2026-08-04T23:59:59.999Z',
        },
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([undefined, '15', '30.5', 'abc'])('recusa período inválido %s antes da fila', async (periodDays) => {
    const input = { orgId: 'org-cliente', ...(periodDays === undefined ? {} : { periodDays }) };
    expect(await staffGenerateReportAction({}, form(input))).toEqual({
      error: 'Selecione um período válido.',
    });
    expect(enqueueReport).not.toHaveBeenCalled();
  });

  it('recusa analista fora da carteira antes da fila', async () => {
    vi.mocked(assertOrgAccess).mockRejectedValueOnce(new Error('acesso_negado'));

    expect(await staffGenerateReportAction({}, form({ orgId: 'org-fora', periodDays: '30' }))).toEqual({ error: 'Acesso negado.' });
    expect(getActiveErpConnection).not.toHaveBeenCalled();
    expect(enqueueReport).not.toHaveBeenCalled();
  });

  it('recusa organização sem ERP ativo', async () => {
    vi.mocked(getActiveErpConnection).mockResolvedValueOnce(null);

    expect(await staffGenerateReportAction({}, form({ orgId: 'org-cliente', periodDays: '30' }))).toEqual({ error: 'Nenhum ERP ativo para este cliente.' });
    expect(enqueueReport).not.toHaveBeenCalled();
  });

  it('traduz relatório concorrente sem registrar auditoria', async () => {
    vi.mocked(getActiveErpConnection).mockResolvedValueOnce({
      orgId: 'org-cliente', provider: 'bling', sourceGeneration: 1,
      accountFingerprint: null, lastSyncAt: new Date(),
    });
    vi.mocked(enqueueReport).mockResolvedValueOnce({ ok: false, motivo: 'relatorio_em_andamento' });

    expect(await staffGenerateReportAction({}, form({ orgId: 'org-cliente', periodDays: '30' }))).toEqual({ error: 'Já existe um relatório em andamento para este cliente.' });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
