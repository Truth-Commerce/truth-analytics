import type { Plano } from '@/modules/auth/user.types';
import { diasDoPlano } from '@/modules/pipeline/plan-lock';

/**
 * Janela de análise do disparo manual do admin (pura).
 *
 * Reusa `diasDoPlano` (fonte única de verdade: weekly=7, biweekly=15, monthly=30)
 * para produzir EXATAMENTE a mesma janela do pipeline deployado (F0 generateReportAction).
 */
export function periodoDoPlano(plano: Plano, hoje: Date): { inicio: Date; fim: Date } {
  const inicio = new Date(hoje.getTime() - diasDoPlano(plano) * 24 * 60 * 60 * 1000);
  return { inicio, fim: hoje };
}
