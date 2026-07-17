import { describe, expect, it } from 'vitest';

import type { CoberturaProduto } from '@/modules/estoque/stock-coverage';
import { badgeDoEstado, labelCobertura, resumoEstoque } from '@/modules/estoque/estoque-view-model';

const p = (estado: CoberturaProduto['estado'], coberturaDias: number | null): CoberturaProduto => ({
  sku: 's',
  nome: 'n',
  saldo: 1,
  vendas30d: 1,
  coberturaDias,
  estado,
});

describe('resumoEstoque', () => {
  it('conta por estado', () => {
    expect(
      resumoEstoque([p('critico', 2), p('critico', 0), p('atencao', 10), p('parado', null), p('ok', 60)]),
    ).toEqual({ criticos: 2, atencao: 1, parados: 1 });
  });
});

describe('labelCobertura', () => {
  it('formata dias, esgotado e sem giro', () => {
    expect(labelCobertura(p('ok', 42))).toBe('~42 dias');
    expect(labelCobertura(p('critico', 0))).toBe('esgotando');
    expect(labelCobertura(p('parado', null))).toBe('—');
  });
});

describe('badgeDoEstado', () => {
  it('mapeia estado → variant e rótulo pt-BR', () => {
    expect(badgeDoEstado('critico')).toEqual({ variant: 'danger', label: 'Crítico' });
    expect(badgeDoEstado('atencao')).toEqual({ variant: 'warn', label: 'Atenção' });
    expect(badgeDoEstado('ok')).toEqual({ variant: 'success', label: 'Ok' });
    expect(badgeDoEstado('parado')).toEqual({ variant: 'neutral', label: 'Parado' });
  });
});
