import { serverEnv } from '@/lib/env';
import { getValidAccessToken } from '@/modules/connections/connection.repository';
import { fetchBling } from '@/modules/providers/bling/http';
import type { RawStockItem } from '@/modules/providers/types';

const PAGE_SIZE = 100;

type BlingProdutoPayload = {
  codigo?: string | null;
  nome?: string | null;
  estoque?: { saldoVirtualTotal?: number | string | null } | null;
};

type BlingListResponse = {
  data?: BlingProdutoPayload[] | null;
};

export function mapProduto(raw: BlingProdutoPayload): RawStockItem {
  return {
    sku: raw.codigo ? String(raw.codigo) : undefined,
    nome: raw.nome ? String(raw.nome) : '',
    saldo: Number(raw.estoque?.saldoVirtualTotal ?? 0),
  };
}

/** Lista o catálogo com saldo de estoque (GET /produtos paginado, backoff herdado). */
export async function fetchStock(orgId: string): Promise<RawStockItem[]> {
  const token = await getValidAccessToken(orgId);
  const base = serverEnv.BLING_API_BASE;

  const itens: RawStockItem[] = [];
  let page = 1;

  while (true) {
    const url = new URL(`${base}/produtos`);
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

    itens.push(...pageData.map(mapProduto));

    if (pageData.length < PAGE_SIZE) break;
    page++;
  }

  return itens;
}
