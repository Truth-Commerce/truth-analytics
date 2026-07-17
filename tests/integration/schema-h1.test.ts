import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { alerts, organizations, productStock } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-schemah1-';

describe.skipIf(!url)('schema H1 — product_stock + CHECK estoque_critico', () => {
  let orgId = '';

  afterAll(async () => {
    if (!orgId) return;
    await db.delete(alerts).where(eq(alerts.org_id, orgId));
    await db.delete(productStock).where(eq(productStock.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('insere e faz upsert por (org_id, sku)', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    await db.insert(productStock).values({ org_id: orgId, sku: 'SKU-1', nome: 'Produto 1', saldo: '10.00' });
    // Upsert: mesmo (org, sku) atualiza em vez de duplicar.
    await db
      .insert(productStock)
      .values({ org_id: orgId, sku: 'SKU-1', nome: 'Produto 1 v2', saldo: '7.00' })
      .onConflictDoUpdate({
        target: [productStock.org_id, productStock.sku],
        set: { nome: 'Produto 1 v2', saldo: '7.00' },
      });

    const rows = await db.select().from(productStock).where(eq(productStock.org_id, orgId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.nome).toBe('Produto 1 v2');
    expect(Number(rows[0]!.saldo)).toBe(7);
  });

  it('CHECK de alerts aceita estoque_critico e rejeita tipo inválido', async () => {
    await db.insert(alerts).values({
      org_id: orgId,
      tipo: 'estoque_critico',
      severidade: 'critico',
      titulo: `${PREFIX}alerta-${RUN}`,
      corpo: 'teste',
      dados: { chave_dedup: `estoque_critico:${RUN}` },
    });
    const rows = await db.select().from(alerts).where(eq(alerts.org_id, orgId));
    expect(rows.some((a) => a.tipo === 'estoque_critico')).toBe(true);

    await expect(
      db.insert(alerts).values({
        org_id: orgId,
        tipo: 'tipo_invalido',
        titulo: 'x',
        corpo: 'x',
        dados: {},
      }),
    ).rejects.toThrow();
  });
});
