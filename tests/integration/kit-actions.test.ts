import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { kitSuggestions, organizations, reports, taskActivities, tasks } from '@/db/schema';
import { kitParaTask } from '@/modules/kits/kit-to-task';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-kitact-';

describe.skipIf(!url)('kit → task — integração', () => {
  let orgId = '';
  let reportId = '';
  let kitId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [rep] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'done',
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
      })
      .returning({ id: reports.id });
    reportId = rep!.id;
    const [kit] = await db
      .insert(kitSuggestions)
      .values({
        org_id: orgId,
        report_id: reportId,
        titulo: 'Kit Café Completo',
        payload: {
          itens: [
            { sku: 'A', nome: 'Caneca' },
            { sku: 'B', nome: 'Filtro' },
          ],
          precoSugerido: 79.9,
          argumento: 'Vendem juntos.',
          canalRecomendado: 'Shopee',
          evidencia: { pedidosJuntos: 7 },
        },
      })
      .returning({ id: kitSuggestions.id });
    kitId = kit!.id;
  });

  afterAll(async () => {
    // createTask grava em task_activities (FK → tasks) — limpar antes de apagar as tasks.
    const taskIds = (await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId))).map(
      (r) => r.id,
    );
    if (taskIds.length > 0) {
      await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
    }
    await db.delete(kitSuggestions).where(eq(kitSuggestions.org_id, orgId));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('cria task tipo catalogo, marca o kit e é idempotente', async () => {
    const r1 = await kitParaTask(orgId, kitId);
    expect(r1.ok).toBe(true);

    const [task] = await db.select().from(tasks).where(eq(tasks.org_id, orgId));
    expect(task!.tipo).toBe('catalogo');
    expect(task!.titulo).toContain('Kit Café Completo');
    expect(task!.report_id).toBe(reportId);
    expect(task!.descricao).toContain('Caneca');
    expect(task!.descricao).toContain('79,90');

    const [kit] = await db.select().from(kitSuggestions).where(eq(kitSuggestions.id, kitId));
    expect(kit!.status).toBe('virou_task');
    expect(kit!.task_id).toBe(task!.id);

    // 2ª chamada: kit já processado → ok:false e NENHUMA task nova.
    const r2 = await kitParaTask(orgId, kitId);
    expect(r2.ok).toBe(false);
    const todas = await db.select().from(tasks).where(eq(tasks.org_id, orgId));
    expect(todas).toHaveLength(1);
  });
});
