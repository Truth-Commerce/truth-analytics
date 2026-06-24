import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@/modules/crypto/crypto';

describe('crypto AES-256-GCM', () => {
  it('roundtrip: decrypt(encrypt(x)) === x', () => {
    const secret = 'token-super-secreto-123';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('usa IV aleatório: dois encrypts do mesmo texto diferem', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });

  it('detecta adulteração (auth tag inválido)', () => {
    const payload = encryptSecret('y');
    const [iv, tag, ct] = payload.split('.');
    // corrompe o ciphertext
    const corrupted = `${iv}.${tag}.${Buffer.from('zzzz').toString('base64')}`;
    expect(() => decryptSecret(corrupted)).toThrow('decrypt_failed');
  });

  it('rejeita formato inválido', () => {
    expect(() => decryptSecret('nao-tem-tres-partes')).toThrow('decrypt_failed');
  });
});
