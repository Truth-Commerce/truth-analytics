import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EAdmin } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const adminEmail = `${E2E_PREFIX}admin-${RUN}@example.com`;
const adminSenha = 'admin-forte-123';
const clienteEmail = `${E2E_PREFIX}cli-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-123';
const clienteAdminEmail = `${E2E_PREFIX}cli-admin-${RUN}@example.com`;
const analistaAdminEmail = `${E2E_PREFIX}analista-admin-${RUN}@example.com`;
const promovidoEmail = `${E2E_PREFIX}promovido-${RUN}@example.com`;

test.beforeAll(async () => {
  await seedE2EAdmin(adminEmail, adminSenha);
});

test.afterAll(async () => {
  await cleanupE2E();
});

test('admin ativa um cliente pendente definindo plano', async ({ page, browser }) => {
  // cria um cliente pendente via cadastro (usa o contexto/página atual)
  await page.goto('/sign-up');
  await page.fill('input[name="orgName"]', `${E2E_PREFIX}Loja-${RUN}`);
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.check('input[name="aceite"]');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/aguardando/);

  // usa um contexto isolado para logar como admin (sem cookie do cliente)
  const adminCtx = await browser.newContext();
  const adminPage = await adminCtx.newPage();

  try {
    await adminPage.goto('/sign-in');
    await adminPage.fill('input[name="email"]', adminEmail);
    await adminPage.fill('input[name="senha"]', adminSenha);
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

    // vai ao painel, encontra o cliente, ativa com plano semanal
    await adminPage.goto('/admin');
    await expect(adminPage.getByText(`${E2E_PREFIX}Loja-${RUN}`)).toBeVisible();
    const row = adminPage.locator('tr', { hasText: `${E2E_PREFIX}Loja-${RUN}` });
    await row.locator('select[name="plano"]').selectOption('weekly');
    await row.getByRole('button', { name: 'Ativar' }).click();

    await expect(row.getByText('Ativo')).toBeVisible();
  } finally {
    await adminCtx.close();
  }
});

test('admin cria cliente com organização e analista interno em fluxos separados', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="senha"]', adminSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  // Aba de clientes: criação da empresa + primeiro acesso.
  await page.goto('/admin/usuarios?aba=clientes');

  const clientForm = page.getByTestId('usuarios-criar-cliente-form');
  await expect(clientForm.locator('select')).toHaveCount(0);
  await clientForm.locator('input[name="orgName"]').fill(`${E2E_PREFIX}Cliente Admin ${RUN}`);
  await clientForm.locator('input[name="email"]').fill(clienteAdminEmail);
  await clientForm.getByRole('button', { name: 'Criar cliente' }).click();
  await expect(page.getByTestId('usuarios-criar-cliente-sucesso')).toBeVisible();
  await expect(page.getByTestId('clientes-table').getByText(clienteAdminEmail)).toBeVisible();

  // Aba da equipe: criação do analista interno.
  await page.goto('/admin/usuarios?aba=equipe');

  const analystForm = page.getByTestId('usuarios-criar-analista-form');
  await expect(analystForm.locator('select')).toHaveCount(0);
  await analystForm.locator('input[name="email"]').fill(analistaAdminEmail);
  await analystForm.getByRole('button', { name: 'Criar analista' }).click();
  await expect(page.getByTestId('usuarios-criar-analista-sucesso')).toBeVisible();
  await expect(page.getByTestId('equipe-table').getByText(analistaAdminEmail)).toBeVisible();

  // Cada aba mostra só o seu: o analista não aparece entre os clientes.
  await page.goto('/admin/usuarios?aba=clientes');
  await expect(page.getByTestId('clientes-table').getByText(analistaAdminEmail)).toHaveCount(0);
});

test('admin promove uma conta de cliente a analista e ela muda de aba', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="senha"]', adminSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/admin/usuarios?aba=clientes');
  const clientForm = page.getByTestId('usuarios-criar-cliente-form');
  await clientForm.locator('input[name="orgName"]').fill(`${E2E_PREFIX}Promovido ${RUN}`);
  await clientForm.locator('input[name="email"]').fill(promovidoEmail);
  await clientForm.getByRole('button', { name: 'Criar cliente' }).click();
  await expect(page.getByTestId('usuarios-criar-cliente-sucesso')).toBeVisible();

  const linha = page.getByTestId('clientes-table').locator('tr', { hasText: promovidoEmail });
  await linha.locator('select[name="role"]').selectOption('analista');
  await linha.getByRole('button', { name: 'Salvar' }).click();
  await expect(linha.locator('[data-testid^="papel-ok-"]')).toContainText('Papel alterado');

  // Sai da aba de clientes e entra na da equipe, já na operação interna.
  await page.goto('/admin/usuarios?aba=clientes');
  await expect(page.getByTestId('clientes-table').getByText(promovidoEmail)).toHaveCount(0);

  await page.goto('/admin/usuarios?aba=equipe');
  const linhaEquipe = page.getByTestId('equipe-table').locator('tr', { hasText: promovidoEmail });
  await expect(linhaEquipe).toBeVisible();
  await expect(linhaEquipe.getByText('Fora da operação interna')).toHaveCount(0);
});
