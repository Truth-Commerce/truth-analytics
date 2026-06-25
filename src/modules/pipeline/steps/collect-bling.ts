import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { blingProvider } from '@/modules/providers/bling/provider';
import type { Periodo } from '@/modules/providers/types';

export type CollectResult = {
  processados: number;
  total: number;
};

export async function collectBlingOrders(
  orgId: string,
  periodo: Periodo,
): Promise<CollectResult> {
  const rawOrders = await blingProvider.fetchOrders(orgId, periodo);

  if (rawOrders.length === 0) {
    return { processados: 0, total: 0 };
  }

  const validOrders = rawOrders.filter((o) => o.blingOrderId.trim() !== '');

  if (validOrders.length === 0) {
    return { processados: 0, total: rawOrders.length };
  }

  const values = validOrders.map((o) => ({
    org_id: orgId,
    bling_order_id: o.blingOrderId,
    canal: o.canal,
    data: o.data,
    valor_total: String(o.valorTotal),
    frete: String(o.frete),
    itens: o.itens,
  }));

  const result = await db
    .insert(orders)
    .values(values)
    .onConflictDoUpdate({
      target: [orders.org_id, orders.bling_order_id],
      set: {
        canal: sql`EXCLUDED.canal`,
        data: sql`EXCLUDED.data`,
        valor_total: sql`EXCLUDED.valor_total`,
        frete: sql`EXCLUDED.frete`,
        itens: sql`EXCLUDED.itens`,
      },
    })
    .returning({ id: orders.id });

  return { processados: result.length, total: rawOrders.length };
}
