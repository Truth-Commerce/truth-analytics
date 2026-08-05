import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { resolveReportOrgId } from '@/modules/reports/report-access';

vi.mock('@/modules/analista/analista.repository', () => ({
  assertOrgAccess: vi.fn(),
}));

const analyst = {
  id: 'analyst-1',
  orgId: 'truth-internal',
  role: 'analista' as const,
  orgStatus: 'active' as const,
  plano: null,
};

describe('resolveReportOrgId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usa a organização explícita da carteira para analista autorizado', async () => {
    await expect(resolveReportOrgId(analyst, 'client-org')).resolves.toBe('client-org');
    expect(assertOrgAccess).toHaveBeenCalledWith(analyst, 'client-org');
  });

  it('propaga a recusa quando a organização não pertence à carteira', async () => {
    vi.mocked(assertOrgAccess).mockRejectedValueOnce(new Error('acesso_negado'));
    await expect(resolveReportOrgId(analyst, 'other-org')).rejects.toThrow('acesso_negado');
  });

  it('mantém o cliente preso à própria organização', async () => {
    const client = { ...analyst, role: 'client' as const, orgId: 'client-org' };
    await expect(resolveReportOrgId(client, undefined)).resolves.toBe('client-org');
    await expect(resolveReportOrgId(client, 'other-org')).rejects.toThrow('acesso_negado');
    expect(assertOrgAccess).not.toHaveBeenCalled();
  });
});
