import { serverEnv } from '@/lib/env';
import { getValidAccessToken } from '@/modules/connections/connection.repository';
import { CANAL_DESCONHECIDO, fetchCanaisVenda } from '@/modules/providers/bling/canais';
import { fetchBling } from '@/modules/providers/bling/http';
import type {
  OrderPageHandler,
  OrderPageRequest,
  RawOrder,
  RawOrderItem,
} from '@/modules/providers/data.types';

type BlingItemPayload = {
  codigo?: string | null;
  descricao?: string | null;
  quantidade?: number | string | null;
  valor?: number | string | null;
};

type BlingOrderPayload = {
  id?: number | string | null;
  numero?: number | string | null;
  numeroPedido?: number | string | null;
  data?: string | null;
  totalProdutos?: number | string | null;
  total?: number | string | null;
  /** O canal real vem daqui: loja.id resolvido contra /canais-venda. */
  loja?: { id?: number | string | null } | null;
  // ATENÇÃO: a listagem NÃO traz `itens` nem `transporte` — só o detalhe traz
  // (ver order-detail.ts). Manter os campos aqui apenas por tolerância a payload.
  itens?: BlingItemPayload[] | null;
  transporte?: { frete?: number | string | null } | null;
};

type BlingListResponse = {
  data?: BlingOrderPayload[] | null;
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mapItem(item: BlingItemPayload): RawOrderItem {
  return {
    sku: item.codigo ? String(item.codigo) : undefined,
    nome: item.descricao ? String(item.descricao) : '',
    quantidade: Number(item.quantidade ?? 0),
    valor: Number(item.valor ?? 0),
  };
}

/**
 * Mapeia UMA linha da listagem. O campo `canal.descricao` que o código lia antes
 * não existe nesse payload — por isso 100% dos pedidos ficavam com o literal
 * "Bling". O canal real sai de `loja.id` resolvido pelo mapa de /canais-venda.
 *
 * `itens` e `frete` continuam vindo vazios aqui de propósito: a listagem não os
 * entrega. Quem preenche é o enriquecimento (enrich-orders.ts).
 */
export function mapOrder(raw: BlingOrderPayload, canais: Map<string, string>): RawOrder {
  const id = String(raw.id ?? raw.numero ?? raw.numeroPedido ?? '');
  const lojaId = raw.loja?.id;
  const canal =
    (lojaId === null || lojaId === undefined
      ? CANAL_DESCONHECIDO
      : (canais.get(String(lojaId)) ?? CANAL_DESCONHECIDO)
    ).slice(0, 32);
  const data = raw.data ? new Date(raw.data) : new Date(0);
  const valorTotal = Number(raw.total ?? raw.totalProdutos ?? 0);
  const frete = Number(raw.transporte?.frete ?? 0);
  const itens: RawOrderItem[] = (raw.itens ?? []).map(mapItem);
  return { providerOrderId: id, providerStatus: '', canal, data, valorTotal, frete, itens };
}

function updatedWindow(updatedAfter: Date, now = new Date()): { inicio: Date; fim: Date } {
  return {
    inicio: updatedAfter,
    fim: now >= updatedAfter ? now : updatedAfter,
  };
}

export async function fetchOrders(
  orgId: string,
  request: OrderPageRequest,
  onPage: OrderPageHandler,
): Promise<void> {
  const token = await getValidAccessToken(orgId);
  const base = serverEnv.BLING_API_BASE;

  // Uma requisição por coleta; best-effort (mapa vazio não derruba nada).
  const canais = await fetchCanaisVenda(orgId, token);

  let page = request.offset / request.limit + 1;
  let offset = request.offset;

  while (true) {
    const url = new URL(`${base}/pedidos/vendas`);
    if (request.mode === 'created') {
      url.searchParams.set('dataInicial', formatDate(request.periodo.inicio));
      url.searchParams.set('dataFinal', formatDate(request.periodo.fim));
    } else {
      const janela = updatedWindow(request.updatedAfter);
      url.searchParams.set('dataAlteracaoInicial', formatDate(janela.inicio));
      url.searchParams.set('dataAlteracaoFinal', formatDate(janela.fim));
    }
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('limite', String(request.limit));

    const res = await fetchBling(url.toString(), token);

    let body: BlingListResponse;
    try {
      body = (await res.json()) as BlingListResponse;
    } catch {
      throw new Error('bling_indisponivel');
    }

    const pageData = body.data ?? [];
    if (pageData.length === 0) {
      await onPage({
        orders: [],
        offset,
        nextOffset: offset,
        total: offset,
        done: true,
      });
      break;
    }

    const orders = pageData.map((raw) => mapOrder(raw, canais));
    const done = pageData.length < request.limit;
    await onPage({
      orders,
      offset,
      nextOffset: offset + request.limit,
      total: offset + orders.length,
      done,
    });

    if (done) break;
    offset += request.limit;
    page++;
  }
}
