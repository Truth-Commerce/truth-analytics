import type { OrgStatus, Plano } from '@/modules/auth/user.types';

/** Labels pt-BR de negócio — fonte única (admin, e-mails, telas). */
export const STATUS_ORG_LABEL: Record<OrgStatus, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  suspended: 'Suspenso',
};

export const PLANO_LABEL: Record<Plano, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};
