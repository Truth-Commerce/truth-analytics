'use server';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { getConnection } from '@/modules/connections/connection.repository';
import { podeGerar } from '@/modules/pipeline/plan-lock';
import { generateReport } from '@/modules/pipeline/orchestrator';

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
export async function generateReportAction(): Promise<{ error?: string; reportId?: string }> {
  const access = await requireActiveOrg();

  const org = await getOrganizationById(access.orgId);
  if (!org) return { error: 'org_nao_encontrada' };

  const gerar = podeGerar(org);
  if (!gerar.ok) return { error: gerar.motivo };

  const conn = await getConnection(access.orgId);
  if (!conn?.connected) return { error: 'bling_nao_conectado' };

  const result = await generateReport(access.orgId);
  if (result.status === 'failed') {
    return { error: 'falha_geracao', reportId: result.reportId };
  }

  return { reportId: result.reportId };
}
