import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/auth/require-active-org', () => ({
  requireActiveOrg: vi.fn().mockResolvedValue({
    id: 'u1', orgId: 'o1', role: 'client', orgStatus: 'active', plano: 'monthly',
  }),
}));
vi.mock('@/modules/auth/rate-limit', () => ({
  isTrocaSenhaRateLimited: vi.fn().mockResolvedValue(false),
  recordAttempt: vi.fn(),
}));
vi.mock('@/modules/auth/user.repository', () => ({
  getUserAuthById: vi.fn(),
  setUserPasswordHash: vi.fn(),
}));
vi.mock('@/modules/auth/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('novo-hash'),
  verifyPassword: vi.fn(),
}));
vi.mock('@/modules/auth/password-reset.repository', () => ({
  invalidateUserResetTokens: vi.fn(),
}));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit: vi.fn() }));
vi.mock('@/modules/notifications/email', () => ({ sendPasswordChangedEmail: vi.fn() }));
vi.mock('@/modules/organizations/organization-settings.repository', () => ({
  renameOrganization: vi.fn(),
}));

import { verifyPassword } from '@/modules/auth/password';
import { invalidateUserResetTokens } from '@/modules/auth/password-reset.repository';
import { isTrocaSenhaRateLimited, recordAttempt } from '@/modules/auth/rate-limit';
import { getUserAuthById, setUserPasswordHash } from '@/modules/auth/user.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import { sendPasswordChangedEmail } from '@/modules/notifications/email';
import { renameOrganization } from '@/modules/organizations/organization-settings.repository';
import { changePasswordAction, updateOrgNameAction } from '@/actions/account.actions';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const USER = { id: 'u1', email: 'cliente@teste.dev', senha_hash: 'hash-atual' };

describe('changePasswordAction', () => {
  it('confirmação diferente → erro sem consultar o banco', async () => {
    const res = await changePasswordAction({}, form({
      senhaAtual: 'atual-123', novaSenha: 'nova-senha-8', confirmarSenha: 'outra-coisa',
    }));
    expect(res.error).toBe('A confirmação não confere com a nova senha.');
    expect(getUserAuthById).not.toHaveBeenCalled();
  });

  it('nova senha curta → erro de validação', async () => {
    const res = await changePasswordAction({}, form({
      senhaAtual: 'atual-123', novaSenha: 'curta', confirmarSenha: 'curta',
    }));
    expect(res.error).toBe('A nova senha precisa ter ao menos 8 caracteres.');
  });

  it('rate-limited → erro sem verificar a senha', async () => {
    vi.mocked(getUserAuthById).mockResolvedValueOnce(USER);
    vi.mocked(isTrocaSenhaRateLimited).mockResolvedValueOnce(true);
    const res = await changePasswordAction({}, form({
      senhaAtual: 'atual-123', novaSenha: 'nova-senha-8', confirmarSenha: 'nova-senha-8',
    }));
    expect(res.error).toBe('Muitas tentativas. Tente novamente em alguns minutos.');
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('senha atual incorreta → erro + tentativa falha registrada, sem trocar', async () => {
    vi.mocked(getUserAuthById).mockResolvedValueOnce(USER);
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    const res = await changePasswordAction({}, form({
      senhaAtual: 'errada-123', novaSenha: 'nova-senha-8', confirmarSenha: 'nova-senha-8',
    }));
    expect(res.error).toBe('Senha atual incorreta.');
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ escopo: 'troca_senha', email: USER.email, success: false }),
    );
    expect(setUserPasswordHash).not.toHaveBeenCalled();
  });

  it('sucesso → troca hash, invalida tokens de reset, audita e envia e-mail best-effort', async () => {
    vi.mocked(getUserAuthById).mockResolvedValueOnce(USER);
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    const res = await changePasswordAction({}, form({
      senhaAtual: 'atual-123', novaSenha: 'nova-senha-8', confirmarSenha: 'nova-senha-8',
    }));
    expect(res).toEqual({ ok: true });
    expect(setUserPasswordHash).toHaveBeenCalledWith('u1', 'novo-hash');
    expect(invalidateUserResetTokens).toHaveBeenCalledWith('u1');
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'o1', userId: 'u1', acao: 'user.senha_alterada' }),
    );
    expect(sendPasswordChangedEmail).toHaveBeenCalledWith(USER.email);
  });
});

describe('updateOrgNameAction', () => {
  it('nome curto → erro sem tocar o banco', async () => {
    const res = await updateOrgNameAction({}, form({ nome: 'X' }));
    expect(res.error).toBe('Informe o nome da empresa.');
    expect(renameOrganization).not.toHaveBeenCalled();
  });

  it('sucesso → renomeia com orgId DA SESSÃO e audita de/para', async () => {
    vi.mocked(renameOrganization).mockResolvedValueOnce({ de: 'Nome Antigo' });
    const res = await updateOrgNameAction({}, form({ nome: 'Nome Novo Ltda' }));
    expect(res).toEqual({ ok: true });
    expect(renameOrganization).toHaveBeenCalledWith('o1', 'Nome Novo Ltda');
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'o1', userId: 'u1', acao: 'org.nome_alterado',
      detalhes: { de: 'Nome Antigo', para: 'Nome Novo Ltda' },
    }));
  });

  it('nome igual ao atual → ok sem auditar', async () => {
    vi.mocked(renameOrganization).mockResolvedValueOnce({ de: 'Nome Novo Ltda' });
    vi.mocked(recordAudit).mockClear();
    const res = await updateOrgNameAction({}, form({ nome: 'Nome Novo Ltda' }));
    expect(res).toEqual({ ok: true });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
