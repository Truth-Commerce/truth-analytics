import { assertOrgAccess } from '@/modules/analista/analista.repository';
import type { UserAccess } from '@/modules/auth/user.types';

export async function resolveReportOrgId(
  access: UserAccess,
  requestedOrgId?: string,
): Promise<string> {
  if (!requestedOrgId || requestedOrgId === access.orgId) return access.orgId;

  if (access.role !== 'analista' && access.role !== 'admin_truth') {
    throw new Error('acesso_negado');
  }

  await assertOrgAccess(access, requestedOrgId);
  return requestedOrgId;
}
