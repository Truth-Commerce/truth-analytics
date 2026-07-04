import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedBlingConnection, seedE2EActiveClient } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const clienteEmail = `${E2E_PREFIX}conn-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-456';

let seededOrgId: string;

test.beforeAll(async () => {
  seededOrgId = await seedE2EActiveClient(clienteEmail, clienteSenha);
});

test.afterAll(async () => {
  await cleanupE2E();
});

test('cliente ativo vê /conexoes com Bling não conectado', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/conexoes');
  await expect(page.getByTestId('bling-status')).toHaveText('Não conectado');
});

test('adiciona produto monitorado e vê na lista', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/conexoes');

  // preenche o form de adicionar produto
  await page.fill('input[name="nome"]', 'Tênis Running Pro');
  await page.fill('input[name="sku"]', 'TRP-001');
  await page.fill('input[name="keywords"]', 'tênis, corrida, running');
  // escopa o submit ao form de adicionar (há outros submit na página, ex.: "Sair" no shell)
  await page.locator('[data-testid="add-form"] button[type="submit"]').click();

  // aguarda a página recarregar com o produto listado
  await expect(page.getByText('Tênis Running Pro')).toBeVisible();
});

test('Desconectar Bling: botão aparece quando conectado e desconecta ao clicar', async ({ page }) => {
  // Seed a real (fake-token) connected Bling entry for this org
  await seedBlingConnection(seededOrgId);

  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/conexoes');

  // Should show connected status and the disconnect button
  await expect(page.getByTestId('bling-status')).toHaveText('Conectado ✓');
  await expect(page.getByTestId('disconnect-bling')).toBeVisible();

  // Click disconnect + confirma no dialog
  await page.click('[data-testid="disconnect-bling"]');
  await page.click('[data-testid="confirm-dialog-confirm"]');

  // Should flip to not connected
  await expect(page.getByTestId('bling-status')).toHaveText('Não conectado');
});

test('remove produto monitorado da lista', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/conexoes');

  // deve ter o produto criado no teste anterior
  const produtoTexto = page.getByText('Tênis Running Pro');
  await expect(produtoTexto).toBeVisible();

  // remove o produto
  const li = page.locator('li', { hasText: 'Tênis Running Pro' });
  await li.getByRole('button', { name: 'Remover' }).click();
  await page.click('[data-testid="confirm-dialog-confirm"]');
  // aguarda o dialog fechar — seu título "Remover Tênis Running Pro?" colide
  // com o matcher de texto abaixo enquanto a saída anima
  await expect(page.getByTestId('confirm-dialog-confirm')).toBeHidden();

  // produto não deve mais aparecer
  await expect(page.getByText('Tênis Running Pro')).not.toBeVisible();
  await expect(page.getByText('Nenhum produto ainda.')).toBeVisible();
});
