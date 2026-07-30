import { and, eq, isNull, ne, or, type SQL } from 'drizzle-orm';

import { orders } from '@/db/schema';
import type { ErpProviderId } from '@/modules/providers/types';
export const MAX_ACTIVE_ERP_BATCH = 200;

export type ActiveErpRef = {
  orgId: string;
  provider: ErpProviderId;
  sourceGeneration: number;
  accountFingerprint: string | null;
  lastSyncAt: Date | null;
};

export function orderScope(ref: Pick<ActiveErpRef, 'orgId' | 'provider' | 'sourceGeneration'>): SQL {
  return and(
    eq(orders.org_id, ref.orgId),
    eq(orders.provider, ref.provider),
    eq(orders.source_generation, ref.sourceGeneration),
    ref.provider === 'olist' ? or(isNull(orders.provider_status), ne(orders.provider_status, '2')) : undefined,
  )!;
}

export function orderScopes(refs: readonly ActiveErpRef[]): SQL | undefined {
  if (refs.length > MAX_ACTIVE_ERP_BATCH) throw new Error('active_erp_batch_limit_exceeded');
  if (refs.length === 0) return undefined;
  return or(...refs.map(orderScope));
}
