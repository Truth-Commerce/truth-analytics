import { redirect } from 'next/navigation';

import { getSessionContext } from '@/modules/auth/session';
import type { UserAccess } from '@/modules/auth/user.types';

export async function requireAdmin(): Promise<UserAccess> {
  const access = await getSessionContext();
  if (!access || access.role !== 'admin_truth') redirect('/sign-in');
  return access;
}
