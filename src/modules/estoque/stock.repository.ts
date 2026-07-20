import { and, eq, gte, inArray, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders, productStock } from '@/db/schema';
import { JANELA_VELOCIDADE_DIAS } from '@/modules/estoque/stock-coverage';
import type { RawOrderItem, RawStockItem } from '@/modules/providers/types';

const CHUNK = 500;

/**
 * Upsert do snapshot de saldo por (org_id, sku). Itens sem sku são descartados.
 * Duplicatas de sku no mesmo lote são deduplicadas (last-wins) — o Postgres
 * lança 21000 ("cannot affect row a second time") se o mesmo (org_id, sku)
 * aparecer duas vezes num único onConflictDoUpdate.
 */
export async function upsertStock(orgId: string, itens: RawStockItem[]): Promise<number> {
  const comSku = itens.filter((i): i is RawStockItem & { sku: string } => !!i.sku);
  const porSku = new Map<string, RawStockItem & { sku: string }>();
  for (const item of comSku) porSku.set(item.sku, item);
  const validos = [...porSku.values()];
  for (let i = 0; i < validos.length; i += CHUNK) {
    const lote = validos.slice(i, i + CHUNK).map((p) => ({
      org_id: orgId,
      sku: p.sku,
      nome: p.nome.slice(0, 255),
      saldo: String(p.saldo),
    }));
    if (lote.length === 0) continue;
    await db
      .insert(productStock)
      .values(lote)
      .onConflictDoUpdate({
        target: [productStock.org_id, productStock.sku],
        set: {
          nome: sql`excluded.nome`,
          saldo: sql`excluded.saldo`,
          updated_at: sql`now()`,
        },
      });
  }
  return validos.length;
}

/** Snapshot atual da org (saldo numérico). Escopado por org_id. */
export async function getStockRows(
  orgId: string,
): Promise<{ sku: string; nome: string; saldo: number }[]> {
  const rows = await db
    .select({ sku: productStock.sku, nome: productStock.nome, saldo: productStock.saldo })
    .from(productStock)
    .where(eq(productStock.org_id, orgId));
  return rows.map((r) => ({ sku: r.sku, nome: r.nome, saldo: Number(r.saldo) }));
}

/**
 * Unidades vendidas por sku nos últimos 30 dias (até `agora`), a partir de
 * orders.itens (jsonb iterado em JS — mesmo padrão de getUltimaVendaPorSku).
 * Escopado por org_id.
 */
export async function getVendas30dPorSku(orgId: string, agora: Date): Promise<Map<string, number>> {
  const desde = new Date(agora.getTime() - JANELA_VELOCIDADE_DIAS * 86_400_000);
  const rows = await db
    .select({ itens: orders.itens })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), gte(orders.data, desde)));

  const mapa = new Map<string, number>();
  for (const o of rows) {
    for (const item of (o.itens as RawOrderItem[]) ?? []) {
      if (!item.sku) continue;
      mapa.set(item.sku, (mapa.get(item.sku) ?? 0) + Number(item.quantidade ?? 0));
    }
  }
  return mapa;
}

/**
 * Snapshot atual de VÁRIAS orgs, em UMA query (IN orgIds) — versão batched de
 * `getStockRows`, usada por agregações cross-org (ex.: `carteiraResumo` em
 * carteira-data.repository.ts, admin_truth escopo = todas as orgs cliente).
 * Mesmas linhas/campos de `getStockRows`, só agrupadas por orgId em JS.
 */
export async function getStockRowsBatch(
  orgIds: string[],
): Promise<Map<string, { sku: string; nome: string; saldo: number }[]>> {
  if (orgIds.length === 0) return new Map();
  const rows = await db
    .select({
      orgId: productStock.org_id,
      sku: productStock.sku,
      nome: productStock.nome,
      saldo: productStock.saldo,
    })
    .from(productStock)
    .where(inArray(productStock.org_id, orgIds));

  const map = new Map<string, { sku: string; nome: string; saldo: number }[]>();
  for (const r of rows) {
    const arr = map.get(r.orgId) ?? [];
    arr.push({ sku: r.sku, nome: r.nome, saldo: Number(r.saldo) });
    map.set(r.orgId, arr);
  }
  return map;
}

/**
 * Vendas 30d por sku de VÁRIAS orgs, em UMA query (IN orgIds) — versão
 * batched de `getVendas30dPorSku` (mesma janela `JANELA_VELOCIDADE_DIAS`),
 * usada pelo mesmo cenário cross-org de `getStockRowsBatch`.
 */
export async function getVendas30dPorSkuBatch(
  orgIds: string[],
  agora: Date,
): Promise<Map<string, Map<string, number>>> {
  if (orgIds.length === 0) return new Map();
  const desde = new Date(agora.getTime() - JANELA_VELOCIDADE_DIAS * 86_400_000);
  const rows = await db
    .select({ orgId: orders.org_id, itens: orders.itens })
    .from(orders)
    .where(and(inArray(orders.org_id, orgIds), gte(orders.data, desde)));

  const map = new Map<string, Map<string, number>>();
  for (const o of rows) {
    const mapa = map.get(o.orgId) ?? new Map<string, number>();
    for (const item of (o.itens as RawOrderItem[]) ?? []) {
      if (!item.sku) continue;
      mapa.set(item.sku, (mapa.get(item.sku) ?? 0) + Number(item.quantidade ?? 0));
    }
    map.set(o.orgId, mapa);
  }
  return map;
}
