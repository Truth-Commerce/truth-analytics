import { and, eq, inArray, isNotNull, ne, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';
import { serverEnv } from '@/lib/env';
import { MAX_ACTIVE_ERP_BATCH, type ActiveErpRef } from '@/modules/orders/order-scope';
import { isErpProviderId } from '@/modules/providers/provider-catalog';

function toRef(row: { orgId: string; provider: string; sourceGeneration: number; accountFingerprint: string | null; lastSyncAt: Date | null }): ActiveErpRef | null {
  if (!isErpProviderId(row.provider)) return null;
  return { ...row, provider: row.provider };
}

function uniqueRefs(rows: readonly ActiveErpRef[]): ActiveErpRef[] {
  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(row.orgId) && (seen.add(row.orgId), true));
}

/** SQL fence for the bounded operational orders batch; readers never use it. */
function operationalOrdersProviderPolicy() {
  const allowedOlistOrgIds = serverEnv.OLIST_DATA_SYNC_ENABLED
    ? serverEnv.OLIST_DATA_SYNC_ORG_IDS
    : [];
  return allowedOlistOrgIds.length
    ? or(
        ne(connections.provider, 'olist'),
        and(eq(connections.provider, 'olist'), inArray(connections.org_id, allowedOlistOrgIds)),
      )
    : ne(connections.provider, 'olist');
}

export { MAX_ACTIVE_ERP_BATCH };

export async function getActiveErpConnection(orgId: string): Promise<ActiveErpRef | null> {
  const [row] = await db.select({ orgId: connections.org_id, provider: connections.provider, sourceGeneration: connections.data_generation, accountFingerprint: connections.provider_account_fingerprint, lastSyncAt: connections.last_sync_at })
    .from(connections).innerJoin(organizations, eq(organizations.id, connections.org_id))
    .where(and(eq(connections.org_id, orgId), eq(organizations.status, 'active'), eq(connections.status, 'ok'), isNotNull(connections.access_token))).limit(1);
  return row ? toRef(row) : null;
}

export async function listActiveErpConnections(options: { limit?: number } = {}): Promise<ActiveErpRef[]> {
  const limit = options.limit ?? MAX_ACTIVE_ERP_BATCH;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ACTIVE_ERP_BATCH) throw new Error('active_erp_batch_limit_exceeded');
  const rows = await db.select({ orgId: connections.org_id, provider: connections.provider, sourceGeneration: connections.data_generation, accountFingerprint: connections.provider_account_fingerprint, lastSyncAt: connections.last_sync_at })
    .from(connections).innerJoin(organizations, eq(organizations.id, connections.org_id))
    .where(and(
      eq(organizations.status, 'active'),
      eq(connections.status, 'ok'),
      isNotNull(connections.access_token),
      operationalOrdersProviderPolicy(),
    ))
    .limit(limit);
  return uniqueRefs(rows.map(toRef).filter((row): row is ActiveErpRef => row !== null));
}

export async function getActiveErpConnectionsForOrgIds(orgIds: readonly string[]): Promise<ActiveErpRef[]> {
  const uniqueOrgIds = [...new Set(orgIds)];
  if (uniqueOrgIds.length > MAX_ACTIVE_ERP_BATCH) throw new Error('active_erp_batch_limit_exceeded');
  if (uniqueOrgIds.length === 0) return [];
  const rows = await db.select({ orgId: connections.org_id, provider: connections.provider, sourceGeneration: connections.data_generation, accountFingerprint: connections.provider_account_fingerprint, lastSyncAt: connections.last_sync_at })
    .from(connections).innerJoin(organizations, eq(organizations.id, connections.org_id))
    .where(and(inArray(connections.org_id, uniqueOrgIds), eq(organizations.status, 'active'), eq(connections.status, 'ok'), isNotNull(connections.access_token)))
    .limit(MAX_ACTIVE_ERP_BATCH);
  return uniqueRefs(rows.map(toRef).filter((row): row is ActiveErpRef => row !== null));
}
