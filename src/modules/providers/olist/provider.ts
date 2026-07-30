import { fetchOlistOrderDetail } from '@/modules/providers/olist/order-detail';
import { fetchOlistOrders } from '@/modules/providers/olist/orders';
import type { ErpDataProvider } from '@/modules/providers/data.types';
import type { OAuthConnectionProvider } from '@/modules/providers/oauth.types';
import { buildAuthorizeUrl, exchangeCode, refresh } from '@/modules/providers/olist/oauth';

export const olistDataProvider: ErpDataProvider = {
  name: 'olist',
  fetchOrders: fetchOlistOrders,
  fetchOrderDetail: fetchOlistOrderDetail,
};

export const olistOAuthProvider: OAuthConnectionProvider = {
  name: 'olist',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
};
