import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, connections, organizations, reports, users } from '@/db/schema';
import {
  listAuditLogFiltrado,
  listConexoesSaude,
  listFilaRelatorios,
  listReportsUsageMes,
} from '@/modules/admin/operacoes.repository';

const url = process.env.DATABASE_URL_TEST;
const PREFIX = 'ta-test-operacoes-';
const RUN = Date.now();

describe.skipIf(!url)('operacoes.repository — integração (H4 T10)', () => {
  const agora = new Date();
  let orgAId = '';
  let orgBId = '';
  let internalOrgId = '';
  let adminUserId = '';
  let reportQueuedId = '';
  let reportFailedId = '';
  let reportDoneId = '';
  let reportForaJanelaId = '';
  let reportUsageId = '';

  beforeAll(async () => {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-a-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgAId = orgA.id;

    const [orgB] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-b-${RUN}`, status: 'active', plano: 'monthly' })
      .returning({ id: organizations.id });
    orgBId = orgB.id;

    const [internal] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}truth-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internalOrgId = internal.id;

    const [admin] = await db
      .insert(users)
      .values({
        org_id: internalOrgId,
        email: `operacoes-${RUN}@ta-test.example.com`,
        senha_hash: 'x',
        role: 'admin_truth',
      })
      .returning({ id: users.id });
    adminUserId = admin.id;

    // Conexões: orgA ok expirando em 3 dias; orgB erro; internal NUNCA aparece (excluída).
    await db.insert(connections).values({
      org_id: orgAId,
      provider: 'bling',
      access_token: 'enc',
      refresh_token: 'enc',
      status: 'ok',
      expira_em: new Date(agora.getTime() + 3 * 24 * 60 * 60 * 1000),
    });
    await db.insert(connections).values({
      org_id: orgBId,
      provider: 'bling',
      access_token: null,
      refresh_token: null,
      status: 'erro',
    });

    // Fila: 1 queued + 1 failed (dentro dos 30d) + 1 done (não deve entrar) + 1 failed fora da janela de 30d.
    const [queued] = await db
      .insert(reports)
      .values({
        org_id: orgAId,
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
        status: 'queued',
      })
      .returning({ id: reports.id });
    reportQueuedId = queued.id;

    const [failed] = await db
      .insert(reports)
      .values({
        org_id: orgBId,
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
        status: 'failed',
        erro: 'analise_ia_invalida',
      })
      .returning({ id: reports.id });
    reportFailedId = failed.id;

    const [done] = await db
      .insert(reports)
      .values({
        org_id: orgAId,
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        status: 'done',
      })
      .returning({ id: reports.id });
    reportDoneId = done.id;

    const [foraJanela] = await db
      .insert(reports)
      .values({
        org_id: orgBId,
        periodo_inicio: new Date('2026-01-01'),
        periodo_fim: new Date('2026-01-08'),
        status: 'failed',
        erro: 'timeout_watchdog',
      })
      .returning({ id: reports.id });
    reportForaJanelaId = foraJanela.id;
    await db
      .update(reports)
      .set({ created_at: new Date(agora.getTime() - 45 * 24 * 60 * 60 * 1000) })
      .where(eq(reports.id, reportForaJanelaId));

    // Report com usage IA (dentro do mês corrente) para o consolidado de custo.
    const [comUsage] = await db
      .insert(reports)
      .values({
        org_id: orgAId,
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
        status: 'done',
        ia_usage: { input_tokens: 1000, output_tokens: 500, tentativas: 1 },
        kits_ia_usage: { input_tokens: 100, output_tokens: 50, tentativas: 1 },
      })
      .returning({ id: reports.id });
    reportUsageId = comUsage.id;

    // Audit log: 2 entradas orgA, 1 orgB.
    await db.insert(auditLog).values([
      { org_id: orgAId, user_id: adminUserId, acao: `${PREFIX}report.reprocessado`, detalhes: { x: 1 } },
      { org_id: orgAId, user_id: adminUserId, acao: `${PREFIX}org.ativada` },
      { org_id: orgBId, user_id: adminUserId, acao: `${PREFIX}report.reprocessado` },
    ]);
  });

  afterAll(async () => {
    await db.delete(auditLog).where(inArray(auditLog.org_id, [orgAId, orgBId]));
    await db.delete(reports).where(inArray(reports.org_id, [orgAId, orgBId]));
    await db.delete(connections).where(inArray(connections.org_id, [orgAId, orgBId]));
    await db.delete(users).where(eq(users.org_id, internalOrgId));
    await db.delete(organizations).where(inArray(organizations.id, [orgAId, orgBId, internalOrgId]));
  });

  it('listFilaRelatorios: cross-org queued/running/failed dos últimos 30d — exclui done e fora da janela', async () => {
    const desde = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
    const fila = await listFilaRelatorios(desde);
    const ids = fila.map((f) => f.id);
    expect(ids).toContain(reportQueuedId);
    expect(ids).toContain(reportFailedId);
    expect(ids).not.toContain(reportDoneId);
    expect(ids).not.toContain(reportForaJanelaId);
    const linhaFailed = fila.find((f) => f.id === reportFailedId)!;
    expect(linhaFailed.orgName).toBe(`${PREFIX}org-b-${RUN}`);
    expect(linhaFailed.erro).toBe('analise_ia_invalida');
  });

  it('listReportsUsageMes: traz as 4 fontes jsonb + orgName no período', async () => {
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);
    const rows = await listReportsUsageMes(inicio, fim);
    const linha = rows.find((r) => r.orgId === orgAId && r.iaUsage != null);
    expect(linha).toBeDefined();
    expect(linha!.orgName).toBe(`${PREFIX}org-a-${RUN}`);
    expect((linha!.iaUsage as { input_tokens: number }).input_tokens).toBe(1000);
    expect((linha!.kitsIaUsage as { input_tokens: number }).input_tokens).toBe(100);
    expect(linha!.calendarIaUsage).toBeNull();
    expect(linha!.briefingIaUsage).toBeNull();
    void reportUsageId;
  });

  it('listConexoesSaude: saúde + dias até expirar em lote, org interna excluída', async () => {
    const conexoes = await listConexoesSaude(agora);
    expect(conexoes.find((c) => c.orgId === internalOrgId)).toBeUndefined();
    const a = conexoes.find((c) => c.orgId === orgAId)!;
    expect(a.saude).toBe('ok');
    expect(a.diasAteExpirar).toBeGreaterThanOrEqual(2);
    expect(a.diasAteExpirar).toBeLessThanOrEqual(3);
    const b = conexoes.find((c) => c.orgId === orgBId)!;
    expect(b.saude).toBe('erro');
    expect(b.diasAteExpirar).toBeNull();
  });

  it('listAuditLogFiltrado: filtra por org', async () => {
    const { items, total } = await listAuditLogFiltrado({ orgId: orgAId, acao: PREFIX, page: 1 });
    expect(total).toBe(2);
    expect(items.every((i) => i.orgId === orgAId)).toBe(true);
  });

  it('listAuditLogFiltrado: filtra por texto de ação (ilike parcial)', async () => {
    const { items, total } = await listAuditLogFiltrado({ acao: `${PREFIX}report.reprocessado`, page: 1 });
    expect(total).toBe(2);
    expect(items.every((i) => i.acao === `${PREFIX}report.reprocessado`)).toBe(true);
  });

  it('listAuditLogFiltrado: combina org + ação (interseção, não união)', async () => {
    const { items, total } = await listAuditLogFiltrado({
      orgId: orgBId,
      acao: `${PREFIX}report.reprocessado`,
      page: 1,
    });
    expect(total).toBe(1);
    expect(items[0].orgId).toBe(orgBId);
  });

  it('listAuditLogFiltrado: filtro de período exclui fora do range', async () => {
    const futuro = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
    const { total } = await listAuditLogFiltrado({ acao: PREFIX, desde: futuro, page: 1 });
    expect(total).toBe(0);
  });
});
