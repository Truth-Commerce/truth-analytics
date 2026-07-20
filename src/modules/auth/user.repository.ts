import { and, asc, count, desc, eq, ilike, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import type { OrgStatus, Plano, UserAccess, UserRole } from '@/modules/auth/user.types';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getUserByEmail(
  email: string,
): Promise<{ id: string; email: string; senha_hash: string } | null> {
  const normalized = normalizeEmail(email);
  const [row] = await db
    .select({ id: users.id, email: users.email, senha_hash: users.senha_hash })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  return row ?? null;
}

export async function getUserAccessById(userId: string): Promise<UserAccess | null> {
  const [row] = await db
    .select({
      id: users.id,
      orgId: users.org_id,
      role: users.role,
      orgStatus: organizations.status,
      plano: organizations.plano,
    })
    .from(users)
    .innerJoin(organizations, eq(users.org_id, organizations.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    role: row.role as UserRole,
    orgStatus: row.orgStatus as OrgStatus,
    plano: (row.plano as Plano | null) ?? null,
  };
}

export async function createOrgWithUser(input: {
  orgName: string;
  email: string;
  senha: string;
}): Promise<{ orgId: string; userId: string }> {
  const email = normalizeEmail(input.email);

  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error('email_em_uso');
  }

  const senha_hash = await hashPassword(input.senha);

  return db.transaction(async (tx) => {
    try {
      const [org] = await tx
        .insert(organizations)
        .values({ name: input.orgName, status: 'pending' })
        .returning({ id: organizations.id });

      const [user] = await tx
        .insert(users)
        .values({ org_id: org.id, email, senha_hash, role: 'client', aceitou_termos_em: new Date() })
        .returning({ id: users.id });

      return { orgId: org.id, userId: user.id };
    } catch (e: unknown) {
      if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
        throw new Error('email_em_uso');
      }
      throw e;
    }
  });
}

/**
 * Credenciais do usuário por id (para a troca de senha autenticada — precisa
 * do hash atual para o verifyPassword). Não normaliza e-mail: id é a chave.
 */
export async function getUserAuthById(
  userId: string,
): Promise<{ id: string; email: string; senha_hash: string } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, senha_hash: users.senha_hash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function setUserPasswordHash(userId: string, senha_hash: string): Promise<void> {
  await db.update(users).set({ senha_hash }).where(eq(users.id, userId));
}

export const MAX_USERS_CLIENT_POR_ORG = 3;

export async function listOrgUsers(
  orgId: string,
): Promise<Array<{ id: string; email: string; role: string; created_at: Date }>> {
  return db
    .select({ id: users.id, email: users.email, role: users.role, created_at: users.created_at })
    .from(users)
    .where(eq(users.org_id, orgId))
    .orderBy(asc(users.created_at), asc(users.id));
}

/**
 * Cria um usuário adicional role='client' na org (fluxo do admin Truth).
 * Lança 'email_em_uso' (inclusive na corrida via unique 23505) e
 * 'limite_usuarios' (MAX_USERS_CLIENT_POR_ORG).
 */
export async function createOrgClientUser(input: {
  orgId: string;
  email: string;
  senha: string;
}): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);

  const existing = await getUserByEmail(email);
  if (existing) throw new Error('email_em_uso');

  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.org_id, input.orgId), eq(users.role, 'client')));
  if (Number(n) >= MAX_USERS_CLIENT_POR_ORG) throw new Error('limite_usuarios');

  const senha_hash = await hashPassword(input.senha);
  try {
    const [user] = await db
      .insert(users)
      .values({ org_id: input.orgId, email, senha_hash, role: 'client' })
      .returning({ id: users.id });
    return { userId: user.id };
  } catch (e: unknown) {
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
      throw new Error('email_em_uso');
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Gestão de contas cross-org do admin (H4 T11) — /admin/usuarios.
// ---------------------------------------------------------------------------

const ROLES_CRIAVEIS_VIA_UI = new Set<UserRole>(['client', 'analista']);

/**
 * Cria um usuário em QUALQUER org (client ou analista) — fluxo do
 * /admin/usuarios. `role` é `string` (não `'client' | 'analista'`) de
 * propósito: o valor chega de FormData sem garantia de tipo, e a validação
 * abaixo é a barreira server-side que barra 'admin_truth' (ou qualquer outro
 * valor) mesmo que a UI/zod da action falhem — 'admin_truth' NUNCA pode ser
 * criado por este caminho. Role 'client' reaproveita `createOrgClientUser`
 * (mesma checagem de limite por org); 'analista' não tem limite de contagem.
 */
export async function createUserInOrg(input: {
  orgId: string;
  email: string;
  role: string;
  senha: string;
}): Promise<{ userId: string }> {
  if (!ROLES_CRIAVEIS_VIA_UI.has(input.role as UserRole)) {
    throw new Error('role_invalida');
  }
  if (input.role === 'client') {
    return createOrgClientUser({ orgId: input.orgId, email: input.email, senha: input.senha });
  }

  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);
  if (existing) throw new Error('email_em_uso');

  const senha_hash = await hashPassword(input.senha);
  try {
    const [user] = await db
      .insert(users)
      .values({ org_id: input.orgId, email, senha_hash, role: 'analista' })
      .returning({ id: users.id });
    return { userId: user.id };
  } catch (e: unknown) {
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
      throw new Error('email_em_uso');
    }
    throw e;
  }
}

export type UserListRow = {
  id: string;
  email: string;
  role: UserRole;
  orgId: string;
  orgName: string;
  createdAt: Date;
};

export const USERS_PAGE_SIZE = 20;

/**
 * Lista cross-org de usuários (client + analista + admin_truth) com busca por
 * substring de e-mail OU nome da org, paginada. Sem escopo por org — a tela é
 * exclusiva de admin_truth (requireAdmin no caller), que já enxerga tudo.
 */
export async function listUsersPage(params: {
  q?: string;
  page: number;
}): Promise<{ items: UserListRow[]; total: number; pageCount: number }> {
  const termo = params.q?.trim();
  const where = termo
    ? or(ilike(users.email, `%${termo}%`), ilike(organizations.name, `%${termo}%`))
    : undefined;

  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .innerJoin(organizations, eq(users.org_id, organizations.id))
    .where(where);

  const total = Number(n);
  const pageCount = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const page = Math.min(Math.max(1, params.page), pageCount);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      orgId: organizations.id,
      orgName: organizations.name,
      createdAt: users.created_at,
    })
    .from(users)
    .innerJoin(organizations, eq(users.org_id, organizations.id))
    .where(where)
    .orderBy(desc(users.created_at), asc(users.id))
    .limit(USERS_PAGE_SIZE)
    .offset((page - 1) * USERS_PAGE_SIZE);

  return {
    items: rows.map((r) => ({ ...r, role: r.role as UserRole })),
    total,
    pageCount,
  };
}

/** Usuário + org (para montar o link de reset e para o audit da tela de contas). */
export async function getUserWithOrgById(
  userId: string,
): Promise<{ id: string; email: string; orgId: string; role: UserRole } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, orgId: users.org_id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return { ...row, role: row.role as UserRole };
}
