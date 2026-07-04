import { MetricasSchema } from '@/modules/pipeline/contracts';
import { getLatestDoneReportAfter, getReportById } from '@/modules/reports/report.repository';

import { getTaskById } from './task.repository';

export type TaskImpact = {
  periodoOrigem: { inicio: Date; fim: Date };
  totalOrigem: number;
  periodoAtual: { inicio: Date; fim: Date };
  totalAtual: number;
  deltaPct: number; // (atual - origem) / origem * 100; origem 0 → deltaPct 0
} | null;

function totalVendas(metricas: { vendasPorCanal: Array<{ total: number }> }): number {
  return metricas.vendasPorCanal.reduce((s, c) => s + c.total, 0);
}

/**
 * Impacto de uma task concluída — compara as vendas do relatório que
 * originou a task (`reportId`) com as do relatório `done` mais recente da
 * org (posterior ao de origem). É o "payoff" da F2: mostra se a task
 * concluída se traduziu em mais vendas.
 *
 * `null` em qualquer condição que impeça a comparação: task não existe na
 * org, não está `concluida`, não tem `reportId`, o report de origem não é
 * `done`/não tem métricas válidas, ou ainda não existe um relatório `done`
 * posterior ao de origem (comparação prematura).
 */
export async function getTaskImpact(taskId: string, orgId: string): Promise<TaskImpact> {
  const task = await getTaskById(taskId, orgId);
  if (!task) return null;
  if (task.status !== 'concluida') return null;
  if (!task.reportId) return null;

  const origem = await getReportById(task.reportId, orgId);
  if (!origem || origem.status !== 'done') return null;
  const origemParsed = MetricasSchema.safeParse(origem.metricas);
  if (!origemParsed.success) return null;

  const atual = await getLatestDoneReportAfter(orgId, origem.createdAt, origem.id);
  if (!atual) return null;
  const atualParsed = MetricasSchema.safeParse(atual.metricas);
  if (!atualParsed.success) return null;

  const totalOrigem = totalVendas(origemParsed.data);
  const totalAtual = totalVendas(atualParsed.data);
  const deltaPct = totalOrigem === 0 ? 0 : ((totalAtual - totalOrigem) / totalOrigem) * 100;

  return {
    periodoOrigem: { inicio: origem.periodoInicio, fim: origem.periodoFim },
    totalOrigem,
    periodoAtual: { inicio: atual.periodoInicio, fim: atual.periodoFim },
    totalAtual,
    deltaPct,
  };
}
