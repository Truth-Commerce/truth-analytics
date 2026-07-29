import { beforeEach, describe, expect, it, vi } from 'vitest';

const { envMock } = vi.hoisted(() => ({
  envMock: { ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64') },
}));
vi.mock('@/lib/env', () => ({ serverEnv: envMock }));

import {
  decryptConnectionSecret,
  encryptConnectionSecret,
} from '@/modules/connections/connection-secrets';

describe('connection secrets tenant-bound', () => {
  beforeEach(() => {
    envMock.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('cifra o valor e o recupera somente no mesmo contexto', () => {
    const encrypted = encryptConnectionSecret({
      orgId: 'org-a',
      provider: 'olist',
      kind: 'client_secret',
      value: 'secret-value',
    });
    expect(encrypted).not.toContain('secret-value');
    expect(
      decryptConnectionSecret({
        orgId: 'org-a',
        provider: 'olist',
        kind: 'client_secret',
        ciphertext: encrypted,
      }),
    ).toBe('secret-value');
  });

  it.each([
    ['org-b', 'olist', 'client_secret'],
    ['org-a', 'bling', 'client_secret'],
    ['org-a', 'olist', 'access_token'],
  ] as const)('rejeita contexto diferente (%s/%s/%s)', (orgId, provider, kind) => {
    const encrypted = encryptConnectionSecret({
      orgId: 'org-a',
      provider: 'olist',
      kind: 'client_secret',
      value: 'secret-value',
    });
    expect(() =>
      decryptConnectionSecret({ orgId, provider, kind, ciphertext: encrypted }),
    ).toThrow('connection_secret_context_mismatch');
  });
});
