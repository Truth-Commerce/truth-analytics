import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX } from './helpers/db';

// Use a stable unique ID derived from the process start time so all tests
// in this suite share the exact same credentials.
const RUN_ID = process.env.PW_E2E_RUN_ID ?? String(process.ppid ?? Date.now());
const email = `${E2E_PREFIX}${RUN_ID}@example.com`;
const senha = 'senha-forte-123';

test.afterAll(async () => {
  await cleanupE2E();
});

test('cadastro cria conta e cai em /aguardando (org pending)', async ({ page }) => {
  await page.goto('/sign-up');
  await page.fill('input[name="orgName"]', `${E2E_PREFIX}Loja`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/aguardando/);
});

test('cliente pending não acessa /dashboard (redireciona p/ aguardando)', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await page.click('button[type="submit"]');
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/aguardando/);
});

test('cliente não acessa /admin', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await page.click('button[type="submit"]');
  await page.goto('/admin');
  await expect(page).not.toHaveURL(/\/admin$/);
});
