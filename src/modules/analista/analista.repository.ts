import { and, count, eq, lt, ne, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, tasks, users } from '@/db/schema';
import { listClientOrganizations } from '@/modules/admin/admin.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import type { UserAccess } from '@/modules/auth/user.types';
import { countTasksByStatus } from '@/modules/tasks/task.repository';
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

async function countTasksAtrasadas(orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), lt(tasks.prazo, sql`CURRENT_DATE`), ne(tasks.status, 'concluida')));
  return Number(row?.n ?? 0);
}

export type CarteiraOrg = {
  orgId: string;
  orgName: string;
  counts: Record<TaskStatus, number>;
  atrasadas: number;
  emRevisao: number;
};

export async function getCarteira(access: UserAccess): Promise<CarteiraOrg[]> {
  const orgs =
    access.role === 'admin_truth'
      ? (await listClientOrganizations()).map((o) => ({ id: o.id, name: o.name }))
      : await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.analista_id, access.id));

  return Promise.all(
    orgs.map(async (org) => {
      const [counts, atrasadas] = await Promise.all([
        countTasksByStatus(org.id),
        countTasksAtrasadas(org.id),
      ]);
      return { orgId: org.id, orgName: org.name, counts, atrasadas, emRevisao: counts.em_revisao };
    }),
  );
}

export async function listTasksEmRevisao(
  access: UserAccess,
): Promise<Array<TaskSummary & { orgId: string; orgName: string }>> {
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
    orgId: r.orgId,
    orgName: r.orgName,
  }));
}
