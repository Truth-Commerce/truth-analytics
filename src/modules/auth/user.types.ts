export type UserRole = 'admin_truth' | 'analista' | 'client';
export type OrgStatus = 'pending' | 'active' | 'suspended';
export type Plano = 'weekly' | 'biweekly' | 'monthly';

export type UserAccess = {
  id: string;
  orgId: string;
  role: UserRole;
  orgStatus: OrgStatus;
  plano: Plano | null;
  /**
   * Presente SÓ quando este UserAccess é sintético, produzido por
   * requireActiveOrg durante impersonação ("ver como cliente" — Task 12
   * H4): contém o id do admin_truth real por trás da sessão. Ausente em
   * todo UserAccess real (cliente/analista/admin navegando como si mesmo)
   * — retrocompatível, nenhum código existente que ignora este campo muda
   * de comportamento.
   */
  impersonadoPor?: string;
};
