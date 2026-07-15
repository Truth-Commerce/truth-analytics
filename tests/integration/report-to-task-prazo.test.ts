import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, reports, taskActivities, tasks } from '@/db/schema';
import { createTasksFromReport } from '@/modules/tasks/report-to-task.repository';
import { prazoDefault } from '@/modules/tasks/sla';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-r2t-prazo-';

const SAMPLE_ANALISE = {
  resumoExecutivo: 'R.',
  gargalos: [`${PREFIX}gargalo-${RUN}`],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe.skipIf(!url)('report-to-task — prazo default de SLA (integração)', () => {
  let orgId = '';
  let reportId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [rep] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'done',
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        analise_ia: SAMPLE_ANALISE,
      })
      .returning({ id: reports.id });
    reportId = rep!.id;
  });

  afterAll(async () => {
    const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));
    for (const r of rows) await db.delete(taskActivities).where(eq(taskActivities.task_id, r.id));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('task de IA nasce com prazo = prazoDefault(prioridade)', async () => {
    const criadas = await createTasksFromReport({
      reportId,
      orgId,
      itens: [{ fonte: 'gargalos', indice: 0 }],
      actorUserId: null,
    });
    expect(criadas).toBe(1);
    const [t] = await db.select().from(tasks).where(eq(tasks.org_id, orgId));
    expect(t!.prioridade).toBe('alta'); // PRIORIDADE_POR_FONTE.gargalos
    expect(t!.prazo).toBe(prazoDefault('alta')); // hoje BRT + 7d
  });
});
