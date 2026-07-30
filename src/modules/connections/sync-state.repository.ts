import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import type { ErpProviderId } from '@/modules/providers/types';

export type SyncResource = 'orders_list' | 'order_details' | 'stock' | 'orders_prepare';
export type SyncSource = { orgId: string; provider: ErpProviderId; sourceGeneration: number; accountFingerprint: string | null };
export type SyncLease = SyncSource & {
  resource: SyncResource;
  token: string;
  fencingVersion: bigint;
  runId: string;
  expiresAt: Date;
  cursor: unknown;
};
export type OlistOrdersCursor = {
  pass: 'created' | 'updated'; from: string; to: string; updatedAfter: string;
  offset: number; total: number | null; sourceGeneration: number;
};

type SqlExecutor = { execute(query: ReturnType<typeof sql>): PromiseLike<unknown> };
type LeaseRow = { org_id: string; provider: ErpProviderId; source_generation: number; account_fingerprint: string | null; resource: SyncResource; lease_token: string; fencing_version: bigint | string; run_id: string; lease_expires_at: Date | string; cursor: unknown };

function rows(result: unknown): unknown[] { return Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows ?? []; }
function assertTtl(ttlMs: number): void { if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) throw new Error('sync_lease_ttl_invalid'); }
function assertSourceGeneration(sourceGeneration: number): void {
  if (!Number.isSafeInteger(sourceGeneration) || sourceGeneration < 1) {
    throw new Error('sync_source_generation_invalid');
  }
}
function serializeCursor(cursor: unknown): string {
  try {
    const serialized = JSON.stringify(cursor);
    if (serialized === undefined) throw new Error('sync_cursor_invalid');
    return serialized;
  } catch {
    throw new Error('sync_cursor_invalid');
  }
}
function toLease(row: LeaseRow): SyncLease {
  return { orgId: row.org_id, provider: row.provider, sourceGeneration: row.source_generation, accountFingerprint: row.account_fingerprint, resource: row.resource, token: row.lease_token, fencingVersion: BigInt(row.fencing_version), runId: row.run_id, expiresAt: new Date(row.lease_expires_at), cursor: row.cursor };
}

function ownerPredicate(lease: SyncLease) {
  return sql`org_id = ${lease.orgId} AND provider = ${lease.provider} AND source_generation = ${lease.sourceGeneration}
    AND account_fingerprint IS NOT DISTINCT FROM ${lease.accountFingerprint} AND resource = ${lease.resource}
    AND lease_token = ${lease.token} AND fencing_version = ${lease.fencingVersion}
    AND lease_expires_at > clock_timestamp()`;
}

/** PostgreSQL is the lease clock and fencing authority. */
export function createSyncStateRepository(client: SqlExecutor = db) {
  return {
    async acquireSyncLease(input: { source: SyncSource; resource: SyncResource; ttlMs: number }): Promise<SyncLease | null> {
      assertTtl(input.ttlMs);
      assertSourceGeneration(input.source.sourceGeneration);
      const result = rows(await client.execute(sql`
        INSERT INTO connection_sync_state (
          org_id, provider, source_generation, account_fingerprint, resource, run_id,
          lease_token, lease_expires_at, started_at, fencing_version, updated_at
        ) VALUES (
          ${input.source.orgId}, ${input.source.provider}, ${input.source.sourceGeneration}, ${input.source.accountFingerprint}, ${input.resource}, gen_random_uuid(),
          gen_random_uuid()::text, clock_timestamp() + ${input.ttlMs} * interval '1 millisecond', clock_timestamp(), 1, clock_timestamp()
        ) ON CONFLICT (org_id, provider, source_generation, resource) DO UPDATE SET
          account_fingerprint = EXCLUDED.account_fingerprint, run_id = gen_random_uuid(), lease_token = gen_random_uuid()::text,
          lease_expires_at = clock_timestamp() + ${input.ttlMs} * interval '1 millisecond', started_at = clock_timestamp(),
          fencing_version = connection_sync_state.fencing_version + 1,
          cursor = CASE WHEN connection_sync_state.account_fingerprint IS NOT DISTINCT FROM EXCLUDED.account_fingerprint THEN connection_sync_state.cursor ELSE NULL END,
          updated_at = clock_timestamp(), last_error_code = NULL
        WHERE connection_sync_state.lease_expires_at IS NULL OR connection_sync_state.lease_expires_at <= clock_timestamp()
        RETURNING org_id, provider, source_generation, account_fingerprint, resource, lease_token, fencing_version, run_id, lease_expires_at, cursor
      `));
      return result[0] ? toLease(result[0] as LeaseRow) : null;
    },
    async getSyncLeaseRemainingMs(lease: SyncLease): Promise<number | null> {
      const result = rows(await client.execute(sql`
        SELECT GREATEST(0, floor(extract(epoch FROM lease_expires_at - clock_timestamp()) * 1000))::bigint AS remaining_ms
        FROM connection_sync_state WHERE ${ownerPredicate(lease)}
      `));
      const remaining = (result[0] as { remaining_ms: number | string } | undefined)?.remaining_ms;
      return remaining === undefined ? null : Number(remaining);
    },
    async renewSyncLease(lease: SyncLease, ttlMs: number): Promise<SyncLease | null> {
      assertTtl(ttlMs);
      const result = rows(await client.execute(sql`
        UPDATE connection_sync_state SET lease_expires_at = clock_timestamp() + ${ttlMs} * interval '1 millisecond', updated_at = clock_timestamp()
        WHERE ${ownerPredicate(lease)}
        RETURNING org_id, provider, source_generation, account_fingerprint, resource, lease_token, fencing_version, run_id, lease_expires_at, cursor
      `));
      return result[0] ? toLease(result[0] as LeaseRow) : null;
    },
    async advanceSyncCursor(input: SyncLease & { cursor: unknown; processedDelta: number; backlogCount?: number | null }): Promise<boolean> {
      if (!Number.isSafeInteger(input.processedDelta) || input.processedDelta < 0) throw new Error('sync_processed_delta_invalid');
      const serializedCursor = serializeCursor(input.cursor);
      const result = rows(await client.execute(sql`
        UPDATE connection_sync_state SET cursor = ${serializedCursor}::jsonb, processed_count = processed_count + ${input.processedDelta},
          backlog_count = ${input.backlogCount ?? null}, updated_at = clock_timestamp()
        WHERE ${ownerPredicate(input)} RETURNING id
      `));
      return result.length === 1;
    },
    async completeSyncLease(input: SyncLease): Promise<boolean> {
      const result = rows(await client.execute(sql`
        UPDATE connection_sync_state SET lease_token = NULL, lease_expires_at = NULL, succeeded_at = clock_timestamp(), updated_at = clock_timestamp(), last_error_code = NULL
        WHERE ${ownerPredicate(input)} RETURNING id
      `));
      return result.length === 1;
    },
    /** Releases a fenced lease without publishing success/failure, preserving resumable state. */
    async yieldSyncLease(input: SyncLease): Promise<boolean> {
      const result = rows(await client.execute(sql`
        UPDATE connection_sync_state SET lease_token = NULL, lease_expires_at = NULL, updated_at = clock_timestamp()
        WHERE ${ownerPredicate(input)} RETURNING id
      `));
      return result.length === 1;
    },
    async failSyncLease(input: SyncLease & { errorCode: string }): Promise<boolean> {
      const result = rows(await client.execute(sql`
        UPDATE connection_sync_state SET lease_token = NULL, lease_expires_at = NULL, failed_at = clock_timestamp(), updated_at = clock_timestamp(), last_error_code = ${input.errorCode}
        WHERE ${ownerPredicate(input)} RETURNING id
      `));
      return result.length === 1;
    },
  };
}

const repository = createSyncStateRepository();
export const acquireSyncLease = repository.acquireSyncLease;
export const getSyncLeaseRemainingMs = repository.getSyncLeaseRemainingMs;
export const renewSyncLease = repository.renewSyncLease;
export const advanceSyncCursor = repository.advanceSyncCursor;
export const completeSyncLease = repository.completeSyncLease;
export const yieldSyncLease = repository.yieldSyncLease;
export const failSyncLease = repository.failSyncLease;

function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.toISOString() !== value ? null : value;
}
function nonNegativeInteger(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null; }
function positiveInteger(value: unknown): number | null { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null; }

/** Returns null to make an invalid or stale persisted cursor reset explicit. */
export function parseOrdersCursor(value: unknown, sourceGeneration?: number): OlistOrdersCursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const cursor = value as Record<string, unknown>;
  const pass = cursor.pass === 'created' || cursor.pass === 'updated' ? cursor.pass : null;
  const from = iso(cursor.from); const to = iso(cursor.to); const updatedAfter = iso(cursor.updatedAfter);
  const offset = nonNegativeInteger(cursor.offset); const generation = positiveInteger(cursor.sourceGeneration);
  const total = cursor.total === null ? null : nonNegativeInteger(cursor.total);
  if (!pass || !from || !to || !updatedAfter || offset === null || generation === null || total === null && cursor.total !== null || (sourceGeneration !== undefined && generation !== sourceGeneration)) return null;
  return { pass, from, to, updatedAfter, offset, total, sourceGeneration: generation };
}

export type PreparationCursor = {
  version: 1;
  stage: 'ready';
  sourceGeneration: number;
  accountFingerprint: string;
  window: { from: string; to: string };
  catchUpFrom: string;
  snapshot: { done: boolean };
  catchup: { done: boolean; completedAt?: string };
  verify1: PreparationVerification | null;
  verify2: PreparationVerification | null;
};
export type PreparationVerification = { done: true; expectedCount: number; checksum: string; dailyChecksum: string; channelChecksum: string };

/** Versioned readiness state: any malformed persisted shape explicitly resets preparation. */
export function parsePreparationCursor(value: unknown, sourceGeneration: number, accountFingerprint: string | null = null): PreparationCursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const cursor = value as Record<string, unknown>;
  const snapshot = cursor.snapshot as { done?: unknown } | undefined;
  const catchup = cursor.catchup as { done?: unknown; completedAt?: unknown } | undefined;
  const generation = positiveInteger(cursor.sourceGeneration);
  const fingerprint = typeof cursor.accountFingerprint === 'string' ? cursor.accountFingerprint : null;
  const window = cursor.window as { from?: unknown; to?: unknown } | undefined;
  const from = iso(window?.from); const to = iso(window?.to); const catchUpFrom = iso(cursor.catchUpFrom);
  const catchupCompletedAt = catchup?.completedAt === undefined ? undefined : iso(catchup.completedAt);
  const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/i.test(value);
  const verify = (value: unknown): PreparationVerification | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const entry = value as Record<string, unknown>; const expectedCount = nonNegativeInteger(entry.expectedCount);
    if (entry.done !== true || expectedCount === null || !digest(entry.checksum) || !digest(entry.dailyChecksum) || !digest(entry.channelChecksum)) return null;
    return { done: true, expectedCount, checksum: entry.checksum, dailyChecksum: entry.dailyChecksum, channelChecksum: entry.channelChecksum };
  };
  const verify1 = verify(cursor.verify1); const verify2 = verify(cursor.verify2);
  if (cursor.version !== 1 || cursor.stage !== 'ready' || generation !== sourceGeneration || fingerprint === null || !/^[a-f0-9]{64}$/i.test(fingerprint) || (accountFingerprint !== null && fingerprint !== accountFingerprint) || !from || !to || !catchUpFrom || catchupCompletedAt === null || new Date(from) >= new Date(to) || new Date(catchUpFrom) < new Date(from) || new Date(catchUpFrom) > new Date(to) || snapshot?.done !== true || catchup?.done !== true || !verify1 || !verify2 || verify1.expectedCount !== verify2.expectedCount || verify1.checksum !== verify2.checksum || verify1.dailyChecksum !== verify2.dailyChecksum || verify1.channelChecksum !== verify2.channelChecksum) return null;
  return { version: 1, stage: 'ready', sourceGeneration: generation, accountFingerprint: fingerprint, window: { from, to }, catchUpFrom, snapshot: { done: true }, catchup: catchupCompletedAt ? { done: true, completedAt: catchupCompletedAt } : { done: true }, verify1, verify2 };
}
