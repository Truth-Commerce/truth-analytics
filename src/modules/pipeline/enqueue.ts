import { logger } from '@/lib/logger';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { periodoDoPlano } from '@/modules/admin/periodo-plano';
import { dispatchPipelineRun } from '@/modules/pipeline/dispatch';
import { createQueuedReport, markReportFailed } from '@/modules/reports/report.repository';

export type EnqueueResult =
  | { ok: true; reportId: string }
  | {
      ok: false;
      motivo:
        | 'sem_plano'
        | 'org_nao_encontrada'
        | 'relatorio_em_andamento'
        | 'falha_disparo_pipeline';
      reportId?: string;
    };

type ReportPeriod = { inicio: Date; fim: Date };

/**
 * Helper canônico de enfileiramento — usado tanto pela `generateReportAction`
 * (geração manual) quanto pelo cron `gerar-relatorios` (geração automática):
 * mesmo caminho, zero duplicação.
 *
 * Insere o report 'queued' via `createQueuedReport` — o índice único parcial
 * da F0 (`reports_org_ativo_uq`, no máx. 1 queued/running por org) é o lock:
 * conflito vira `relatorio_em_andamento` — e dispara o pipeline via
 * `dispatchPipelineRun` (POST /api/pipeline/run), aguardando só o 202.
 *
 * NÃO valida gating de plano/ciclo/Bling — o caller decide: a action já
 * validou `podeGerar`/Bling antes de chamar; o cron filtra elegibilidade via
 * `listOrgsElegiveisParaGeracao` antes de chamar.
 */
export async function enqueueReport(
  orgId: string,
  explicitPeriod?: ReportPeriod,
): Promise<EnqueueResult> {
  const org = await getOrganizationById(orgId);
  if (!org) return { ok: false, motivo: 'org_nao_encontrada' };
  if (!org.plano) return { ok: false, motivo: 'sem_plano' };

  // G0: janela em dias FECHADOS no calendário America/Sao_Paulo (fonte única
  // compartilhada com o disparo manual do admin — periodoDoPlano).
  const periodo = explicitPeriod ?? periodoDoPlano(org.plano, new Date());

  let reportId: string;
  try {
    reportId = await createQueuedReport(orgId, periodo);
  } catch (err) {
    if (err instanceof Error && err.message === 'relatorio_em_andamento') {
      return { ok: false, motivo: 'relatorio_em_andamento' };
    }
    throw err;
  }

  try {
    await dispatchPipelineRun(reportId);
  } catch (err) {
    await markReportFailed(reportId, 'dispatch_falhou');
    logger.error('dispatch do pipeline falhou', { orgId, reportId }, err);
    return { ok: false, motivo: 'falha_disparo_pipeline', reportId };
  }

  return { ok: true, reportId };
}
