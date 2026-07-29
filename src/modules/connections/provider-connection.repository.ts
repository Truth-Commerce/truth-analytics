import { createHash } from 'node:crypto';
import {
  and,
  asc,
  eq,
  isNotNull,
  lte,
} from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import {
  decryptConnectionSecret,
  encryptConnectionSecret,
} from '@/modules/connections/connection-secrets';
import type { ErpProviderId, OAuthTokens } from '@/modules/providers/types';

export type ProviderConnectionSummary = {
  provider: ErpProviderId;
  status: string;
  credentialsConfigured: boolean;
  authorized: boolean;
  operational: boolean;
  expiresAt: Date | null;
  refreshExpiresAt: Date | null;
  lastRefreshAt: Date | null;
  lastSyncAt: Date | null;
  lastErrorCode: string | null;
};

export type ProviderOAuthCredentials = {
  clientId: string;
  clientSecret: string;
  version: string;
};

export type ConnectionRef = {
  id: string;
  orgId: string;
  provider: ErpProviderId;
};

export type ProviderRefreshContext = {
  orgId: string;
  provider: ErpProviderId;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  expiresAt: Date;
  version: string;
};

export async function configureProviderCredentials(input: {
  orgId: string;
  provider: ErpProviderId;
  clientId: string;
  clientSecret: string;
  actorUserId: string;
}): Promise<void> {
  const oauthClientId = encryptConnectionSecret({
    orgId: input.orgId,
    provider: input.provider,
    kind: 'client_id',
    value: input.clientId,
  });
  const oauthClientSecret = encryptConnectionSecret({
    orgId: input.orgId,
    provider: input.provider,
    kind: 'client_secret',
    value: input.clientSecret,
  });
  const values = {
    org_id: input.orgId,
    provider: input.provider,
    oauth_client_id: oauthClientId,
    oauth_client_secret: oauthClientSecret,
    access_token: null,
    refresh_token: null,
    expira_em: null,
    refresh_expira_em: null,
    last_refresh_at: null,
    last_error_code: null,
    last_error_at: null,
    status: 'configurado' as const,
  };
  await db
    .insert(connections)
    .values(values)
    .onConflictDoUpdate({
      target: [connections.org_id, connections.provider],
      set: {
        oauth_client_id: values.oauth_client_id,
        oauth_client_secret: values.oauth_client_secret,
        access_token: null,
        refresh_token: null,
        expira_em: null,
        refresh_expira_em: null,
        last_refresh_at: null,
        last_error_code: null,
        last_error_at: null,
        status: 'configurado',
        // Any credential rotation fences old Olist data even if /info resolves to the same account.
        data_generation: sql`${connections.data_generation} + 1`,
        provider_account_fingerprint: null,
      },
    });
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: `connection.${input.provider}.configurada`,
  });
}

export async function getProviderConnectionSummary(
  orgId: string,
  provider: ErpProviderId,
): Promise<ProviderConnectionSummary | null> {
  const [row] = await db
    .select({
      status: connections.status,
      oauthClientId: connections.oauth_client_id,
      oauthClientSecret: connections.oauth_client_secret,
      accessToken: connections.access_token,
      refreshToken: connections.refresh_token,
      expiresAt: connections.expira_em,
      refreshExpiresAt: connections.refresh_expira_em,
      lastRefreshAt: connections.last_refresh_at,
      lastSyncAt: connections.last_sync_at,
      lastErrorCode: connections.last_error_code,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)))
    .limit(1);
  if (!row) return null;
  return {
    provider,
    status: row.status,
    credentialsConfigured: Boolean(row.oauthClientId && row.oauthClientSecret),
    authorized: Boolean(row.accessToken && row.refreshToken && row.status === 'configurado'),
    operational: provider === 'bling' && row.status === 'ok',
    expiresAt: row.expiresAt,
    refreshExpiresAt: row.refreshExpiresAt,
    lastRefreshAt: row.lastRefreshAt,
    lastSyncAt: row.lastSyncAt,
    lastErrorCode: row.lastErrorCode,
  };
}

export async function getProviderOAuthCredentials(
  orgId: string,
  provider: ErpProviderId,
): Promise<ProviderOAuthCredentials> {
  const [row] = await db
    .select({
      oauthClientId: connections.oauth_client_id,
      oauthClientSecret: connections.oauth_client_secret,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)))
    .limit(1);
  if (!row?.oauthClientId || !row.oauthClientSecret) {
    throw new Error('provider_credentials_missing');
  }
  return {
    clientId: decryptConnectionSecret({
      orgId,
      provider,
      kind: 'client_id',
      ciphertext: row.oauthClientId,
    }),
    clientSecret: decryptConnectionSecret({
      orgId,
      provider,
      kind: 'client_secret',
      ciphertext: row.oauthClientSecret,
    }),
    version: credentialVersion(row.oauthClientId, row.oauthClientSecret),
  };
}

export async function saveProviderTokens(input: {
  orgId: string;
  provider: ErpProviderId;
  credentialVersion: string;
  tokens: OAuthTokens;
  now?: Date;
}): Promise<boolean> {
  const [row] = await db
    .select({
      id: connections.id,
      oauthClientId: connections.oauth_client_id,
      oauthClientSecret: connections.oauth_client_secret,
    })
    .from(connections)
    .where(and(eq(connections.org_id, input.orgId), eq(connections.provider, input.provider)))
    .limit(1);
  if (
    !row?.oauthClientId ||
    !row.oauthClientSecret ||
    credentialVersion(row.oauthClientId, row.oauthClientSecret) !== input.credentialVersion
  ) {
    return false;
  }
  const now = input.now ?? new Date();
  const updated = await db
    .update(connections)
    .set({
      access_token: encryptConnectionSecret({
        orgId: input.orgId,
        provider: input.provider,
        kind: 'access_token',
        value: input.tokens.accessToken,
      }),
      refresh_token: encryptConnectionSecret({
        orgId: input.orgId,
        provider: input.provider,
        kind: 'refresh_token',
        value: input.tokens.refreshToken,
      }),
      expira_em: new Date(now.getTime() + input.tokens.expiresInSeconds * 1000),
      refresh_expira_em: new Date(
        now.getTime() + (input.tokens.refreshExpiresInSeconds ?? 86_400) * 1000,
      ),
      last_refresh_at: now,
      last_error_code: null,
      last_error_at: null,
      status: 'configurado',
    })
    .where(
      and(
        eq(connections.id, row.id),
        eq(connections.org_id, input.orgId),
        eq(connections.provider, input.provider),
        eq(connections.oauth_client_id, row.oauthClientId),
        eq(connections.oauth_client_secret, row.oauthClientSecret),
      ),
    )
    .returning({ id: connections.id });
  return updated.length === 1;
}

export async function getValidAccessTokenForProvider(
  orgId: string,
  provider: ErpProviderId,
  marginMs = 60_000,
): Promise<string> {
  const [row] = await db
    .select({ accessToken: connections.access_token, expiresAt: connections.expira_em })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)))
    .limit(1);
  if (!row?.accessToken) throw new Error('provider_not_authorized');
  if (!row.expiresAt || row.expiresAt.getTime() - Date.now() <= marginMs) {
    throw new Error('provider_token_refresh_required');
  }
  return decryptConnectionSecret({
    orgId,
    provider,
    kind: 'access_token',
    ciphertext: row.accessToken,
  });
}

export async function getProviderRefreshContext(
  orgId: string,
  provider: ErpProviderId,
): Promise<ProviderRefreshContext> {
  const [row] = await db
    .select({
      oauthClientId: connections.oauth_client_id,
      oauthClientSecret: connections.oauth_client_secret,
      accessToken: connections.access_token,
      refreshToken: connections.refresh_token,
      expiresAt: connections.expira_em,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)))
    .limit(1);
  if (
    !row?.oauthClientId ||
    !row.oauthClientSecret ||
    !row.accessToken ||
    !row.refreshToken ||
    !row.expiresAt
  ) {
    throw new Error('provider_not_authorized');
  }
  return {
    orgId,
    provider,
    clientId: decryptConnectionSecret({
      orgId,
      provider,
      kind: 'client_id',
      ciphertext: row.oauthClientId,
    }),
    clientSecret: decryptConnectionSecret({
      orgId,
      provider,
      kind: 'client_secret',
      ciphertext: row.oauthClientSecret,
    }),
    refreshToken: decryptConnectionSecret({
      orgId,
      provider,
      kind: 'refresh_token',
      ciphertext: row.refreshToken,
    }),
    expiresAt: row.expiresAt,
    version: connectionVersion(row),
  };
}

export async function saveRefreshedProviderTokens(input: {
  context: ProviderRefreshContext;
  tokens: OAuthTokens;
  now?: Date;
}): Promise<boolean> {
  const current = await getVersionedProviderRow(input.context.orgId, input.context.provider);
  if (
    !current ||
    !hasVersionedSecrets(current) ||
    connectionVersion(current) !== input.context.version
  ) return false;
  const now = input.now ?? new Date();
  const updated = await db
    .update(connections)
    .set({
      access_token: encryptConnectionSecret({
        orgId: input.context.orgId,
        provider: input.context.provider,
        kind: 'access_token',
        value: input.tokens.accessToken,
      }),
      refresh_token: encryptConnectionSecret({
        orgId: input.context.orgId,
        provider: input.context.provider,
        kind: 'refresh_token',
        value: input.tokens.refreshToken,
      }),
      expira_em: new Date(now.getTime() + input.tokens.expiresInSeconds * 1000),
      refresh_expira_em: new Date(
        now.getTime() + (input.tokens.refreshExpiresInSeconds ?? 86_400) * 1000,
      ),
      last_refresh_at: now,
      last_error_code: null,
      last_error_at: null,
      status: 'configurado',
    })
    .where(versionWhere(current, input.context.orgId, input.context.provider))
    .returning({ id: connections.id });
  return updated.length === 1;
}

export async function disconnectProvider(input: {
  orgId: string;
  provider: ErpProviderId;
  actorUserId: string;
}): Promise<void> {
  await db
    .update(connections)
    .set({
      oauth_client_id: null,
      oauth_client_secret: null,
      access_token: null,
      refresh_token: null,
      expira_em: null,
      refresh_expira_em: null,
      last_refresh_at: null,
      last_error_code: null,
      last_error_at: null,
      status: 'erro',
    })
    .where(and(eq(connections.org_id, input.orgId), eq(connections.provider, input.provider)));
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: `connection.${input.provider}.desconectada`,
  });
}

export async function listProviderConnectionsExpiring(input: {
  provider: ErpProviderId;
  marginMs: number;
  limit?: number;
  now?: Date;
}): Promise<ConnectionRef[]> {
  const expiresBefore = new Date((input.now ?? new Date()).getTime() + input.marginMs);
  const rows = await db
    .select({ id: connections.id, orgId: connections.org_id, provider: connections.provider })
    .from(connections)
    .innerJoin(organizations, eq(organizations.id, connections.org_id))
    .where(
      and(
        eq(connections.provider, input.provider),
        eq(connections.status, 'configurado'),
        eq(organizations.status, 'active'),
        isNotNull(connections.oauth_client_id),
        isNotNull(connections.oauth_client_secret),
        isNotNull(connections.access_token),
        isNotNull(connections.refresh_token),
        isNotNull(connections.expira_em),
        lte(connections.expira_em, expiresBefore),
      ),
    )
    .orderBy(asc(connections.expira_em))
    .limit(input.limit ?? 50);
  return rows.map((row) => ({
    id: row.id,
    orgId: row.orgId,
    provider: row.provider as ErpProviderId,
  }));
}

export async function markProviderConnectionError(input: {
  orgId: string;
  provider: ErpProviderId;
  code: string;
  permanent: boolean;
  expectedVersion: string;
  now?: Date;
}): Promise<boolean> {
  const current = await getVersionedProviderRow(input.orgId, input.provider);
  if (
    !current ||
    !hasVersionedSecrets(current) ||
    current.status !== 'configurado' ||
    connectionVersion(current) !== input.expectedVersion
  ) return false;
  const updated = await db
    .update(connections)
    .set({
      last_error_code: input.code,
      last_error_at: input.now ?? new Date(),
      ...(input.permanent ? { status: 'expirado' } : {}),
    })
    .where(configuredVersionWhere(current, input.orgId, input.provider))
    .returning({ id: connections.id });
  return updated.length === 1;
}

export function credentialVersion(clientIdCiphertext: string, clientSecretCiphertext: string): string {
  return createHash('sha256')
    .update(clientIdCiphertext)
    .update('\0')
    .update(clientSecretCiphertext)
    .digest('hex');
}

type VersionedProviderRow = {
  id: string;
  status: string;
  oauthClientId: string | null;
  oauthClientSecret: string | null;
  accessToken: string | null;
  refreshToken: string | null;
};

type CompleteVersionedProviderRow = VersionedProviderRow & {
  oauthClientId: string;
  oauthClientSecret: string;
  accessToken: string;
  refreshToken: string;
};

async function getVersionedProviderRow(
  orgId: string,
  provider: ErpProviderId,
): Promise<VersionedProviderRow | null> {
  const [row] = await db
    .select({
      id: connections.id,
      status: connections.status,
      oauthClientId: connections.oauth_client_id,
      oauthClientSecret: connections.oauth_client_secret,
      accessToken: connections.access_token,
      refreshToken: connections.refresh_token,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)))
    .limit(1);
  return row ?? null;
}

function connectionVersion(row: Omit<VersionedProviderRow, 'id' | 'status'>): string {
  return createHash('sha256')
    .update(row.oauthClientId ?? '')
    .update('\0')
    .update(row.oauthClientSecret ?? '')
    .update('\0')
    .update(row.accessToken ?? '')
    .update('\0')
    .update(row.refreshToken ?? '')
    .digest('hex');
}

function hasVersionedSecrets(row: VersionedProviderRow): row is CompleteVersionedProviderRow {
  return Boolean(
    row.oauthClientId &&
    row.oauthClientSecret &&
    row.accessToken &&
    row.refreshToken
  );
}

function versionWhere(row: CompleteVersionedProviderRow, orgId: string, provider: ErpProviderId) {
  return and(
    eq(connections.id, row.id),
    eq(connections.org_id, orgId),
    eq(connections.provider, provider),
    eq(connections.oauth_client_id, row.oauthClientId),
    eq(connections.oauth_client_secret, row.oauthClientSecret),
    eq(connections.access_token, row.accessToken),
    eq(connections.refresh_token, row.refreshToken),
  );
}

function configuredVersionWhere(
  row: CompleteVersionedProviderRow,
  orgId: string,
  provider: ErpProviderId,
) {
  return and(
    versionWhere(row, orgId, provider),
    eq(connections.status, 'configurado'),
  );
}
