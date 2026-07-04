'use server';

import { revalidatePath } from 'next/cache';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { getConnection } from '@/modules/connections/connection.repository';
import { diasDoPlano, podeGerar } from '@/modules/pipeline/plan-lock';
import { dispatchPipelineRun } from '@/modules/pipeline/dispatch';
import { createQueuedReport, markReportFailed } from '@/modules/reports/report.repository';

export type GenerateState = { error?: string; reportId?: string };

/**
 * Enfileira a geração de um relatório para a org autenticada.
 *
 * 1. Gating: sessão + org active, podeGerar, Bling conectado, PIPELINE_SECRET presente.
 * 2. createQueuedReport: insere 'queued' — o índice parcial reports_org_ativo_uq
 *    rejeita duplo clique/segunda aba com 'relatorio_em_andamento'.
 * 3. dispatchPipelineRun: POST /api/pipeline/run e aguarda SÓ o 202.
 *    Falha no dispatch → report vira 'failed' (não fica preso na fila).
 *
 * O processamento acontece em background; o client acompanha via
 * GET /api/reports/[id]/status (polling 3s — stepper da F1).
 */
export async function generateReportAction(
  _prev: GenerateState,
  _formData: FormData,
): Promise<GenerateState> {
  const access = await requireActiveOrg();

  const org = await getOrganizationById(access.orgId);
  if (!org) return { error: 'org_nao_encontrada' };

  const gerar = podeGerar(org);
  if (!gerar.ok) return { error: gerar.motivo };
  if (!org.plano) return { error: 'sem_plano' };

  const conn = await getConnection(access.orgId);
  if (!conn?.connected) return { error: 'bling_nao_conectado' };

  if (!serverEnv.PIPELINE_SECRET) return { error: 'pipeline_nao_configurado' };

  const agora = new Date();
  const inicio = new Date(agora.getTime() - diasDoPlano(org.plano) * 24 * 60 * 60 * 1000);

  let reportId: string;
  try {
    reportId = await createQueuedReport(access.orgId, { inicio, fim: agora });
  } catch (err) {
    if (err instanceof Error && err.message === 'relatorio_em_andamento') {
      return { error: 'relatorio_em_andamento' };
    }
    throw err;
  }

  try {
    await dispatchPipelineRun(reportId);
  } catch (err) {
    await markReportFailed(reportId, 'dispatch_falhou');
    logger.error('dispatch do pipeline falhou', { orgId: access.orgId, reportId }, err);
    return { error: 'falha_geracao', reportId };
  }

  revalidatePath('/dashboard');
  return { reportId };
}
