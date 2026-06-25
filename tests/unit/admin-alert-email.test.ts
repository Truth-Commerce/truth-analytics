import { afterEach, describe, expect, it, vi } from 'vitest';

// getAdminAlertEmail() resolve o destinatário interno de alertas de pipeline:
// prioridade ADMIN_ALERT_EMAIL → EMAIL_FROM → null. Cada caso usa um mock
// fresco de @/lib/env via resetModules + doMock + import dinâmico.

async function loadWith(env: {
  ADMIN_ALERT_EMAIL?: string;
  EMAIL_FROM?: string;
}): Promise<string | null> {
  vi.resetModules();
  vi.doMock('@/lib/env', () => ({
    serverEnv: {
      ADMIN_ALERT_EMAIL: env.ADMIN_ALERT_EMAIL,
      EMAIL_FROM: env.EMAIL_FROM,
    },
  }));
  const mod = await import('@/modules/notifications/recipients');
  return mod.getAdminAlertEmail();
}

describe('getAdminAlertEmail — precedência', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@/lib/env');
  });

  it('retorna ADMIN_ALERT_EMAIL quando ambos definidos', async () => {
    const result = await loadWith({
      ADMIN_ALERT_EMAIL: 'alerta@truth.com',
      EMAIL_FROM: 'no-reply@truth.com',
    });
    expect(result).toBe('alerta@truth.com');
  });

  it('cai para EMAIL_FROM quando ADMIN_ALERT_EMAIL ausente', async () => {
    const result = await loadWith({ EMAIL_FROM: 'no-reply@truth.com' });
    expect(result).toBe('no-reply@truth.com');
  });

  it('retorna null quando ambos ausentes', async () => {
    const result = await loadWith({});
    expect(result).toBeNull();
  });
});
