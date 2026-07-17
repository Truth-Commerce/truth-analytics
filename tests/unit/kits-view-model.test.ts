import { describe, expect, it } from 'vitest';

import { kitView, statusKitBadge } from '@/modules/kits/kits-view-model';

const base = {
  id: 'k1',
  org_id: 'o1',
  report_id: 'r1',
  titulo: 'Kit Café',
  status: 'sugerido',
  task_id: null,
  created_at: new Date(),
  payload: {
    itens: [
      { sku: 'A', nome: 'Caneca' },
      { sku: 'B', nome: 'Filtro' },
    ],
    precoSugerido: 79.9,
    argumento: 'Vendem juntos.',
    canalRecomendado: 'Shopee',
    evidencia: { pedidosJuntos: 7 },
  },
};

describe('kitView', () => {
  it('normaliza payload completo', () => {
    const v = kitView(base as never);
    expect(v).toMatchObject({
      id: 'k1',
      titulo: 'Kit Café',
      precoSugerido: 79.9,
      canalRecomendado: 'Shopee',
      pedidosJuntos: 7,
      status: 'sugerido',
    });
    expect(v.itens).toHaveLength(2);
  });

  it('payload malformado não quebra (defaults seguros)', () => {
    const v = kitView({ ...base, payload: {} } as never);
    expect(v.itens).toEqual([]);
    expect(v.precoSugerido).toBeNull();
    expect(v.pedidosJuntos).toBe(0);
    expect(v.argumento).toBe('');
  });
});

describe('statusKitBadge', () => {
  it('mapeia status → variant + rótulo pt-BR', () => {
    expect(statusKitBadge('sugerido')).toEqual({ variant: 'success', label: 'Sugerido' });
    expect(statusKitBadge('virou_task')).toEqual({ variant: 'neutral', label: 'Virou tarefa' });
    expect(statusKitBadge('descartado')).toEqual({ variant: 'neutral', label: 'Descartado' });
  });
});
