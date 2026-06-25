'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/modules/auth/require-admin';
import {
  activateOrganization,
  isValidPlano,
  reactivateOrganization,
  setPlano,
  suspendOrganization,
} from '@/modules/admin/admin.repository';
import { sendAccountActivatedEmail } from '@/modules/notifications/email';
import { getOrgPrimaryEmail } from '@/modules/notifications/recipients';

export type AdminActionState = { error?: string; ok?: boolean };

export async function activateClientAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  const plano = formData.get('plano');
  if (!orgId) return { error: 'Cliente inválido.' };
  if (!isValidPlano(plano)) return { error: 'Selecione um plano válido.' };

  try {
    await activateOrganization({ orgId, plano, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'org_nao_modificavel') {
      return { error: 'Operação não permitida para esta organização.' };
    }
    throw e;
  }

  // Notificar cliente — best-effort: e-mail nunca quebra a ativação
  try {
    const to = await getOrgPrimaryEmail(orgId);
    if (to) await sendAccountActivatedEmail(to, plano);
  } catch (e) {
    // e-mail nunca quebra a ativação — apenas registra para observabilidade
    console.warn(
      '[email:activate] lookup/envio falhou: ' + (e instanceof Error ? e.message : String(e)),
    );
  }

  revalidatePath('/admin');
  return { ok: true };
}

export async function suspendClientAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  try {
    await suspendOrganization({ orgId, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'org_nao_modificavel') {
      return { error: 'Operação não permitida para esta organização.' };
    }
    throw e;
  }
  revalidatePath('/admin');
  return { ok: true };
}

export async function reactivateClientAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  try {
    await reactivateOrganization({ orgId, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'org_nao_modificavel') {
      return { error: 'Operação não permitida para esta organização.' };
    }
    throw e;
  }
  revalidatePath('/admin');
  return { ok: true };
}

export async function setPlanoAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  const plano = formData.get('plano');
  if (!orgId) return { error: 'Cliente inválido.' };
  if (!isValidPlano(plano)) return { error: 'Selecione um plano válido.' };
  try {
    await setPlano({ orgId, plano, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'org_nao_modificavel') {
      return { error: 'Operação não permitida para esta organização.' };
    }
    throw e;
  }
  revalidatePath('/admin');
  return { ok: true };
}
