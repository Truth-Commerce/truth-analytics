import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { fetchBling } from '@/modules/providers/bling/http';

/** Nome usado quando o canal não pôde ser resolvido — nunca sobrescreve um nome já bom. */
export const CANAL_DESCONHECIDO = 'Bling';

type BlingCanalPayload = {
  id?: number | string | null;
  descricao?: string | null;
  tipo?: string | null;
};

type BlingCanaisResponse = {
  data?: BlingCanalPayload[] | null;
};

/**
 * Mapa `loja.id -> nome do canal` (ex.: "205976832" -> "Shopee").
 *
 * A listagem de pedidos entrega `loja.id`, não o nome do marketplace — é daí que
 * vinha o canal literal "Bling" em 100% dos pedidos. Uma requisição por coleta.
 *
 * BEST-EFFORT: falha (inclusive 403 de org que ainda não reautorizou com o escopo
 * "Integrações e Lojas Virtuais") devolve mapa vazio em vez de derrubar a coleta.
 * O canal cai para CANAL_DESCONHECIDO e o upsert preserva o valor que já estava lá.
 */
export async function fetchCanaisVenda(
  orgId: string,
  token: string,
  options: { deadlineAt?: number } = {},
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  try {
    const url = new URL(`${serverEnv.BLING_API_BASE}/canais-venda`);
    url.searchParams.set('limite', '100');

    const res = await fetchBling(url.toString(), token, options);
    const body = (await res.json()) as BlingCanaisResponse;

    for (const canal of body.data ?? []) {
      if (canal.id === null || canal.id === undefined) continue;
      const nome = (canal.descricao ?? canal.tipo ?? '').trim();
      if (nome === '') continue;
      mapa.set(String(canal.id), nome.slice(0, 32));
    }
  } catch (err) {
    logger.warn('bling: nao foi possivel resolver os canais de venda', {
      orgId,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
  return mapa;
}
