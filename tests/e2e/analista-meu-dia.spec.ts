import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EAdmin } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const adminEmail = `${E2E_PREFIX}meudia-admin-${RUN}@example.com`;
const adminSenha = 'admin-forte-123';

test.beforeAll(async () => {
  await seedE2EAdmin(adminEmail, adminSenha);
});

test.afterAll(async () => {
  await cleanupE2E();
});

test('faixa "Meu dia" aparece no /analista com as 4 listas expandíveis', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="senha"]', adminSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/analista');
  const faixa = page.getByTestId('meu-dia');
  await expect(faixa).toBeVisible();

  // as 4 listas com contagem "(N)" no rótulo
  await expect(faixa.getByText(/Atrasadas \(\d+\)/)).toBeVisible();
  await expect(faixa.getByText(/Vencem em 7d \(\d+\)/)).toBeVisible();
  await expect(faixa.getByText(/Em revisão \(\d+\)/)).toBeVisible();
  await expect(faixa.getByText(/Sem atividade há 14d \(\d+\)/)).toBeVisible();

  // expandir a primeira lista mostra itens (com link p/ a task) ou o vazio
  const atrasadas = faixa.locator('details').first();
  await atrasadas.locator('summary').click();
  const temItens = (await atrasadas.locator('ul li a').count()) > 0;
  if (temItens) {
    await expect(atrasadas.locator('ul li a').first()).toHaveAttribute(
      'href',
      /\/analista\/[0-9a-f-]+\/tasks\/[0-9a-f-]+/,
    );
  } else {
    await expect(atrasadas.getByText('Nada por aqui.')).toBeVisible();
  }
});
