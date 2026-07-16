import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { AnaliseIaSchema, MetricasSchema } from '@/modules/pipeline/contracts';
import { totalVendas } from '@/modules/reports/compare';
import { achadoToTaskInput, itemToTaskInput, normalizarTexto, tituloFromItem, type FonteAnalise } from './report-to-task';
import { prazoDefault } from './sla';
import { recordTaskActivity } from './task-activity.repository';
import { getTemplateAtivoPorTipo } from './task-template.repository';
import { createTask, findTaskConcluidaPorTitulo, listTaskTitulosAbertos } from './task.repository';

export async function createTasksFromReport(input: {
  reportId: string;
  orgId: string;
  itens: Array<{ fonte: FonteAnalise; indice: number; prazo?: string; usarChecklistPlaybook?: boolean }>;
  actorUserId: string | null;
}): Promise<number> {
  const [rep] = await db
    .select({ org_id: reports.org_id, analise_ia: reports.analise_ia, metricas: reports.metricas })
    .from(reports)
    .where(eq(reports.id, input.reportId))
    .limit(1);
  if (!rep || rep.org_id !== input.orgId) return 0; // escopo: report precisa ser da org resolvida
  const parsed = AnaliseIaSchema.safeParse(rep.analise_ia);
  if (!parsed.success) return 0;
  // Baseline "Vendas do período" para a descrição v2 — calculado UMA vez.
  const metricasParsed = MetricasSchema.safeParse(rep.metricas);
  const baselineVendas = metricasParsed.success ? totalVendas(metricasParsed.data) : null;
  // Dedup ORG-WIDE: títulos normalizados de tasks abertas (qualquer report).
  const abertosNorm = new Set((await listTaskTitulosAbertos(input.orgId)).map(normalizarTexto));
  let criadas = 0;
  for (const item of input.itens) {
    const { fonte, indice } = item;
    if (fonte === 'achados') {
      const achado = parsed.data.achados?.[indice];
      if (!achado) continue;
      const titulo = tituloFromItem(achado.titulo);
      const tituloNorm = normalizarTexto(titulo);
      if (abertosNorm.has(tituloNorm)) continue;
      const anterior = await findTaskConcluidaPorTitulo(input.orgId, titulo);
      const checklistPlaybook =
        item.usarChecklistPlaybook === true
          ? ((await getTemplateAtivoPorTipo(achado.tipo))?.checklist ?? [])
          : undefined;
      const t = achadoToTaskInput(achado, input.reportId, { baselineVendas, checklistPlaybook });
      const descricaoFinal = anterior
        ? `${t.descricao}\n\n_Reincidente: recomendação já concluída anteriormente — [tarefa anterior](/dashboard/plano-de-acao/${anterior.id})._`
        : t.descricao;
      const taskId = await createTask({
        orgId: input.orgId,
        ...t,
        descricao: descricaoFinal,
        prazo: item.prazo ?? prazoDefault(t.prioridade),
        actorUserId: input.actorUserId,
      });
      if (anterior) {
        await recordTaskActivity({ taskId, userId: input.actorUserId ?? null, evento: 'reincidencia', de: anterior.id });
      }
      abertosNorm.add(tituloNorm);
      criadas += 1;
      continue;
    }
    const texto = parsed.data[fonte]?.[indice];
    if (typeof texto !== 'string' || texto.length === 0) continue;
    const titulo = tituloFromItem(texto);
    const tituloNorm = normalizarTexto(titulo);
    if (abertosNorm.has(tituloNorm)) continue;
    const anterior = await findTaskConcluidaPorTitulo(input.orgId, titulo);
    const t = itemToTaskInput({ fonte, texto, reportId: input.reportId });
    const descricaoFinal = anterior
      ? `${t.descricao}\n\n_Reincidente: recomendação já concluída anteriormente — [tarefa anterior](/dashboard/plano-de-acao/${anterior.id})._`
      : t.descricao;
    const taskId = await createTask({
      orgId: input.orgId,
      ...t,
      descricao: descricaoFinal,
      prazo: item.prazo ?? prazoDefault(t.prioridade),
      actorUserId: input.actorUserId,
    });
    if (anterior) {
      await recordTaskActivity({ taskId, userId: input.actorUserId ?? null, evento: 'reincidencia', de: anterior.id });
    }
    abertosNorm.add(tituloNorm);
    criadas += 1;
  }
  return criadas;
}
