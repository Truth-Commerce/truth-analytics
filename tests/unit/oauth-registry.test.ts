import { describe, expect, it } from 'vitest';

import { getOAuthProvider, listRegisteredOAuthProviders } from '@/modules/providers/oauth-registry';
import { olistOAuthProvider } from '@/modules/providers/olist/provider';
import { getErpDataProvider, listRegisteredErpDataProviders } from '@/modules/providers/registry';

describe('OAuth provider registry', () => {
  it('registra Olist apenas para OAuth', () => {
    expect(listRegisteredOAuthProviders()).toEqual(['olist']);
    expect(getOAuthProvider('olist')).toBe(olistOAuthProvider);
    expect(listRegisteredErpDataProviders()).toEqual(['bling']);
    expect(() => getErpDataProvider('olist')).toThrow('erp_data_provider_nao_registrado:olist');
  });
});
