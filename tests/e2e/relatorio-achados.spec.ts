import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EActiveClient, seedReport } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const clienteEmail = `${E2E_PREFIX}relatorio-achados-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-relatorio-achados-789';

// Duplicado de dashboard.spec.ts — specs do Playwright são isolados, sem
// import entre arquivos de teste.
const SAMPLE_METRICAS = {
  vendasPorCanal: [{ canal: 'Mercado Livre', total: 1000.0, pedidos: 10 }],
  evolucao: [{ data: '2026-06-01', total: 500.0 }, { data: '2026-06-30', total: 500.0 }],
  ticketMedio: 123.45,
  topProdutos: [{ nome: 'Produto Teste', sku: 'SKU-001', quantidade: 10, receita: 1000.0 }],
  posicaoPreco: [
    {
      sku: 'SKU-001',
      nome: 'Produto Teste',
      nossoPreco: 100.0,
      precoMercadoMediano: 95.0,
      fonte: 'Mercado Livre',
    },
  ],
  benchmarkParcial: false,
};

// Relatório v2: SÓ `achados` (arrays legados VAZIOS) — cobre também o
// must-fix da T7: a seção Recomendações deve renderizar mesmo sem
// gargalos/sugestões/ideias, alinhada com a condição do TOC.
const SAMPLE_ANALISE_V2 = {
  resumoExecutivo: 'Período com margem pressionada pelo frete no canal principal.',
  gargalos: [],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
  achados: [
    {
      titulo: 'Revisar precificação do kit inicial',
      descricao: 'O kit está 8% acima da mediana de mercado.',
      tipo: 'preco',
      prioridade: 'media',
      impactoEstimadoMensalBRL: 500,
      comoFazer: [],
      skus: [],
    },
    {
      titulo: 'Renegociar frete no Mercado Livre',
      descricao: 'Frete consome 18% da receita do canal.',
      tipo: 'logistica',
      prioridade: 'alta',
      impactoEstimadoMensalBRL: 2000,
      comoFazer: ['Cotar transportadoras parceiras', 'Ativar Mercado Envios Flex'],
      skus: ['SKU-001'],
    },
  ],
};

let seededOrgId: string;
let seededReportId: string;

test.beforeAll(async () => {
  seededOrgId = await seedE2EActiveClient(clienteEmail, clienteSenha);
  seededReportId = await seedReport(seededOrgId, {
    status: 'done',
    metricas: SAMPLE_METRICAS,
    analiseIa: SAMPLE_ANALISE_V2,
  });
});

test.afterAll(async () => {
  await cleanupE2E();
});

test('relatório v2 → achados viram cards ordenados por impacto e "Virar tarefa" cria task estruturada', async ({
  page,
}) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto(`/dashboard/relatorios/${seededReportId}`);
  await expect(page.getByTestId('resumo-executivo')).toBeVisible();

  // MUST-FIX T7: seção renderiza com arrays legados vazios (só `achados`) —
  // a âncora #recomendacoes do TOC não pode ficar morta.
  const cards = page.getByTestId('achados-cards');
  await expect(cards).toBeVisible();
  await expect(page.locator('#recomendacoes')).toBeVisible();

  // Ordenação por impacto R$ desc: o achado de índice ORIGINAL 1 (R$ 2.000)
  // vem antes do de índice 0 (R$ 500); o testid preserva o índice original.
  const botoes = cards.getByTestId(/^virar-task-achados-/);
  await expect(botoes).toHaveCount(2);
  await expect(botoes.nth(0)).toHaveAttribute('data-testid', 'virar-task-achados-1');
  await expect(botoes.nth(1)).toHaveAttribute('data-testid', 'virar-task-achados-0');

  // Conteúdo do card top: prioridade, tipo, impacto formatado e passos.
  await expect(cards).toContainText('Renegociar frete no Mercado Livre');
  await expect(cards).toContainText('Prioridade Alta');
  await expect(cards).toContainText('Logística');
  await expect(cards).toContainText('/mês');
  await expect(cards).toContainText('Cotar transportadoras parceiras');
  await expect(cards).toContainText('SKU-001');

  await page.getByTestId('virar-task-achados-1').click();
  // Mesmo racional do relatorio-task.spec.ts: asserir o TEXTO final garante
  // esperar o server action concluir antes de navegar.
  await expect(page.getByTestId('virar-task-achados-1')).toHaveText('Tarefa criada');

  await page.goto('/dashboard/plano-de-acao');
  const backlog = page.getByTestId('kanban-col-backlog');
  await expect(backlog.getByTestId('task-card')).toHaveCount(1);
  await expect(backlog).toContainText('Renegociar frete no Mercado Livre');
  // Task estruturada: tipo e prioridade vêm do PRÓPRIO achado (não da fonte).
  await expect(backlog).toContainText('Logística');
  await expect(backlog).toContainText('Alta');
});
