import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, trackedProducts } from '@/db/schema';
import {
  addTrackedProduct,
  listTrackedProducts,
  removeTrackedProduct,
  toggleTrackedProduct,
  TRACKED_LIMITS,
} from '@/modules/tracked-products/tracked-product.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('tracked-product.repository — integração', () => {
  let orgId = '';

  beforeAll(async () => {
    const [o] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-tp-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgId = o.id;
  });

  afterAll(async () => {
    await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('adiciona e lista por org', async () => {
    await addTrackedProduct({ orgId, nome: 'Produto A', sku: 'A1', keywords: ['a'], plano: 'weekly' });
    const list = await listTrackedProducts(orgId);
    expect(list.length).toBe(1);
    expect(list[0].nome).toBe('Produto A');
  });

  it('isola produtos por org (outra org não vê os dados)', async () => {
    const [outraOrg] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-tp-iso-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    try {
      await addTrackedProduct({ orgId: outraOrg.id, nome: 'Produto Outra Org', sku: null, keywords: [], plano: 'weekly' });
      const listOrg = await listTrackedProducts(orgId);
      const listOutra = await listTrackedProducts(outraOrg.id);
      // a org principal não vê o produto da outra org
      expect(listOrg.every((p) => p.org_id === orgId)).toBe(true);
      expect(listOutra.every((p) => p.org_id === outraOrg.id)).toBe(true);
    } finally {
      await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, outraOrg.id));
      await tdb.delete(organizations).where(eq(organizations.id, outraOrg.id));
    }
  });

  it('toggle muda ativo da linha correta', async () => {
    const [p] = await listTrackedProducts(orgId);
    expect(p.ativo).toBe(true);
    await toggleTrackedProduct({ orgId, id: p.id, ativo: false });
    const [updated] = await listTrackedProducts(orgId);
    expect(updated.ativo).toBe(false);
    // restaura
    await toggleTrackedProduct({ orgId, id: p.id, ativo: true });
  });

  it('respeita o limite do plano', async () => {
    // já tem 1 produto; adiciona até o limite weekly (10) e a próxima lança erro
    const existentes = await listTrackedProducts(orgId);
    for (let i = existentes.length; i < TRACKED_LIMITS.weekly; i++) {
      await addTrackedProduct({ orgId, nome: `P${i}`, sku: null, keywords: [], plano: 'weekly' });
    }
    // agora temos exatamente TRACKED_LIMITS.weekly produtos
    const total = await listTrackedProducts(orgId);
    expect(total.length).toBe(TRACKED_LIMITS.weekly);
    // próxima adição deve lançar limite_tracked_products
    await expect(
      addTrackedProduct({ orgId, nome: 'excedente', sku: null, keywords: [], plano: 'weekly' }),
    ).rejects.toThrow('limite_tracked_products');
  });

  it('remove só a linha da org correta', async () => {
    const antes = await listTrackedProducts(orgId);
    const [primeiro] = antes;
    await removeTrackedProduct({ orgId, id: primeiro.id });
    const depois = await listTrackedProducts(orgId);
    expect(depois.find((x) => x.id === primeiro.id)).toBeUndefined();
    expect(depois.length).toBe(antes.length - 1);
  });
});
