import type { TaskStatus } from './task.types';

/** Nível de uma task na hierarquia épico > task > subtask. */
export type Nivel = 'epico' | 'task' | 'subtask';

/** Níveis-filho válidos por nível-pai (raso: só um passo por vez). */
const FILHOS_VALIDOS: Record<Nivel, readonly Nivel[]> = {
  epico: ['task'],
  task: ['subtask'],
  subtask: [],
};

/** `pai` pode ter um filho de nível `filho`? (epico->task, task->subtask; nada mais). */
export function nivelFilhoValido(pai: Nivel, filho: Nivel): boolean {
  return FILHOS_VALIDOS[pai].includes(filho);
}

export type ProgressoEpico = { total: number; concluidas: number; pct: number };

/** Agrega o progresso de um épico a partir das filhas diretas (tasks). pct=0 quando total=0. */
export function progressoEpico(filhas: { status: TaskStatus }[]): ProgressoEpico {
  const total = filhas.length;
  const concluidas = filhas.filter((f) => f.status === 'concluida').length;
  const pct = total === 0 ? 0 : Math.round((concluidas / total) * 100);
  return { total, concluidas, pct };
}
