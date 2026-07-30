import { and, between, desc, eq, gte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders, organizations, reports, trackedProducts } from '@/db/schema';
import type { Metricas } from '@/modules/pipeline/contracts';
import type { RawOrderItem } from '@/modules/providers/types';
import type { ErpDataSource } from '@/modules/providers/data.types';
import { legacyBlingSource, orderScope } from '@/modules/orders/order-scope';

/**
 * Orgs `active` com pelo menos um relatório `done` criado nos últimos `dias`
 * dias. Só essas orgs entram na verificação de alertas.
 */
export async function listOrgsComRelatorioRecente(dias: number, agora: Date): Promise<string[]> {
  const corte = new Date(agora.getTime() - dias * 86_400_000);
  const rows = await db
    .selectDistinct({ orgId: reports.org_id })
    .from(reports)
    .innerJoin(organizations, eq(organizations.id, reports.org_id))
    .where(
      and(
        eq(reports.status, 'done'),
        gte(reports.created_at, corte),
        eq(organizations.status, 'active'),
      ),
    );
  return rows.map((r) => r.orgId);
}

/**
 * Total (R$) dos últimos 7 dias + totais das 4 semanas anteriores (buckets de
 * 7 dias, mais recente primeiro). Escopado por org_id.
 */
export async function getTotaisSemanais(
  source: ErpDataSource | string,
  agora: Date,
): Promise<{ total7dias: number; totaisSemanasAnteriores: number[] }> {
  source = legacyBlingSource(source);
  const inicio = new Date(agora.getTime() - 35 * 86_400_000);
  const rows = await db
    .select({ data: orders.data, valor_total: orders.valor_total })
    .from(orders)
    .where(and(orderScope(source), between(orders.data, inicio, agora)));

  const buckets = [0, 0, 0, 0, 0]; // 0 = últimos 7d; 1..4 = semanas anteriores
  for (const o of rows) {
    const idade = Math.floor((agora.getTime() - o.data.getTime()) / (7 * 86_400_000));
    if (idade >= 0 && idade < 5) buckets[idade] += Number(o.valor_total);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { total7dias: r2(buckets[0]), totaisSemanasAnteriores: buckets.slice(1).map(r2) };
}

/**
 * `posicaoPreco` do último relatório `done` da org ([] se não houver).
 * Escopado por org_id.
 */
export async function getPosicaoPrecoUltimoDone(
  orgId: string,
): Promise<Metricas['posicaoPreco']> {
  const [row] = await db
    .select({ metricas: reports.metricas })
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done')))
    .orderBy(desc(reports.created_at))
    .limit(1);
  const m = row?.metricas as Metricas | null | undefined;
  return m?.posicaoPreco ?? [];
}

/**
 * Última data de venda por sku dos produtos monitorados ativos, na janela
 * [agora - diasHistorico, agora]. Escopado por org_id (produtos e pedidos).
 */
export async function getUltimaVendaPorSku(
  source: ErpDataSource | string,
  diasHistorico: number,
  agora: Date,
): Promise<{ produtos: { sku: string; nome: string }[]; ultimaVendaPorSku: Map<string, Date> }> {
  source = legacyBlingSource(source);
  const produtosRows = await db
    .select({ sku: trackedProducts.sku, nome: trackedProducts.nome })
    .from(trackedProducts)
    .where(and(eq(trackedProducts.org_id, source.orgId), eq(trackedProducts.ativo, true)));
  const produtos = produtosRows.filter(
    (p): p is { sku: string; nome: string } => p.sku !== null,
  );
  if (produtos.length === 0) return { produtos: [], ultimaVendaPorSku: new Map() };

  const desde = new Date(agora.getTime() - diasHistorico * 86_400_000);
  const orderRows = await db
    .select({ data: orders.data, itens: orders.itens })
    .from(orders)
    .where(and(orderScope(source), gte(orders.data, desde)));

  const skus = new Set(produtos.map((p) => p.sku));
  const ultimaVendaPorSku = new Map<string, Date>();
  for (const o of orderRows) {
    for (const item of (o.itens as RawOrderItem[]) ?? []) {
      if (!item.sku || !skus.has(item.sku)) continue;
      const atual = ultimaVendaPorSku.get(item.sku);
      if (!atual || o.data > atual) ultimaVendaPorSku.set(item.sku, o.data);
    }
  }
  return { produtos, ultimaVendaPorSku };
}

/**
 * Data do pedido mais recente da org (MAX(orders.data)) — o "agora efetivo"
 * das janelas dos detectores. Null = org sem nenhum pedido.
 */
export async function getUltimaDataPedido(source: ErpDataSource | string): Promise<Date | null> {
  source = legacyBlingSource(source);
  const [row] = await db
    .select({ ultima: sql<Date | string | null>`max(${orders.data})` })
    .from(orders)
    .where(orderScope(source));
  return row?.ultima ? new Date(row.ultima) : null;
}
