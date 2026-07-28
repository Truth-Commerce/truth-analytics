import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/auth/require-active-org', () => ({ assertNaoImpersonando: vi.fn() }));
vi.mock('@/modules/analista/analista.repository', () => ({ assertOrgAccess: vi.fn() }));
vi.mock('@/modules/admin/admin.repository', () => ({ getOrganizationById: vi.fn() }));

import { getOrganizationById } from '@/modules/admin/admin.repository';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { assertNaoImpersonando } from '@/modules/auth/require-active-org';
import type { UserAccess } from '@/modules/auth/user.types';
import { assertConnectionOrgAccess } from '@/modules/connections/connection-access';

function access(role: UserAccess['role'], orgId = 'org-a'): UserAccess {
  return { id: 'user-a', orgId, role, orgStatus: 'active', plano: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrganizationById).mockResolvedValue({
    id: 'org-a',
    name: 'Org A',
    status: 'active',
    plano: null,
    nicho: null,
    proximo_relatorio_liberado_em: null,
    created_at: new Date(),
  });
});

describe('assertConnectionOrgAccess', () => {
  it('permite cliente na própria organização e superfície', async () => {
    await expect(
      assertConnectionOrgAccess(access('client'), 'org-a', 'client_connections'),
    ).resolves.toBeUndefined();
    expect(assertOrgAccess).not.toHaveBeenCalled();
  });

  it.each([
    ['org-b', 'client_connections'],
    ['org-a', 'analyst_org'],
  ] as const)('nega cliente com alvo/superfície %s/%s', async (orgId, surface) => {
    await expect(assertConnectionOrgAccess(access('client'), orgId, surface)).rejects.toThrow(
      'acesso_negado',
    );
  });

  it('permite analista atribuído na superfície de staff', async () => {
    await expect(
      assertConnectionOrgAccess(access('analista'), 'org-a', 'analyst_org'),
    ).resolves.toBeUndefined();
    expect(assertOrgAccess).toHaveBeenCalledWith(expect.objectContaining({ role: 'analista' }), 'org-a');
  });

  it('nega staff na superfície do cliente', async () => {
    await expect(
      assertConnectionOrgAccess(access('admin_truth'), 'org-a', 'client_connections'),
    ).rejects.toThrow('acesso_negado');
    expect(assertOrgAccess).not.toHaveBeenCalled();
  });

  it('nega organização suspensa após validar acesso', async () => {
    vi.mocked(getOrganizationById).mockResolvedValueOnce({
      ...(await vi.mocked(getOrganizationById)('org-a'))!,
      status: 'suspended',
    });
    await expect(
      assertConnectionOrgAccess(access('analista'), 'org-a', 'analyst_org'),
    ).rejects.toThrow('organizacao_inativa');
  });

  it('bloqueia impersonação antes de consultar acesso ou organização', async () => {
    vi.mocked(assertNaoImpersonando).mockRejectedValueOnce(new Error('impersonando'));
    await expect(
      assertConnectionOrgAccess(access('client'), 'org-a', 'client_connections'),
    ).rejects.toThrow('impersonando');
    expect(assertOrgAccess).not.toHaveBeenCalled();
    expect(getOrganizationById).not.toHaveBeenCalled();
  });
});
