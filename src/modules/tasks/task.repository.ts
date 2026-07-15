import { and, count, desc, eq, inArray, max, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { taskComments, taskActivities, tasks } from '@/db/schema';
import { normalizarTexto } from './report-to-task';
import type {
  TaskAtor, TaskCriadoPor, TaskDetail, TaskPrioridade, TaskStatus, TaskSummary, TaskTipo,
} from './task.types';
import { podeTransicionar } from './task-transitions';
import { recordTaskActivity } from './task-activity.repository';

type TaskRow = typeof tasks.$inferSelect;

function rowToSummary(r: TaskRow): TaskSummary {
  return {
    id: r.id, titulo: r.titulo, tipo: r.tipo as TaskTipo,
    prioridade: r.prioridade as TaskPrioridade, status: r.status as TaskStatus,
    prazo: r.prazo, criadoPor: r.criado_por as TaskCriadoPor,
    reportId: r.report_id, ordem: r.ordem, createdAt: r.created_at,
  };
}

function rowToDetail(r: TaskRow): TaskDetail {
  return { ...rowToSummary(r), descricao: r.descricao, assigneeUserId: r.assignee_user_id, orgId: r.org_id, updatedAt: r.updated_at };
}

async function proximaOrdem(orgId: string, status: TaskStatus): Promise<number> {
  const [row] = await db
    .select({ m: max(tasks.ordem) })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), eq(tasks.status, status)));
  return (row?.m ?? 0) + 1;
}

export async function listTasksByOrg(orgId: string): Promise<TaskSummary[]> {
  const rows = await db.select().from(tasks).where(eq(tasks.org_id, orgId)).orderBy(tasks.status, tasks.ordem);
  return rows.map(rowToSummary);
}

export async function getTaskById(taskId: string, orgId: string): Promise<TaskDetail | null> {
  const [row] = await db
    .select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgId)))
    .limit(1);
  return row ? rowToDetail(row) : null;
}

export async function createTask(input: {
  orgId: string; titulo: string; descricao?: string; tipo: TaskTipo; prioridade: TaskPrioridade;
  criadoPor: TaskCriadoPor; prazo?: string | null; reportId?: string | null;
  assigneeUserId?: string | null; actorUserId?: string | null;
}): Promise<string> {
  const ordem = await proximaOrdem(input.orgId, 'backlog');
  const [row] = await db
    .insert(tasks)
    .values({
      org_id: input.orgId, titulo: input.titulo, descricao: input.descricao ?? '',
      tipo: input.tipo, prioridade: input.prioridade, status: 'backlog',
      prazo: input.prazo ?? null, criado_por: input.criadoPor,
      report_id: input.reportId ?? null, assignee_user_id: input.assigneeUserId ?? null, ordem,
    })
    .returning({ id: tasks.id });
  await recordTaskActivity({ taskId: row!.id, userId: input.actorUserId ?? null, evento: 'criada', para: 'backlog' });
  return row!.id;
}

export async function updateTask(input: {
  taskId: string;
  orgId: string;
  actorUserId: string;
  patch: Partial<Pick<TaskDetail, 'titulo' | 'descricao' | 'tipo' | 'prioridade' | 'prazo' | 'assigneeUserId'>>;
}): Promise<void> {
  const task = await getTaskById(input.taskId, input.orgId);
  if (!task) throw new Error('task_nao_encontrada');

  const set: Partial<typeof tasks.$inferInsert> = {};
  if (input.patch.titulo !== undefined) set.titulo = input.patch.titulo;
  if (input.patch.descricao !== undefined) set.descricao = input.patch.descricao;
  if (input.patch.tipo !== undefined) set.tipo = input.patch.tipo;
  if (input.patch.prioridade !== undefined) set.prioridade = input.patch.prioridade;
  if (input.patch.prazo !== undefined) set.prazo = input.patch.prazo;
  if (input.patch.assigneeUserId !== undefined) set.assignee_user_id = input.patch.assigneeUserId;

  if (Object.keys(set).length > 0) {
    await db.update(tasks).set(set).where(and(eq(tasks.id, input.taskId), eq(tasks.org_id, input.orgId)));
  }

  await recordTaskActivity({ taskId: input.taskId, userId: input.actorUserId, evento: 'editada' });

  if (input.patch.prazo !== undefined && input.patch.prazo !== task.prazo) {
    await recordTaskActivity({
      taskId: input.taskId,
      userId: input.actorUserId,
      evento: 'prazo',
      de: task.prazo,
      para: input.patch.prazo,
    });
  }
  if (input.patch.assigneeUserId !== undefined && input.patch.assigneeUserId !== task.assigneeUserId) {
    await recordTaskActivity({
      taskId: input.taskId,
      userId: input.actorUserId,
      evento: 'assignee',
      de: task.assigneeUserId,
      para: input.patch.assigneeUserId,
    });
  }
}

export async function moveTask(input: {
  taskId: string; orgId: string; ator: TaskAtor; actorUserId: string; para: TaskStatus;
}): Promise<TaskStatus> {
  const task = await getTaskById(input.taskId, input.orgId);
  if (!task) throw new Error('task_nao_encontrada');
  if (!podeTransicionar({ ator: input.ator, criadoPor: task.criadoPor, de: task.status, para: input.para })) {
    throw new Error('transicao_invalida');
  }
  const ordem = await proximaOrdem(input.orgId, input.para);
  await db
    .update(tasks)
    .set({ status: input.para, ordem })
    .where(and(eq(tasks.id, input.taskId), eq(tasks.org_id, input.orgId)));
  await recordTaskActivity({ taskId: input.taskId, userId: input.actorUserId, evento: 'status', de: task.status, para: input.para });
  return input.para;
}

export async function reorderTask(input: { taskId: string; orgId: string; direcao: 'up' | 'down' }): Promise<void> {
  const task = await getTaskById(input.taskId, input.orgId);
  if (!task) throw new Error('task_nao_encontrada');
  const vizinhos = await db
    .select({ id: tasks.id, ordem: tasks.ordem })
    .from(tasks)
    .where(and(
      eq(tasks.org_id, input.orgId),
      eq(tasks.status, task.status),
      input.direcao === 'up' ? sql`${tasks.ordem} < ${task.ordem}` : sql`${tasks.ordem} > ${task.ordem}`,
    ))
    .orderBy(input.direcao === 'up' ? desc(tasks.ordem) : tasks.ordem)
    .limit(1);
  const vizinho = vizinhos[0];
  if (!vizinho) return; // já é o extremo
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ ordem: vizinho.ordem }).where(eq(tasks.id, input.taskId));
    await tx.update(tasks).set({ ordem: task.ordem }).where(eq(tasks.id, vizinho.id));
  });
}

export async function deleteTask(taskId: string, orgId: string): Promise<void> {
  const task = await getTaskById(taskId, orgId);
  if (!task) throw new Error('task_nao_encontrada');
  await db.transaction(async (tx) => {
    await tx.delete(taskComments).where(eq(taskComments.task_id, taskId));
    await tx.delete(taskActivities).where(eq(taskActivities.task_id, taskId));
    await tx.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgId)));
  });
}

export async function countTasksAbertas(orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), inArray(tasks.status, ['backlog', 'todo', 'em_andamento'])));
  return Number(row?.n ?? 0);
}

export async function countTasksByStatus(orgId: string): Promise<Record<TaskStatus, number>> {
  const rows = await db
    .select({ status: tasks.status, n: count() })
    .from(tasks)
    .where(eq(tasks.org_id, orgId))
    .groupBy(tasks.status);
  const base: Record<TaskStatus, number> = { backlog: 0, todo: 0, em_andamento: 0, em_revisao: 0, concluida: 0 };
  for (const r of rows) base[r.status as TaskStatus] = Number(r.n);
  return base;
}

export async function listTaskTitulosByReport(reportId: string, orgId: string): Promise<string[]> {
  const rows = await db
    .select({ titulo: tasks.titulo })
    .from(tasks)
    .where(and(eq(tasks.report_id, reportId), eq(tasks.org_id, orgId)));
  return rows.map((r) => r.titulo);
}

export const DEDUP_CONCLUIDAS_LIMITE = 500;

/** Títulos CRUS das tasks ABERTAS da org (dedup cross-report + botões da UI). */
export async function listTaskTitulosAbertos(orgId: string): Promise<string[]> {
  const rows = await db
    .select({ titulo: tasks.titulo })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), ne(tasks.status, 'concluida')));
  return rows.map((r) => r.titulo);
}

/**
 * Task CONCLUÍDA mais recente cujo título normalizado bate com `titulo`
 * (reincidência). Varre no máx. DEDUP_CONCLUIDAS_LIMITE concluídas.
 */
export async function findTaskConcluidaPorTitulo(
  orgId: string,
  titulo: string,
): Promise<{ id: string; titulo: string; updatedAt: Date } | null> {
  const alvo = normalizarTexto(titulo);
  const rows = await db
    .select({ id: tasks.id, titulo: tasks.titulo, updatedAt: tasks.updated_at })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), eq(tasks.status, 'concluida')))
    .orderBy(desc(tasks.updated_at))
    .limit(DEDUP_CONCLUIDAS_LIMITE);
  return rows.find((r) => normalizarTexto(r.titulo) === alvo) ?? null;
}
