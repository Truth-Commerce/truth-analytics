import { redirect } from 'next/navigation';

import { getSessionContext } from '@/modules/auth/session';
import type { UserAccess } from '@/modules/auth/user.types';

export async function requireSession(): Promise<UserAccess> {
  const access = await getSessionContext();
  if (!access) redirect('/sign-in');
  return access;
}
