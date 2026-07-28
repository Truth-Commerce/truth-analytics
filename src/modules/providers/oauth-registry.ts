import type { OAuthConnectionProvider } from '@/modules/providers/oauth.types';
import { olistOAuthProvider } from '@/modules/providers/olist/provider';
import type { ErpProviderId } from '@/modules/providers/types';

const registry: Partial<Record<ErpProviderId, OAuthConnectionProvider>> = {
  olist: olistOAuthProvider,
};

export function getOAuthProvider(provider: ErpProviderId): OAuthConnectionProvider {
  const adapter = registry[provider];
  if (!adapter) throw new Error(`oauth_provider_nao_registrado:${provider}`);
  return adapter;
}

export function listRegisteredOAuthProviders(): readonly ErpProviderId[] {
  return Object.freeze(Object.keys(registry) as ErpProviderId[]);
}
