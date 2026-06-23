import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/lib/env';

describe('parseServerEnv', () => {
  it('valida um ambiente completo', () => {
    const env = parseServerEnv({
      POSTGRES_URL: 'postgres://x',
      AUTH_SECRET: 'secret',
      APP_URL: 'http://localhost:3000',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.POSTGRES_URL).toBe('postgres://x');
  });

  it('rejeita ambiente sem AUTH_SECRET', () => {
    expect(() =>
      parseServerEnv({ POSTGRES_URL: 'postgres://x' } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
  });
});
