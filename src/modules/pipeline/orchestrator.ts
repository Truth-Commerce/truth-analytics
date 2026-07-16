import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { createLogger } from '@/lib/logger';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { sendPipelineFailedEmail } from '@/modules/notifications/email';
import { getAdminAlertEmail, getOrgPrimaryEmail } from '@/modules/notifications/recipients';
import { collectBlingOrders } from '@/modules/pipeline/steps/collect-bling';
import { collectMarket } from '@/modules/pipeline/steps/collect-market';
import { computeMetrics } from '@/modules/pipeline/steps/compute-metrics';
import { analyzeWithIA } from '@/modules/pipeline/steps/analyze-ia';
import { buildAnalysisContext } from '@/modules/pipeline/steps/analysis-context';
import { finalize } from '@/modules/pipeline/steps/finalize';
import type { ReportEtapa } from '@/modules/reports/report.types';

/** Limita o erro persistido a 2000 chars para legibilidade no painel. */
function truncateErro(msg: string, maxLen = 2000): string {
  return msg.length <= maxLen ? msg : msg.slice(0, maxLen) + '…';
}

/** Atualiza a etapa do report — também serve de heartbeat (updated_at) p/ o watchdog. */
async function setEtapa(reportId: string, etapa: ReportEtapa): Promise<void> {
  await db.update(reports).set({ etapa }).where(eq(reports.id, reportId));
}

export type GenerateOutcome = {
  reportId: string;
  status: 'done' | 'failed' | 'ignorado';
};

/**
 * Orquestrador do pipeline — agora por reportId (o report 'queued' já foi criado
 * pela action via createQueuedReport; o lock reports_org_ativo_uq garante 1 ativo/org).
 *
 * Fluxo:
 * 1. Carrega o report; se status !== 'queued' retorna 'ignorado' (idempotência de re-POST).
 * 2. Marca running + etapa 'coletando_vendas'.
 * 3. collectBlingOrders ∥ collectMarket (Bling falha dura; mercado graciosa).
 * 4. etapa 'analisando_mercado' → computeMetrics; etapa 'analisando_ia' → analyzeWithIA;
 *    etapa 'finalizando' → finalize (done + trava + e-mail; finalize zera etapa).
 * 5. Erro: report 'failed' + erro truncado (etapa preservada p/ diagnóstico), e-mail admin,
 *    trava NÃO setada. Nunca relança.
 */
export async function generateReport(reportId: string): Promise<GenerateOutcome> {
  // Transição queued→running atômica (compare-and-set): só assume o report se ele
  // AINDA estiver 'queued'. Fecha a corrida de dispatch concorrente / re-POST em um
  // único UPDATE — sem read-then-write. RETURNING nos dá org_id + período de uma vez.
  const [reportRow] = await db
    .update(reports)
    .set({ status: 'running', etapa: 'coletando_vendas' })
    .where(and(eq(reports.id, reportId), eq(reports.status, 'queued')))
    .returning({
      org_id: reports.org_id,
      periodo_inicio: reports.periodo_inicio,
      periodo_fim: reports.periodo_fim,
    });

  if (!reportRow) {
    // 0 linhas: report inexistente OU já não estava 'queued' (outro worker assumiu /
    // já terminou). Ambos os casos honram a idempotência de re-POST → 'ignorado'.
    return { reportId, status: 'ignorado' };
  }

  const orgId = reportRow.org_id;
  const periodo = { inicio: reportRow.periodo_inicio, fim: reportRow.periodo_fim };
  const log = createLogger({ orgId, reportId });

  try {
    const org = await getOrganizationById(orgId);
    if (!org) throw new Error('org_nao_encontrada');
    const { plano, nicho } = org;
    if (!plano) throw new Error('sem_plano');
    const orgName = org.name;

    // Coleta Bling ∥ mercado (allSettled: nenhuma promessa solta escreve depois do retorno).
    const [blingOutcome, marketOutcome] = await Promise.allSettled([
      collectBlingOrders(orgId, periodo),
      collectMarket(orgId, reportId),
    ]);

    if (blingOutcome.status === 'rejected') {
      throw blingOutcome.reason instanceof Error
        ? blingOutcome.reason
        : new Error(String(blingOutcome.reason));
    }
    const benchmarkParcial =
      marketOutcome.status === 'fulfilled' ? marketOutcome.value.benchmarkParcial : true;

    await setEtapa(reportId, 'analisando_mercado');
    const metricas = await computeMetrics(orgId, reportId, periodo, benchmarkParcial);

    await setEtapa(reportId, 'analisando_ia');
    const contexto = await buildAnalysisContext({ orgId, orgName, nicho, plano, periodo });
    const { analise, usage: iaUsage } = await analyzeWithIA(metricas, contexto);

    await setEtapa(reportId, 'finalizando');
    let clientEmail: string | null = null;
    try {
      clientEmail = await getOrgPrimaryEmail(orgId);
    } catch {
      // lookup falhou — e-mail pulado, pipeline continua
    }
    await finalize({ reportId, orgId, metricas, analise, plano, periodo, clientEmail, iaUsage });

    log.info('pipeline concluído');
    return { reportId, status: 'done' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const erroTruncado = truncateErro(message);

    // etapa NÃO é zerada aqui: mostra onde o pipeline morreu.
    await db
      .update(reports)
      .set({ status: 'failed', erro: erroTruncado })
      .where(eq(reports.id, reportId));

    log.error('pipeline falhou', { erro: erroTruncado }, err);

    const adminEmail = getAdminAlertEmail();
    if (adminEmail) {
      await sendPipelineFailedEmail(adminEmail, orgId, reportId, erroTruncado);
    }
    return { reportId, status: 'failed' };
  }
}
