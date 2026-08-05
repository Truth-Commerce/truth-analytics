import { expect, test, type Page } from '@playwright/test';

import {
  cleanupE2E,
  E2E_PREFIX,
  seedE2EActiveClient,
  seedE2EAnalista,
  seedReport,
} from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const analistaEmail = `${E2E_PREFIX}desempenho-an-${RUN}@example.com`;
const analistaSenha = 'analista-forte-123';
const clienteEmail = `${E2E_PREFIX}desempenho-cli-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-456';

// Org alheia (inexistente) usada para forjar `?orgId=` na URL do relatório.
const ORG_ALHEIA = '00000000-0000-4000-8000-0000000009a1';

const METRICAS = {
  vendasPorCanal: [{ canal: 'Mercado Livre', total: 1000.0, pedidos: 10 }],
  evolucao: [
    { data: '2026-06-01', total: 500.0 },
    { data: '2026-06-30', total: 500.0 },
  ],
  ticketMedio: 100.0,
  topProdutos: [{ nome: 'Produto Teste', sku: 'SKU-001', quantidade: 10, receita: 1000.0 }],
  posicaoPreco: [],
  benchmarkParcial: false,
};

const ANALISE = {
  resumoExecutivo: 'Resumo executivo do relatório de teste.',
  gargalos: [],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

let clienteOrgId: string;
let relatorioId: string;

test.beforeAll(async () => {
  const analistaId = await seedE2EAnalista(analistaEmail, analistaSenha);
  clienteOrgId = await seedE2EActiveClient(clienteEmail, clienteSenha, { analistaId });
  // Sem `orders`: os cenários testam acesso/isolamento, não dados de desempenho.
  relatorioId = await seedReport(clienteOrgId, {
    status: 'done',
    metricas: METRICAS,
    analiseIa: ANALISE,
  });
});

test.afterAll(async () => {
  await cleanupE2E();
});

async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('analista abre a pagina de desempenho anual da carteira', async ({ page }) => {
  await login(page, analistaEmail, analistaSenha);
  await page.goto(`/analista/${clienteOrgId}/desempenho`);

  await expect(page).toHaveURL(new RegExp(`/analista/${clienteOrgId}/desempenho$`));
  await expect(page.getByTestId('desempenho-anual-page')).toBeVisible();
  await expect(page.getByTestId('desempenho-cobertura')).toBeVisible();
  // Sem ERP conectado o rótulo de cobertura é o estado vazio explícito.
  await expect(page.getByTestId('desempenho-cobertura')).toContainText('Sem histórico coletado ainda');
});

test('cliente nao acessa a pagina de desempenho (gate staff redireciona)', async ({ page }) => {
  await login(page, clienteEmail, clienteSenha);
  await page.goto(`/analista/${clienteOrgId}/desempenho`);

  // Dois gates em série: o proxy de borda (`authorized` em auth-config) manda
  // não-staff logado de /analista/* para /dashboard antes mesmo de a rota rodar;
  // `requireAnalista()` no layout/página é a segunda barreira (mandaria para
  // /sign-in). O destino observável é /dashboard.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page).not.toHaveURL(new RegExp(`/analista/${clienteOrgId}/desempenho$`));
  await expect(page.getByTestId('desempenho-anual-page')).toHaveCount(0);
  await expect(page.getByTestId('desempenho-cobertura')).toHaveCount(0);
});

test('relatorio do cliente NAO contem a secao de contexto anual', async ({ page }) => {
  await login(page, clienteEmail, clienteSenha);

  // Caso 1: relatório próprio, com `?orgId=` da própria org — a página renderiza
  // por completo (controle positivo) e ainda assim a seção staff não existe.
  await page.goto(`/dashboard/relatorios/${relatorioId}?orgId=${clienteOrgId}`);
  await expect(page.getByTestId('resumo-executivo')).toContainText(ANALISE.resumoExecutivo);
  await expect(page.getByTestId('metricas')).toBeVisible();
  await expect(page.getByTestId('contexto-anual-staff')).toHaveCount(0);

  // Caso 2: forjando `?orgId=` de outra org — acesso negado, nada renderiza.
  await page.goto(`/dashboard/relatorios/${relatorioId}?orgId=${ORG_ALHEIA}`);
  await expect(page.getByTestId('resumo-executivo')).toHaveCount(0);
  await expect(page.getByTestId('contexto-anual-staff')).toHaveCount(0);
});
