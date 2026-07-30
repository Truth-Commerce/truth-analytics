import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';
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

/**
 * @param margemMs — renova quando faltar menos que isso p/ expirar; default
 * 60s preserva o comportamento do pipeline; o cron de renovação proativa
 * passa 24h.
 */
export async function getValidAccessToken(
  orgId: string,
  margemMs: number = REFRESH_MARGIN_MS,
  options: { deadlineAt?: number } = {},
): Promise<string> {
  if (options.deadlineAt !== undefined && Date.now() >= options.deadlineAt) throw new Error('bling_deadline_exceeded');
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, PROVIDER)))
    .limit(1);
  if (!row || !row.access_token || !row.refresh_token) {
    throw new Error('sem_conexao_bling');
  }

  const expMs = row.expira_em ? row.expira_em.getTime() : 0;
  if (expMs - Date.now() > margemMs) {
    return decryptSecret(row.access_token);
  }

  // precisa renovar
  try {
    const refreshed = await blingProvider.refresh(decryptSecret(row.refresh_token), options);
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
  } catch (err) {
    // Só falha PERMANENTE (refresh_token inválido — 400/401 classificado em
    // oauth.ts) marca a conexão como expirada e notifica. Transitória
    // (429/5xx/rede) faz rethrow SEM tocar o status: refresh-on-use tenta de
    // novo no próximo uso/dia e o refresh_token vale ~30d.
    const permanente = err instanceof Error && err.message === 'bling_refresh_invalido';
    if (!permanente) throw err;

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

/**
 * Orgs `active` com conexão Bling saudável (status 'ok' e access_token
 * presente) — universo do cron de sync incremental de pedidos.
 *
 * Ordem determinística: mais atrasadas primeiro (last_sync_at ASC, nunca
 * sincronizadas na frente) — sob o cap de 50 orgs por execução, evita
 * starvation quando houver mais orgs que o lote.
 */
export async function listOrgsComBlingOk(): Promise<string[]> {
  const rows = await db
    .select({ orgId: connections.org_id })
    .from(connections)
    .innerJoin(organizations, eq(organizations.id, connections.org_id))
    .where(
      and(
        eq(connections.provider, PROVIDER),
        eq(connections.status, 'ok'),
        isNotNull(connections.access_token),
        eq(organizations.status, 'active'),
      ),
    )
    .orderBy(sql`${connections.last_sync_at} asc nulls first`);
  return rows.map((r) => r.orgId);
}

/**
 * Registra o instante da última sincronização de pedidos da org (frescor dos
 * dados). Chamado por collectBlingOrders — pipeline e cron de sync passam
 * pelo mesmo caminho.
 */
export async function touchLastSyncAt(orgId: string, quando: Date = new Date()): Promise<void> {
  await db
    .update(connections)
    .set({ last_sync_at: quando })
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, PROVIDER)));
}

/**
 * Orgs com conexão Bling 'ok' cujo token expira em até `margemMs` — universo
 * do passo de renovação proativa do cron diário.
 */
export async function listConnectionsExpirando(
  margemMs: number,
  agora: Date = new Date(),
): Promise<string[]> {
  const limite = new Date(agora.getTime() + margemMs);
  const rows = await db
    .select({ orgId: connections.org_id })
    .from(connections)
    .where(
      and(
        eq(connections.provider, PROVIDER),
        eq(connections.status, 'ok'),
        isNotNull(connections.access_token),
        isNotNull(connections.refresh_token),
        isNotNull(connections.expira_em),
        lte(connections.expira_em, limite),
      ),
    );
  return rows.map((r) => r.orgId);
}
