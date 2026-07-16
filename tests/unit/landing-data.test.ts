import { describe, expect, it } from 'vitest';

import { LANDING_CANAIS, LANDING_METRICAS } from '@/app/landing-data';

describe('landing-data — números honestos', () => {
  it('expõe apenas métricas verificáveis do produto (100 / 3 / 1)', () => {
    expect(LANDING_METRICAS.map((m) => m.alvo)).toEqual([100, 3, 1]);
  });

  it('nenhuma métrica ultrapassa o que o produto de fato entrega (<= 100)', () => {
    for (const m of LANDING_METRICAS) {
      expect(m.alvo).toBeGreaterThan(0);
      expect(m.alvo).toBeLessThanOrEqual(100);
      expect(m.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('cita o Truth Score de 0 a 100 e o passo-a-passo, sem inventar clientes/receita', () => {
    const labels = LANDING_METRICAS.map((m) => m.label).join(' | ');
    expect(labels).toContain('Truth Score');
    expect(labels).toContain('0 a 100');
    // guarda anti-hype: nada de "lojas", "clientes", "R$" ou "milhões" inventados
    expect(labels).not.toMatch(/lojas|clientes|R\$|milh/i);
  });

  it('lista os 8 canais do Bling, sem duplicatas', () => {
    expect(LANDING_CANAIS).toHaveLength(8);
    expect(new Set(LANDING_CANAIS).size).toBe(8);
    expect(LANDING_CANAIS).toContain('Mercado Livre');
    expect(LANDING_CANAIS).toContain('Loja própria');
  });
});
