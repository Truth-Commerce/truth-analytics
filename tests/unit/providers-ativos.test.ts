import { describe, expect, it, vi } from 'vitest';

describe('providersAtivos — filtra pela configuração', () => {
  it('sem SERPAPI_KEY → só ml_publico (SERPAPI ausente não é falha)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', async (importOriginal) => {
      const mod = await importOriginal<typeof import('@/lib/env')>();
      return { ...mod, serverEnv: { ...mod.serverEnv, SERPAPI_KEY: undefined } };
    });
    const { providersAtivos } = await import('@/modules/pipeline/steps/collect-market');
    expect(providersAtivos().map((p) => p.fonte)).toEqual(['ml_publico']);
    vi.doUnmock('@/lib/env');
  });

  it('com SERPAPI_KEY → serpapi + ml_publico', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', async (importOriginal) => {
      const mod = await importOriginal<typeof import('@/lib/env')>();
      return { ...mod, serverEnv: { ...mod.serverEnv, SERPAPI_KEY: 'chave-teste' } };
    });
    const { providersAtivos } = await import('@/modules/pipeline/steps/collect-market');
    expect(providersAtivos().map((p) => p.fonte)).toEqual(['serpapi', 'ml_publico']);
    vi.doUnmock('@/lib/env');
  });
});
