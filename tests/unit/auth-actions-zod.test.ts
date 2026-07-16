import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('next-auth', () => ({ AuthError: class AuthError extends Error {} }));
vi.mock('@/modules/auth/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/modules/auth/rate-limit', () => ({
  isLoginRateLimited: vi.fn().mockResolvedValue(false),
  recordLoginAttempt: vi.fn(),
  recordAttempt: vi.fn(),
  isSignupRateLimited: vi.fn().mockResolvedValue(false),
  isResetRateLimited: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/modules/auth/user.repository', () => ({
  createOrgWithUser: vi.fn(),
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
}));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit: vi.fn() }));

import { signIn } from '@/modules/auth/auth';
import { recordAttempt } from '@/modules/auth/rate-limit';
import { createOrgWithUser } from '@/modules/auth/user.repository';
import { signInAction, signUpAction } from '@/actions/auth.actions';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

// Isola o histórico de chamadas entre testes (mantém as implementações dos
// mocks) — necessário para o teste "sem aceite → nada é criado" asseverar
// `createOrgWithUser` não chamado sem herdar a chamada do teste anterior.
beforeEach(() => {
  vi.clearAllMocks();
});

describe('signInAction com Zod', () => {
  it('e-mail inválido → erro sem chamar signIn', async () => {
    const res = await signInAction({}, form({ email: 'nao-eh-email', senha: 'x'.repeat(8) }));
    expect(res.error).toBe('E-mail inválido.');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('senha vazia → erro sem chamar signIn', async () => {
    const res = await signInAction({}, form({ email: 'a@b.com', senha: '' }));
    expect(res.error).toBe('Informe a senha.');
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('signUpAction anti-enumeração', () => {
  it('e-mail em uso → grava tentativa (success: false) e mantém a mensagem', async () => {
    vi.mocked(createOrgWithUser).mockRejectedValueOnce(new Error('email_em_uso'));
    const res = await signUpAction(
      {},
      form({ orgName: 'Empresa Teste', email: 'ja-existe@teste.dev', senha: 'x'.repeat(8), aceite: 'on' }),
    );
    expect(res.error).toBe('Já existe uma conta com este e-mail.');
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ escopo: 'signup', email: 'ja-existe@teste.dev', success: false }),
    );
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe('signUpAction — aceite dos termos (LGPD)', () => {
  it('sem aceite → erro e nada é criado', async () => {
    const res = await signUpAction(
      {},
      form({ orgName: 'Empresa Teste', email: 'novo@teste.dev', senha: 'x'.repeat(8) }),
    );
    expect(res.error).toBe(
      'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.',
    );
    expect(createOrgWithUser).not.toHaveBeenCalled();
  });
});
