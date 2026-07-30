import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = {
  CRON_SECRET: 'cron-secret-123456',
  OLIST_DATA_SYNC_ENABLED: false,
  OLIST_DATA_SYNC_ORG_IDS: [] as string[],
};
const candidates = vi.fn();
const heartbeat = vi.fn();
const prepare = vi.fn();

vi.mock('@/lib/env', () => ({ serverEnv: env }));
vi.mock('@/modules/connections/provider-connection.repository', () => ({ listOlistConnectionsPendingPreparation: candidates }));
vi.mock('@/modules/admin/heartbeat.repository', () => ({ registrarHeartbeat: heartbeat }));
vi.mock('@/modules/pipeline/prepare-olist', () => ({ prepareOlistOrders: prepare }));
vi.mock('@/lib/secret-compare', () => ({ secretsMatch: (a: string | null, b: string) => a === b }));

const authorization = { authorization: 'Bearer cron-secret-123456' };
const request = () => new Request('http://test', { headers: authorization });
const source = (orgId: string) => ({ orgId, provider: 'olist', sourceGeneration: 1 });

describe('cron preparar-olist', () => {
  beforeEach(() => {
    env.CRON_SECRET = 'cron-secret-123456';
    env.OLIST_DATA_SYNC_ENABLED = false;
    env.OLIST_DATA_SYNC_ORG_IDS = [];
    candidates.mockReset();
    prepare.mockReset();
    heartbeat.mockReset();
  });

  it('rejects unauthenticated requests before any repository call', async () => {
    const { GET } = await import('@/app/api/cron/preparar-olist/route');

    expect((await GET(new Request('http://test'))).status).toBe(401);
    expect(candidates).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('does not touch the repository when the kill switch is off', async () => {
    const { GET } = await import('@/app/api/cron/preparar-olist/route');

    const response = await GET(request());

    expect(await response.json()).toEqual({ disabled: true, orgs: 0 });
    expect(candidates).not.toHaveBeenCalled();
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('does not touch the repository when the allowlist is empty', async () => {
    env.OLIST_DATA_SYNC_ENABLED = true;
    const { GET } = await import('@/app/api/cron/preparar-olist/route');

    const response = await GET(request());

    expect(await response.json()).toEqual({ orgs: 0, prepared: 0, failed: 0 });
    expect(candidates).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(heartbeat).not.toHaveBeenCalled();
  });

  it('caps a defensive four-row repository result to three sources', async () => {
    env.OLIST_DATA_SYNC_ENABLED = true;
    env.OLIST_DATA_SYNC_ORG_IDS = ['00000000-0000-4000-8000-000000000001'];
    candidates.mockResolvedValue(['a', 'b', 'c', 'd'].map(source));
    prepare.mockResolvedValue({ ready: true, blocked: false, stale: false });
    const { GET } = await import('@/app/api/cron/preparar-olist/route');

    const response = await GET(request());

    expect(await response.json()).toEqual({ orgs: 3, ready: 3, pending: 0, blocked: 0, stale: 0, failed: 0 });
    expect(candidates).toHaveBeenCalledWith({ orgIds: env.OLIST_DATA_SYNC_ORG_IDS, limit: 3 });
    expect(prepare).toHaveBeenCalledTimes(3);
  });

  it('prepares sources serially and shares a deadline capped at 235 seconds', async () => {
    env.OLIST_DATA_SYNC_ENABLED = true;
    env.OLIST_DATA_SYNC_ORG_IDS = ['00000000-0000-4000-8000-000000000001'];
    candidates.mockResolvedValue(['a', 'b'].map(source));
    const order: string[] = [];
    let releaseFirst!: () => void;
    prepare.mockImplementationOnce(async (item: { orgId: string }) => {
      order.push(item.orgId);
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      return { ready: false, blocked: false, stale: false };
    }).mockImplementationOnce(async (item: { orgId: string }) => {
      order.push(item.orgId);
      return { ready: false, blocked: false, stale: false };
    });
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const { GET } = await import('@/app/api/cron/preparar-olist/route');

    const responsePromise = GET(request());
    await vi.waitFor(() => expect(order).toEqual(['a']));
    expect(prepare).toHaveBeenCalledTimes(1);
    releaseFirst();
    const response = await responsePromise;

    expect(order).toEqual(['a', 'b']);
    expect(prepare.mock.calls.map(([, options]) => options.deadlineAt)).toEqual([1_235_000, 1_235_000]);
    expect(await response.json()).toMatchObject({ orgs: 2, pending: 2 });
  });

  it('isolates one organization failure and reports every outcome counter safely', async () => {
    env.OLIST_DATA_SYNC_ENABLED = true;
    env.OLIST_DATA_SYNC_ORG_IDS = ['00000000-0000-4000-8000-000000000001'];
    candidates.mockResolvedValue(['ready', 'pending', 'blocked'].map(source));
    prepare
      .mockResolvedValueOnce({ ready: true, blocked: false, stale: false })
      .mockRejectedValueOnce(new Error('one organization failed'))
      .mockResolvedValueOnce({ ready: false, blocked: true, stale: false });
    const { GET } = await import('@/app/api/cron/preparar-olist/route');

    const response = await GET(request());
    const body = await response.json();

    expect(body).toEqual({ orgs: 3, ready: 1, pending: 0, blocked: 1, stale: 0, failed: 1 });
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(heartbeat).toHaveBeenCalledWith('preparar-olist', false, body);
  });

  it('counts stale separately, records a successful heartbeat, and never serializes secrets', async () => {
    env.OLIST_DATA_SYNC_ENABLED = true;
    env.OLIST_DATA_SYNC_ORG_IDS = ['00000000-0000-4000-8000-000000000001'];
    candidates.mockResolvedValue(['stale'].map(source));
    prepare.mockResolvedValue({ ready: false, blocked: false, stale: true, secret: 'do-not-leak', fingerprint: 'do-not-leak' });
    const { GET } = await import('@/app/api/cron/preparar-olist/route');

    const response = await GET(request());
    const raw = await response.text();

    expect(JSON.parse(raw)).toEqual({ orgs: 1, ready: 0, pending: 0, blocked: 0, stale: 1, failed: 0 });
    expect(raw).not.toContain('do-not-leak');
    expect(raw).not.toMatch(/secret|fingerprint/i);
    expect(heartbeat).toHaveBeenCalledWith('preparar-olist', true, JSON.parse(raw));
  });
});
