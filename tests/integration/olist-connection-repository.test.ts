import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, connections, organizations, users } from '@/db/schema';
import {
  configureProviderCredentials,
  disconnectProvider,
  getProviderConnectionSummary,
  getProviderOAuthCredentials,
  saveProviderTokens,
} from '@/modules/connections/provider-connection.repository';
import { encryptConnectionSecret } from '@/modules/connections/connection-secrets';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('Olist provider connection repository — integração', () => {
  let orgA = '';
  let orgB = '';
  let actorUserId = '';
  const guardedOrgIds: string[] = [];
  const guardedUserIds: string[] = [];

  beforeAll(async () => {
    const orgs = await db
      .insert(organizations)
      .values([
        { name: `ta-olist-repo-a-${RUN}`, status: 'active' },
        { name: `ta-olist-repo-b-${RUN}`, status: 'active' },
      ])
      .returning({ id: organizations.id });
    [orgA, orgB] = orgs.map((org) => org.id);
    const [actor] = await db
      .insert(users)
      .values({
        org_id: orgA,
        email: `ta-olist-repo-${RUN}@example.com`,
        senha_hash: 'test-hash',
        role: 'client',
      })
      .returning({ id: users.id });
    actorUserId = actor.id;
    await db.insert(connections).values({ org_id: orgA, provider: 'bling', status: 'ok' });
  });

  afterAll(async () => {
    const orgIds = [orgA, orgB, ...guardedOrgIds];
    await db.delete(auditLog).where(inArray(auditLog.org_id, orgIds));
    await db.delete(connections).where(inArray(connections.org_id, orgIds));
    await db.delete(users).where(inArray(users.id, [actorUserId, ...guardedUserIds]));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  });

  it('cifra credenciais, mantém Bling ok e retorna resumo sem segredos', async () => {
    await configureProviderCredentials({
      orgId: orgA,
      provider: 'olist',
      clientId: 'client-plain',
      clientSecret: 'secret-plain',
      actorUserId,
    });
    const [stored] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.org_id, orgA), eq(connections.provider, 'olist')));
    expect(stored.status).toBe('configurado');
    expect(stored.oauth_client_id).not.toContain('client-plain');
    expect(stored.oauth_client_secret).not.toContain('secret-plain');

    const summary = await getProviderConnectionSummary(orgA, 'olist');
    expect(summary).toMatchObject({
      provider: 'olist',
      credentialsConfigured: true,
      authorized: false,
      operational: false,
    });
    expect(JSON.stringify(summary)).not.toMatch(/client-plain|secret-plain/);
    const [bling] = await db
      .select({ status: connections.status })
      .from(connections)
      .where(and(eq(connections.org_id, orgA), eq(connections.provider, 'bling')));
    expect(bling.status).toBe('ok');
  });

  it('salva tokens somente para a versão atual e mantém Olist configurado', async () => {
    const credentials = await getProviderOAuthCredentials(orgA, 'olist');
    expect(credentials).toMatchObject({ clientId: 'client-plain', clientSecret: 'secret-plain' });
    await expect(
      saveProviderTokens({
        orgId: orgA,
        provider: 'olist',
        credentialVersion: 'wrong-version',
        tokens: { accessToken: 'access', refreshToken: 'refresh', expiresInSeconds: 14_400 },
      }),
    ).resolves.toBe(false);
    await expect(
      saveProviderTokens({
        orgId: orgA,
        provider: 'olist',
        credentialVersion: credentials.version,
        tokens: {
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresInSeconds: 14_400,
          refreshExpiresInSeconds: 86_400,
        },
      }),
    ).resolves.toBe(true);
    expect(await getProviderConnectionSummary(orgA, 'olist')).toMatchObject({
      status: 'configurado',
      authorized: true,
      operational: false,
    });
  });

  it('recusa trocar credenciais do Olist que é o ERP ativo sem rollback prévio', async () => {
    const active = await createActiveOlistConnection('credentials');
    const before = mutableConnectionState(await getOlistConnection(active.orgId));
    expect(await olistAuditCount(active.orgId)).toBe(0);

    await expect(
      configureProviderCredentials({
        orgId: active.orgId,
        provider: 'olist',
        clientId: 'client-should-not-replace-active-olist',
        clientSecret: 'secret-should-not-replace-active-olist',
        actorUserId: active.actorUserId,
      }),
    ).rejects.toThrow('olist_erp_ativo');

    expect(mutableConnectionState(await getOlistConnection(active.orgId))).toEqual(before);
    expect(await olistAuditCount(active.orgId)).toBe(0);
  });

  it('recusa desconectar o Olist que é o ERP ativo sem rollback prévio', async () => {
    const active = await createActiveOlistConnection('disconnect');
    const before = mutableConnectionState(await getOlistConnection(active.orgId));
    expect(await olistAuditCount(active.orgId)).toBe(0);

    await expect(
      disconnectProvider({ orgId: active.orgId, provider: 'olist', actorUserId: active.actorUserId }),
    ).rejects.toThrow('olist_erp_ativo');

    expect(mutableConnectionState(await getOlistConnection(active.orgId))).toEqual(before);
    expect(await olistAuditCount(active.orgId)).toBe(0);
  });

  it('substituir credenciais limpa tokens e audita sem segredo', async () => {
    await db
      .update(connections)
      .set({ status: 'configurado' })
      .where(and(eq(connections.org_id, orgA), eq(connections.provider, 'olist')));
    await configureProviderCredentials({
      orgId: orgA,
      provider: 'olist',
      clientId: 'client-new',
      clientSecret: 'secret-new',
      actorUserId,
    });
    const [stored] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.org_id, orgA), eq(connections.provider, 'olist')));
    expect(stored.access_token).toBeNull();
    expect(stored.refresh_token).toBeNull();
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.org_id, orgA), eq(auditLog.acao, 'connection.olist.configurada')));
    expect(audits.at(-1)).toMatchObject({ user_id: actorUserId });
    expect(JSON.stringify(audits)).not.toMatch(/client-new|secret-new/);
  });

  it('ciphertext copiado para outro tenant falha no contexto', async () => {
    const [source] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.org_id, orgA), eq(connections.provider, 'olist')));
    await db.insert(connections).values({
      org_id: orgB,
      provider: 'olist',
      status: 'configurado',
      oauth_client_id: source.oauth_client_id,
      oauth_client_secret: source.oauth_client_secret,
    });
    await expect(getProviderOAuthCredentials(orgB, 'olist')).rejects.toThrow(
      'connection_secret_context_mismatch',
    );
  });

  it('desconectar limpa os quatro segredos e audita o ator', async () => {
    await disconnectProvider({ orgId: orgA, provider: 'olist', actorUserId });
    const [stored] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.org_id, orgA), eq(connections.provider, 'olist')));
    expect([
      stored.oauth_client_id,
      stored.oauth_client_secret,
      stored.access_token,
      stored.refresh_token,
    ]).toEqual([null, null, null, null]);
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.org_id, orgA), eq(auditLog.acao, 'connection.olist.desconectada')));
    expect(audit.user_id).toBe(actorUserId);
    expect(JSON.stringify(audit.detalhes)).not.toMatch(/client|secret|access|refresh/);
  });

  async function createActiveOlistConnection(label: string): Promise<{ orgId: string; actorUserId: string }> {
    const [org] = await db
      .insert(organizations)
      .values({ name: `ta-olist-active-${label}-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const [actor] = await db
      .insert(users)
      .values({ org_id: org.id, email: `ta-olist-active-${label}-${RUN}@example.com`, senha_hash: 'test-hash', role: 'client' })
      .returning({ id: users.id });
    guardedOrgIds.push(org.id);
    guardedUserIds.push(actor.id);
    const expiresAt = new Date('2030-01-02T03:04:05.000Z');
    const refreshExpiresAt = new Date('2030-02-03T04:05:06.000Z');
    const refreshedAt = new Date('2030-01-01T00:00:00.000Z');
    const erroredAt = new Date('2030-01-01T00:01:00.000Z');
    await db.insert(connections).values({
      org_id: org.id,
      provider: 'olist',
      status: 'ok',
      oauth_client_id: encryptConnectionSecret({ orgId: org.id, provider: 'olist', kind: 'client_id', value: 'active-client-id' }),
      oauth_client_secret: encryptConnectionSecret({ orgId: org.id, provider: 'olist', kind: 'client_secret', value: 'active-client-secret' }),
      access_token: encryptConnectionSecret({ orgId: org.id, provider: 'olist', kind: 'access_token', value: 'active-access-token' }),
      refresh_token: encryptConnectionSecret({ orgId: org.id, provider: 'olist', kind: 'refresh_token', value: 'active-refresh-token' }),
      expira_em: expiresAt,
      refresh_expira_em: refreshExpiresAt,
      last_refresh_at: refreshedAt,
      last_error_code: 'transient-before-guard',
      last_error_at: erroredAt,
      data_generation: 9,
      provider_account_fingerprint: 'a'.repeat(64),
    });
    return { orgId: org.id, actorUserId: actor.id };
  }

  async function getOlistConnection(orgId: string) {
    const [connection] = await db
      .select()
      .from(connections)
      .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
    return connection;
  }

  async function olistAuditCount(orgId: string): Promise<number> {
    const audits = await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.org_id, orgId));
    return audits.length;
  }

  function mutableConnectionState(connection: typeof connections.$inferSelect) {
    return {
      status: connection.status,
      oauthClientId: connection.oauth_client_id,
      oauthClientSecret: connection.oauth_client_secret,
      accessToken: connection.access_token,
      refreshToken: connection.refresh_token,
      expiresAt: connection.expira_em,
      refreshExpiresAt: connection.refresh_expira_em,
      lastRefreshAt: connection.last_refresh_at,
      lastErrorCode: connection.last_error_code,
      lastErrorAt: connection.last_error_at,
      generation: connection.data_generation,
      fingerprint: connection.provider_account_fingerprint,
    };
  }
});
