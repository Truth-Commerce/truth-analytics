import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { orders, organizations } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();
const AGORA = new Date('2026-08-05T15:00:00Z');
const sourceFor = (orgId: string) => ({ orgId, provider: 'bling' as const, sourceGeneration: 1 });

describe.skipIf(!url)('desempenho-anual repository (integração)', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('getPedidos12Meses respeita a janela, o escopo e devolve colunas usadas pela agregação', async () => {
    let orgId = '';
    try {
      const [o] = await tdb.insert(organizations).values({ name: `ta-test-desempenho-${RUN}`, status: 'active' }).returning({ id: organizations.id });
      orgId = o.id;
      await tdb.insert(orders).values([
        // dentro da janela de 12 meses
        { org_id: orgId, bling_order_id: `ta-test-desempenho-${RUN}-1`, provider: 'bling', provider_order_id: `ta-test-desempenho-${RUN}-1`, canal: 'shopee', data: new Date('2026-07-10T12:00:00Z'), valor_total: '100.00', frete: '10.00', comissao: '15.00', itens: [{ sku: 'A', nome: 'Produto A', quantidade: 2, valor: 50 }], enriquecido_em: new Date('2026-07-10T13:00:00Z') },
        // fora da janela (13 meses atrás)
        { org_id: orgId, bling_order_id: `ta-test-desempenho-${RUN}-2`, provider: 'bling', provider_order_id: `ta-test-desempenho-${RUN}-2`, canal: 'shopee', data: new Date('2025-07-10T12:00:00Z'), valor_total: '999.00', itens: [] },
        // outro provider (fora do escopo do ERP ativo bling)
        { org_id: orgId, bling_order_id: null, provider: 'olist', provider_order_id: `ta-test-desempenho-${RUN}-3`, canal: 'olist', data: new Date('2026-07-10T12:00:00Z'), valor_total: '500.00', itens: [] },
      ]);
      const { getPedidos12Meses } = await import('@/modules/desempenho/desempenho-anual.repository');
      const rows = await getPedidos12Meses(sourceFor(orgId), AGORA);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ valor_total: '100.00', frete: '10.00', comissao: '15.00', canal: 'shopee' });
      expect(rows[0].itens).toEqual([{ sku: 'A', nome: 'Produto A', quantidade: 2, valor: 50 }]);
    } finally {
      if (orgId) {
        await tdb.delete(orders).where(eq(orders.org_id, orgId));
        await tdb.delete(organizations).where(eq(organizations.id, orgId));
      }
    }
  });

  it('getCoberturaHistorico devolve inicio do historico e pendentes de enriquecimento', async () => {
    let orgId = '';
    try {
      const [o] = await tdb.insert(organizations).values({ name: `ta-test-desempenho-cob-${RUN}`, status: 'active' }).returning({ id: organizations.id });
      orgId = o.id;
      await tdb.insert(orders).values([
        { org_id: orgId, bling_order_id: `ta-test-desempenho-cob-${RUN}-1`, provider: 'bling', provider_order_id: `ta-test-desempenho-cob-${RUN}-1`, canal: 'shopee', data: new Date('2025-12-01T12:00:00Z'), valor_total: '10.00', itens: [], enriquecido_em: new Date() },
        { org_id: orgId, bling_order_id: `ta-test-desempenho-cob-${RUN}-2`, provider: 'bling', provider_order_id: `ta-test-desempenho-cob-${RUN}-2`, canal: 'shopee', data: new Date('2026-01-01T12:00:00Z'), valor_total: '20.00', itens: [] }, // enriquecido_em NULL
      ]);
      const { getCoberturaHistorico } = await import('@/modules/desempenho/desempenho-anual.repository');
      const cobertura = await getCoberturaHistorico(sourceFor(orgId));
      expect(cobertura.desde?.toISOString()).toBe('2025-12-01T12:00:00.000Z');
      expect(cobertura.pendentesEnriquecimento).toBe(1);
    } finally {
      if (orgId) {
        await tdb.delete(orders).where(eq(orders.org_id, orgId));
        await tdb.delete(organizations).where(eq(organizations.id, orgId));
      }
    }
  });

  it('org sem pedidos: lista vazia e cobertura nula', async () => {
    let orgId = '';
    try {
      const [o] = await tdb.insert(organizations).values({ name: `ta-test-desempenho-vazio-${RUN}`, status: 'active' }).returning({ id: organizations.id });
      orgId = o.id;
      const repo = await import('@/modules/desempenho/desempenho-anual.repository');
      expect(await repo.getPedidos12Meses(sourceFor(orgId), AGORA)).toEqual([]);
      expect(await repo.getCoberturaHistorico(sourceFor(orgId))).toEqual({ desde: null, pendentesEnriquecimento: 0 });
    } finally {
      if (orgId) await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
  });
});
