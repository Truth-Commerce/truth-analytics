import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { connections, organizations, reports } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-backoff-';
const DIA = 86_400_000;

async function seedOrgElegivel(nome: string): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({
      name: nome,
      status: 'active',
      plano: 'weekly',
      geracao_automatica: true,
      proximo_relatorio_liberado_em: new Date(Date.now() - DIA), // ciclo vencido
    })
    .returning({ id: organizations.id });
  await db.insert(connections).values({
    org_id: org!.id,
    provider: 'bling',
    access_token: 'tok',
    refresh_token: 'rt',
    status: 'ok',
    expira_em: new Date(Date.now() + 30 * DIA),
  });
  return org!.id;
}

function reportRow(orgId: string, status: string, criadoHaMs: number) {
  const created = new Date(Date.now() - criadoHaMs);
  return {
    org_id: orgId,
    status,
    periodo_inicio: new Date(created.getTime() - 7 * DIA),
    periodo_fim: created,
    created_at: created,
  };
}

describe.skipIf(!url)('scheduler — backoff e falhas consecutivas', () => {
  let orgFalhaRecente = '';
  let orgFalhaAntiga = '';
  let orgTresFalhas = '';

  beforeAll(async () => {
    orgFalhaRecente = await seedOrgElegivel(`${PREFIX}recente-${RUN}`);
    orgFalhaAntiga = await seedOrgElegivel(`${PREFIX}antiga-${RUN}`);
    orgTresFalhas = await seedOrgElegivel(`${PREFIX}tres-${RUN}`);

    // último report failed HÁ 1 HORA → excluída por 2 dias
    await db.insert(reports).values(reportRow(orgFalhaRecente, 'failed', 3_600_000));
    // último report failed HÁ 3 DIAS → backoff venceu, volta a ser elegível
    await db.insert(reports).values(reportRow(orgFalhaAntiga, 'failed', 3 * DIA));
    // 3 failed consecutivos (o mais recente há 3 dias — fora do backoff, mas pausável)
    await db
      .insert(reports)
      .values([
        reportRow(orgTresFalhas, 'failed', 5 * DIA),
        reportRow(orgTresFalhas, 'failed', 4 * DIA),
        reportRow(orgTresFalhas, 'failed', 3 * DIA),
      ]);
  });

  afterAll(async () => {
    for (const id of [orgFalhaRecente, orgFalhaAntiga, orgTresFalhas]) {
      await db.delete(reports).where(eq(reports.org_id, id));
      await db.delete(connections).where(eq(connections.org_id, id));
      await db.delete(organizations).where(eq(organizations.id, id));
    }
  });

  it('exclui org cujo ÚLTIMO report é failed há <2 dias; inclui quando o backoff venceu', async () => {
    const { listOrgsElegiveisParaGeracao } = await import(
      '@/modules/scheduler/scheduler.repository'
    );
    const ids = (await listOrgsElegiveisParaGeracao(new Date())).map((o) => o.id);
    expect(ids).not.toContain(orgFalhaRecente);
    expect(ids).toContain(orgFalhaAntiga);
  });

  it('done mais recente que o failed reabilita a org imediatamente', async () => {
    const { listOrgsElegiveisParaGeracao } = await import(
      '@/modules/scheduler/scheduler.repository'
    );
    await db.insert(reports).values(reportRow(orgFalhaRecente, 'done', 60_000));
    const ids = (await listOrgsElegiveisParaGeracao(new Date())).map((o) => o.id);
    expect(ids).toContain(orgFalhaRecente); // o MAIS RECENTE não é failed
  });

  it('listOrgsComFalhasConsecutivas: 3 failed seguidos entra; 1 failed só não entra', async () => {
    const { listOrgsComFalhasConsecutivas } = await import(
      '@/modules/scheduler/scheduler.repository'
    );
    const ids = (await listOrgsComFalhasConsecutivas(3)).map((o) => o.id);
    expect(ids).toContain(orgTresFalhas);
    expect(ids).not.toContain(orgFalhaAntiga); // só 1 failed
  });
});
