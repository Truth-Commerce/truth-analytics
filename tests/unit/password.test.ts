import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/modules/auth/password';

describe('password', () => {
  it('hash não é igual ao texto puro', async () => {
    const hash = await hashPassword('segredo123');
    expect(hash).not.toBe('segredo123');
    expect(hash.length).toBeGreaterThan(30);
  });

  it('verify aceita a senha correta e rejeita a errada', async () => {
    const hash = await hashPassword('segredo123');
    expect(await verifyPassword('segredo123', hash)).toBe(true);
    expect(await verifyPassword('errada', hash)).toBe(false);
  });
});
