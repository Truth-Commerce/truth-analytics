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

  it('roteia URLs inertes de integração, incluindo o fallback da URL direta', () => {
    if (!process.env.DATABASE_URL_TEST) return;
    expect(process.env.POSTGRES_URL).toBe(process.env.DATABASE_URL_TEST);
    expect(process.env.POSTGRES_URL_DIRECT).toBe(
      process.env.DATABASE_URL_TEST_DIRECT ?? process.env.DATABASE_URL_TEST,
    );
  });

  it('nunca deixa URL de produção no processo de teste', () => {
    expect(process.env.POSTGRES_URL).not.toMatch(/neon\.tech|vercel-storage|production|main/i);
  });
});
