import { and, eq, gte, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { createLogger } from '@/lib/logger';
import { pLimit } from '@/lib/p-limit';
import { criarPortao } from '@/lib/rate-gate';
import { getValidAccessToken } from '@/modules/connections/connection.repository';
import { getOlistAccountFingerprint } from '@/modules/connections/provider-connection.repository';
import { acquireSyncLease, completeSyncLease, failSyncLease, getSyncLeaseRemainingMs, renewSyncLease, type SyncLease } from '@/modules/connections/sync-state.repository';
import { WORST_CASE_OLIST_REQUEST_MS, OlistDataError } from '@/modules/providers/olist/http';
import { BlingDataError } from '@/modules/providers/bling/http';
import { fetchCanaisVenda } from '@/modules/providers/bling/canais';
import type { ErpDataSource, RawOrderDetail } from '@/modules/providers/data.types';
import { getErpDataProvider } from '@/modules/providers/registry';
import type { Periodo } from '@/modules/providers/types';

const LEASE_TTL_MS = 270_000;
const BLING_INTERVAL_MS = 340;
const MAX_PERMANENT_ATTEMPTS = 5;

export type EnrichOptions = { maxPedidos: number; prazoMs: number; periodo?: Periodo };
/** `quarentenados` is optional while Task 8 migrates existing orchestrator mocks. */
export type EnrichResult = { enriquecidos: number; falhas: number; restantes: number; incompleto: boolean; quarentenados: number };
type PendingOrder = { id: string; providerOrderId: string; enrichmentAttempts: number };
class EnrichmentStructuralError extends Error {}

function rows<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : ((value as { rows?: T[] }).rows ?? []); }

async function pendingOrders(source: ErpDataSource, limit: number, periodo?: Periodo): Promise<PendingOrder[]> {
  const retryReady = sql`(${orders.enrichment_last_attempt_at} IS NULL OR ${orders.enrichment_last_attempt_at} <= clock_timestamp() - interval '30 seconds')`;
  const filters = [eq(orders.org_id, source.orgId), eq(orders.provider, source.provider), eq(orders.source_generation, source.sourceGeneration), isNotNull(orders.provider_order_id), isNull(orders.enriquecido_em), lt(orders.enrichment_attempts, MAX_PERMANENT_ATTEMPTS), retryReady];
  if (periodo) filters.push(gte(orders.data, periodo.inicio), lte(orders.data, periodo.fim));
  const result = await db.select({ id: orders.id, providerOrderId: orders.provider_order_id, enrichmentAttempts: orders.enrichment_attempts }).from(orders).where(and(...filters)).orderBy(sql`${orders.data} desc`).limit(limit);
  return result.filter((row): row is PendingOrder => Boolean(row.providerOrderId));
}

async function pendingCount(source: ErpDataSource): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.org_id, source.orgId), eq(orders.provider, source.provider), eq(orders.source_generation, source.sourceGeneration), isNotNull(orders.provider_order_id), isNull(orders.enriquecido_em), lt(orders.enrichment_attempts, MAX_PERMANENT_ATTEMPTS)));
  return row?.n ?? 0;
}

export async function renewOrderDetailsLeaseForRequest(lease: SyncLease): Promise<SyncLease | null> {
  if (lease.resource !== 'order_details') return null;
  const remaining = await getSyncLeaseRemainingMs(lease);
  if (remaining === null) return null;
  return remaining < WORST_CASE_OLIST_REQUEST_MS ? renewSyncLease(lease, LEASE_TTL_MS) : lease;
}

function validDetail(value: RawOrderDetail): boolean {
  return Array.isArray(value.itens) && Number.isFinite(value.frete) && Number.isFinite(value.comissao);
}

function errorCode(error: unknown): { code: string; permanent: boolean } {
  if (error instanceof Error && error.message === 'olist_detalhe_resposta_invalida') return { code: 'contract', permanent: true };
  if (error instanceof BlingDataError) {
    if (error.status === 403) return { code: 'permission', permanent: true };
    if (error.status === 404) return { code: 'missing_remote', permanent: true };
    if (error.status === 401) return { code: 'auth_transient', permanent: false };
    return { code: error.code, permanent: false };
  }
  if (error instanceof Error && (error.message === 'bling_detalhe_vazio' || error.message === 'bling_payload_invalido')) return { code: 'contract', permanent: true };
  if (error instanceof OlistDataError) {
    if (error.status === 403) return { code: 'permission', permanent: true };
    if (error.status === 404) return { code: 'missing_remote', permanent: true };
    if (error.kind === 'permanent') return { code: 'contract', permanent: true };
    return { code: error.code, permanent: false };
  }
  const status = typeof error === 'object' && error ? Number((error as { status?: unknown }).status) : NaN;
  if (status === 403) return { code: 'permission', permanent: true };
  if (status === 404) return { code: 'missing_remote', permanent: true };
  if (status === 401) return { code: 'unauthorized', permanent: false }; // provider refreshes once before returning this
  if (status === 429 || status >= 500 || !Number.isNaN(status)) return { code: 'remote_transient', permanent: false };
  return { code: 'network', permanent: false };
}

/** Atomically checks the fenced lease and then writes the detail or attempt. */
export async function persistOrderDetailWithLease(input: { lease: SyncLease; source: ErpDataSource; order: PendingOrder; detail?: RawOrderDetail; errorCode?: string; permanent?: boolean; canal?: string }): Promise<boolean> {
  const { lease, source, order } = input;
  if (lease.resource !== 'order_details' || lease.orgId !== source.orgId || lease.provider !== source.provider || lease.sourceGeneration !== source.sourceGeneration || (source.provider === 'olist' && !lease.accountFingerprint) || (!input.detail && !input.errorCode) || (input.detail && !validDetail(input.detail))) return false;
  return db.transaction(async (tx) => {
      const expiry = lease.expiresAt.toISOString();
      const owned = rows<{ id: string }>(await tx.execute(sql`SELECT id FROM connection_sync_state WHERE org_id=${lease.orgId} AND provider=${lease.provider} AND source_generation=${lease.sourceGeneration} AND account_fingerprint IS NOT DISTINCT FROM ${lease.accountFingerprint} AND resource='order_details' AND lease_token=${lease.token} AND fencing_version=${lease.fencingVersion} AND date_trunc('milliseconds', lease_expires_at)=date_trunc('milliseconds', ${expiry}::timestamptz) AND lease_expires_at > clock_timestamp() FOR UPDATE`));
      if (!owned.length) return false;
      const common = sql`id=${order.id} AND org_id=${source.orgId} AND provider=${source.provider} AND source_generation=${source.sourceGeneration} AND provider_order_id=${order.providerOrderId} AND enriquecido_em IS NULL AND enrichment_attempts < ${MAX_PERMANENT_ATTEMPTS}`;
      if (input.detail) {
        const updated = rows(await tx.execute(sql`UPDATE orders SET itens=${JSON.stringify(input.detail.itens)}::jsonb, frete=${String(input.detail.frete)}, comissao=${String(input.detail.comissao)}, enriquecido_em=clock_timestamp(), enrichment_last_attempt_at=clock_timestamp(), enrichment_last_error_code=NULL${input.canal ? sql`, canal=${input.canal.slice(0, 32)}` : sql``} WHERE ${common} RETURNING id`));
        return updated.length === 1;
      }
      const attempts = input.permanent ? sql`enrichment_attempts + 1` : sql`enrichment_attempts`;
      const updated = rows(await tx.execute(sql`UPDATE orders SET enrichment_attempts=${attempts}, enrichment_last_attempt_at=clock_timestamp(), enrichment_last_error_code=${input.errorCode!} WHERE ${common} RETURNING enrichment_attempts`));
      return updated.length === 1;
    });
}

async function release(lease: SyncLease, code: string) { try { await failSyncLease({ ...lease, errorCode: code }); } catch { /* fenced persistence remains authoritative */ } }

/** Provider-aware enrichment for one frozen ERP data source. */
export async function enrichOrders(source: ErpDataSource, opts: EnrichOptions): Promise<EnrichResult> {
  const log = createLogger({ orgId: source.orgId, provider: source.provider });
  const deadlineAt = Date.now() + opts.prazoMs;
  let enriquecidos = 0; let falhas = 0; let quarentenados = 0;
  let activeLease: SyncLease | null = null;
  try {
    const queue = await pendingOrders(source, opts.maxPedidos, opts.periodo);
    if (!queue.length) {
      const restantes = await pendingCount(source);
      return { enriquecidos, falhas, quarentenados, restantes, incompleto: restantes > 0 };
    }
    const fingerprint = source.provider === 'olist'
      ? await getOlistAccountFingerprint(source.orgId, source.sourceGeneration)
      : null;
    if (source.provider === 'olist' && !fingerprint) return { enriquecidos, falhas, quarentenados, restantes: await pendingCount(source), incompleto: true };
    const acquired = await acquireSyncLease({ source: { ...source, accountFingerprint: fingerprint }, resource: 'order_details', ttlMs: LEASE_TTL_MS });
    if (!acquired) return { enriquecidos, falhas, quarentenados, restantes: await pendingCount(source), incompleto: true };
    let lease = acquired; activeLease = lease;
    const provider = getErpDataProvider(source.provider);
    const gate = source.provider === 'bling' ? criarPortao(BLING_INTERVAL_MS) : async () => undefined;
    let blingToken: string | undefined;
    let blingChannels: ReadonlyMap<string, string> | undefined;
    if (source.provider === 'bling') {
      if (Date.now() >= deadlineAt) { await release(lease, 'bling_deadline_exceeded'); return { enriquecidos, falhas, quarentenados, restantes: await pendingCount(source), incompleto: true }; }
      blingToken = await getValidAccessToken(source.orgId, undefined, { deadlineAt });
      await gate();
      if (Date.now() >= deadlineAt) { await release(lease, 'bling_deadline_exceeded'); return { enriquecidos, falhas, quarentenados, restantes: await pendingCount(source), incompleto: true }; }
      blingChannels = await fetchCanaisVenda(source.orgId, blingToken, { deadlineAt });
    }
    const blingState = blingToken ? { token: blingToken } : undefined;
    const limit = pLimit(source.provider === 'olist' ? 1 : 3);
    await Promise.all(queue.map(order => limit(async () => {
      if (Date.now() >= deadlineAt) return;
      try {
        const checked = await renewOrderDetailsLeaseForRequest(lease);
        if (!checked || Date.now() >= deadlineAt) return;
        lease = checked;
        await gate();
        if (Date.now() >= deadlineAt) return;
        const detail = await provider.fetchOrderDetail(source.orgId, order.providerOrderId, { deadlineAt, blingToken, blingChannels, blingState });
        if (!validDetail(detail)) throw new OlistDataError('detail_contract_invalid', 'permanent');
        let saved: boolean;
        try { saved = await persistOrderDetailWithLease({ lease, source, order, detail, canal: detail.canal }); } catch { falhas++; throw new EnrichmentStructuralError('local_transient'); }
        if (!saved) { falhas++; throw new EnrichmentStructuralError('order_detail_lease_lost'); }
        enriquecidos++;
      } catch (error) {
        if (error instanceof EnrichmentStructuralError) throw error;
        falhas++;
        const classified = errorCode(error);
        let persisted: boolean;
        try { persisted = await persistOrderDetailWithLease({ lease, source, order, errorCode: classified.code, permanent: classified.permanent }); } catch { throw new EnrichmentStructuralError('local_transient'); }
        if (!persisted) throw new EnrichmentStructuralError('order_detail_attempt_lease_lost');
        if (classified.permanent) {
          // The selected queue row is protected by the lease, so this is the terminal write exactly.
          if (order.enrichmentAttempts === MAX_PERMANENT_ATTEMPTS - 1) quarentenados++;
        }
        log.warn('enriquecimento: pedido falhou', { providerOrderId: order.providerOrderId, erro: error instanceof Error ? error.message : String(error) });
      }
    })));
    const restantes = await pendingCount(source);
    if (!await completeSyncLease(lease)) {
      await release(lease, 'order_details_complete_failed');
      return { enriquecidos, falhas, quarentenados, restantes, incompleto: true };
    }
    activeLease = null;
    return { enriquecidos, falhas, quarentenados, restantes, incompleto: restantes > 0 || Date.now() >= deadlineAt };
  } catch (error) {
    if (activeLease) await release(activeLease, error instanceof Error ? error.message.slice(0, 64) : 'order_details_aborted');
    log.warn('enriquecimento abortado', { erro: error instanceof Error ? error.message : String(error) });
    return { enriquecidos, falhas, quarentenados, restantes: -1, incompleto: true };
  }
}
