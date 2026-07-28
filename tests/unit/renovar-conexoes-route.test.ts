import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({ serverEnv: { CRON_SECRET: 'cron-olist-seguro' } }));
vi.mock('@/modules/connections/provider-connection.repository', () => ({
  listProviderConnectionsExpiring: vi.fn(),
}));
vi.mock('@/modules/connections/olist-token-renewal', () => ({
  OLIST_REFRESH_BATCH: 50,
  OLIST_REFRESH_MARGIN_MS: 10_800_000,
  renewOlistConnection: vi.fn(),
}));
vi.mock('@/modules/admin/heartbeat.repository', () => ({ registrarHeartbeat: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function request(auth?: string): Request {
  return new Request('http://localhost/api/cron/renovar-conexoes', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe('cron renovar-conexoes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { serverEnv } = await import('@/lib/env');
    serverEnv.CRON_SECRET = 'cron-olist-seguro';
  });

  it('rejeita segredo ausente ou incorreto com 401', async () => {
    const { GET } = await import('@/app/api/cron/renovar-conexoes/route');
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request('Bearer incorreto'))).status).toBe(401);

    const { serverEnv } = await import('@/lib/env');
    serverEnv.CRON_SECRET = undefined;
    expect((await GET(request('Bearer cron-olist-seguro'))).status).toBe(401);
  });

  it('limita concorrência, isola falha por org e publica só quatro contadores', async () => {
    const repo = await import('@/modules/connections/provider-connection.repository');
    const renewal = await import('@/modules/connections/olist-token-renewal');
    const heartbeat = await import('@/modules/admin/heartbeat.repository');
    const logger = await import('@/lib/logger');

    vi.mocked(repo.listProviderConnectionsExpiring).mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => ({
        id: `c-${index}`,
        orgId: `org-${index}`,
        provider: 'olist' as const,
      })),
    );

    let active = 0;
    let maxActive = 0;
    vi.mocked(renewal.renewOlistConnection).mockImplementation(async (orgId) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      if (orgId === 'org-1') return 'expired';
      if (orgId === 'org-2') return 'transient';
      if (orgId === 'org-3') return 'won-by-peer';
      if (orgId === 'org-4') throw new Error('refresh-token-ultrassecreto');
      return 'renewed';
    });

    const { GET } = await import('@/app/api/cron/renovar-conexoes/route');
    const response = await GET(request('Bearer cron-olist-seguro'));
    expect(response.status).toBe(200);
    const expected = { candidatas: 12, renovadas: 9, expiradas: 1, transitorias: 2 };
    expect(await response.json()).toEqual(expected);
    expect(maxActive).toBe(10);
    expect(heartbeat.registrarHeartbeat).toHaveBeenCalledWith(
      'renovar-conexoes',
      true,
      expected,
    );
    const logged = JSON.stringify([
      vi.mocked(logger.logger.info).mock.calls,
      vi.mocked(logger.logger.warn).mock.calls,
      vi.mocked(logger.logger.error).mock.calls,
    ]);
    expect(logged).not.toContain('refresh-token-ultrassecreto');
  });
});
