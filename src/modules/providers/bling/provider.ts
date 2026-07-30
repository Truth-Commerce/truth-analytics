import { getValidAccessToken } from '@/modules/connections/connection.repository';
import { BlingDataError } from '@/modules/providers/bling/http';
import { fetchOrderDetail } from '@/modules/providers/bling/order-detail';
import { fetchOrders as fetchDataOrders } from '@/modules/providers/bling/orders';
import { buildAuthorizeUrl, exchangeCode, refreshTokens } from '@/modules/providers/bling/oauth';
import { fetchStock } from '@/modules/providers/bling/stock';
import type { ErpDataProvider } from '@/modules/providers/data.types';
import type { ConnectionProvider } from '@/modules/providers/types';

export const blingDataProvider: ErpDataProvider = {
  name: 'bling',
  fetchOrders: fetchDataOrders,
  async fetchOrderDetail(orgId, providerOrderId, context) {
    if (context?.deadlineAt !== undefined && Date.now() >= context.deadlineAt) throw new Error('bling_deadline_exceeded');
    let token = context?.blingState?.token ?? context?.blingToken ?? await getValidAccessToken(orgId, undefined, { deadlineAt: context?.deadlineAt });
    if (context?.deadlineAt !== undefined && Date.now() >= context.deadlineAt) throw new Error('bling_deadline_exceeded');
    try {
      return await fetchOrderDetail(orgId, providerOrderId, token, context);
    } catch (error) {
      if (!(error instanceof BlingDataError) || error.status !== 401) throw error;
      const state = context?.blingState;
      if (state && state.token !== token) token = state.token;
      else if (state) {
        const refresh = state.refreshPromise ?? getValidAccessToken(orgId, Number.MAX_SAFE_INTEGER, { deadlineAt: context?.deadlineAt })
          .then(refreshed => { state.token = refreshed; return refreshed; })
          .finally(() => { state.refreshPromise = undefined; });
        state.refreshPromise = refresh;
        token = await refresh;
      } else token = await getValidAccessToken(orgId, Number.MAX_SAFE_INTEGER, { deadlineAt: context?.deadlineAt });
      if (context?.deadlineAt !== undefined && Date.now() >= context.deadlineAt) throw new Error('bling_deadline_exceeded');
      return fetchOrderDetail(orgId, providerOrderId, token, context ? { ...context, blingToken: token } : undefined);
    }
  },
};

/** @deprecated New code must obtain operational data through blingDataProvider. */
export const blingProvider: ConnectionProvider = {
  name: 'bling',
  buildAuthorizeUrl,
  exchangeCode,
  refresh: refreshTokens,
  async fetchOrders(orgId, periodo, onPage) {
    const orders = [] as Awaited<ReturnType<ConnectionProvider['fetchOrders']>>;
    await fetchDataOrders(orgId, { mode: 'created', periodo, offset: 0, limit: 100 }, async (page) => {
      const legacyPage = page.orders.map(({ providerOrderId, ...order }) => ({
        ...order,
        blingOrderId: providerOrderId,
      }));
      if (onPage) await onPage(legacyPage);
      else orders.push(...legacyPage);
    });
    return orders;
  },
  fetchStock,
};
