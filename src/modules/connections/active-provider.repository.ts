import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';
import { getErpDataProvider } from '@/modules/providers/registry';
import type { ActiveErpRef } from '@/modules/orders/order-scope';
import type { ErpProviderId } from '@/modules/providers/types';

function registered(provider: string): provider is ErpProviderId {
  try { getErpDataProvider(provider as ErpProviderId); return true; } catch { return false; }
}

function toRef(row: { orgId: string; provider: string; sourceGeneration: number; accountFingerprint: string | null; lastSyncAt: Date | null }): ActiveErpRef | null {
  if (!registered(row.provider)) return null;
  return { ...row, provider: row.provider };
}

export async function getActiveErpConnection(orgId: string): Promise<ActiveErpRef | null> {
  const [row] = await db.select({ orgId: connections.org_id, provider: connections.provider, sourceGeneration: connections.data_generation, accountFingerprint: connections.provider_account_fingerprint, lastSyncAt: connections.last_sync_at })
    .from(connections).innerJoin(organizations, eq(organizations.id, connections.org_id))
    .where(and(eq(connections.org_id, orgId), eq(organizations.status, 'active'), eq(connections.status, 'ok'), isNotNull(connections.access_token))).limit(1);
  return row ? toRef(row) : null;
}

export async function listActiveErpConnections(options: { limit?: number } = {}): Promise<ActiveErpRef[]> {
  const rows = await db.select({ orgId: connections.org_id, provider: connections.provider, sourceGeneration: connections.data_generation, accountFingerprint: connections.provider_account_fingerprint, lastSyncAt: connections.last_sync_at })
    .from(connections).innerJoin(organizations, eq(organizations.id, connections.org_id))
    .where(and(eq(organizations.status, 'active'), eq(connections.status, 'ok'), isNotNull(connections.access_token)))
    .limit(options.limit ?? 500);
  return rows.map(toRef).filter((row): row is ActiveErpRef => row !== null);
}
