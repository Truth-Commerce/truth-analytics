import { describe, expect, it } from 'vitest';

import { blingProvider } from '@/modules/providers/bling/provider';
import { getErpProvider, listRegisteredErpProviders } from '@/modules/providers/registry';

describe('ERP provider registry', () => {
  it('resolve o Bling pelo identificador tipado', () => {
    expect(getErpProvider('bling')).toBe(blingProvider);
  });

  it('não anuncia Olist antes do adaptador existir', () => {
    expect(listRegisteredErpProviders()).toEqual(['bling']);
    expect(() => getErpProvider('olist')).toThrow('erp_provider_nao_registrado:olist');
  });
});
