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

  const KEY_32 = Buffer.alloc(32, 1).toString('base64');

  it('aceita cripto versionada (KEYS + ACTIVE) sem ENCRYPTION_KEY legado', () => {
    const env = parseServerEnv({
      POSTGRES_URL: 'postgres://x',
      AUTH_SECRET: 'secret',
      APP_URL: 'http://localhost:3000',
      ENCRYPTION_KEYS: JSON.stringify({ k1: KEY_32 }),
      ENCRYPTION_KEY_ACTIVE: 'k1',
    } as unknown as NodeJS.ProcessEnv);
    expect(env.ENCRYPTION_KEYS).toEqual({ k1: KEY_32 });
    expect(env.ENCRYPTION_KEY_ACTIVE).toBe('k1');
  });

  it('rejeita ausência de ambas as configurações de cripto', () => {
    expect(() =>
      parseServerEnv({
        POSTGRES_URL: 'postgres://x',
        AUTH_SECRET: 'secret',
        APP_URL: 'http://localhost:3000',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow('Configure ENCRYPTION_KEYS');
  });

  it('rejeita ENCRYPTION_KEY_ACTIVE ausente em ENCRYPTION_KEYS', () => {
    expect(() =>
      parseServerEnv({
        POSTGRES_URL: 'postgres://x',
        AUTH_SECRET: 'secret',
        APP_URL: 'http://localhost:3000',
        ENCRYPTION_KEYS: JSON.stringify({ k1: KEY_32 }),
        ENCRYPTION_KEY_ACTIVE: 'k9',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow('ENCRYPTION_KEY_ACTIVE não existe em ENCRYPTION_KEYS');
  });

  it('rejeita "__proto__" como keyId em ENCRYPTION_KEYS', () => {
    expect(() =>
      parseServerEnv({
        POSTGRES_URL: 'postgres://x',
        AUTH_SECRET: 'secret',
        APP_URL: 'http://localhost:3000',
        ENCRYPTION_KEYS: JSON.stringify({ ['__proto__']: KEY_32 }),
        ENCRYPTION_KEY_ACTIVE: '__proto__',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow('keyId inválido');
  });

  it('rejeita ENCRYPTION_KEYS sem ENCRYPTION_KEY_ACTIVE (sem fallback silencioso)', () => {
    expect(() =>
      parseServerEnv({
        POSTGRES_URL: 'postgres://x',
        AUTH_SECRET: 'secret',
        APP_URL: 'http://localhost:3000',
        ENCRYPTION_KEY: KEY_32,
        ENCRYPTION_KEYS: JSON.stringify({ k1: KEY_32 }),
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow('ENCRYPTION_KEYS configurada sem ENCRYPTION_KEY_ACTIVE');
  });

  it('rejeita ENCRYPTION_KEY_ACTIVE sem ENCRYPTION_KEYS', () => {
    expect(() =>
      parseServerEnv({
        POSTGRES_URL: 'postgres://x',
        AUTH_SECRET: 'secret',
        APP_URL: 'http://localhost:3000',
        ENCRYPTION_KEY: KEY_32,
        ENCRYPTION_KEY_ACTIVE: 'k1',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow('ENCRYPTION_KEY_ACTIVE configurada sem ENCRYPTION_KEYS');
  });

  it('rejeita chave de 16 bytes em ENCRYPTION_KEYS', () => {
    expect(() =>
      parseServerEnv({
        POSTGRES_URL: 'postgres://x',
        AUTH_SECRET: 'secret',
        APP_URL: 'http://localhost:3000',
        ENCRYPTION_KEYS: JSON.stringify({ k1: 'AAAAAAAAAAAAAAAAAAAAAA==' }),
        ENCRYPTION_KEY_ACTIVE: 'k1',
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow('32 bytes');
  });

  const BASE_ENV = {
    POSTGRES_URL: 'postgres://x',
    AUTH_SECRET: 'secret',
    APP_URL: 'http://localhost:3000',
    ENCRYPTION_KEY: KEY_32,
  };

  it('defaults Olist shadow sync to disabled with an empty allowlist', () => {
    const env = parseServerEnv(BASE_ENV as unknown as NodeJS.ProcessEnv);
    expect(env.OLIST_DATA_SYNC_ENABLED).toBe(false);
    expect(env.OLIST_DATA_SYNC_ORG_IDS).toEqual([]);
  });

  it('parses true and deduplicates UUIDs in the Olist allowlist', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const env = parseServerEnv({ ...BASE_ENV, OLIST_DATA_SYNC_ENABLED: 'true', OLIST_DATA_SYNC_ORG_IDS: ` ${id},${id} ` } as unknown as NodeJS.ProcessEnv);
    expect(env.OLIST_DATA_SYNC_ENABLED).toBe(true);
    expect(env.OLIST_DATA_SYNC_ORG_IDS).toEqual([id]);
  });

  it('parses the explicit false Olist flag', () => {
    expect(parseServerEnv({ ...BASE_ENV, OLIST_DATA_SYNC_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv).OLIST_DATA_SYNC_ENABLED).toBe(false);
  });

  it.each(['TRUE', '1', 'yes'])('rejects invalid Olist boolean %s', (value) => {
    expect(() => parseServerEnv({ ...BASE_ENV, OLIST_DATA_SYNC_ENABLED: value } as unknown as NodeJS.ProcessEnv)).toThrow();
  });

  it.each(['*', '00000000-0000-4000-8000-000000000001,,00000000-0000-4000-8000-000000000002'])('rejects wildcard and empty Olist allowlist segments', (value) => {
    expect(() => parseServerEnv({ ...BASE_ENV, OLIST_DATA_SYNC_ORG_IDS: value } as unknown as NodeJS.ProcessEnv)).toThrow('OLIST_DATA_SYNC_ORG_IDS deve conter UUIDs CSV');
  });
});
