'use server';

import { revalidatePath } from 'next/cache';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { getConnection } from '@/modules/connections/connection.repository';
import { podeGerar } from '@/modules/pipeline/plan-lock';
import { generateReport } from '@/modules/pipeline/orchestrator';

export type GenerateState = { error?: string; reportId?: string };

/**
 * Server Action que dispara a geração de um relatório para a org autenticada.
 *
 * Verificações (na ordem):
 * 1. Sessão ativa + org active (requireActiveOrg redireciona se não).
 * 2. podeGerar: status, plano, trava de ciclo.
 * 3. Bling conectado (getConnection.connected).
 * 4. generateReport (orquestrador síncrono).
 *
 * MVP: aguarda o orquestrador de forma síncrona.
 * Produção: mover para background job / Vercel Workflow para durabilidade — fora do escopo.
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

  const conn = await getConnection(access.orgId);
  if (!conn?.connected) return { error: 'bling_nao_conectado' };

  const result = await generateReport(access.orgId);
  // Em ambos os casos um `report` foi persistido (done ou failed) — revalida para
  // que ele apareça no histórico/último sem precisar recarregar a página.
  revalidatePath('/dashboard');
  if (result.status === 'failed') {
    return { error: 'falha_geracao', reportId: result.reportId };
  }

  return { reportId: result.reportId };
}
