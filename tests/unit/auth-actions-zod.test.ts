import { describe, expect, it, vi } from 'vitest';

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
import { signInAction } from '@/actions/auth.actions';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

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
