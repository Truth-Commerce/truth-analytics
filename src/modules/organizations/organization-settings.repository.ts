import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations } from '@/db/schema';

export async function setGeracaoAutomatica(orgId: string, ativa: boolean): Promise<void> {
  await db.update(organizations).set({ geracao_automatica: ativa }).where(eq(organizations.id, orgId));
}

export async function getOrgSettings(
  orgId: string,
): Promise<{ geracaoAutomatica: boolean; metaMensal: number | null } | null> {
  const [row] = await db
    .select({ geracao_automatica: organizations.geracao_automatica, meta_mensal: organizations.meta_mensal })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) return null;
  return {
    geracaoAutomatica: row.geracao_automatica,
    metaMensal: row.meta_mensal === null ? null : Number(row.meta_mensal),
  };
}
