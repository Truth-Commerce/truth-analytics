import { createHash } from 'node:crypto';

import { and, asc, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { auditLog, connectionSyncState, connections, orders, organizations, users } from '@/db/schema';
import { encryptConnectionSecret } from '@/modules/connections/connection-secrets';
import { activateErp, rollbackErp } from '@/modules/connections/erp-activation.repository';
import { encryptSecret } from '@/modules/crypto/crypto';
import { serverEnv } from '@/lib/env';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

/** Canonical binding fingerprint; every mismatch test diverges from this one. */
const FINGERPRINT = 'a'.repeat(64);
const OTHER_FINGERPRINT = 'b'.repeat(64);
const SECRET_PATTERN = /access|refresh|oauth|account|response|token|document/i;
const WINDOW_FROM = '2026-07-01T00:00:00.000Z';
const WINDOW_TO = '2026-07-02T00:00:00.000Z';

/**
 * The single Olist order every ready scenario seeds. The verification digests
 * below must reproduce exactly what `reconcileOrderReadiness` recomputes in SQL.
 */
const ORDER = {
  providerOrderId: 'olist-order',
  canal: 'Olist',
  data: new Date('2026-07-01T12:00:00.000Z'),
  valorTotal: '10.00',
};

function md5(value: string): string {
  return createHash('md5').update(value).digest('hex');
}

function verification() {
  return {
    done: true,
    expectedCount: 1,
    checksum: md5(`${ORDER.providerOrderId}||${ORDER.valorTotal}`),
    dailyChecksum: md5(`2026-07-01|${ORDER.valorTotal}`),
    channelChecksum: md5(`${ORDER.canal}|${ORDER.valorTotal}`),
  };
}

/**
 * The persisted `orders_prepare` cursor. Generation and fingerprint are explicit
 * so a test can desynchronize the cursor alone from the row that carries it.
 */
function preparationCursor(input: { generation: number; fingerprint: string }) {
  return {
    version: 1,
    stage: 'ready',
    sourceGeneration: input.generation,
    accountFingerprint: input.fingerprint,
    window: { from: WINDOW_FROM, to: WINDOW_TO },
    catchUpFrom: WINDOW_TO,
    snapshot: { done: true },
    catchup: { done: true, completedAt: WINDOW_TO },
    verify1: verification(),
    verify2: verification(),
  };
}

/** Two-party rendezvous: both transactions are open before either takes a lock. */
function createBarrier(parties: number): () => Promise<void> {
  let arrived = 0;
  let open = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return async () => {
    arrived += 1;
    if (arrived >= parties) open();
    await gate;
  };
}

type SeedOptions = {
  /** Which provider starts as the active `ok` ERP. */
  active?: 'bling' | 'olist' | null;
  /** When false, no preparation state and no shadow orders are seeded. */
  prepared?: boolean;
  connectionGeneration?: number;
  stateGeneration?: number;
  cursorGeneration?: number;
  connectionFingerprint?: string;
  stateFingerprint?: string;
  cursorFingerprint?: string;
  lease?: 'none' | 'live' | 'expired';
  olistAccessToken?: string;
  olistRefreshToken?: string;
};

describe.skipIf(!url)('ERP activation — PostgreSQL transaction', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);
  let orgId = '';
  let adminId = '';
  let analystId = '';
  let clientId = '';
  let outsiderId = '';
  const originalEnabled = serverEnv.OLIST_DATA_SYNC_ENABLED;
  const originalOrgIds = serverEnv.OLIST_DATA_SYNC_ORG_IDS;

  async function clearOrgData() {
    await tdb.delete(auditLog).where(eq(auditLog.org_id, orgId));
    await tdb.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId));
    await tdb.delete(orders).where(eq(orders.org_id, orgId));
    await tdb.delete(connections).where(eq(connections.org_id, orgId));
  }

  beforeAll(async () => {
    [orgId] = (await tdb
      .insert(organizations)
      .values({ name: `erp-activation-${RUN}`, status: 'active' })
      .returning({ id: organizations.id })).map((row) => row.id);
    const created = await tdb
      .insert(users)
      .values([
        { org_id: orgId, email: `erp-admin-${RUN}@test.invalid`, senha_hash: 'x', role: 'admin_truth' },
        { org_id: orgId, email: `erp-analyst-${RUN}@test.invalid`, senha_hash: 'x', role: 'analista' },
        { org_id: orgId, email: `erp-client-${RUN}@test.invalid`, senha_hash: 'x', role: 'client' },
        { org_id: orgId, email: `erp-outsider-${RUN}@test.invalid`, senha_hash: 'x', role: 'analista' },
      ])
      .returning({ id: users.id });
    [adminId, analystId, clientId, outsiderId] = created.map((row) => row.id);
  });

  // Rollout settings and organization state are restored before every test so
  // the suite stays order-free even when a test mutates them mid-way.
  beforeEach(async () => {
    serverEnv.OLIST_DATA_SYNC_ENABLED = true;
    serverEnv.OLIST_DATA_SYNC_ORG_IDS = [orgId];
    await clearOrgData();
    await tdb
      .update(organizations)
      .set({ status: 'active', analista_id: analystId })
      .where(eq(organizations.id, orgId));
  });

  afterAll(async () => {
    serverEnv.OLIST_DATA_SYNC_ENABLED = originalEnabled;
    serverEnv.OLIST_DATA_SYNC_ORG_IDS = originalOrgIds;
    await clearOrgData();
    await tdb.update(organizations).set({ analista_id: null }).where(eq(organizations.id, orgId));
    await tdb.delete(users).where(eq(users.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  async function seed(options: SeedOptions = {}) {
    const active = options.active === undefined ? 'bling' : options.active;
    const connectionGeneration = options.connectionGeneration ?? 1;
    const stateGeneration = options.stateGeneration ?? connectionGeneration;
    const cursorGeneration = options.cursorGeneration ?? stateGeneration;
    const connectionFingerprint = options.connectionFingerprint ?? FINGERPRINT;
    const stateFingerprint = options.stateFingerprint ?? connectionFingerprint;
    const cursorFingerprint = options.cursorFingerprint ?? stateFingerprint;
    const lease = options.lease ?? 'none';

    await tdb.insert(connections).values([
      {
        org_id: orgId,
        provider: 'bling',
        status: active === 'bling' ? 'ok' : 'configurado',
        access_token: encryptConnectionSecret({ orgId, provider: 'bling', kind: 'access_token', value: 'bling-access-secret' }),
        refresh_token: encryptConnectionSecret({ orgId, provider: 'bling', kind: 'refresh_token', value: 'bling-refresh-secret' }),
      },
      {
        org_id: orgId,
        provider: 'olist',
        status: active === 'olist' ? 'ok' : 'configurado',
        data_generation: connectionGeneration,
        provider_account_fingerprint: connectionFingerprint,
        access_token: options.olistAccessToken
          ?? encryptConnectionSecret({ orgId, provider: 'olist', kind: 'access_token', value: 'olist-access-secret' }),
        refresh_token: options.olistRefreshToken
          ?? encryptConnectionSecret({ orgId, provider: 'olist', kind: 'refresh_token', value: 'olist-refresh-secret' }),
      },
    ]);

    if (options.prepared === false) return;

    await tdb.insert(connectionSyncState).values({
      org_id: orgId,
      provider: 'olist',
      source_generation: stateGeneration,
      account_fingerprint: stateFingerprint,
      resource: 'orders_prepare',
      cursor: preparationCursor({ generation: cursorGeneration, fingerprint: cursorFingerprint }),
      lease_token: lease === 'none' ? null : 'preparation-lease',
      lease_expires_at: lease === 'none'
        ? null
        : new Date(Date.now() + (lease === 'live' ? 60_000 : -60_000)),
    });
    await tdb.insert(orders).values({
      org_id: orgId,
      provider: 'olist',
      source_generation: stateGeneration,
      provider_order_id: ORDER.providerOrderId,
      canal: ORDER.canal,
      data: ORDER.data,
      valor_total: ORDER.valorTotal,
      enriquecido_em: new Date(),
    });
  }

  async function activeProviders() {
    const rows = await tdb
      .select({ provider: connections.provider })
      .from(connections)
      .where(and(eq(connections.org_id, orgId), eq(connections.status, 'ok')))
      .orderBy(asc(connections.provider));
    return rows.map((row) => row.provider);
  }

  async function audits() {
    return tdb
      .select({ acao: auditLog.acao, detalhes: auditLog.detalhes })
      .from(auditLog)
      .where(eq(auditLog.org_id, orgId))
      .orderBy(asc(auditLog.created_at));
  }

  /**
   * Every denial publishes the same fail-closed facts: the stable domain error,
   * the untouched previous ERP and no audit trail at all.
   */
  async function expectDenied(operation: Promise<unknown>, expectedActive: string[] = ['bling']) {
    await expect(operation).rejects.toThrow('erp_ativo_alterado');
    expect(await activeProviders()).toEqual(expectedActive);
    expect(await audits()).toHaveLength(0);
  }

  const cutover = (actorUserId: string | null) => ({
    orgId,
    target: 'olist' as const,
    actorUserId,
    mode: 'explicit' as const,
  });

  it('cutover explícito pronto de Bling para Olist deixa só Olist ativo e audita fatos seguros', async () => {
    await seed();

    await expect(activateErp(cutover(adminId))).resolves.toMatchObject({
      previous: 'bling',
      active: 'olist',
      mode: 'explicit',
      expected: 1,
      persisted: 1,
      pendingDetails: 0,
      quarantinedDetails: 0,
    });

    expect(await activeProviders()).toEqual(['olist']);
    const rows = await audits();
    expect(rows).toEqual([{
      acao: 'erp.ativado',
      detalhes: {
        previous: 'bling',
        target: 'olist',
        mode: 'explicit',
        expected: 1,
        persisted: 1,
        pendingDetails: 0,
        quarantinedDetails: 0,
      },
    }]);
    expect(JSON.stringify(rows)).not.toMatch(SECRET_PATTERN);
  });

  it('não expõe segredos no resultado da ativação', async () => {
    await seed();
    const result = await activateErp(cutover(adminId));
    expect(JSON.stringify(result)).not.toMatch(/access-secret|refresh-secret|preparation-lease/i);
  });

  it('readiness ausente mantém Bling ativo e não audita', async () => {
    await seed({ prepared: false });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('organização não ativa é recusada', async () => {
    await seed();
    await tdb.update(organizations).set({ status: 'suspended' }).where(eq(organizations.id, orgId));
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('automático ocupa organização sem ERP ativo', async () => {
    await seed({ active: null });

    await expect(activateErp({ orgId, target: 'olist', actorUserId: null, mode: 'automatic' }))
      .resolves.toMatchObject({ previous: null, active: 'olist', mode: 'automatic' });

    expect(await activeProviders()).toEqual(['olist']);
    expect(await audits()).toHaveLength(1);
  });

  it('automático jamais substitui Bling ativo', async () => {
    await seed({ active: 'bling' });
    await expectDenied(activateErp({ orgId, target: 'olist', actorUserId: null, mode: 'automatic' }));
  });

  it('automático com ator informado é recusado', async () => {
    await seed({ active: null });
    await expectDenied(
      activateErp({ orgId, target: 'olist', actorUserId: adminId, mode: 'automatic' }),
      [],
    );
  });

  it('cliente jamais executa cutover explícito', async () => {
    await seed();
    await expectDenied(activateErp(cutover(clientId)));
  });

  it('analista não atribuído à organização é recusado', async () => {
    await seed();
    await expectDenied(activateErp(cutover(outsiderId)));
  });

  it('analista atribuído executa o cutover', async () => {
    await seed();
    await expect(activateErp(cutover(analystId))).resolves.toMatchObject({ active: 'olist' });
    expect(await activeProviders()).toEqual(['olist']);
  });

  it('recusa geração divergente na conexão', async () => {
    await seed({ connectionGeneration: 3, stateGeneration: 1, cursorGeneration: 1 });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('recusa geração divergente no estado de preparação', async () => {
    await seed({ connectionGeneration: 1, stateGeneration: 2, cursorGeneration: 2 });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('recusa geração divergente apenas no cursor persistido', async () => {
    await seed({ connectionGeneration: 1, stateGeneration: 1, cursorGeneration: 2 });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('recusa fingerprint divergente na conexão', async () => {
    await seed({ connectionFingerprint: OTHER_FINGERPRINT, stateFingerprint: FINGERPRINT, cursorFingerprint: FINGERPRINT });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('recusa fingerprint divergente no estado de preparação', async () => {
    await seed({ connectionFingerprint: FINGERPRINT, stateFingerprint: OTHER_FINGERPRINT, cursorFingerprint: OTHER_FINGERPRINT });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('recusa fingerprint divergente apenas no cursor persistido', async () => {
    await seed({ connectionFingerprint: FINGERPRINT, stateFingerprint: FINGERPRINT, cursorFingerprint: OTHER_FINGERPRINT });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('lease viva recusa mesmo com todo o restante válido; a mesma lease expirada libera', async () => {
    await seed({ lease: 'live' });

    await expectDenied(activateErp(cutover(adminId)));

    // Only the expiry moves: the same lease token stays on the same row.
    await tdb
      .update(connectionSyncState)
      .set({ lease_expires_at: new Date(Date.now() - 60_000) })
      .where(eq(connectionSyncState.org_id, orgId));
    const [state] = await tdb
      .select({ token: connectionSyncState.lease_token })
      .from(connectionSyncState)
      .where(eq(connectionSyncState.org_id, orgId));
    expect(state?.token).toBe('preparation-lease');

    await expect(activateErp(cutover(adminId))).resolves.toMatchObject({ active: 'olist' });
    expect(await activeProviders()).toEqual(['olist']);
  });

  it('recusa token gravado em texto puro', async () => {
    await seed({ olistAccessToken: 'olist-access-secret' });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('recusa envelope cifrado malformado', async () => {
    await seed({ olistRefreshToken: encryptSecret('nao-e-um-envelope-json') });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('recusa envelope cifrado de outro contexto', async () => {
    await seed({
      olistAccessToken: encryptConnectionSecret({
        orgId,
        provider: 'bling',
        kind: 'access_token',
        value: 'contexto-errado',
      }),
    });
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('recusa Olist com kill switch desligado', async () => {
    await seed();
    serverEnv.OLIST_DATA_SYNC_ENABLED = false;
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('recusa Olist fora da allowlist exata', async () => {
    await seed();
    serverEnv.OLIST_DATA_SYNC_ORG_IDS = [];
    await expectDenied(activateErp(cutover(adminId)));
  });

  it('rollback para Bling sobrevive ao kill switch e preserva os dados sombra de Olist', async () => {
    await seed({ active: 'olist' });
    const [before] = await tdb
      .select()
      .from(connections)
      .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
    serverEnv.OLIST_DATA_SYNC_ENABLED = false;

    await expect(rollbackErp({ orgId, target: 'bling', actorUserId: adminId })).resolves.toEqual({
      previous: 'olist',
      active: 'bling',
      mode: 'explicit',
      expected: null,
      persisted: null,
      pendingDetails: null,
      quarantinedDetails: null,
      reasons: [],
    });

    expect(await activeProviders()).toEqual(['bling']);
    const [olist] = await tdb
      .select()
      .from(connections)
      .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
    expect(olist).toMatchObject({
      status: 'configurado',
      access_token: before!.access_token,
      refresh_token: before!.refresh_token,
      data_generation: 1,
      provider_account_fingerprint: FINGERPRINT,
    });
    const [state] = await tdb
      .select({ cursor: connectionSyncState.cursor })
      .from(connectionSyncState)
      .where(eq(connectionSyncState.org_id, orgId));
    expect(state?.cursor).toMatchObject({ stage: 'ready', sourceGeneration: 1, accountFingerprint: FINGERPRINT });
  });

  it('audita o rollback com os sete fatos seguros exatos', async () => {
    await seed({ active: 'olist' });
    await rollbackErp({ orgId, target: 'bling', actorUserId: adminId });

    const rows = await audits();
    expect(rows).toEqual([{
      acao: 'erp.revertido',
      detalhes: {
        previous: 'olist',
        target: 'bling',
        mode: 'explicit',
        expected: null,
        persisted: null,
        pendingDetails: null,
        quarantinedDetails: null,
      },
    }]);
    expect(JSON.stringify(rows)).not.toMatch(SECRET_PATTERN);
  });

  it('rollback exige Olist atualmente ativo', async () => {
    await seed({ active: 'bling' });
    await expectDenied(rollbackErp({ orgId, target: 'bling', actorUserId: adminId }));
  });

  it('rollback recusa organização sem ERP ativo', async () => {
    await seed({ active: null });
    await expectDenied(rollbackErp({ orgId, target: 'bling', actorUserId: adminId }), []);
  });

  it('rollback recusa cliente', async () => {
    await seed({ active: 'olist' });
    await expectDenied(rollbackErp({ orgId, target: 'bling', actorUserId: clientId }), ['olist']);
  });

  it('falha injetada entre rebaixar e promover restaura o ERP anterior sem auditoria', async () => {
    await seed();

    await expect(activateErp({ ...cutover(adminId), __test: { failAfterDemotion: true } }))
      .rejects.toThrow('erp_activation_test_failure');

    expect(await activeProviders()).toEqual(['bling']);
    expect(await audits()).toHaveLength(0);
  });

  it('conflitos concorrentes deixam um vencedor, um erro estável e exatamente um ERP ativo', async () => {
    await seed();
    // Both transactions are open and serializable before either takes a lock,
    // so the loser fails on genuinely concurrent access, not on ordering luck.
    const barrier = createBarrier(2);

    const attempts = await Promise.allSettled([
      activateErp({ ...cutover(adminId), __test: { barrier } }),
      activateErp({ ...cutover(adminId), __test: { barrier } }),
    ]);

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected.map((attempt) => attempt.reason.message)).toEqual(['erp_ativo_alterado']);
    expect(await activeProviders()).toEqual(['olist']);
    expect(await audits()).toHaveLength(1);
  });
});
