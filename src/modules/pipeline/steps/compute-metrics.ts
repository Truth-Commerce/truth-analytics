import { and, between, eq, gte, lt, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import { marketSnapshots, orders, reports, trackedProducts } from '@/db/schema';
import type { MarketSnapshotRecord } from '@/db/schema/market-snapshots';
import type { OrderRecord } from '@/db/schema/orders';
import type { TrackedProductRecord } from '@/db/schema/tracked-products';
import type { MarketResult } from '@/modules/market/market.types';
import { MetricasSchema, type Metricas, type ProdutoAbc } from '@/modules/pipeline/contracts';
import { computeTruthScore } from './truth-score';
import type { RawOrderItem } from '@/modules/providers/types';
import type { Periodo } from '@/modules/providers/types';
import type { ErpDataSource } from '@/modules/providers/data.types';
import { legacyBlingSource, orderScope } from '@/modules/orders/order-scope';

// ---------------------------------------------------------------------------
// Types used internally for pure functions
// ---------------------------------------------------------------------------

export type OrderRow = {
  canal: string;
  /** UTC Date object */
  data: Date;
  /** Drizzle returns numeric as string — already converted to number */
  valor_total: number;
  /** Frete do pedido (0 quando ausente — retrocompat com fixtures antigas). */
  frete?: number;
  itens: RawOrderItem[];
};

export type ProdutoAgregado = { nome: string; sku: string; quantidade: number; receita: number };

export type SnapshotRow = {
  fonte: string;
  keyword: string;
  dados: { precos: number[] };
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
 * Sort by receita desc, then by nome asc for stability. Sem cap.
 */
export function agregarProdutos(orders: OrderRow[]): ProdutoAgregado[] {
  const map = new Map<string, ProdutoAgregado>();

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
    .sort((a, b) => b.receita - a.receita || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Top 10 produtos por receita — mesmo comportamento histórico (agregarProdutos + cap). */
export function topProdutos(orders: OrderRow[]): { nome: string; sku: string; quantidade: number; receita: number }[] {
  return agregarProdutos(orders).slice(0, 10);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Curva ABC por receita acumulada: A ≤ 80%, B ≤ 95%, C resto (1º produto sempre A). */
export function curvaAbc(orders: OrderRow[]):
  | { a: ProdutoAbc[]; b: ProdutoAbc[]; c: ProdutoAbc[]; concentracaoTop3Pct: number }
  | undefined {
  const todos = agregarProdutos(orders).filter((p) => p.receita > 0);
  if (todos.length === 0) return undefined;
  const total = todos.reduce((acc, p) => acc + p.receita, 0);
  let acumulado = 0;
  const a: ProdutoAbc[] = [];
  const b: ProdutoAbc[] = [];
  const c: ProdutoAbc[] = [];
  for (const p of todos) {
    acumulado += p.receita;
    const pctAcumulado = round1((acumulado / total) * 100);
    const item: ProdutoAbc = { sku: p.sku, nome: p.nome, receita: p.receita, pctAcumulado };
    if (pctAcumulado <= 80 || a.length === 0) a.push(item);
    else if (pctAcumulado <= 95) b.push(item);
    else c.push(item);
  }
  const top3 = todos.slice(0, 3).reduce((acc, p) => acc + p.receita, 0);
  return { a, b, c, concentracaoTop3Pct: round1((top3 / total) * 100) };
}

const PIORES_LIMITE = 5;

/** Bottom 5 produtos COM venda no período (receita asc — pior primeiro). */
export function pioresProdutos(
  orders: OrderRow[],
): { sku: string; nome: string; receita: number; quantidade: number }[] {
  return agregarProdutos(orders)
    .filter((p) => p.quantidade > 0 && p.receita > 0)
    .slice(-PIORES_LIMITE)
    .reverse()
    .map((p) => ({ sku: p.sku, nome: p.nome, receita: p.receita, quantidade: p.quantidade }));
}

/** Estatísticas de frete (orders.frete — coluna existente, lida pela 1ª vez aqui). */
export function freteStats(orders: OrderRow[]):
  | {
      freteMedio: number;
      pctFreteSobreReceita: number;
      fretePorCanal: { canal: string; freteMedio: number; freteTotal: number }[];
    }
  | undefined {
  if (orders.length === 0) return undefined;
  const totalFrete = orders.reduce((acc, o) => acc + (o.frete ?? 0), 0);
  const receita = orders.reduce((acc, o) => acc + o.valor_total, 0);
  const porCanal = new Map<string, { frete: number; pedidos: number }>();
  for (const o of orders) {
    const cur = porCanal.get(o.canal) ?? { frete: 0, pedidos: 0 };
    porCanal.set(o.canal, { frete: cur.frete + (o.frete ?? 0), pedidos: cur.pedidos + 1 });
  }
  return {
    freteMedio: round2(totalFrete / orders.length),
    pctFreteSobreReceita: receita <= 0 ? 0 : round1((totalFrete / receita) * 100),
    fretePorCanal: Array.from(porCanal.entries())
      .map(([canal, v]) => ({ canal, freteMedio: round2(v.frete / v.pedidos), freteTotal: round2(v.frete) }))
      .sort((x, y) => y.freteTotal - x.freteTotal || x.canal.localeCompare(y.canal, 'pt-BR')),
  };
}

export function unidadesTotais(orders: OrderRow[]): number {
  return orders.reduce((acc, o) => acc + o.itens.reduce((s, i) => s + i.quantidade, 0), 0);
}

export function itensPorPedido(orders: OrderRow[]): number {
  if (orders.length === 0) return 0;
  return round2(unidadesTotais(orders) / orders.length);
}

/** Percentil com interpolação linear (pos = (n-1)*p). Lista deve vir ordenada asc. */
export function percentil(precosOrdenadosAsc: number[], p: number): number {
  if (precosOrdenadosAsc.length === 0) return 0;
  const pos = (precosOrdenadosAsc.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, precosOrdenadosAsc.length - 1);
  const frac = pos - lo;
  return round2(precosOrdenadosAsc[lo] + frac * (precosOrdenadosAsc[hi] - precosOrdenadosAsc[lo]));
}

/**
 * Faixa de preços de mercado por produto monitorado (min/p25/mediana/p75 + fonte
 * predominante). Mesmo matching keyword→snapshots de `posicaoPreco`; produto sem
 * nenhum preço de mercado é OMITIDO.
 */
export function faixaMercado(
  products: ProductRow[],
  snapshots: SnapshotRow[],
): { sku: string; nome: string; min: number; p25: number; mediana: number; p75: number; fonte: string }[] {
  const snapshotsByKeyword = new Map<string, SnapshotRow[]>();
  for (const snap of snapshots) {
    const list = snapshotsByKeyword.get(snap.keyword) ?? [];
    list.push(snap);
    snapshotsByKeyword.set(snap.keyword, list);
  }

  const result: { sku: string; nome: string; min: number; p25: number; mediana: number; p75: number; fonte: string }[] = [];
  for (const p of products) {
    if (!p.ativo || !p.sku) continue;
    const allPrecos: number[] = [];
    const fonteCount = new Map<string, number>();
    for (const keyword of p.keywords) {
      for (const snap of snapshotsByKeyword.get(keyword) ?? []) {
        const precos = Array.isArray(snap.dados?.precos) ? snap.dados.precos : [];
        allPrecos.push(...precos);
        fonteCount.set(snap.fonte, (fonteCount.get(snap.fonte) ?? 0) + 1);
      }
    }
    if (allPrecos.length === 0) continue;
    const sorted = [...allPrecos].sort((x, y) => x - y);
    const fonte = Array.from(fonteCount.entries()).sort(
      (x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'pt-BR'),
    )[0][0];
    result.push({
      sku: p.sku,
      nome: p.nome,
      min: round2(sorted[0]),
      p25: percentil(sorted, 0.25),
      mediana: percentil(sorted, 0.5),
      p75: percentil(sorted, 0.75),
      fonte,
    });
  }
  return result.sort((a, b) => a.sku.localeCompare(b.sku, 'pt-BR'));
}

/** Como `evolucao`, mas com contagem de pedidos por dia (v2, campo opcional). */
export function evolucaoDetalhada(orders: OrderRow[]): { data: string; total: number; pedidos: number }[] {
  const map = new Map<string, { total: number; pedidos: number }>();
  for (const o of orders) {
    const day = o.data.toISOString().slice(0, 10);
    const cur = map.get(day) ?? { total: 0, pedidos: 0 };
    map.set(day, { total: cur.total + o.valor_total, pedidos: cur.pedidos + 1 });
  }
  return Array.from(map.entries())
    .map(([data, v]) => ({ data, total: round2(v.total), pedidos: v.pedidos }))
    .sort((a, b) => a.data.localeCompare(b.data, 'pt-BR'));
}

/** Total por canal em cada dia UTC (base da área empilhada). Canais em ordem alfabética dentro do dia. */
export function canalPorDia(orders: OrderRow[]): { data: string; canais: Record<string, number> }[] {
  const map = new Map<string, Map<string, number>>();
  for (const o of orders) {
    const day = o.data.toISOString().slice(0, 10);
    const canais = map.get(day) ?? new Map<string, number>();
    canais.set(o.canal, (canais.get(o.canal) ?? 0) + o.valor_total);
    map.set(day, canais);
  }
  return Array.from(map.entries())
    .map(([data, canais]) => ({
      data,
      canais: Object.fromEntries(
        Array.from(canais.entries())
          .map(([c, t]) => [c, round2(t)] as const)
          .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')),
      ),
    }))
    .sort((a, b) => a.data.localeCompare(b.data, 'pt-BR'));
}

export const DIA_SEMANA_LABEL = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const ORDEM_COMERCIAL = [1, 2, 3, 4, 5, 6, 0] as const;
const DIA_MS = 86_400_000;

/**
 * Média e total de vendas por dia-da-semana (0=dom..6=sáb, ordem seg→dom).
 * Ocorrências contadas nos dias UTC do período (inclusive) — média honesta
 * mesmo quando um dia-da-semana ocorre mais vezes que outro na janela.
 */
export function porDiaSemana(
  orders: OrderRow[],
  periodo: Periodo,
): { diaSemana: number; label: string; mediaVendas: number; totalVendas: number }[] {
  const inicio = Date.UTC(
    periodo.inicio.getUTCFullYear(),
    periodo.inicio.getUTCMonth(),
    periodo.inicio.getUTCDate(),
  );
  const fim = Date.UTC(periodo.fim.getUTCFullYear(), periodo.fim.getUTCMonth(), periodo.fim.getUTCDate());
  const ocorrencias = new Map<number, number>();
  for (let t = inicio; t <= fim; t += DIA_MS) {
    const dia = new Date(t).getUTCDay();
    ocorrencias.set(dia, (ocorrencias.get(dia) ?? 0) + 1);
  }
  const totais = new Map<number, number>();
  for (const o of orders) {
    const dia = o.data.getUTCDay();
    totais.set(dia, (totais.get(dia) ?? 0) + o.valor_total);
  }
  return ORDEM_COMERCIAL.filter((dia) => (ocorrencias.get(dia) ?? 0) > 0).map((dia) => {
    const totalVendas = round2(totais.get(dia) ?? 0);
    const n = ocorrencias.get(dia) ?? 1;
    return { diaSemana: dia, label: DIA_SEMANA_LABEL[dia], mediaVendas: round2(totalVendas / n), totalVendas };
  });
}

/** Ticket médio por canal (total/pedidos), ordenado por ticket desc. */
export function ticketPorCanal(orders: OrderRow[]): { canal: string; ticket: number }[] {
  const map = new Map<string, { total: number; pedidos: number }>();
  for (const o of orders) {
    const cur = map.get(o.canal) ?? { total: 0, pedidos: 0 };
    map.set(o.canal, { total: cur.total + o.valor_total, pedidos: cur.pedidos + 1 });
  }
  return Array.from(map.entries())
    .map(([canal, v]) => ({ canal, ticket: v.pedidos === 0 ? 0 : round2(v.total / v.pedidos) }))
    .sort((a, b) => b.ticket - a.ticket || a.canal.localeCompare(b.canal, 'pt-BR'));
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
  source: ErpDataSource | string,
  reportId: string,
  periodo: Periodo,
  benchmarkParcialOverride?: boolean,
): Promise<Metricas> {
  source = legacyBlingSource(source);
  // Load orders for org within the period
  const rawOrders = await db
    .select()
    .from(orders)
    .where(
      and(
        orderScope(source),
        between(orders.data, periodo.inicio, periodo.fim),
      ),
    );

  // Load market snapshots for this report + org
  const rawSnapshots = await db
    .select()
    .from(marketSnapshots)
    .where(
      and(
        eq(marketSnapshots.org_id, source.orgId),
        eq(marketSnapshots.report_id, reportId),
      ),
    );

  // Load active tracked products for org
  const rawProducts = await db
    .select()
    .from(trackedProducts)
    .where(and(eq(trackedProducts.org_id, source.orgId), eq(trackedProducts.ativo, true)));

  // Convert DB rows → typed internal format
  const orderRows: OrderRow[] = rawOrders.map((o: OrderRecord) => ({
    canal: o.canal,
    data: o.data,
    valor_total: Number(o.valor_total),
    frete: Number(o.frete),
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

  // Truth Score — total do período anterior (mesma duração, imediatamente antes).
  // G0: fim é 23:59:59.999 → +1ms fecha o dia (duração = N dias exatos) e a
  // janela anterior vira [inicio − N dias, inicio) SEM incluir a fronteira —
  // um pedido exatamente em periodo.inicio pertence só ao período atual.
  const duracaoMs = periodo.fim.getTime() - periodo.inicio.getTime() + 1;
  const inicioAnterior = new Date(periodo.inicio.getTime() - duracaoMs);
  const [temDoneAnterior] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.org_id, source.orgId), eq(reports.status, 'done'), ne(reports.id, reportId)))
    .limit(1);

  let totalPeriodoAnterior: number | null = null;
  if (temDoneAnterior) {
    const anteriores = await db
      .select({ valor_total: orders.valor_total })
      .from(orders)
      .where(
        and(
          orderScope(source),
          gte(orders.data, inicioAnterior),
          lt(orders.data, periodo.inicio),
        ),
      );
    totalPeriodoAnterior =
      Math.round(anteriores.reduce((acc, o) => acc + Number(o.valor_total), 0) * 100) / 100;
  }
  const diasPeriodo = Math.max(1, Math.round(duracaoMs / 86_400_000));

  // Compose metrics
  const vendas = vendasPorCanal(orderRows);
  const evolucaoDias = evolucao(orderRows);
  const posicao = posicaoPreco(productRows, snapshotRows, orderRows);
  const totalPeriodo = Math.round(orderRows.reduce((acc, o) => acc + o.valor_total, 0) * 100) / 100;

  const metricas: Metricas = {
    vendasPorCanal: vendas,
    evolucao: evolucaoDias,
    ticketMedio: ticketMedio(orderRows),
    topProdutos: topProdutos(orderRows),
    posicaoPreco: posicao,
    evolucaoDetalhada: evolucaoDetalhada(orderRows),
    canalPorDia: canalPorDia(orderRows),
    porDiaSemana: porDiaSemana(orderRows, periodo),
    ticketPorCanal: ticketPorCanal(orderRows),
    curvaAbc: curvaAbc(orderRows),
    piores: pioresProdutos(orderRows),
    frete: freteStats(orderRows),
    unidadesTotais: unidadesTotais(orderRows),
    itensPorPedido: itensPorPedido(orderRows),
    faixaMercado: faixaMercado(productRows, snapshotRows),
    truth_score: computeTruthScore({
      totalPeriodo,
      totalPeriodoAnterior,
      vendasPorCanal: vendas,
      evolucao: evolucaoDias,
      posicaoPreco: posicao,
      diasPeriodo,
    }),
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
