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

// Este teste foca no LOOP DE ALERTAS. O passo aditivo de lembretes de prazo
// (G3/Task 7) é GLOBAL — varre todas as orgs active com task e escreveria
// notifications/task_activities nas orgs de OUTRAS suítes rodando em paralelo.
// Mockado aqui (coberto pelo lembretes-prazo.test.ts dedicado); mantemos só a
// verificação de que o route expõe o campo aditivo no JSON.
vi.mock('@/modules/tasks/lembretes-prazo', () => ({
  processarLembretesDePrazo: vi.fn().mockResolvedValue(0),
}));

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
    const emailSpy = vi.spyOn(emailModule, 'sendAlertasDigestEmail').mockResolvedValue();
    try {
      const res = await GET(req(`Bearer ${CRON_SECRET_TEST}`));
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        orgs: number;
        alertasCriados: number;
        lembretesEnviados: number;
      };
      expect(body.alertasCriados).toBeGreaterThanOrEqual(2);
      // Campo aditivo do G3 (Task 7): o route expõe o total de lembretes de prazo.
      expect(body).toHaveProperty('lembretesEnviados');

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
      // Digest: exatamente UMA chamada de e-mail para o meu usuário, com >= 2 alertas
      const chamadasMinhas = emailSpy.mock.calls.filter(([to]) => to === userEmail);
      expect(chamadasMinhas.length).toBe(1);
      expect(chamadasMinhas[0][1].length).toBeGreaterThanOrEqual(2);
    } finally {
      notifySpy.mockRestore();
      emailSpy.mockRestore();
    }
  });

  it('frescor: org com pedidos ANTIGOS não gera falso "queda de 100%" (agora efetivo = MAX(orders.data))', async () => {
    // Org com vendas regulares que PARARAM de sincronizar há 31 dias: com o
    // relógio de parede seria queda de 100%; com o agora efetivo, razão = 1.0.
    const [org2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-velha-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const org2Id = org2!.id;
    await db.insert(reports).values({
      org_id: org2Id,
      status: 'done',
      periodo_inicio: new Date(agora.getTime() - 40 * DIA),
      periodo_fim: new Date(agora.getTime() - 31 * DIA),
      metricas: { posicaoPreco: [] },
    });
    const vendaVelha = (offsetDias: number) => ({
      org_id: org2Id,
      bling_order_id: `${PREFIX}velha-${RUN}-${offsetDias}`,
      canal: 'bling',
      data: new Date(agora.getTime() - offsetDias * DIA),
      valor_total: '1000.00',
      itens: [],
    });
    await db.insert(orders).values([31, 38, 45, 52, 59].map(vendaVelha));

    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue();
    const emailSpy = vi.spyOn(emailModule, 'sendAlertasDigestEmail').mockResolvedValue();
    try {
      const res = await GET(req(`Bearer ${CRON_SECRET_TEST}`));
      expect(res.status).toBe(200);
      const criados = await db
        .select({ tipo: alerts.tipo })
        .from(alerts)
        .where(eq(alerts.org_id, org2Id));
      expect(criados.some((a) => a.tipo === 'queda_vendas')).toBe(false);
    } finally {
      notifySpy.mockRestore();
      emailSpy.mockRestore();
      await db.delete(alerts).where(eq(alerts.org_id, org2Id));
      await db.delete(orders).where(eq(orders.org_id, org2Id));
      await db.delete(reports).where(eq(reports.org_id, org2Id));
      await db.delete(organizations).where(eq(organizations.id, org2Id));
    }
  });

  it('segunda execução → dedup: nenhum alerta novo para a org', async () => {
    const countOrg = async () =>
      (await db.select({ id: alerts.id }).from(alerts).where(eq(alerts.org_id, orgId))).length;

    const antes = await countOrg();
    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue();
    const emailSpy = vi.spyOn(emailModule, 'sendAlertasDigestEmail').mockResolvedValue();
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
