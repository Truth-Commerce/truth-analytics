import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/lib/env';

describe('parseServerEnv', () => {
  it('valida um ambiente completo', () => {
    const env = parseServerEnv({
      POSTGRES_URL: 'postgres://x',
      AUTH_SECRET: 'secret',
      APP_URL: 'http://localhost:3000',
      ENCRYPTION_KEY: 'AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.POSTGRES_URL).toBe('postgres://x');
  });

  it('rejeita ambiente sem AUTH_SECRET', () => {
    expect(() =>
      parseServerEnv({ POSTGRES_URL: 'postgres://x' } as unknown as NodeJS.ProcessEnv),
    ).toThrow();
  });

  it('rejeita ENCRYPTION_KEY com tamanho diferente de 32 bytes', () => {
    expect(() =>
      parseServerEnv({
        POSTGRES_URL: 'postgres://x',
        AUTH_SECRET: 'secret',
        APP_URL: 'http://localhost:3000',
        // 16 bytes em base64
        ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAA==',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow('ENCRYPTION_KEY deve ser 32 bytes em base64');
  });
});
