import { expect, test, type Page } from '@playwright/test';

import {
  cleanupE2E,
  E2E_PREFIX,
  seedE2EActiveClient,
  seedE2EAnalista,
} from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const clientEmail = `${E2E_PREFIX}olist-client-${RUN}@example.com`;
const analystEmail = `${E2E_PREFIX}olist-analyst-${RUN}@example.com`;
const unassignedEmail = `${E2E_PREFIX}olist-unassigned-${RUN}@example.com`;
const password = 'olist-e2e-password-123';
let orgId = '';

test.beforeAll(async () => {
  const analystId = await seedE2EAnalista(analystEmail, password);
  await seedE2EAnalista(unassignedEmail, password);
  orgId = await seedE2EActiveClient(clientEmail, password, { analistaId: analystId });
});

test.afterAll(cleanupE2E);

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

test('cliente e analista atribuído configuram credenciais sem vazar segredo', async ({ page }) => {
  await login(page, clientEmail);
  await page.goto('/conexoes');
  await page.fill('input[name="clientId"]', 'e2e-client-id');
  await page.fill('input[name="clientSecret"]', 'e2e-secret-value');
  await page.getByRole('button', { name: 'Salvar credenciais' }).click();
  await expect(page.getByText('Credenciais salvas')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Autorizar no Olist' })).toBeVisible();
  expect(await page.content()).not.toContain('e2e-secret-value');

  await page.context().clearCookies();
  await login(page, analystEmail);
  await page.goto(`/analista/${orgId}?tab=conexao`);
  await expect(page.getByTestId('tab-conexao')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Olist ERP (antigo Tiny)')).toBeVisible();
  await page.getByRole('button', { name: 'Alterar credenciais' }).click();
  await page.fill('input[name="clientId"]', 'e2e-client-id-2');
  await page.fill('input[name="clientSecret"]', 'e2e-secret-value-2');
  await page.getByRole('button', { name: 'Salvar credenciais' }).click();
  await expect(page.getByText('Credenciais salvas')).toBeVisible();
});

test('analista fora da carteira recebe 404', async ({ page }) => {
  await login(page, unassignedEmail);
  const response = await page.goto(`/analista/${orgId}?tab=conexao`);
  expect(response?.status()).toBe(404);
});
