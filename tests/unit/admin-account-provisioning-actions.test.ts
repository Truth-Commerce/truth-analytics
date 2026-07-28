import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/modules/auth/require-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    id: 'admin-user',
    orgId: 'truth-internal-org',
    role: 'admin_truth',
    orgStatus: 'active',
    plano: null,
  }),
}));
vi.mock('@/modules/admin/account-provisioning.repository', () => ({
  provisionClientAccount: vi.fn().mockResolvedValue({ orgId: 'new-org', userId: 'new-client' }),
  provisionAnalystAccount: vi.fn().mockResolvedValue({ userId: 'new-analyst' }),
}));
vi.mock('@/modules/auth/user.repository', () => ({
  createOrgClientUser: vi.fn(),
  createUserInOrg: vi.fn(),
  getUserWithOrgById: vi.fn(),
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));

import { revalidatePath } from 'next/cache';
import {
  adminCreateAnalystAccountAction,
  adminCreateClientAccountAction,
} from '@/actions/admin.actions';
import {
  provisionAnalystAccount,
  provisionClientAccount,
} from '@/modules/admin/account-provisioning.repository';

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminCreateClientAccountAction', () => {
  it('rejeita nome curto sem provisionar nada', async () => {
    const result = await adminCreateClientAccountAction(
      {},
      form({ orgName: 'X', email: 'cliente@example.com' }),
    );

    expect(result).toEqual({ error: 'Informe o nome da empresa.' });
    expect(provisionClientAccount).not.toHaveBeenCalled();
  });

  it('ignora role/orgId do navegador e cria cliente com senha temporária', async () => {
    const result = await adminCreateClientAccountAction(
      {},
      form({
        orgName: '  Loja Nova  ',
        email: 'CLIENTE@Example.com',
        role: 'admin_truth',
        orgId: 'org-atacante',
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.email).toBe('cliente@example.com');
    expect(result.senhaTemporaria).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(provisionClientAccount).toHaveBeenCalledWith({
      orgName: 'Loja Nova',
      email: 'CLIENTE@Example.com',
      senha: result.senhaTemporaria,
      actorUserId: 'admin-user',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/usuarios');
    expect(revalidatePath).toHaveBeenCalledWith('/admin');
  });

  it('traduz e-mail duplicado sem expor erro interno', async () => {
    vi.mocked(provisionClientAccount).mockRejectedValueOnce(new Error('email_em_uso'));

    const result = await adminCreateClientAccountAction(
      {},
      form({ orgName: 'Loja Duplicada', email: 'usado@example.com' }),
    );

    expect(result).toEqual({ error: 'Já existe uma conta com este e-mail.' });
  });
});

describe('adminCreateAnalystAccountAction', () => {
  it('usa a organização interna da sessão e ignora orgId/role do navegador', async () => {
    const result = await adminCreateAnalystAccountAction(
      {},
      form({
        email: 'ANALISTA@Example.com',
        orgId: 'cliente-atacante',
        role: 'admin_truth',
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.email).toBe('analista@example.com');
    expect(result.senhaTemporaria).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(provisionAnalystAccount).toHaveBeenCalledWith({
      internalOrgId: 'truth-internal-org',
      email: 'ANALISTA@Example.com',
      senha: result.senhaTemporaria,
      actorUserId: 'admin-user',
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/usuarios');
  });
});
