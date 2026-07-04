import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, reports, taskActivities, tasks, users } from '@/db/schema';
import { createTasksFromReport } from '@/modules/tasks/report-to-task.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-r2t-';

// Baseado no SAMPLE_ANALISE de tests/e2e/dashboard.spec.ts.
const SAMPLE_ANALISE = {
  resumoExecutivo: 'Desempenho sólido no período com crescimento consistente nas vendas.',
  gargalos: ['Custo de frete elevado no canal ML'],
  sugestoesMelhoria: ['Negociar tarifas de envio com parceiros logísticos'],
  ideiasVenda: ['Criar kit promocional com produto principal + acessório'],
  recomendacoesPreco: [
    {
      sku: 'SKU-001',
      nome: 'Produto Teste',
      precoSugerido: 98.0,
      justificativa: 'Ajuste competitivo baseado na mediana do mercado.',
    },
  ],
};

describe.skipIf(!url)('report-to-task.repository — createTasksFromReport (integração)', () => {
  let orgAId = '';
  let orgBId = '';
  let reportId = '';
  let reportSemAnaliseId = '';

  beforeAll(async () => {
    const [orgA] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}A-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA!.id;

    const [orgB] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}B-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB!.id;

    const [report] = await db
      .insert(reports)
      .values({
        org_id: orgAId,
        status: 'done',
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        analise_ia: SAMPLE_ANALISE,
      })
      .returning({ id: reports.id });
    reportId = report!.id;

    const [reportSemAnalise] = await db
      .insert(reports)
      .values({
        org_id: orgAId,
        status: 'done',
        periodo_inicio: new Date('2026-05-01'),
        periodo_fim: new Date('2026-05-31'),
        // analise_ia deliberadamente ausente (null)
      })
      .returning({ id: reports.id });
    reportSemAnaliseId = reportSemAnalise!.id;
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId].filter(Boolean);
    if (orgIds.length) {
      const taskRows = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.org_id, orgIds));
      const taskIds = taskRows.map((r) => r.id);
      if (taskIds.length) {
        await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
      }
      await db.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await db.delete(reports).where(inArray(reports.org_id, orgIds));
      await db.delete(users).where(inArray(users.org_id, orgIds));
      await db.delete(organizations).where(inArray(organizations.id, orgIds));
    }
  });

  it('converte {gargalos,0} + {sugestoesMelhoria,0} em 2 tasks com criado_por ia, report_id e tipos/prioridades corretos', async () => {
    const criadas = await createTasksFromReport({
      reportId,
      orgId: orgAId,
      itens: [
        { fonte: 'gargalos', indice: 0 },
        { fonte: 'sugestoesMelhoria', indice: 0 },
      ],
      actorUserId: null,
    });
    expect(criadas).toBe(2);

    const rows = await db.select().from(tasks).where(eq(tasks.report_id, reportId));
    expect(rows).toHaveLength(2);

    const gargaloTask = rows.find((r) => r.titulo === 'Custo de frete elevado no canal ML');
    expect(gargaloTask?.criado_por).toBe('ia');
    expect(gargaloTask?.report_id).toBe(reportId);
    expect(gargaloTask?.tipo).toBe('logistica'); // "frete"
    expect(gargaloTask?.prioridade).toBe('alta');

    const sugestaoTask = rows.find((r) => r.titulo === 'Negociar tarifas de envio com parceiros logísticos');
    expect(sugestaoTask?.criado_por).toBe('ia');
    expect(sugestaoTask?.report_id).toBe(reportId);
    expect(sugestaoTask?.tipo).toBe('logistica'); // "envio"
    expect(sugestaoTask?.prioridade).toBe('media');
  });

  it('re-converter os mesmos itens não cria duplicatas (dedup por título já existente)', async () => {
    const criadas = await createTasksFromReport({
      reportId,
      orgId: orgAId,
      itens: [
        { fonte: 'gargalos', indice: 0 },
        { fonte: 'sugestoesMelhoria', indice: 0 },
      ],
      actorUserId: null,
    });
    expect(criadas).toBe(0);

    const rows = await db.select().from(tasks).where(eq(tasks.report_id, reportId));
    expect(rows).toHaveLength(2); // continua só as 2 do teste anterior
  });

  it('índice fora do range é pulado sem erro; analise_ia null retorna 0', async () => {
    const criadasIndiceInvalido = await createTasksFromReport({
      reportId,
      orgId: orgAId,
      itens: [{ fonte: 'ideiasVenda', indice: 5 }], // ideiasVenda só tem 1 item (índice 0)
      actorUserId: null,
    });
    expect(criadasIndiceInvalido).toBe(0);

    const criadasSemAnalise = await createTasksFromReport({
      reportId: reportSemAnaliseId,
      orgId: orgAId,
      itens: [{ fonte: 'gargalos', indice: 0 }],
      actorUserId: null,
    });
    expect(criadasSemAnalise).toBe(0);
  });

  it('escopo: orgId de outra org não pode converter achados do relatório da primeira org', async () => {
    const criadas = await createTasksFromReport({
      reportId,
      orgId: orgBId, // orgB não é dona do report (que é da orgA)
      itens: [{ fonte: 'ideiasVenda', indice: 0 }],
      actorUserId: null,
    });
    expect(criadas).toBe(0);

    const rowsOrgB = await db.select().from(tasks).where(eq(tasks.org_id, orgBId));
    expect(rowsOrgB).toHaveLength(0);
  });
});
