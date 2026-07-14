import { describe, expect, it } from 'vitest';

import { periodoDoPlano } from '@/modules/admin/periodo-plano';

describe('periodoDoPlano — dias fechados no calendário America/Sao_Paulo', () => {
  const agora = new Date('2026-07-03T12:00:00Z'); // 09:00 BRT → ontem = 2026-07-02

  it('weekly = 7 dias fechados terminando ontem', () => {
    const p = periodoDoPlano('weekly', agora);
    expect(p.fim.toISOString()).toBe('2026-07-02T23:59:59.999Z');
    expect(p.inicio.toISOString()).toBe('2026-06-26T00:00:00.000Z');
  });

  it('biweekly = 15 dias fechados', () => {
    const p = periodoDoPlano('biweekly', agora);
    expect(p.inicio.toISOString()).toBe('2026-06-18T00:00:00.000Z');
    expect(p.fim.toISOString()).toBe('2026-07-02T23:59:59.999Z');
  });

  it('monthly = 30 dias fechados', () => {
    expect(periodoDoPlano('monthly', agora).inicio.toISOString()).toBe(
      '2026-06-03T00:00:00.000Z',
    );
  });

  it('madrugada UTC (ainda é o dia anterior em BRT) → ontem recua junto', () => {
    const p = periodoDoPlano('weekly', new Date('2026-07-03T01:00:00Z')); // 22:00 BRT de 02/07
    expect(p.fim.toISOString()).toBe('2026-07-01T23:59:59.999Z');
    expect(p.inicio.toISOString()).toBe('2026-06-25T00:00:00.000Z');
  });
});
