'use server';

import { revalidatePath } from 'next/cache';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { disconnectBling } from '@/modules/connections/connection.repository';
import {
  addTrackedProduct,
  removeTrackedProduct,
  toggleTrackedProduct,
} from '@/modules/tracked-products/tracked-product.repository';
import type { Plano } from '@/modules/auth/user.types';

export type ConnState = { error?: string; ok?: boolean };

export async function disconnectBlingAction(): Promise<ConnState> {
  const access = await requireActiveOrg();
  await disconnectBling(access.orgId);
  revalidatePath('/conexoes');
  return { ok: true };
}

export async function addTrackedProductAction(
  _prev: ConnState,
  formData: FormData,
): Promise<ConnState> {
  const access = await requireActiveOrg();
  const nome = String(formData.get('nome') ?? '').trim();
  const sku = String(formData.get('sku') ?? '').trim() || null;
  const keywords = String(formData.get('keywords') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (nome.length < 2) return { error: 'Informe o nome do produto.' };

  try {
    await addTrackedProduct({
      orgId: access.orgId,
      nome,
      sku,
      keywords,
      plano: access.plano ?? 'monthly',
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'limite_tracked_products') {
      return { error: 'Limite de produtos do seu plano atingido.' };
    }
    throw e;
  }
  revalidatePath('/conexoes');
  return { ok: true };
}

export async function toggleTrackedProductAction(
  _prev: ConnState,
  formData: FormData,
): Promise<ConnState> {
  const access = await requireActiveOrg();
  const id = String(formData.get('id') ?? '');
  const ativo = String(formData.get('ativo') ?? '') === 'true';
  if (!id) return { error: 'Produto inválido.' };
  await toggleTrackedProduct({ orgId: access.orgId, id, ativo });
  revalidatePath('/conexoes');
  return { ok: true };
}

export async function removeTrackedProductAction(
  _prev: ConnState,
  formData: FormData,
): Promise<ConnState> {
  const access = await requireActiveOrg();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Produto inválido.' };
  await removeTrackedProduct({ orgId: access.orgId, id });
  revalidatePath('/conexoes');
  return { ok: true };
}
