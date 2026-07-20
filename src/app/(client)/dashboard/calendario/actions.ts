'use server';

import { revalidatePath } from 'next/cache';

import { requireActiveOrgParaMutacao } from '@/modules/auth/require-active-org';
import { marcarSugestaoStatus } from '@/modules/calendario/calendario.repository';
import { sugestaoParaTask } from '@/modules/calendario/sugestao-to-task';

export async function virarTarefaSugestaoAction(
  sugestaoId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const access = await requireActiveOrgParaMutacao();
  const r = await sugestaoParaTask(access.orgId, sugestaoId);
  if (r.ok) {
    revalidatePath('/dashboard/calendario');
    revalidatePath('/dashboard/plano-de-acao');
  }
  return r;
}

export async function descartarSugestaoAction(sugestaoId: string): Promise<{ ok: boolean }> {
  const access = await requireActiveOrgParaMutacao();
  const ok = await marcarSugestaoStatus(access.orgId, sugestaoId, 'descartado');
  if (ok) revalidatePath('/dashboard/calendario');
  return { ok };
}
