import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/modules/auth/require-admin', () => ({
  requireAdmin: vi.fn().mockResolvedValue({
    id: 'admin-user',
    orgId: 'org-interna',
    role: 'admin_truth',
    orgStatus: 'active',
    plano: null,
  }),
}));
vi.mock('@/modules/auth/user.repository', () => ({
  createOrgClientUser: vi.fn(),
  getUserWithOrgById: vi.fn(),
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));
vi.mock('@/modules/admin/staff-accounts.repository', () => ({
  aplicarTrocaDePapel: vi.fn(),
  contarAdmins: vi.fn().mockResolvedValue(2),
  contarCarteira: vi.fn().mockResolvedValue(0),
  moverUsuarioParaOrg: vi.fn(),
}));

import {
  adminMoveUserToInternalOrgAction,
  adminSetUserRoleAction,
} from '@/actions/admin.actions';
import {
  aplicarTrocaDePapel,
  contarAdmins,
  contarCarteira,
  moverUsuarioParaOrg,
} from '@/modules/admin/staff-accounts.repository';
import { getUserWithOrgById } from '@/modules/auth/user.repository';

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

const alvo = (over: Partial<{ id: string; email: string; orgId: string; role: string }> = {}) => ({
  id: 'user-1',
  email: 'alvo@example.com',
  orgId: 'org-cliente',
  role: 'client',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(contarAdmins).mockResolvedValue(2);
  vi.mocked(contarCarteira).mockResolvedValue(0);
});

describe('adminSetUserRoleAction', () => {
  it('promove cliente a analista movendo para a org interna', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(alvo() as never);

    const r = await adminSetUserRoleAction({}, form({ userId: 'user-1', role: 'analista' }));

    expect(r.ok).toBe(true);
    expect(r.mensagem).toContain('movido');
    expect(aplicarTrocaDePapel).toHaveBeenCalledWith({
      userId: 'user-1',
      novoPapel: 'analista',
      moverParaOrgId: 'org-interna',
      actorUserId: 'admin-user',
    });
  });

  it('não move quem já está na org interna', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(
      alvo({ role: 'analista', orgId: 'org-interna' }) as never,
    );

    const r = await adminSetUserRoleAction({}, form({ userId: 'user-1', role: 'admin_truth' }));

    expect(r.ok).toBe(true);
    expect(aplicarTrocaDePapel).toHaveBeenCalledWith(
      expect.objectContaining({ moverParaOrgId: null }),
    );
  });

  it('recusa rebaixar o último admin e não escreve nada', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(
      alvo({ id: 'outro-admin', role: 'admin_truth', orgId: 'org-interna' }) as never,
    );
    vi.mocked(contarAdmins).mockResolvedValue(1);

    const r = await adminSetUserRoleAction({}, form({ userId: 'outro-admin', role: 'analista' }));

    expect(r.error).toContain('único admin');
    expect(aplicarTrocaDePapel).not.toHaveBeenCalled();
  });

  it('recusa trocar o papel de analista com carteira', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(
      alvo({ role: 'analista', orgId: 'org-interna' }) as never,
    );
    vi.mocked(contarCarteira).mockResolvedValue(4);

    const r = await adminSetUserRoleAction({}, form({ userId: 'user-1', role: 'admin_truth' }));

    expect(r.error).toContain('Transfira a carteira');
    expect(aplicarTrocaDePapel).not.toHaveBeenCalled();
  });

  it('recusa o admin trocar o próprio papel', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(
      alvo({ id: 'admin-user', role: 'admin_truth', orgId: 'org-interna' }) as never,
    );

    const r = await adminSetUserRoleAction({}, form({ userId: 'admin-user', role: 'analista' }));

    expect(r.error).toContain('próprio papel');
    expect(aplicarTrocaDePapel).not.toHaveBeenCalled();
  });

  it('recusa papel desconhecido vindo do formulário', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(alvo() as never);

    const r = await adminSetUserRoleAction({}, form({ userId: 'user-1', role: 'root' }));

    expect(r.error).toBe('Papel inválido.');
    expect(aplicarTrocaDePapel).not.toHaveBeenCalled();
  });

  it('rejeita usuário inexistente', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(null);

    const r = await adminSetUserRoleAction({}, form({ userId: 'sumiu', role: 'analista' }));

    expect(r.error).toBe('Usuário inválido.');
    expect(aplicarTrocaDePapel).not.toHaveBeenCalled();
  });
});

describe('adminMoveUserToInternalOrgAction', () => {
  it('move analista lotado em org de cliente', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(
      alvo({ role: 'analista', orgId: 'org-cliente' }) as never,
    );

    const r = await adminMoveUserToInternalOrgAction({}, form({ userId: 'user-1' }));

    expect(r.ok).toBe(true);
    expect(moverUsuarioParaOrg).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-interna',
      actorUserId: 'admin-user',
    });
  });

  it('recusa mover conta de cliente', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(alvo() as never);

    const r = await adminMoveUserToInternalOrgAction({}, form({ userId: 'user-1' }));

    expect(r.error).toContain('troque o papel');
    expect(moverUsuarioParaOrg).not.toHaveBeenCalled();
  });

  it('não faz nada quando já está na org interna', async () => {
    vi.mocked(getUserWithOrgById).mockResolvedValue(
      alvo({ role: 'analista', orgId: 'org-interna' }) as never,
    );

    const r = await adminMoveUserToInternalOrgAction({}, form({ userId: 'user-1' }));

    expect(r.error).toContain('já está');
    expect(moverUsuarioParaOrg).not.toHaveBeenCalled();
  });
});
