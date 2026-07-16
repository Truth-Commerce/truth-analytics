import type { Plano } from '@/modules/auth/user.types';
import { janelaDiasFechados } from '@/lib/timezone';
import { diasDoPlano } from '@/modules/pipeline/plan-lock';

/**
 * Janela de análise do relatório (pura) — FONTE ÚNICA usada pela action do
 * cliente, pelo cron de geração automática (via enqueueReport) e pelo disparo
 * manual do admin.
 *
 * G0: N dias FECHADOS no calendário America/Sao_Paulo, terminando ontem
 * (fim = ontem 23:59:59.999Z; inicio = ontem − (N−1) dias, 00:00:00.000Z).
 * Nada de "1º dia fora / último dia parcial": hoje nunca entra na janela.
 * Reusa `diasDoPlano` (weekly=7, biweekly=15, monthly=30).
 */
export function periodoDoPlano(plano: Plano, agora: Date): { inicio: Date; fim: Date } {
  return janelaDiasFechados(diasDoPlano(plano), agora);
}
