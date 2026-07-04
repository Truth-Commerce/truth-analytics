import { describe, expect, it } from 'vitest';

import { periodoDoPlano } from '@/modules/admin/periodo-plano';

describe('periodoDoPlano', () => {
  const hoje = new Date('2026-07-03T12:00:00Z');

  it('weekly = 7 dias até hoje', () => {
    const p = periodoDoPlano('weekly', hoje);
    expect(p.fim).toEqual(hoje);
    expect(p.inicio).toEqual(new Date('2026-06-26T12:00:00Z'));
  });

  it('biweekly = 15 dias', () => {
    expect(periodoDoPlano('biweekly', hoje).inicio).toEqual(new Date('2026-06-18T12:00:00Z'));
  });

  it('monthly = 30 dias', () => {
    expect(periodoDoPlano('monthly', hoje).inicio).toEqual(new Date('2026-06-03T12:00:00Z'));
  });
});
