import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getValidAccessToken } from '@/modules/connections/connection.repository';
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

const MAX_TENTATIVAS = 3;
const BASE_DELAY_MS = 1000;
const MAX_RETRY_AFTER_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET autenticado no Bling com backoff:
 * - 429/5xx: até 3 tentativas; honra Retry-After (segundos, cap 30s), senão 1s/2s exponencial.
 * - 4xx ≠ 429: falha dura imediata (bling_indisponivel).
 * - Esgotou as tentativas: bling_erro_<status> (ou bling_indisponivel em erro de rede).
 */
async function fetchBling(url: string, token: string): Promise<Response> {
  let ultimaFalha = 'bling_indisponivel';
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch {
      ultimaFalha = 'bling_indisponivel';
      logger.warn('bling: erro de rede, tentando novamente', { tentativa, url });
      if (tentativa < MAX_TENTATIVAS) {
        await sleep(BASE_DELAY_MS * 2 ** (tentativa - 1));
      }
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      ultimaFalha = `bling_erro_${res.status}`;
      if (tentativa < MAX_TENTATIVAS) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
            : BASE_DELAY_MS * 2 ** (tentativa - 1);
        logger.warn('bling: resposta com backoff, aguardando para refazer', {
          tentativa,
          status: res.status,
          delayMs: delay,
        });
        await sleep(delay);
      }
      continue;
    }
    if (!res.ok) {
      throw new Error('bling_indisponivel');
    }
    return res;
  }
  throw new Error(ultimaFalha);
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
