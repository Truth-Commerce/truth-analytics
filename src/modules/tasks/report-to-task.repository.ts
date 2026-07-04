import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { AnaliseIaSchema } from '@/modules/pipeline/contracts';
import { itemToTaskInput, tituloFromItem, type FonteAnalise } from './report-to-task';
import { createTask, listTaskTitulosByReport } from './task.repository';

export async function createTasksFromReport(input: {
  reportId: string;
  orgId: string;
  itens: Array<{ fonte: FonteAnalise; indice: number }>;
  actorUserId: string | null;
}): Promise<number> {
  const [rep] = await db
    .select({ org_id: reports.org_id, analise_ia: reports.analise_ia })
    .from(reports)
    .where(eq(reports.id, input.reportId))
    .limit(1);
  if (!rep || rep.org_id !== input.orgId) return 0; // escopo: report precisa ser da org resolvida
  const parsed = AnaliseIaSchema.safeParse(rep.analise_ia);
  if (!parsed.success) return 0;
  const existentes = new Set(await listTaskTitulosByReport(input.reportId, input.orgId));
  let criadas = 0;
  for (const { fonte, indice } of input.itens) {
    const texto = parsed.data[fonte]?.[indice];
    if (typeof texto !== 'string' || texto.length === 0) continue;
    const titulo = tituloFromItem(texto);
    if (existentes.has(titulo)) continue;
    const t = itemToTaskInput({ fonte, texto, reportId: input.reportId });
    await createTask({ orgId: input.orgId, ...t, actorUserId: input.actorUserId });
    existentes.add(titulo);
    criadas += 1;
  }
  return criadas;
}
