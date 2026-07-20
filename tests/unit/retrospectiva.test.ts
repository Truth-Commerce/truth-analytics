import { describe, expect, it } from 'vitest';

import { retrospectiva } from '@/modules/tasks/retrospectiva';

describe('retrospectiva', () => {
  it('0 planejadas dá taxaConclusao 0 (evita divisão por zero)', () => {
    expect(retrospectiva(0, 0, 0)).toEqual({ planejadas: 0, concluidas: 0, taxaConclusao: 0, impactoBRL: 0 });
  });

  it('taxaConclusao arredonda para o inteiro mais próximo', () => {
    expect(retrospectiva(10, 7, 1500)).toEqual({
      planejadas: 10, concluidas: 7, taxaConclusao: 70, impactoBRL: 1500,
    });
  });

  it('1/3 arredonda para 33', () => {
    expect(retrospectiva(3, 1, 0).taxaConclusao).toBe(33);
  });

  it('2/3 arredonda para 67', () => {
    expect(retrospectiva(3, 2, 0).taxaConclusao).toBe(67);
  });

  it('todas concluídas dá 100', () => {
    expect(retrospectiva(5, 5, 0).taxaConclusao).toBe(100);
  });

  it('impactoBRL é repassado tal como recebido (o puro só formata, a soma vem do repo) — inclusive negativo', () => {
    expect(retrospectiva(4, 2, -250.5).impactoBRL).toBe(-250.5);
  });
});
