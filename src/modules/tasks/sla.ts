import { hojeBrt } from '@/lib/timezone';

import type { TaskPrioridade } from './task.types';

/** SLA de prazo por prioridade (dias corridos a partir de hoje BRT). */
export const SLA_DIAS: Record<TaskPrioridade, number> = { alta: 7, media: 14, baixa: 30 };

export const VENCE_EM_BREVE_DIAS = 2;

const DIA_MS = 86_400_000;

function paraUtcMs(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
}

/** Soma N dias a um dia-calendário 'yyyy-mm-dd' (aritmética UTC pura). */
export function somarDias(dia: string, dias: number): string {
  return new Date(paraUtcMs(dia) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Prazo default pela convenção de SLA: alta=7d, media=14d, baixa=30d. */
export function prazoDefault(prioridade: TaskPrioridade, aPartirDe: string = hojeBrt()): string {
  return somarDias(aPartirDe, SLA_DIAS[prioridade]);
}

export type StatusPrazo = 'sem_prazo' | 'no_prazo' | 'vence_em_breve' | 'atrasada';

/**
 * Classifica um prazo ('yyyy-mm-dd' | null) contra hoje BRT. NÃO olha o
 * status da task — o chamador exclui `concluida` antes.
 */
export function statusPrazo(prazo: string | null, hoje: string = hojeBrt()): StatusPrazo {
  if (!prazo) return 'sem_prazo';
  if (prazo < hoje) return 'atrasada';
  if (prazo <= somarDias(hoje, VENCE_EM_BREVE_DIAS)) return 'vence_em_breve';
  return 'no_prazo';
}

/** Dias até o prazo (negativo = atrasada). */
export function diasAtePrazo(prazo: string, hoje: string = hojeBrt()): number {
  return Math.round((paraUtcMs(prazo) - paraUtcMs(hoje)) / DIA_MS);
}

/** Rótulo curto pt-BR do prazo para cards e filas. */
export function labelPrazo(prazo: string | null, hoje: string = hojeBrt()): string | null {
  if (!prazo) return null;
  const dias = diasAtePrazo(prazo, hoje);
  if (dias < 0) return `Atrasada há ${-dias}d`;
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  if (dias <= 7) return `D-${dias}`;
  return `${prazo.slice(8, 10)}/${prazo.slice(5, 7)}`;
}

/** Dias inteiros decorridos desde um instante ("aguardando há Xd"). */
export function diasDesde(quando: Date, agora: Date = new Date()): number {
  return Math.max(0, Math.floor((agora.getTime() - quando.getTime()) / DIA_MS));
}
