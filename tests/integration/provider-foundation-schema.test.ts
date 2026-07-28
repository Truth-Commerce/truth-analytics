import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  connectionSyncState,
  connections,
  orders,
  organizations,
  productStock,
} from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('provider foundation schema — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const db = drizzle(sql);
  let orgId = '';
  let otherOrgId = '';

  beforeAll(async () => {
    const [organization] = await db
      .insert(organizations)
      .values({ name: `ta-test-provider-foundation-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = organization.id;
    const [otherOrganization] = await db
      .insert(organizations)
      .values({ name: `ta-test-provider-foundation-other-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    otherOrgId = otherOrganization.id;
  });

  afterAll(async () => {
    for (const id of [orgId, otherOrgId]) {
      await db.delete(connectionSyncState).where(eq(connectionSyncState.org_id, id));
      await db.delete(orders).where(eq(orders.org_id, id));
      await db.delete(productStock).where(eq(productStock.org_id, id));
      await db.delete(connections).where(eq(connections.org_id, id));
      await db.delete(organizations).where(eq(organizations.id, id));
    }
    await sql.end();
  });

  it('preenche o identificador do provider em inserções legadas do Bling', async () => {
    const providerOrderId = `foundation-${RUN}`;
    const [order] = await db
      .insert(orders)
      .values({
        org_id: orgId,
        bling_order_id: providerOrderId,
        canal: 'Teste',
        data: new Date(),
        valor_total: '10.00',
      })
      .returning();

    expect(order.provider).toBe('bling');
    expect(order.provider_order_id).toBe(providerOrderId);

    await expect(
      db.insert(orders).values({
        org_id: otherOrgId,
        bling_order_id: providerOrderId,
        canal: 'Teste',
        data: new Date(),
        valor_total: '10.00',
      }),
    ).resolves.toBeDefined();
  });

  it('impede dois ERPs saudáveis para a mesma organização', async () => {
    await db.insert(connections).values({ org_id: orgId, provider: 'bling', status: 'ok' });

    await expect(
      db.insert(connections).values({ org_id: orgId, provider: 'olist', status: 'ok' }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('persiste cursor e lease por recurso do provider', async () => {
    const [state] = await db
      .insert(connectionSyncState)
      .values({
        org_id: orgId,
        provider: 'bling',
        resource: 'orders',
        cursor: { offset: 100 },
        lease_token: 'lease-foundation',
        lease_expires_at: new Date(Date.now() + 60_000),
      })
      .returning();

    expect(state.cursor).toEqual({ offset: 100 });
    expect(state.resource).toBe('orders');
  });
});
