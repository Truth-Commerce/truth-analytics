import { blingDataProvider } from '@/modules/providers/bling/provider';
import type { ErpDataProvider } from '@/modules/providers/data.types';
import type { ErpProviderId } from '@/modules/providers/types';

// O domínio reconhece Olist, mas ele não fornece dados antes do adaptador existir.
const registry: Partial<Record<ErpProviderId, ErpDataProvider>> = {
  bling: blingDataProvider,
};

export function getErpDataProvider(provider: ErpProviderId): ErpDataProvider {
  const adapter = registry[provider];
  if (!adapter) throw new Error(`erp_data_provider_nao_registrado:${provider}`);
  return adapter;
}

export function listRegisteredErpDataProviders(): readonly ErpProviderId[] {
  return Object.freeze(Object.keys(registry) as ErpProviderId[]);
}
