import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { connectionSyncState, organizations } from '@/db/schema';
import {
  acquireSyncLease,
  advanceSyncCursor,
  completeSyncLease,
  createSyncStateRepository,
  failSyncLease,
  getSyncLeaseRemainingMs,
  renewSyncLease,
  yieldSyncLease,
} from '@/modules/connections/sync-state.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('sync state lease — integração PostgreSQL', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const secondSql = postgres(url ?? '', { prepare: false });
  const db = drizzle(sql);
  const firstRepository = createSyncStateRepository(db);
  const secondRepository = createSyncStateRepository(drizzle(secondSql));
  let orgId = '';
  const source = () => ({ orgId, provider: 'olist' as const, sourceGeneration: 3, accountFingerprint: 'a'.repeat(64) });

  beforeAll(async () => {
    const [organization] = await db.insert(organizations).values({ name: `ta-test-sync-lease-${RUN}`, status: 'active' }).returning({ id: organizations.id });
    orgId = organization.id;
  });
  afterEach(async () => {
    if (orgId) await db.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId));
  });
  afterAll(async () => {
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
    await secondSql.end();
    await sql.end();
  });

  it('serializa cursor JSON e concede uma única lease entre dois clientes concorrentes', async () => {
    const [first, second] = await Promise.all([
      firstRepository.acquireSyncLease({ source: source(), resource: 'orders_list', ttlMs: 270_000 }),
      secondRepository.acquireSyncLease({ source: source(), resource: 'orders_list', ttlMs: 270_000 }),
    ]);
    const winner = first ?? second;
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(winner).not.toBeNull();
    expect(await firstRepository.advanceSyncCursor({
      ...winner!,
      cursor: { pass: 'created', offset: 100 },
      processedDelta: 100,
    })).toBe(true);
    const [row] = await sql`SELECT cursor FROM connection_sync_state WHERE lease_token = ${winner!.token}`;
    expect(row.cursor).toEqual({ pass: 'created', offset: 100 });
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

  it('somente o proprietário ativo pode concluir ou falhar', async () => {
    const completed = await acquireSyncLease({ source: source(), resource: 'orders_list', ttlMs: 270_000 });
    expect(await completeSyncLease(completed!)).toBe(true);
    expect(await completeSyncLease(completed!)).toBe(false);

    const failed = await acquireSyncLease({ source: source(), resource: 'orders_list', ttlMs: 270_000 });
    expect(await failSyncLease({ ...failed!, errorCode: 'olist_http_500' })).toBe(true);

    const expired = await acquireSyncLease({ source: source(), resource: 'order_details', ttlMs: 270_000 });
    await sql`UPDATE connection_sync_state SET lease_expires_at = clock_timestamp() - interval '1 second' WHERE lease_token = ${expired!.token}`;
    expect(await completeSyncLease(expired!)).toBe(false);
    expect(await failSyncLease({ ...expired!, errorCode: 'late_worker' })).toBe(false);
  });

  it('cede lease sem publicar resultado e mantém fencing contra donos inválidos', async () => {
    const owner = await acquireSyncLease({ source: source(), resource: 'orders_prepare', ttlMs: 270_000 });
    expect(owner).not.toBeNull();
    await advanceSyncCursor({ ...owner!, cursor: { stage: 'preparing' }, processedDelta: 7 });
    await sql`UPDATE connection_sync_state SET succeeded_at=clock_timestamp(), failed_at=clock_timestamp() WHERE lease_token=${owner!.token}`;
    expect(await yieldSyncLease(owner!)).toBe(true);
    const [yielded] = await sql`SELECT cursor, succeeded_at, failed_at, lease_token, lease_expires_at FROM connection_sync_state WHERE org_id=${orgId} AND resource='orders_prepare'`;
    expect(yielded).toMatchObject({ cursor: { stage: 'preparing' }, lease_token: null, lease_expires_at: null });
    expect(yielded.succeeded_at).toBeTruthy(); expect(yielded.failed_at).toBeTruthy();

    const active = await acquireSyncLease({ source: source(), resource: 'orders_prepare', ttlMs: 270_000 });
    const [before] = await sql`SELECT cursor, lease_token, lease_expires_at FROM connection_sync_state WHERE lease_token=${active!.token}`;
    expect(await yieldSyncLease({ ...active!, token: 'wrong-token' })).toBe(false);
    expect(await yieldSyncLease({ ...active!, fencingVersion: active!.fencingVersion + 1n })).toBe(false);
    const [afterInvalid] = await sql`SELECT cursor, lease_token, lease_expires_at FROM connection_sync_state WHERE lease_token=${active!.token}`;
    expect(afterInvalid).toEqual(before);
    await sql`UPDATE connection_sync_state SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE lease_token=${active!.token}`;
    expect(await yieldSyncLease(active!)).toBe(false);
    const [expired] = await sql`SELECT cursor, lease_token, lease_expires_at FROM connection_sync_state WHERE org_id=${orgId} AND resource='orders_prepare'`;
    expect(expired.cursor).toEqual(before.cursor); expect(expired.lease_token).toBe(active!.token); expect(expired.lease_expires_at).toBeTruthy();
  });
});
