import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const execute = vi.fn();
  return { execute, transaction: vi.fn(async (work: (tx: { execute: typeof execute }) => Promise<unknown>) => work({ execute })), acquire: vi.fn(), save: vi.fn(), yieldLease: vi.fn(), complete: vi.fn(), fail: vi.fn(), fetchOrders: vi.fn(), parse: vi.fn(() => null) };
});
const { execute, transaction, acquire, save, yieldLease, complete, fail, fetchOrders } = mocks;
vi.mock('@/db/client', () => ({ db: { execute: mocks.execute, transaction: mocks.transaction } }));
vi.mock('@/modules/connections/provider-connection.repository', () => ({ getOlistAccountFingerprint: vi.fn(async () => 'a'.repeat(64)) }));
vi.mock('@/modules/connections/sync-state.repository', () => ({ acquireSyncLease: mocks.acquire, completeSyncLease: mocks.complete, failSyncLease: mocks.fail, getSyncLeaseRemainingMs: vi.fn(async () => 999_999), renewSyncLease: vi.fn(), parsePreparationCursor: mocks.parse, savePreparationCursor: mocks.save, yieldSyncLease: mocks.yieldLease }));
vi.mock('@/modules/providers/registry', () => ({ getErpDataProvider: () => ({ fetchOrders: mocks.fetchOrders }) }));
vi.mock('@/modules/pipeline/steps/enrich-orders', () => ({ enrichOrders: vi.fn() }));
vi.mock('@/modules/pipeline/order-reconciliation', () => ({ reconcileOrderReadiness: vi.fn() }));

import { preparationWindow } from '@/modules/pipeline/prepare-olist';

describe('Olist shadow preparation window', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    execute.mockResolvedValue([{ now: '2026-07-30T19:42:10.123Z' }]);
    acquire.mockResolvedValue({ orgId: 'org', provider: 'olist', sourceGeneration: 1, accountFingerprint: 'a'.repeat(64), resource: 'orders_prepare', token: 'lease', fencingVersion: 1n, expiresAt: new Date(Date.now() + 60_000), cursor: null });
    save.mockResolvedValue(true); yieldLease.mockResolvedValue(true); complete.mockResolvedValue(true); fail.mockResolvedValue(true);
  });
  it('uses a UTC half-open 90-day window and preserves the DB watermark', () => {
    expect(preparationWindow('2026-07-30T19:42:10.123Z')).toEqual({
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-07-30T00:00:00.000Z',
      catchUpFrom: '2026-07-30T19:42:10.123Z',
    });
  });

  it('rejects an invalid database timestamp before any remote work can begin', () => {
    expect(() => preparationWindow('not-a-timestamp')).toThrow('prepare_database_clock_invalid');
  });

  it('starts the real orchestrator with a fenced snapshot page and advances to catchup', async () => {
    fetchOrders.mockImplementation(async (_org: string, _request: unknown, onPage: (page: unknown) => Promise<void>) => onPage({ orders: [{ providerOrderId: '1', providerStatus: 'ok', canal: 'site', data: new Date('2026-07-01T00:00:00.000Z'), valorTotal: 10, frete: 0, itens: [] }], offset: 0, nextOffset: 1, total: 1, done: true }));
    // owner lock, order upsert, cursor advance; then terminal cursor save
    execute.mockResolvedValueOnce([{ now: '2026-07-30T19:42:10.123Z' }]).mockResolvedValue([{ id: 'state' }]);
    const { prepareOlistOrders } = await import('@/modules/pipeline/prepare-olist');
    await expect(prepareOlistOrders({ orgId: 'org', provider: 'olist', sourceGeneration: 1 })).resolves.toMatchObject({ stage: 'catchup', ready: false });
    expect(fetchOrders).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it.each([0, -1, 1001, 1.5])('rejects invalid bounded capacity %s before I/O', async (limit) => {
    const { prepareOlistOrders } = await import('@/modules/pipeline/prepare-olist');
    await expect(prepareOlistOrders({ orgId: 'org', provider: 'olist', sourceGeneration: 1 }, { maxOrders: limit })).rejects.toThrow('prepare_olist_limit_invalid');
    expect(acquire).not.toHaveBeenCalled();
  });

  it('fails closed and releases the outer lease when a remote page makes no progress', async () => {
    fetchOrders.mockImplementation(async (_org: string, _request: unknown, onPage: (page: unknown) => Promise<void>) => onPage({ orders: [], offset: 0, nextOffset: 0, total: 2, done: false }));
    const { prepareOlistOrders } = await import('@/modules/pipeline/prepare-olist');
    await expect(prepareOlistOrders({ orgId: 'org', provider: 'olist', sourceGeneration: 1 })).resolves.toMatchObject({ stage: 'blocked', reason: 'prepare_failed' });
    expect(fail).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'prepare_page_no_progress' }));
  });

  it('does not issue HTTP after an already-expired deadline and yields its lease', async () => {
    const { prepareOlistOrders } = await import('@/modules/pipeline/prepare-olist');
    await expect(prepareOlistOrders({ orgId: 'org', provider: 'olist', sourceGeneration: 1 }, { deadlineAt: Date.now() - 1 })).resolves.toMatchObject({ blocked: true });
    expect(fetchOrders).not.toHaveBeenCalled();
    expect(yieldLease).toHaveBeenCalled();
  });

  it('fails closed when the source fingerprint is absent before publishing readiness', async () => {
    const connection = await import('@/modules/connections/provider-connection.repository');
    vi.mocked(connection.getOlistAccountFingerprint).mockResolvedValueOnce(null);
    const { prepareOlistOrders } = await import('@/modules/pipeline/prepare-olist');
    await expect(prepareOlistOrders({ orgId: 'org', provider: 'olist', sourceGeneration: 1 })).resolves.toMatchObject({ stage: 'stale', ready: false });
    expect(fetchOrders).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });
});
