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
