import { hojeBrt } from '@/lib/timezone';

import { somarDias } from './sla';
import type { TaskStatus } from './task.types';

export type TaskBurndownInput = { status: TaskStatus; updated_at: Date };
export type PontoBurndown = { dia: string; abertas: number };

/**
 * Série de tasks abertas por dia no intervalo [inicio, fim] (ambos
 * 'yyyy-mm-dd', inclusive) — burndown de um ciclo/sprint.
 *
 * Modelo simples (documentado, pois a tabela não guarda uma data de conclusão
 * dedicada): uma task conta como ABERTA no fim do dia D se
 *   (a) seu status atual não é 'concluida' — ainda está aberta agora,
 *       independente de quando foi criada/atualizada por último; OU
 *   (b) está 'concluida', mas foi concluída DEPOIS de D. Usamos o
 *       dia-calendário BRT de `updated_at` como proxy da data de conclusão —
 *       `updated_at` muda a cada transição de status (`moveTask`), e a
 *       última transição de uma task concluída É a que fechou ela.
 *
 * Se o dia de conclusão for <= D, a task já estava fechada no fim de D (não
 * conta). Pura e determinística: nunca lê `Date.now()`, só os `updated_at`
 * recebidos por parâmetro. Intervalo vazio (fim < inicio) devolve [].
 */
export function burndown(tasks: TaskBurndownInput[], inicio: string, fim: string): PontoBurndown[] {
  const pontos: PontoBurndown[] = [];
  for (let dia = inicio; dia <= fim; dia = somarDias(dia, 1)) {
    const abertas = tasks.filter((t) => t.status !== 'concluida' || hojeBrt(t.updated_at) > dia).length;
    pontos.push({ dia, abertas });
  }
  return pontos;
}
