import { touchLastSyncAt } from '@/modules/connections/connection.repository';
import { collectOrders, type CollectResult } from '@/modules/pipeline/steps/collect-orders';
import type { Periodo } from '@/modules/providers/data.types';

export type { CollectResult } from '@/modules/pipeline/steps/collect-orders';

/**
 * Step 1: coleta pedidos do Bling página a página (lotes de 100) — nunca
 * acumula o período inteiro em RAM. Erro do Bling propaga (falha dura).
 */
export async function collectBlingOrders(
  orgId: string,
  periodo: Periodo,
): Promise<CollectResult> {
  const result = await collectOrders({ orgId, provider: 'bling', sourceGeneration: 1 }, periodo);

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
