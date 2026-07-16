import { and, eq, gte, lt, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders, organizations } from '@/db/schema';
import { fimDeDiaUtc, hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';

export async function setGeracaoAutomatica(orgId: string, ativa: boolean): Promise<void> {
  await db.update(organizations).set({ geracao_automatica: ativa }).where(eq(organizations.id, orgId));
}

export async function setMetaMensal(orgId: string, meta: number | null): Promise<void> {
  await db
    .update(organizations)
    .set({ meta_mensal: meta === null ? null : meta.toFixed(2) })
    .where(eq(organizations.id, orgId));
}

/**
 * Soma de orders.valor_total do mês corrente — SUM() NO BANCO (antes puxava
 * todas as linhas e somava em JS). Mês corrente decidido pelo calendário
 * America/Sao_Paulo (G0): fronteiras dos dias codificadas em UTC, mesma
 * convenção de orders.data (data pura do Bling = meia-noite UTC).
 */
export async function getTotalVendasMesCorrente(orgId: string, agora: Date = new Date()): Promise<number> {
  const hoje = hojeBrt(agora);
  const inicioMes = inicioDeDiaUtc(`${hoje.slice(0, 7)}-01`);
  const fimHoje = fimDeDiaUtc(hoje);
  const [row] = await db
    .select({ total: sql<string | null>`coalesce(sum(${orders.valor_total}), '0')` })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), gte(orders.data, inicioMes), lte(orders.data, fimHoje)));
  return Math.round(Number(row?.total ?? 0) * 100) / 100;
}

/**
 * Soma de orders.valor_total do mês ANTERIOR fechado — mesma convenção do
 * corrente (SUM() no banco; mês decidido pelo calendário America/Sao_Paulo,
 * fronteiras codificadas em UTC): [1º dia do mês anterior 00:00Z, 1º dia do
 * mês corrente 00:00Z).
 */
export async function getTotalVendasMesAnterior(orgId: string, agora: Date = new Date()): Promise<number> {
  const hoje = hojeBrt(agora);
  const inicioMesAtual = inicioDeDiaUtc(`${hoje.slice(0, 7)}-01`);
  const inicioMesAnterior = new Date(
    Date.UTC(inicioMesAtual.getUTCFullYear(), inicioMesAtual.getUTCMonth() - 1, 1),
  );
  const [row] = await db
    .select({ total: sql<string | null>`coalesce(sum(${orders.valor_total}), '0')` })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), gte(orders.data, inicioMesAnterior), lt(orders.data, inicioMesAtual)));
  return Math.round(Number(row?.total ?? 0) * 100) / 100;
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
