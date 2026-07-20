/**
 * I/O da performance por analista (H4 T8) — a contraparte não pura de
 * `performance-analistas.ts`: cada função aqui só BUSCA dado (nenhuma
 * decisão de agregação/filtro mora aqui, exceto a contagem simples de um
 * GROUP BY); quem decide o que entra no agregado final (ex.: só impacto
 * positivo) é sempre a função pura `performancePorAnalista`.
 */
import { and, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, taskActivities, tasks } from '@/db/schema';
import type { TaskImpactoAnalista } from '@/modules/admin/performance-analistas';
import { getTaskImpact } from '@/modules/tasks/task-impact';

/** nicho/plano ficam em `getOrgDetalhesBatch` (carteira-data.repository, não exportado) — aqui só o dono (analista_id), em UMA query IN(orgIds). */
export async function getAnalistaPorOrg(orgIds: string[]): Promise<Map<string, string>> {
  if (orgIds.length === 0) return new Map();
  const rows = await db
    .select({ id: organizations.id, analistaId: organizations.analista_id })
    .from(organizations)
    .where(inArray(organizations.id, orgIds));
  const map = new Map<string, string>();
  for (const r of rows) {
    if (r.analistaId) map.set(r.id, r.analistaId);
  }
  return map;
}

/**
 * Tasks concluídas por analista desde uma data — UMA query agregada
 * (GROUP BY organizations.analista_id), contando transições reais para
 * `concluida` via `task_activities` (mesmo critério de
 * `contarConcluidasDesde`/`getConsultoriaMetrics` em analista.repository.ts —
 * duplicada aqui deliberadamente, é uma query de 10 linhas, para não acoplar
 * este módulo novo a um repositório que já tem sua própria suíte/uso testado
 * — mesma decisão de `saudeConexao` local em carteira-data.repository.ts).
 * Só orgs COM analista atribuído entram (`isNotNull`).
 */
export async function getTasksConcluidas30dPorAnalista(desde: Date): Promise<Map<string, number>> {
  const rows = await db
    .select({
      analistaId: organizations.analista_id,
      n: sql<number>`count(distinct ${taskActivities.task_id})::int`,
    })
    .from(taskActivities)
    .innerJoin(tasks, eq(taskActivities.task_id, tasks.id))
    .innerJoin(organizations, eq(tasks.org_id, organizations.id))
    .where(
      and(
        isNotNull(organizations.analista_id),
        eq(taskActivities.evento, 'status'),
        eq(taskActivities.para, 'concluida'),
        gte(taskActivities.created_at, desde),
      ),
    )
    .groupBy(organizations.analista_id);
  return new Map(rows.map((r) => [r.analistaId as string, Number(r.n)]));
}

/**
 * Impacto (motor F2 — `getTaskImpact`) de CADA task concluída desde uma data,
 * cross-org (só orgs com analista atribuído), resolvido para o analista da
 * org. Devolve TODAS as entradas medidas (positivas ou não) — a decisão de
 * filtrar só impacto positivo é da função pura `performancePorAnalista`, não
 * daqui (mesma separação de `getTasksReplicaveisCarteira`/`sugestoesReplicaveis`
 * em comparativo-data.repository.ts).
 *
 * Custo: 1 query (distinct tasks concluídas no período) + até 2-3 queries por
 * task via `getTaskImpact` — aceitável no volume atual (dezenas de orgs
 * totais, janela de 30 dias); reavaliar (ex.: cap por analista) se a base de
 * clientes crescer muito — mesma classe de decisão já aceita em
 * `getTasksReplicaveisCarteira` (T7), agora em escopo admin (todas as orgs).
 */
export async function getImpactosPorAnalista(desde: Date): Promise<TaskImpactoAnalista[]> {
  const rows = await db
    .selectDistinct({
      taskId: taskActivities.task_id,
      orgId: tasks.org_id,
      analistaId: organizations.analista_id,
    })
    .from(taskActivities)
    .innerJoin(tasks, eq(taskActivities.task_id, tasks.id))
    .innerJoin(organizations, eq(tasks.org_id, organizations.id))
    .where(
      and(
        isNotNull(organizations.analista_id),
        eq(taskActivities.evento, 'status'),
        eq(taskActivities.para, 'concluida'),
        gte(taskActivities.created_at, desde),
      ),
    );

  const impactos = await Promise.all(rows.map((r) => getTaskImpact(r.taskId, r.orgId)));
  const out: TaskImpactoAnalista[] = [];
  rows.forEach((r, i) => {
    const impacto = impactos[i];
    if (impacto === null) return;
    out.push({ analistaId: r.analistaId as string, deltaPct: impacto.deltaPct });
  });
  return out;
}
