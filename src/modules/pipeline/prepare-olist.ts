import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { getOlistAccountFingerprint } from '@/modules/connections/provider-connection.repository';
import { acquireSyncLease, completeSyncLease, failSyncLease, getSyncLeaseRemainingMs, parsePreparationCursor, renewSyncLease, savePreparationCursor, yieldSyncLease, type PreparationCursor, type PreparationPhase, type SyncLease } from '@/modules/connections/sync-state.repository';
import { enrichOrders } from '@/modules/pipeline/steps/enrich-orders';
import { reconcileOrderReadiness } from '@/modules/pipeline/order-reconciliation';
import { WORST_CASE_OLIST_REQUEST_MS } from '@/modules/providers/olist/http';
import type { ErpDataSource, OrderPage, RawOrder } from '@/modules/providers/data.types';
import { getErpDataProvider } from '@/modules/providers/registry';

export type PreparationStage = PreparationPhase | 'stale';
export type PreparationResult = { stage: PreparationStage; ready: boolean; blocked: boolean; stale: boolean; window: { from: string; to: string; catchUpFrom: string }; reason?: string };
export type PrepareOlistOptions = { deadlineAt?: number; maxOrders?: number; maxDetails?: number };
const LEASE_TTL_MS = 270_000;
const INITIAL_CAP = 1_000;
type Facts = { expectedCount: number; checksum: string; dailyChecksum: string; channelChecksum: string };

export function preparationWindow(capturedAt: string): { from: string; to: string; catchUpFrom: string } {
  const captured = new Date(capturedAt); if (Number.isNaN(captured.getTime())) throw new Error('prepare_database_clock_invalid');
  const to = new Date(Date.UTC(captured.getUTCFullYear(), captured.getUTCMonth(), captured.getUTCDate()));
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - 90);
  return { from: from.toISOString(), to: to.toISOString(), catchUpFrom: captured.toISOString() };
}
function rows<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : ((value as { rows?: T[] }).rows ?? []); }
function base(source: ErpDataSource, fingerprint: string, window: PreparationResult['window']): PreparationCursor {
  return { version: 1, stage: 'snapshot', sourceGeneration: source.sourceGeneration, accountFingerprint: fingerprint, window: { from: window.from, to: window.to }, catchUpFrom: window.catchUpFrom, snapshot: { done: false }, catchup: { done: false, completedAt: null }, verify1: null, verify2: null, progress: null };
}
function outcome(cursor: PreparationCursor, window: PreparationResult['window'], reason?: string): PreparationResult {
  const persistedWindow = { from: cursor.window.from, to: cursor.window.to, catchUpFrom: cursor.catchUpFrom };
  return { stage: cursor.stage, ready: cursor.stage === 'ready', blocked: cursor.stage === 'blocked', stale: false, window: persistedWindow ?? window, ...(reason ?? cursor.reason ? { reason: reason ?? cursor.reason } : {}) };
}
async function renew(lease: SyncLease): Promise<SyncLease | null> {
  const remaining = await getSyncLeaseRemainingMs(lease); if (remaining === null) return null;
  return remaining < WORST_CASE_OLIST_REQUEST_MS ? renewSyncLease(lease, LEASE_TTL_MS) : lease;
}
async function save(lease: SyncLease, cursor: PreparationCursor): Promise<boolean> { return savePreparationCursor({ ...lease, cursor }); }
async function current(source: ErpDataSource, fingerprint: string): Promise<boolean> { return (await getOlistAccountFingerprint(source.orgId, source.sourceGeneration)) === fingerprint; }

/** A stale owner can neither write page rows nor advance the preparation cursor. */
async function persistPage(lease: SyncLease, source: ErpDataSource, list: RawOrder[], cursor: PreparationCursor): Promise<boolean> {
  return db.transaction(async (tx) => {
    const owned = rows<{ id: string }>(await tx.execute(sql`SELECT id FROM connection_sync_state WHERE org_id=${lease.orgId} AND provider='olist' AND source_generation=${lease.sourceGeneration} AND account_fingerprint=${lease.accountFingerprint} AND resource='orders_prepare' AND lease_token=${lease.token} AND fencing_version=${lease.fencingVersion} AND lease_expires_at > clock_timestamp() FOR UPDATE`));
    if (!owned.length) return false;
    for (const order of list.filter((o) => o.providerOrderId.trim())) await tx.execute(sql`
      INSERT INTO orders (org_id, provider, source_generation, provider_order_id, provider_status, canal, data, valor_total, frete, itens)
      VALUES (${source.orgId}, 'olist', ${source.sourceGeneration}, ${order.providerOrderId}, ${order.providerStatus}, ${order.canal}, ${order.data}, ${String(order.valorTotal)}, ${String(order.frete)}, ${JSON.stringify(order.itens)}::jsonb)
      ON CONFLICT (org_id, provider, source_generation, provider_order_id) DO UPDATE SET provider_status=EXCLUDED.provider_status, canal=CASE WHEN EXCLUDED.canal='Desconhecido' THEN orders.canal ELSE EXCLUDED.canal END, data=EXCLUDED.data, valor_total=EXCLUDED.valor_total`);
    const advanced = rows(await tx.execute(sql`UPDATE connection_sync_state SET cursor=${JSON.stringify(cursor)}::jsonb, updated_at=clock_timestamp() WHERE id=${owned[0].id} AND lease_token=${lease.token} AND fencing_version=${lease.fencingVersion} AND lease_expires_at > clock_timestamp() RETURNING id`));
    return advanced.length === 1;
  });
}
async function databaseNow(): Promise<string> { const row = rows<{ now: Date | string }>(await db.execute(sql`SELECT clock_timestamp() AS now`))[0]; if (!row) throw new Error('prepare_database_clock_unavailable'); return new Date(row.now).toISOString(); }
async function publishReady(lease: SyncLease, source: ErpDataSource, cursor: PreparationCursor): Promise<boolean> {
  if (source.provider !== 'olist' || lease.resource !== 'orders_prepare' || lease.orgId !== source.orgId || lease.provider !== source.provider || lease.sourceGeneration !== source.sourceGeneration || lease.accountFingerprint !== cursor.accountFingerprint || cursor.sourceGeneration !== source.sourceGeneration || cursor.stage !== 'ready' || !cursor.catchup.completedAt || new Date(cursor.window.from) >= new Date(cursor.window.to) || new Date(cursor.catchUpFrom) < new Date(cursor.window.to)) return false;
  const baseline = cursor.catchUpFrom;
  return db.transaction(async (tx) => {
    const owned = rows<{ id: string }>(await tx.execute(sql`SELECT id FROM connection_sync_state WHERE org_id=${lease.orgId} AND provider='olist' AND source_generation=${lease.sourceGeneration} AND account_fingerprint=${lease.accountFingerprint} AND resource='orders_prepare' AND lease_token=${lease.token} AND fencing_version=${lease.fencingVersion} AND lease_expires_at > clock_timestamp() FOR UPDATE`));
    if (!owned.length) return false;
    const published = rows(await tx.execute(sql`UPDATE connections SET last_sync_at=GREATEST(COALESCE(last_sync_at, '-infinity'::timestamptz), ${baseline}::timestamptz) WHERE org_id=${source.orgId} AND provider='olist' AND data_generation=${source.sourceGeneration} AND provider_account_fingerprint=${cursor.accountFingerprint} AND status IN ('configurado','ok') AND access_token IS NOT NULL AND refresh_token IS NOT NULL AND EXISTS (SELECT 1 FROM organizations WHERE id=${source.orgId} AND status='active') RETURNING id`));
    if (published.length !== 1) return false;
    return rows(await tx.execute(sql`UPDATE connection_sync_state SET cursor=${JSON.stringify(cursor)}::jsonb, updated_at=clock_timestamp() WHERE id=${owned[0].id} AND lease_token=${lease.token} AND fencing_version=${lease.fencingVersion} AND lease_expires_at > clock_timestamp() RETURNING id`)).length === 1;
  });
}
async function facts(source: ErpDataSource, cursor: PreparationCursor): Promise<Facts> {
  const result = rows<Facts>(await db.execute(sql`
    SELECT count(DISTINCT NULLIF(provider_order_id, ''))::int AS "expectedCount",
      md5(coalesce(string_agg(concat_ws('|', NULLIF(provider_order_id, ''), coalesce(provider_status, ''), valor_total::text), ',' ORDER BY NULLIF(provider_order_id, ''), coalesce(provider_status, ''), valor_total::text), '')) AS checksum,
      md5(coalesce((SELECT string_agg(day_key || '|' || total, ',' ORDER BY day_key) FROM (SELECT data::date::text AS day_key, sum(valor_total)::text AS total FROM orders WHERE org_id=${source.orgId} AND provider='olist' AND source_generation=${source.sourceGeneration} AND data >= ${cursor.window.from}::timestamptz AND data < ${cursor.window.to}::timestamptz GROUP BY data::date) d), '')) AS "dailyChecksum",
      md5(coalesce((SELECT string_agg(channel_key || '|' || total, ',' ORDER BY channel_key) FROM (SELECT canal AS channel_key, sum(valor_total)::text AS total FROM orders WHERE org_id=${source.orgId} AND provider='olist' AND source_generation=${source.sourceGeneration} AND data >= ${cursor.window.from}::timestamptz AND data < ${cursor.window.to}::timestamptz GROUP BY canal) c), '')) AS "channelChecksum"
    FROM orders WHERE org_id=${source.orgId} AND provider='olist' AND source_generation=${source.sourceGeneration} AND data >= ${cursor.window.from}::timestamptz AND data < ${cursor.window.to}::timestamptz
  `));
  const row = result[0]; if (!row) throw new Error('prepare_facts_missing'); return { ...row, expectedCount: Number(row.expectedCount) };
}

async function fetchPhase(source: ErpDataSource, lease: SyncLease, cursor: PreparationCursor, phase: 'snapshot' | 'catchup' | 'verify1' | 'verify2', deadlineAt: number, cap: number): Promise<{ cursor: PreparationCursor; lease: SyncLease; yielded: boolean; remoteTotal?: number }> {
  const provider = getErpDataProvider('olist'); const progress = cursor.progress?.phaseKey === phase ? cursor.progress : null;
  let offset = progress?.offset ?? 0; const cycleId = progress?.cycleId ?? crypto.randomUUID(); let active = lease;
  while (offset < cap) {
    if (Date.now() + WORST_CASE_OLIST_REQUEST_MS > deadlineAt) { cursor.progress = { phaseKey: phase, cycleId, offset, total: progress?.total ?? null }; await save(active, cursor); await yieldSyncLease(active); return { cursor, lease: active, yielded: true }; }
    const renewed = await renew(active); if (!renewed) throw new Error('prepare_lease_lost'); active = renewed;
    if (!await current(source, cursor.accountFingerprint)) throw new Error('prepare_source_stale');
    let page: OrderPage | undefined;
    await provider.fetchOrders(source.orgId, phase === 'snapshot' || phase === 'verify1' || phase === 'verify2'
      ? { mode: 'created', periodo: { inicio: new Date(cursor.window.from), fim: new Date(new Date(cursor.window.to).getTime() - 1) }, offset, limit: 100, deadlineAt }
      : { mode: 'updated', updatedAfter: new Date(cursor.catchUpFrom), offset, limit: 100, deadlineAt }, async (value) => { page = value; });
    if (!page || (!page.done && (page.nextOffset <= offset || page.orders.length === 0))) throw new Error('prepare_page_no_progress');
    if (page.total > cap) { cursor.stage = 'blocked'; cursor.reason = 'capacity_risk'; cursor.progress = { phaseKey: phase, cycleId, offset, total: page.total }; await save(active, cursor); return { cursor, lease: active, yielded: false }; }
    offset = page.nextOffset;
    cursor.progress = { phaseKey: phase, cycleId, offset, total: page.total };
    if (phase === 'snapshot' || phase === 'catchup' || phase === 'verify1' || phase === 'verify2') { if (!await persistPage(active, source, page.orders, cursor)) throw new Error('prepare_lease_lost'); }
    else if (!await save(active, cursor)) throw new Error('prepare_lease_lost');
    if (page.done) {
      cursor.progress = null;
      if (phase === 'snapshot') { cursor.snapshot = { done: true }; cursor.stage = 'catchup'; }
      else if (phase === 'catchup') { cursor.catchup = { done: true, completedAt: await databaseNow() }; cursor.stage = 'verify1'; }
      if (!await save(active, cursor)) throw new Error('prepare_lease_lost');
      return { cursor, lease: active, yielded: false, remoteTotal: page.total };
    }
  }
  cursor.stage = 'blocked'; cursor.reason = 'capacity_risk'; cursor.progress = { phaseKey: phase, cycleId, offset, total: progress?.total ?? null }; await save(active, cursor); return { cursor, lease: active, yielded: false };
}

/** Shadow-only Olist bootstrap. It never changes connection status or invokes normal cron/report flows. */
export async function prepareOlistOrders(source: ErpDataSource, options: PrepareOlistOptions = {}): Promise<PreparationResult> {
  if (source.provider !== 'olist') throw new Error('prepare_olist_provider_required');
  for (const value of [options.maxOrders, options.maxDetails]) if (value !== undefined && (!Number.isSafeInteger(value) || value < 1 || value > INITIAL_CAP)) throw new Error('prepare_olist_limit_invalid');
  const clock = rows<{ now: Date | string }>(await db.execute(sql`SELECT clock_timestamp() AS now`))[0]; if (!clock) throw new Error('prepare_database_clock_unavailable');
  const window = preparationWindow(new Date(clock.now).toISOString()); const deadlineAt = options.deadlineAt ?? Date.now() + 240_000;
  const fingerprint = await getOlistAccountFingerprint(source.orgId, source.sourceGeneration);
  if (!fingerprint) return { stage: 'stale', ready: false, blocked: false, stale: true, window, reason: 'source_stale' };
  const lease = await acquireSyncLease({ source: { ...source, accountFingerprint: fingerprint }, resource: 'orders_prepare', ttlMs: LEASE_TTL_MS });
  if (!lease) return { stage: 'blocked', ready: false, blocked: true, stale: false, window, reason: 'lease_busy' };
  let active = lease;
  try {
    let cursor = parsePreparationCursor(lease.cursor, source.sourceGeneration, fingerprint) ?? base(source, fingerprint, window);
    // A previously published generation is idempotent; malformed state always starts cleanly.
    if (cursor.stage === 'ready') {
      const readiness = await reconcileOrderReadiness({ ...source, accountFingerprint: fingerprint });
      if (!readiness.ready || !await publishReady(active, source, cursor)) {
        if (!await failSyncLease({ ...active, errorCode: 'prepare_ready_revalidation_failed' })) throw new Error('prepare_lease_lost');
        return { stage: 'blocked', ready: false, blocked: true, stale: false, window: { from: cursor.window.from, to: cursor.window.to, catchUpFrom: cursor.catchUpFrom }, reason: 'prepare_ready_revalidation_failed' };
      }
      if (!await completeSyncLease(active)) throw new Error('prepare_lease_lost');
      return outcome(cursor, window);
    }
    if (!await save(active, cursor)) throw new Error('prepare_lease_lost');
    if (cursor.stage === 'snapshot' || cursor.stage === 'catchup') {
      const phase = cursor.stage; const loaded = await fetchPhase(source, active, cursor, phase, deadlineAt, options.maxOrders ?? INITIAL_CAP); cursor = loaded.cursor; active = loaded.lease;
      if (loaded.yielded || cursor.stage === 'blocked') { if (cursor.stage === 'blocked' && !await yieldSyncLease(active)) throw new Error('prepare_lease_lost'); return outcome(cursor, window); }
      if (!await yieldSyncLease(active)) throw new Error('prepare_lease_lost');
      return outcome(cursor, window);
    }
    if (cursor.stage === 'verify1' || cursor.stage === 'verify2') {
      const phase = cursor.stage; const verified = await fetchPhase(source, active, cursor, phase, deadlineAt, options.maxOrders ?? INITIAL_CAP); cursor = verified.cursor; active = verified.lease;
      if (verified.yielded || cursor.stage === 'blocked') { if (cursor.stage === 'blocked' && !await yieldSyncLease(active)) throw new Error('prepare_lease_lost'); return outcome(cursor, window); }
      const evidence = await facts(source, cursor);
      if (verified.remoteTotal !== evidence.expectedCount) { cursor.progress = null; cursor.reason = 'verification_count_mismatch'; }
      else if (phase === 'verify1') { cursor.verify1 = { done: true, ...evidence }; cursor.stage = 'verify2'; }
      else if (!cursor.verify1 || JSON.stringify(cursor.verify1) !== JSON.stringify({ done: true, ...evidence })) { cursor.verify1 = { done: true, ...evidence }; cursor.verify2 = null; cursor.progress = null; cursor.stage = 'verify2'; cursor.reason = 'verification_unstable'; }
      else { cursor.verify2 = { done: true, ...evidence }; cursor.stage = 'details'; }
      if (!await save(active, cursor)) throw new Error('prepare_lease_lost'); if (!await yieldSyncLease(active)) throw new Error('prepare_lease_lost'); return outcome(cursor, window);
    }
    if (cursor.stage === 'details') {
      const beforeDetailsLease = await renew(active); if (!beforeDetailsLease) throw new Error('prepare_lease_lost'); active = beforeDetailsLease;
      const result = await enrichOrders(source, { maxPedidos: options.maxDetails ?? INITIAL_CAP, deadlineAt, periodo: { inicio: new Date(cursor.window.from), fim: new Date(cursor.window.to) } });
      const afterDetailsLease = await renew(active); if (!afterDetailsLease) throw new Error('prepare_lease_lost'); active = afterDetailsLease;
      if (result.incompleto || result.quarentenados > 0) { if (result.quarentenados > 0) { cursor.stage = 'blocked'; cursor.reason = 'details_quarantined'; if (!await save(active, cursor) || !await yieldSyncLease(active)) throw new Error('prepare_lease_lost'); } else { if (!await save(active, cursor) || !await yieldSyncLease(active)) throw new Error('prepare_lease_lost'); } return outcome(cursor, window, result.quarentenados > 0 ? 'details_quarantined' : 'details_pending'); }
      const readiness = await reconcileOrderReadiness({ ...source, accountFingerprint: fingerprint });
      if (!readiness.ready) { cursor.stage = 'blocked'; cursor.reason = readiness.reasons[0] ?? 'reconciliation_failed'; if (!await save(active, cursor) || !await yieldSyncLease(active)) throw new Error('prepare_lease_lost'); return outcome(cursor, window); }
      cursor.stage = 'ready';
    }
    if (cursor.stage === 'ready') {
      const completedAt = cursor.catchup.completedAt; if (!completedAt || !await current(source, fingerprint)) throw new Error('prepare_source_stale');
      if (!await publishReady(active, source, cursor)) throw new Error('prepare_publish_cas_failed');
      if (!await completeSyncLease(active)) throw new Error('prepare_lease_lost');
    }
    return outcome(cursor, window);
  } catch (error) {
    const stale = error instanceof Error && error.message === 'prepare_source_stale'; await failSyncLease({ ...active, errorCode: stale ? 'source_stale' : (error instanceof Error ? error.message.slice(0, 64) : 'prepare_failed') });
    return { stage: stale ? 'stale' : 'blocked', ready: false, blocked: !stale, stale, window, reason: stale ? 'source_stale' : 'prepare_failed' };
  }
}

/** Narrow integration seam; not part of the production pipeline API. */
export const __test = { persistPage, publishReady };
