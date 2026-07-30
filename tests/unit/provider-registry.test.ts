import { describe, expect, it } from 'vitest';

import { blingDataProvider } from '@/modules/providers/bling/provider';
import { getErpDataProvider, listRegisteredErpDataProviders } from '@/modules/providers/registry';

describe('ERP data provider registry', () => {
  it('resolve o Bling pelo identificador tipado', () => {
    expect(getErpDataProvider('bling')).toBe(blingDataProvider);
  });

  it('não anuncia Olist antes do adaptador operacional existir', () => {
    expect(listRegisteredErpDataProviders()).toEqual(['bling']);
    expect(() => getErpDataProvider('olist')).toThrow('erp_data_provider_nao_registrado:olist');
  });
});
