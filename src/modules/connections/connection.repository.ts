import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import { decryptSecret, encryptSecret } from '@/modules/crypto/crypto';
import { sendBlingConnectionFailedEmail } from '@/modules/notifications/email';
import { getOrgPrimaryEmail } from '@/modules/notifications/recipients';
import { blingProvider } from '@/modules/providers/bling/provider';
import type { OAuthTokens } from '@/modules/providers/types';

const PROVIDER = 'bling';
const REFRESH_MARGIN_MS = 60_000;

function expiresAt(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

export async function saveBlingConnection(
  orgId: string,
  tokens: OAuthTokens,
): Promise<void> {
  const values = {
    org_id: orgId,
    provider: PROVIDER,
    access_token: encryptSecret(tokens.accessToken),
    refresh_token: encryptSecret(tokens.refreshToken),
    expira_em: expiresAt(tokens.expiresInSeconds),
    status: 'ok' as const,
  };
  await db
    .insert(connections)
    .values(values)
    .onConflictDoUpdate({
      target: [connections.org_id, connections.provider],
      set: {
        access_token: values.access_token,
        refresh_token: values.refresh_token,
        expira_em: values.expira_em,
        status: 'ok',
      },
    });
  await recordAudit({ orgId, acao: 'connection.bling.conectada' });
}

export async function getConnection(orgId: string) {
  const [row] = await db
    .select({
      status: connections.status,
      expira_em: connections.expira_em,
      last_sync_at: connections.last_sync_at,
      access_token: connections.access_token,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, PROVIDER)))
    .limit(1);
  if (!row) return null;
  return {
    status: row.status,
    connected: row.status === 'ok' && row.access_token !== null,
    expira_em: row.expira_em,
    last_sync_at: row.last_sync_at,
  };
}

export async function getValidAccessToken(orgId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, PROVIDER)))
    .limit(1);
  if (!row || !row.access_token || !row.refresh_token) {
    throw new Error('sem_conexao_bling');
  }

  const expMs = row.expira_em ? row.expira_em.getTime() : 0;
  if (expMs - Date.now() > REFRESH_MARGIN_MS) {
    return decryptSecret(row.access_token);
  }

  // precisa renovar
  try {
    const refreshed = await blingProvider.refresh(decryptSecret(row.refresh_token));
    await db
      .update(connections)
      .set({
        access_token: encryptSecret(refreshed.accessToken),
        refresh_token: encryptSecret(refreshed.refreshToken),
        expira_em: expiresAt(refreshed.expiresInSeconds),
        status: 'ok',
      })
      .where(eq(connections.id, row.id));
    return refreshed.accessToken;
  } catch {
    await db
      .update(connections)
      .set({ status: 'expirado' })
      .where(eq(connections.id, row.id));
    try {
      const to = await getOrgPrimaryEmail(orgId);
      if (to) await sendBlingConnectionFailedEmail(to);
    } catch {
      // e-mail nunca quebra o fluxo de erro do refresh
    }
    throw new Error('refresh_bling_falhou');
  }
}

export async function disconnectBling(orgId: string): Promise<void> {
  await db
    .update(connections)
    .set({ access_token: null, refresh_token: null, status: 'erro' })
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, PROVIDER)));
  await recordAudit({ orgId, acao: 'connection.bling.desconectada' });
}
