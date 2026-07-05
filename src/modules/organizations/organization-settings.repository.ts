import { and, between, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders, organizations } from '@/db/schema';

export async function setGeracaoAutomatica(orgId: string, ativa: boolean): Promise<void> {
  await db.update(organizations).set({ geracao_automatica: ativa }).where(eq(organizations.id, orgId));
}

export async function setMetaMensal(orgId: string, meta: number | null): Promise<void> {
  await db
    .update(organizations)
    .set({ meta_mensal: meta === null ? null : meta.toFixed(2) })
    .where(eq(organizations.id, orgId));
}

/** Soma de orders.valor_total do mês corrente (UTC — consistente com `evolucao`). */
export async function getTotalVendasMesCorrente(orgId: string, agora: Date = new Date()): Promise<number> {
  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const rows = await db
    .select({ valor_total: orders.valor_total })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), between(orders.data, inicioMes, agora)));
  return Math.round(rows.reduce((acc, o) => acc + Number(o.valor_total), 0) * 100) / 100;
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
