import { and, count, eq, gte, inArray, isNotNull, lt, lte, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, taskActivities, tasks, users } from '@/db/schema';
import { hojeBrt } from '@/lib/timezone';
import { listClientOrganizations } from '@/modules/admin/admin.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import type { UserAccess } from '@/modules/auth/user.types';
import { somarDias } from '@/modules/tasks/sla';
import type {
  TaskCriadoPor,
  TaskPrioridade,
  TaskStatus,
  TaskSummary,
  TaskTipo,
} from '@/modules/tasks/task.types';

export async function assertOrgAccess(access: UserAccess, orgId: string): Promise<void> {
  if (access.role === 'admin_truth') return;
  if (access.role !== 'analista') throw new Error('acesso_negado');
  const [row] = await db
    .select({ analista_id: organizations.analista_id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row || row.analista_id !== access.id) throw new Error('acesso_negado');
}

export async function listAnalistas(): Promise<Array<{ id: string; email: string }>> {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.role, 'analista'));
}

export async function setOrgAnalista(input: {
  orgId: string;
  analistaUserId: string | null;
  actorUserId: string;
}): Promise<void> {
  if (input.analistaUserId) {
    const [alvo] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, input.analistaUserId))
      .limit(1);
    if (!alvo || alvo.role !== 'analista') throw new Error('analista_invalido');
  }
  await db
    .update(organizations)
    .set({ analista_id: input.analistaUserId })
    .where(eq(organizations.id, input.orgId));
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.analista_atribuido',
    detalhes: { analistaUserId: input.analistaUserId },
  });
}

// ---------------------------------------------------------------------------
// Painel do analista (Task 11) — carteira por org e fila de revisão.
//
// Escopo: admin_truth vê todas as orgs cliente (`listClientOrganizations`);
// analista vê só as orgs onde `organizations.analista_id = access.id`. Nunca
// confiar em `access.orgId` aqui — o escopo é sempre derivado do papel.
// ---------------------------------------------------------------------------

export type CarteiraOrg = {
  orgId: string;
  orgName: string;
  counts: Record<TaskStatus, number>;
  atrasadas: number;
  emRevisao: number;
};

const zeroCounts = (): Record<TaskStatus, number> => ({
  backlog: 0,
  todo: 0,
  em_andamento: 0,
  em_revisao: 0,
  concluida: 0,
});

/**
 * Carteira por org, em 2 queries agregadas no TOTAL (GROUP BY) — o antigo
 * `Promise.all` fazia 2 queries POR org (N+1 da auditoria). Atrasadas contam
 * contra hoje BRT (o antigo `CURRENT_DATE` era o dia UTC do banco). Retorno
 * ORDENADO por criticidade: atrasadas desc → emRevisao desc → orgName asc.
 */
export async function getCarteira(access: UserAccess): Promise<CarteiraOrg[]> {
  const orgs =
    access.role === 'admin_truth'
      ? (await listClientOrganizations()).map((o) => ({ id: o.id, name: o.name }))
      : await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.analista_id, access.id));
  if (orgs.length === 0) return [];
  const orgIds = orgs.map((o) => o.id);
  const hoje = hojeBrt();

  const [countsRows, atrasadasRows] = await Promise.all([
    db
      .select({ orgId: tasks.org_id, status: tasks.status, n: count() })
      .from(tasks)
      .where(inArray(tasks.org_id, orgIds))
      .groupBy(tasks.org_id, tasks.status),
    db
      .select({ orgId: tasks.org_id, n: count() })
      .from(tasks)
      .where(and(inArray(tasks.org_id, orgIds), lt(tasks.prazo, hoje), ne(tasks.status, 'concluida')))
      .groupBy(tasks.org_id),
  ]);

  const countsMap = new Map<string, Record<TaskStatus, number>>();
  for (const r of countsRows) {
    const base = countsMap.get(r.orgId) ?? zeroCounts();
    base[r.status as TaskStatus] = Number(r.n);
    countsMap.set(r.orgId, base);
  }
  const atrasadasMap = new Map(atrasadasRows.map((r) => [r.orgId, Number(r.n)]));

  return orgs
    .map((org) => {
      const counts = countsMap.get(org.id) ?? zeroCounts();
      return {
        orgId: org.id,
        orgName: org.name,
        counts,
        atrasadas: atrasadasMap.get(org.id) ?? 0,
        emRevisao: counts.em_revisao,
      };
    })
    .sort(
      (a, b) =>
        b.atrasadas - a.atrasadas || b.emRevisao - a.emRevisao || a.orgName.localeCompare(b.orgName, 'pt-BR'),
    );
}

// ---------------------------------------------------------------------------
// "Meu dia" (G3 Task 6) — faixa consolidada cross-org da carteira.
// ---------------------------------------------------------------------------

export const VENCEM_JANELA_DIAS = 7;
export const SEM_ATIVIDADE_DIAS = 14;
export const MEU_DIA_LIMITE = 50;

export type MeuDiaItem = {
  taskId: string;
  orgId: string;
  orgName: string;
  titulo: string;
  prazo: string | null;
  status: TaskStatus;
  updatedAt: Date;
};

export type MeuDia = {
  atrasadas: MeuDiaItem[];
  vencem7d: MeuDiaItem[];
  emRevisao: MeuDiaItem[];
  semAtividade14d: MeuDiaItem[];
};

const CAMPOS_MEU_DIA = {
  taskId: tasks.id,
  orgId: organizations.id,
  orgName: organizations.name,
  titulo: tasks.titulo,
  prazo: tasks.prazo,
  status: tasks.status,
  updatedAt: tasks.updated_at,
};

/** Faixa "Meu dia": 4 listas cross-org da carteira, cada uma numa query agregada. */
export async function getMeuDia(access: UserAccess, agora: Date = new Date()): Promise<MeuDia> {
  const escopoOrg =
    access.role === 'admin_truth' ? undefined : eq(organizations.analista_id, access.id);
  const hoje = hojeBrt(agora);
  const fimJanela = somarDias(hoje, VENCEM_JANELA_DIAS);
  const corteAtividade = new Date(agora.getTime() - SEM_ATIVIDADE_DIAS * 86_400_000);
  const abertas = inArray(tasks.status, ['backlog', 'todo', 'em_andamento']);

  function consulta(cond: ReturnType<typeof and>, ordem: 'prazo' | 'updated') {
    return db
      .select(CAMPOS_MEU_DIA)
      .from(tasks)
      .innerJoin(organizations, eq(tasks.org_id, organizations.id))
      .where(escopoOrg ? and(cond, escopoOrg) : cond)
      .orderBy(ordem === 'prazo' ? tasks.prazo : tasks.updated_at)
      .limit(MEU_DIA_LIMITE);
  }

  const [atrasadas, vencem7d, emRevisao, semAtividade14d] = await Promise.all([
    consulta(and(ne(tasks.status, 'concluida'), lt(tasks.prazo, hoje)), 'prazo'),
    consulta(and(ne(tasks.status, 'concluida'), gte(tasks.prazo, hoje), lte(tasks.prazo, fimJanela)), 'prazo'),
    consulta(eq(tasks.status, 'em_revisao'), 'updated'),
    consulta(and(abertas, lt(tasks.updated_at, corteAtividade)), 'updated'),
  ]);

  const mapear = (rows: typeof atrasadas): MeuDiaItem[] =>
    rows.map((r) => ({ ...r, status: r.status as TaskStatus }));
  return {
    atrasadas: mapear(atrasadas),
    vencem7d: mapear(vencem7d),
    emRevisao: mapear(emRevisao),
    semAtividade14d: mapear(semAtividade14d),
  };
}

export async function listTasksEmRevisao(
  access: UserAccess,
): Promise<Array<TaskSummary & { orgId: string; orgName: string; updatedAt: Date }>> {
  const condicaoStatus = eq(tasks.status, 'em_revisao');
  const escopo =
    access.role === 'admin_truth' ? condicaoStatus : and(condicaoStatus, eq(organizations.analista_id, access.id));

  const rows = await db
    .select({
      id: tasks.id,
      titulo: tasks.titulo,
      tipo: tasks.tipo,
      prioridade: tasks.prioridade,
      status: tasks.status,
      prazo: tasks.prazo,
      criado_por: tasks.criado_por,
      report_id: tasks.report_id,
      ordem: tasks.ordem,
      created_at: tasks.created_at,
      updated_at: tasks.updated_at,
      orgId: organizations.id,
      orgName: organizations.name,
    })
    .from(tasks)
    .innerJoin(organizations, eq(tasks.org_id, organizations.id))
    .where(escopo)
    .orderBy(tasks.updated_at);

  return rows.map((r) => ({
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
    updatedAt: r.updated_at,
    orgId: r.orgId,
    orgName: r.orgName,
  }));
}

// ---------------------------------------------------------------------------
// Métricas da consultoria (Task 12) — painel admin. Métricas são GLOBAIS
// (todo o banco compartilhado), não escopadas por org — usadas só na UI
// admin/consultoria.
// ---------------------------------------------------------------------------

const TASKS_ABERTAS_STATUS: TaskStatus[] = ['backlog', 'todo', 'em_andamento', 'em_revisao'];

export type ConsultoriaMetrics = {
  concluidas7d: number;
  concluidas30d: number;
  tempoMedioConclusaoDias: number | null;
  porAnalista: Array<{ analistaId: string; email: string; orgs: number; abertas: number; concluidas30d: number }>;
};

async function contarConcluidasDesde(desde: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${taskActivities.task_id})::int` })
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.evento, 'status'),
        eq(taskActivities.para, 'concluida'),
        gte(taskActivities.created_at, desde),
      ),
    );
  return Number(row?.n ?? 0);
}

async function tempoMedioConclusaoDias(): Promise<number | null> {
  const [row] = await db
    .select({
      media: sql<string | null>`avg(extract(epoch from (${taskActivities.created_at} - ${tasks.created_at})) / 86400)`,
    })
    .from(taskActivities)
    .innerJoin(tasks, eq(taskActivities.task_id, tasks.id))
    .where(and(eq(taskActivities.evento, 'status'), eq(taskActivities.para, 'concluida')));
  return row?.media != null ? Number(row.media) : null;
}

export async function getConsultoriaMetrics(): Promise<ConsultoriaMetrics> {
  const agora = Date.now();
  const desde7d = new Date(agora - 7 * 24 * 60 * 60 * 1000);
  const desde30d = new Date(agora - 30 * 24 * 60 * 60 * 1000);

  const [concluidas7d, concluidas30d, tempoMedio, analistas] = await Promise.all([
    contarConcluidasDesde(desde7d),
    contarConcluidasDesde(desde30d),
    tempoMedioConclusaoDias(),
    listAnalistas(),
  ]);

  const [orgsRows, abertasRows, concluidasRows] = await Promise.all([
    db
      .select({ analistaId: organizations.analista_id, n: sql<number>`count(*)::int` })
      .from(organizations)
      .where(isNotNull(organizations.analista_id))
      .groupBy(organizations.analista_id),
    db
      .select({ analistaId: organizations.analista_id, n: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(organizations, eq(tasks.org_id, organizations.id))
      .where(and(isNotNull(organizations.analista_id), inArray(tasks.status, TASKS_ABERTAS_STATUS)))
      .groupBy(organizations.analista_id),
    db
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
          gte(taskActivities.created_at, desde30d),
        ),
      )
      .groupBy(organizations.analista_id),
  ]);

  const orgsMap = new Map(orgsRows.map((r) => [r.analistaId, Number(r.n)]));
  const abertasMap = new Map(abertasRows.map((r) => [r.analistaId, Number(r.n)]));
  const concluidasMap = new Map(concluidasRows.map((r) => [r.analistaId, Number(r.n)]));

  const porAnalista = analistas.map((a) => ({
    analistaId: a.id,
    email: a.email,
    orgs: orgsMap.get(a.id) ?? 0,
    abertas: abertasMap.get(a.id) ?? 0,
    concluidas30d: concluidasMap.get(a.id) ?? 0,
  }));

  return { concluidas7d, concluidas30d, tempoMedioConclusaoDias: tempoMedio, porAnalista };
}
