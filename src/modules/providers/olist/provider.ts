import type { OAuthConnectionProvider } from '@/modules/providers/oauth.types';
import { buildAuthorizeUrl, exchangeCode, refresh } from '@/modules/providers/olist/oauth';

export const olistOAuthProvider: OAuthConnectionProvider = {
  name: 'olist',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
};
