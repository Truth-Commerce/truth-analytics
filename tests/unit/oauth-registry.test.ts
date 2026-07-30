import { describe, expect, it } from 'vitest';

import { getOAuthProvider, listRegisteredOAuthProviders } from '@/modules/providers/oauth-registry';
import { olistOAuthProvider } from '@/modules/providers/olist/provider';
import { getErpDataProvider, listRegisteredErpDataProviders } from '@/modules/providers/registry';

describe('OAuth provider registry', () => {
  it('mantem o adapter OAuth e registra separadamente o adapter operacional Olist', () => {
    expect(listRegisteredOAuthProviders()).toEqual(['olist']);
    expect(getOAuthProvider('olist')).toBe(olistOAuthProvider);
    expect(listRegisteredErpDataProviders()).toEqual(['bling', 'olist']);
    expect(getErpDataProvider('olist').name).toBe('olist');
  });
});
