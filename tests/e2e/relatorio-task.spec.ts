import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EActiveClient, seedReport } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const clienteEmail = `${E2E_PREFIX}relatorio-task-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-relatorio-task-789';

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

const SAMPLE_ANALISE = {
  resumoExecutivo: 'Desempenho sólido no período com crescimento consistente nas vendas.',
  gargalos: ['Custo de frete elevado no canal ML'],
  sugestoesMelhoria: ['Negociar tarifas de envio com parceiros logísticos'],
  ideiasVenda: ['Criar kit promocional com produto principal + acessório'],
  recomendacoesPreco: [
    {
      sku: 'SKU-001',
      nome: 'Produto Teste',
      precoSugerido: 98.0,
      justificativa: 'Ajuste competitivo baseado na mediana do mercado.',
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
    analiseIa: SAMPLE_ANALISE,
  });
});

test.afterAll(async () => {
  await cleanupE2E();
});

test('relatório → task: achado da IA vira task no Plano de Ação', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto(`/dashboard/relatorios/${seededReportId}`);
  await expect(page.getByTestId('resumo-executivo')).toBeVisible();

  await page.getByTestId('virar-task-gargalos-0').click();
  // DIVERGÊNCIA DOCUMENTADA (brief usava `toBeDisabled()`): o mesmo botão fica
  // `disabled` tanto durante o estado "pending" do submit quanto no estado
  // final "Task criada" (`disabled={pending}` no VirarTaskButton) — logo
  // `toBeDisabled()` pode resolver ainda em voo, ANTES do commit no banco, e o
  // goto seguinte lê dados desatualizados (flakiness observada rodando a
  // suíte inteira, embora o spec isolado sempre passasse). Asserir o TEXTO
  // final ("Task criada") garante esperar o server action de fato concluir e
  // o re-render pós-`revalidatePath` acontecer antes de navegar.
  await expect(page.getByTestId('virar-task-gargalos-0')).toHaveText('Task criada');

  await page.goto('/dashboard/plano-de-acao');
  const backlog = page.getByTestId('kanban-col-backlog');
  await expect(backlog.getByTestId('task-card')).toHaveCount(1);
  await expect(backlog).toContainText('Custo de frete elevado no canal ML');
});
