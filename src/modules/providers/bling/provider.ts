import { buildAuthorizeUrl, exchangeCode, refreshTokens } from '@/modules/providers/bling/oauth';
import type { ConnectionProvider } from '@/modules/providers/types';

export const blingProvider: ConnectionProvider = {
  name: 'bling',
  buildAuthorizeUrl,
  exchangeCode,
  refresh: refreshTokens,
};
