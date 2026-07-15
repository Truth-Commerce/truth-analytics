import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { AnaliseIaSchema, MetricasSchema } from '@/modules/pipeline/contracts';
import { totalVendas } from '@/modules/reports/compare';
import { achadoToTaskInput, itemToTaskInput, tituloFromItem, type FonteAnalise } from './report-to-task';
import { prazoDefault } from './sla';
import { getTemplateAtivoPorTipo } from './task-template.repository';
import { createTask, listTaskTitulosByReport } from './task.repository';

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
  const existentes = new Set(await listTaskTitulosByReport(input.reportId, input.orgId));
  let criadas = 0;
  for (const item of input.itens) {
    const { fonte, indice } = item;
    if (fonte === 'achados') {
      const achado = parsed.data.achados?.[indice];
      if (!achado) continue;
      const titulo = tituloFromItem(achado.titulo);
      if (existentes.has(titulo)) continue;
      const checklistPlaybook =
        item.usarChecklistPlaybook === true
          ? ((await getTemplateAtivoPorTipo(achado.tipo))?.checklist ?? [])
          : undefined;
      const t = achadoToTaskInput(achado, input.reportId, { baselineVendas, checklistPlaybook });
      await createTask({
        orgId: input.orgId,
        ...t,
        prazo: item.prazo ?? prazoDefault(t.prioridade),
        actorUserId: input.actorUserId,
      });
      existentes.add(titulo);
      criadas += 1;
      continue;
    }
    const texto = parsed.data[fonte]?.[indice];
    if (typeof texto !== 'string' || texto.length === 0) continue;
    const titulo = tituloFromItem(texto);
    if (existentes.has(titulo)) continue;
    const t = itemToTaskInput({ fonte, texto, reportId: input.reportId });
    await createTask({
      orgId: input.orgId,
      ...t,
      prazo: item.prazo ?? prazoDefault(t.prioridade),
      actorUserId: input.actorUserId,
    });
    existentes.add(titulo);
    criadas += 1;
  }
  return criadas;
}
