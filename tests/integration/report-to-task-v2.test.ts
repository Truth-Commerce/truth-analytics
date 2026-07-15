import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, reports, taskActivities, taskTemplates, tasks } from '@/db/schema';
import { createTasksFromReport } from '@/modules/tasks/report-to-task.repository';
import { prazoDefault } from '@/modules/tasks/sla';
import { createTemplate } from '@/modules/tasks/task-template.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-r2t-v2-';

const ACHADO_LOGISTICA = {
  titulo: `${PREFIX}Frete come 12% da receita no Mercado Livre ${RUN}`,
  descricao: 'O frete médio de R$ 25 representa 12% da receita do canal.',
  tipo: 'logistica',
  prioridade: 'alta',
  impactoEstimadoMensalBRL: 1200,
  comoFazer: ['Ativar o Mercado Envios Full'],
  skus: ['SKU-001'],
} as const;

const ACHADO_PRECO = {
  titulo: `${PREFIX}Kit inicial 8% acima da mediana ${RUN}`,
  descricao: 'O kit está 8% acima da mediana de mercado.',
  tipo: 'preco',
  prioridade: 'media',
  impactoEstimadoMensalBRL: 500,
  comoFazer: [],
  skus: [],
} as const;

const SAMPLE_ANALISE = {
  resumoExecutivo: 'R.',
  gargalos: [],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
  achados: [ACHADO_LOGISTICA, ACHADO_PRECO],
};

// totalVendas() soma `evolucao` (fonte de verdade do total do período) — o
// baseline vem daí, não de vendasPorCanal.
const SAMPLE_METRICAS = {
  vendasPorCanal: [{ canal: 'shopee', total: 10880.5, pedidos: 48 }],
  evolucao: [{ data: '2026-06-15', total: 10880.5 }],
  ticketMedio: 0,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
};

describe.skipIf(!url)('report-to-task — conversão v2 (integração)', () => {
  let orgId = '';
  let reportId = '';
  let templateId = '';

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
        metricas: SAMPLE_METRICAS,
      })
      .returning({ id: reports.id });
    reportId = rep!.id;
    templateId = await createTemplate({
      titulo: `${PREFIX}Playbook logística ${RUN}`,
      tipo: 'logistica',
      checklist: ['Conferir tabela de frete'],
    });
  });

  afterAll(async () => {
    const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));
    for (const r of rows) await db.delete(taskActivities).where(eq(taskActivities.task_id, r.id));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(taskTemplates).where(eq(taskTemplates.id, templateId));
  });

  it('conversão v2: prazo do form, baseline das métricas, link e checklist do playbook', async () => {
    const criadas = await createTasksFromReport({
      reportId,
      orgId,
      itens: [{ fonte: 'achados', indice: 0, prazo: '2026-08-01', usarChecklistPlaybook: true }],
      actorUserId: null,
    });
    expect(criadas).toBe(1);
    const [t] = await db.select().from(tasks).where(eq(tasks.org_id, orgId));
    expect(t!.prazo).toBe('2026-08-01');
    expect(t!.descricao).toContain('Vendas do período: R$');
    expect(t!.descricao).toContain('10.880,50');
    expect(t!.descricao).toContain(`[Ver relatório](/dashboard/relatorios/${reportId})`);
    expect(t!.descricao).toContain('- [ ] Conferir tabela de frete');
  });

  it('caminho rápido (sem overrides): prazo = prazoDefault e sem checklist de playbook', async () => {
    const criadas = await createTasksFromReport({
      reportId,
      orgId,
      itens: [{ fonte: 'achados', indice: 1 }],
      actorUserId: null,
    });
    expect(criadas).toBe(1);
    const [t] = await db
      .select()
      .from(tasks)
      .where(eq(tasks.titulo, ACHADO_PRECO.titulo.slice(0, 140)));
    expect(t!.prazo).toBe(prazoDefault('media')); // prioridade do PRÓPRIO achado
    expect(t!.descricao).toContain('Vendas do período: R$');
    expect(t!.descricao).toContain(`[Ver relatório](/dashboard/relatorios/${reportId})`);
    expect(t!.descricao).not.toContain('Conferir tabela de frete');
  });
});
