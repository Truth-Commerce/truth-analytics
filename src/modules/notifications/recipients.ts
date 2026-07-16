import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, users } from '@/db/schema';
import { serverEnv } from '@/lib/env';

/**
 * Retorna o e-mail primário do cliente de uma organização.
 * Prefere usuários com role 'client'. Com múltiplos usuários, o primário é o
 * mais antigo (created_at, id) — determinístico.
 * Retorna null se a org não tiver nenhum usuário.
 */
export async function getOrgPrimaryEmail(orgId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.org_id, orgId), eq(users.role, 'client')))
    .orderBy(asc(users.created_at), asc(users.id))
    .limit(1);

  return row?.email ?? null;
}

/**
 * Retorna o e-mail de alerta admin (para notificações internas de falha de pipeline).
 * Prioridade: ADMIN_ALERT_EMAIL → EMAIL_FROM → null.
 */
export function getAdminAlertEmail(): string | null {
  return serverEnv.ADMIN_ALERT_EMAIL ?? serverEnv.EMAIL_FROM ?? null;
}

/**
 * Retorna o usuário cliente primário de uma organização (id + e-mail).
 * Prefere usuários com role 'client'. Com múltiplos usuários, o primário é o
 * mais antigo (created_at, id) — determinístico.
 * Retorna null se a org não tiver nenhum usuário com esse role.
 */
export async function getOrgPrimaryUser(orgId: string): Promise<{ id: string; email: string } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.org_id, orgId), eq(users.role, 'client')))
    .orderBy(asc(users.created_at), asc(users.id))
    .limit(1);

  return row ?? null;
}

/**
 * Retorna o analista responsável por uma organização (id + e-mail), via
 * `organizations.analista_id → users`. Retorna null se a org não existir ou
 * não tiver analista atribuído.
 */
export async function getOrgAnalistaUser(orgId: string): Promise<{ id: string; email: string } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email })
    .from(organizations)
    .innerJoin(users, eq(users.id, organizations.analista_id))
    .where(eq(organizations.id, orgId))
    .limit(1);

  return row ?? null;
}
