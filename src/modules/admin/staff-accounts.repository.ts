import { and, asc, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { auditLog, organizations, users } from '@/db/schema';
import type { OrgStatus, Plano, UserRole } from '@/modules/auth/user.types';

export const CONTAS_PAGE_SIZE = 20;

const PAPEIS_EQUIPE: readonly UserRole[] = ['admin_truth', 'analista'];

export type EquipeListRow = {
  id: string;
  email: string;
  role: UserRole;
  orgId: string;
  orgName: string;
  /** Organizações em que este usuário é o analista responsável. */
  carteira: number;
  naOrgInterna: boolean;
  createdAt: Date;
};

export type ClienteListRow = {
  id: string;
  email: string;
  orgId: string;
  orgName: string;
  orgStatus: OrgStatus;
  plano: Plano | null;
  createdAt: Date;
};

type Paginacao = { q?: string; page: number };

function paginar(total: number, page: number): { page: number; pageCount: number; offset: number } {
  const pageCount = Math.max(1, Math.ceil(total / CONTAS_PAGE_SIZE));
  const atual = Math.min(Math.max(1, page), pageCount);
  return { page: atual, pageCount, offset: (atual - 1) * CONTAS_PAGE_SIZE };
}

/**
 * Equipe interna da Truth (analistas + admins). A org interna é inferida do
 * próprio dado — é a organização que abriga admin_truth — para que a coluna
 * "está na org interna?" não dependa de quem está logado.
 */
export async function listEquipePage(
  params: Paginacao,
): Promise<{ items: EquipeListRow[]; total: number; pageCount: number }> {
  const termo = params.q?.trim();
  const where = termo
    ? and(inArray(users.role, [...PAPEIS_EQUIPE]), ilike(users.email, `%${termo}%`))
    : inArray(users.role, [...PAPEIS_EQUIPE]);

  const [{ n }] = await db.select({ n: count() }).from(users).where(where);
  const total = Number(n);
  const { pageCount, offset } = paginar(total, params.page);

  const orgsInternas = await db
    .selectDistinct({ orgId: users.org_id })
    .from(users)
    .where(eq(users.role, 'admin_truth'));
  const idsInternos = new Set(orgsInternas.map((o) => o.orgId));

  const carteiraPorAnalista = sql<number>`(
    select count(*) from ${organizations}
    where ${organizations.analista_id} = ${users.id}
  )`;

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      orgId: organizations.id,
      orgName: organizations.name,
      carteira: carteiraPorAnalista,
      createdAt: users.created_at,
    })
    .from(users)
    .innerJoin(organizations, eq(users.org_id, organizations.id))
    .where(where)
    .orderBy(asc(users.role), asc(users.email))
    .limit(CONTAS_PAGE_SIZE)
    .offset(offset);

  return {
    items: rows.map((r) => ({
      ...r,
      role: r.role as UserRole,
      carteira: Number(r.carteira),
      naOrgInterna: idsInternos.has(r.orgId),
    })),
    total,
    pageCount,
  };
}

/** Contas de acesso dos clientes (role client), com a situação da empresa. */
export async function listClientesPage(
  params: Paginacao,
): Promise<{ items: ClienteListRow[]; total: number; pageCount: number }> {
  const termo = params.q?.trim();
  const filtroBusca = termo
    ? or(ilike(users.email, `%${termo}%`), ilike(organizations.name, `%${termo}%`))
    : undefined;
  const where = and(eq(users.role, 'client'), filtroBusca);

  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .innerJoin(organizations, eq(users.org_id, organizations.id))
    .where(where);
  const total = Number(n);
  const { pageCount, offset } = paginar(total, params.page);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      orgId: organizations.id,
      orgName: organizations.name,
      orgStatus: organizations.status,
      plano: organizations.plano,
      createdAt: users.created_at,
    })
    .from(users)
    .innerJoin(organizations, eq(users.org_id, organizations.id))
    .where(where)
    .orderBy(asc(organizations.name), desc(users.created_at))
    .limit(CONTAS_PAGE_SIZE)
    .offset(offset);

  return {
    items: rows.map((r) => ({
      ...r,
      orgStatus: r.orgStatus as OrgStatus,
      plano: (r.plano as Plano | null) ?? null,
    })),
    total,
    pageCount,
  };
}

export async function contarAdmins(): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(eq(users.role, 'admin_truth'));
  return Number(n);
}

export async function contarCarteira(userId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(organizations)
    .where(eq(organizations.analista_id, userId));
  return Number(n);
}

/**
 * Troca o papel (e, quando pedido, a organização) numa transação só, com a
 * trilha de auditoria escrita junto. A decisão de PODER trocar é do
 * `avaliarTrocaDePapel` — aqui só se executa o que já foi autorizado.
 */
export async function aplicarTrocaDePapel(input: {
  userId: string;
  novoPapel: UserRole;
  moverParaOrgId: string | null;
  actorUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ role: users.role, orgId: users.org_id })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!antes) throw new Error('usuario_nao_encontrado');

    const orgFinal = input.moverParaOrgId ?? antes.orgId;
    await tx
      .update(users)
      .set({ role: input.novoPapel, org_id: orgFinal })
      .where(eq(users.id, input.userId));

    await tx.insert(auditLog).values({
      org_id: orgFinal,
      user_id: input.actorUserId,
      acao: 'user.papel_alterado',
      detalhes: {
        targetUserId: input.userId,
        de: antes.role,
        para: input.novoPapel,
        orgAnterior: antes.orgId,
      },
    });
  });
}

/** Move um usuário da equipe para a organização interna, auditando a mudança. */
export async function moverUsuarioParaOrg(input: {
  userId: string;
  orgId: string;
  actorUserId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [antes] = await tx
      .select({ orgId: users.org_id })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!antes) throw new Error('usuario_nao_encontrado');
    if (antes.orgId === input.orgId) return;

    await tx.update(users).set({ org_id: input.orgId }).where(eq(users.id, input.userId));

    await tx.insert(auditLog).values({
      org_id: input.orgId,
      user_id: input.actorUserId,
      acao: 'user.org_alterada',
      detalhes: { targetUserId: input.userId, orgAnterior: antes.orgId, orgNova: input.orgId },
    });
  });
}
