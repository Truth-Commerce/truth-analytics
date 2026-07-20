import { and, count, desc, eq, inArray, max, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { taskComments, taskActivities, tasks } from '@/db/schema';
import { parseChecklist, toggleChecklistLine } from './checklist-line';
import { nivelFilhoValido, progressoEpico, type Nivel, type ProgressoEpico } from './hierarquia';
import { normalizarLabels } from './labels';
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
  return {
    ...rowToSummary(r),
    descricao: r.descricao,
    assigneeUserId: r.assignee_user_id,
    orgId: r.org_id,
    updatedAt: r.updated_at,
    labels: Array.isArray(r.labels) ? (r.labels as string[]) : [],
  };
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

export type TaskCardInfo = TaskSummary & {
  comentarios: number;
  checklistFeitos: number;
  checklistTotal: number;
  reincidente: boolean;
};

/** Kanban rico: summary + nº de comentários (agregado em SQL) + checklist (parse da descricao). */
export async function listTasksKanban(orgId: string): Promise<TaskCardInfo[]> {
  const rows = await db
    .select({
      task: tasks,
      comentarios: count(taskComments.id),
    })
    .from(tasks)
    .leftJoin(taskComments, eq(taskComments.task_id, tasks.id))
    .where(eq(tasks.org_id, orgId))
    .groupBy(tasks.id)
    .orderBy(tasks.status, tasks.ordem);
  return rows.map(({ task, comentarios }) => {
    const itens = parseChecklist(task.descricao);
    return {
      ...rowToSummary(task),
      comentarios: Number(comentarios),
      checklistFeitos: itens.filter((i) => i.feito).length,
      checklistTotal: itens.length,
      reincidente: task.descricao.includes('_Reincidente:'),
    };
  });
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
  /** Hierarquia (H5): task-pai (null/omitido = raiz) e nível — default 'task' (retrocompat). */
  parentId?: string | null; nivel?: Nivel;
}): Promise<string> {
  const ordem = await proximaOrdem(input.orgId, 'backlog');
  const [row] = await db
    .insert(tasks)
    .values({
      org_id: input.orgId, titulo: input.titulo, descricao: input.descricao ?? '',
      tipo: input.tipo, prioridade: input.prioridade, status: 'backlog',
      prazo: input.prazo ?? null, criado_por: input.criadoPor,
      report_id: input.reportId ?? null, assignee_user_id: input.assigneeUserId ?? null, ordem,
      parent_id: input.parentId ?? null, nivel: input.nivel ?? 'task',
    })
    .returning({ id: tasks.id });
  await recordTaskActivity({ taskId: row!.id, userId: input.actorUserId ?? null, evento: 'criada', para: 'backlog' });
  return row!.id;
}

/** Busca crua (org-scoped) de nível + report_id de uma possível task-pai — usada só para herança em criarSubtarefa. */
async function getNivelEReport(taskId: string, orgId: string): Promise<{ nivel: Nivel; reportId: string | null } | null> {
  const [row] = await db
    .select({ nivel: tasks.nivel, report_id: tasks.report_id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgId)))
    .limit(1);
  return row ? { nivel: row.nivel as Nivel, reportId: row.report_id } : null;
}

/** Cria um épico — raiz da hierarquia (nivel='epico', sem parent). */
export async function criarEpico(input: {
  orgId: string; titulo: string; descricao?: string; tipo: TaskTipo; prioridade: TaskPrioridade;
  criadoPor: TaskCriadoPor; prazo?: string | null; reportId?: string | null;
  assigneeUserId?: string | null; actorUserId?: string | null;
}): Promise<string> {
  return createTask({ ...input, nivel: 'epico' });
}

/**
 * Cria uma task-filha (task ou subtask) de uma task-pai já existente, validando o nível via
 * `nivelFilhoValido` (epico→task, task→subtask; qualquer outra combinação é rejeitada). A filha
 * herda org_id e report_id do pai — não são recebidos no input.
 */
export async function criarSubtarefa(input: {
  orgId: string; parentId: string; nivel: Nivel; titulo: string; descricao?: string;
  tipo: TaskTipo; prioridade: TaskPrioridade; criadoPor: TaskCriadoPor; prazo?: string | null;
  assigneeUserId?: string | null; actorUserId?: string | null;
}): Promise<string> {
  const pai = await getNivelEReport(input.parentId, input.orgId);
  if (!pai) throw new Error('task_pai_nao_encontrada');
  if (!nivelFilhoValido(pai.nivel, input.nivel)) {
    throw new Error(`nivel_filho_invalido: '${pai.nivel}' nao aceita filho '${input.nivel}'`);
  }
  return createTask({
    orgId: input.orgId, titulo: input.titulo, descricao: input.descricao, tipo: input.tipo,
    prioridade: input.prioridade, criadoPor: input.criadoPor, prazo: input.prazo,
    reportId: pai.reportId, assigneeUserId: input.assigneeUserId, actorUserId: input.actorUserId,
    parentId: input.parentId, nivel: input.nivel,
  });
}

export type ArvoreTask = TaskSummary & { subtasks: TaskSummary[] };
export type ArvoreEpico = { epico: TaskSummary; tasks: ArvoreTask[] };

/** Épico + filhas diretas (tasks) + netas (subtasks de cada task filha) — tudo org-scoped. */
export async function listarArvore(orgId: string, epicoId: string): Promise<ArvoreEpico | null> {
  const [epicoRow] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, epicoId), eq(tasks.org_id, orgId), eq(tasks.nivel, 'epico')))
    .limit(1);
  if (!epicoRow) return null;

  const taskRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.parent_id, epicoId), eq(tasks.org_id, orgId)))
    .orderBy(tasks.ordem);

  const taskIds = taskRows.map((r) => r.id);
  const subtaskRows = taskIds.length
    ? await db
        .select()
        .from(tasks)
        .where(and(inArray(tasks.parent_id, taskIds), eq(tasks.org_id, orgId)))
        .orderBy(tasks.ordem)
    : [];

  const subtasksPorPai = new Map<string, TaskSummary[]>();
  for (const row of subtaskRows) {
    const paiId = row.parent_id!;
    const lista = subtasksPorPai.get(paiId) ?? [];
    lista.push(rowToSummary(row));
    subtasksPorPai.set(paiId, lista);
  }

  return {
    epico: rowToSummary(epicoRow),
    tasks: taskRows.map((r) => ({ ...rowToSummary(r), subtasks: subtasksPorPai.get(r.id) ?? [] })),
  };
}

/** Progresso (agregado das filhas diretas) de vários épicos de uma vez — evita N+1 no board. */
export async function progressoDeEpicos(orgId: string, epicoIds: string[]): Promise<Map<string, ProgressoEpico>> {
  const mapa = new Map<string, ProgressoEpico>();
  if (epicoIds.length === 0) return mapa;

  const rows = await db
    .select({ parent_id: tasks.parent_id, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), inArray(tasks.parent_id, epicoIds)));

  const filhasPorEpico = new Map<string, { status: TaskStatus }[]>();
  for (const id of epicoIds) filhasPorEpico.set(id, []);
  for (const row of rows) {
    if (!row.parent_id) continue;
    filhasPorEpico.get(row.parent_id)?.push({ status: row.status as TaskStatus });
  }

  for (const [id, filhas] of filhasPorEpico) mapa.set(id, progressoEpico(filhas));
  return mapa;
}

/** Pai (summary, null se raiz) + filhas diretas (summary) de uma task — tudo org-scoped. */
export async function getPaiEFilhas(
  taskId: string,
  orgId: string,
): Promise<{ pai: TaskSummary | null; filhas: TaskSummary[] } | null> {
  const [row] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgId))).limit(1);
  if (!row) return null;

  let pai: TaskSummary | null = null;
  if (row.parent_id) {
    const [paiRow] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, row.parent_id), eq(tasks.org_id, orgId)))
      .limit(1);
    pai = paiRow ? rowToSummary(paiRow) : null;
  }

  const filhasRows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.parent_id, taskId), eq(tasks.org_id, orgId)))
    .orderBy(tasks.ordem);
  return { pai, filhas: filhasRows.map(rowToSummary) };
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

/**
 * Define as labels de uma task (H5/T3), org-scoped. Sempre normaliza via
 * `normalizarLabels` antes de gravar (dedup/trim/cap/max — nunca confia em
 * input cru vindo de form/API). Devolve as labels efetivamente gravadas.
 */
export async function setTaskLabels(taskId: string, orgId: string, labels: unknown): Promise<string[]> {
  const task = await getTaskById(taskId, orgId);
  if (!task) throw new Error('task_nao_encontrada');
  const normalizadas = normalizarLabels(labels);
  await db.update(tasks).set({ labels: normalizadas }).where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgId)));
  return normalizadas;
}

/**
 * Labels de TODAS as tasks da org (H5/T5) — insumo bruto para
 * `sugerirLabels` (que agrega por frequência). Consulta enxuta (só a coluna
 * `labels`), sem paginação — o volume por org é o mesmo de `listTasksByOrg`.
 */
export async function listLabelsUsadas(orgId: string): Promise<string[][]> {
  const rows = await db.select({ labels: tasks.labels }).from(tasks).where(eq(tasks.org_id, orgId));
  return rows.map((r) => (Array.isArray(r.labels) ? (r.labels as string[]) : []));
}

/**
 * Toggle atômico de item de checklist: transação + SELECT ... FOR UPDATE
 * serializa toggles concorrentes — o read-modify-write via updateTask podia
 * perder um update quando dois cliques chegavam juntos. Devolve true se a
 * descrição mudou (índice válido de linha checklist).
 */
export async function toggleChecklistItemTx(input: {
  taskId: string;
  orgId: string;
  index: number;
  actorUserId: string | null;
}): Promise<boolean> {
  const mudou = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ descricao: tasks.descricao })
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.org_id, input.orgId)))
      .for('update')
      .limit(1);
    if (!row) throw new Error('task_nao_encontrada');
    const nova = toggleChecklistLine(row.descricao, input.index);
    if (nova === row.descricao) return false;
    await tx
      .update(tasks)
      .set({ descricao: nova })
      .where(and(eq(tasks.id, input.taskId), eq(tasks.org_id, input.orgId)));
    return true;
  });
  if (mudou) {
    // Paridade com o fluxo antigo (updateTask registrava 'editada').
    await recordTaskActivity({ taskId: input.taskId, userId: input.actorUserId, evento: 'editada' });
  }
  return mudou;
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
