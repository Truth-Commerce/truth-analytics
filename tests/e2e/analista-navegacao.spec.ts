import { expect, test, type Page } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EAnalista } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const email = `${E2E_PREFIX}analista-nav-${RUN}@example.com`;
const senha = 'analista-forte-123';

test.beforeAll(async () => {
  await seedE2EAnalista(email, senha);
});

test.afterAll(async () => {
  await cleanupE2E();
});

async function login(page: Page): Promise<void> {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('analista encontra e navega pelas áreas próprias desde o dashboard', async ({ page }) => {
  await login(page);

  const sidebar = page.getByTestId('desktop-sidebar');
  const carteira = sidebar.getByRole('link', { name: 'Carteira' });
  const comparativo = sidebar.getByRole('link', { name: 'Comparativo' });

  await expect(carteira).toHaveAttribute('href', '/analista');
  await expect(comparativo).toHaveAttribute('href', '/analista/comparativo');

  await carteira.click();
  await expect(page).toHaveURL(/\/analista$/);
  await expect(sidebar.getByRole('link', { name: 'Carteira' })).toHaveAttribute(
    'aria-current',
    'page',
  );

  await sidebar.getByRole('link', { name: 'Comparativo' }).click();
  await expect(page).toHaveURL(/\/analista\/comparativo$/);
  await expect(sidebar.getByRole('link', { name: 'Comparativo' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

test('drawer móvel do analista expõe Carteira e Comparativo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navegação principal' });

  await expect(drawer.getByRole('link', { name: 'Carteira' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Comparativo' })).toBeVisible();
});
