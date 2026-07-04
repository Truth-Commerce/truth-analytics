import { describe, expect, it } from 'vitest';

import { parseServerEnv } from '@/lib/env';

const BASE = {
  POSTGRES_URL: 'postgres://user:pass@host/db',
  AUTH_SECRET: 'segredo',
  ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
} as unknown as NodeJS.ProcessEnv;

describe('env DB_POOL_MAX', () => {
  it('ausente → undefined (client decide o default)', () => {
    expect(parseServerEnv(BASE).DB_POOL_MAX).toBeUndefined();
  });
  it('coage string numérica', () => {
    expect(parseServerEnv({ ...BASE, DB_POOL_MAX: '5' }).DB_POOL_MAX).toBe(5);
  });
  it('rejeita valor inválido', () => {
    expect(() => parseServerEnv({ ...BASE, DB_POOL_MAX: 'abc' })).toThrow();
  });
});
