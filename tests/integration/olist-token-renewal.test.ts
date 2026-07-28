import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/client';
import { auditLog, connections, notifications, organizations, users } from '@/db/schema';
import {
  configureProviderCredentials,
  getProviderConnectionSummary,
  getProviderOAuthCredentials,
  listProviderConnectionsExpiring,
  saveProviderTokens,
} from '@/modules/connections/provider-connection.repository';
import {
  OLIST_REFRESH_BATCH,
  OLIST_REFRESH_MARGIN_MS,
  renewOlistConnection,
} from '@/modules/connections/olist-token-renewal';
import { olistOAuthProvider } from '@/modules/providers/olist/provider';
import { OAuthProviderError } from '@/modules/providers/oauth.types';

const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!DATABASE_URL_TEST)('renovação Olist — integração', () => {
  let orgId = '';
  let inactiveOrgId = '';
  let urgentOrgId = '';
  let clientId = '';
  let analystId = '';

  beforeAll(async () => {
    const insertedOrgs = await db
      .insert(organizations)
      .values([
        { name: `ta-olist-renew-${RUN}`, status: 'active' },
        { name: `ta-olist-renew-inactive-${RUN}`, status: 'inactive' },
        { name: `ta-olist-renew-urgent-${RUN}`, status: 'active' },
      ])
      .returning({ id: organizations.id });
    orgId = insertedOrgs[0]!.id;
    inactiveOrgId = insertedOrgs[1]!.id;
    urgentOrgId = insertedOrgs[2]!.id;
    const insertedUsers = await db
      .insert(users)
      .values([
        { org_id: orgId, email: `olist-renew-client-${RUN}@example.com`, senha_hash: 'h', role: 'client' },
        { org_id: orgId, email: `olist-renew-analyst-${RUN}@example.com`, senha_hash: 'h', role: 'analista' },
      ])
      .returning({ id: users.id, role: users.role });
    clientId = insertedUsers.find((user) => user.role === 'client')!.id;
    analystId = insertedUsers.find((user) => user.role === 'analista')!.id;
    await db.update(organizations).set({ analista_id: analystId }).where(eq(organizations.id, orgId));
    await db.insert(users).values({
      org_id: inactiveOrgId,
      email: `olist-renew-inactive-${RUN}@example.com`,
      senha_hash: 'h',
      role: 'client',
    });
    await db.insert(users).values({
      org_id: urgentOrgId,
      email: `olist-renew-urgent-${RUN}@example.com`,
      senha_hash: 'h',
      role: 'client',
    });
  });

  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete(notifications).where(inArray(notifications.user_id, [clientId, analystId]));
    await db.delete(auditLog).where(eq(auditLog.org_id, orgId));
    await db.delete(connections).where(inArray(connections.org_id, [orgId, inactiveOrgId, urgentOrgId]));
    await seedAuthorized(orgId, clientId, 3600);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await db.update(organizations).set({ analista_id: null }).where(eq(organizations.id, orgId));
    await db.delete(notifications).where(inArray(notifications.user_id, [clientId, analystId]));
    await db.delete(auditLog).where(inArray(auditLog.org_id, [orgId, inactiveOrgId, urgentOrgId]));
    await db.delete(connections).where(inArray(connections.org_id, [orgId, inactiveOrgId, urgentOrgId]));
    await db.delete(users).where(inArray(users.org_id, [orgId, inactiveOrgId, urgentOrgId]));
    await db.delete(organizations).where(inArray(organizations.id, [orgId, inactiveOrgId, urgentOrgId]));
  });

  async function seedAuthorized(targetOrgId: string, actorUserId: string, expiresInSeconds: number) {
    await configureProviderCredentials({
      orgId: targetOrgId,
      provider: 'olist',
      clientId: 'olist-client-id',
      clientSecret: 'olist-client-secret',
      actorUserId,
    });
    const credentials = await getProviderOAuthCredentials(targetOrgId, 'olist');
    await saveProviderTokens({
      orgId: targetOrgId,
      provider: 'olist',
      credentialVersion: credentials.version,
      tokens: {
        accessToken: 'access-old',
        refreshToken: 'refresh-old',
        expiresInSeconds,
        refreshExpiresInSeconds: 86_400,
      },
    });
  }

  it('não chama HTTP quando o acesso está fora da margem', async () => {
    await seedAuthorized(orgId, clientId, 4 * 3600);
    const refresh = vi.spyOn(olistOAuthProvider, 'refresh');
    await expect(renewOlistConnection(orgId)).resolves.toBe('renewed');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('rotaciona ambos os tokens e mantém status configurado', async () => {
    vi.spyOn(olistOAuthProvider, 'refresh').mockResolvedValueOnce({
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      expiresInSeconds: 7200,
      refreshExpiresInSeconds: 172_800,
    });
    await expect(renewOlistConnection(orgId)).resolves.toBe('renewed');
    expect(await getProviderConnectionSummary(orgId, 'olist')).toMatchObject({
      status: 'configurado',
      authorized: true,
      lastErrorCode: null,
    });
  });

  it('preserva tokens/status e grava código seguro em falha transitória', async () => {
    vi.spyOn(olistOAuthProvider, 'refresh').mockRejectedValueOnce(
      new OAuthProviderError('olist_token_erro_transiente', 'transient'),
    );
    await expect(renewOlistConnection(orgId)).resolves.toBe('transient');
    expect(await getProviderConnectionSummary(orgId, 'olist')).toMatchObject({
      status: 'configurado',
      authorized: true,
      lastErrorCode: 'olist_token_erro_transiente',
    });
    expect(
      await db
        .select()
        .from(notifications)
        .where(inArray(notifications.user_id, [clientId, analystId])),
    ).toHaveLength(0);
  });

  it('expira versão inalterada e avisa cliente e analista com href específico', async () => {
    vi.spyOn(olistOAuthProvider, 'refresh').mockRejectedValueOnce(
      new OAuthProviderError('olist_token_erro_permanente', 'permanent'),
    );
    await expect(renewOlistConnection(orgId)).resolves.toBe('expired');
    expect(await getProviderConnectionSummary(orgId, 'olist')).toMatchObject({
      status: 'expirado',
      lastErrorCode: 'olist_token_erro_permanente',
    });
    const alerts = await db
      .select({ userId: notifications.user_id, href: notifications.href, titulo: notifications.titulo })
      .from(notifications)
      .where(inArray(notifications.user_id, [clientId, analystId]));
    expect(alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: clientId, href: '/conexoes' }),
        expect.objectContaining({ userId: analystId, href: `/analista/${orgId}?tab=conexao` }),
      ]),
    );
    expect(JSON.stringify(alerts)).toContain('Olist');
  });

  it.each(['success', 'error'] as const)('não sobrescreve atualização concorrente antes de %s', async (mode) => {
    vi.spyOn(olistOAuthProvider, 'refresh').mockImplementationOnce(async () => {
      const credentials = await getProviderOAuthCredentials(orgId, 'olist');
      await saveProviderTokens({
        orgId,
        provider: 'olist',
        credentialVersion: credentials.version,
        tokens: { accessToken: 'peer-access', refreshToken: 'peer-refresh', expiresInSeconds: 7200 },
      });
      if (mode === 'error') {
        throw new OAuthProviderError('olist_token_erro_permanente', 'permanent');
      }
      return { accessToken: 'loser-access', refreshToken: 'loser-refresh', expiresInSeconds: 7200 };
    });
    await expect(renewOlistConnection(orgId)).resolves.toBe('won-by-peer');
    expect(await getProviderConnectionSummary(orgId, 'olist')).toMatchObject({
      status: 'configurado',
      lastErrorCode: null,
    });
    expect(
      await db
        .select()
        .from(notifications)
        .where(inArray(notifications.user_id, [clientId, analystId])),
    ).toHaveLength(0);
  });

  it('lista somente candidatas Olist ativas, mais urgentes primeiro e no limite', async () => {
    const [inactiveActor] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.org_id, inactiveOrgId));
    await seedAuthorized(inactiveOrgId, inactiveActor!.id, 60);
    const [urgentActor] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.org_id, urgentOrgId));
    await seedAuthorized(urgentOrgId, urgentActor!.id, 60);
    const candidates = await listProviderConnectionsExpiring({
      provider: 'olist',
      marginMs: OLIST_REFRESH_MARGIN_MS,
      limit: 1,
    });
    expect(OLIST_REFRESH_BATCH).toBe(50);
    expect(candidates.map((candidate) => candidate.orgId)).toEqual([urgentOrgId]);
    expect(candidates).toHaveLength(1);
  });
});
