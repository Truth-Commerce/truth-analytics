export type UserRole = 'admin_truth' | 'analista' | 'client';
export type OrgStatus = 'pending' | 'active' | 'suspended';
export type Plano = 'weekly' | 'biweekly' | 'monthly';

export type UserAccess = {
  id: string;
  orgId: string;
  role: UserRole;
  orgStatus: OrgStatus;
  plano: Plano | null;
};
