import { describe, expect, it } from 'vitest';

import { blingDataProvider } from '@/modules/providers/bling/provider';
import { olistDataProvider } from '@/modules/providers/olist/provider';
import { getErpDataProvider, listRegisteredErpDataProviders } from '@/modules/providers/registry';

describe('ERP data provider registry', () => {
  it('resolve o Bling pelo identificador tipado', () => {
    expect(getErpDataProvider('bling')).toBe(blingDataProvider);
  });

  it('anuncia Olist depois de Bling e o resolve pelo identificador tipado', () => {
    expect(listRegisteredErpDataProviders()).toEqual(['bling', 'olist']);
    expect(getErpDataProvider('olist')).toBe(olistDataProvider);
  });
});
