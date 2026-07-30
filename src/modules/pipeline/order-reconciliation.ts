import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { parsePreparationCursor, type SyncSource } from '@/modules/connections/sync-state.repository';

export type OrderReadiness = { ready: boolean; reasons: string[]; expectedCount: number; actualCount: number; pendingDetails: number; quarantined: number };

type Row = { cursor: unknown; current: boolean; actual_count: number | string; pending_details: number | string; quarantined: number | string; checksum: string | null };

/**
 * Read-only reconciliation for a frozen source. It never activates a connection:
 * readiness is published only when the current credential binding, preparation
 * cursor and source-scoped order facts all agree.
 */
export async function reconcileOrderReadiness(source: SyncSource): Promise<OrderReadiness> {
  const result = await db.execute(sql`
    SELECT css.cursor,
      EXISTS(SELECT 1 FROM connections c JOIN organizations o ON o.id=c.org_id
        WHERE c.org_id=${source.orgId} AND c.provider=${source.provider} AND c.data_generation=${source.sourceGeneration}
          AND c.provider_account_fingerprint IS NOT DISTINCT FROM ${source.accountFingerprint}
          AND c.status='ok' AND c.access_token IS NOT NULL AND o.status='active') AS current,
      count(DISTINCT NULLIF(ord.provider_order_id, ''))::int AS actual_count,
      count(*) FILTER (WHERE ord.enriquecido_em IS NULL AND ord.enrichment_attempts < 5)::int AS pending_details,
      count(*) FILTER (WHERE ord.enrichment_attempts >= 5)::int AS quarantined,
      md5(coalesce(string_agg(DISTINCT NULLIF(ord.provider_order_id, ''), ',' ORDER BY NULLIF(ord.provider_order_id, '')), '')) AS checksum
    FROM connection_sync_state css
    LEFT JOIN orders ord ON ord.org_id=${source.orgId} AND ord.provider=${source.provider} AND ord.source_generation=${source.sourceGeneration}
    WHERE css.org_id=${source.orgId} AND css.provider=${source.provider} AND css.source_generation=${source.sourceGeneration}
      AND css.account_fingerprint IS NOT DISTINCT FROM ${source.accountFingerprint} AND css.resource='orders_prepare'
    GROUP BY css.cursor
  `) as unknown as Row[];
  const row = result[0];
  const cursor = row ? parsePreparationCursor(row.cursor, source.sourceGeneration) : null;
  const actualCount = Number(row?.actual_count ?? 0);
  const pendingDetails = Number(row?.pending_details ?? 0);
  const quarantined = Number(row?.quarantined ?? 0);
  const reasons: string[] = [];
  if (!row?.current) reasons.push('source_stale');
  if (!cursor) reasons.push('preparation_incomplete');
  if (cursor && cursor.expectedCount !== actualCount) reasons.push('count_mismatch');
  if (cursor && cursor.checksum !== row?.checksum) reasons.push('checksum_mismatch');
  if (pendingDetails > 0) reasons.push('details_pending');
  if (quarantined > 0) reasons.push('details_quarantined');
  return { ready: reasons.length === 0, reasons, expectedCount: cursor?.expectedCount ?? 0, actualCount, pendingDetails, quarantined };
}
