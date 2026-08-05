'use server';

import { revalidatePath } from 'next/cache';

import { getOrganizationById } from '@/modules/admin/admin.repository';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import type { UserAccess } from '@/modules/auth/user.types';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import { inicioJanela } from '@/modules/desempenho/desempenho-anual';
import { enqueueReport } from '@/modules/pipeline/enqueue';
import { collectOrders } from '@/modules/pipeline/steps/collect-orders';
import { enrichOrders } from '@/modules/pipeline/steps/enrich-orders';
import {
  manualReportPeriod,
  parseReportPeriodDays,
} from '@/modules/reports/manual-report-period';
import {
  addTrackedProduct,
  removeTrackedProduct,
} from '@/modules/tracked-products/tracked-product.repository';

export type StaffProdutosState = { error?: string; ok?: boolean };
export type StaffReportState = { error?: string; ok?: boolean; reportId?: string };

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

export async function staffGenerateReportAction(
  _prev: StaffReportState,
  formData: FormData,
): Promise<StaffReportState> {
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const access = await autorizarStaff(orgId);
  if (!access) return { error: 'Acesso negado.' };

  const periodDays = parseReportPeriodDays(formData.get('periodDays'));
  if (!periodDays) return { error: 'Selecione um período válido.' };
  const period = manualReportPeriod(periodDays);

  const source = await getActiveErpConnection(orgId);
  if (!source) return { error: 'Nenhum ERP ativo para este cliente.' };

  const result = await enqueueReport(orgId, period);
  if (!result.ok) {
    if (result.motivo === 'relatorio_em_andamento') {
      return { error: 'Já existe um relatório em andamento para este cliente.' };
    }
    if (result.motivo === 'sem_plano') return { error: 'Organização sem plano definido.' };
    return { error: 'Não foi possível iniciar o relatório.', ...(result.reportId ? { reportId: result.reportId } : {}) };
  }

  await recordAudit({
    orgId,
    userId: access.id,
    acao: 'report.disparado_staff',
    detalhes: {
      reportId: result.reportId,
      provider: source.provider,
      periodDays,
      periodStart: period.inicio.toISOString(),
      periodEnd: period.fim.toISOString(),
    },
  });
  revalidatePath(`/analista/${orgId}`);
  return { ok: true, reportId: result.reportId };
}

export type StaffBackfillState = { error?: string; ok?: boolean; processados?: number; pendentesEnriquecimento?: number };

const BACKFILL_MESES = 12;
const BACKFILL_COLETA_DEADLINE_MS = 120_000;
const BACKFILL_ENRIQUECIMENTO = { maxPedidos: 200, prazoMs: 90_000 } as const;

/**
 * Backfill staff de 12 meses (SÓ Bling): coleta paginada idempotente + um lote
 * de enriquecimento inline. O restante da fila drena pelo cron sincronizar-pedidos.
 */
export async function staffBackfillHistoricoAction(
  _prev: StaffBackfillState,
  formData: FormData,
): Promise<StaffBackfillState> {
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const access = await autorizarStaff(orgId);
  if (!access) return { error: 'Acesso negado.' };

  const source = await getActiveErpConnection(orgId);
  if (!source) return { error: 'Nenhum ERP ativo para este cliente.' };
  if (source.provider !== 'bling') return { error: 'Backfill de historico disponivel apenas para Bling.' };

  const agora = new Date();
  const periodo = { inicio: inicioJanela(agora, BACKFILL_MESES), fim: agora };
  const coleta = await collectOrders(source, periodo, { deadlineMs: BACKFILL_COLETA_DEADLINE_MS });
  const enriquecimento = await enrichOrders(source, BACKFILL_ENRIQUECIMENTO);

  await recordAudit({
    orgId,
    userId: access.id,
    acao: 'desempenho.backfill_disparado',
    detalhes: {
      processados: coleta.processados,
      total: coleta.total,
      enriquecidos: enriquecimento.enriquecidos,
      pendentes: enriquecimento.restantes,
      periodoInicio: periodo.inicio.toISOString(),
    },
  });
  revalidatePath(`/analista/${orgId}/desempenho`);
  return { ok: true, processados: coleta.processados, pendentesEnriquecimento: Math.max(0, enriquecimento.restantes) };
}
