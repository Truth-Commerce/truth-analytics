import { describe, expect, it } from 'vitest';

import { isDataCalendarioValida } from '@/lib/timezone';

describe('isDataCalendarioValida', () => {
  it('aceita datas de calendário reais', () => {
    for (const s of ['2026-01-01', '2026-07-16', '2026-12-31', '2026-02-28', '2024-02-29']) {
      expect(isDataCalendarioValida(s)).toBe(true);
    }
  });

  it('rejeita datas com formato ok mas mês/dia impossíveis (regex sozinho deixaria passar → 500 no Postgres)', () => {
    for (const s of ['2026-13-99', '2026-02-30', '2026-00-10', '2026-01-32', '2026-04-31', '2023-02-29']) {
      expect(isDataCalendarioValida(s)).toBe(false);
    }
  });

  it('rejeita formato inválido', () => {
    for (const s of ['', '2026-1-1', '16/07/2026', '2026-07-16T00:00:00Z', 'abcd-ef-gh']) {
      expect(isDataCalendarioValida(s)).toBe(false);
    }
  });
});
