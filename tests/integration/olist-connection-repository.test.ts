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

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('Olist provider connection repository — integração', () => {
  let orgA = '';
  let orgB = '';
  let actorUserId = '';

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
    await db.delete(auditLog).where(inArray(auditLog.org_id, [orgA, orgB]));
    await db.delete(connections).where(inArray(connections.org_id, [orgA, orgB]));
    await db.delete(users).where(eq(users.id, actorUserId));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
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

  it('substituir credenciais limpa tokens e audita sem segredo', async () => {
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
});
