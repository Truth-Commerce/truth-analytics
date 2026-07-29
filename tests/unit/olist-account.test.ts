import { describe, expect, it, vi } from 'vitest';

describe('fingerprintOlistAccount', () => {
  it('normaliza o documento antes do HMAC SHA-256 dedicado', async () => {
    vi.stubEnv('OLIST_ACCOUNT_FINGERPRINT_KEY', Buffer.alloc(32, 7).toString('base64'));
    vi.resetModules();
    const { fingerprintOlistAccount } = await import('@/modules/providers/olist/account');
    expect(fingerprintOlistAccount('12.345.678/0001-99')).toMatch(/^[a-f0-9]{64}$/);
    expect(fingerprintOlistAccount('12345678000199')).toBe(fingerprintOlistAccount('12.345.678/0001-99'));
  });

  it('falha fechada sem chave dedicada', async () => {
    vi.stubEnv('OLIST_ACCOUNT_FINGERPRINT_KEY', '');
    vi.resetModules();
    const { fingerprintOlistAccount } = await import('@/modules/providers/olist/account');
    expect(() => fingerprintOlistAccount('12345678000199')).toThrow('olist_account_fingerprint_key_invalid');
  });
});
