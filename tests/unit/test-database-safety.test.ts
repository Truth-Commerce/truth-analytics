import { describe, expect, it } from 'vitest';
import {
  ALLOW_REMOTE_TEST_DATABASE_TOKEN,
  resolveTestDatabaseUrls,
} from '@/lib/test-database-safety';

const loopback = 'postgresql://test:secret@127.0.0.1:5432/truth_analytics_test';

describe('resolveTestDatabaseUrls', () => {
  it('permite um banco de teste loopback sem opt-in destrutivo', () => {
    expect(
      resolveTestDatabaseUrls({ DATABASE_URL_TEST: loopback }),
    ).toEqual({ databaseUrl: loopback, directUrl: loopback });
  });

  it('rejeita URL de teste ausente ou inválida sem expor credenciais', () => {
    expect(() => resolveTestDatabaseUrls({})).toThrow(/DATABASE_URL_TEST ausente/i);
    expect(() =>
      resolveTestDatabaseUrls({ DATABASE_URL_TEST: 'not a database url' }),
    ).toThrow(/DATABASE_URL_TEST inválida/i);
    expect(() =>
      resolveTestDatabaseUrls({
        DATABASE_URL_TEST: 'mysql://user:super-secret@db.example.com/app',
      }),
    ).toThrow(/DATABASE_URL_TEST inválida/i);
  });

  it('rejeita escape percent malformado sem ecoar credenciais', () => {
    const invalidUrl = 'postgresql://test:super-secret@rds.example.com/truth%ZZ';

    try {
      resolveTestDatabaseUrls({ DATABASE_URL_TEST: invalidUrl });
      throw new Error('A URL inválida deveria ter sido rejeitada.');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/DATABASE_URL_TEST inválida/i);
      expect((error as Error).message).not.toContain('super-secret');
    }
  });

  it('rejeita qualquer banco remoto sem o opt-in destrutivo explícito', () => {
    expect(() =>
      resolveTestDatabaseUrls({
        DATABASE_URL_TEST: 'postgresql://test:secret@rds.example.com:5432/truth_test',
      }),
    ).toThrow(/ALLOW_REMOTE_TEST_DATABASE/i);
  });

  it('aceita banco remoto somente com o token destrutivo exato', () => {
    const databaseUrl = 'postgresql://test:secret@rds.example.com:5432/truth_test';
    expect(
      resolveTestDatabaseUrls({
        DATABASE_URL_TEST: databaseUrl,
        ALLOW_REMOTE_TEST_DATABASE: ALLOW_REMOTE_TEST_DATABASE_TOKEN,
      }),
    ).toEqual({ databaseUrl, directUrl: databaseUrl });
  });

  it('rejeita URL direta insegura mesmo quando a URL principal é loopback', () => {
    expect(() =>
      resolveTestDatabaseUrls({
        DATABASE_URL_TEST: loopback,
        DATABASE_URL_TEST_DIRECT:
          'postgresql://test:secret@rds.example.com:5432/truth_test',
      }),
    ).toThrow(/ALLOW_REMOTE_TEST_DATABASE/i);
  });

  it('rejeita URL direta inválida em vez de usar o fallback silenciosamente', () => {
    expect(() =>
      resolveTestDatabaseUrls({
        DATABASE_URL_TEST: loopback,
        DATABASE_URL_TEST_DIRECT: 'not a database url',
      }),
    ).toThrow(/DATABASE_URL_TEST_DIRECT inválida/i);
  });

  it('rejeita alvo remoto igual ao runtime, ignorando senha e query, mesmo com opt-in', () => {
    expect(() =>
      resolveTestDatabaseUrls({
        DATABASE_URL_TEST:
          'postgresql://test:secret@RDS.EXAMPLE.COM/truth_production?sslmode=require',
        ALLOW_REMOTE_TEST_DATABASE: ALLOW_REMOTE_TEST_DATABASE_TOKEN,
        POSTGRES_URL:
          'postgres://production:another-secret@rds.example.com:5432/truth_production?connect_timeout=10',
      }),
    ).toThrow(/coincide com POSTGRES_URL/i);
  });

  it('normaliza o caminho do banco ao comparar um alvo remoto ao runtime', () => {
    expect(() =>
      resolveTestDatabaseUrls({
        DATABASE_URL_TEST:
          'postgresql://test:secret@rds.example.com/truth%5Fproduction',
        ALLOW_REMOTE_TEST_DATABASE: ALLOW_REMOTE_TEST_DATABASE_TOKEN,
        POSTGRES_URL:
          'postgresql://production:another-secret@rds.example.com:5432/truth_production',
      }),
    ).toThrow(/coincide com POSTGRES_URL/i);
  });

  it('permite que loopback coincida com o runtime em CI', () => {
    expect(
      resolveTestDatabaseUrls({
        DATABASE_URL_TEST: loopback,
        POSTGRES_URL: loopback,
        POSTGRES_URL_DIRECT: loopback,
      }),
    ).toEqual({ databaseUrl: loopback, directUrl: loopback });
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'permite o host loopback %s sem opt-in',
    (host) => {
      const databaseUrl = `postgresql://test:secret@${host}:5432/truth_analytics_test`;
      expect(resolveTestDatabaseUrls({ DATABASE_URL_TEST: databaseUrl })).toEqual({
        databaseUrl,
        directUrl: databaseUrl,
      });
    },
  );
});
