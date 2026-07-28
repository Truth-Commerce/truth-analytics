import { blingProvider } from '@/modules/providers/bling/provider';
import type { ConnectionProvider, ErpProviderId } from '@/modules/providers/types';

// O domínio reconhece Olist, mas ele não é conectável antes do adaptador existir.
const registry: Partial<Record<ErpProviderId, ConnectionProvider>> = {
  bling: blingProvider,
};

export function getErpProvider(provider: ErpProviderId): ConnectionProvider {
  const adapter = registry[provider];
  if (!adapter) throw new Error(`erp_provider_nao_registrado:${provider}`);
  return adapter;
}

export function listRegisteredErpProviders(): readonly ErpProviderId[] {
  return Object.freeze(Object.keys(registry) as ErpProviderId[]);
}
