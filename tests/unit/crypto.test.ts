import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY_A = Buffer.alloc(32, 1).toString('base64');
const KEY_B = Buffer.alloc(32, 2).toString('base64');

// Mock mutável do env — cada teste configura o cenário.
// vi.hoisted garante que envMock exista antes do factory hoisteado do vi.mock.
const { envMock } = vi.hoisted(() => ({ envMock: {} as Record<string, unknown> }));
vi.mock('@/lib/env', () => ({ serverEnv: envMock }));

import { decryptSecret, encryptSecret } from '@/modules/crypto/crypto';

describe('crypto AES-256-GCM (legado)', () => {
  beforeEach(() => {
    for (const k of Object.keys(envMock)) delete envMock[k];
    envMock.ENCRYPTION_KEY = KEY_A;
  });

  it('roundtrip: decrypt(encrypt(x)) === x', () => {
    const secret = 'token-super-secreto-123';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('usa IV aleatório: dois encrypts do mesmo texto diferem', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });

  it('detecta adulteração (auth tag inválido)', () => {
    const payload = encryptSecret('y');
    const [iv, tag] = payload.split('.');
    // corrompe o ciphertext
    const corrupted = `${iv}.${tag}.${Buffer.from('zzzz').toString('base64')}`;
    expect(() => decryptSecret(corrupted)).toThrow('decrypt_failed');
  });

  it('rejeita formato inválido', () => {
    expect(() => decryptSecret('nao-tem-tres-partes')).toThrow('decrypt_failed');
  });
});

describe('crypto versionada (v1)', () => {
  beforeEach(async () => {
    vi.resetModules();
    for (const k of Object.keys(envMock)) delete envMock[k];
  });

  it('com ENCRYPTION_KEYS ativa escreve v1:<keyId>: e decifra de volta', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A, k2: KEY_B };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k2';
    const { encryptSecret, decryptSecret, encryptionKeyIdOf } = await import(
      '@/modules/crypto/crypto'
    );
    const payload = encryptSecret('token-super-secreto');
    expect(payload.startsWith('v1:k2:')).toBe(true);
    expect(payload.split(':')).toHaveLength(5);
    expect(encryptionKeyIdOf(payload)).toBe('k2');
    expect(decryptSecret(payload)).toBe('token-super-secreto');
  });

  it('payload legado (iv.tag.ct) continua decifrável com ENCRYPTION_KEY', async () => {
    envMock.ENCRYPTION_KEY = KEY_A;
    const mod1 = await import('@/modules/crypto/crypto');
    const legado = mod1.encryptSecret('antigo'); // sem KEYS → formato legado
    expect(legado.includes(':')).toBe(false);
    expect(mod1.encryptionKeyIdOf(legado)).toBeNull();

    // Agora com versionamento ligado, o legado ainda decifra (retrocompat)
    envMock.ENCRYPTION_KEYS = { k1: KEY_B };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    vi.resetModules();
    const mod2 = await import('@/modules/crypto/crypto');
    expect(mod2.decryptSecret(legado)).toBe('antigo');
  });

  it('keyId desconhecido → decrypt_failed', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    const { encryptSecret } = await import('@/modules/crypto/crypto');
    const payload = encryptSecret('x');
    envMock.ENCRYPTION_KEYS = { OUTRA: KEY_B };
    envMock.ENCRYPTION_KEY_ACTIVE = 'OUTRA';
    vi.resetModules();
    const { decryptSecret } = await import('@/modules/crypto/crypto');
    expect(() => decryptSecret(payload)).toThrow('decrypt_failed');
  });

  it('chave errada (mesmo keyId, bytes diferentes) → decrypt_failed', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    const { encryptSecret } = await import('@/modules/crypto/crypto');
    const payload = encryptSecret('segredo');
    // mesmo keyId, mas bytes trocados
    envMock.ENCRYPTION_KEYS = { k1: KEY_B };
    vi.resetModules();
    const { decryptSecret } = await import('@/modules/crypto/crypto');
    expect(() => decryptSecret(payload)).toThrow('decrypt_failed');
  });

  it('tag adulterado em payload v1 → decrypt_failed', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    const { encryptSecret, decryptSecret } = await import('@/modules/crypto/crypto');
    const payload = encryptSecret('segredo');
    const [, keyId, iv, , ct] = payload.split(':');
    const tagFalso = Buffer.alloc(16, 9).toString('base64');
    const adulterado = ['v1', keyId, iv, tagFalso, ct].join(':');
    expect(() => decryptSecret(adulterado)).toThrow('decrypt_failed');
  });

  it('keyId "constructor" (herdado do protótipo) → decrypt_failed', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    const { encryptSecret, decryptSecret } = await import('@/modules/crypto/crypto');
    const [, , iv, tag, ct] = encryptSecret('segredo').split(':');
    const malicioso = ['v1', 'constructor', iv, tag, ct].join(':');
    expect(() => decryptSecret(malicioso)).toThrow('decrypt_failed');
  });

  it('keyId vazio (v1::...) → decrypt_failed', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    const { encryptSecret, decryptSecret } = await import('@/modules/crypto/crypto');
    const [, , iv, tag, ct] = encryptSecret('segredo').split(':');
    expect(() => decryptSecret(['v1', '', iv, tag, ct].join(':'))).toThrow('decrypt_failed');
  });

  it('keyId contendo ":" (mais de 5 partes) → decrypt_failed', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    const { encryptSecret, decryptSecret } = await import('@/modules/crypto/crypto');
    const [, , iv, tag, ct] = encryptSecret('segredo').split(':');
    expect(() => decryptSecret(['v1', 'a:b', iv, tag, ct].join(':'))).toThrow('decrypt_failed');
  });

  it('ct adulterado em payload v1 → decrypt_failed', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    const { encryptSecret, decryptSecret } = await import('@/modules/crypto/crypto');
    const payload = encryptSecret('segredo');
    const [, keyId, iv, tag] = payload.split(':');
    const ctFalso = Buffer.from('conteudo-falso').toString('base64');
    const adulterado = ['v1', keyId, iv, tag, ctFalso].join(':');
    expect(() => decryptSecret(adulterado)).toThrow('decrypt_failed');
  });
});
