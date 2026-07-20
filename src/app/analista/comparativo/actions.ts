'use server';

import { revalidatePath } from 'next/cache';

import { replicarTask, type ReplicarTaskResult } from '@/modules/analista/comparativo-data.repository';
import { requireAnalista } from '@/modules/auth/require-analista';

/**
 * Wrapper 'use server' de `replicarTask` (comparativo-data.repository.ts) —
 * a lógica de escopo/criação já é testada diretamente ali (integração); esta
 * action só resolve a sessão e revalida as rotas afetadas.
 */
export async function replicarTaskAction(
  taskOrigemId: string,
  orgDestinoId: string,
): Promise<ReplicarTaskResult> {
  const access = await requireAnalista();
  const r = await replicarTask(access, taskOrigemId, orgDestinoId);
  if (r.ok) {
    revalidatePath('/analista/comparativo');
    revalidatePath(`/analista/${orgDestinoId}`);
  }
  return r;
}
