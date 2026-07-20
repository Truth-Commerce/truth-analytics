import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EActiveClient, seedTask } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const clienteEmail = `${E2E_PREFIX}plano-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-plano-789';

let orgId: string;

test.beforeAll(async () => {
  orgId = await seedE2EActiveClient(clienteEmail, clienteSenha);
  await seedTask(orgId, { titulo: `${E2E_PREFIX}task-da-ia`, criadoPor: 'ia', status: 'em_andamento' });
});

test.afterAll(async () => {
  await cleanupE2E();
});

test('kanban do cliente: criar task própria, mover e concluir; task da IA vai para revisão', async ({ page }) => {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  await page.goto('/dashboard/plano-de-acao');
  await expect(page.getByTestId('kanban-col-backlog')).toBeVisible();

  // task da IA seedada em Em andamento: Concluir → Em revisão (não Concluída)
  const colAndamento = page.getByTestId('kanban-col-em_andamento');
  await expect(colAndamento.getByTestId('task-card')).toHaveCount(1);
  await colAndamento.getByTestId('task-concluir').click();
  await expect(page.getByTestId('kanban-col-em_revisao').getByTestId('task-card')).toHaveCount(1);

  // criar task própria → nasce em Backlog
  await page.getByText('Nova task').click();
  await page.fill('[data-testid="nova-task-form"] input[name="titulo"]', `${E2E_PREFIX}minha-task`);
  await page.click('[data-testid="nova-task-form"] button[type="submit"]');
  const colBacklog = page.getByTestId('kanban-col-backlog');
  await expect(colBacklog.getByTestId('task-card')).toHaveCount(1);

  // F3b (revisão H5/T11): com um filtro ativo, a lista visível vira um
  // subconjunto da coluna real — os botões de reordenar (▲/▼) precisam sumir
  // (mesmo sem esconder nenhum card), pra não mover a task além de um vizinho
  // escondido pelo filtro. Sem filtro, o botão aparece normalmente.
  await expect(colBacklog.locator('[aria-label="Mover para cima na coluna"]').first()).toBeVisible();
  await page.fill('[data-testid="crm-board-filtro-texto"]', E2E_PREFIX);
  await expect(colBacklog.getByTestId('task-card')).toHaveCount(1); // filtro não escondeu nada aqui
  await expect(colBacklog.locator('[aria-label="Mover para cima na coluna"]')).toHaveCount(0);
});
