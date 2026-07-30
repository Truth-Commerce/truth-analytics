import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { createLogger } from '@/lib/logger';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { sendPipelineFailedEmail } from '@/modules/notifications/email';
import { getAdminAlertEmail, getOrgPrimaryEmail } from '@/modules/notifications/recipients';
import { collectOrders } from '@/modules/pipeline/steps/collect-orders';
import { collectMarket } from '@/modules/pipeline/steps/collect-market';
import { computeMetrics } from '@/modules/pipeline/steps/compute-metrics';
import { enrichOrders } from '@/modules/pipeline/steps/enrich-orders';
import { analyzeWithIA } from '@/modules/pipeline/steps/analyze-ia';
import { buildAnalysisContext } from '@/modules/pipeline/steps/analysis-context';
import { finalize } from '@/modules/pipeline/steps/finalize';
import { executarExtrasPosFinalize } from '@/modules/pipeline/steps/pos-finalize-extras';
import { claimQueuedReport } from '@/modules/reports/report.repository';
import { touchLastSyncAtForSource } from '@/modules/connections/provider-connection.repository';
import type { ReportEtapa } from '@/modules/reports/report.types';

/**
 * Orçamento do enriquecimento DENTRO do pipeline. A 2,94 req/s, 350 pedidos ≈ 120s —
 * cabe no maxDuration=300 junto com coleta, métricas e IA. O resto da fila fica
 * para o cron diário, que tem a execução inteira só para isso.
 */
const ENRIQUECIMENTO_PIPELINE = { maxPedidos: 350, prazoMs: 120_000 } as const;

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
 * 1. Assume e congela a fonte queued; se já foi assumido retorna 'ignorado'.
 * 2. Marca running + etapa 'coletando_vendas'.
 * 3. collectOrders ∥ collectMarket (coleta falha dura; mercado graciosa).
 * 4. etapa 'analisando_mercado' → computeMetrics; etapa 'analisando_ia' → analyzeWithIA;
 *    etapa 'finalizando' → finalize (done + trava + e-mail; finalize zera etapa).
 * 5. Erro: report 'failed' + erro truncado (etapa preservada p/ diagnóstico), e-mail admin,
 *    trava NÃO setada. Nunca relança.
 */
export async function generateReport(reportId: string): Promise<GenerateOutcome> {
  let claim;
  try {
    // Único ponto de claim: fixa provider+generation junto da transição queued→running.
    claim = await claimQueuedReport(reportId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const [failedReport] = await db.select({ orgId: reports.org_id }).from(reports).where(eq(reports.id, reportId)).limit(1);
    if (failedReport) {
      createLogger({ orgId: failedReport.orgId, reportId }).error('pipeline falhou', { erro: truncateErro(message) }, err);
      const adminEmail = getAdminAlertEmail();
      if (adminEmail) await sendPipelineFailedEmail(adminEmail, failedReport.orgId, reportId, truncateErro(message));
    }
    return { reportId, status: 'failed' };
  }
  if (!claim) return { reportId, status: 'ignorado' };

  const orgId = claim.orgId;
  const periodo = claim.periodo;
  const source = { orgId, provider: claim.provider, sourceGeneration: claim.sourceGeneration } as const;
  const log = createLogger({ orgId, reportId });

  try {
    const org = await getOrganizationById(orgId);
    if (!org) throw new Error('org_nao_encontrada');
    const { plano, nicho } = org;
    if (!plano) throw new Error('sem_plano');
    const orgName = org.name;
    // Coleta da fonte congelada ∥ mercado (allSettled: nenhuma promessa solta escreve depois do retorno).
    const [ordersOutcome, marketOutcome] = await Promise.allSettled([
      collectOrders(source, periodo),
      collectMarket(orgId, reportId),
    ]);

    if (ordersOutcome.status === 'rejected') {
      throw ordersOutcome.reason instanceof Error
        ? ordersOutcome.reason
        : new Error(String(ordersOutcome.reason));
    }
    if (source.provider === 'olist' && ordersOutcome.value.incompleto) throw new Error('olist_listagem_incompleta');
    // Preserva o sinal de frescor antes associado ao coletor legado, mas só
    // para a fonte congelada que acabou de concluir (CAS de provider+geração).
    if (!ordersOutcome.value.incompleto) {
      try {
        await touchLastSyncAtForSource(source);
      } catch {
        // Metadado best-effort: pedidos já foram persistidos com sucesso.
      }
    }
    const benchmarkParcial =
      marketOutcome.status === 'fulfilled' ? marketOutcome.value.benchmarkParcial : true;

    // A listagem de pedidos pode não trazer itens/frete/comissão — o detalhe traz,
    // a uma requisição por pedido. Enriquece o período do relatório dentro de um
    // orçamento que cabe no maxDuration; o que sobrar fica para o cron diário.
    // Best-effort: enrichOrders nunca lança (relatório com item parcial > nenhum).
    const enriquecimento = await enrichOrders(source, {
      maxPedidos: ENRIQUECIMENTO_PIPELINE.maxPedidos,
      prazoMs: ENRIQUECIMENTO_PIPELINE.prazoMs,
      periodo,
    });
    if (enriquecimento.incompleto) {
      log.warn('enriquecimento parcial no pipeline', enriquecimento);
    }

    await setEtapa(reportId, 'analisando_mercado');
    const metricas = await computeMetrics(source, reportId, periodo, benchmarkParcial);

    await setEtapa(reportId, 'analisando_ia');
    const contexto = await buildAnalysisContext({ orgId, orgName, nicho, plano, periodo, source });
    const { analise, usage: iaUsage } = await analyzeWithIA(metricas, contexto);

    await setEtapa(reportId, 'finalizando');
    let clientEmail: string | null = null;
    try {
      clientEmail = await getOrgPrimaryEmail(orgId);
    } catch {
      // lookup falhou — e-mail pulado, pipeline continua
    }
    await finalize({ reportId, orgId, metricas, analise, plano, periodo, clientEmail, iaUsage });

    // H2/H3: extras pós-finalize (nicho → kits → calendário) — best-effort,
    // NUNCA afetam o resultado do pipeline (módulo nunca lança).
    await executarExtrasPosFinalize({
      orgId,
      reportId,
      orgName,
      nicho,
      ticketMedio: metricas.ticketMedio,
      topProdutos: metricas.topProdutos.map((p) => p.nome),
      source,
    });

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
