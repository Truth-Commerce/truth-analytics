import { describe, expect, it } from 'vitest';

import { diasDoPlano, podeGerar, proximoRelatorioEm } from '@/modules/pipeline/plan-lock';

// Fixed base date for deterministic assertions
const BASE = new Date('2026-06-24T12:00:00.000Z');

describe('diasDoPlano', () => {
  it('weekly → 7', () => expect(diasDoPlano('weekly')).toBe(7));
  it('biweekly → 15', () => expect(diasDoPlano('biweekly')).toBe(15));
  it('monthly → 30', () => expect(diasDoPlano('monthly')).toBe(30));
});

describe('proximoRelatorioEm', () => {
  it('weekly: base + 7 dias', () => {
    const result = proximoRelatorioEm('weekly', BASE);
    const expected = new Date('2026-07-01T12:00:00.000Z');
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('biweekly: base + 15 dias', () => {
    const result = proximoRelatorioEm('biweekly', BASE);
    const expected = new Date('2026-07-09T12:00:00.000Z');
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('monthly: base + 30 dias', () => {
    const result = proximoRelatorioEm('monthly', BASE);
    const expected = new Date('2026-07-24T12:00:00.000Z');
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('não muta o argumento base', () => {
    const base = new Date('2026-06-24T12:00:00.000Z');
    const originalTime = base.getTime();
    proximoRelatorioEm('weekly', base);
    expect(base.getTime()).toBe(originalTime);
  });

  it('usa new Date() como padrão quando base não é fornecida', () => {
    const antes = Date.now();
    const result = proximoRelatorioEm('weekly');
    const depois = Date.now();
    const minExpected = antes + 7 * 24 * 60 * 60 * 1000;
    const maxExpected = depois + 7 * 24 * 60 * 60 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(minExpected);
    expect(result.getTime()).toBeLessThanOrEqual(maxExpected);
  });
});

describe('podeGerar', () => {
  const agora = new Date('2026-06-24T12:00:00.000Z');
  const passado = new Date('2026-06-20T00:00:00.000Z');
  const futuro = new Date('2026-07-01T00:00:00.000Z');

  it('ok: status active + plano + proximo null', () => {
    expect(
      podeGerar({ status: 'active', plano: 'weekly', proximo_relatorio_liberado_em: null }, agora),
    ).toEqual({ ok: true });
  });

  it('ok: status active + plano + proximo no passado', () => {
    expect(
      podeGerar(
        { status: 'active', plano: 'weekly', proximo_relatorio_liberado_em: passado },
        agora,
      ),
    ).toEqual({ ok: true });
  });

  it('ok: proximo exatamente igual a agora (limite = pode gerar)', () => {
    expect(
      podeGerar(
        { status: 'active', plano: 'weekly', proximo_relatorio_liberado_em: agora },
        agora,
      ),
    ).toEqual({ ok: true });
  });

  it('not ok: status pending → org_inativa', () => {
    expect(
      podeGerar({ status: 'pending', plano: 'weekly', proximo_relatorio_liberado_em: null }, agora),
    ).toEqual({ ok: false, motivo: 'org_inativa' });
  });

  it('not ok: status suspended → org_inativa', () => {
    expect(
      podeGerar(
        { status: 'suspended', plano: 'monthly', proximo_relatorio_liberado_em: null },
        agora,
      ),
    ).toEqual({ ok: false, motivo: 'org_inativa' });
  });

  it('not ok: plano null → sem_plano', () => {
    expect(
      podeGerar({ status: 'active', plano: null, proximo_relatorio_liberado_em: null }, agora),
    ).toEqual({ ok: false, motivo: 'sem_plano' });
  });

  it('not ok: proximo no futuro → ciclo_em_andamento', () => {
    expect(
      podeGerar(
        { status: 'active', plano: 'weekly', proximo_relatorio_liberado_em: futuro },
        agora,
      ),
    ).toEqual({ ok: false, motivo: 'ciclo_em_andamento' });
  });
});
