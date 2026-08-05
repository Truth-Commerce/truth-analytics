import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/admin/admin.repository', () => ({ getOrganizationById: vi.fn() }));
vi.mock('@/modules/pipeline/dispatch', () => ({ dispatchPipelineRun: vi.fn() }));
vi.mock('@/modules/reports/report.repository', () => ({
  createQueuedReport: vi.fn(),
  markReportFailed: vi.fn(),
}));

import { getOrganizationById } from '@/modules/admin/admin.repository';
import { dispatchPipelineRun } from '@/modules/pipeline/dispatch';
import { enqueueReport } from '@/modules/pipeline/enqueue';
import { createQueuedReport } from '@/modules/reports/report.repository';

const ORG = {
  id: 'org-1', name: 'Loja', status: 'active' as const, plano: 'weekly' as const,
  nicho: null, created_at: new Date(), proximo_relatorio_liberado_em: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrganizationById).mockResolvedValue(ORG);
  vi.mocked(createQueuedReport).mockResolvedValue('report-1');
  vi.mocked(dispatchPipelineRun).mockResolvedValue(undefined);
});

describe('enqueueReport', () => {
  it('preserva literalmente a janela explícita do staff', async () => {
    const periodo = {
      inicio: new Date('2026-02-06T00:00:00.000Z'),
      fim: new Date('2026-08-04T23:59:59.999Z'),
    };

    expect(await enqueueReport('org-1', periodo)).toEqual({ ok: true, reportId: 'report-1' });
    expect(createQueuedReport).toHaveBeenCalledWith('org-1', periodo);
  });

  it('sem janela explícita continua calculando pelo plano', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T15:00:00Z'));
    try {
      await enqueueReport('org-1');
      expect(createQueuedReport).toHaveBeenCalledWith('org-1', {
        inicio: new Date('2026-07-29T00:00:00.000Z'),
        fim: new Date('2026-08-04T23:59:59.999Z'),
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
