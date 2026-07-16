import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { notifications, organizations, reports, users } from '@/db/schema';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-fin-notify-';

const METRICAS: Metricas = {
  vendasPorCanal: [],
  evolucao: [],
  ticketMedio: 0,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: true,
};
const ANALISE: AnaliseIa = {
  resumoExecutivo: 'ok',
  gargalos: [],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe.skipIf(!url)('finalize — notificação in-app "relatório pronto"', () => {
  let orgId = '';
  let userId = '';
  let reportId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}${RUN}@example.com`, senha_hash: 'h', role: 'client' })
      .returning({ id: users.id });
    userId = user!.id;
    const [rep] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'running',
        periodo_inicio: new Date(Date.now() - 7 * 86_400_000),
        periodo_fim: new Date(),
      })
      .returning({ id: reports.id });
    reportId = rep!.id;
  });

  afterAll(async () => {
    await db.delete(notifications).where(eq(notifications.user_id, userId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(users).where(eq(users.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('finalize marca done E cria notificação com href do relatório', async () => {
    const { finalize } = await import('@/modules/pipeline/steps/finalize');
    await finalize({
      reportId,
      orgId,
      metricas: METRICAS,
      analise: ANALISE,
      plano: 'weekly',
      periodo: { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-30T00:00:00Z') },
      clientEmail: null, // sem RESEND no ambiente de teste — e-mail é no-op
      iaUsage: null,
    });

    const [rep] = await db
      .select({ status: reports.status })
      .from(reports)
      .where(eq(reports.id, reportId));
    expect(rep!.status).toBe('done');

    const notifs = await db
      .select({ tipo: notifications.tipo, href: notifications.href })
      .from(notifications)
      .where(eq(notifications.user_id, userId));
    const pronta = notifs.find((n) => n.tipo === 'relatorio_pronto');
    expect(pronta).toBeDefined();
    expect(pronta!.href).toBe(`/dashboard/relatorios/${reportId}`);
  });
});
