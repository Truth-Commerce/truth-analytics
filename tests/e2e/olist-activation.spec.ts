import { createCipheriv, randomBytes } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';

import { hashPassword } from '@/modules/auth/password';

const ORG_ID = '00000000-0000-4000-8000-000000000011';
const FINGERPRINT = 'a'.repeat(64);
const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const ADMIN_EMAIL = `ta-test-e2e-olist-cutover-admin-${RUN}@example.com`;
const CLIENT_EMAIL = `ta-test-e2e-olist-cutover-client-${RUN}@example.com`;
const PASSWORD = 'olist-cutover-e2e-password-123';
const ACCESS_SECRET = 'olist-e2e-access-secret';
const REFRESH_SECRET = 'olist-e2e-refresh-secret';

function encryptedConnectionSecret(provider: 'bling' | 'olist', kind: 'access_token' | 'refresh_token', value: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) throw new Error('E2E requires a 32-byte ENCRYPTION_KEY');
  const plaintext = JSON.stringify({ v: 1, orgId: ORG_ID, provider, kind, value });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join('.');
}

function database() {
  return postgres(process.env.DATABASE_URL_TEST ?? '', { prepare: false });
}

async function cleanup(): Promise<void> {
  const sql = database();
  try {
    await sql`DELETE FROM audit_log WHERE org_id = ${ORG_ID}`;
    await sql`DELETE FROM connection_sync_state WHERE org_id = ${ORG_ID}`;
    await sql`DELETE FROM reports WHERE org_id = ${ORG_ID}`;
    await sql`DELETE FROM orders WHERE org_id = ${ORG_ID}`;
    await sql`DELETE FROM connections WHERE org_id = ${ORG_ID}`;
    await sql`DELETE FROM users WHERE org_id = ${ORG_ID}`;
    await sql`DELETE FROM organizations WHERE id = ${ORG_ID}`;
    await sql`DELETE FROM login_attempts WHERE email IN (${ADMIN_EMAIL}, ${CLIENT_EMAIL})`;
  } finally {
    await sql.end();
  }
}

async function seed(): Promise<void> {
  await cleanup();
  const sql = database();
  try {
    const passwordHash = await hashPassword(PASSWORD);
    const now = new Date();
    const orderDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 12));
    const windowFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const windowTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const catchUpFrom = new Date(windowTo.getTime() + 60_000);

    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO organizations (id, name, status, plano, meta_mensal)
        VALUES (${ORG_ID}, ${`ta-test-e2e-olist-cutover-${RUN}`}, 'active', 'weekly', '1000.00')
      `;
      await tx`
        INSERT INTO users (org_id, email, senha_hash, role) VALUES
          (${ORG_ID}, ${ADMIN_EMAIL}, ${passwordHash}, 'admin_truth'),
          (${ORG_ID}, ${CLIENT_EMAIL}, ${passwordHash}, 'client')
      `;
      await tx`
        INSERT INTO connections (
          org_id, provider, provider_account_fingerprint, data_generation,
          access_token, refresh_token, expira_em, status, last_sync_at
        ) VALUES
          (${ORG_ID}, 'bling', NULL, 1,
            ${encryptedConnectionSecret('bling', 'access_token', ACCESS_SECRET)},
            ${encryptedConnectionSecret('bling', 'refresh_token', REFRESH_SECRET)},
            ${new Date(Date.now() + 3_600_000)}, 'ok', ${now}),
          (${ORG_ID}, 'olist', ${FINGERPRINT}, 1,
            ${encryptedConnectionSecret('olist', 'access_token', ACCESS_SECRET)},
            ${encryptedConnectionSecret('olist', 'refresh_token', REFRESH_SECRET)},
            ${new Date(Date.now() + 3_600_000)}, 'configurado', ${now})
      `;
      await tx`
        INSERT INTO orders (
          org_id, bling_order_id, provider, provider_order_id, provider_status,
          source_generation, canal, data, valor_total, frete, itens, enriquecido_em
        ) VALUES
          (${ORG_ID}, 'bling-live', 'bling', 'bling-live', 'approved', 1,
            'Mercado Livre', ${orderDate}, '100.00', '0.00', '[]'::jsonb, ${now}),
          (${ORG_ID}, NULL, 'olist', 'olist-live', 'approved', 1,
            'Mercado Livre', ${orderDate}, '900.00', '0.00', '[]'::jsonb, ${now})
      `;

      const [facts] = await tx<{
        expected_count: number;
        checksum: string;
        daily_checksum: string;
        channel_checksum: string;
      }[]>`
        SELECT count(DISTINCT NULLIF(provider_order_id, ''))::int AS expected_count,
          md5(coalesce(string_agg(concat_ws('|', NULLIF(provider_order_id, ''), coalesce(provider_status, ''), valor_total::text), ',' ORDER BY NULLIF(provider_order_id, ''), coalesce(provider_status, ''), valor_total::text), '')) AS checksum,
          md5(coalesce((SELECT string_agg(day_key || '|' || total, ',' ORDER BY day_key) FROM (
            SELECT data::date::text AS day_key, sum(valor_total)::text AS total
            FROM orders WHERE org_id=${ORG_ID} AND provider='olist' AND source_generation=1
              AND data >= ${windowFrom} AND data < ${windowTo} GROUP BY data::date
          ) daily), '')) AS daily_checksum,
          md5(coalesce((SELECT string_agg(channel_key || '|' || total, ',' ORDER BY channel_key) FROM (
            SELECT canal AS channel_key, sum(valor_total)::text AS total
            FROM orders WHERE org_id=${ORG_ID} AND provider='olist' AND source_generation=1
              AND data >= ${windowFrom} AND data < ${windowTo} GROUP BY canal
          ) channels), '')) AS channel_checksum
        FROM orders WHERE org_id=${ORG_ID} AND provider='olist' AND source_generation=1
          AND data >= ${windowFrom} AND data < ${windowTo}
      `;
      if (!facts) throw new Error('olist E2E facts unavailable');
      const verification = {
        done: true,
        expectedCount: Number(facts.expected_count),
        checksum: facts.checksum,
        dailyChecksum: facts.daily_checksum,
        channelChecksum: facts.channel_checksum,
      };
      const cursor = {
        version: 1,
        stage: 'ready',
        sourceGeneration: 1,
        accountFingerprint: FINGERPRINT,
        window: { from: windowFrom.toISOString(), to: windowTo.toISOString() },
        catchUpFrom: catchUpFrom.toISOString(),
        snapshot: { done: true },
        catchup: { done: true, completedAt: catchUpFrom.toISOString() },
        verify1: verification,
        verify2: verification,
      };
      await tx`
        INSERT INTO connection_sync_state (
          org_id, provider, source_generation, account_fingerprint, resource,
          cursor, fencing_version, processed_count, backlog_count, succeeded_at
        ) VALUES (
          ${ORG_ID}, 'olist', 1, ${FINGERPRINT}, 'orders_prepare',
          ${tx.json(cursor)}, 1, 1, 0, ${now}
        )
      `;
      await tx`
        INSERT INTO reports (
          org_id, source_provider, source_generation, periodo_inicio, periodo_fim,
          status, metricas, analise_ia, created_at
        ) VALUES (
          ${ORG_ID}, 'bling', 1, ${windowFrom}, ${orderDate}, 'done',
          ${tx.json({
            vendasPorCanal: [{ canal: 'Mercado Livre', total: 777, pedidos: 7 }],
            evolucao: [{ data: orderDate.toISOString().slice(0, 10), total: 777 }],
            ticketMedio: 77.7,
            topProdutos: [],
            posicaoPreco: [],
            benchmarkParcial: false,
            truth_score: {
              score: 70,
              totalPeriodo: 777,
              totalPeriodoAnterior: null,
              fatores: {
                crescimento: { pontos: 20, max: 25, variacaoPercentual: null },
                posicaoPreco: { pontos: 10, max: 20, itensAvaliados: 0 },
                diversificacao: { pontos: 15, max: 20, canaisComVenda: 1 },
                regularidade: { pontos: 15, max: 20, diasComVenda: 1, diasPeriodo: 30 },
                cobertura: { pontos: 10, max: 15, produtosComBenchmark: 0, produtosAvaliados: 0 },
              },
            },
          })},
          ${tx.json({
            resumoExecutivo: 'Relatório histórico congelado no Bling.',
            gargalos: [],
            sugestoesMelhoria: [],
            ideiasVenda: [],
            recomendacoesPreco: [],
          })},
          ${new Date(now.getTime() - 60_000)}
        )
      `;
    });
  } finally {
    await sql.end();
  }
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));
}

async function expectActiveProvider(provider: 'bling' | 'olist'): Promise<void> {
  const sql = database();
  try {
    const rows = await sql<{ provider: string }[]>`
      SELECT provider FROM connections WHERE org_id=${ORG_ID} AND status='ok'
    `;
    expect(rows.map((row) => row.provider)).toEqual([provider]);
  } finally {
    await sql.end();
  }
}

test.beforeAll(seed);
test.afterAll(cleanup);

test('cutover Bling → Olist → Bling troca dados ao vivo e preserva o relatório histórico', async ({ page }) => {
  await login(page, CLIENT_EMAIL);
  await page.goto('/conexoes');
  await expect(page.getByTestId('activate-olist')).toHaveCount(0);
  await expect(page.getByTestId('rollback-bling')).toHaveCount(0);
  expect(await page.content()).not.toContain(ACCESS_SECRET);
  expect(await page.content()).not.toContain(REFRESH_SECRET);

  await page.goto('/dashboard');
  await expect(page.getByTestId('meta-progress')).toContainText('100,00');
  await expect(page.getByTestId('stats-periodo')).toBeVisible();

  await page.context().clearCookies();
  await login(page, ADMIN_EMAIL);
  await page.goto(`/analista/${ORG_ID}?tab=conexao`);
  await expect(page.getByTestId('activate-olist')).toBeVisible();
  await expect(page.getByTestId('rollback-bling')).toHaveCount(0);
  await page.getByTestId('activate-olist').click();
  await expect(page.getByTestId('rollback-bling')).toBeVisible();
  await expectActiveProvider('olist');

  await page.context().clearCookies();
  await login(page, CLIENT_EMAIL);
  await page.goto('/dashboard');
  await expect(page.getByTestId('meta-progress')).toContainText('900,00');
  await page.getByTestId('ver-relatorio').click();
  await expect(page.getByTestId('resumo-executivo')).toContainText('Relatório histórico congelado no Bling.');
  await expect(page.getByTestId('metricas')).toContainText('77,70');

  await page.context().clearCookies();
  await login(page, ADMIN_EMAIL);
  await page.goto(`/analista/${ORG_ID}?tab=conexao`);
  await expect(page.getByTestId('rollback-bling')).toBeVisible();
  await expect(page.getByTestId('activate-olist')).toHaveCount(0);
  await page.getByTestId('rollback-bling').click();
  await expect(page.getByTestId('activate-olist')).toBeVisible();
  await expectActiveProvider('bling');

  await page.context().clearCookies();
  await login(page, CLIENT_EMAIL);
  await page.goto('/dashboard');
  await expect(page.getByTestId('meta-progress')).toContainText('100,00');

  const sql = database();
  try {
    const [report] = await sql<{ source_provider: string; source_generation: number }[]>`
      SELECT source_provider, source_generation FROM reports WHERE org_id=${ORG_ID}
    `;
    expect(report).toEqual({ source_provider: 'bling', source_generation: 1 });
    const audit = await sql<{ detalhes: unknown }[]>`
      SELECT detalhes FROM audit_log WHERE org_id=${ORG_ID} AND acao IN ('erp.ativado', 'erp.revertido') ORDER BY created_at
    `;
    expect(audit).toHaveLength(2);
    const serializedAudit = JSON.stringify(audit);
    expect(serializedAudit).not.toContain(ACCESS_SECRET);
    expect(serializedAudit).not.toContain(REFRESH_SECRET);
    expect(serializedAudit).not.toMatch(/access_token|refresh_token|client_secret/i);
  } finally {
    await sql.end();
  }
});
