import { describe, expect, it } from 'vitest';

import { FOCUSABLE_SELECTOR, proximoIndiceFoco } from '@/components/ui/dialog-model';

describe('proximoIndiceFoco (loop de Tab do focus-trap)', () => {
  it('Tab avança e dá a volta no fim', () => {
    expect(proximoIndiceFoco(3, 0, false)).toBe(1);
    expect(proximoIndiceFoco(3, 2, false)).toBe(0); // loop
  });

  it('Shift+Tab recua e dá a volta no início', () => {
    expect(proximoIndiceFoco(3, 2, true)).toBe(1);
    expect(proximoIndiceFoco(3, 0, true)).toBe(2); // loop reverso
  });

  it('foco fora da lista (atual = -1): Tab vai ao primeiro, Shift+Tab ao último', () => {
    expect(proximoIndiceFoco(3, -1, false)).toBe(0);
    expect(proximoIndiceFoco(3, -1, true)).toBe(2);
  });

  it('lista vazia devolve -1 (nada a focar)', () => {
    expect(proximoIndiceFoco(0, 0, false)).toBe(-1);
  });
});

describe('FOCUSABLE_SELECTOR', () => {
  it('cobre os controles interativos padrão e exclui tabindex=-1', () => {
    expect(FOCUSABLE_SELECTOR).toContain('a[href]');
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
