import { z } from 'zod';

import { resolveOlistChannel } from '@/modules/providers/olist/channel';
import { fetchOlistJson, OlistDataError } from '@/modules/providers/olist/http';
import type { RawOrderDetail } from '@/modules/providers/data.types';

const finiteNumber = z.number().finite();
const channelSchema = z.object({ canalVenda: z.string().nullable().optional(), nome: z.string().nullable().optional() }).passthrough();

export const OlistOrderDetailSchema = z.object({
  itens: z.array(z.object({
    produto: z.object({ id: z.union([z.string(), z.number()]).nullable().optional(), sku: z.string(), descricao: z.string() }).passthrough(),
    quantidade: finiteNumber,
    valorUnitario: finiteNumber,
  }).passthrough()),
  valorFrete: finiteNumber,
  ecommerce: channelSchema.nullable().optional(),
  intermediador: z.object({ nome: z.string().nullable().optional() }).passthrough().nullable().optional(),
}).passthrough();

function invalidDetailResponse(): never { throw new Error('olist_detalhe_resposta_invalida'); }

export async function fetchOlistOrderDetail(orgId: string, providerOrderId: string): Promise<RawOrderDetail> {
  let payload: unknown;
  try {
    payload = await fetchOlistJson({ orgId, priority: 'details', path: `/pedidos/${encodeURIComponent(providerOrderId)}`, schema: OlistOrderDetailSchema });
  } catch (error) {
    if (error instanceof OlistDataError && error.code === 'olist_payload_invalido') invalidDetailResponse();
    throw error;
  }
  const parsed = OlistOrderDetailSchema.safeParse(payload);
  if (!parsed.success) invalidDetailResponse();
  return {
    itens: parsed.data.itens.map(item => ({ sku: item.produto.sku, nome: item.produto.descricao, quantidade: item.quantidade, valor: item.valorUnitario })),
    frete: parsed.data.valorFrete,
    comissao: 0,
    canal: resolveOlistChannel(parsed.data),
  };
}
