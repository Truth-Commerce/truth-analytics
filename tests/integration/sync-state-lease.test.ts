import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connectionSyncState, organizations } from '@/db/schema';
import {
  acquireSyncLease, advanceSyncCursor, completeSyncLease,
  failSyncLease, getSyncLeaseRemainingMs, renewSyncLease,
} from '@/modules/connections/sync-state.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('sync state lease — integração PostgreSQL', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const db = drizzle(sql);
  let orgId = '';
  const source = () => ({ orgId, provider: 'olist' as const, sourceGeneration: 3, accountFingerprint: 'a'.repeat(64) });

  beforeAll(async () => {
    const [organization] = await db.insert(organizations).values({ name: `ta-test-sync-lease-${RUN}`, status: 'active' }).returning({ id: organizations.id });
    orgId = organization.id;
  });
  afterAll(async () => {
    await db.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('concede uma única lease por fonte e recurso e bloqueia escritor cercado', async () => {
    const first = await acquireSyncLease({ source: source(), resource: 'orders_list', ttlMs: 270_000 });
    expect(first).not.toBeNull();
    expect(await acquireSyncLease({ source: source(), resource: 'orders_list', ttlMs: 270_000 })).toBeNull();
    await sql`UPDATE connection_sync_state SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE lease_token = ${first!.token}`;
    const successor = await acquireSyncLease({ source: source(), resource: 'orders_list', ttlMs: 270_000 });
    expect(successor?.token).not.toBe(first?.token);
    expect(successor!.fencingVersion).toBeGreaterThan(first!.fencingVersion);
    expect(await advanceSyncCursor({ ...first!, cursor: { offset: 100 }, processedDelta: 100 })).toBe(false);
    expect(await advanceSyncCursor({ ...successor!, cursor: { offset: 100 }, processedDelta: 100 })).toBe(true);
    await expect(advanceSyncCursor({ ...successor!, cursor: { offset: 100 }, processedDelta: -1 })).rejects.toThrow('sync_processed_delta_invalid');
  });

  it('isola recursos e gerações e exige o fingerprint do proprietário', async () => {
    const orders = await acquireSyncLease({ source: source(), resource: 'stock', ttlMs: 270_000 });
    const otherGeneration = await acquireSyncLease({ source: { ...source(), sourceGeneration: 4 }, resource: 'stock', ttlMs: 270_000 });
    expect(orders).not.toBeNull();
    expect(otherGeneration).not.toBeNull();
    expect(await renewSyncLease({ ...orders!, accountFingerprint: 'b'.repeat(64) }, 270_000)).toBeNull();
    expect(await completeSyncLease({ ...orders!, accountFingerprint: 'b'.repeat(64) })).toBe(false);
    expect(await failSyncLease({ ...orders!, accountFingerprint: 'b'.repeat(64), errorCode: 'x' })).toBe(false);
  });

  it('reseta o cursor quando um novo fingerprint assume uma lease expirada', async () => {
    const initial = await acquireSyncLease({ source: source(), resource: 'orders_list', ttlMs: 270_000 });
    await advanceSyncCursor({ ...initial!, cursor: { offset: 50 }, processedDelta: 50 });
    await sql`UPDATE connection_sync_state SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE lease_token = ${initial!.token}`;
    const successor = await acquireSyncLease({ source: { ...source(), accountFingerprint: 'c'.repeat(64) }, resource: 'orders_list', ttlMs: 270_000 });
    expect(successor?.cursor).toBeNull();
  });

  it('calcula e estende a duração exclusivamente no PostgreSQL', async () => {
    const lease = await acquireSyncLease({ source: source(), resource: 'order_details', ttlMs: 270_000 });
    const remaining = await getSyncLeaseRemainingMs(lease!);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(270_000);
    const renewed = await renewSyncLease(lease!, 270_000);
    expect(renewed?.fencingVersion).toBe(lease!.fencingVersion);
    expect(renewed!.expiresAt.getTime()).toBeGreaterThan(lease!.expiresAt.getTime());
  });
});
