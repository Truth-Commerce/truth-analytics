import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { calendarSuggestions, organizations, reports } from '@/db/schema';
import {
  insertSugestoes,
  listSugestoesUltimoCiclo,
  marcarSugestaoStatus,
  setCalendarIaUsage,
} from '@/modules/calendario/calendario.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-cal-';

const SUGESTAO = {
  dataISO: '2026-10-11',
  nomeData: 'Dia das Crianças',
  titulo: 'Anuncie kits infantis',
  sugestao: 'Destaque combos de brinquedos com frete rápido.',
  skus: ['BRINQ-1', 'BRINQ-2'],
};

describe.skipIf(!url)('calendario.repository — integração', () => {
  let orgId = '';
  let outraOrgId = '';
  let reportId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [org2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}outra-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    outraOrgId = org2!.id;
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
  });

  afterAll(async () => {
    for (const id of [orgId, outraOrgId]) {
      await db.delete(calendarSuggestions).where(eq(calendarSuggestions.org_id, id));
      await db.delete(reports).where(eq(reports.org_id, id));
      await db.delete(organizations).where(eq(organizations.id, id));
    }
  });

  it('insertSugestoes grava payload e listSugestoesUltimoCiclo devolve por org', async () => {
    const n = await insertSugestoes(orgId, reportId, [SUGESTAO]);
    expect(n).toBe(1);

    const sugestoes = await listSugestoesUltimoCiclo(orgId);
    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0]!.titulo).toBe('Anuncie kits infantis');
    expect(
      (sugestoes[0]!.payload as { dataISO: string; nomeData: string; sugestao: string; skus: string[] }),
    ).toEqual({
      dataISO: '2026-10-11',
      nomeData: 'Dia das Crianças',
      sugestao: 'Destaque combos de brinquedos com frete rápido.',
      skus: ['BRINQ-1', 'BRINQ-2'],
    });

    const outras = await listSugestoesUltimoCiclo(outraOrgId);
    expect(outras).toEqual([]);
  });

  it('marcarSugestaoStatus é idempotente e escopado por org', async () => {
    const [sugestao] = await listSugestoesUltimoCiclo(orgId);
    // Outra org não consegue mexer:
    expect(await marcarSugestaoStatus(outraOrgId, sugestao!.id, 'descartado')).toBe(false);
    // 1ª marcação funciona; 2ª (status já não é 'sugerido') retorna false:
    expect(await marcarSugestaoStatus(orgId, sugestao!.id, 'descartado')).toBe(true);
    expect(await marcarSugestaoStatus(orgId, sugestao!.id, 'virou_task')).toBe(false);
  });

  it('setCalendarIaUsage é org-guarded — update com org errada não grava', async () => {
    const usage = { input_tokens: 10, output_tokens: 5, tentativas: 1 };

    await setCalendarIaUsage(outraOrgId, reportId, usage);
    const [semGravar] = await db
      .select({ u: reports.calendar_ia_usage })
      .from(reports)
      .where(eq(reports.id, reportId));
    expect(semGravar!.u).toBeNull();

    await setCalendarIaUsage(orgId, reportId, usage);
    const [gravado] = await db
      .select({ u: reports.calendar_ia_usage })
      .from(reports)
      .where(eq(reports.id, reportId));
    expect((gravado!.u as { input_tokens: number }).input_tokens).toBe(10);
  });
});
