import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { users } from '@/db/schema';
import { serverEnv } from '@/lib/env';

/**
 * Retorna o e-mail primário do cliente de uma organização.
 * Prefere usuários com role 'client'; MVP = 1 usuário por org.
 * Retorna null se a org não tiver nenhum usuário.
 */
export async function getOrgPrimaryEmail(orgId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.org_id, orgId), eq(users.role, 'client')))
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
