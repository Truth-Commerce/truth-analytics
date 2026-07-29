import { getOrganizationById } from '@/modules/admin/admin.repository';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { assertNaoImpersonando } from '@/modules/auth/require-active-org';
import type { UserAccess } from '@/modules/auth/user.types';
import type { OlistOAuthSurface } from '@/modules/connections/olist-oauth-attempt';

export async function assertConnectionOrgAccess(
  access: UserAccess,
  orgId: string,
  surface: OlistOAuthSurface,
): Promise<void> {
  await assertNaoImpersonando();

  if (access.role === 'client') {
    if (surface !== 'client_connections' || access.orgId !== orgId) {
      throw new Error('acesso_negado');
    }
  } else {
    if (surface !== 'analyst_org') throw new Error('acesso_negado');
    await assertOrgAccess(access, orgId);
  }

  const organization = await getOrganizationById(orgId);
  if (!organization || organization.status !== 'active') {
    throw new Error('organizacao_inativa');
  }
}
