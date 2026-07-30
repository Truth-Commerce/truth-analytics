import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUltimosDoneDetalhados: vi.fn(),
}));

vi.mock('@/modules/connections/active-provider.repository', () => ({ getActiveErpConnection: vi.fn().mockResolvedValue(null) }));
vi.mock('@/modules/connections/connection.repository', () => ({ getConnection: vi.fn().mockResolvedValue(null) }));
vi.mock('@/modules/admin/admin.repository', () => ({ getOrganizationById: vi.fn().mockResolvedValue(null) }));
vi.mock('@/modules/alerts/alert-data.repository', () => ({ getUltimaDataPedido: vi.fn() }));
vi.mock('@/modules/alerts/alert.repository', () => ({ listAlertasAbertos: vi.fn().mockResolvedValue([]) }));
vi.mock('@/modules/organizations/organization-settings.repository', () => ({ getOrgSettings: vi.fn().mockResolvedValue(null), getTotalVendasMesCorrente: vi.fn() }));
vi.mock('@/modules/tasks/task.repository', () => ({ listTaskTitulosAbertos: vi.fn().mockResolvedValue([]) }));
vi.mock('@/modules/tracked-products/tracked-product.repository', () => ({ listTrackedProducts: vi.fn().mockResolvedValue([]) }));
vi.mock('@/modules/reports/report.repository', () => ({
  getUltimosDoneDetalhados: (...args: unknown[]) => mocks.getUltimosDoneDetalhados(...args),
  listHistoricoDashboard: vi.fn().mockResolvedValue([]),
}));

import { getDashboardData } from '@/modules/reports/dashboard-data';

describe('getDashboardData', () => {
  it('does not request a source-filtered predecessor when no done report exists', async () => {
    mocks.getUltimosDoneDetalhados.mockResolvedValueOnce([]);

    await expect(getDashboardData('org-1')).resolves.toMatchObject({ latestDone: null, doneAnterior: null });
    expect(mocks.getUltimosDoneDetalhados).toHaveBeenCalledTimes(1);
  });
});
