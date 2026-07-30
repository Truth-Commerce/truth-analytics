import { serverEnv } from '@/lib/env';
import { fetchCanaisVenda } from '@/modules/providers/bling/canais';
import { fetchBling } from '@/modules/providers/bling/http';
import type { OrderDetailRequestContext, RawOrderDetail, RawOrderItem } from '@/modules/providers/data.types';

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

/** @deprecated Consumers must use the provider-neutral overload with orgId. */
export type LegacyOrderDetail = Omit<RawOrderDetail, 'canal'> & { canalId?: string };

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
export function fetchOrderDetail(blingOrderId: string, token: string): Promise<LegacyOrderDetail>;
export function fetchOrderDetail(
  orgId: string,
  providerOrderId: string,
  token: string,
  context?: OrderDetailRequestContext,
): Promise<RawOrderDetail>;
export async function fetchOrderDetail(
  orgIdOrProviderOrderId: string,
  providerOrderIdOrToken: string,
  maybeToken?: string,
  context?: OrderDetailRequestContext,
): Promise<RawOrderDetail | LegacyOrderDetail> {
  const hasOrgId = maybeToken !== undefined;
  const orgId = hasOrgId ? orgIdOrProviderOrderId : undefined;
  const providerOrderId = hasOrgId ? providerOrderIdOrToken : orgIdOrProviderOrderId;
  const token = hasOrgId ? maybeToken : providerOrderIdOrToken;
  const url = `${serverEnv.BLING_API_BASE}/pedidos/vendas/${encodeURIComponent(providerOrderId)}`;
  const res = await fetchBling(url, token, { deadlineAt: context?.deadlineAt });

  let body: BlingDetalheResponse;
  try {
    body = (await res.json()) as BlingDetalheResponse;
  } catch {
    throw new Error('bling_indisponivel');
  }

  const d = body.data;
  if (!d) throw new Error('bling_detalhe_vazio');

  const lojaId = d.loja?.id;
  const canalId = lojaId === null || lojaId === undefined ? undefined : String(lojaId);
  if (!hasOrgId) {
    return {
      itens: (d.itens ?? []).map(mapItem),
      frete: num(d.transporte?.frete),
      comissao: num(d.taxas?.taxaComissao),
      canalId,
    };
  }

  const canais = canalId ? context?.blingChannels ?? await fetchCanaisVenda(orgId!, token) : undefined;
  return {
    itens: (d.itens ?? []).map(mapItem),
    frete: num(d.transporte?.frete),
    comissao: num(d.taxas?.taxaComissao),
    canal: canalId ? canais?.get(canalId) : undefined,
  };
}
