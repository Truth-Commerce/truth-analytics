import { and, asc, gte, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { inicioJanela, type PedidoRow } from '@/modules/desempenho/desempenho-anual';
import { orderScope } from '@/modules/orders/order-scope';
import type { ErpDataSource } from '@/modules/providers/data.types';
import type { RawOrderItem } from '@/modules/providers/types';

const MESES_JANELA = 12;

/** Pedidos dos últimos 12 meses do ERP ativo — colunas mínimas para a agregação pura. */
export async function getPedidos12Meses(source: ErpDataSource, agora: Date): Promise<PedidoRow[]> {
  const rows = await db
    .select({ data: orders.data, valor_total: orders.valor_total, frete: orders.frete, comissao: orders.comissao, canal: orders.canal, itens: orders.itens })
    .from(orders)
    .where(and(orderScope(source), gte(orders.data, inicioJanela(agora, MESES_JANELA))))
    .orderBy(asc(orders.data));
  return rows.map((r) => ({
    data: r.data,
    valor_total: r.valor_total,
    frete: r.frete ?? '0',
    comissao: r.comissao ?? '0',
    canal: r.canal,
    itens: (r.itens ?? []) as RawOrderItem[],
  }));
}

export type CoberturaHistorico = { desde: Date | null; pendentesEnriquecimento: number };

/** Desde quando há histórico e quantos pedidos ainda aguardam enriquecimento (frete/comissão zerados). */
export async function getCoberturaHistorico(source: ErpDataSource): Promise<CoberturaHistorico> {
  const [minRow] = await db
    .select({ desde: sql<Date | null>`min(${orders.data})` })
    .from(orders)
    .where(orderScope(source));
  const [pendRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(orderScope(source), isNull(orders.enriquecido_em)));
  return {
    desde: minRow?.desde ? new Date(minRow.desde) : null,
    pendentesEnriquecimento: pendRow?.n ?? 0,
  };
}
