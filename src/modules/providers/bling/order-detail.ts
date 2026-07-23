import { serverEnv } from '@/lib/env';
import { fetchBling } from '@/modules/providers/bling/http';
import type { RawOrderItem } from '@/modules/providers/types';

type BlingItemPayload = {
  codigo?: string | null;
  descricao?: string | null;
  quantidade?: number | string | null;
  valor?: number | string | null;
};

type BlingDetalhePayload = {
  itens?: BlingItemPayload[] | null;
  transporte?: { frete?: number | string | null } | null;
  taxas?: { taxaComissao?: number | string | null } | null;
  loja?: { id?: number | string | null } | null;
};

type BlingDetalheResponse = {
  data?: BlingDetalhePayload | null;
};

export type OrderDetail = {
  itens: RawOrderItem[];
  frete: number;
  /** taxas.taxaComissao — o que o marketplace retém. Chega em reais, não em %. */
  comissao: number;
  /** loja.id, para resolver o canal quando a listagem não foi a origem da linha. */
  canalId?: string;
};

/** Número tolerante a string/null do Bling; nunca devolve NaN. */
function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapItem(item: BlingItemPayload): RawOrderItem {
  return {
    sku: item.codigo ? String(item.codigo) : undefined,
    nome: item.descricao ? String(item.descricao) : '',
    quantidade: num(item.quantidade),
    valor: num(item.valor),
  };
}

/**
 * Detalhe de UM pedido (GET /pedidos/vendas/{id}).
 *
 * A listagem `/pedidos/vendas` **não** traz `itens`, `transporte.frete` nem
 * `taxas.taxaComissao` — só o detalhe traz. Era essa a causa dos 694 pedidos
 * gravados com zero itens e frete zerado. Custa 1 requisição por pedido, por
 * isso o enriquecimento roda fora do caminho síncrono do pipeline.
 *
 * Erros propagam (o chamador decide) — `fetchBling` já faz backoff de 429/5xx.
 */
export async function fetchOrderDetail(
  blingOrderId: string,
  token: string,
): Promise<OrderDetail> {
  const url = `${serverEnv.BLING_API_BASE}/pedidos/vendas/${encodeURIComponent(blingOrderId)}`;
  const res = await fetchBling(url, token);

  let body: BlingDetalheResponse;
  try {
    body = (await res.json()) as BlingDetalheResponse;
  } catch {
    throw new Error('bling_indisponivel');
  }

  const d = body.data;
  if (!d) throw new Error('bling_detalhe_vazio');

  const canalId = d.loja?.id;
  return {
    itens: (d.itens ?? []).map(mapItem),
    frete: num(d.transporte?.frete),
    comissao: num(d.taxas?.taxaComissao),
    canalId: canalId === null || canalId === undefined ? undefined : String(canalId),
  };
}
