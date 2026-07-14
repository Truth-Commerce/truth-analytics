import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { touchLastSyncAt } from '@/modules/connections/connection.repository';
import { blingProvider } from '@/modules/providers/bling/provider';
import type { Periodo, RawOrder } from '@/modules/providers/types';

export type CollectResult = {
  processados: number;
  total: number;
};

/** Upsert idempotente de UMA página de pedidos (org_id, bling_order_id). */
async function upsertOrdersPage(orgId: string, rawOrders: RawOrder[]): Promise<number> {
  const validOrders = rawOrders.filter((o) => o.blingOrderId.trim() !== '');
  if (validOrders.length === 0) return 0;

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
  return result.length;
}

/**
 * Step 1: coleta pedidos do Bling página a página (lotes de 100) — nunca
 * acumula o período inteiro em RAM. Erro do Bling propaga (falha dura).
 */
export async function collectBlingOrders(
  orgId: string,
  periodo: Periodo,
): Promise<CollectResult> {
  let processados = 0;
  let total = 0;

  await blingProvider.fetchOrders(orgId, periodo, async (pagina) => {
    total += pagina.length;
    processados += await upsertOrdersPage(orgId, pagina);
  });

  // Frescor: registra a última sincronização bem-sucedida (best-effort — um
  // update de metadado nunca derruba uma coleta que já persistiu os pedidos).
  try {
    await touchLastSyncAt(orgId);
  } catch {
    // nunca quebra a coleta
  }

  return { processados, total };
}
