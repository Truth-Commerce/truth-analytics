import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { createLogger } from '@/lib/logger';
import {
  acquireSyncLease,
  completeSyncLease,
  failSyncLease,
  getSyncLeaseRemainingMs as remainingLeaseMs,
  parseOrdersCursor,
  renewSyncLease,
  type OlistOrdersCursor,
  type SyncLease,
} from '@/modules/connections/sync-state.repository';
import { getOlistAccountFingerprint } from '@/modules/connections/provider-connection.repository';
import { CANAL_DESCONHECIDO } from '@/modules/providers/bling/canais';
import { WORST_CASE_OLIST_REQUEST_MS } from '@/modules/providers/olist/http';
import type { ErpDataSource, OrderPage, Periodo, RawOrder } from '@/modules/providers/data.types';
import { getErpDataProvider } from '@/modules/providers/registry';

export type CollectResult = { processados: number; total: number };
export { WORST_CASE_OLIST_REQUEST_MS } from '@/modules/providers/olist/http';
const LEASE_TTL_MS = 270_000;
const logger = createLogger({ modulo: 'collect-orders' });

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []);
}

async function databaseNowIso(): Promise<string> {
  const result = await db.execute(sql`SELECT clock_timestamp() AS now`);
  const row = resultRows<{ now: Date | string }>(result)[0];
  if (!row) throw new Error('database_clock_unavailable');
  return new Date(row.now).toISOString();
}

function cursorFor(source: ErpDataSource, periodo: Periodo, updatedAfter: string, offset: number, total: number | null): OlistOrdersCursor {
  return { pass: 'created', from: periodo.inicio.toISOString(), to: periodo.fim.toISOString(), updatedAfter, offset, total, sourceGeneration: source.sourceGeneration };
}

function orderValues(source: ErpDataSource, rawOrders: RawOrder[]) {
  return rawOrders.filter((order) => order.providerOrderId.trim() !== '').map((order) => ({
    org_id: source.orgId,
    provider: source.provider,
    source_generation: source.sourceGeneration,
    provider_order_id: order.providerOrderId,
    bling_order_id: source.provider === 'bling' ? order.providerOrderId : null,
    provider_status: order.providerStatus,
    canal: order.canal,
    data: order.data,
    valor_total: String(order.valorTotal),
    frete: String(order.frete),
    itens: order.itens,
  }));
}

async function upsertOrders(source: ErpDataSource, rawOrders: RawOrder[]): Promise<number> {
  const values = orderValues(source, rawOrders);
  if (!values.length) return 0;
  const rows = await db.insert(orders).values(values).onConflictDoUpdate({
    target: [orders.org_id, orders.provider, orders.source_generation, orders.provider_order_id],
    set: {
      provider_status: sql`EXCLUDED.provider_status`,
      canal: sql`CASE WHEN EXCLUDED.canal = ${CANAL_DESCONHECIDO} THEN ${orders.canal} ELSE EXCLUDED.canal END`,
      data: sql`EXCLUDED.data`,
      valor_total: sql`EXCLUDED.valor_total`,
    },
  }).returning({ id: orders.id });
  return rows.length;
}

/** Persists a page and its cursor only while the exact PostgreSQL lease owner remains valid. */
export async function persistOrdersPageWithLease(input: { lease: SyncLease; source: ErpDataSource; page: OrderPage; nextCursor: OlistOrdersCursor }): Promise<boolean> {
  const parsedCursor = parseOrdersCursor(input.nextCursor, input.source.sourceGeneration);
  if (input.lease.resource !== 'orders_list'
    || input.lease.orgId !== input.source.orgId
    || input.lease.provider !== input.source.provider
    || input.lease.sourceGeneration !== input.source.sourceGeneration
    || (input.source.provider === 'olist' && !input.lease.accountFingerprint)
    || !parsedCursor
    || parsedCursor.offset !== input.page.nextOffset
    || parsedCursor.total !== input.page.total) return false;
  try {
    return await db.transaction(async (tx) => {
      const ownedResult = await tx.execute(sql`SELECT id FROM connection_sync_state WHERE org_id=${input.lease.orgId} AND provider=${input.lease.provider} AND source_generation=${input.lease.sourceGeneration} AND account_fingerprint IS NOT DISTINCT FROM ${input.lease.accountFingerprint} AND resource='orders_list' AND lease_token=${input.lease.token} AND fencing_version=${input.lease.fencingVersion} AND date_trunc('milliseconds', lease_expires_at) = date_trunc('milliseconds', ${input.lease.expiresAt}::timestamptz) AND lease_expires_at > clock_timestamp() FOR UPDATE`);
      const owned = resultRows<{ id: string }>(ownedResult);
      if (!owned.length) return false;
      const values = orderValues(input.source, input.page.orders);
      if (values.length) await tx.insert(orders).values(values).onConflictDoUpdate({ target: [orders.org_id, orders.provider, orders.source_generation, orders.provider_order_id], set: { provider_status: sql`EXCLUDED.provider_status`, canal: sql`CASE WHEN EXCLUDED.canal = ${CANAL_DESCONHECIDO} THEN ${orders.canal} ELSE EXCLUDED.canal END`, data: sql`EXCLUDED.data`, valor_total: sql`EXCLUDED.valor_total` } });
      const advancedResult = await tx.execute(sql`UPDATE connection_sync_state SET cursor=${JSON.stringify(parsedCursor)}::jsonb, processed_count=processed_count + ${values.length}, backlog_count=${Math.max(0, input.page.total - input.page.nextOffset)}, updated_at=clock_timestamp() WHERE id=${owned[0].id} AND org_id=${input.lease.orgId} AND provider=${input.lease.provider} AND source_generation=${input.lease.sourceGeneration} AND account_fingerprint IS NOT DISTINCT FROM ${input.lease.accountFingerprint} AND resource='orders_list' AND lease_token=${input.lease.token} AND fencing_version=${input.lease.fencingVersion} AND date_trunc('milliseconds', lease_expires_at) = date_trunc('milliseconds', ${input.lease.expiresAt}::timestamptz) AND lease_expires_at > clock_timestamp() RETURNING id`);
      return resultRows(advancedResult).length === 1;
    });
  } catch (error) {
    logger.error('falha ao persistir página cercada', {
      orgId: input.source.orgId,
      provider: input.source.provider,
      sourceGeneration: input.source.sourceGeneration,
    }, error);
    return false;
  }
}

export async function renewOrdersLeaseForRequest(lease: SyncLease): Promise<SyncLease | null> {
  if (lease.resource !== 'orders_list') return null;
  const remaining = await remainingLeaseMs(lease);
  if (remaining === null) return null;
  return remaining < WORST_CASE_OLIST_REQUEST_MS
    ? renewSyncLease(lease, LEASE_TTL_MS)
    : lease;
}

async function releaseOrdersLease(lease: SyncLease, errorCode: string): Promise<void> {
  try {
    await failSyncLease({ ...lease, errorCode });
  } catch {
    // Best effort: ownership predicates still prevent a stale worker from writing.
  }
}

export async function collectOrders(source: ErpDataSource, periodo: Periodo, options: { deadlineMs?: number; startOffset?: number } = {}): Promise<CollectResult & { expectedTotal?: number; incompleto?: boolean }> {
  if (options.startOffset !== undefined && (!Number.isSafeInteger(options.startOffset) || options.startOffset < 0)) {
    throw new Error('orders_start_offset_invalid');
  }
  const deadlineAt = Date.now() + (options.deadlineMs ?? 240_000);
  const provider = getErpDataProvider(source.provider);
  if (source.provider === 'bling') {
    if (source.sourceGeneration !== 1) throw new Error('bling_source_generation_invalid');
    let processados = 0; let total = 0;
    await provider.fetchOrders(source.orgId, { mode: 'created', periodo, offset: options.startOffset ?? 0, limit: 100 }, async (page) => { total += page.orders.length; processados += await upsertOrders(source, page.orders); });
    return { processados, total };
  }
  const fingerprint = await getOlistAccountFingerprint(source.orgId);
  if (!fingerprint) return { processados: 0, total: 0, incompleto: true };
  const acquired = await acquireSyncLease({ source: { ...source, accountFingerprint: fingerprint }, resource: 'orders_list', ttlMs: LEASE_TTL_MS });
  if (!acquired) return { processados: 0, total: 0, incompleto: true };
  const savedCursor = parseOrdersCursor(acquired.cursor, source.sourceGeneration);
  const resumeCursor = savedCursor?.pass === 'created' && savedCursor.from === periodo.inicio.toISOString() && savedCursor.to === periodo.fim.toISOString() ? savedCursor : null;
  let updatedAfter: string;
  try {
    updatedAfter = resumeCursor?.updatedAfter ?? await databaseNowIso();
  } catch (error) {
    await releaseOrdersLease(acquired, 'olist_database_clock_failed');
    throw error;
  }
  let lease = acquired; let offset = options.startOffset ?? resumeCursor?.offset ?? 0; let processados = 0; let total = 0; let expectedTotal: number | undefined;
  while (Date.now() < deadlineAt) {
    let requestLease: SyncLease | null;
    try {
      requestLease = await renewOrdersLeaseForRequest(lease);
    } catch (error) {
      await releaseOrdersLease(lease, 'olist_lease_check_failed');
      throw error;
    }
    if (!requestLease) return { processados, total, expectedTotal, incompleto: true };
    lease = requestLease;
    if (Date.now() >= deadlineAt) {
      await releaseOrdersLease(lease, 'olist_deadline_exceeded');
      return { processados, total, expectedTotal, incompleto: true };
    }
    let page: OrderPage | undefined;
    try {
      await provider.fetchOrders(source.orgId, { mode: 'created', periodo, offset, limit: 100 }, async (value) => { page = value; });
    } catch (error) {
      await releaseOrdersLease(lease, 'olist_orders_list_failed');
      throw error;
    }
    if (!page) {
      await releaseOrdersLease(lease, 'orders_page_missing');
      throw new Error('orders_page_missing');
    }
    total += page.orders.length; expectedTotal = page.total;
    const persisted = await persistOrdersPageWithLease({ lease, source, page, nextCursor: cursorFor(source, periodo, updatedAfter, page.nextOffset, page.total) });
    if (!persisted) {
      await releaseOrdersLease(lease, 'olist_orders_persist_failed');
      return { processados, total, expectedTotal, incompleto: true };
    }
    processados += page.orders.filter((order) => order.providerOrderId.trim() !== '').length;
    if (page.done) {
      try {
        if (!await completeSyncLease(lease)) {
          await releaseOrdersLease(lease, 'olist_orders_complete_failed');
          return { processados, total, expectedTotal, incompleto: true };
        }
      } catch {
        await releaseOrdersLease(lease, 'olist_orders_complete_failed');
        return { processados, total, expectedTotal, incompleto: true };
      }
      return { processados, total, expectedTotal };
    }
    offset = page.nextOffset;
  }
  await releaseOrdersLease(lease, 'olist_deadline_exceeded');
  return { processados, total, expectedTotal, incompleto: true };
}
