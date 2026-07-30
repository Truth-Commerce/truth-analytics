import { z } from 'zod';

import { resolveOlistChannel } from '@/modules/providers/olist/channel';
import { fetchOlistJson, OlistDataError } from '@/modules/providers/olist/http';
import type { OrderPage, OrderPageHandler, OrderPageRequest, RawOrder } from '@/modules/providers/data.types';

const finiteNumber = z.union([z.number(), z.string().trim().min(1)]).transform(Number).pipe(z.number().finite());
const remoteIdentifier = z.union([z.number().finite(), z.string().trim().min(1)]);
const channelSchema = z.object({ canalVenda: z.string().nullable().optional(), nome: z.string().nullable().optional() }).passthrough();

export const OlistOrdersPageSchema = z.object({
  itens: z.array(z.object({
    id: remoteIdentifier,
    situacao: remoteIdentifier,
    dataCriacao: z.string().min(1),
    valor: finiteNumber,
    ecommerce: channelSchema.nullable().optional(),
    intermediador: z.object({ nome: z.string().nullable().optional() }).passthrough().nullable().optional(),
  }).passthrough()),
  paginacao: z.object({ limit: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).passthrough(),
}).passthrough();

function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

function invalidOrdersResponse(): never { throw new Error('olist_pedidos_resposta_invalida'); }

function parseOlistCreationDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match) invalidOrdersResponse();
  const [, yearText, monthText, dayText, hourText = '0', minuteText = '0', secondText = '0', fraction = '', zone] = match;
  const [year, month, day, hour, minute, second] = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const milliseconds = fraction ? Number(fraction.slice(1).padEnd(3, '0')) : 0;
  const calendar = new Date(Date.UTC(year, month - 1, day, hour, minute, second, milliseconds));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day
    || calendar.getUTCHours() !== hour || calendar.getUTCMinutes() !== minute || calendar.getUTCSeconds() !== second) {
    invalidOrdersResponse();
  }
  if (!match[4]) return calendar;
  const normalized = `${yearText}-${monthText}-${dayText}T${hourText}:${minuteText}:${secondText}${fraction}${zone ?? 'Z'}`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) invalidOrdersResponse();
  return parsed;
}

function mapOrder(order: z.infer<typeof OlistOrdersPageSchema>['itens'][number]): RawOrder {
  const data = parseOlistCreationDate(order.dataCriacao);
  return {
    providerOrderId: String(order.id), providerStatus: String(order.situacao), canal: resolveOlistChannel(order),
    data, valorTotal: order.valor, frete: 0, itens: [],
  };
}

export async function fetchOlistOrders(orgId: string, request: OrderPageRequest, onPage: OrderPageHandler): Promise<void> {
  const query: Record<string, string> = request.mode === 'created'
    ? { dataInicial: formatDate(request.periodo.inicio), dataFinal: formatDate(request.periodo.fim), orderBy: 'asc', limit: '100', offset: String(request.offset) }
    : { dataAtualizacao: formatDateTime(request.updatedAfter), orderBy: 'asc', limit: '100', offset: String(request.offset) };
  let payload: unknown;
  try {
    payload = await fetchOlistJson({ orgId, priority: 'orders', path: '/pedidos', query, schema: OlistOrdersPageSchema });
  } catch (error) {
    if (error instanceof OlistDataError && error.code === 'olist_payload_invalido') invalidOrdersResponse();
    throw error;
  }
  const parsed = OlistOrdersPageSchema.safeParse(payload);
  if (!parsed.success) invalidOrdersResponse();
  const orders = parsed.data.itens.map(mapOrder);
  const { offset, total } = parsed.data.paginacao;
  const page: OrderPage = { orders, offset, nextOffset: offset + orders.length, total, done: offset + orders.length >= total };
  await onPage(page);
}
