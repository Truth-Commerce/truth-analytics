import { describe, expect, it } from 'vitest';

import { ordenarColuna } from '@/modules/tasks/kanban-order';

const t = (prioridade: 'alta' | 'media' | 'baixa', prazo: string | null, ordem: number) => ({
  prioridade,
  prazo,
  ordem,
});

describe('ordenarColuna', () => {
  it('prioridade primeiro, depois prazo asc (null por último), depois ordem', () => {
    const entrada = [
      t('baixa', '2026-07-01', 1),
      t('alta', null, 2),
      t('alta', '2026-07-20', 3),
      t('alta', '2026-07-10', 4),
      t('media', '2026-07-05', 5),
    ];
    expect(ordenarColuna(entrada).map((x) => x.ordem)).toEqual([4, 3, 2, 5, 1]);
  });

  it('não muta o array original', () => {
    const entrada = [t('baixa', null, 1), t('alta', null, 2)];
    ordenarColuna(entrada);
    expect(entrada.map((x) => x.ordem)).toEqual([1, 2]);
  });
});
