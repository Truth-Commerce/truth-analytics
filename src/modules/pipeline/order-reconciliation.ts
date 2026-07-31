import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { parsePreparationCursor, type SyncSource } from '@/modules/connections/sync-state.repository';

export type OrderReadiness = { ready: boolean; reasons: string[]; expectedCount: number; actualCount: number; pendingDetails: number; quarantined: number };

type SourceRow = { cursor: unknown; current: boolean };
type FactsRow = { actual_count: number | string; pending_details: number | string; quarantined: number | string; checksum: string | null; daily_checksum: string | null; channel_checksum: string | null };

function unstableVerification(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cursor = value as Record<string, unknown>; const first = cursor.verify1; const second = cursor.verify2;
  if (!first || !second || typeof first !== 'object' || typeof second !== 'object' || Array.isArray(first) || Array.isArray(second)) return false;
  const a = first as Record<string, unknown>; const b = second as Record<string, unknown>;
  return a.expectedCount !== b.expectedCount || a.checksum !== b.checksum || a.dailyChecksum !== b.dailyChecksum || a.channelChecksum !== b.channelChecksum;
}

/**
 * Read-only reconciliation for a frozen source. It never activates a connection:
 * readiness is published only when the current credential binding, preparation
 * cursor and source-scoped order facts all agree.
 */
export type OrderReadinessExecutor = Pick<typeof db, 'execute'>;
export async function reconcileOrderReadiness(source: SyncSource, executor: OrderReadinessExecutor = db): Promise<OrderReadiness> {
  const accountFingerprint = source.accountFingerprint;
  if (source.provider === 'olist' && (accountFingerprint === null || !/^[a-f0-9]{64}$/i.test(accountFingerprint))) {
    return { ready: false, reasons: ['source_stale', 'preparation_incomplete'], expectedCount: 0, actualCount: 0, pendingDetails: 0, quarantined: 0 };
  }
  const sourceResult = await executor.execute(sql`
    SELECT css.cursor,
      EXISTS(SELECT 1 FROM connections c JOIN organizations o ON o.id=c.org_id
        WHERE c.org_id=${source.orgId} AND c.provider=${source.provider} AND c.data_generation=${source.sourceGeneration}
          AND c.provider_account_fingerprint IS NOT DISTINCT FROM ${source.accountFingerprint}
          AND c.status IN ('configurado', 'ok') AND c.access_token IS NOT NULL AND c.refresh_token IS NOT NULL AND o.status='active') AS current
    FROM connection_sync_state css
    WHERE css.org_id=${source.orgId} AND css.provider=${source.provider} AND css.source_generation=${source.sourceGeneration}
      AND css.account_fingerprint IS NOT DISTINCT FROM ${source.accountFingerprint} AND css.resource='orders_prepare'
  `) as unknown as SourceRow[];
  const row = sourceResult[0];
  const cursor = row && accountFingerprint !== null ? parsePreparationCursor(row.cursor, source.sourceGeneration, accountFingerprint) : null;
  const verificationUnstable = row ? unstableVerification(row.cursor) : false;
  const factsResult = cursor ? await executor.execute(sql`
    SELECT count(DISTINCT NULLIF(provider_order_id, ''))::int AS actual_count,
      count(*) FILTER (WHERE enriquecido_em IS NULL AND enrichment_attempts < 5)::int AS pending_details,
      count(*) FILTER (WHERE enrichment_attempts >= 5)::int AS quarantined,
      md5(coalesce(string_agg(concat_ws('|', NULLIF(provider_order_id, ''), coalesce(provider_status, ''), valor_total::text), ',' ORDER BY NULLIF(provider_order_id, ''), coalesce(provider_status, ''), valor_total::text), '')) AS checksum,
      md5(coalesce((SELECT string_agg(day_key || '|' || total, ',' ORDER BY day_key) FROM (SELECT data::date::text AS day_key, sum(valor_total)::text AS total FROM orders WHERE org_id=${source.orgId} AND provider=${source.provider} AND source_generation=${source.sourceGeneration} AND data >= ${cursor.window.from}::timestamptz AND data < ${cursor.window.to}::timestamptz GROUP BY data::date) daily), '')) AS daily_checksum,
      md5(coalesce((SELECT string_agg(channel_key || '|' || total, ',' ORDER BY channel_key) FROM (SELECT canal AS channel_key, sum(valor_total)::text AS total FROM orders WHERE org_id=${source.orgId} AND provider=${source.provider} AND source_generation=${source.sourceGeneration} AND data >= ${cursor.window.from}::timestamptz AND data < ${cursor.window.to}::timestamptz GROUP BY canal) channels), '')) AS channel_checksum
    FROM orders WHERE org_id=${source.orgId} AND provider=${source.provider} AND source_generation=${source.sourceGeneration}
      AND data >= ${cursor.window.from}::timestamptz AND data < ${cursor.window.to}::timestamptz
  `) as unknown as FactsRow[] : [];
  const facts = factsResult[0];
  const verification = cursor?.verify2;
  const actualCount = Number(facts?.actual_count ?? 0);
  const pendingDetails = Number(facts?.pending_details ?? 0);
  const quarantined = Number(facts?.quarantined ?? 0);
  const reasons: string[] = [];
  if (!row?.current) reasons.push('source_stale');
  if (!cursor) reasons.push(verificationUnstable ? 'verification_unstable' : 'preparation_incomplete');
  if (verification && verification.expectedCount !== actualCount) reasons.push('count_mismatch');
  if (verification && verification.checksum !== facts?.checksum) reasons.push('checksum_mismatch');
  if (verification && verification.dailyChecksum !== facts?.daily_checksum) reasons.push('daily_total_mismatch');
  if (verification && verification.channelChecksum !== facts?.channel_checksum) reasons.push('channel_mismatch');
  if (pendingDetails > 0) reasons.push('details_pending');
  if (quarantined > 0) reasons.push('details_quarantined');
  return { ready: reasons.length === 0, reasons, expectedCount: verification?.expectedCount ?? 0, actualCount, pendingDetails, quarantined };
}
