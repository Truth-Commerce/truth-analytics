'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSession } from '@/modules/auth/require-session';
import { assertConnectionOrgAccess } from '@/modules/connections/connection-access';
import type { OlistOAuthSurface } from '@/modules/connections/olist-oauth-attempt';
import {
  configureProviderCredentials,
  disconnectProvider,
} from '@/modules/connections/provider-connection.repository';

export type OlistConnectionActionState = { ok?: boolean; error?: string };

const ContextSchema = z.object({
  orgId: z.string().uuid(),
  surface: z.enum(['client_connections', 'analyst_org']),
});

const CredentialsSchema = ContextSchema.extend({
  clientId: z.string().trim().min(1).max(255),
  clientSecret: z.string().trim().min(1).max(1024),
});

export async function saveOlistCredentialsAction(
  _previous: OlistConnectionActionState,
  formData: FormData,
): Promise<OlistConnectionActionState> {
  const parsed = CredentialsSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: 'Revise as credenciais e tente novamente.' };
  const access = await requireSession();
  try {
    await assertConnectionOrgAccess(access, parsed.data.orgId, parsed.data.surface);
    await configureProviderCredentials({
      orgId: parsed.data.orgId,
      provider: 'olist',
      clientId: parsed.data.clientId,
      clientSecret: parsed.data.clientSecret,
      actorUserId: access.id,
    });
    revalidateDerivedSurface(parsed.data.surface, parsed.data.orgId);
    return { ok: true };
  } catch (error) {
    return { error: safeActionMessage(error) };
  }
}

export async function disconnectOlistAction(
  _previous: OlistConnectionActionState,
  formData: FormData,
): Promise<OlistConnectionActionState> {
  const parsed = ContextSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: 'Solicitação inválida.' };
  const access = await requireSession();
  try {
    await assertConnectionOrgAccess(access, parsed.data.orgId, parsed.data.surface);
    await disconnectProvider({
      orgId: parsed.data.orgId,
      provider: 'olist',
      actorUserId: access.id,
    });
    revalidateDerivedSurface(parsed.data.surface, parsed.data.orgId);
    return { ok: true };
  } catch (error) {
    return { error: safeActionMessage(error) };
  }
}

function readForm(formData: FormData): Record<string, string> {
  return {
    orgId: String(formData.get('orgId') ?? ''),
    surface: String(formData.get('surface') ?? ''),
    clientId: String(formData.get('clientId') ?? ''),
    clientSecret: String(formData.get('clientSecret') ?? ''),
  };
}

function revalidateDerivedSurface(surface: OlistOAuthSurface, orgId: string): void {
  revalidatePath(surface === 'client_connections' ? '/conexoes' : `/analista/${orgId}`);
}

function safeActionMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'acesso_negado') return 'Você não tem acesso a esta organização.';
  if (code === 'organizacao_inativa') return 'Esta organização não está ativa.';
  if (code.startsWith('Modo visualização')) return 'Ações indisponíveis no modo de visualização.';
  return 'Não foi possível atualizar a conexão Olist.';
}
