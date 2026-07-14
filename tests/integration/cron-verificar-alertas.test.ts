import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// vi.mock é hoisted para o topo — usar literais diretamente (o mesmo valor é
// repetido em CRON_SECRET_TEST abaixo para uso no resto do teste).
vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, CRON_SECRET: 'cron-verificar-alertas-teste-16+' },
  };
});

const CRON_SECRET_TEST = 'cron-verificar-alertas-teste-16+';

import { db } from '@/db/client';
import { alerts, notifications, orders, organizations, reports, users } from '@/db/schema';
import * as emailModule from '@/modules/notifications/email';
import * as notificationRepo from '@/modules/notifications/notification.repository';
import { GET } from '@/app/api/cron/verificar-alertas/route';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-alert-cron-';
const DIA = 86_400_000;

function req(auth?: string): Request {
  return new Request('http://localhost:3000/api/cron/verificar-alertas', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe.skipIf(!url)('cron verificar-alertas — integração', () => {
  let orgId = '';
  let userId = '';
  const userEmail = `${PREFIX}${RUN}@example.com`;
  const agora = new Date();

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;

    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email: userEmail, senha_hash: 'hash', role: 'client' })
      .returning({ id: users.id });
    userId = user!.id;

    // Relatório done recente com posicaoPreco → dispara concorrente_preco:A.
    await db.insert(reports).values({
      org_id: orgId,
      status: 'done',
      periodo_inicio: new Date(agora.getTime() - 30 * DIA),
      periodo_fim: agora,
      metricas: {
        posicaoPreco: [
          { sku: 'A', nome: 'Alfa', nossoPreco: 100, precoMercadoMediano: 80, fonte: 'ml_publico' },
        ],
      },
    });

    // Vendas: semana atual R$ 200; 4 semanas anteriores R$ 1000 cada → queda crítica.
    const venda = (offsetDias: number, valor: number) => ({
      org_id: orgId,
      bling_order_id: `${PREFIX}${RUN}-${offsetDias}`,
      canal: 'bling',
      data: new Date(agora.getTime() - offsetDias * DIA),
      valor_total: valor.toFixed(2),
      itens: [],
    });
    await db.insert(orders).values([
      venda(1, 200),
      venda(8, 1000),
      venda(15, 1000),
      venda(22, 1000),
      venda(29, 1000),
    ]);
  });

  afterAll(async () => {
    try {
      await db.delete(alerts).where(eq(alerts.org_id, orgId));
      await db.delete(notifications).where(eq(notifications.user_id, userId));
      await db.delete(orders).where(eq(orders.org_id, orgId));
      await db.delete(reports).where(eq(reports.org_id, orgId));
      await db.delete(users).where(eq(users.org_id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('sem header de autorização → 401', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('Bearer correto → cria queda_vendas(crítico) + concorrente_preco:A e notifica', async () => {
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue();
    const emailSpy = vi.spyOn(emailModule, 'sendAlertaEmail').mockResolvedValue();
    try {
      const res = await GET(req(`Bearer ${CRON_SECRET_TEST}`));
      expect(res.status).toBe(200);
      const body = (await res.json()) as { orgs: number; alertasCriados: number };
      expect(body.alertasCriados).toBeGreaterThanOrEqual(2);

      const criados = await db
        .select({ tipo: alerts.tipo, severidade: alerts.severidade, dados: alerts.dados })
        .from(alerts)
        .where(eq(alerts.org_id, orgId));

      const queda = criados.find((a) => a.tipo === 'queda_vendas');
      expect(queda).toBeDefined();
      expect(queda!.severidade).toBe('critico');

      const concorrente = criados.find(
        (a) =>
          a.tipo === 'concorrente_preco' &&
          (a.dados as Record<string, unknown>).chave_dedup === 'concorrente_preco:A',
      );
      expect(concorrente).toBeDefined();

      // notificação in-app + e-mail chamados para os alertas da MINHA org
      // (asserção escopada ao meu userId/email: a suíte roda em paralelo e
      // outras orgs de outros arquivos podem coexistir na branch de teste).
      expect(notifySpy.mock.calls.some(([id]) => id === userId)).toBe(true);
      expect(emailSpy.mock.calls.some(([to]) => to === userEmail)).toBe(true);
    } finally {
      notifySpy.mockRestore();
      emailSpy.mockRestore();
    }
  });

  it('segunda execução → dedup: nenhum alerta novo para a org', async () => {
    const countOrg = async () =>
      (await db.select({ id: alerts.id }).from(alerts).where(eq(alerts.org_id, orgId))).length;

    const antes = await countOrg();
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue();
    const emailSpy = vi.spyOn(emailModule, 'sendAlertaEmail').mockResolvedValue();
    try {
      const res = await GET(req(`Bearer ${CRON_SECRET_TEST}`));
      expect(res.status).toBe(200);

      // Dedup escopado à org: nenhum alerta novo persistido para ela.
      expect(await countOrg()).toBe(antes);
      // E, por consequência, nenhuma notificação para o meu usuário/e-mail.
      expect(notifySpy.mock.calls.some(([id]) => id === userId)).toBe(false);
      expect(emailSpy.mock.calls.some(([to]) => to === userEmail)).toBe(false);
    } finally {
      notifySpy.mockRestore();
      emailSpy.mockRestore();
    }
  });
});
