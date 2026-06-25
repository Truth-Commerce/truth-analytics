import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { sendPipelineFailedEmail } from '@/modules/notifications/email';
import { getAdminAlertEmail, getOrgPrimaryEmail } from '@/modules/notifications/recipients';
import { collectBlingOrders } from '@/modules/pipeline/steps/collect-bling';
import { collectMarket } from '@/modules/pipeline/steps/collect-market';
import { computeMetrics } from '@/modules/pipeline/steps/compute-metrics';
import { analyzeWithIA } from '@/modules/pipeline/steps/analyze-ia';
import { finalize } from '@/modules/pipeline/steps/finalize';
import { diasDoPlano } from '@/modules/pipeline/plan-lock';

/** Limita o erro persistido a 2000 chars para legibilidade no painel (a coluna `text` é ilimitada). */
function truncateErro(msg: string, maxLen = 2000): string {
  return msg.length <= maxLen ? msg : msg.slice(0, maxLen) + '…';
}

/**
 * Orquestrador principal do pipeline de relatório.
 *
 * Fluxo:
 * 1. Carrega a org (plano + nicho).
 * 2. Cria um `report` com status 'running'.
 * 3. Roda collectBlingOrders ∥ collectMarket (Promise.all).
 *    - Bling = falha dura: rejeição propaga e é capturada pelo catch.
 *    - Mercado = graciosa: collectMarket nunca lança, apenas sinaliza benchmarkParcial.
 * 4. computeMetrics → analyzeWithIA → finalize.
 *    - A trava do plano (proximo_relatorio_liberado_em) só é setada dentro de finalize (sucesso).
 * 5. Em qualquer erro: atualiza report→'failed'+erro, envia e-mail, NÃO seta a trava.
 *    Retorna { reportId, status: 'failed' } sem relançar — o chamador inspeciona status.
 *
 * MVP: executa de forma síncrona (awaita o pipeline completo).
 * Produção: mover para background job / Vercel Workflow para durabilidade — fora do escopo deste plano.
 */
export async function generateReport(
  orgId: string,
): Promise<{ reportId: string; status: 'done' | 'failed' }> {
  // 1. Carregar a org
  const org = await getOrganizationById(orgId);
  if (!org) {
    throw new Error('org_nao_encontrada');
  }
  const { plano, nicho } = org;
  if (!plano) {
    throw new Error('sem_plano');
  }

  // 2. Calcular período
  const agora = new Date();
  const inicio = new Date(agora.getTime() - diasDoPlano(plano) * 24 * 60 * 60 * 1000);
  const periodo = { inicio, fim: agora };

  // 3. Criar report com status 'running'
  const [reportRow] = await db
    .insert(reports)
    .values({
      org_id: orgId,
      status: 'running',
      periodo_inicio: periodo.inicio,
      periodo_fim: periodo.fim,
    })
    .returning({ id: reports.id });
  const reportId = reportRow.id;

  try {
    // 4a. Coletar pedidos Bling (∥ mercado)
    //    allSettled garante que AMBAS as promessas finalizem antes de prosseguir
    //    (sem promessa "solta" escrevendo depois que o fluxo já retornou).
    //    Bling rejeita → falha dura (relança abaixo, capturado pelo catch).
    //    collectMarket nunca lança → benchmarkParcial sinalizado graciosamente
    //    (se ainda assim rejeitar, tratamos como benchmark parcial).
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

    // 4b. Calcular métricas
    const metricas = await computeMetrics(orgId, reportId, periodo, benchmarkParcial);

    // 4c. Análise IA
    const analise = await analyzeWithIA(metricas, nicho);

    // 4d. Finalizar (persiste done + trava + e-mail)
    // Resolve o e-mail primário do cliente com try/catch: falha no lookup não pode
    // abortar um pipeline que já concluiu com sucesso.
    let clientEmail: string | null = null;
    try {
      clientEmail = await getOrgPrimaryEmail(orgId);
    } catch {
      // lookup falhou — e-mail pulado, pipeline continua
    }
    await finalize({ reportId, orgId, metricas, analise, plano, clientEmail });

    return { reportId, status: 'done' };
  } catch (err) {
    // 5. Falha: marcar report como failed, NÃO setar trava
    const message = err instanceof Error ? err.message : String(err);
    const erroTruncado = truncateErro(message);

    await db
      .update(reports)
      .set({ status: 'failed', erro: erroTruncado })
      .where(eq(reports.id, reportId));

    // E-mail de falha nunca deve relançar (sendPipelineFailedEmail já garante)
    const adminEmail = getAdminAlertEmail();
    if (adminEmail) {
      await sendPipelineFailedEmail(adminEmail, orgId, reportId, erroTruncado);
    }

    return { reportId, status: 'failed' };
  }
}
