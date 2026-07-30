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
});
