import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connections, orders, organizations } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('collect-bling — integração', () => {
  let orgId = '';
  let orgId2 = '';

  const PERIODO = {
    inicio: new Date('2024-01-01'),
    fim: new Date('2024-01-31'),
  };

  const MOCK_ORDERS = [
    {
      blingOrderId: `bling-order-${RUN}-1`,
      canal: 'Loja Virtual',
      data: new Date('2024-01-10T00:00:00.000Z'),
      valorTotal: 199.9,
      frete: 15.0,
      itens: [{ sku: 'SKU-A', nome: 'Produto A', quantidade: 2, valor: 92.45 }],
    },
    {
      blingOrderId: `bling-order-${RUN}-2`,
      canal: 'Mercado Livre',
      data: new Date('2024-01-15T00:00:00.000Z'),
      valorTotal: 450.0,
      frete: 0,
      itens: [
        { sku: 'SKU-B', nome: 'Produto B', quantidade: 1, valor: 450.0 },
      ],
    },
  ];

  beforeAll(async () => {
    // Seed primary org with active status + bling connection
    const [o] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-collect-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = o.id;

    // Insert a dummy connection so getValidAccessToken doesn't fail (spy will intercept fetchOrders before token lookup)
    await tdb.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: 'fake-encrypted-access',
      refresh_token: 'fake-encrypted-refresh',
      expira_em: new Date(Date.now() + 3600 * 1000),
      status: 'ok',
    });

    // Seed isolation org
    const [o2] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-collect-iso-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId2 = o2.id;
  });

  afterAll(async () => {
    await tdb.delete(orders).where(eq(orders.org_id, orgId));
    await tdb.delete(orders).where(eq(orders.org_id, orgId2));
    await tdb.delete(connections).where(eq(connections.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId2));
    await sql.end();
  });

  it('insere pedidos e retorna contagem correta', async () => {
    const provider = await import('@/modules/providers/bling/provider');
    vi.spyOn(provider.blingProvider, 'fetchOrders').mockResolvedValueOnce(MOCK_ORDERS);

    const { collectBlingOrders } = await import('@/modules/pipeline/steps/collect-bling');
    const result = await collectBlingOrders(orgId, PERIODO);

    expect(result.total).toBe(2);
    expect(result.inseridos).toBe(2);
  });

  it('upsert é idempotente — segunda execução não duplica', async () => {
    const provider = await import('@/modules/providers/bling/provider');
    vi.spyOn(provider.blingProvider, 'fetchOrders').mockResolvedValueOnce(MOCK_ORDERS);

    const { collectBlingOrders } = await import('@/modules/pipeline/steps/collect-bling');
    await collectBlingOrders(orgId, PERIODO);

    // Query DB directly and check row count
    const rows = await tdb
      .select()
      .from(orders)
      .where(eq(orders.org_id, orgId));

    // Must have exactly 2 rows — no duplicates despite running twice total
    expect(rows.length).toBe(2);

    // Values should reflect the mock orders
    const order1 = rows.find((r) => r.bling_order_id === `bling-order-${RUN}-1`);
    expect(order1).toBeDefined();
    expect(order1!.canal).toBe('Loja Virtual');
    // numeric STRING mode
    expect(order1!.valor_total).toBe('199.90');
    expect(order1!.frete).toBe('15.00');

    const order2 = rows.find((r) => r.bling_order_id === `bling-order-${RUN}-2`);
    expect(order2).toBeDefined();
    expect(order2!.valor_total).toBe('450.00');
    expect(order2!.frete).toBe('0.00');
  });

  it('upsert atualiza valores na colisão', async () => {
    const UPDATED_ORDERS = [
      {
        ...MOCK_ORDERS[0],
        valorTotal: 299.9,
        frete: 20.0,
        canal: 'Loja Virtual Atualizada',
      },
    ];

    const provider = await import('@/modules/providers/bling/provider');
    vi.spyOn(provider.blingProvider, 'fetchOrders').mockResolvedValueOnce(UPDATED_ORDERS);

    const { collectBlingOrders } = await import('@/modules/pipeline/steps/collect-bling');
    await collectBlingOrders(orgId, PERIODO);

    const rows = await tdb
      .select()
      .from(orders)
      .where(eq(orders.org_id, orgId));

    // Still only 2 rows total
    expect(rows.length).toBe(2);

    const updated = rows.find((r) => r.bling_order_id === `bling-order-${RUN}-1`);
    expect(updated).toBeDefined();
    expect(updated!.valor_total).toBe('299.90');
    expect(updated!.frete).toBe('20.00');
    expect(updated!.canal).toBe('Loja Virtual Atualizada');
  });

  it('isolamento por org — pedidos de uma org não aparecem na outra', async () => {
    const ORG2_ORDERS = [
      {
        blingOrderId: `bling-order-${RUN}-org2`,
        canal: 'Shopee',
        data: new Date('2024-01-20T00:00:00.000Z'),
        valorTotal: 75.0,
        frete: 5.0,
        itens: [],
      },
    ];

    const provider = await import('@/modules/providers/bling/provider');
    vi.spyOn(provider.blingProvider, 'fetchOrders').mockResolvedValueOnce(ORG2_ORDERS);

    const { collectBlingOrders } = await import('@/modules/pipeline/steps/collect-bling');
    await collectBlingOrders(orgId2, PERIODO);

    // org2 must have exactly 1 order
    const rowsOrg2 = await tdb
      .select()
      .from(orders)
      .where(eq(orders.org_id, orgId2));
    expect(rowsOrg2.length).toBe(1);
    expect(rowsOrg2[0].bling_order_id).toBe(`bling-order-${RUN}-org2`);

    // org1 must not see org2's orders (still 2)
    const rowsOrg1 = await tdb
      .select()
      .from(orders)
      .where(eq(orders.org_id, orgId));
    expect(rowsOrg1.length).toBe(2);
    expect(rowsOrg1.every((r) => r.org_id === orgId)).toBe(true);
  });
});
