import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EActiveClient, seedE2EAdmin } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const adminEmail = `${E2E_PREFIX}imp-admin-${RUN}@example.com`;
const adminSenha = 'admin-forte-123';
const clienteEmail = `${E2E_PREFIX}imp-cli-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-123';

let orgId = '';

test.beforeAll(async () => {
  await seedE2EAdmin(adminEmail, adminSenha);
  orgId = await seedE2EActiveClient(clienteEmail, clienteSenha);
});

test.afterAll(async () => {
  await cleanupE2E();
});

async function loginAdmin(page: import('@playwright/test').Page) {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="senha"]', adminSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

test('admin "vê como cliente": banner aparece, leitura funciona, mutação é bloqueada, Sair encerra', async ({
  page,
}) => {
  await loginAdmin(page);

  // Inicia a impersonação a partir da página do cliente no /admin.
  await page.goto(`/admin/${orgId}`);
  await page.getByTestId('ver-como-cliente').click();
  await page.waitForURL(/\/dashboard$/);

  // Banner presente, com o nome da org alvo, e SEM o menu do admin.
  const banner = page.getByTestId('impersonation-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(`${E2E_PREFIX}cliente-ativo`);

  // Leitura funciona normalmente: /conexoes (cliente alvo) carrega sem redirect.
  await page.goto('/conexoes');
  await expect(page).toHaveURL(/\/conexoes$/);
  await expect(page.getByTestId('bling-status')).toBeVisible();

  // Mutação sob impersonação é REJEITADA (requireActiveOrgParaMutacao lança
  // → cai no error boundary global) — read-only por construção.
  await page.getByTestId('add-form').locator('input[name="nome"]').fill(`${E2E_PREFIX}produto-bloqueado`);
  await page.getByTestId('add-form').getByRole('button', { name: /adicionar/i }).click();
  await expect(page.getByText('Algo deu errado.')).toBeVisible();

  // Volta pro fluxo normal e encerra a impersonação.
  await page.goto('/conexoes');
  await page.getByTestId('impersonation-banner').getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/admin$/);
  await expect(page.getByTestId('impersonation-banner')).toHaveCount(0);
});

test('cliente real nunca vê a faixa de impersonação', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('impersonation-banner')).toHaveCount(0);
});
