import { describe, expect, it, vi } from 'vitest';

const env = { CRON_SECRET: 'cron-secret-123456', OLIST_DATA_SYNC_ENABLED: false, OLIST_DATA_SYNC_ORG_IDS: [] as string[] };
const candidates = vi.fn(); const heartbeat = vi.fn(); const prepare = vi.fn();
vi.mock('@/lib/env', () => ({ serverEnv: env }));
vi.mock('@/modules/connections/provider-connection.repository', () => ({ listOlistConnectionsPendingPreparation: candidates }));
vi.mock('@/modules/admin/heartbeat.repository', () => ({ registrarHeartbeat: heartbeat }));
vi.mock('@/modules/pipeline/prepare-olist', () => ({ prepareOlistOrders: prepare }));
vi.mock('@/lib/secret-compare', () => ({ secretsMatch: (a: string | null, b: string) => a === b }));

describe('cron preparar-olist', () => {
  it('does not touch DB when the kill switch is off', async () => {
    const { GET } = await import('@/app/api/cron/preparar-olist/route');
    const response = await GET(new Request('http://test', { headers: { authorization: 'Bearer cron-secret-123456' } }));
    expect(await response.json()).toEqual({ disabled: true, orgs: 0 }); expect(candidates).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated requests', async () => {
    const { GET } = await import('@/app/api/cron/preparar-olist/route');
    expect((await GET(new Request('http://test'))).status).toBe(401);
  });
  it('caps the cohort and reports safe outcome counters', async () => {
    env.OLIST_DATA_SYNC_ENABLED = true; env.OLIST_DATA_SYNC_ORG_IDS = ['00000000-0000-4000-8000-000000000001'];
    candidates.mockResolvedValue([{ orgId: 'a', provider: 'olist', sourceGeneration: 1 }, { orgId: 'b', provider: 'olist', sourceGeneration: 1 }, { orgId: 'c', provider: 'olist', sourceGeneration: 1 }, { orgId: 'd', provider: 'olist', sourceGeneration: 1 }]);
    prepare.mockResolvedValue({ ready: true, blocked: false, stale: false });
    const { GET } = await import('@/app/api/cron/preparar-olist/route'); const response = await GET(new Request('http://test', { headers: { authorization: 'Bearer cron-secret-123456' } }));
    expect(await response.json()).toEqual({ orgs: 3, ready: 3, pending: 0, blocked: 0, stale: 0, failed: 0 }); expect(prepare).toHaveBeenCalledTimes(3); expect(heartbeat).toHaveBeenCalledWith('preparar-olist', true, expect.any(Object));
  });
});
