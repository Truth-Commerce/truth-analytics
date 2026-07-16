import { describe, expect, it } from 'vitest';

import { formatBRL, formatData, formatPeriodo } from '@/lib/format';

describe('formatBRL', () => {
  it('formata valor positivo com separadores pt-BR', () => {
    const result = formatBRL(1234.56);
    // Intl pode usar espaço não-quebrável entre símbolo e número — asserir separadamente
    expect(result).toContain('1.234,56');
    expect(result).toContain('R$');
  });

  it('formata zero corretamente', () => {
    const result = formatBRL(0);
    expect(result).toContain('0,00');
  });
});

describe('formatData', () => {
  it('formata uma Date no padrão dd/mm/aaaa', () => {
    // 2026-06-24 em UTC — usar horário ao meio-dia para evitar off-by-one de fuso
    const result = formatData(new Date('2026-06-24T12:00:00Z'));
    expect(result).toContain('2026');
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('aceita string ISO e retorna formato de data', () => {
    const result = formatData('2026-01-15T12:00:00Z');
    expect(result).toContain('2026');
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});

describe('formatPeriodo', () => {
  it('une duas datas com separador –', () => {
    const result = formatPeriodo(
      new Date('2026-06-01T12:00:00Z'),
      new Date('2026-06-30T12:00:00Z'),
    );
    expect(result).toContain(' – ');
  });
});

describe('fusos (G0)', () => {
  it('formatData usa America/Sao_Paulo: 01:00Z cai no dia anterior BRT', async () => {
    const { formatData } = await import('@/lib/format');
    expect(formatData(new Date('2026-06-25T01:00:00Z'))).toBe('24/06/2026');
  });

  it('formatPeriodo formata fronteiras (dias-calendário em UTC) sem deslocar o dia', async () => {
    const { formatPeriodo } = await import('@/lib/format');
    expect(
      formatPeriodo(new Date('2026-06-01T00:00:00.000Z'), new Date('2026-06-30T23:59:59.999Z')),
    ).toBe('01/06/2026 – 30/06/2026');
  });
});
