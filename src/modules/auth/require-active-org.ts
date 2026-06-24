import { redirect } from 'next/navigation';

import { requireSession } from '@/modules/auth/require-session';
import type { UserAccess } from '@/modules/auth/user.types';

export async function requireActiveOrg(): Promise<UserAccess> {
  const access = await requireSession();
  if (access.orgStatus !== 'active') redirect('/aguardando');
  return access;
}
