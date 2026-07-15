import { describe, expect, it } from 'vitest';

import { anguloDoScore, arcoPath, barrasEvolucao, polarToXY } from '@/modules/pdf/pdf-gauge';

describe('polarToXY', () => {
  it('0° = topo, 90° = direita (convenção do gauge)', () => {
    const topo = polarToXY(50, 50, 40, 0);
    expect(topo.x).toBeCloseTo(50);
    expect(topo.y).toBeCloseTo(10);
    const direita = polarToXY(50, 50, 40, 90);
    expect(direita.x).toBeCloseTo(90);
    expect(direita.y).toBeCloseTo(50);
  });
});

describe('anguloDoScore', () => {
  it('0 → -135°, 50 → 0°, 100 → 135°', () => {
    expect(anguloDoScore(0)).toBe(-135);
    expect(anguloDoScore(50)).toBe(0);
    expect(anguloDoScore(100)).toBe(135);
  });
});

describe('arcoPath', () => {
  it('gera um path M..A.. com large-arc quando o arco excede 180°', () => {
    const p = arcoPath(50, 50, 40, -135, 135);
    expect(p.startsWith('M ')).toBe(true);
    expect(p).toContain(' A 40 40 0 1 1 ');
  });
  it('sem large-arc para arcos curtos', () => {
    expect(arcoPath(50, 50, 40, -135, 0)).toContain(' A 40 40 0 0 1 ');
  });
});

describe('barrasEvolucao', () => {
  it('normaliza para % do maior dia e limita a maxBarras (fatia final)', () => {
    const r = barrasEvolucao(
      [
        { data: '2026-06-01', total: 50 },
        { data: '2026-06-02', total: 100 },
        { data: '2026-06-03', total: 25 },
      ],
      2,
    );
    expect(r).toEqual([
      { label: '02/06', pct: 100 },
      { label: '03/06', pct: 25 },
    ]);
  });
  it('tudo zero → pct 0 (sem divisão por zero)', () => {
    expect(barrasEvolucao([{ data: '2026-06-01', total: 0 }])[0].pct).toBe(0);
  });
});
