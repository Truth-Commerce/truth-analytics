import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { calendarSuggestions, organizations, reports, taskActivities, tasks } from '@/db/schema';
import { sugestaoParaTask } from '@/modules/calendario/sugestao-to-task';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-calact-';

describe.skipIf(!url)('sugestão do calendário → task — integração', () => {
  let orgId = '';
  let reportId = '';
  let sugestaoId = '';

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
    const [sug] = await db
      .insert(calendarSuggestions)
      .values({
        org_id: orgId,
        report_id: reportId,
        titulo: 'Anuncie a Black Friday',
        payload: {
          dataISO: '2026-11-27',
          nomeData: 'Black Friday',
          sugestao: 'Capriche nas fotos e no anúncio para a Black Friday.',
          skus: ['A', 'B'],
        },
      })
      .returning({ id: calendarSuggestions.id });
    sugestaoId = sug!.id;
  });

  afterAll(async () => {
    // createTask grava em task_activities (FK → tasks) — limpar antes de apagar as tasks.
    const taskIds = (await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId))).map(
      (r) => r.id,
    );
    if (taskIds.length > 0) {
      await db.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
    }
    await db.delete(calendarSuggestions).where(eq(calendarSuggestions.org_id, orgId));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('cria task com prazo=dataISO e tipo inferido, marca a sugestão e é idempotente', async () => {
    const r1 = await sugestaoParaTask(orgId, sugestaoId);
    expect(r1.ok).toBe(true);

    const [task] = await db.select().from(tasks).where(eq(tasks.org_id, orgId));
    expect(task!.tipo).toBe('anuncio');
    expect(task!.titulo).toBe('Anuncie a Black Friday');
    expect(task!.prazo).toBe('2026-11-27');
    expect(task!.report_id).toBe(reportId);
    expect(task!.criado_por).toBe('cliente');
    expect(task!.prioridade).toBe('media');
    expect(task!.descricao).toContain('Black Friday');
    expect(task!.descricao).toContain('A, B');

    const [sug] = await db.select().from(calendarSuggestions).where(eq(calendarSuggestions.id, sugestaoId));
    expect(sug!.status).toBe('virou_task');
    expect(sug!.task_id).toBe(task!.id);

    // 2ª chamada: sugestão já processada → ok:false e NENHUMA task nova.
    const r2 = await sugestaoParaTask(orgId, sugestaoId);
    expect(r2.ok).toBe(false);
    const todas = await db.select().from(tasks).where(eq(tasks.org_id, orgId));
    expect(todas).toHaveLength(1);
  });

  it('corrida: sugestão reservada (virou_task sem task_id) — sugestaoParaTask não cria task', async () => {
    const [rep] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'done',
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
      })
      .returning({ id: reports.id });
    const [sug] = await db
      .insert(calendarSuggestions)
      .values({
        org_id: orgId,
        report_id: rep!.id,
        titulo: 'Prepare o Natal',
        payload: {
          dataISO: '2026-12-25',
          nomeData: 'Natal',
          sugestao: 'Garanta o frete a tempo para o Natal.',
          skus: ['C'],
        },
      })
      .returning({ id: calendarSuggestions.id });
    const corridaSugestaoId = sug!.id;

    // Simula o estado "reservado, ainda criando a task" de um caller concorrente.
    await db
      .update(calendarSuggestions)
      .set({ status: 'virou_task', task_id: null })
      .where(eq(calendarSuggestions.id, corridaSugestaoId));

    const r = await sugestaoParaTask(orgId, corridaSugestaoId);
    expect(r).toEqual({ ok: false, erro: 'sugestao_ja_processada' });

    const todas = await db.select().from(tasks).where(eq(tasks.report_id, rep!.id));
    expect(todas).toHaveLength(0);
  });
});
