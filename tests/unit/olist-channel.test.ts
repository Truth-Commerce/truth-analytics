import { describe, expect, it } from 'vitest';

import { resolveOlistChannel } from '@/modules/providers/olist/channel';

describe('resolveOlistChannel', () => {
  it('prioriza o canal de venda oficial do ecommerce', () => {
    expect(resolveOlistChannel({ ecommerce: { canalVenda: 'Mercado Livre', nome: 'Loja ML' } })).toBe('Mercado Livre');
  });

  it('usa o nome da loja e depois o intermediador como fallback', () => {
    expect(resolveOlistChannel({ ecommerce: { nome: 'Loja Shopee' } })).toBe('Loja Shopee');
    expect(resolveOlistChannel({ intermediador: { nome: 'Amazon' } })).toBe('Amazon');
  });

  it('usa Olist ERP e limita canais a 32 caracteres quando nao ha fonte', () => {
    expect(resolveOlistChannel({})).toBe('Olist ERP');
    expect(resolveOlistChannel({ ecommerce: { canalVenda: 'x'.repeat(33) } })).toBe('x'.repeat(32));
  });

  it('remove espacos externos e ignora nomes vazios', () => {
    expect(resolveOlistChannel({ ecommerce: { canalVenda: '  Mercado Livre  ' } })).toBe('Mercado Livre');
    expect(resolveOlistChannel({ ecommerce: { canalVenda: '   ', nome: '  Loja Olist  ' } })).toBe('Loja Olist');
  });
});
