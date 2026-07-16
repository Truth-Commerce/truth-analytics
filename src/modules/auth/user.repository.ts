import { eq } from 'drizzle-orm';

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
        .values({ org_id: org.id, email, senha_hash, role: 'client' })
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
