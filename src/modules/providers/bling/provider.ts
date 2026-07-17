import { buildAuthorizeUrl, exchangeCode, refreshTokens } from '@/modules/providers/bling/oauth';
import { fetchOrders } from '@/modules/providers/bling/orders';
import { fetchStock } from '@/modules/providers/bling/stock';
import type { ConnectionProvider } from '@/modules/providers/types';

export const blingProvider: ConnectionProvider = {
  name: 'bling',
  buildAuthorizeUrl,
  exchangeCode,
  refresh: refreshTokens,
  fetchOrders,
  fetchStock,
};
