'use server';

import { revalidatePath } from 'next/cache';

import { getOrganizationById } from '@/modules/admin/admin.repository';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import type { UserAccess } from '@/modules/auth/user.types';
import {
  addTrackedProduct,
  removeTrackedProduct,
} from '@/modules/tracked-products/tracked-product.repository';

export type StaffProdutosState = { error?: string; ok?: boolean };

/**
 * Gate de staff: admin_truth sempre passa; analista só nas orgs da carteira.
 * Retorna null (com erro pt-BR pronto na action) quando o acesso é negado.
 */
async function autorizarStaff(orgId: string): Promise<UserAccess | null> {
  const access = await requireAnalista();
  try {
    await assertOrgAccess(access, orgId);
  } catch (e) {
    if (e instanceof Error && e.message === 'acesso_negado') return null;
    throw e;
  }
  return access;
}

function revalidarPaginas(orgId: string) {
  revalidatePath(`/admin/${orgId}`);
  revalidatePath(`/analista/${orgId}`);
  revalidatePath('/conexoes');
}

export async function staffAddTrackedProductAction(
  _prev: StaffProdutosState,
  formData: FormData,
): Promise<StaffProdutosState> {
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const access = await autorizarStaff(orgId);
  if (!access) return { error: 'Acesso negado.' };

  const nome = String(formData.get('nome') ?? '').trim();
  const sku = String(formData.get('sku') ?? '').trim() || null;
  const keywords = String(formData.get('keywords') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (nome.length < 2) return { error: 'Informe o nome do produto.' };

  const org = await getOrganizationById(orgId);
  if (!org) return { error: 'Cliente inválido.' };

  try {
    // Limite pelo plano REAL do cliente (não o da sessão do staff)
    await addTrackedProduct({ orgId, nome, sku, keywords, plano: org.plano ?? 'monthly' });
  } catch (e) {
    if (e instanceof Error && e.message === 'limite_tracked_products') {
      return { error: 'Limite de produtos do plano deste cliente atingido.' };
    }
    throw e;
  }
  await recordAudit({
    orgId,
    userId: access.id,
    acao: 'tracked_product.criado_staff',
    detalhes: { nome, sku },
  });
  revalidarPaginas(orgId);
  return { ok: true };
}

export async function staffRemoveTrackedProductAction(
  _prev: StaffProdutosState,
  formData: FormData,
): Promise<StaffProdutosState> {
  const orgId = String(formData.get('orgId') ?? '');
  const id = String(formData.get('id') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  if (!id) return { error: 'Produto inválido.' };
  const access = await autorizarStaff(orgId);
  if (!access) return { error: 'Acesso negado.' };

  await removeTrackedProduct({ orgId, id });
  await recordAudit({
    orgId,
    userId: access.id,
    acao: 'tracked_product.removido_staff',
    detalhes: { id },
  });
  revalidarPaginas(orgId);
  return { ok: true };
}
