import { createHash } from 'node:crypto';
import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  lte,
  sql,
} from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import {
  decryptConnectionSecret,
  encryptConnectionSecret,
} from '@/modules/connections/connection-secrets';
import type { ErpProviderId, OAuthTokens } from '@/modules/providers/types';
import type { ErpDataSource } from '@/modules/providers/data.types';

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
  status: 'configurado' | 'ok';
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  expiresAt: Date;
  version: string;
};

export type OlistPublicationContext = {
  credentialVersion: string;
  dataGeneration: number;
};

/** Lifecycle carried from the HTTP/request owner into every Olist DB mutation. */
export type ProviderConnectionLifecycle = { signal?: AbortSignal; deadlineAt?: number };
const OLIST_DB_MAX_WAIT_MS = 10_000;

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
  await db.transaction(async (tx) => {
    await tx.insert(connections).values(values).onConflictDoUpdate({
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
    // Rotating an Olist credential invalidates all readiness/leases together
    // with its generation and account fingerprint above.
    if (input.provider === 'olist') {
      await tx.execute(sql`DELETE FROM connection_sync_state WHERE org_id=${input.orgId} AND provider='olist'`);
    }
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
    authorized: Boolean(row.accessToken && row.refreshToken && (row.status === 'configurado' || row.status === 'ok')),
    operational: row.status === 'ok',
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

/** Snapshot captured before provider I/O and used as the final publication CAS. */
export async function getOlistPublicationContext(orgId: string): Promise<OlistPublicationContext> {
  const [row] = await db
    .select({
      oauthClientId: connections.oauth_client_id,
      oauthClientSecret: connections.oauth_client_secret,
      dataGeneration: connections.data_generation,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')))
    .limit(1);
  if (!row?.oauthClientId || !row.oauthClientSecret) throw new Error('provider_credentials_missing');
  return {
    credentialVersion: credentialVersion(row.oauthClientId, row.oauthClientSecret),
    dataGeneration: row.dataGeneration,
  };
}

/** The account fingerprint is a required binding, never caller supplied request state. */
export async function getOlistAccountFingerprint(orgId: string, expectedGeneration?: number): Promise<string | null> {
  const [row] = await db
    .select({ fingerprint: connections.provider_account_fingerprint })
    .from(connections)
    .where(and(
      eq(connections.org_id, orgId),
      eq(connections.provider, 'olist'),
      ...(expectedGeneration === undefined ? [] : [eq(connections.data_generation, expectedGeneration)]),
    ))
    .limit(1);
  return row?.fingerprint ?? null;
}

/** Exact source CAS used by provider-neutral collectors to publish freshness. */
export async function touchLastSyncAtForSource(source: ErpDataSource, quando: Date = new Date()): Promise<boolean> {
  const updated = await db.update(connections).set({ last_sync_at: quando }).where(and(
    eq(connections.org_id, source.orgId),
    eq(connections.provider, source.provider),
    eq(connections.data_generation, source.sourceGeneration),
  )).returning({ id: connections.id });
  return updated.length === 1;
}

/** Reads freshness from the same provider/generation fence used for publishing it. */
export async function getLastSyncAtForSource(source: ErpDataSource): Promise<Date | null> {
  const [row] = await db.select({ lastSyncAt: connections.last_sync_at }).from(connections).where(and(
    eq(connections.org_id, source.orgId),
    eq(connections.provider, source.provider),
    eq(connections.data_generation, source.sourceGeneration),
  )).limit(1);
  return row?.lastSyncAt ?? null;
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
      status: connections.status,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)))
    .limit(1);
  if (
    !row?.oauthClientId ||
    !row.oauthClientSecret ||
    !row.accessToken ||
    !row.refreshToken ||
    !row.expiresAt ||
    (row.status !== 'configurado' && row.status !== 'ok')
  ) {
    throw new Error('provider_not_authorized');
  }
  return {
    orgId,
    provider,
    status: row.status,
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
  lifecycle?: ProviderConnectionLifecycle;
}): Promise<boolean> {
  return withOlistMutationTransaction(input.lifecycle, async (tx) => {
    await setOlistMutationTimeouts(tx, input.lifecycle);
    const current = await getLockedVersionedProviderRow(tx, input.context.orgId, input.context.provider);
    if (!current || !hasVersionedSecrets(current) || connectionVersion(current) !== input.context.version) return false;
    assertLifecycleActive(input.lifecycle);
    const now = input.now ?? new Date();
    await setOlistMutationTimeouts(tx, input.lifecycle);
    const updated = await tx.update(connections).set({
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
      status: input.context.status,
    }).where(versionWhere(current, input.context.orgId, input.context.provider)).returning({ id: connections.id });
    return updated.length === 1;
  });
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
        inArray(connections.status, ['configurado', 'ok']),
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
  lifecycle?: ProviderConnectionLifecycle;
}): Promise<boolean> {
  return withOlistMutationTransaction(input.lifecycle, async (tx) => {
    await setOlistMutationTimeouts(tx, input.lifecycle);
    const current = await getLockedVersionedProviderRow(tx, input.orgId, input.provider);
    if (!current || !hasVersionedSecrets(current) || (current.status !== 'configurado' && current.status !== 'ok') || connectionVersion(current) !== input.expectedVersion) return false;
    assertLifecycleActive(input.lifecycle);
    await setOlistMutationTimeouts(tx, input.lifecycle);
    const updated = await tx.update(connections).set({
      last_error_code: input.code,
      last_error_at: input.now ?? new Date(),
      ...(input.permanent ? { status: 'expirado' } : {}),
    }).where(configuredVersionWhere(current, input.orgId, input.provider)).returning({ id: connections.id });
    return updated.length === 1;
  });
}

function assertLifecycleActive(lifecycle?: ProviderConnectionLifecycle): void {
  if (lifecycle?.signal?.aborted || (lifecycle?.deadlineAt !== undefined && lifecycle.deadlineAt <= Date.now())) {
    throw new Error('olist_db_lifecycle_inactive');
  }
}

function lifecycleTimeoutMs(lifecycle?: ProviderConnectionLifecycle): number {
  const remaining = lifecycle?.deadlineAt === undefined ? OLIST_DB_MAX_WAIT_MS : lifecycle.deadlineAt - Date.now();
  return Math.max(1, Math.min(OLIST_DB_MAX_WAIT_MS, remaining));
}

type MutationTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function withOlistMutationTransaction<T>(lifecycle: ProviderConnectionLifecycle | undefined, work: (tx: MutationTransaction) => Promise<T>): Promise<T> {
  assertLifecycleActive(lifecycle);
  return db.transaction(async (tx) => {
    // These are server-side limits: unlike Promise.race they stop lock/query work.
    await setOlistMutationTimeouts(tx, lifecycle);
    assertLifecycleActive(lifecycle);
    const result = await work(tx);
    // Keep this inside the transaction: an abort after the final mutation must
    // turn into a rollback rather than a successful commit.
    assertLifecycleActive(lifecycle);
    return result;
  });
}

async function setOlistMutationTimeouts(tx: MutationTransaction, lifecycle?: ProviderConnectionLifecycle): Promise<void> {
  const statementTimeoutMs = lifecycleTimeoutMs(lifecycle);
  await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`));
  const lockTimeoutMs = lifecycleTimeoutMs(lifecycle);
  await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${lockTimeoutMs}ms'`));
  assertLifecycleActive(lifecycle);
}

async function getLockedVersionedProviderRow(tx: MutationTransaction, orgId: string, provider: ErpProviderId): Promise<VersionedProviderRow | null> {
  const rows = await tx.execute(sql`SELECT id, status, oauth_client_id AS "oauthClientId", oauth_client_secret AS "oauthClientSecret", access_token AS "accessToken", refresh_token AS "refreshToken" FROM connections WHERE org_id=${orgId} AND provider=${provider} FOR UPDATE`);
  return (rows[0] as VersionedProviderRow | undefined) ?? null;
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
    inArray(connections.status, ['configurado', 'ok']),
  );
}
