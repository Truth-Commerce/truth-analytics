import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, CRON_SECRET: 'cron-segredo-de-teste-16+' },
  };
});

import { db } from '@/db/client';
import { organizations, reports } from '@/db/schema';
import { GET } from '@/app/api/cron/watchdog/route';

function req(auth?: string): Request {
  return new Request('http://localhost:3000/api/cron/watchdog', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('watchdog', () => {
  let orgId: string;
  const periodo = { periodo_inicio: new Date('2026-06-01'), periodo_fim: new Date('2026-07-01') };

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `t_wd_${randomUUID().slice(0, 8)}`, status: 'active', plano: 'monthly' })
      .returning({ id: organizations.id });
    orgId = org.id;
  });

  afterAll(async () => {
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('sem/errado Bearer → 401', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer errado'))).status).toBe(401);
  });

  it('marca preso (>20min) como failed e preserva o recente', async () => {
    const [preso] = await db
      .insert(reports)
      .values({ org_id: orgId, status: 'running', ...periodo })
      .returning({ id: reports.id });
    // Envelhece o updated_at por SQL direto (o $onUpdateFn impediria via update Drizzle)
    await db.execute(
      sql`update reports set updated_at = now() - interval '30 minutes' where id = ${preso.id}`,
    );

    const res = await GET(req('Bearer cron-segredo-de-teste-16+'));
    expect(res.status).toBe(200);
    expect((await res.json()).marcados).toBeGreaterThanOrEqual(1);

    const [linha] = await db
      .select({ status: reports.status, erro: reports.erro })
      .from(reports)
      .where(eq(reports.id, preso.id));
    expect(linha.status).toBe('failed');
    expect(linha.erro).toBe('timeout_watchdog');

    // report recente (done) intocado — insere e roda de novo
    const [recente] = await db
      .insert(reports)
      .values({ org_id: orgId, status: 'queued', ...periodo })
      .returning({ id: reports.id });
    await GET(req('Bearer cron-segredo-de-teste-16+'));
    const [linha2] = await db
      .select({ status: reports.status })
      .from(reports)
      .where(eq(reports.id, recente.id));
    expect(linha2.status).toBe('queued'); // updated_at recente → não marcado
  });
});
