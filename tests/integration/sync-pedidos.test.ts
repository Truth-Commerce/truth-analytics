import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// vi.mock é hoisted — o CRON_SECRET fake vale para todos os testes do arquivo.
vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, CRON_SECRET: 'cron-sincronizar-teste-16+++' },
  };
});

import { db } from '@/db/client';
import { connectionSyncState, connections, orders, organizations } from '@/db/schema';
import { blingDataProvider } from '@/modules/providers/bling/provider';
import type { RawOrder } from '@/modules/providers/types';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-sync-';

function req(auth?: string): Request {
  return new Request('http://localhost:3000/api/cron/sincronizar-pedidos', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe.skipIf(!url)('sync incremental de pedidos — integração', () => {
  let orgId = '';
  let orgErroId = '';
  let orgNuncaSyncId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    await db.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: 'tok-fake',
      refresh_token: 'rt-fake',
      status: 'ok',
      expira_em: new Date(Date.now() + 30 * 86_400_000),
    });

    // Org com conexão 'erro' — NÃO deve entrar na lista de sync.
    const [org2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-erro-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgErroId = org2!.id;
    await db.insert(connections).values({
      org_id: orgErroId,
      provider: 'bling',
      access_token: null,
      refresh_token: null,
      status: 'erro',
    });
  });

  afterAll(async () => {
    try {
      await db.delete(orders).where(eq(orders.org_id, orgId));
      await db.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgId));
      await db.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgErroId));
      if (orgNuncaSyncId) await db.delete(connectionSyncState).where(eq(connectionSyncState.org_id, orgNuncaSyncId));
      await db.delete(connections).where(eq(connections.org_id, orgId));
      await db.delete(connections).where(eq(connections.org_id, orgErroId));
      if (orgNuncaSyncId) await db.delete(connections).where(eq(connections.org_id, orgNuncaSyncId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgErroId));
      if (orgNuncaSyncId) await db.delete(organizations).where(eq(organizations.id, orgNuncaSyncId));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('listOrgsComBlingOk inclui org ok e exclui org com status erro', async () => {
    const { listOrgsComBlingOk } = await import('@/modules/connections/connection.repository');
    const ids = await listOrgsComBlingOk();
    expect(ids).toContain(orgId);
    expect(ids).not.toContain(orgErroId);
  });

  it('listOrgsComBlingOk ordena por last_sync_at ASC NULLS FIRST (nunca sincronizada vem antes)', async () => {
    // Org mais "atrasada" possível: conexão ok que NUNCA sincronizou (null).
    const [orgNunca] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-nunca-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgNuncaSyncId = orgNunca!.id;
    await db.insert(connections).values({
      org_id: orgNuncaSyncId,
      provider: 'bling',
      access_token: 'tok-fake-nunca',
      refresh_token: 'rt-fake-nunca',
      status: 'ok',
      expira_em: new Date(Date.now() + 30 * 86_400_000),
      last_sync_at: null,
    });
    // A org principal já sincronizou (agora) — deve vir DEPOIS da nunca-sincronizada.
    await db
      .update(connections)
      .set({ last_sync_at: new Date() })
      .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));

    const { listOrgsComBlingOk } = await import('@/modules/connections/connection.repository');
    const ids = await listOrgsComBlingOk();
    const posNunca = ids.indexOf(orgNuncaSyncId);
    const posSincronizada = ids.indexOf(orgId);
    expect(posNunca).toBeGreaterThanOrEqual(0);
    expect(posSincronizada).toBeGreaterThanOrEqual(0);
    expect(posNunca).toBeLessThan(posSincronizada);
  });

  it('sincronizarPedidosDaOrg upserta pedidos da janela de 2 dias e grava last_sync_at', async () => {
    const agora = new Date();
    const pedidoFake: RawOrder = {
      blingOrderId: `${PREFIX}${RUN}-1`,
      canal: 'bling',
      data: new Date(agora.getTime() - 86_400_000),
      valorTotal: 150.5,
      frete: 10,
      itens: [],
    };
    const fetchSpy = vi
      .spyOn(blingDataProvider, 'fetchOrders')
      .mockImplementation(async (oid, request, onPage) => {
        if (oid === orgId) await onPage({
          orders: [{
            providerOrderId: pedidoFake.blingOrderId,
            providerStatus: '',
            canal: pedidoFake.canal,
            data: pedidoFake.data,
            valorTotal: pedidoFake.valorTotal,
            frete: pedidoFake.frete,
            itens: pedidoFake.itens,
          }],
          offset: request.offset,
          nextOffset: request.offset + 1,
          total: 1,
          done: true,
        });
      });

    try {
      const { sincronizarPedidosDaOrg, JANELA_SYNC_DIAS } = await import(
        '@/modules/pipeline/sync-pedidos'
      );
      const source = { orgId, provider: 'bling' as const, sourceGeneration: 1 };
      const result = await sincronizarPedidosDaOrg(source, agora);
      expect(result.processados).toBe(1);

      // Janela: inicio = agora - 2 dias, fim = agora
      const request = fetchSpy.mock.calls[0][1];
      if (request.mode !== 'created') throw new Error('expected_created_request');
      const periodo = request.periodo;
      expect(periodo.fim.getTime()).toBe(agora.getTime());
      expect(periodo.inicio.getTime()).toBe(agora.getTime() - JANELA_SYNC_DIAS * 86_400_000);

      // Pedido upsertado (escopado à MINHA org)
      const [row] = await db
        .select({ valor: orders.valor_total })
        .from(orders)
        .where(and(eq(orders.org_id, orgId), eq(orders.bling_order_id, pedidoFake.blingOrderId)));
      expect(row).toBeDefined();
      expect(Number(row!.valor)).toBe(150.5);

      // last_sync_at gravado
      const [conn] = await db
        .select({ last: connections.last_sync_at })
        .from(connections)
        .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));
      expect(conn!.last).not.toBeNull();

      // Idempotência: rodar de novo NÃO duplica
      await sincronizarPedidosDaOrg(source, agora);
      const todas = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.org_id, orgId), eq(orders.bling_order_id, pedidoFake.blingOrderId)));
      expect(todas.length).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('rota: sem header de autorização → 401', async () => {
    const { GET } = await import('@/app/api/cron/sincronizar-pedidos/route');
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('rota: Bearer errado → 401', async () => {
    const { GET } = await import('@/app/api/cron/sincronizar-pedidos/route');
    const res = await GET(req('Bearer errado-mas-16-chars+'));
    expect(res.status).toBe(401);
  });
});
