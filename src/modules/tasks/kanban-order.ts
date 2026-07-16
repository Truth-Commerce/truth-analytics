import type { TaskPrioridade } from './task.types';

const PESO_PRIORIDADE: Record<TaskPrioridade, number> = { alta: 0, media: 1, baixa: 2 };

/** Ordem canônica de coluna do kanban: prioridade → prazo asc (null por último) → ordem. */
export function ordenarColuna<T extends { prioridade: TaskPrioridade; prazo: string | null; ordem: number }>(
  tasks: T[],
): T[] {
  return [...tasks].sort((a, b) => {
    const p = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
    if (p !== 0) return p;
    if (a.prazo !== b.prazo) {
      if (a.prazo === null) return 1;
      if (b.prazo === null) return -1;
      return a.prazo.localeCompare(b.prazo);
    }
    return a.ordem - b.ordem;
  });
}
