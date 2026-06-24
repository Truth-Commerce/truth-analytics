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

  await activateOrganization({ orgId, plano, actorUserId: admin.id });
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
  await suspendOrganization({ orgId, actorUserId: admin.id });
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
  await reactivateOrganization({ orgId, actorUserId: admin.id });
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
  await setPlano({ orgId, plano, actorUserId: admin.id });
  revalidatePath('/admin');
  return { ok: true };
}
