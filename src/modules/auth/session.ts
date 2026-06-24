import { auth } from '@/modules/auth/auth';
import { getUserAccessById } from '@/modules/auth/user.repository';
import type { UserAccess } from '@/modules/auth/user.types';

export async function getSessionContext(): Promise<UserAccess | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return getUserAccessById(userId);
}
