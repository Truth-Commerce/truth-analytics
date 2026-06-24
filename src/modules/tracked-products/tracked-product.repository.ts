import { and, count, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { trackedProducts } from '@/db/schema';
import type { Plano } from '@/modules/auth/user.types';

export const TRACKED_LIMITS: Record<Plano, number> = {
  weekly: 10,
  biweekly: 20,
  monthly: 30,
};

export async function listTrackedProducts(orgId: string) {
  return db
    .select()
    .from(trackedProducts)
    .where(eq(trackedProducts.org_id, orgId))
    .orderBy(trackedProducts.created_at);
}

export async function addTrackedProduct(input: {
  orgId: string;
  nome: string;
  sku: string | null;
  keywords: string[];
  plano: Plano;
}): Promise<void> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(trackedProducts)
    .where(eq(trackedProducts.org_id, input.orgId));
  if (n >= TRACKED_LIMITS[input.plano]) {
    throw new Error('limite_tracked_products');
  }
  await db.insert(trackedProducts).values({
    org_id: input.orgId,
    nome: input.nome,
    sku: input.sku,
    keywords: input.keywords,
  });
}

export async function toggleTrackedProduct(input: {
  orgId: string;
  id: string;
  ativo: boolean;
}): Promise<void> {
  await db
    .update(trackedProducts)
    .set({ ativo: input.ativo })
    .where(and(eq(trackedProducts.id, input.id), eq(trackedProducts.org_id, input.orgId)));
}

export async function removeTrackedProduct(input: {
  orgId: string;
  id: string;
}): Promise<void> {
  await db
    .delete(trackedProducts)
    .where(and(eq(trackedProducts.id, input.id), eq(trackedProducts.org_id, input.orgId)));
}
