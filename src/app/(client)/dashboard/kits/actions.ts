'use server';

import { revalidatePath } from 'next/cache';

import { requireActiveOrgParaMutacao } from '@/modules/auth/require-active-org';
import { kitParaTask } from '@/modules/kits/kit-to-task';
import { marcarKitStatus } from '@/modules/kits/kit.repository';

export async function virarTarefaAction(kitId: string): Promise<{ ok: boolean; erro?: string }> {
  const access = await requireActiveOrgParaMutacao();
  const r = await kitParaTask(access.orgId, kitId);
  if (r.ok) {
    revalidatePath('/dashboard/kits');
    revalidatePath('/dashboard/plano-de-acao');
  }
  return r;
}

export async function descartarKitAction(kitId: string): Promise<{ ok: boolean }> {
  const access = await requireActiveOrgParaMutacao();
  const ok = await marcarKitStatus(access.orgId, kitId, 'descartado');
  if (ok) revalidatePath('/dashboard/kits');
  return { ok };
}
