import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/analista/briefing-ia', () => ({ gerarBriefingComIA: vi.fn() }));

import { db } from '@/db/client';
import { analystBriefings, organizations, reports, users } from '@/db/schema';
import { gerarBriefingComIA } from '@/modules/analista/briefing-ia';
import {
  getBriefingUltimoCiclo,
  insertBriefing,
  setBriefingIaUsage,
} from '@/modules/analista/briefing.repository';
import { gerarBriefingDoCiclo } from '@/modules/analista/gerar-briefing';
import { hashPassword } from '@/modules/auth/password';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-briefing-';

const PAYLOAD = {
  prioridades: ['Reajustar preço da Caneca Inox'],
  argumentosReuniao: ['Você está abaixo do mercado — dá pra subir sem perder venda.'],
  riscos: ['Estoque acaba em 2 semanas.'],
};

describe.skipIf(!url)('briefing.repository — integração', () => {
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
      await db.delete(analystBriefings).where(eq(analystBriefings.org_id, id));
      await db.delete(reports).where(eq(reports.org_id, id));
      await db.delete(organizations).where(eq(organizations.id, id));
    }
  });

  it('insertBriefing grava payload e getBriefingUltimoCiclo devolve por org (mais recente)', async () => {
    await insertBriefing(orgId, reportId, PAYLOAD);

    const ultimo = await getBriefingUltimoCiclo(orgId);
    expect(ultimo).not.toBeNull();
    expect(ultimo!.report_id).toBe(reportId);
    expect(ultimo!.payload).toEqual(PAYLOAD);

    const outraSemBriefing = await getBriefingUltimoCiclo(outraOrgId);
    expect(outraSemBriefing).toBeNull();
  });

  it('getBriefingUltimoCiclo devolve o ciclo mais recente quando há vários', async () => {
    const [rep2] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'done',
        periodo_inicio: new Date('2026-07-08'),
        periodo_fim: new Date('2026-07-15'),
      })
      .returning({ id: reports.id });
    const payload2 = { ...PAYLOAD, prioridades: ['Segundo ciclo'] };
    await insertBriefing(orgId, rep2!.id, payload2);

    const ultimo = await getBriefingUltimoCiclo(orgId);
    expect(ultimo!.report_id).toBe(rep2!.id);
    expect(ultimo!.payload).toEqual(payload2);
  });

  it('setBriefingIaUsage é org-guarded — update com org errada não grava', async () => {
    const usage = { input_tokens: 10, output_tokens: 5, tentativas: 1 };

    await setBriefingIaUsage(outraOrgId, reportId, usage);
    const [semGravar] = await db
      .select({ u: reports.briefing_ia_usage })
      .from(reports)
      .where(eq(reports.id, reportId));
    expect(semGravar!.u).toBeNull();

    await setBriefingIaUsage(orgId, reportId, usage);
    const [gravado] = await db
      .select({ u: reports.briefing_ia_usage })
      .from(reports)
      .where(eq(reports.id, reportId));
    expect((gravado!.u as { input_tokens: number }).input_tokens).toBe(10);
  });
});

describe.skipIf(!url)('gerarBriefingDoCiclo — integração', () => {
  const senhaHashPromise = hashPassword('senha-forte-teste-123');
  let orgSemAnalistaId = '';
  let orgComAnalistaId = '';
  let analistaId = '';
  let reportDoneId = '';

  beforeAll(async () => {
    const senha_hash = await senhaHashPromise;

    const [orgSem] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}semanalista-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgSemAnalistaId = orgSem!.id;

    const [orgCom] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}comanalista-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgComAnalistaId = orgCom!.id;

    const [an] = await db
      .insert(users)
      .values({
        org_id: orgComAnalistaId,
        email: `${PREFIX}an-${RUN}@example.com`,
        senha_hash,
        role: 'analista',
      })
      .returning({ id: users.id });
    analistaId = an!.id;

    await db
      .update(organizations)
      .set({ analista_id: analistaId })
      .where(eq(organizations.id, orgComAnalistaId));

    const [rep] = await db
      .insert(reports)
      .values({
        org_id: orgComAnalistaId,
        status: 'done',
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
        analise_ia: {
          resumoExecutivo: 'Resumo do ciclo.',
          gargalos: [],
          sugestoesMelhoria: [],
          ideiasVenda: [],
          recomendacoesPreco: [],
          achados: [{
            titulo: 'Preço abaixo do mercado',
            descricao: 'x',
            tipo: 'preco',
            prioridade: 'alta',
            impactoEstimadoMensalBRL: null,
            comoFazer: [],
            skus: [],
          }],
        },
        metricas: { truth_score: { score: 80 } },
      })
      .returning({ id: reports.id });
    reportDoneId = rep!.id;
  });

  afterAll(async () => {
    const orgIds = [orgSemAnalistaId, orgComAnalistaId].filter(Boolean);
    await db.delete(analystBriefings).where(inArray(analystBriefings.org_id, orgIds));
    await db.delete(reports).where(inArray(reports.org_id, orgIds));
    // organizations.analista_id → users.id (sem ON DELETE): limpar antes do delete de users.
    await db.update(organizations).set({ analista_id: null }).where(like(organizations.name, `${PREFIX}%`));
    if (analistaId) await db.delete(users).where(eq(users.id, analistaId));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('org SEM analista_id → retorna null SEM chamar a IA', async () => {
    vi.mocked(gerarBriefingComIA).mockClear();

    const [repSem] = await db
      .insert(reports)
      .values({
        org_id: orgSemAnalistaId,
        status: 'done',
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
        analise_ia: { resumoExecutivo: 'x', gargalos: [], sugestoesMelhoria: [], ideiasVenda: [], recomendacoesPreco: [] },
      })
      .returning({ id: reports.id });

    const resultado = await gerarBriefingDoCiclo({
      orgId: orgSemAnalistaId,
      reportId: repSem!.id,
      orgName: 'Loja Sem Analista',
      nicho: null,
    });

    expect(resultado).toBeNull();
    expect(gerarBriefingComIA).not.toHaveBeenCalled();

    await db.delete(reports).where(eq(reports.id, repSem!.id));
  });

  it('org COM analista_id → chama a IA com os insumos do próprio report e grava briefing + usage', async () => {
    vi.mocked(gerarBriefingComIA).mockClear();
    vi.mocked(gerarBriefingComIA).mockResolvedValue({
      briefing: PAYLOAD,
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        tentativas: 1,
      },
    });

    const resultado = await gerarBriefingDoCiclo({
      orgId: orgComAnalistaId,
      reportId: reportDoneId,
      orgName: 'Loja Com Analista',
      nicho: 'cozinha',
    });

    expect(resultado).not.toBeNull();
    expect(gerarBriefingComIA).toHaveBeenCalledWith(
      expect.objectContaining({
        orgName: 'Loja Com Analista',
        nicho: 'cozinha',
        resumoExecutivo: 'Resumo do ciclo.',
        achadosTitulos: ['Preço abaixo do mercado'],
        truthScore: 80,
      }),
    );

    const gravado = await getBriefingUltimoCiclo(orgComAnalistaId);
    expect(gravado!.report_id).toBe(reportDoneId);
    expect(gravado!.payload).toEqual(PAYLOAD);

    const [rep] = await db
      .select({ u: reports.briefing_ia_usage })
      .from(reports)
      .where(eq(reports.id, reportDoneId));
    expect((rep!.u as { input_tokens: number }).input_tokens).toBe(100);
  });
});
