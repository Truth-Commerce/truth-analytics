import { and, desc, eq, isNull, ne, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { cycles, tasks } from '@/db/schema';
import { burndown, type PontoBurndown } from './burndown';
import { getTaskImpact } from './task-impact';
import { retrospectiva, type Retrospectiva } from './retrospectiva';
import type { TaskCriadoPor, TaskPrioridade, TaskStatus, TaskSummary, TaskTipo } from './task.types';

export type CycleStatus = 'planejado' | 'ativo' | 'fechado';

export type Cycle = {
  id: string;
  orgId: string;
  nome: string;
  inicio: string | null;
  fim: string | null;
  status: CycleStatus;
  createdAt: Date;
};

type CycleRow = typeof cycles.$inferSelect;

function rowToCycle(r: CycleRow): Cycle {
  return {
    id: r.id,
    orgId: r.org_id,
    nome: r.nome,
    inicio: r.inicio,
    fim: r.fim,
    status: r.status as CycleStatus,
    createdAt: r.created_at,
  };
}

type TaskRow = typeof tasks.$inferSelect;

function rowToSummary(r: TaskRow): TaskSummary {
  return {
    id: r.id,
    titulo: r.titulo,
    tipo: r.tipo as TaskTipo,
    prioridade: r.prioridade as TaskPrioridade,
    status: r.status as TaskStatus,
    prazo: r.prazo,
    criadoPor: r.criado_por as TaskCriadoPor,
    reportId: r.report_id,
    ordem: r.ordem,
    createdAt: r.created_at,
  };
}

/** Cria um ciclo (sprint) de uma org — status inicial 'planejado' (default da tabela). */
export async function criarCiclo(
  orgId: string,
  input: { nome: string; inicio?: string | null; fim?: string | null },
): Promise<string> {
  const [row] = await db
    .insert(cycles)
    .values({ org_id: orgId, nome: input.nome, inicio: input.inicio ?? null, fim: input.fim ?? null })
    .returning({ id: cycles.id });
  return row!.id;
}

/** Todos os ciclos da org, mais recente primeiro. */
export async function listCiclos(orgId: string): Promise<Cycle[]> {
  const rows = await db.select().from(cycles).where(eq(cycles.org_id, orgId)).orderBy(desc(cycles.created_at));
  return rows.map(rowToCycle);
}

/** Ciclo com status='ativo' da org (null se nenhum). */
export async function getCicloAtivo(orgId: string): Promise<Cycle | null> {
  const [row] = await db
    .select()
    .from(cycles)
    .where(and(eq(cycles.org_id, orgId), eq(cycles.status, 'ativo')))
    .orderBy(desc(cycles.created_at))
    .limit(1);
  return row ? rowToCycle(row) : null;
}

/**
 * Move (ou remove, `cycleId=null`) uma task para um ciclo — org-scoped nos
 * DOIS lados: a task precisa pertencer a `orgId` e, quando `cycleId` não é
 * null, o ciclo TAMBÉM precisa pertencer a `orgId`. Task ou ciclo de outra
 * org lançam (sem vazamento cross-org, sem update silencioso no vácuo).
 */
export async function moverTaskParaCiclo(taskId: string, orgId: string, cycleId: string | null): Promise<void> {
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgId)))
    .limit(1);
  if (!task) throw new Error('task_nao_encontrada');

  if (cycleId !== null) {
    const [cycle] = await db
      .select({ id: cycles.id })
      .from(cycles)
      .where(and(eq(cycles.id, cycleId), eq(cycles.org_id, orgId)))
      .limit(1);
    if (!cycle) throw new Error('ciclo_nao_encontrado');
  }

  await db.update(tasks).set({ cycle_id: cycleId }).where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgId)));
}

/**
 * Fecha um ciclo (status -> 'fechado'), org-scoped. Lança se o ciclo não for
 * da org.
 *
 * F4 (revisão H5/T11) tentou resolver "tasks de ciclo fechado ficam presas
 * pra sempre" limpando `cycle_id` das tasks não concluídas AQUI. Isso
 * quebrou a retrospectiva (achado no re-review, F1): `retrospectivaDoCiclo`
 * deriva `planejadas` E `concluidas` de `tasksDoCiclo` (filtra por
 * `cycle_id`) — depois de fechar, só as CONCLUÍDAS continuavam com o
 * `cycle_id`, então `planejadas === concluidas` sempre, e todo ciclo fechado
 * reportava "100%" independentemente do que foi de fato entregue.
 *
 * Fix (F1, re-review): `fecharCiclo` volta a ser só a transição de status —
 * NENHUMA task é tocada, o histórico do ciclo (tasksDoCiclo) fica intacto
 * pra sempre, e a retrospectiva volta a ser truthful. O problema original
 * (tasks presas) é resolvido do outro lado: `tasksSemCiclo` (abaixo) agora
 * também devolve tasks de ciclos FECHADOS, não só `cycle_id IS NULL` — elas
 * reaparecem no pool e podem entrar num ciclo novo, sem que isso mexa no
 * `cycle_id` original (o vínculo histórico com o ciclo fechado continua
 * existindo até o dia em que a task for de fato movida para outro ciclo).
 */
export async function fecharCiclo(orgId: string, cycleId: string): Promise<void> {
  const [row] = await db
    .update(cycles)
    .set({ status: 'fechado' })
    .where(and(eq(cycles.id, cycleId), eq(cycles.org_id, orgId)))
    .returning({ id: cycles.id });
  if (!row) throw new Error('ciclo_nao_encontrado');
}

/**
 * Ativa um ciclo (status 'planejado' -> 'ativo') — a única transição que
 * falta pro fluxo "criar (planejado) -> ativar -> fechar" (T8 entregou
 * criarCiclo/fecharCiclo, mas nenhuma função levava um ciclo a 'ativo').
 * Org-scoped como fecharCiclo (`ciclo_nao_encontrado` se não for da org) E
 * restrita à origem 'planejado' (`transicao_invalida` se já 'ativo' —
 * evita reativar sem necessidade — ou 'fechado' — um ciclo fechado não
 * reabre).
 *
 * H5/T10 (fix de corrida, achado na revisão do T9): o SELECT abaixo só serve
 * pra distinguir `ciclo_nao_encontrado` (org errada/id inexistente) —
 * ele NÃO decide mais o resultado sozinho. Quem decide `transicao_invalida`
 * é o UPDATE, cujo WHERE inclui `status = 'planejado'`: com isso, duas
 * chamadas concorrentes na MESMA cycleId não passam as duas pelo mesmo
 * "cheque então escreve" — o Postgres serializa via lock de linha, a
 * segunda só reavalia o WHERE depois do commit da primeira e, já vendo
 * status='ativo', atualiza 0 linhas. `RETURNING` decide o resultado real.
 */
export async function ativarCiclo(orgId: string, cycleId: string): Promise<void> {
  const [existente] = await db
    .select({ id: cycles.id })
    .from(cycles)
    .where(and(eq(cycles.id, cycleId), eq(cycles.org_id, orgId)))
    .limit(1);
  if (!existente) throw new Error('ciclo_nao_encontrado');

  const [ativado] = await db
    .update(cycles)
    .set({ status: 'ativo' })
    .where(and(eq(cycles.id, cycleId), eq(cycles.org_id, orgId), eq(cycles.status, 'planejado')))
    .returning({ id: cycles.id });
  if (!ativado) throw new Error('transicao_invalida');

  // F5 (revisão H5/T11): nada aqui demovia o ciclo ATIVO anterior — ativar um
  // segundo ciclo deixava dois 'ativo' na mesma org simultaneamente, o que
  // confunde `getCicloAtivo` (devolve só o mais recente, escondendo o outro)
  // e a UI (qual é "o" ciclo corrente?). Fix: fecha (via `fecharCiclo` — reusa
  // o MESMO efeito colateral do F4: tasks não concluídas do ciclo demovido
  // voltam pro pool) qualquer OUTRO ciclo 'ativo' da org — normalmente no
  // máximo um, mas o loop cobre defensivamente um estado pré-fix com vários.
  const outrosAtivos = await db
    .select({ id: cycles.id })
    .from(cycles)
    .where(and(eq(cycles.org_id, orgId), eq(cycles.status, 'ativo'), ne(cycles.id, cycleId)));
  for (const outro of outrosAtivos) {
    await fecharCiclo(orgId, outro.id);
  }
}

/** Tasks de um ciclo, org-scoped (filtra por `org_id` E `cycle_id`). */
export async function tasksDoCiclo(orgId: string, cycleId: string): Promise<TaskSummary[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), eq(tasks.cycle_id, cycleId)))
    .orderBy(tasks.ordem);
  return rows.map(rowToSummary);
}

/**
 * Tasks da org disponíveis pra entrar num ciclo (H5/T9) — o "pool":
 * `cycle_id IS NULL` OU o ciclo a que a task pertence já está FECHADO.
 *
 * F4 (revisão H5/T11) resolvia "tasks de ciclo fechado ficam presas pra
 * sempre" limpando `cycle_id` em `fecharCiclo`. F1 (re-review) reverteu isso
 * — quebrava `retrospectivaDoCiclo` (ver `fecharCiclo`). O problema original
 * do F4 continua resolvido AQUI: em vez de depender de `cycle_id IS NULL`,
 * um LEFT JOIN com `cycles` também aceita tasks cujo ciclo (ainda vinculado
 * via `cycle_id`) tem `status = 'fechado'` — elas reaparecem no pool e podem
 * ser movidas pra um ciclo novo (via `moverTaskParaCiclo`) sem que o fechar
 * do ciclo precise tocar em nenhuma task. Não inclui tasks de um ciclo ainda
 * 'planejado'/'ativo' — mover diretamente de um ciclo aberto pra outro não é
 * um caso de uso desta UI (o fluxo é sempre pool -> ciclo ativo, ciclo -> pool
 * via `moverTaskParaCiclo(..., null)`, ou ciclo FECHADO -> pool via este fix).
 */
export async function tasksSemCiclo(orgId: string): Promise<TaskSummary[]> {
  const rows = await db
    .select({ task: tasks })
    .from(tasks)
    .leftJoin(cycles, eq(tasks.cycle_id, cycles.id))
    .where(and(eq(tasks.org_id, orgId), or(isNull(tasks.cycle_id), eq(cycles.status, 'fechado'))))
    .orderBy(tasks.status, tasks.ordem);
  return rows.map(({ task }) => rowToSummary(task));
}

/**
 * Pontos de burndown do ciclo (H5/T9): busca `status`+`updated_at` de todas
 * as tasks do ciclo e delega a série pra `burndown()` (pura, testada
 * isoladamente em tests/unit/burndown.test.ts). Ciclo sem `inicio`/`fim`
 * definidos (ainda 'planejado' sem datas) ou de outra org devolve `[]` — não
 * lança: a UI trata isso como "sem burndown pra mostrar ainda", não como erro.
 */
export async function burndownDoCiclo(orgId: string, cycleId: string): Promise<PontoBurndown[]> {
  const [cycle] = await db
    .select({ inicio: cycles.inicio, fim: cycles.fim })
    .from(cycles)
    .where(and(eq(cycles.id, cycleId), eq(cycles.org_id, orgId)))
    .limit(1);
  if (!cycle || !cycle.inicio || !cycle.fim) return [];

  const rows = await db
    .select({ status: tasks.status, updated_at: tasks.updated_at })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), eq(tasks.cycle_id, cycleId)));

  return burndown(
    rows.map((r) => ({ status: r.status as TaskStatus, updated_at: r.updated_at })),
    cycle.inicio,
    cycle.fim,
  );
}

/**
 * Retrospectiva do ciclo: `planejadas` = total de tasks do ciclo;
 * `concluidas` = as com status 'concluida'; `impactoBRL` = soma do motor F2
 * (`getTaskImpact` — `totalAtual - totalOrigem`) nas tasks concluídas com
 * impacto calculável (task sem relatório done posterior, sem métricas
 * válidas etc. → `null` → conta 0, não interrompe a soma). A soma é feita
 * AQUI, no repo (único lugar com acesso a I/O); `retrospectiva()` é pura e só
 * formata o pacote final.
 */
export async function retrospectivaDoCiclo(orgId: string, cycleId: string): Promise<Retrospectiva> {
  const tasksCiclo = await tasksDoCiclo(orgId, cycleId);
  const concluidas = tasksCiclo.filter((t) => t.status === 'concluida');

  let impactoBRL = 0;
  for (const task of concluidas) {
    const impacto = await getTaskImpact(task.id, orgId);
    if (impacto) impactoBRL += impacto.totalAtual - impacto.totalOrigem;
  }

  return retrospectiva(tasksCiclo.length, concluidas.length, impactoBRL);
}
