import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { orders, organizations, reports } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();

describe.skipIf(!url)('orders Olist expand — integração', () => {
  const sql = postgres(url ?? '', { prepare: false });
  const db = drizzle(sql);
  let orgId = '';

  beforeAll(async () => {
    const [organization] = await db
      .insert(organizations)
      .values({ name: `ta-test-olist-orders-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = organization.id;

    await db.insert(reports).values({
      org_id: orgId,
      periodo_inicio: new Date('2024-01-01'),
      periodo_fim: new Date('2024-01-31'),
      status: 'done',
      source_provider: 'bling',
      source_generation: 1,
    });
  });

  afterAll(async () => {
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(orders).where(eq(orders.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('aceita pedido Olist sem identificador Bling e mantém unicidade por provider', async () => {
    const value = {
      org_id: orgId,
      provider: 'olist',
      provider_order_id: '991',
      bling_order_id: null,
      canal: 'Mercado Livre',
      data: new Date(),
      valor_total: '100.00',
    };

    await db.insert(orders).values(value);
    await expect(db.insert(orders).values(value)).rejects.toMatchObject({ code: '23505' });
  });

  it('preenche relatórios históricos como Bling', async () => {
    const rows = await db
      .select({ source: reports.source_provider })
      .from(reports)
      .where(eq(reports.org_id, orgId));

    expect(rows.every((row) => row.source === 'bling')).toBe(true);
  });

  it('mantém writers legados válidos durante rolling deploy', async () => {
    const [row] = await db
      .insert(orders)
      .values({
        org_id: orgId,
        bling_order_id: `legacy-${RUN}`,
        canal: 'Bling',
        data: new Date(),
        valor_total: '10.00',
      })
      .returning();

    expect(row.provider_order_id).toBe(`legacy-${RUN}`);
    expect(row.source_generation).toBe(1);
  });
});
