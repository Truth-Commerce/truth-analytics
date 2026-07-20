import type { TaskPrioridade } from './task.types';

const PESO_PRIORIDADE: Record<TaskPrioridade, number> = { alta: 0, media: 1, baixa: 2 };

/**
 * Ordem canônica de coluna do kanban: `ordem` (manual — drag-and-drop e
 * botões ▲/▼) é a chave PRIMÁRIA; prioridade → prazo asc (null por último)
 * só desempatam quando `ordem` empata (F3a, revisão H5/T11).
 *
 * Antes, `ordenarColuna` ordenava por prioridade→prazo→ordem — mas
 * `reorderTask` só troca a `ordem` (inteiro) de duas tasks; arrastar/clicar
 * ▲▼ entre cards de prioridade/prazo diferentes trocava os inteiros
 * corretamente no banco, e o próximo render (que reordenava por prioridade de
 * novo) simplesmente devolvia o card pra posição de origem — visualmente um
 * no-op, escondido só pelo override otimista até a revalidação assentar.
 * Tornar `ordem` autoritativa resolve isso: uma vez movida manualmente, a
 * task fica onde foi solta. Tasks nunca reordenadas (ordem única e crescente
 * por coluna, atribuída em createTask/moveTask) continuam aparecendo na
 * ordem de chegada na coluna — as raras colisões de `ordem` (ex.: linhas
 * inseridas fora do fluxo normal, sem passar por createTask/moveTask) caem
 * nos critérios antigos como desempate.
 */
export function ordenarColuna<T extends { prioridade: TaskPrioridade; prazo: string | null; ordem: number }>(
  tasks: T[],
): T[] {
  return [...tasks].sort((a, b) => {
    if (a.ordem !== b.ordem) return a.ordem - b.ordem;
    const p = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
    if (p !== 0) return p;
    if (a.prazo !== b.prazo) {
      if (a.prazo === null) return 1;
      if (b.prazo === null) return -1;
      return a.prazo.localeCompare(b.prazo);
    }
    return 0;
  });
}
