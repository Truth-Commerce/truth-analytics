import { createHash } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { auditLog, connectionSyncState, connections, orders, organizations, users } from '@/db/schema';
import { serverEnv } from '@/lib/env';
// Computed test loading deliberately lets CI demonstrate the missing public
// contract at runtime while TypeScript can still typecheck the RED-only commit.
const activationModule = () => import(['@/modules/connections', 'erp-activation.repository'].join('/')) as Promise<{
  activateErp: (input: unknown) => Promise<unknown>;
  rollbackErp: (input: unknown) => Promise<unknown>;
}>;

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const fingerprint = 'a'.repeat(64);

describe.skipIf(!url)('ERP activation — PostgreSQL transaction', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const tdb = drizzle(sql);
  let orgId = '';
  let adminId = '';
  let analystId = '';
  let clientId = '';
  let outsiderId = '';
  const oldEnabled = serverEnv.OLIST_DATA_SYNC_ENABLED;
  const oldOrgIds = serverEnv.OLIST_DATA_SYNC_ORG_IDS;

  const cursor = () => ({ version: 1, stage: 'ready', sourceGeneration: 1, accountFingerprint: fingerprint,
    window: { from: '2026-07-01T00:00:00.000Z', to: '2026-07-02T00:00:00.000Z' }, catchUpFrom: '2026-07-02T00:00:00.000Z', snapshot: { done: true }, catchup: { done: true, completedAt: '2026-07-02T00:00:00.000Z' },
    verify1: verification(), verify2: verification() });
  const verification = () => ({ done: true, expectedCount: 1, checksum: createHash('md5').update('olist-order||10.00').digest('hex'), dailyChecksum: createHash('md5').update('2026-07-01|10.00').digest('hex'), channelChecksum: createHash('md5').update('Olist|10.00').digest('hex') });

  beforeAll(async () => {
    [orgId] = (await tdb.insert(organizations).values({ name: `erp-activation-${RUN}`, status: 'active' }).returning({ id: organizations.id })).map((row) => row.id);
    const created = await tdb.insert(users).values([
      { org_id: orgId, email: `erp-admin-${RUN}@test.invalid`, senha_hash: 'x', role: 'admin_truth' },
      { org_id: orgId, email: `erp-analyst-${RUN}@test.invalid`, senha_hash: 'x', role: 'analista' },
      { org_id: orgId, email: `erp-client-${RUN}@test.invalid`, senha_hash: 'x', role: 'client' },
      { org_id: orgId, email: `erp-outsider-${RUN}@test.invalid`, senha_hash: 'x', role: 'analista' },
    ]).returning({ id: users.id });
    [adminId, analystId, clientId, outsiderId] = created.map((row) => row.id);
  });
  afterEach(async () => {
    serverEnv.OLIST_DATA_SYNC_ENABLED = true; serverEnv.OLIST_DATA_SYNC_ORG_IDS = [orgId];
    await tdb.delete(auditLog).where(eq(auditLog.org_id, orgId)); await tdb.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId)); await tdb.delete(orders).where(eq(orders.org_id, orgId)); await tdb.delete(connections).where(eq(connections.org_id, orgId));
    await tdb.update(organizations).set({ status: 'active', analista_id: analystId }).where(eq(organizations.id, orgId));
  });
  afterAll(async () => { serverEnv.OLIST_DATA_SYNC_ENABLED = oldEnabled; serverEnv.OLIST_DATA_SYNC_ORG_IDS = oldOrgIds; await tdb.update(organizations).set({ analista_id: null }).where(eq(organizations.id, orgId)); await tdb.delete(users).where(eq(users.org_id, orgId)); await tdb.delete(organizations).where(eq(organizations.id, orgId)); await sql.end(); });

  async function seed(options: { active?: 'bling' | 'olist' | null; ready?: boolean; generation?: number; lease?: boolean } = {}) {
    const active = options.active ?? 'bling'; const generation = options.generation ?? 1;
    await tdb.insert(connections).values([
      { org_id: orgId, provider: 'bling', status: active === 'bling' ? 'ok' : 'configurado', access_token: 'bling-access', refresh_token: 'bling-refresh' },
      { org_id: orgId, provider: 'olist', status: active === 'olist' ? 'ok' : 'configurado', data_generation: generation, provider_account_fingerprint: fingerprint, access_token: 'olist-access-secret', refresh_token: 'olist-refresh-secret' },
    ]);
    if (options.ready !== false) { await tdb.insert(connectionSyncState).values({ org_id: orgId, provider: 'olist', source_generation: generation, account_fingerprint: fingerprint, resource: 'orders_prepare', cursor: cursor(), lease_token: options.lease ? 'live' : null, lease_expires_at: options.lease ? new Date(Date.now() + 60_000) : null }); await tdb.insert(orders).values({ org_id: orgId, provider: 'olist', source_generation: generation, provider_order_id: 'olist-order', canal: 'Olist', data: new Date('2026-07-01T12:00:00.000Z'), valor_total: '10.00', enriquecido_em: new Date() }); }
  }
  async function activeProviders() { return (await tdb.select({ provider: connections.provider }).from(connections).where(and(eq(connections.org_id, orgId), eq(connections.status, 'ok')))).map((r) => r.provider); }
  async function audits() { return tdb.select({ detalhes: auditLog.detalhes }).from(auditLog).where(eq(auditLog.org_id, orgId)); }

  it('cutover explícito pronto de Bling para Olist deixa só Olist ativo e audita fatos seguros', async () => {
    const { activateErp } = await activationModule(); await seed(); await expect(activateErp({ orgId, target: 'olist', actorUserId: adminId, mode: 'explicit' })).resolves.toMatchObject({ previous: 'bling', active: 'olist', mode: 'explicit' });
    expect(await activeProviders()).toEqual(['olist']); const [audit] = await audits(); expect(audit.detalhes).toMatchObject({ previous: 'bling', target: 'olist', mode: 'explicit' }); expect(JSON.stringify(audit.detalhes)).not.toContain('olist-access-secret');
  });
  it('readiness ausente mantém Bling e não audita', async () => { const { activateErp } = await activationModule(); await seed({ ready: false }); await expect(activateErp({ orgId, target: 'olist', actorUserId: adminId, mode: 'explicit' })).rejects.toThrow(); expect(await activeProviders()).toEqual(['bling']); expect(await audits()).toHaveLength(0); });
  it('automático só ocupa organização sem ERP e jamais substitui Bling', async () => { const { activateErp } = await activationModule(); await seed({ active: null }); await expect(activateErp({ orgId, target: 'olist', actorUserId: null, mode: 'automatic' })).resolves.toMatchObject({ active: 'olist' }); await tdb.update(connections).set({ status: 'ok' }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling'))); await expect(activateErp({ orgId, target: 'olist', actorUserId: null, mode: 'automatic' })).rejects.toThrow('erp_ativo_alterado'); });
  it('recusa cliente e analista não atribuído, mas aceita analista atribuído', async () => { const { activateErp } = await activationModule(); await seed(); await expect(activateErp({ orgId, target: 'olist', actorUserId: clientId, mode: 'explicit' })).rejects.toThrow(); await expect(activateErp({ orgId, target: 'olist', actorUserId: outsiderId, mode: 'explicit' })).rejects.toThrow(); await expect(activateErp({ orgId, target: 'olist', actorUserId: analystId, mode: 'explicit' })).resolves.toMatchObject({ active: 'olist' }); });
  it('recusa geração obsoleta e lease de preparação vivo', async () => { const { activateErp } = await activationModule(); await seed({ generation: 2 }); await tdb.update(connections).set({ data_generation: 3 }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist'))); await expect(activateErp({ orgId, target: 'olist', actorUserId: adminId, mode: 'explicit' })).rejects.toThrow(); await tdb.update(connections).set({ data_generation: 2 }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist'))); await tdb.update(connectionSyncState).set({ lease_token: 'live', lease_expires_at: new Date(Date.now() + 60_000) }).where(eq(connectionSyncState.org_id, orgId)); await expect(activateErp({ orgId, target: 'olist', actorUserId: adminId, mode: 'explicit' })).rejects.toThrow(); });
  it('exige flag e allowlist exatos para ativar Olist', async () => { const { activateErp } = await activationModule(); await seed(); serverEnv.OLIST_DATA_SYNC_ENABLED = false; await expect(activateErp({ orgId, target: 'olist', actorUserId: adminId, mode: 'explicit' })).rejects.toThrow(); serverEnv.OLIST_DATA_SYNC_ENABLED = true; serverEnv.OLIST_DATA_SYNC_ORG_IDS = []; await expect(activateErp({ orgId, target: 'olist', actorUserId: adminId, mode: 'explicit' })).rejects.toThrow(); });
  it('rollback para Bling sobrevive kill switch e preserva os dados sombra de Olist', async () => { const { rollbackErp } = await activationModule(); await seed({ active: 'olist' }); serverEnv.OLIST_DATA_SYNC_ENABLED = false; await expect(rollbackErp({ orgId, target: 'bling', actorUserId: adminId })).resolves.toMatchObject({ previous: 'olist', active: 'bling' }); const [olist] = await tdb.select().from(connections).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist'))); expect(olist).toMatchObject({ status: 'configurado', access_token: 'olist-access-secret', refresh_token: 'olist-refresh-secret', data_generation: 1, provider_account_fingerprint: fingerprint }); });
  it('falha injetada no meio restaura o ERP anterior sem auditoria', async () => { const { activateErp } = await activationModule(); await seed(); await expect(activateErp({ orgId, target: 'olist', actorUserId: adminId, mode: 'explicit', __testFailAfterDemotion: true })).rejects.toThrow(); expect(await activeProviders()).toEqual(['bling']); expect(await audits()).toHaveLength(0); });
  it('não expõe segredos no resultado da ativação', async () => { const { activateErp } = await activationModule(); await seed(); const result = await activateErp({ orgId, target: 'olist', actorUserId: adminId, mode: 'explicit' }); expect(JSON.stringify(result)).not.toMatch(/access-secret|refresh-secret|token/i); });
});
