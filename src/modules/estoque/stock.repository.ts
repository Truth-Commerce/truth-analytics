import { and, eq, gte, sql } from 'drizzle-orm';

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
