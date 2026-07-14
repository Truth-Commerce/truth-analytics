'use server';

import { revalidatePath } from 'next/cache';

import { serverEnv } from '@/lib/env';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { getConnection } from '@/modules/connections/connection.repository';
import { podeGerar } from '@/modules/pipeline/plan-lock';
import { enqueueReport } from '@/modules/pipeline/enqueue';

export type GenerateState = { error?: string; reportId?: string };

/**
 * Enfileira a geração de um relatório para a org autenticada.
 *
 * 1. Gating (fica na action): sessão + org active, podeGerar, Bling conectado,
 *    PIPELINE_SECRET presente.
 * 2. `enqueueReport` (helper canônico, compartilhado com o cron de geração
 *    automática): createQueuedReport insere 'queued' — o índice parcial
 *    reports_org_ativo_uq rejeita duplo clique/segunda aba com
 *    'relatorio_em_andamento' — e dispatchPipelineRun faz o POST
 *    /api/pipeline/run, aguardando SÓ o 202. Falha no dispatch → report vira
 *    'failed' (não fica preso na fila).
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

  const result = await enqueueReport(access.orgId);
  if (!result.ok) {
    if (result.motivo === 'falha_disparo_pipeline') {
      return { error: 'falha_geracao', reportId: result.reportId };
    }
    return { error: result.motivo };
  }

  revalidatePath('/dashboard');
  return { reportId: result.reportId };
}
