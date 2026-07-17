import { serverEnv } from '@/lib/env';
import { getValidAccessToken } from '@/modules/connections/connection.repository';
import { fetchBling } from '@/modules/providers/bling/http';
import type { Periodo, RawOrder, RawOrderItem } from '@/modules/providers/types';

const PAGE_SIZE = 100;

type BlingItemPayload = {
  codigo?: string | null;
  descricao?: string | null;
  quantidade?: number | string | null;
  valor?: number | string | null;
};

type BlingOrderPayload = {
  id?: number | string | null;
  numeroPedido?: number | string | null;
  canal?: { descricao?: string | null } | null;
  data?: string | null;
  totalProdutos?: number | string | null;
  total?: number | string | null;
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

function mapOrder(raw: BlingOrderPayload): RawOrder {
  const id = String(raw.id ?? raw.numeroPedido ?? '');
  const canal = (raw.canal?.descricao ?? 'Bling').slice(0, 32);
  const data = raw.data ? new Date(raw.data) : new Date(0);
  const valorTotal = Number(raw.total ?? raw.totalProdutos ?? 0);
  const frete = Number(raw.transporte?.frete ?? 0);
  const itens: RawOrderItem[] = (raw.itens ?? []).map(mapItem);
  return { blingOrderId: id, canal, data, valorTotal, frete, itens };
}

export async function fetchOrders(
  orgId: string,
  periodo: Periodo,
  onPage?: (pagina: RawOrder[]) => Promise<void>,
): Promise<RawOrder[]> {
  const token = await getValidAccessToken(orgId);
  const base = serverEnv.BLING_API_BASE;

  const allOrders: RawOrder[] = [];
  let page = 1;

  while (true) {
    const url = new URL(`${base}/pedidos/vendas`);
    url.searchParams.set('dataInicial', formatDate(periodo.inicio));
    url.searchParams.set('dataFinal', formatDate(periodo.fim));
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('limite', String(PAGE_SIZE));

    const res = await fetchBling(url.toString(), token);

    let body: BlingListResponse;
    try {
      body = (await res.json()) as BlingListResponse;
    } catch {
      throw new Error('bling_indisponivel');
    }

    const pageData = body.data ?? [];
    if (pageData.length === 0) break;

    const mapeados = pageData.map(mapOrder);
    if (onPage) {
      // Persistência em lotes: entrega a página e NÃO acumula em RAM.
      await onPage(mapeados);
    } else {
      allOrders.push(...mapeados);
    }

    if (pageData.length < PAGE_SIZE) break;
    page++;
  }

  return allOrders;
}
