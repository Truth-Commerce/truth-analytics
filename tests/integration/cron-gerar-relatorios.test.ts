import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// vi.mock é hoisted para o topo do arquivo — não referenciar consts externas
// aqui dentro (usar os literais diretamente; os mesmos valores são repetidos
// abaixo em CRON_SECRET_TEST/PIPELINE_SECRET_TEST para uso no resto do teste).
vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: {
      ...mod.serverEnv,
      CRON_SECRET: 'cron-gerar-relatorios-teste-16+',
      PIPELINE_SECRET: 'pipeline-secret-teste-16-chars+',
    },
  };
});

const CRON_SECRET_TEST = 'cron-gerar-relatorios-teste-16+';
const PIPELINE_SECRET_TEST = 'pipeline-secret-teste-16-chars+';
const ACCESS_TOKEN_TEST = 'token-sintetico-nao-secreto';

import { db } from '@/db/client';
import { connections, organizations, reports } from '@/db/schema';
import { GET } from '@/app/api/cron/gerar-relatorios/route';

function req(auth?: string): Request {
  return new Request('http://localhost:3000/api/cron/gerar-relatorios', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('cron gerar-relatorios', () => {
  const RUN = randomUUID().slice(0, 8);
  let orgElegivelId: string;
  let orgSemAutomacaoId: string;
  let orgComRunningId: string;

  beforeAll(async () => {
    const [elegivel] = await db
      .insert(organizations)
      .values({
        name: `t_cron_elegivel_${RUN}`,
        status: 'active',
        plano: 'monthly',
        geracao_automatica: true,
        proximo_relatorio_liberado_em: null,
      })
      .returning({ id: organizations.id });
    orgElegivelId = elegivel.id;
    await db
      .insert(connections)
      .values({
        org_id: orgElegivelId,
        provider: 'bling',
        status: 'ok',
        access_token: ACCESS_TOKEN_TEST,
      });

    const [semAutomacao] = await db
      .insert(organizations)
      .values({
        name: `t_cron_sem_automacao_${RUN}`,
        status: 'active',
        plano: 'monthly',
        geracao_automatica: false,
        proximo_relatorio_liberado_em: null,
      })
      .returning({ id: organizations.id });
    orgSemAutomacaoId = semAutomacao.id;
    await db
      .insert(connections)
      .values({
        org_id: orgSemAutomacaoId,
        provider: 'bling',
        status: 'ok',
        access_token: ACCESS_TOKEN_TEST,
      });

    const [comRunning] = await db
      .insert(organizations)
      .values({
        name: `t_cron_com_running_${RUN}`,
        status: 'active',
        plano: 'weekly',
        geracao_automatica: true,
        proximo_relatorio_liberado_em: null,
      })
      .returning({ id: organizations.id });
    orgComRunningId = comRunning.id;
    await db
      .insert(connections)
      .values({
        org_id: orgComRunningId,
        provider: 'bling',
        status: 'ok',
        access_token: ACCESS_TOKEN_TEST,
      });
    await db.insert(reports).values({
      org_id: orgComRunningId,
      status: 'running',
      periodo_inicio: new Date('2026-06-01'),
      periodo_fim: new Date('2026-06-08'),
    });
  });

  afterAll(async () => {
    for (const orgId of [orgElegivelId, orgSemAutomacaoId, orgComRunningId]) {
      await db.delete(reports).where(eq(reports.org_id, orgId));
      await db.delete(connections).where(eq(connections.org_id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
  });

  it('sem header de autorização → 401', async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  // Timeout maior: 2 orgs elegíveis (orgElegivelId + orgComRunningId) → o cron
  // aplica ESPACAMENTO_ENTRE_ORGS_MS (2s) entre elas, além do round-trip do DB.
  const TIMEOUT_CRON_MS = 15_000;

  it(
    'org elegível → enfileira, dispara pipeline com x-pipeline-secret e retorna 200',
    async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(null, { status: 202 }));
      try {
        const res = await GET(req(`Bearer ${CRON_SECRET_TEST}`));
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          elegiveis: number;
          resultados: { orgId: string; ok: boolean; detalhe: string }[];
        };

        const resultadoElegivel = body.resultados.find((r) => r.orgId === orgElegivelId);
        expect(resultadoElegivel).toBeDefined();
        expect(resultadoElegivel!.ok).toBe(true);

        const [reportRow] = await db
          .select({ status: reports.status })
          .from(reports)
          .where(eq(reports.org_id, orgElegivelId));
        expect(reportRow?.status).toBe('queued');

        const chamouComSecret = fetchSpy.mock.calls.some(([, init]) => {
          const headers = (init as RequestInit | undefined)?.headers as
            | Record<string, string>
            | undefined;
          return headers?.['x-pipeline-secret'] === PIPELINE_SECRET_TEST;
        });
        expect(chamouComSecret).toBe(true);

        // org sem geração automática nunca foi considerada elegível
        expect(body.resultados.some((r) => r.orgId === orgSemAutomacaoId)).toBe(false);
      } finally {
        fetchSpy.mockRestore();
      }
    },
    TIMEOUT_CRON_MS,
  );

  it(
    'org com report running pré-existente → relatorio_em_andamento, sem report novo',
    async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(null, { status: 202 }));
      try {
        const res = await GET(req(`Bearer ${CRON_SECRET_TEST}`));
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
          resultados: { orgId: string; ok: boolean; detalhe: string }[];
        };

        const resultadoRunning = body.resultados.find((r) => r.orgId === orgComRunningId);
        expect(resultadoRunning).toBeDefined();
        expect(resultadoRunning!.ok).toBe(false);
        expect(resultadoRunning!.detalhe).toBe('relatorio_em_andamento');

        const relatoriosDaOrg = await db
          .select({ id: reports.id, status: reports.status })
          .from(reports)
          .where(eq(reports.org_id, orgComRunningId));
        // continua havendo somente o report 'running' original — nenhum novo criado
        expect(relatoriosDaOrg).toHaveLength(1);
        expect(relatoriosDaOrg[0].status).toBe('running');
      } finally {
        fetchSpy.mockRestore();
      }
    },
    TIMEOUT_CRON_MS,
  );
});
