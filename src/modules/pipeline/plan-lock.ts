import type { OrgStatus, Plano } from '@/modules/auth/user.types';

/**
 * Retorna o número de dias do ciclo de acordo com o plano.
 */
export function diasDoPlano(plano: Plano): number {
  switch (plano) {
    case 'weekly':
      return 7;
    case 'biweekly':
      return 15;
    case 'monthly':
      return 30;
  }
}

/**
 * Calcula a data do próximo relatório a partir de `base` (padrão: agora).
 * Não muta o argumento base.
 */
export function proximoRelatorioEm(plano: Plano, base: Date = new Date()): Date {
  const result = new Date(base.getTime());
  result.setDate(result.getDate() + diasDoPlano(plano));
  return result;
}

/**
 * Verifica se a org pode gerar um novo relatório.
 * Retorna { ok: true } ou { ok: false, motivo: string }.
 */
export function podeGerar(
  org: {
    status: OrgStatus;
    plano: Plano | null;
    proximo_relatorio_liberado_em: Date | null;
  },
  agora: Date = new Date(),
): { ok: boolean; motivo?: string } {
  if (org.status !== 'active') {
    return { ok: false, motivo: 'org_inativa' };
  }
  if (org.plano === null) {
    return { ok: false, motivo: 'sem_plano' };
  }
  if (org.proximo_relatorio_liberado_em !== null && org.proximo_relatorio_liberado_em > agora) {
    return { ok: false, motivo: 'ciclo_em_andamento' };
  }
  return { ok: true };
}
