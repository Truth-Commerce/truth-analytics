import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { kitSuggestions, organizations, reports } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-schemah2-';

describe.skipIf(!url)('schema H2 — kit_suggestions + reports.kits_ia_usage', () => {
  let orgId = '';
  let reportId = '';

  afterAll(async () => {
    if (!orgId) return;
    await db.delete(kitSuggestions).where(eq(kitSuggestions.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('insere kit com default sugerido e grava kits_ia_usage no report', async () => {
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
        titulo: 'Kit Escritório em Casa',
        payload: { itens: [{ sku: 'A' }, { sku: 'B' }] },
      })
      .returning();
    expect(kit!.status).toBe('sugerido');

    await db
      .update(reports)
      .set({ kits_ia_usage: { input_tokens: 100, output_tokens: 50, tentativas: 1 } })
      .where(eq(reports.id, reportId));
    const [r] = await db.select({ u: reports.kits_ia_usage }).from(reports).where(eq(reports.id, reportId));
    expect((r!.u as { input_tokens: number }).input_tokens).toBe(100);
  });

  it('CHECK rejeita status inválido', async () => {
    await expect(
      db.insert(kitSuggestions).values({
        org_id: orgId,
        report_id: reportId,
        titulo: 'x',
        status: 'status_invalido',
      }),
    ).rejects.toThrow();
  });
});
