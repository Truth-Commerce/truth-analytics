import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections } from '@/db/schema';
import { touchLastSyncAt } from '@/modules/connections/connection.repository';
import { collectOrders, type CollectResult } from '@/modules/pipeline/steps/collect-orders';
import type { Periodo } from '@/modules/providers/data.types';

export type { CollectResult } from '@/modules/pipeline/steps/collect-orders';

async function resolveBlingGeneration(orgId: string): Promise<number> {
  const [connection] = await db
    .select({ generation: connections.data_generation })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')))
    .limit(1);
  const generation = connection?.generation ?? 1;
  // Bling retains the legacy (org_id, bling_order_id) unique constraint by design;
  // unlike Olist, it does not support shadow generations.
  if (generation !== 1) throw new Error('bling_source_generation_invalid');
  return generation;
}

/**
 * Step 1: coleta pedidos do Bling página a página (lotes de 100) — nunca
 * acumula o período inteiro em RAM. Erro do Bling propaga (falha dura).
 */
export async function collectBlingOrders(
  orgId: string,
  periodo: Periodo,
): Promise<CollectResult> {
  const sourceGeneration = await resolveBlingGeneration(orgId);
  const result = await collectOrders({ orgId, provider: 'bling', sourceGeneration }, periodo);

  // Frescor: registra a última sincronização bem-sucedida (best-effort — um
  // update de metadado nunca derruba uma coleta que já persistiu os pedidos).
  if (!result.incompleto) {
    try {
      await touchLastSyncAt(orgId);
    } catch {
      // nunca quebra a coleta
    }
  }

  return result;
}
