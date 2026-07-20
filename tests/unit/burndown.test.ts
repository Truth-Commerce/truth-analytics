import { describe, expect, it } from 'vitest';

import { burndown } from '@/modules/tasks/burndown';

describe('burndown', () => {
  it('intervalo de 1 dia com uma task aberta conta 1', () => {
    const tasks = [{ status: 'todo' as const, updated_at: new Date('2026-07-01T12:00:00Z') }];
    expect(burndown(tasks, '2026-07-01', '2026-07-01')).toEqual([{ dia: '2026-07-01', abertas: 1 }]);
  });

  it('lista vazia de tasks devolve 0 abertas em todos os dias', () => {
    expect(burndown([], '2026-07-01', '2026-07-03')).toEqual([
      { dia: '2026-07-01', abertas: 0 },
      { dia: '2026-07-02', abertas: 0 },
      { dia: '2026-07-03', abertas: 0 },
    ]);
  });

  it('fim < inicio devolve série vazia', () => {
    expect(burndown([], '2026-07-05', '2026-07-01')).toEqual([]);
  });

  it('task não-concluida conta como aberta em TODOS os dias do intervalo', () => {
    const tasks = [{ status: 'em_andamento' as const, updated_at: new Date('2026-07-01T12:00:00Z') }];
    expect(burndown(tasks, '2026-07-01', '2026-07-03')).toEqual([
      { dia: '2026-07-01', abertas: 1 },
      { dia: '2026-07-02', abertas: 1 },
      { dia: '2026-07-03', abertas: 1 },
    ]);
  });

  it('task concluida no dia D conta como FECHADA no fim do dia D (não conta mais a partir de D)', () => {
    const tasks = [{ status: 'concluida' as const, updated_at: new Date('2026-07-02T12:00:00Z') }];
    expect(burndown(tasks, '2026-07-01', '2026-07-03')).toEqual([
      { dia: '2026-07-01', abertas: 1 }, // ainda aberta no fim de 01/07 (concluída só em 02/07)
      { dia: '2026-07-02', abertas: 0 }, // fechada no fim do próprio dia de conclusão
      { dia: '2026-07-03', abertas: 0 },
    ]);
  });

  it('mistura de tasks abertas e concluídas em dias diferentes soma corretamente por dia', () => {
    const tasks = [
      { status: 'concluida' as const, updated_at: new Date('2026-07-01T12:00:00Z') }, // fecha em 01
      { status: 'concluida' as const, updated_at: new Date('2026-07-03T12:00:00Z') }, // fecha em 03
      { status: 'backlog' as const, updated_at: new Date('2026-07-01T12:00:00Z') }, // nunca fecha
    ];
    expect(burndown(tasks, '2026-07-01', '2026-07-03')).toEqual([
      { dia: '2026-07-01', abertas: 2 }, // a que fecha em 03 + a backlog (a que fecha em 01 já fechou)
      { dia: '2026-07-02', abertas: 2 }, // idem
      { dia: '2026-07-03', abertas: 1 }, // só a backlog (a que fecha em 03 já fechou nesse dia)
    ]);
  });

  it('é pura/determinística: duas chamadas com o mesmo input dão o mesmo resultado (sem Date.now)', () => {
    const tasks = [{ status: 'todo' as const, updated_at: new Date('2026-07-01T12:00:00Z') }];
    const a = burndown(tasks, '2026-07-01', '2026-07-05');
    const b = burndown(tasks, '2026-07-01', '2026-07-05');
    expect(a).toEqual(b);
  });
});
