import { describe, expect, it } from 'vitest';
import { authConfig } from '@/modules/auth/auth-config';

describe('authConfig.callbacks.session', () => {
  it('projeta role/orgId/orgStatus do token na sessão', () => {
    const session = {
      user: { id: '', email: 'x@y.com', role: 'client', orgId: '', orgStatus: 'pending' },
      expires: '',
    } as never;
    const token = { sub: 'u1', role: 'admin_truth', orgId: 'o1', orgStatus: 'active' } as never;

    const result = authConfig.callbacks!.session!({ session, token } as never) as {
      user: { id: string; role: string; orgId: string; orgStatus: string };
    };

    expect(result.user.id).toBe('u1');
    expect(result.user.role).toBe('admin_truth');
    expect(result.user.orgId).toBe('o1');
    expect(result.user.orgStatus).toBe('active');
  });
});

describe('authConfig.callbacks.authorized', () => {
  it('rota /analista: analista entra, cliente é redirecionado, deslogado bloqueado', () => {
    const url = new URL('http://localhost/analista');
    const asRole = (role?: string) =>
      authConfig.callbacks.authorized!({
        auth: role ? ({ user: { role } } as never) : null,
        request: { nextUrl: url } as never,
      });
    expect(asRole('analista')).toBe(true);
    expect(asRole('admin_truth')).toBe(true);
    const cliente = asRole('client');
    expect(cliente).toBeInstanceOf(Response); // redirect /dashboard
    expect(asRole(undefined)).toBe(false);
  });

  it('rota /configuracoes exige login (clientRoute)', () => {
    const url = new URL('http://localhost/configuracoes');
    const deslogado = authConfig.callbacks.authorized!({
      auth: null,
      request: { nextUrl: url } as never,
    });
    expect(deslogado).toBe(false);
    const logado = authConfig.callbacks.authorized!({
      auth: { user: { role: 'client' } } as never,
      request: { nextUrl: url } as never,
    });
    expect(logado).toBe(true);
  });
});
