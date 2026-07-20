import { describe, expect, it } from 'vitest';

import { ordenarColuna } from '@/modules/tasks/kanban-order';

const t = (prioridade: 'alta' | 'media' | 'baixa', prazo: string | null, ordem: number) => ({
  prioridade,
  prazo,
  ordem,
});

describe('ordenarColuna', () => {
  it('ordem manual é a chave PRIMÁRIA — prevalece mesmo cruzando prioridades/prazos diferentes (F3a)', () => {
    const entrada = [
      t('baixa', '2026-07-01', 4),
      t('alta', null, 1),
      t('alta', '2026-07-20', 5),
      t('alta', '2026-07-10', 2),
      t('media', '2026-07-05', 3),
    ];
    expect(ordenarColuna(entrada).map((x) => x.ordem)).toEqual([1, 2, 3, 4, 5]);
  });

  it('empate em ordem cai pro critério antigo: prioridade, depois prazo asc (null por último)', () => {
    const entrada = [
      t('baixa', '2026-07-01', 1),
      t('alta', null, 1),
      t('alta', '2026-07-20', 1),
      t('alta', '2026-07-10', 1),
      t('media', '2026-07-05', 1),
    ];
    expect(ordenarColuna(entrada).map((x) => [x.prioridade, x.prazo])).toEqual([
      ['alta', '2026-07-10'],
      ['alta', '2026-07-20'],
      ['alta', null],
      ['media', '2026-07-05'],
      ['baixa', '2026-07-01'],
    ]);
  });

  it('não muta o array original', () => {
    const entrada = [t('baixa', null, 2), t('alta', null, 1)];
    ordenarColuna(entrada);
    expect(entrada.map((x) => x.ordem)).toEqual([2, 1]);
  });
});
