import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connections, orders, organizations } from '@/db/schema';
import type { RawOrder } from '@/modules/providers/types';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

// Respeita o novo contrato de fetchOrders(onPage): entrega os pedidos via
// onPage (streaming por página) e retorna [] — como o provider real faz.
function mockFetchOrdersOnce(
  provider: typeof import('@/modules/providers/bling/provider'),
  pedidos: RawOrder[],
) {
  return vi
    .spyOn(provider.blingDataProvider, 'fetchOrders')
    .mockImplementationOnce(async (_orgId, _request, onPage) => {
      await onPage({
        orders: pedidos.map(({ blingOrderId, ...order }) => ({
          ...order,
          providerOrderId: blingOrderId,
          providerStatus: '',
        })),
        offset: 0,
        nextOffset: pedidos.length,
        total: pedidos.length,
        done: true,
      });
    });
}

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
    mockFetchOrdersOnce(provider, MOCK_ORDERS);

    const { collectBlingOrders } = await import('@/modules/pipeline/steps/collect-bling');
    const result = await collectBlingOrders(orgId, PERIODO);

    expect(result.total).toBe(2);
    expect(result.processados).toBe(2);
  });

  it('upsert é idempotente — segunda execução não duplica', async () => {
    const provider = await import('@/modules/providers/bling/provider');
    mockFetchOrdersOnce(provider, MOCK_ORDERS);

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

  it('upsert na colisão atualiza canal/valor, mas PRESERVA frete e itens (domínio do enriquecimento)', async () => {
    // Contrato novo: a listagem /pedidos/vendas NÃO entrega frete nem itens — só o
    // detalhe entrega, via enrichOrders. Por isso a recoleta (que roda a cada sync,
    // recobrindo 2 dias) só toca no que a listagem realmente sabe: canal, data,
    // valor_total. Sobrescrever frete/itens aqui apagaria o enriquecimento a cada
    // ciclo. Este teste trava exatamente essa garantia.
    const UPDATED_ORDERS = [
      {
        ...MOCK_ORDERS[0],
        valorTotal: 299.9,
        frete: 20.0, // veio no mock, mas a listagem real nunca traz isto: deve ser ignorado
        canal: 'Loja Virtual Atualizada',
      },
    ];

    const provider = await import('@/modules/providers/bling/provider');
    mockFetchOrdersOnce(provider, UPDATED_ORDERS);

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
    // Atualizados pela listagem:
    expect(updated!.valor_total).toBe('299.90');
    expect(updated!.canal).toBe('Loja Virtual Atualizada');
    // PRESERVADO do valor original (15.00 dos MOCK_ORDERS): a recoleta não clobbera
    // o frete que o enriquecimento seria dono de gravar.
    expect(updated!.frete).toBe('15.00');
  });

  it('grava Bling pela chave provider-aware sem apagar detalhe', async () => {
    const provider = await import('@/modules/providers/bling/provider');
    const ORDER_WITH_RESOLVED_CHANNEL = { ...MOCK_ORDERS[0], canal: 'Loja Virtual Atualizada' };
    mockFetchOrdersOnce(provider, [ORDER_WITH_RESOLVED_CHANNEL]);

    const { collectBlingOrders } = await import('@/modules/pipeline/steps/collect-bling');
    await collectBlingOrders(orgId, PERIODO);
    await tdb
      .update(orders)
      .set({
        itens: [{ sku: 'SKU-1', nome: 'Item', quantidade: 1, valor: 10 }],
        enriquecido_em: new Date(),
      })
      .where(
        and(eq(orders.org_id, orgId), eq(orders.provider_order_id, ORDER_WITH_RESOLVED_CHANNEL.blingOrderId)),
      );

    mockFetchOrdersOnce(provider, [ORDER_WITH_RESOLVED_CHANNEL]);
    await collectBlingOrders(orgId, PERIODO);

    const [row] = await tdb
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.org_id, orgId),
          eq(orders.provider, 'bling'),
          eq(orders.provider_order_id, ORDER_WITH_RESOLVED_CHANNEL.blingOrderId),
        ),
      );

    expect(row.bling_order_id).toBe(ORDER_WITH_RESOLVED_CHANNEL.blingOrderId);
    expect(row.itens).toHaveLength(1);
  });

  it('upsert na colisão com canal fallback ("Bling") NÃO rebaixa o canal já resolvido', async () => {
    // Se o mapa de /canais-venda estiver indisponível numa recoleta, o canal cai
    // para "Bling". Isso não pode apagar o nome real ("Loja Virtual Atualizada")
    // que uma coleta anterior já gravou.
    const FALLBACK_ORDERS = [{ ...MOCK_ORDERS[0], valorTotal: 305.0, canal: 'Bling' }];

    const provider = await import('@/modules/providers/bling/provider');
    mockFetchOrdersOnce(provider, FALLBACK_ORDERS);

    const { collectBlingOrders } = await import('@/modules/pipeline/steps/collect-bling');
    await collectBlingOrders(orgId, PERIODO);

    const rows = await tdb.select().from(orders).where(eq(orders.org_id, orgId));
    const row = rows.find((r) => r.bling_order_id === `bling-order-${RUN}-1`);
    expect(row!.valor_total).toBe('305.00'); // valor ainda atualiza
    expect(row!.canal).toBe('Loja Virtual Atualizada'); // canal preservado, não vira "Bling"
  });

  it('guard: pedido com blingOrderId vazio é ignorado, válido é persistido', async () => {
    const VALID_ORDER = {
      blingOrderId: `bling-order-${RUN}-guard`,
      canal: 'Loja Virtual',
      data: new Date('2024-01-25T00:00:00.000Z'),
      valorTotal: 100.0,
      frete: 0,
      itens: [],
    };
    const EMPTY_ID_ORDER = {
      blingOrderId: '',
      canal: 'Canal Inválido',
      data: new Date('2024-01-25T00:00:00.000Z'),
      valorTotal: 50.0,
      frete: 0,
      itens: [],
    };

    // Use a fresh org to avoid interference with other tests
    const [guardOrg] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-guard-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const guardOrgId = guardOrg.id;

    try {
      const provider = await import('@/modules/providers/bling/provider');
      mockFetchOrdersOnce(provider, [VALID_ORDER, EMPTY_ID_ORDER]);

      const { collectBlingOrders } = await import('@/modules/pipeline/steps/collect-bling');
      const result = await collectBlingOrders(guardOrgId, PERIODO);

      // total reflects all fetched orders (including empty-id one)
      expect(result.total).toBe(2);
      // only the valid one is persisted
      expect(result.processados).toBe(1);

      // Verify DB directly
      const rows = await tdb
        .select()
        .from(orders)
        .where(eq(orders.org_id, guardOrgId));
      expect(rows.length).toBe(1);
      expect(rows[0].bling_order_id).toBe(`bling-order-${RUN}-guard`);
    } finally {
      await tdb.delete(orders).where(eq(orders.org_id, guardOrgId));
      await tdb.delete(organizations).where(eq(organizations.id, guardOrgId));
    }
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
    mockFetchOrdersOnce(provider, ORG2_ORDERS);

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
