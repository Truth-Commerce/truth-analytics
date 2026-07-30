import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { parsePreparationCursor, type SyncSource } from '@/modules/connections/sync-state.repository';

export type OrderReadiness = { ready: boolean; reasons: string[]; expectedCount: number; actualCount: number; pendingDetails: number; quarantined: number };

type SourceRow = { cursor: unknown; current: boolean };
type FactsRow = { actual_count: number | string; pending_details: number | string; quarantined: number | string; checksum: string | null };

/**
 * Read-only reconciliation for a frozen source. It never activates a connection:
 * readiness is published only when the current credential binding, preparation
 * cursor and source-scoped order facts all agree.
 */
export async function reconcileOrderReadiness(source: SyncSource): Promise<OrderReadiness> {
  if (source.provider === 'olist' && (source.accountFingerprint === null || !/^[a-f0-9]{64}$/i.test(source.accountFingerprint))) {
    return { ready: false, reasons: ['source_stale', 'preparation_incomplete'], expectedCount: 0, actualCount: 0, pendingDetails: 0, quarantined: 0 };
  }
  const sourceResult = await db.execute(sql`
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
  const cursor = row ? parsePreparationCursor(row.cursor, source.sourceGeneration, source.accountFingerprint) : null;
  const factsResult = cursor ? await db.execute(sql`
    SELECT count(DISTINCT NULLIF(provider_order_id, ''))::int AS actual_count,
      count(*) FILTER (WHERE enriquecido_em IS NULL AND enrichment_attempts < 5)::int AS pending_details,
      count(*) FILTER (WHERE enrichment_attempts >= 5)::int AS quarantined,
      md5(coalesce(string_agg(concat_ws('|', NULLIF(provider_order_id, ''), coalesce(provider_status, ''), valor_total::text), ',' ORDER BY NULLIF(provider_order_id, ''), coalesce(provider_status, ''), valor_total::text), '')) AS checksum
    FROM orders WHERE org_id=${source.orgId} AND provider=${source.provider} AND source_generation=${source.sourceGeneration}
      AND data >= ${cursor.window.from}::timestamptz AND data < ${cursor.window.to}::timestamptz
  `) as unknown as FactsRow[] : [];
  const facts = factsResult[0];
  const actualCount = Number(facts?.actual_count ?? 0);
  const pendingDetails = Number(facts?.pending_details ?? 0);
  const quarantined = Number(facts?.quarantined ?? 0);
  const reasons: string[] = [];
  if (!row?.current) reasons.push('source_stale');
  if (!cursor) reasons.push('preparation_incomplete');
  if (cursor && cursor.expectedCount !== actualCount) reasons.push('count_mismatch');
  if (cursor && cursor.checksum !== facts?.checksum) reasons.push('checksum_mismatch');
  if (pendingDetails > 0) reasons.push('details_pending');
  if (quarantined > 0) reasons.push('details_quarantined');
  return { ready: reasons.length === 0, reasons, expectedCount: cursor?.expectedCount ?? 0, actualCount, pendingDetails, quarantined };
}
