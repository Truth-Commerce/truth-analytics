import { describe, expect, it } from 'vitest';

import { nivelFilhoValido, progressoEpico } from '@/modules/tasks/hierarquia';

describe('nivelFilhoValido', () => {
  it('epico aceita task como filho', () => {
    expect(nivelFilhoValido('epico', 'task')).toBe(true);
  });

  it('task aceita subtask como filho', () => {
    expect(nivelFilhoValido('task', 'subtask')).toBe(true);
  });

  it('subtask não aceita nenhum filho', () => {
    expect(nivelFilhoValido('subtask', 'task')).toBe(false);
    expect(nivelFilhoValido('subtask', 'subtask')).toBe(false);
    expect(nivelFilhoValido('subtask', 'epico')).toBe(false);
  });

  it('epico não aceita subtask direto (precisa passar por task)', () => {
    expect(nivelFilhoValido('epico', 'subtask')).toBe(false);
  });

  it('epico não aceita epico como filho', () => {
    expect(nivelFilhoValido('epico', 'epico')).toBe(false);
  });

  it('task não aceita task nem epico como filho', () => {
    expect(nivelFilhoValido('task', 'task')).toBe(false);
    expect(nivelFilhoValido('task', 'epico')).toBe(false);
  });
});

describe('progressoEpico', () => {
  it('0/0 dá pct 0 (evita divisão por zero)', () => {
    expect(progressoEpico([])).toEqual({ total: 0, concluidas: 0, pct: 0 });
  });

  it('todas concluídas dá pct 100', () => {
    const filhas = [{ status: 'concluida' as const }, { status: 'concluida' as const }];
    expect(progressoEpico(filhas)).toEqual({ total: 2, concluidas: 2, pct: 100 });
  });

  it('nenhuma concluída dá pct 0', () => {
    const filhas = [{ status: 'backlog' as const }, { status: 'todo' as const }];
    expect(progressoEpico(filhas)).toEqual({ total: 2, concluidas: 0, pct: 0 });
  });

  it('progresso parcial arredonda o percentual', () => {
    // 1/3 = 33.33...% -> arredonda para 33
    const filhas = [
      { status: 'concluida' as const },
      { status: 'todo' as const },
      { status: 'em_andamento' as const },
    ];
    expect(progressoEpico(filhas)).toEqual({ total: 3, concluidas: 1, pct: 33 });
  });

  it('2/3 concluídas arredonda para 67', () => {
    const filhas = [
      { status: 'concluida' as const },
      { status: 'concluida' as const },
      { status: 'em_revisao' as const },
    ];
    expect(progressoEpico(filhas)).toEqual({ total: 3, concluidas: 2, pct: 67 });
  });
});
