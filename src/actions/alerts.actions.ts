'use server';

import { revalidatePath } from 'next/cache';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { resolverAlerta } from '@/modules/alerts/alert.repository';

export async function resolverAlertaAction(formData: FormData): Promise<void> {
  const access = await requireActiveOrg();
  const alertId = String(formData.get('alertId') ?? '');
  if (!alertId) return;
  await resolverAlerta(alertId, access.orgId); // escopado por org — id alheio é no-op
  revalidatePath('/dashboard');
}
