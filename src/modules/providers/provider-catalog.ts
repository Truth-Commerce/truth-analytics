import type { ErpProviderId } from '@/modules/providers/types';

export const ERP_PROVIDER_IDS = ['bling', 'olist'] as const satisfies readonly ErpProviderId[];

export function isErpProviderId(provider: string): provider is ErpProviderId {
  return ERP_PROVIDER_IDS.includes(provider as ErpProviderId);
}
