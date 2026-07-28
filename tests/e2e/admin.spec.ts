import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EAdmin } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const adminEmail = `${E2E_PREFIX}admin-${RUN}@example.com`;
const adminSenha = 'admin-forte-123';
const clienteEmail = `${E2E_PREFIX}cli-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-123';
const clienteAdminEmail = `${E2E_PREFIX}cli-admin-${RUN}@example.com`;
const analistaAdminEmail = `${E2E_PREFIX}analista-admin-${RUN}@example.com`;

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

  await page.goto('/admin/usuarios');

  const clientForm = page.getByTestId('usuarios-criar-cliente-form');
  await expect(clientForm.locator('select')).toHaveCount(0);
  await clientForm.locator('input[name="orgName"]').fill(`${E2E_PREFIX}Cliente Admin ${RUN}`);
  await clientForm.locator('input[name="email"]').fill(clienteAdminEmail);
  await clientForm.getByRole('button', { name: 'Criar cliente' }).click();
  await expect(page.getByTestId('usuarios-criar-cliente-sucesso')).toBeVisible();
  await expect(page.getByText(clienteAdminEmail, { exact: true }).first()).toBeVisible();

  const analystForm = page.getByTestId('usuarios-criar-analista-form');
  await expect(analystForm.locator('select')).toHaveCount(0);
  await analystForm.locator('input[name="email"]').fill(analistaAdminEmail);
  await analystForm.getByRole('button', { name: 'Criar analista' }).click();
  await expect(page.getByTestId('usuarios-criar-analista-sucesso')).toBeVisible();
  await expect(page.getByText(analistaAdminEmail, { exact: true }).first()).toBeVisible();
});
