import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { orders, organizations, productStock } from '@/db/schema';
import {
  getStockRows,
  getVendas30dPorSku,
  upsertStock,
} from '@/modules/estoque/stock.repository';
import type { ActiveErpRef } from '@/modules/orders/order-scope';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-stock-';
const AGORA = new Date();

describe.skipIf(!url)('stock.repository — integração', () => {
  let orgId = '';
  let outraOrgId = '';
  const source = (orgId: string): ActiveErpRef => ({ orgId, provider: 'bling', sourceGeneration: 1, accountFingerprint: null, lastSyncAt: null });

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [org2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}outra-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    outraOrgId = org2!.id;

    // Pedidos: 2 dentro da janela de 30d (somam 5 un. do SKU-A), 1 fora (ignorado).
    await db.insert(orders).values([
      {
        org_id: orgId,
        bling_order_id: `${RUN}-1`,
        canal: 'Shopee',
        data: new Date(AGORA.getTime() - 5 * 86_400_000),
        valor_total: '100.00',
        itens: [{ sku: 'SKU-A', nome: 'A', quantidade: 2, valor: 50 }],
      },
      {
        org_id: orgId,
        bling_order_id: `${RUN}-2`,
        canal: 'Shopee',
        data: new Date(AGORA.getTime() - 10 * 86_400_000),
        valor_total: '150.00',
        itens: [
          { sku: 'SKU-A', nome: 'A', quantidade: 3, valor: 50 },
          { nome: 'sem sku', quantidade: 9, valor: 1 },
        ],
      },
      {
        org_id: orgId,
        bling_order_id: `${RUN}-3`,
        canal: 'Shopee',
        data: new Date(AGORA.getTime() - 45 * 86_400_000),
        valor_total: '999.00',
        itens: [{ sku: 'SKU-A', nome: 'A', quantidade: 99, valor: 10 }],
      },
    ]);
    // Pedido de OUTRA org não pode vazar.
    await db.insert(orders).values({
      org_id: outraOrgId,
      bling_order_id: `${RUN}-x`,
      canal: 'Shopee',
      data: new Date(AGORA.getTime() - 2 * 86_400_000),
      valor_total: '10.00',
      itens: [{ sku: 'SKU-A', nome: 'A', quantidade: 7, valor: 10 }],
    });
  });

  afterAll(async () => {
    for (const id of [orgId, outraOrgId]) {
      await db.delete(orders).where(eq(orders.org_id, id));
      await db.delete(productStock).where(eq(productStock.org_id, id));
      await db.delete(organizations).where(eq(organizations.id, id));
    }
  });

  it('upsertStock grava, atualiza no conflito e descarta item sem sku', async () => {
    const n1 = await upsertStock(orgId, [
      { sku: 'SKU-A', nome: 'Produto A', saldo: 10 },
      { nome: 'sem sku', saldo: 5 },
    ]);
    expect(n1).toBe(1);
    const n2 = await upsertStock(orgId, [{ sku: 'SKU-A', nome: 'Produto A v2', saldo: 4 }]);
    expect(n2).toBe(1);

    const rows = await getStockRows(source(orgId));
    expect(rows).toEqual([{ sku: 'SKU-A', nome: 'Produto A v2', saldo: 4 }]);
  });

  it('upsertStock deduplica sku repetido no mesmo lote (last-wins, sem 21000)', async () => {
    const n = await upsertStock(orgId, [
      { sku: 'SKU-DUP', nome: 'Produto Dup v1', saldo: 7 },
      { sku: 'SKU-DUP', nome: 'Produto Dup v2', saldo: 3 },
    ]);
    expect(n).toBe(1);

    const rows = await getStockRows(source(orgId));
    const dup = rows.find((r) => r.sku === 'SKU-DUP');
    expect(dup).toEqual({ sku: 'SKU-DUP', nome: 'Produto Dup v2', saldo: 3 });
  });

  it('getVendas30dPorSku soma quantidade na janela, ignora itens sem sku e não vaza entre orgs', async () => {
    const mapa = await getVendas30dPorSku(source(orgId), AGORA);
    expect(mapa.get('SKU-A')).toBe(5); // 2 + 3; o pedido de 45d atrás fica fora
    expect(mapa.size).toBe(1);
  });

  it('getStockRows é escopado por org', async () => {
    const rows = await getStockRows(source(outraOrgId));
    expect(rows).toEqual([]);
  });
});
