import { describe, expect, it } from 'vitest';
import { isValidPlano } from '@/modules/admin/admin.repository';

describe('isValidPlano', () => {
  it('aceita os 3 planos válidos', () => {
    expect(isValidPlano('weekly')).toBe(true);
    expect(isValidPlano('biweekly')).toBe(true);
    expect(isValidPlano('monthly')).toBe(true);
  });
  it('rejeita valores inválidos', () => {
    expect(isValidPlano('anual')).toBe(false);
    expect(isValidPlano('')).toBe(false);
    expect(isValidPlano(null)).toBe(false);
    expect(isValidPlano(undefined)).toBe(false);
  });
});
