import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EAdmin } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const adminEmail = `${E2E_PREFIX}admin-${RUN}@example.com`;
const adminSenha = 'admin-forte-123';
const clienteEmail = `${E2E_PREFIX}cli-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-123';

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

    await expect(row.getByText('active')).toBeVisible();
  } finally {
    await adminCtx.close();
  }
});
