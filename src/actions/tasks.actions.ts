'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { logger } from '@/lib/logger';
import { hojeBrt, isDataCalendarioValida } from '@/lib/timezone';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import { assertNaoImpersonando } from '@/modules/auth/require-active-org';
import { requireSession } from '@/modules/auth/require-session';
import type { UserAccess } from '@/modules/auth/user.types';
import { CHECKLIST_UNCHECKED } from '@/modules/tasks/checklist-line';
import { FONTES_ANALISE } from '@/modules/tasks/report-to-task';
import { createTasksFromReport } from '@/modules/tasks/report-to-task.repository';
import { prazoDefault, somarDias } from '@/modules/tasks/sla';
import { recordTaskActivity } from '@/modules/tasks/task-activity.repository';
import { addTaskComment } from '@/modules/tasks/task-comment.repository';
import { getTemplateById } from '@/modules/tasks/task-template.repository';
import {
  createTask,
  deleteTask,
  getTaskById,
  moveTask,
  reorderTask,
  toggleChecklistItemTx,
  updateTask,
} from '@/modules/tasks/task.repository';
import {
  notifyTaskAprovada,
  notifyTaskComentario,
  notifyTaskCriada,
  notifyTaskCriadaPeloCliente,
  notifyTaskDevolvida,
  notifyTaskEmRevisao,
  notifyTasksDoRelatorio,
  notifyTasksDoRelatorioParaAnalista,
} from '@/modules/tasks/task-notifications';
import { proximoStatusAoConcluir } from '@/modules/tasks/task-transitions';
import {
  TASK_PRIORIDADES,
  TASK_STATUSES,
  TASK_TIPOS,
  type TaskAtor,
  type TaskCriadoPor,
  type TaskPrioridade,
} from '@/modules/tasks/task.types';

export type TaskActionState = { error?: string; ok?: boolean; taskId?: string };

// Prazo é dia-calendário 'yyyy-mm-dd'. O regex garante o FORMATO; o refine
// garante que é uma data REAL — sem ele, '2026-13-99' passava e explodia como
// erro de `date` no Postgres (500). Reusado por todos os schemas com prazo.
const prazoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isDataCalendarioValida, { message: 'data_invalida' });

// ---------------------------------------------------------------------------
// Resolução de contexto — o coração do multi-tenancy desta camada.
//
// Cliente NUNCA lê orgId do form (usa access.orgId da própria sessão);
// analista/admin passam por `assertOrgAccess` (analista: só carteira; admin:
// tudo) ANTES de qualquer operação de repositório.
// ---------------------------------------------------------------------------
async function resolveTaskContext(
  formData: FormData,
): Promise<{ access: UserAccess; orgId: string; ator: TaskAtor }> {
  // Guard de impersonação — PRIMEIRA linha, antes de qualquer outra lógica.
  // Este módulo resolve contexto via requireSession direto (não via
  // requireActiveOrg), então é cego ao cookie de impersonação por padrão; ver
  // comentário no topo de require-active-org.ts. Fecha C2 (mutação de task de
  // cliente sob impersonação via orgId vindo do form).
  await assertNaoImpersonando();
  const access = await requireSession();
  if (access.role === 'client') {
    if (access.orgStatus !== 'active') redirect('/aguardando');
    return { access, orgId: access.orgId, ator: 'cliente' }; // NUNCA lê orgId do form
  }
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) throw new Error('org_obrigatoria');
  await assertOrgAccess(access, orgId); // analista: só carteira; admin: tudo
  return { access, orgId, ator: access.role === 'admin_truth' ? 'admin' : 'analista' };
}

type ResolvedContext = { access: UserAccess; orgId: string; ator: TaskAtor };
type ResolveResult = { ok: true; ctx: ResolvedContext } | { ok: false; error: string };

/**
 * Wrapper de `resolveTaskContext` que converte os erros de contexto
 * conhecidos (`org_obrigatoria`, `acesso_negado`) em um resultado tipado —
 * mantém `resolveTaskContext` fiel à assinatura especificada e centraliza o
 * tratamento comum a todas as actions. Erros de sessão (`redirect`) não são
 * capturados aqui — devem propagar (é um `throw` especial do Next).
 */
async function resolveTaskContextOrError(formData: FormData): Promise<ResolveResult> {
  try {
    const ctx = await resolveTaskContext(formData);
    return { ok: true, ctx };
  } catch (e) {
    if (e instanceof Error && e.message === 'org_obrigatoria') {
      return { ok: false, error: 'Cliente não informado.' };
    }
    if (e instanceof Error && e.message === 'acesso_negado') {
      return { ok: false, error: 'Você não tem acesso a este cliente.' };
    }
    throw e;
  }
}

function warnContexto(acao: string, error: string): void {
  logger.warn(`${acao}: contexto inválido`, { erro: error });
}

function revalidateTaskRoutes(orgId: string): void {
  revalidatePath('/dashboard/plano-de-acao');
  revalidatePath(`/analista/${orgId}`);
}

// ---------------------------------------------------------------------------
// createTaskAction (stateful)
// ---------------------------------------------------------------------------
const createTaskSchema = z.object({
  titulo: z.string().trim().min(3).max(200),
  tipo: z.enum(TASK_TIPOS),
  // default: o form de template (Task 10) não envia prioridade — ela vem do
  // playbook; os demais forms continuam enviando o select explicitamente.
  prioridade: z.enum(TASK_PRIORIDADES).default('media'),
  descricao: z.string().max(5000).optional().default(''),
  prazo: prazoDate.optional(),
  templateId: z.string().min(1).optional(),
});

export async function createTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return { error: resolved.error };
  const { access, orgId, ator } = resolved.ctx;

  const parsed = createTaskSchema.safeParse({
    titulo: formData.get('titulo'),
    tipo: formData.get('tipo'),
    prioridade: formData.get('prioridade') || undefined,
    descricao: formData.get('descricao') ?? '',
    prazo: formData.get('prazo') || undefined,
    templateId: formData.get('templateId') || undefined,
  });
  if (!parsed.success) return { error: 'Dados inválidos. Confira os campos e tente novamente.' };

  let { titulo, tipo, descricao } = parsed.data;
  const { prioridade, prazo, templateId } = parsed.data;

  let prioridadeFinal: TaskPrioridade = prioridade;
  let prazoFinal: string | null = prazo ?? null;

  // templateId é um recurso do analista/admin — cliente nunca copia template.
  if (templateId && ator !== 'cliente') {
    const template = await getTemplateById(templateId);
    if (!template || !template.ativo) {
      // Antes: caía no fluxo normal e criava a task placeholder "Task de
      // template" (o form envia titulo oculto). Agora: erro honesto.
      return { error: 'Template indisponível. Atualize a página e tente novamente.' };
    }
    titulo = template.titulo;
    tipo = template.tipo;
    descricao = template.descricao;
    if (template.checklist.length > 0) {
      const checklistLines = template.checklist.map((item) => `${CHECKLIST_UNCHECKED}${item}`).join('\n');
      descricao = descricao ? `${descricao}\n${checklistLines}` : checklistLines;
    }
    prioridadeFinal = template.prioridade;
    prazoFinal =
      prazo ?? (template.prazoDias != null ? somarDias(hojeBrt(), template.prazoDias) : null);
  }

  const criadoPor: TaskCriadoPor = ator === 'cliente' ? 'cliente' : 'analista';

  const taskId = await createTask({
    orgId,
    titulo,
    descricao,
    tipo,
    prioridade: prioridadeFinal,
    criadoPor,
    prazo: prazoFinal ?? prazoDefault(prioridadeFinal),
    actorUserId: access.id,
  });

  // Gatilho simétrico (Task 10 — G3): analista/admin criou → avisa o cliente;
  // cliente criou → avisa o analista da org (fallback: e-mail admin).
  if (ator !== 'cliente') {
    await notifyTaskCriada(orgId, taskId, titulo);
  } else {
    await notifyTaskCriadaPeloCliente(orgId, taskId, titulo);
  }

  await recordAudit({ orgId, userId: access.id, acao: 'task.criada', detalhes: { taskId, titulo } });

  revalidateTaskRoutes(orgId);
  return { ok: true, taskId };
}

// ---------------------------------------------------------------------------
// moveTaskFormAction (fire-and-refresh)
// ---------------------------------------------------------------------------
const moveTaskSchema = z.object({ taskId: z.string().min(1), para: z.enum(TASK_STATUSES) });

export async function moveTaskFormAction(formData: FormData): Promise<void> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return warnContexto('moveTaskFormAction', resolved.error);
  const { access, orgId, ator } = resolved.ctx;

  const parsed = moveTaskSchema.safeParse({ taskId: formData.get('taskId'), para: formData.get('para') });
  if (!parsed.success) {
    logger.warn('moveTaskFormAction: dados inválidos', { orgId });
    return;
  }

  try {
    await moveTask({ taskId: parsed.data.taskId, orgId, ator, actorUserId: access.id, para: parsed.data.para });
  } catch (e) {
    logger.warn('moveTaskFormAction falhou', { orgId, taskId: parsed.data.taskId }, e);
    return;
  }

  revalidateTaskRoutes(orgId);
}

/**
 * moveTaskAction — mesma regra de moveTaskFormAction, mas DEVOLVE o resultado
 * (o kanban otimista mostra toast de erro em vez de falhar em silêncio).
 * Transição continua validada exclusivamente por podeTransicionar dentro de
 * moveTask — esta action não abre porta nova.
 */
export async function moveTaskAction(formData: FormData): Promise<TaskActionState> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return { error: resolved.error };
  const { access, orgId, ator } = resolved.ctx;

  const parsed = moveTaskSchema.safeParse({ taskId: formData.get('taskId'), para: formData.get('para') });
  if (!parsed.success) return { error: 'Dados inválidos. Tente novamente.' };

  try {
    await moveTask({ taskId: parsed.data.taskId, orgId, ator, actorUserId: access.id, para: parsed.data.para });
  } catch (e) {
    if (e instanceof Error && e.message === 'transicao_invalida') {
      return { error: 'Essa mudança de coluna não é permitida.' };
    }
    if (e instanceof Error && e.message === 'task_nao_encontrada') {
      return { error: 'Tarefa não encontrada.' };
    }
    throw e;
  }

  revalidateTaskRoutes(orgId);
  return { ok: true, taskId: parsed.data.taskId };
}

// ---------------------------------------------------------------------------
// concluirTaskFormAction (fire-and-refresh)
// `para` é SEMPRE calculado no servidor via proximoStatusAoConcluir — o
// cliente nunca escolhe o destino da conclusão.
// ---------------------------------------------------------------------------
const taskIdSchema = z.object({ taskId: z.string().min(1) });

export async function concluirTaskFormAction(formData: FormData): Promise<void> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return warnContexto('concluirTaskFormAction', resolved.error);
  const { access, orgId, ator } = resolved.ctx;

  const parsed = taskIdSchema.safeParse({ taskId: formData.get('taskId') });
  if (!parsed.success) {
    logger.warn('concluirTaskFormAction: dados inválidos', { orgId });
    return;
  }
  const { taskId } = parsed.data;

  const task = await getTaskById(taskId, orgId);
  if (!task) {
    logger.warn('concluirTaskFormAction: task não encontrada', { orgId, taskId });
    return;
  }

  const para = proximoStatusAoConcluir(task.criadoPor);
  try {
    await moveTask({ taskId, orgId, ator, actorUserId: access.id, para });
  } catch (e) {
    logger.warn('concluirTaskFormAction falhou', { orgId, taskId }, e);
    return;
  }

  if (para === 'em_revisao' && ator === 'cliente') {
    await notifyTaskEmRevisao(orgId, taskId, task.titulo);
  }

  revalidateTaskRoutes(orgId);
}

// ---------------------------------------------------------------------------
// reorderTaskFormAction (fire-and-refresh)
// ---------------------------------------------------------------------------
const reorderSchema = z.object({ taskId: z.string().min(1), direcao: z.enum(['up', 'down']) });

export async function reorderTaskFormAction(formData: FormData): Promise<void> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return warnContexto('reorderTaskFormAction', resolved.error);
  const { orgId } = resolved.ctx;

  const parsed = reorderSchema.safeParse({
    taskId: formData.get('taskId'),
    direcao: formData.get('direcao'),
  });
  if (!parsed.success) {
    logger.warn('reorderTaskFormAction: dados inválidos', { orgId });
    return;
  }

  try {
    await reorderTask({ taskId: parsed.data.taskId, orgId, direcao: parsed.data.direcao });
  } catch (e) {
    logger.warn('reorderTaskFormAction falhou', { orgId, taskId: parsed.data.taskId }, e);
    return;
  }

  revalidateTaskRoutes(orgId);
}

// ---------------------------------------------------------------------------
// aprovarTaskFormAction (fire-and-refresh) — só analista/admin; task deve
// estar em_revisao.
// ---------------------------------------------------------------------------
export async function aprovarTaskFormAction(formData: FormData): Promise<void> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return warnContexto('aprovarTaskFormAction', resolved.error);
  const { access, orgId, ator } = resolved.ctx;

  if (ator === 'cliente') {
    logger.warn('aprovarTaskFormAction: cliente não pode aprovar', { orgId });
    return;
  }

  const parsed = taskIdSchema.safeParse({ taskId: formData.get('taskId') });
  if (!parsed.success) {
    logger.warn('aprovarTaskFormAction: dados inválidos', { orgId });
    return;
  }
  const { taskId } = parsed.data;

  const task = await getTaskById(taskId, orgId);
  if (!task || task.status !== 'em_revisao') {
    logger.warn('aprovarTaskFormAction: task não está em revisão', { orgId, taskId });
    return;
  }

  try {
    await moveTask({ taskId, orgId, ator, actorUserId: access.id, para: 'concluida' });
  } catch (e) {
    logger.warn('aprovarTaskFormAction falhou', { orgId, taskId }, e);
    return;
  }

  await recordTaskActivity({ taskId, userId: access.id, evento: 'aprovada' });
  await recordAudit({ orgId, userId: access.id, acao: 'task.aprovada', detalhes: { taskId } });
  await notifyTaskAprovada(orgId, taskId, task.titulo);

  revalidateTaskRoutes(orgId);
}

// ---------------------------------------------------------------------------
// devolverTaskFormAction (fire-and-refresh) — só analista/admin; task deve
// estar em_revisao; `motivo` opcional vira comentário.
// ---------------------------------------------------------------------------
const devolverSchema = z.object({ taskId: z.string().min(1), motivo: z.string().max(2000).optional() });

export async function devolverTaskFormAction(formData: FormData): Promise<void> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return warnContexto('devolverTaskFormAction', resolved.error);
  const { access, orgId, ator } = resolved.ctx;

  if (ator === 'cliente') {
    logger.warn('devolverTaskFormAction: cliente não pode devolver', { orgId });
    return;
  }

  const parsed = devolverSchema.safeParse({
    taskId: formData.get('taskId'),
    motivo: formData.get('motivo') || undefined,
  });
  if (!parsed.success) {
    logger.warn('devolverTaskFormAction: dados inválidos', { orgId });
    return;
  }
  const { taskId, motivo } = parsed.data;

  const task = await getTaskById(taskId, orgId);
  if (!task || task.status !== 'em_revisao') {
    logger.warn('devolverTaskFormAction: task não está em revisão', { orgId, taskId });
    return;
  }

  try {
    await moveTask({ taskId, orgId, ator, actorUserId: access.id, para: 'em_andamento' });
  } catch (e) {
    logger.warn('devolverTaskFormAction falhou', { orgId, taskId }, e);
    return;
  }

  if (motivo) {
    await addTaskComment({ taskId, orgId, userId: access.id, corpo: motivo });
  }
  await recordTaskActivity({ taskId, userId: access.id, evento: 'devolvida' });
  await recordAudit({ orgId, userId: access.id, acao: 'task.devolvida', detalhes: { taskId, motivo: motivo ?? null } });
  await notifyTaskDevolvida(orgId, taskId, task.titulo);

  revalidateTaskRoutes(orgId);
}

// ---------------------------------------------------------------------------
// addCommentAction (stateful) — notifica o OUTRO lado da conversa.
// ---------------------------------------------------------------------------
const addCommentSchema = z.object({ taskId: z.string().min(1), corpo: z.string().trim().min(1).max(2000) });

export async function addCommentAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return { error: resolved.error };
  const { access, orgId, ator } = resolved.ctx;

  const parsed = addCommentSchema.safeParse({
    taskId: formData.get('taskId'),
    corpo: formData.get('corpo'),
  });
  if (!parsed.success) return { error: 'Escreva um comentário válido (até 2000 caracteres).' };
  const { taskId, corpo } = parsed.data;

  const task = await getTaskById(taskId, orgId);
  if (!task) return { error: 'Tarefa não encontrada.' };

  try {
    await addTaskComment({ taskId, orgId, userId: access.id, corpo });
  } catch (e) {
    if (e instanceof Error && e.message === 'task_nao_encontrada') return { error: 'Tarefa não encontrada.' };
    throw e;
  }

  const autorEhCliente = ator === 'cliente';
  await notifyTaskComentario(orgId, taskId, task.titulo, autorEhCliente);

  revalidateTaskRoutes(orgId);
  return { ok: true, taskId };
}

// ---------------------------------------------------------------------------
// updateTaskAction (stateful) — edição de campos da task.
//
// DIVERGÊNCIA DOCUMENTADA: o brief lista `updateTaskAction` nas interfaces
// produzidas, mas a seção "Regras por action" não detalha suas regras (só
// cobre create/move/concluir/aprovar/devolver/comentar/excluir/checklist).
// Optou-se por restringir a edição a analista/admin — o mesmo padrão de
// `deleteTaskFormAction`/aprovar/devolver — já que o brief não especifica um
// fluxo de edição para o cliente e nenhuma UI referencia essa action para o
// papel cliente (Task 9/10 tratam apenas mover/concluir/comentar/checklist).
// ---------------------------------------------------------------------------
const updateTaskSchema = z.object({
  taskId: z.string().min(1),
  titulo: z.string().trim().min(3).max(200).optional(),
  descricao: z.string().max(5000).optional(),
  tipo: z.enum(TASK_TIPOS).optional(),
  prioridade: z.enum(TASK_PRIORIDADES).optional(),
  prazo: z.union([prazoDate, z.literal('')]).optional(),
  assigneeUserId: z.string().optional(),
});

export async function updateTaskAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return { error: resolved.error };
  const { access, orgId, ator } = resolved.ctx;

  if (ator === 'cliente') return { error: 'Você não tem permissão para editar esta tarefa.' };

  const parsed = updateTaskSchema.safeParse({
    taskId: formData.get('taskId'),
    titulo: formData.get('titulo') || undefined,
    descricao: formData.has('descricao') ? String(formData.get('descricao') ?? '') : undefined,
    tipo: formData.get('tipo') || undefined,
    prioridade: formData.get('prioridade') || undefined,
    prazo: formData.has('prazo') ? String(formData.get('prazo') ?? '') : undefined,
    assigneeUserId: formData.get('assigneeUserId') || undefined,
  });
  if (!parsed.success) return { error: 'Dados inválidos. Confira os campos e tente novamente.' };

  const { taskId, prazo, titulo, descricao, tipo, prioridade, assigneeUserId } = parsed.data;

  try {
    await updateTask({
      taskId,
      orgId,
      actorUserId: access.id,
      patch: {
        ...(titulo !== undefined ? { titulo } : {}),
        ...(descricao !== undefined ? { descricao } : {}),
        ...(tipo !== undefined ? { tipo } : {}),
        ...(prioridade !== undefined ? { prioridade } : {}),
        ...(prazo !== undefined ? { prazo: prazo === '' ? null : prazo } : {}),
        ...(assigneeUserId !== undefined ? { assigneeUserId } : {}),
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'task_nao_encontrada') return { error: 'Tarefa não encontrada.' };
    throw e;
  }

  revalidateTaskRoutes(orgId);
  return { ok: true, taskId };
}

// ---------------------------------------------------------------------------
// deleteTaskFormAction (fire-and-refresh) — só analista/admin.
// ---------------------------------------------------------------------------
export async function deleteTaskFormAction(formData: FormData): Promise<void> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return warnContexto('deleteTaskFormAction', resolved.error);
  const { access, orgId, ator } = resolved.ctx;

  if (ator === 'cliente') {
    logger.warn('deleteTaskFormAction: cliente não pode excluir', { orgId });
    return;
  }

  const parsed = taskIdSchema.safeParse({ taskId: formData.get('taskId') });
  if (!parsed.success) {
    logger.warn('deleteTaskFormAction: dados inválidos', { orgId });
    return;
  }
  const { taskId } = parsed.data;

  const task = await getTaskById(taskId, orgId);
  if (!task) {
    logger.warn('deleteTaskFormAction: task não encontrada', { orgId, taskId });
    return;
  }

  try {
    await deleteTask(taskId, orgId);
  } catch (e) {
    logger.warn('deleteTaskFormAction falhou', { orgId, taskId }, e);
    return;
  }

  await recordAudit({ orgId, userId: access.id, acao: 'task.excluida', detalhes: { titulo: task.titulo } });

  revalidateTaskRoutes(orgId);

  // Exclusão a partir da página de detalhe: a página deixa de existir —
  // redireciona para onde o form mandar. Só paths internos: '//' seria uma
  // URL protocol-relative (host externo) e, no parsing WHATWG, '\' equivale
  // a '/' em http(s) — '/\evil.com' também resolveria externo. Ambos recusados.
  const redirectTo = String(formData.get('redirectTo') ?? '');
  const redirectSeguro =
    redirectTo.startsWith('/') && !redirectTo.startsWith('//') && !redirectTo.includes('\\');
  if (redirectSeguro) redirect(redirectTo);
  if (redirectTo) logger.warn('deleteTaskFormAction: redirectTo recusado', { orgId });
}

// ---------------------------------------------------------------------------
// toggleChecklistItemFormAction (fire-and-refresh)
// ---------------------------------------------------------------------------
const toggleChecklistSchema = z.object({
  taskId: z.string().min(1),
  index: z.coerce.number().int().min(0),
});

export async function toggleChecklistItemFormAction(formData: FormData): Promise<void> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return warnContexto('toggleChecklistItemFormAction', resolved.error);
  const { access, orgId } = resolved.ctx;

  const parsed = toggleChecklistSchema.safeParse({
    taskId: formData.get('taskId'),
    index: formData.get('index'),
  });
  if (!parsed.success) {
    logger.warn('toggleChecklistItemFormAction: dados inválidos', { orgId });
    return;
  }
  const { taskId, index } = parsed.data;

  let mudou = false;
  try {
    mudou = await toggleChecklistItemTx({ taskId, orgId, index, actorUserId: access.id });
  } catch (e) {
    logger.warn('toggleChecklistItemFormAction falhou', { orgId, taskId }, e);
    return;
  }

  // No-op (índice inexistente / linha não-checkbox) não muda nada: não paga o
  // custo de revalidar as rotas de task.
  if (mudou) revalidateTaskRoutes(orgId);
}

// ---------------------------------------------------------------------------
// createTasksFromReportAction (stateful) — converte achados da análise IA
// (gargalos/sugestões/ideias) em tasks, com dedup e escopo por report.
//
// DIVERGÊNCIA DOCUMENTADA: não usa `resolveTaskContext` (que, para
// analista/admin, exige `orgId` no form) — o form desta UI só conhece
// `reportId` (a página de relatório do cliente não expõe orgId). Para
// cliente, o orgId é sempre `access.orgId` da sessão; para analista/admin, o
// orgId é derivado do PRÓPRIO report (carregado por id, sem filtro de org) e
// validado via `assertOrgAccess` antes de qualquer escrita — o mesmo padrão de
// autorização, adaptado à origem do dado.
// ---------------------------------------------------------------------------
const createTasksFromReportItemSchema = z.object({
  fonte: z.enum(FONTES_ANALISE),
  indice: z.number().int().min(0),
  prazo: prazoDate.optional(),
  usarChecklistPlaybook: z.boolean().optional(),
});
const createTasksFromReportSchema = z.object({
  reportId: z.string().min(1),
  itens: z.array(createTasksFromReportItemSchema).max(50),
});

export async function createTasksFromReportAction(
  _prev: TaskActionState & { criadas?: number },
  formData: FormData,
): Promise<TaskActionState & { criadas?: number }> {
  // Guard de impersonação — PRIMEIRA linha. Esta action não passa por
  // resolveTaskContext (bypassa requireActiveOrg de propósito, ver comentário
  // acima), então precisa do mesmo guard explicitamente. Fecha C1 (admin
  // impersonando cria tasks na org do cliente a partir do reportId sozinho).
  await assertNaoImpersonando();
  const access = await requireSession();
  if (access.role === 'client' && access.orgStatus !== 'active') redirect('/aguardando');

  let itensRaw: unknown;
  try {
    itensRaw = JSON.parse(String(formData.get('itens') ?? '[]'));
  } catch {
    return { error: 'Dados inválidos. Tente novamente.' };
  }
  const parsed = createTasksFromReportSchema.safeParse({
    reportId: formData.get('reportId'),
    itens: itensRaw,
  });
  if (!parsed.success) return { error: 'Dados inválidos. Tente novamente.' };
  const { reportId, itens } = parsed.data;

  let orgId: string;
  let ator: TaskAtor;
  if (access.role === 'client') {
    orgId = access.orgId; // cliente NUNCA escolhe a org — sempre a da própria sessão
    ator = 'cliente';
  } else {
    const [rep] = await db
      .select({ org_id: reports.org_id })
      .from(reports)
      .where(eq(reports.id, reportId))
      .limit(1);
    if (!rep) return { error: 'Relatório não encontrado.' };
    try {
      await assertOrgAccess(access, rep.org_id); // analista: só carteira; admin: tudo
    } catch (e) {
      if (e instanceof Error && e.message === 'acesso_negado') {
        return { error: 'Você não tem acesso a este cliente.' };
      }
      throw e;
    }
    orgId = rep.org_id;
    ator = access.role === 'admin_truth' ? 'admin' : 'analista';
  }

  const criadas = await createTasksFromReport({ reportId, orgId, itens, actorUserId: access.id });

  if (criadas > 0) {
    await recordAudit({
      orgId,
      userId: access.id,
      acao: 'task.criadas_de_relatorio',
      detalhes: { reportId, criadas },
    });
    // Gatilho simétrico (Task 10 — G3): analista/admin converteu → avisa o
    // cliente; cliente converteu → avisa o analista (fallback: e-mail admin).
    if (ator !== 'cliente') {
      await notifyTasksDoRelatorio(orgId, reportId, criadas);
    } else {
      await notifyTasksDoRelatorioParaAnalista(orgId, reportId, criadas);
    }
    revalidatePath('/dashboard'); // card "Ação nº 1" (G2) — refresca o jaExiste
    revalidatePath('/dashboard/plano-de-acao');
    revalidatePath(`/dashboard/relatorios/${reportId}`);
    revalidatePath(`/analista/${orgId}`);
  }

  return { ok: true, criadas };
}
