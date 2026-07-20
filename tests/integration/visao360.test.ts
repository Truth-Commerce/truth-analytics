import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import {
  alerts,
  analystBriefings,
  calendarSuggestions,
  kitSuggestions,
  organizations,
  productStock,
  orders,
  reports,
  tasks,
  users,
} from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import type { UserAccess } from '@/modules/auth/user.types';
import type { Metricas } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-visao360-';

const asAccess = (id: string, role: UserAccess['role']): UserAccess =>
  ({ id, orgId: 'x', role, orgStatus: 'active', plano: null }) as UserAccess;

function metricas(total: number, score: number): Metricas {
  return {
    vendasPorCanal: [{ canal: 'shopee', total, pedidos: 3 }],
    evolucao: [],
    ticketMedio: 100,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
    truth_score: {
      score,
      totalPeriodo: total,
      totalPeriodoAnterior: null,
      fatores: {
        crescimento: { pontos: 0, max: 20, variacaoPercentual: null },
        posicaoPreco: { pontos: 0, max: 20, itensAvaliados: 0 },
        diversificacao: { pontos: 0, max: 20, canaisComVenda: 1 },
        regularidade: { pontos: 0, max: 20, diasComVenda: 1, diasPeriodo: 7 },
        cobertura: { pontos: 0, max: 20, produtosComBenchmark: 0, produtosAvaliados: 0 },
      },
    },
  };
}

const BRIEFING_A = {
  prioridades: ['Prioridade da org A'],
  argumentosReuniao: ['Argumento da org A'],
  riscos: ['Risco da org A'],
};
const BRIEFING_B = {
  prioridades: ['Prioridade da org B (NÃO deve vazar)'],
  argumentosReuniao: ['Argumento da org B'],
  riscos: [],
};

describe.skipIf(!url)('visao360.repository — integração multi-tenant', () => {
  let orgAId = '';
  let orgBId = '';
  let analistaId = '';
  let reportOrigemId = '';
  let reportAtualId = '';
  let taskConcluidaId = '';

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');

    const [orgA] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-a-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgAId = orgA!.id;

    const [orgB] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-b-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgBId = orgB!.id;

    const [an] = await db
      .insert(users)
      .values({ org_id: orgAId, email: `${PREFIX}an-${RUN}@example.com`, senha_hash, role: 'analista' })
      .returning({ id: users.id });
    analistaId = an!.id;

    // Carteira do analista = só orgA; orgB fica fora (guard de assertOrgAccess).
    await db.update(organizations).set({ analista_id: analistaId }).where(eq(organizations.id, orgAId));

    // --- orgA: 2 relatórios done, mais antigo → mais recente (score sobe 40 → 70) ---
    const [origem] = await db
      .insert(reports)
      .values({
        org_id: orgAId,
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        status: 'done',
        metricas: metricas(1000, 40),
      })
      .returning({ id: reports.id });
    reportOrigemId = origem!.id;
    await db.update(reports).set({ created_at: new Date('2026-06-01T00:00:00Z') }).where(eq(reports.id, reportOrigemId));

    const [atual] = await db
      .insert(reports)
      .values({
        org_id: orgAId,
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
        status: 'done',
        metricas: metricas(1500, 70),
      })
      .returning({ id: reports.id });
    reportAtualId = atual!.id;
    await db.update(reports).set({ created_at: new Date('2026-07-01T00:00:00Z') }).where(eq(reports.id, reportAtualId));

    // --- orgA: estoque (produto crítico com giro) ---
    await db.insert(productStock).values({ org_id: orgAId, sku: `${PREFIX}sku-a`, nome: 'Produto A', saldo: '5.00' });
    await db.insert(orders).values({
      org_id: orgAId,
      bling_order_id: `${PREFIX}order-a-${RUN}`,
      canal: 'teste',
      data: new Date('2026-07-05'),
      valor_total: '100.00',
      itens: [{ sku: `${PREFIX}sku-a`, nome: 'Produto A', quantidade: 30, valor: 100 }],
    });

    // --- orgA: kit + sugestão de calendário (ligados ao report atual) ---
    await db.insert(kitSuggestions).values({
      org_id: orgAId,
      report_id: reportAtualId,
      titulo: 'Kit da org A',
      payload: { itens: [{ sku: 'x', nome: 'x' }], precoSugerido: 50, argumento: 'a', canalRecomendado: 'shopee' },
    });
    await db.insert(calendarSuggestions).values({
      org_id: orgAId,
      report_id: reportAtualId,
      titulo: 'Sugestão da org A',
      payload: { dataISO: '2026-08-15', nomeData: 'Dia dos Pais', sugestao: 'Anuncie', skus: ['x'] },
    });

    // --- orgA: alertas (1 aberto + 1 resolvido) ---
    await db.insert(alerts).values([
      {
        org_id: orgAId,
        tipo: 'produto_parado',
        severidade: 'atencao',
        titulo: 'Alerta aberto da org A',
        corpo: 'corpo',
        dados: { chave_dedup: 'aberto-a' },
        resolvido: false,
      },
      {
        org_id: orgAId,
        tipo: 'queda_vendas',
        severidade: 'critico',
        titulo: 'Alerta resolvido da org A',
        corpo: 'corpo',
        dados: { chave_dedup: 'resolvido-a' },
        resolvido: true,
        resolvido_em: new Date(),
      },
    ]);

    // --- orgA: task concluída com impacto (mesmo padrão de task-impact.test.ts) ---
    const [taskConcluida] = await db
      .insert(tasks)
      .values({
        org_id: orgAId,
        titulo: 'Task concluída da org A',
        tipo: 'catalogo',
        prioridade: 'media',
        status: 'concluida',
        criado_por: 'analista',
        report_id: reportOrigemId,
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskConcluidaId = taskConcluida!.id;
    await db.insert(tasks).values({
      org_id: orgAId,
      titulo: 'Task em andamento da org A',
      tipo: 'catalogo',
      prioridade: 'media',
      status: 'em_andamento',
      criado_por: 'analista',
      ordem: 2,
    });

    // --- orgA: briefing do ciclo ---
    await db.insert(analystBriefings).values({ org_id: orgAId, report_id: reportAtualId, payload: BRIEFING_A });

    // --- orgB: dados distintos, só para provar isolamento (não deve vazar p/ orgA) ---
    const [reportB] = await db
      .insert(reports)
      .values({
        org_id: orgBId,
        periodo_inicio: new Date('2026-07-01'),
        periodo_fim: new Date('2026-07-08'),
        status: 'done',
        metricas: metricas(999, 99),
      })
      .returning({ id: reports.id });
    await db.insert(kitSuggestions).values({
      org_id: orgBId,
      report_id: reportB!.id,
      titulo: 'Kit da org B (NÃO deve vazar)',
      payload: {},
    });
    await db.insert(calendarSuggestions).values({
      org_id: orgBId,
      report_id: reportB!.id,
      titulo: 'Sugestão da org B (NÃO deve vazar)',
      payload: {},
    });
    await db.insert(alerts).values({
      org_id: orgBId,
      tipo: 'produto_parado',
      severidade: 'atencao',
      titulo: 'Alerta da org B (NÃO deve vazar)',
      corpo: 'corpo',
      dados: { chave_dedup: 'aberto-b' },
      resolvido: false,
    });
    await db.insert(analystBriefings).values({ org_id: orgBId, report_id: reportB!.id, payload: BRIEFING_B });
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId].filter(Boolean);
    if (orgIds.length) {
      await db.delete(analystBriefings).where(inArray(analystBriefings.org_id, orgIds));
      await db.delete(kitSuggestions).where(inArray(kitSuggestions.org_id, orgIds));
      await db.delete(calendarSuggestions).where(inArray(calendarSuggestions.org_id, orgIds));
      await db.delete(alerts).where(inArray(alerts.org_id, orgIds));
      await db.delete(tasks).where(inArray(tasks.org_id, orgIds));
      await db.delete(orders).where(inArray(orders.org_id, orgIds));
      await db.delete(productStock).where(inArray(productStock.org_id, orgIds));
      await db.delete(reports).where(inArray(reports.org_id, orgIds));
    }
    // organizations.analista_id → users.id (sem ON DELETE): limpar antes do delete de users.
    await db.update(organizations).set({ analista_id: null }).where(like(organizations.name, `${PREFIX}%`));
    if (analistaId) await db.delete(users).where(eq(users.id, analistaId));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('assertOrgAccess: guarda a visão 360 — org fora da carteira lança, org da carteira resolve', async () => {
    await expect(assertOrgAccess(asAccess(analistaId, 'analista'), orgBId)).rejects.toThrow('acesso_negado');
    await expect(assertOrgAccess(asAccess(analistaId, 'analista'), orgAId)).resolves.toBeUndefined();
  });

  it('scoreHistorico: cronológico (mais antigo primeiro), só da própria org', async () => {
    const { getVisao360 } = await import('@/modules/analista/visao360.repository');
    const visao = await getVisao360(orgAId, new Date('2026-07-10'));

    expect(visao.scoreHistorico).toHaveLength(2);
    expect(visao.scoreHistorico[0]!.score).toBe(40);
    expect(visao.scoreHistorico[1]!.score).toBe(70);
  });

  it('estoque: cobertura calculada a partir do saldo + vendas 30d da própria org', async () => {
    const { getVisao360 } = await import('@/modules/analista/visao360.repository');
    const visao = await getVisao360(orgAId, new Date('2026-07-10'));

    expect(visao.estoque).toHaveLength(1);
    expect(visao.estoque[0]!.sku).toBe(`${PREFIX}sku-a`);
    expect(visao.estoque[0]!.vendas30d).toBe(30);
  });

  it('kits e sugestões de calendário: só da própria org, status "sugerido"', async () => {
    const { getVisao360 } = await import('@/modules/analista/visao360.repository');
    const visao = await getVisao360(orgAId, new Date('2026-07-10'));

    const titulosKits = visao.kits.map((k) => k.titulo);
    expect(titulosKits).toContain('Kit da org A');
    expect(titulosKits).not.toContain('Kit da org B (NÃO deve vazar)');
    expect(visao.kits[0]!.status).toBe('sugerido');

    const titulosSugestoes = visao.sugestoesCalendario.map((s) => s.titulo);
    expect(titulosSugestoes).toContain('Sugestão da org A');
    expect(titulosSugestoes).not.toContain('Sugestão da org B (NÃO deve vazar)');
  });

  it('alertas: linha do tempo com abertos primeiro, só da própria org', async () => {
    const { getVisao360 } = await import('@/modules/analista/visao360.repository');
    const visao = await getVisao360(orgAId, new Date('2026-07-10'));

    expect(visao.alertas).toHaveLength(2);
    expect(visao.alertas[0]!.resolvido).toBe(false);
    expect(visao.alertas[0]!.titulo).toBe('Alerta aberto da org A');
    expect(visao.alertas[1]!.resolvido).toBe(true);
    expect(visao.alertas.map((a) => a.titulo)).not.toContain('Alerta da org B (NÃO deve vazar)');
  });

  it('tasksImpacto: task concluída com relatório posterior aparece com o delta correto', async () => {
    const { getVisao360 } = await import('@/modules/analista/visao360.repository');
    const visao = await getVisao360(orgAId, new Date('2026-07-10'));

    const item = visao.tasksImpacto.find((t) => t.task.id === taskConcluidaId);
    expect(item).toBeDefined();
    expect(item!.impacto.totalOrigem).toBe(1000);
    expect(item!.impacto.totalAtual).toBe(1500);
    expect(item!.impacto.deltaPct).toBe(50);
    // A task "em andamento" nunca aparece (não está concluída).
    expect(visao.tasksImpacto.map((t) => t.task.titulo)).not.toContain('Task em andamento da org A');
  });

  it('briefing: pauta do ciclo mais recente da própria org (nunca a de outra org)', async () => {
    const { getVisao360 } = await import('@/modules/analista/visao360.repository');
    const visao = await getVisao360(orgAId, new Date('2026-07-10'));

    expect(visao.briefing).toEqual(BRIEFING_A);
    expect(visao.briefingCriadoEm).not.toBeNull();
  });

  it('org sem nenhum dado: todas as camadas voltam vazias/nulas, sem lançar', async () => {
    const [orgVazia] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}vazia-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });

    const { getVisao360 } = await import('@/modules/analista/visao360.repository');
    const visao = await getVisao360(orgVazia!.id, new Date('2026-07-10'));

    expect(visao).toEqual({
      scoreHistorico: [],
      estoque: [],
      kits: [],
      sugestoesCalendario: [],
      alertas: [],
      tasksImpacto: [],
      briefing: null,
      briefingCriadoEm: null,
    });

    await db.delete(organizations).where(eq(organizations.id, orgVazia!.id));
  });
});
