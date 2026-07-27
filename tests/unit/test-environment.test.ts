import { describe, expect, it } from 'vitest';

describe('ambiente hermético de testes', () => {
  it('usa credenciais inertes sem DATABASE_URL_TEST', () => {
    if (process.env.DATABASE_URL_TEST) return;
    expect(process.env.POSTGRES_URL).toBe(
      'postgresql://unit:unit@127.0.0.1:5432/truth_analytics_unit',
    );
    expect(process.env.POSTGRES_URL_DIRECT).toBe(process.env.POSTGRES_URL);
    expect(process.env.AUTH_SECRET).toBe('truth-analytics-unit-test-secret');
    expect(process.env.ENCRYPTION_KEY).toBe(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    );
  });

  it('roteia somente a configuração de integração previamente validada', () => {
    if (!process.env.DATABASE_URL_TEST) return;
    expect(process.env.POSTGRES_URL).toBe(process.env.DATABASE_URL_TEST);
    expect(process.env.POSTGRES_URL_DIRECT).toBe(
      process.env.DATABASE_URL_TEST_DIRECT ?? process.env.DATABASE_URL_TEST,
    );
  });

  it('usa exatamente o alvo testado ou o alvo unitário inerte', () => {
    const expectedUrl =
      process.env.DATABASE_URL_TEST ??
      'postgresql://unit:unit@127.0.0.1:5432/truth_analytics_unit';
    const expectedDirect = process.env.DATABASE_URL_TEST
      ? (process.env.DATABASE_URL_TEST_DIRECT ?? process.env.DATABASE_URL_TEST)
      : expectedUrl;

    expect(process.env.POSTGRES_URL).toBe(expectedUrl);
    expect(process.env.POSTGRES_URL_DIRECT).toBe(expectedDirect);
  });
});
