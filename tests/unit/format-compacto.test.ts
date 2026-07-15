import { describe, expect, it } from 'vitest';

import { formatBRLCompacto, formatDataCurta, slugify } from '@/lib/format';

describe('formatBRLCompacto', () => {
  it.each([
    [0, 'R$ 0'],
    [950, 'R$ 950'],
    [2000, 'R$ 2k'],
    [2500, 'R$ 2,5k'],
    [45000, 'R$ 45k'],
    [1_200_000, 'R$ 1,2M'],
    [-2500, '-R$ 2,5k'],
  ])('%d → %s', (n, esperado) => {
    expect(formatBRLCompacto(n)).toBe(esperado);
  });
});

describe('formatDataCurta', () => {
  it("'2026-06-01' → '01/06' (slicing puro, imune a timezone)", () => {
    expect(formatDataCurta('2026-06-01')).toBe('01/06');
    expect(formatDataCurta('2026-12-25')).toBe('25/12');
  });
});

describe('slugify', () => {
  it.each([
    ['Comercial Mattos & Cia', 'comercial-mattos-cia'],
    ['Bazar Estrela do Mar', 'bazar-estrela-do-mar'],
    ['Ação & Emoção Ltda.', 'acao-emocao-ltda'],
    ['', 'cliente'],
  ])('%s → %s', (entrada, esperado) => {
    expect(slugify(entrada)).toBe(esperado);
  });
});
