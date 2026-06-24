import { and, between, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { marketSnapshots, orders, trackedProducts } from '@/db/schema';
import type { MarketSnapshotRecord } from '@/db/schema/market-snapshots';
import type { OrderRecord } from '@/db/schema/orders';
import type { TrackedProductRecord } from '@/db/schema/tracked-products';
import type { MarketResult } from '@/modules/market/market.types';
import { MetricasSchema, type Metricas } from '@/modules/pipeline/contracts';
import type { RawOrderItem } from '@/modules/providers/types';
import type { Periodo } from '@/modules/providers/types';

// ---------------------------------------------------------------------------
// Types used internally for pure functions
// ---------------------------------------------------------------------------

export type OrderRow = {
  canal: string;
  /** UTC Date object */
  data: Date;
  /** Drizzle returns numeric as string — already converted to number */
  valor_total: number;
  itens: RawOrderItem[];
};

export type SnapshotRow = {
  fonte: string;
  keyword: string;
  dados: MarketResult;
};

export type ProductRow = {
  nome: string;
  sku: string | null;
  keywords: string[];
  ativo: boolean;
};

// ---------------------------------------------------------------------------
// Pure aggregation functions (no I/O — fully unit-testable)
// ---------------------------------------------------------------------------

/** Sum valor_total and count pedidos per canal. Sorted by total desc, then canal asc for stability. */
export function vendasPorCanal(orders: OrderRow[]): { canal: string; total: number; pedidos: number }[] {
  const map = new Map<string, { total: number; pedidos: number }>();
  for (const o of orders) {
    const cur = map.get(o.canal) ?? { total: 0, pedidos: 0 };
    map.set(o.canal, { total: cur.total + o.valor_total, pedidos: cur.pedidos + 1 });
  }
  return Array.from(map.entries())
    .map(([canal, v]) => ({ canal, total: round2(v.total), pedidos: v.pedidos }))
    .sort((a, b) => b.total - a.total || a.canal.localeCompare(b.canal, 'pt-BR'));
}

/** Group orders by UTC day, sum valor_total per day, sort ascending by date string. */
export function evolucao(orders: OrderRow[]): { data: string; total: number }[] {
  const map = new Map<string, number>();
  for (const o of orders) {
    const day = o.data.toISOString().slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + o.valor_total);
  }
  return Array.from(map.entries())
    .map(([data, total]) => ({ data, total: round2(total) }))
    .sort((a, b) => a.data.localeCompare(b.data, 'pt-BR'));
}

/** Sum valor_total / count orders; 0 if no orders. Rounded to 2 decimals. */
export function ticketMedio(orders: OrderRow[]): number {
  if (orders.length === 0) return 0;
  const sum = orders.reduce((acc, o) => acc + o.valor_total, 0);
  return round2(sum / orders.length);
}

/**
 * Aggregate across all itens: group by sku (fallback to '' when sku missing).
 * Sum quantidade and receita (= quantidade * valor per line item).
 * Sort by receita desc, then by nome asc for stability. Cap at top 10.
 */
export function topProdutos(orders: OrderRow[]): { nome: string; sku: string; quantidade: number; receita: number }[] {
  const map = new Map<string, { nome: string; sku: string; quantidade: number; receita: number }>();

  for (const o of orders) {
    for (const item of o.itens) {
      const sku = item.sku ?? '';
      const key = sku !== '' ? `sku:${sku}` : `nome:${item.nome}`;
      const cur = map.get(key) ?? { nome: item.nome, sku, quantidade: 0, receita: 0 };
      const linhaReceita = item.quantidade * item.valor;
      map.set(key, {
        nome: cur.nome,
        sku: cur.sku,
        quantidade: cur.quantidade + item.quantidade,
        receita: cur.receita + linhaReceita,
      });
    }
  }

  return Array.from(map.values())
    .map((v) => ({ ...v, receita: round2(v.receita) }))
    .sort((a, b) => b.receita - a.receita || a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 10);
}

/**
 * Median of a list of numbers.
 * Empty → 0. Odd list → middle element. Even list → average of two middles.
 */
export function medianaPreco(precos: number[]): number {
  if (precos.length === 0) return 0;
  const sorted = [...precos].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return round2(sorted[mid]);
  }
  return round2((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Computes price positioning per active tracked product (with a sku).
 * - nossoPreco: average unit price (item.valor) of that sku across all order itens; 0 if not sold.
 * - precoMercadoMediano: median of all precos from snapshots whose keyword ∈ product.keywords.
 * - fonte: predominant snapshot fonte for that product (most frequent); '' if no snapshots.
 * Products with no sku are skipped.
 * Products with no market data but with a sku are still emitted (precoMercadoMediano=0, fonte='').
 * Sorted by sku asc for stability.
 */
export function posicaoPreco(
  products: ProductRow[],
  snapshots: SnapshotRow[],
  orderRows: OrderRow[],
): { sku: string; nome: string; nossoPreco: number; precoMercadoMediano: number; fonte: string }[] {
  // Build a map: keyword → snapshots
  const snapshotsByKeyword = new Map<string, SnapshotRow[]>();
  for (const snap of snapshots) {
    const list = snapshotsByKeyword.get(snap.keyword) ?? [];
    list.push(snap);
    snapshotsByKeyword.set(snap.keyword, list);
  }

  // Build a map: sku → unit prices from order itens
  const pricesBySku = new Map<string, number[]>();
  for (const o of orderRows) {
    for (const item of o.itens) {
      if (!item.sku) continue;
      const list = pricesBySku.get(item.sku) ?? [];
      list.push(item.valor);
      pricesBySku.set(item.sku, list);
    }
  }

  const result: { sku: string; nome: string; nossoPreco: number; precoMercadoMediano: number; fonte: string }[] = [];

  for (const p of products) {
    if (!p.ativo) continue;
    if (!p.sku) continue; // skip products without sku

    // nossoPreco = average unit price of sku across order itens
    const unitPrices = pricesBySku.get(p.sku) ?? [];
    const nossoPreco =
      unitPrices.length === 0
        ? 0
        : round2(unitPrices.reduce((acc, v) => acc + v, 0) / unitPrices.length);

    // Collect all precos and fontes from snapshots matching product keywords
    const allPrecos: number[] = [];
    const fonteCount = new Map<string, number>();

    for (const keyword of p.keywords) {
      const snaps = snapshotsByKeyword.get(keyword) ?? [];
      for (const snap of snaps) {
        const precos = Array.isArray(snap.dados?.precos) ? snap.dados.precos : [];
        allPrecos.push(...precos);
        fonteCount.set(snap.fonte, (fonteCount.get(snap.fonte) ?? 0) + 1);
      }
    }

    const precoMercadoMediano = medianaPreco(allPrecos);

    // Predominant fonte: most frequent; tie-break alphabetically asc
    let fonte = '';
    if (fonteCount.size > 0) {
      fonte = Array.from(fonteCount.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0][0];
    }

    result.push({ sku: p.sku, nome: p.nome, nossoPreco, precoMercadoMediano, fonte });
  }

  return result.sort((a, b) => a.sku.localeCompare(b.sku, 'pt-BR'));
}

// ---------------------------------------------------------------------------
// DB orchestration
// ---------------------------------------------------------------------------

export async function computeMetrics(
  orgId: string,
  reportId: string,
  periodo: Periodo,
  benchmarkParcialOverride?: boolean,
): Promise<Metricas> {
  // Load orders for org within the period
  const rawOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.org_id, orgId),
        between(orders.data, periodo.inicio, periodo.fim),
      ),
    );

  // Load market snapshots for this report + org
  const rawSnapshots = await db
    .select()
    .from(marketSnapshots)
    .where(
      and(
        eq(marketSnapshots.org_id, orgId),
        eq(marketSnapshots.report_id, reportId),
      ),
    );

  // Load active tracked products for org
  const rawProducts = await db
    .select()
    .from(trackedProducts)
    .where(and(eq(trackedProducts.org_id, orgId), eq(trackedProducts.ativo, true)));

  // Convert DB rows → typed internal format
  const orderRows: OrderRow[] = rawOrders.map((o: OrderRecord) => ({
    canal: o.canal,
    data: o.data,
    valor_total: Number(o.valor_total),
    itens: (o.itens as RawOrderItem[]) ?? [],
  }));

  const snapshotRows: SnapshotRow[] = rawSnapshots.map((s: MarketSnapshotRecord) => ({
    fonte: s.fonte,
    keyword: s.keyword,
    dados: s.dados as MarketResult,
  }));

  const productRows: ProductRow[] = rawProducts.map((p: TrackedProductRecord) => ({
    nome: p.nome,
    sku: p.sku,
    keywords: p.keywords,
    ativo: p.ativo,
  }));

  // Derive benchmarkParcial
  const benchmarkParcial =
    benchmarkParcialOverride !== undefined
      ? benchmarkParcialOverride
      : rawSnapshots.length === 0;

  // Compose metrics
  const metricas: Metricas = {
    vendasPorCanal: vendasPorCanal(orderRows),
    evolucao: evolucao(orderRows),
    ticketMedio: ticketMedio(orderRows),
    topProdutos: topProdutos(orderRows),
    posicaoPreco: posicaoPreco(productRows, snapshotRows, orderRows),
    benchmarkParcial,
  };

  // Validate before returning — throws on contract drift
  return MetricasSchema.parse(metricas);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
