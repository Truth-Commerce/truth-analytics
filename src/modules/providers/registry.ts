import { blingDataProvider } from '@/modules/providers/bling/provider';
import { olistDataProvider } from '@/modules/providers/olist/provider';
import type { ErpDataProvider } from '@/modules/providers/data.types';
import type { ErpProviderId } from '@/modules/providers/types';

const registry: Partial<Record<ErpProviderId, ErpDataProvider>> = {
  bling: blingDataProvider,
  olist: olistDataProvider,
};

export function getErpDataProvider(provider: ErpProviderId): ErpDataProvider {
  const adapter = registry[provider];
  if (!adapter) throw new Error(`erp_data_provider_nao_registrado:${provider}`);
  return adapter;
}

export function listRegisteredErpDataProviders(): readonly ErpProviderId[] {
  return Object.freeze(Object.keys(registry) as ErpProviderId[]);
}
