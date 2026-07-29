import type { UserRole } from '@/modules/auth/user.types';

const PAPEIS: readonly UserRole[] = ['admin_truth', 'analista', 'client'];

export type MotivoBloqueio =
  | 'papel_invalido'
  | 'proprio_usuario'
  | 'papel_igual'
  | 'ultimo_admin'
  | 'carteira_pendente'
  | 'sem_empresa_destino';

export type ContextoTroca = {
  /** Admin logado — ninguém troca o próprio papel (evita auto-lockout). */
  atorUserId: string;
  alvo: { id: string; role: UserRole; orgId: string };
  novoPapel: UserRole;
  /** Organização interna da Truth (a do admin logado). */
  orgInternaId: string;
  /** Quantas organizações têm o alvo como analista responsável. */
  carteiraDoAlvo: number;
  /** Total de admin_truth no sistema, incluindo o alvo. */
  totalAdmins: number;
};

export type VeredictoTroca =
  | { ok: true; moverParaOrgInterna: boolean }
  | { ok: false; motivo: MotivoBloqueio };

/**
 * Decide se uma troca de papel pode acontecer — regra pura, sem banco.
 *
 * A ordem dos bloqueios importa e é testada: carteira antes de empresa de
 * destino, para que o admin veja primeiro o problema que ele precisa resolver
 * (transferir a carteira) e não o segundo.
 *
 * Quem deixa de ser `client` passa a integrar a operação interna, então a
 * troca carrega o usuário para a org interna no mesmo movimento — foi assim
 * que um analista acabou lotado na org de um cliente e quase sumiu junto com
 * ela numa purga LGPD.
 */
export function avaliarTrocaDePapel(ctx: ContextoTroca): VeredictoTroca {
  if (!PAPEIS.includes(ctx.novoPapel)) return { ok: false, motivo: 'papel_invalido' };
  if (ctx.alvo.id === ctx.atorUserId) return { ok: false, motivo: 'proprio_usuario' };
  if (ctx.alvo.role === ctx.novoPapel) return { ok: false, motivo: 'papel_igual' };

  const deixaDeSerAdmin = ctx.alvo.role === 'admin_truth';
  if (deixaDeSerAdmin && ctx.totalAdmins <= 1) return { ok: false, motivo: 'ultimo_admin' };

  const deixaDeSerAnalista = ctx.alvo.role === 'analista';
  if (deixaDeSerAnalista && ctx.carteiraDoAlvo > 0) {
    return { ok: false, motivo: 'carteira_pendente' };
  }

  const viraCliente = ctx.novoPapel === 'client';
  if (viraCliente && ctx.alvo.orgId === ctx.orgInternaId) {
    return { ok: false, motivo: 'sem_empresa_destino' };
  }

  return { ok: true, moverParaOrgInterna: !viraCliente && ctx.alvo.orgId !== ctx.orgInternaId };
}
