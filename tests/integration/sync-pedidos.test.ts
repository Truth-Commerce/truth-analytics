import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// vi.mock é hoisted — literal repetido em CRON_SECRET_TEST abaixo.
vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, CRON_SECRET: 'cron-sincronizar-teste-16+++' },
  };
});

const CRON_SECRET_TEST = 'cron-sincronizar-teste-16+++';

import { db } from '@/db/client';
import { connections, orders, organizations } from '@/db/schema';
import { blingProvider } from '@/modules/providers/bling/provider';
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
      await db.delete(connections).where(eq(connections.org_id, orgId));
      await db.delete(connections).where(eq(connections.org_id, orgErroId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgErroId));
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
      .spyOn(blingProvider, 'fetchOrders')
      .mockImplementation(async (oid, _periodo, onPage) => {
        if (oid === orgId && onPage) await onPage([pedidoFake]);
        return [];
      });

    try {
      const { sincronizarPedidosDaOrg, JANELA_SYNC_DIAS } = await import(
        '@/modules/pipeline/sync-pedidos'
      );
      const result = await sincronizarPedidosDaOrg(orgId, agora);
      expect(result.processados).toBe(1);

      // Janela: inicio = agora - 2 dias, fim = agora
      const periodo = fetchSpy.mock.calls[0][1];
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
      await sincronizarPedidosDaOrg(orgId, agora);
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
