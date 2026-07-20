import { hojeBrt } from '@/lib/timezone';

import type { ProgressoEpico } from './hierarquia';
import { statusPrazo } from './sla';
import type { TaskPrioridade, TaskStatus } from './task.types';

// ---------------------------------------------------------------------------
// filtrarTasks — board turbinado (H5/T6). Módulo PURO (sem I/O): recebe as
// tasks já carregadas (ex.: TaskCardInfo) e devolve o subconjunto filtrado.
// Todo filtro é opcional e combina em AND — omitir a chave = não restringe.
// ---------------------------------------------------------------------------
export type BoardFiltros = {
  responsavel?: string;
  prioridade?: TaskPrioridade;
  label?: string;
  epicoId?: string;
  texto?: string;
};

type FiltravelTask = {
  id: string;
  titulo: string;
  prioridade: TaskPrioridade;
  labels: string[];
  parentId: string | null;
  assigneeUserId: string | null;
};

/**
 * Combina os filtros em AND (task precisa satisfazer TODOS os informados):
 * - texto: substring case-insensitive no título.
 * - label: `labels` da task inclui o valor.
 * - epicoId: task É o épico (id === epicoId) OU é filha direta dele
 *   (parentId === epicoId) — não recursa em netas (subtasks de uma task-filha).
 * - responsavel: match exato com assigneeUserId (task sem responsável só bate
 *   se o próprio filtro pedir null via string vazia? não — comparação é
 *   sempre exata contra o valor informado).
 * - prioridade: match exato.
 */
export function filtrarTasks<T extends FiltravelTask>(tasks: T[], filtros: BoardFiltros): T[] {
  return tasks.filter((t) => {
    if (filtros.responsavel !== undefined && t.assigneeUserId !== filtros.responsavel) return false;
    if (filtros.prioridade !== undefined && t.prioridade !== filtros.prioridade) return false;
    if (filtros.label !== undefined && !t.labels.includes(filtros.label)) return false;
    if (filtros.epicoId !== undefined && t.parentId !== filtros.epicoId && t.id !== filtros.epicoId) return false;
    if (filtros.texto !== undefined && !t.titulo.toLowerCase().includes(filtros.texto.toLowerCase())) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// agruparSwimlanes — raias horizontais do board, cortando os status.
// ---------------------------------------------------------------------------
export type SwimlanePor = 'nenhum' | 'epico' | 'responsavel';

export type Swimlane<T> = { chave: string; label: string; tasks: T[] };

type AgrupavelTask = { id: string; titulo: string; parentId: string | null; assigneeUserId: string | null };

/** Chave da raia "sem épico" (task raiz — épico ou task solta — sem parentId). */
export const SEM_EPICO = 'sem-epico';
/** Chave da raia "sem responsável" (assigneeUserId nulo). */
export const SEM_RESPONSAVEL = 'sem-responsavel';

/**
 * Agrupa as tasks em raias (swimlanes):
 * - 'nenhum': uma única raia com todas as tasks, na ordem recebida (board
 *   "clássico" sem raias — é o modo default do board).
 * - 'epico': agrupa por `parentId`. O rótulo da raia é o título do próprio
 *   épico, resolvido a partir do MESMO array de entrada (o board carrega
 *   épicos + tasks + subtasks juntos) — se o épico não estiver no array
 *   (não deveria acontecer dentro de uma org, mas por segurança), cai no
 *   próprio id como rótulo.
 * - 'responsavel': agrupa por `assigneeUserId`. O rótulo é o próprio id (o
 *   módulo não tem acesso a nomes/e-mails — quem chama resolve o rótulo
 *   bonito, ex. a partir da lista de usuários da org).
 *
 * Em ambos os modos agrupados, tasks sem o campo (`parentId`/`assigneeUserId`
 * nulos) caem num balde "sem X" que vai SEMPRE por último — as demais raias
 * mantêm a ordem de 1ª aparição no array de entrada. Dentro de cada raia, a
 * ordem relativa das tasks é preservada (particionamento estável).
 */
export function agruparSwimlanes<T extends AgrupavelTask>(tasks: T[], por: SwimlanePor): Swimlane<T>[] {
  if (por === 'nenhum') {
    return [{ chave: 'todas', label: 'Todas', tasks: [...tasks] }];
  }

  const semChave = por === 'epico' ? SEM_EPICO : SEM_RESPONSAVEL;
  const semLabel = por === 'epico' ? 'Sem épico' : 'Sem responsável';
  const titulosPorId = por === 'epico' ? new Map(tasks.map((t) => [t.id, t.titulo])) : null;

  const ordemChaves: string[] = [];
  const grupos = new Map<string, T[]>();
  for (const t of tasks) {
    const valor = por === 'epico' ? t.parentId : t.assigneeUserId;
    const chave = valor ?? semChave;
    if (!grupos.has(chave)) {
      ordemChaves.push(chave);
      grupos.set(chave, []);
    }
    grupos.get(chave)!.push(t);
  }

  // "Sem X" sempre por último, independente de quando apareceu no array.
  const ordemFinal = ordemChaves.includes(semChave)
    ? [...ordemChaves.filter((c) => c !== semChave), semChave]
    : ordemChaves;

  return ordemFinal.map((chave) => ({
    chave,
    label: chave === semChave ? semLabel : (titulosPorId?.get(chave) ?? chave),
    tasks: grupos.get(chave)!,
  }));
}

// ---------------------------------------------------------------------------
// slaBadge — badge compacto de SLA pro card do board (reusa statusPrazo).
// ---------------------------------------------------------------------------
export type SlaBadgeStatus = 'ok' | 'vence' | 'atrasada';

/**
 * Badge de SLA de uma task pro card do board: 'atrasada' (prazo no passado),
 * 'vence' (vence em breve — inclui hoje), 'ok' (sem prazo, prazo confortável,
 * ou task concluída). Mesma convenção usada em TaskCard/TaskDetail: o prazo
 * de uma task concluída nunca conta (ela nunca aparece atrasada/vencendo).
 */
export function slaBadge(task: { status: TaskStatus; prazo: string | null }, hoje: string = hojeBrt()): SlaBadgeStatus {
  const prazoEfetivo = task.status === 'concluida' ? null : task.prazo;
  const sp = statusPrazo(prazoEfetivo, hoje);
  if (sp === 'atrasada') return 'atrasada';
  if (sp === 'vence_em_breve') return 'vence';
  return 'ok';
}

// ---------------------------------------------------------------------------
// progressoEpicoLabel — rótulo compacto do card de épico no board (H5/T10).
// Puro: só formata o que `progressoEpico`/`progressoDeEpicos` já agregam
// (batch no repo, sem N+1 — ver task.repository.listTasksKanban).
// ---------------------------------------------------------------------------
export function progressoEpicoLabel(progresso: ProgressoEpico): string {
  return `${progresso.concluidas}/${progresso.total}`;
}
