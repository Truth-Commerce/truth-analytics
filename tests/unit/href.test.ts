import { describe, expect, it } from 'vitest';

import { isInternalHref } from '@/components/ui/href';

describe('isInternalHref', () => {
  it('rotas do app são internas', () => {
    expect(isInternalHref('/dashboard')).toBe(true);
    expect(isInternalHref('/dashboard/relatorios/comparar?a=1')).toBe(true);
    expect(isInternalHref('/sign-in')).toBe(true);
  });

  it('api, externos, mailto, hash e protocol-relative NÃO são internos', () => {
    expect(isInternalHref('/api/reports/123/pdf')).toBe(false);
    expect(isInternalHref('https://truthcommerce.com.br')).toBe(false);
    expect(isInternalHref('mailto:suporte@truthcommerce.com.br')).toBe(false);
    expect(isInternalHref('#gerar-relatorio')).toBe(false);
    expect(isInternalHref('//evil.com')).toBe(false);
  });
});
