import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EActiveClient, seedReport } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const clienteEmail = `${E2E_PREFIX}dash-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-dashboard-789';

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

test('ver relatório: dashboard mostra último relatório e detalhe exibe métricas e análise IA', async ({ page }) => {
  // Login
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  // Dashboard deve mostrar o último relatório semeado
  await page.goto('/dashboard');
  await expect(page.getByTestId('latest-report')).toBeVisible();

  // Clica no link "Ver relatório" (valida href + data-testid de ponta a ponta)
  await page.getByTestId('ver-relatorio').click();
  await page.waitForURL((url) => url.pathname.includes('/dashboard/relatorios/'));

  // Deve mostrar o resumo executivo
  await expect(page.getByTestId('resumo-executivo')).toContainText(
    'Desempenho sólido no período com crescimento consistente nas vendas.',
  );

  // Deve mostrar o ticket médio formatado (123,45 em pt-BR)
  await expect(page.getByTestId('metricas')).toContainText('123,45');
});

test('gating: cliente sem Bling tem botão de geração desabilitado com motivo', async ({ page }) => {
  // Login — cliente sem conexão Bling semeada
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/dashboard');

  // Botão de geração deve estar desabilitado
  const btn = page.getByTestId('generate-report-button');
  await expect(btn).toBeDisabled();

  // Motivo: Bling não conectado
  await expect(page.getByText('Conecte o Bling em Conexões.')).toBeVisible();
});

test('shell mantém um único título principal por página', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/dashboard');
  await expect(page.locator('h1')).toHaveCount(1);
});

test('menu móvel é modal e devolve o foco ao gatilho ao fechar com Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/dashboard');
  const trigger = page.getByRole('button', { name: 'Abrir menu' });
  await expect(trigger.locator('xpath=ancestor::header')).toHaveCount(1);
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Navegação principal' });
  await expect(dialog).toBeVisible();
  const overlay = dialog.locator('xpath=..');
  const overlayGeometry = await overlay.evaluate((element) => {
    const { height, width, x, y } = element.getBoundingClientRect();
    return {
      height,
      parentIsBody: element.parentElement === document.body,
      width,
      x,
      y,
    };
  });
  expect(overlayGeometry.parentIsBody).toBe(true);
  expect(Math.abs(overlayGeometry.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(overlayGeometry.y)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(overlayGeometry.width - 390)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(overlayGeometry.height - 844)).toBeLessThanOrEqual(0.5);
  await expect(dialog.getByRole('button', { name: 'Fechar menu' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
