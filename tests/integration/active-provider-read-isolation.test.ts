import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connections, orders, organizations } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('active provider order read isolation', () => {
  let orgId = '';
  const agora = new Date('2026-07-30T12:00:00Z');

  beforeAll(async () => {
    const [org] = await tdb.insert(organizations).values({ name: `active-source-${RUN}`, status: 'active' }).returning({ id: organizations.id });
    orgId = org.id;
    await tdb.insert(connections).values([
      { org_id: orgId, provider: 'bling', data_generation: 1, access_token: 'test', status: 'ok' },
      { org_id: orgId, provider: 'olist', data_generation: 3, access_token: 'test', status: 'configurado' },
    ]);
    await tdb.insert(orders).values([
      { org_id: orgId, provider: 'bling', source_generation: 1, provider_order_id: `b-${RUN}`, bling_order_id: `b-${RUN}`, provider_status: '1', canal: 'bling', data: agora, valor_total: '100', itens: [] },
      { org_id: orgId, provider: 'olist', source_generation: 3, provider_order_id: `o-${RUN}`, provider_status: '1', canal: 'olist', data: agora, valor_total: '900', itens: [] },
      { org_id: orgId, provider: 'olist', source_generation: 2, provider_order_id: `old-${RUN}`, provider_status: '1', canal: 'olist', data: agora, valor_total: '8000', itens: [] },
      { org_id: orgId, provider: 'olist', source_generation: 3, provider_order_id: `cancel-${RUN}`, provider_status: '2', canal: 'olist', data: agora, valor_total: '7000', itens: [] },
    ]);
  });
  afterAll(async () => { await tdb.delete(orders).where(eq(orders.org_id, orgId)); await tdb.delete(connections).where(eq(connections.org_id, orgId)); await tdb.delete(organizations).where(eq(organizations.id, orgId)); await sql.end(); });

  it('selects only the active source and changes atomically after cutover', async () => {
    const { getActiveErpConnection } = await import('@/modules/connections/active-provider.repository');
    const { getTotaisSemanais } = await import('@/modules/alerts/alert-data.repository');
    const bling = await getActiveErpConnection(orgId);
    expect(bling).toMatchObject({ provider: 'bling', sourceGeneration: 1 });
    expect((await getTotaisSemanais(bling!, agora)).total7dias).toBe(100);
    await tdb.transaction(async (tx) => {
      await tx.update(connections).set({ status: 'configurado' }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));
      await tx.update(connections).set({ status: 'ok' }).where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
    });
    const olist = await getActiveErpConnection(orgId);
    expect(olist).toMatchObject({ provider: 'olist', sourceGeneration: 3 });
    expect((await getTotaisSemanais(olist!, agora)).total7dias).toBe(900);
  });
});
