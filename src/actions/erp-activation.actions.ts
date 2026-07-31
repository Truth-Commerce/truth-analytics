'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { assertNaoImpersonando } from '@/modules/auth/require-active-org';
import { requireSession } from '@/modules/auth/require-session';
import type { UserAccess } from '@/modules/auth/user.types';
import { activateErp, rollbackErp } from '@/modules/connections/erp-activation.repository';

export type ErpActivationActionState = { ok?: boolean; error?: string };

const ContextSchema = z.object({ orgId: z.string().uuid() });

export async function activateOlistAction(
  _previous: ErpActivationActionState,
  formData: FormData,
): Promise<ErpActivationActionState> {
  const parsed = ContextSchema.safeParse({ orgId: String(formData.get('orgId') ?? '') });
  if (!parsed.success) return { error: 'Solicitação inválida.' };

  const access = await requireSession();
  try {
    await assertStaffMutation(access, parsed.data.orgId);
    await activateErp({
      orgId: parsed.data.orgId,
      target: 'olist',
      actorUserId: access.id,
      mode: 'explicit',
    });
    revalidateOrganizationSurfaces(parsed.data.orgId);
    return { ok: true };
  } catch (error) {
    return { error: safeActionMessage(error, 'activate') };
  }
}

export async function rollbackToBlingAction(
  _previous: ErpActivationActionState,
  formData: FormData,
): Promise<ErpActivationActionState> {
  const parsed = ContextSchema.safeParse({ orgId: String(formData.get('orgId') ?? '') });
  if (!parsed.success) return { error: 'Solicitação inválida.' };

  const access = await requireSession();
  try {
    await assertStaffMutation(access, parsed.data.orgId);
    await rollbackErp({
      orgId: parsed.data.orgId,
      target: 'bling',
      actorUserId: access.id,
    });
    revalidateOrganizationSurfaces(parsed.data.orgId);
    return { ok: true };
  } catch (error) {
    return { error: safeActionMessage(error, 'rollback') };
  }
}

async function assertStaffMutation(access: UserAccess, orgId: string): Promise<void> {
  if (access.role !== 'analista' && access.role !== 'admin_truth') {
    throw new Error('staff_only');
  }
  await assertNaoImpersonando();
  await assertOrgAccess(access, orgId);
}

function revalidateOrganizationSurfaces(orgId: string): void {
  revalidatePath(`/analista/${orgId}`);
  revalidatePath('/conexoes');
  revalidatePath('/dashboard');
}

function safeActionMessage(error: unknown, operation: 'activate' | 'rollback'): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'staff_only') return 'Você não tem permissão para trocar o ERP ativo.';
  if (code === 'acesso_negado') return 'Você não tem acesso a esta organização.';
  if (code.startsWith('Modo visualização')) return 'Ações indisponíveis no modo de visualização.';
  if (code === 'erp_ativo_alterado') {
    return 'O ERP ativo mudou. Atualize a página e tente novamente.';
  }
  return operation === 'activate'
    ? 'Não foi possível ativar o Olist.'
    : 'Não foi possível voltar para o Bling.';
}
