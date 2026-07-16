import { describe, expect, it } from 'vitest';

import { paceMeta } from '@/modules/reports/compare';

describe('paceMeta — % esperado vs real no calendário BRT', () => {
  it('dia 14 de julho (31 dias): esperado 45%; 52% real → adiantado + projeção linear', () => {
    const r = paceMeta(23400, 45000, '2026-07-14');
    expect(r).toEqual({
      pctEsperado: 45, // round(14/31*100)
      pctReal: 52,     // round(23400/45000*100)
      ritmo: 'adiantado',
      projecao: 51814.29, // 23400/14*31
      mensagem: 'Você está adiantado: até hoje o esperado era ~45% da meta — você está em 52%.',
    });
  });

  it('atrasado quando fica ≥5 p.p. abaixo do esperado', () => {
    const r = paceMeta(9000, 45000, '2026-07-14'); // 20% vs 45%
    expect(r?.ritmo).toBe('atrasado');
    expect(r?.mensagem).toContain('atrasado');
  });

  it('no ritmo dentro da tolerância de ±5 p.p.', () => {
    const r = paceMeta(19800, 45000, '2026-07-14'); // 44% vs 45%
    expect(r?.ritmo).toBe('no_ritmo');
    expect(r?.mensagem).toContain('no ritmo');
  });

  it('fevereiro não bissexto: 28 dias no denominador', () => {
    const r = paceMeta(1000, 2800, '2026-02-07'); // dia 7/28 = 25%
    expect(r?.pctEsperado).toBe(25);
  });

  it('sem meta (null ou <= 0) → null', () => {
    expect(paceMeta(5000, null, '2026-07-14')).toBeNull();
    expect(paceMeta(5000, 0, '2026-07-14')).toBeNull();
  });
});
