# F0 — Fundação de Produção Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar o pipeline de relatórios durável em produção (background + lock + watchdog + progresso por etapa) e fechar os achados críticos da auditoria 2026-07-03 (paralelização, pool serverless, cripto versionada, esqueci-senha, backoff Bling, headers, índices, logger, next-auth).

**Architecture:** A Server Action passa a apenas **enfileirar** (`reports.status='queued'` + POST autenticado para `/api/pipeline/run`, que responde `202` e roda `generateReport(reportId)` via `waitUntil` com `maxDuration=300`). O orquestrador é refatorado para receber `reportId` (o report já existe) e atualizar `reports.etapa` entre steps — o que habilita `GET /api/reports/[id]/status` (polling do stepper da F1). Um índice único parcial em `reports(org_id)` garante 1 pipeline ativo por org, e um cron watchdog reapa relatórios presos. Decisões TRAVADAS no roadmap mestre (`2026-07-03-roadmap-mestre.md` §"Decisões técnicas TRAVADAS") — este plano as detalha, não as rediscute.

**Tech Stack:** Next.js 14 App Router, Drizzle/Neon (postgres-js), next-auth v5 beta, `@anthropic-ai/sdk`, Resend, Vitest + Playwright. Dependência nova: `@vercel/functions` (waitUntil). SEM p-limit de terceiros (helper próprio `src/lib/p-limit.ts`).

## Global Constraints

- **Next 14 App Router** — rotas novas em `src/app/api/...` (Route Handlers), Server Actions existentes preservadas.
- **Drizzle** — todo acesso a dados via Drizzle parametrizado; migrations geradas com `npm run db:generate` e aplicadas em **main E test**.
- **Vitest** — unit/integration; integração SEMPRE com `describe.skipIf(!process.env.DATABASE_URL_TEST)` (blindagem de `tests/setup.ts` intocável).
- **Playwright** — E2E existentes devem continuar verdes; **preservar todos os `data-testid` atuais** (`generate-report-button`, `latest-report`, `ver-relatorio`, `resumo-executivo`, `metricas`).
- **Nunca tocar em produção nos testes** — nenhum teste escreve no branch Neon `main`; externos (Bling/SerpAPI/ML/Claude/Resend/fetch) sempre mockados.
- **Copy pt-BR** em toda UI, e-mails e mensagens de erro visíveis.
- **Commits em pt no padrão do repo**: `feat:`, `fix:`, `chore:` (escopo entre parênteses quando útil).
- **TDD por task**: teste que falha → implementação mínima → verde → commit.
- **Regra de ouro**: antes de implementar cada task, re-validar o trecho de código citado contra o `master` atual; divergência pequena = ajustar inline.
- **Decisões travadas**: NÃO usar Vercel Workflow; NÃO trocar o modelo da IA (`ANALYSIS_MODEL` Opus default); nomes exatos deste plano (coluna `etapa`, header `x-pipeline-secret`, envs `PIPELINE_SECRET`/`CRON_SECRET`/`ENCRYPTION_KEYS`/`ENCRYPTION_KEY_ACTIVE`) são contratos consumidos pela F1.

## Pré-requisitos

- [ ] Branch `feat/f0-fundacao-producao` a partir de `master`.
- [ ] `npm install @vercel/functions` (Task 4).
- [ ] **Validar o plano Vercel** para `maxDuration=300` (Fluid/Pro). Se indisponível, fallback do roadmap: o watchdog reprocessa a fila — a arquitetura deste plano não muda.
- [ ] (Operacional, Matheus) Gerar e guardar `PIPELINE_SECRET` e `CRON_SECRET` (`openssl rand -hex 32`) — entram no `.env.local` e na Vercel na Task 4/6.

## Ledger de nomes (consistência entre tasks)

| Contrato | Valor exato |
|---|---|
| Coluna de progresso | `reports.etapa` varchar(32), nullable: `coletando_vendas` \| `analisando_mercado` \| `analisando_ia` \| `finalizando` |
| Lock | índice único parcial `reports_org_ativo_uq` em `reports(org_id) WHERE status IN ('queued','running')` |
| Header da rota de pipeline | `x-pipeline-secret` |
| Envs novas | `PIPELINE_SECRET`, `CRON_SECRET`, `SENTRY_DSN`, `DB_POOL_MAX`, `ENCRYPTION_KEYS`, `ENCRYPTION_KEY_ACTIVE` |
| Orquestrador | `generateReport(reportId: string): Promise<{ reportId: string; status: 'done' | 'failed' | 'ignorado' }>` |
| Enfileirar | `createQueuedReport(orgId, periodo): Promise<string>` lança `Error('relatorio_em_andamento')` em conflito 23505 |
| Dispatch | `dispatchPipelineRun(reportId: string): Promise<void>` |
| Concorrência mercado | `pLimit(6)` de `src/lib/p-limit.ts` |
| Snapshot podado | `dados = { precos: number[]; quantidadeResultados: number }` (SEM `bruto`) |
| Cripto v1 | payload `v1:<keyId>:<ivB64>:<tagB64>:<ctB64>`; legado `iv.tag.ct` |
| Rate-limit | `login_attempts.escopo` varchar(16) default `'login'`: `login` \| `signup` \| `reset` |

## File Structure (visão geral)

| Caminho | Responsabilidade |
|---|---|
| `src/db/schema/{reports,orders,audit-log,login-attempts,password-reset-tokens}.ts` | etapa + lock + índices + escopo + tabela de reset (Task 1) |
| `src/db/migrations/0004_*.sql`, `0005_f0_checks.sql` | migration gerada + CHECKs custom (Task 1) |
| `src/db/client.ts` | pool serverless (Task 2) |
| `src/lib/logger.ts`, `src/lib/sentry.ts` | logger estruturado + Sentry opcional (Task 3) |
| `src/modules/pipeline/dispatch.ts`, `src/app/api/pipeline/run/route.ts`, `src/modules/pipeline/orchestrator.ts`, `src/actions/reports.actions.ts` | núcleo background (Task 4) |
| `src/app/api/reports/[id]/status/route.ts` | status/polling (Task 5) |
| `src/app/api/cron/watchdog/route.ts`, `vercel.json` | watchdog (Task 6) |
| `src/lib/p-limit.ts`, `src/modules/pipeline/steps/collect-market.ts`, `src/modules/market/*` | paralelização + poda (Task 7) |
| `src/modules/providers/bling/orders.ts`, `src/modules/pipeline/steps/collect-bling.ts` | backoff 429 + lotes (Task 8) |
| `src/modules/crypto/crypto.ts`, `scripts/reencrypt-connections.ts` | cripto versionada (Tasks 9–10) |
| `docs/runbooks/rotacao-segredos.md` | runbook operacional (Task 11) |
| `src/modules/auth/rate-limit.ts`, `src/actions/auth.actions.ts` | rate-limit signup + Zod (Task 12) |
| `src/modules/auth/password-reset.repository.ts`, `src/actions/password-reset.actions.ts`, `src/app/(auth)/esqueci-senha/`, `src/app/(auth)/redefinir-senha/[token]/` | esqueci-senha (Task 13) |
| `src/modules/pipeline/steps/analyze-ia.ts` | prompt caching + retry curto (Task 14) |
| `next.config.mjs` | headers de segurança (Task 15) |
| `package.json` | next-auth beta recente (Task 16) |
| `src/modules/reports/report.repository.ts` | listReports summary + limit 50 (Task 17) |

---

### Task 1: Schema F0 — `reports.etapa`, lock parcial, `password_reset_tokens`, `login_attempts.escopo`, índices e CHECKs

**Files:**
- Modify: `src/db/schema/reports.ts`, `src/db/schema/orders.ts`, `src/db/schema/audit-log.ts`, `src/db/schema/login-attempts.ts`, `src/db/schema/index.ts`
- Create: `src/db/schema/password-reset-tokens.ts`, `src/db/migrations/0004_*.sql` (gerada), `src/db/migrations/0005_f0_checks.sql` (custom)
- Test: `tests/integration/schema-f0.test.ts`

**Interfaces (Produces):**
- `reports.etapa: varchar(32) | null` — valores do Ledger. Consumido por Tasks 4/5/6 e pela F1.
- Índice único parcial `reports_org_ativo_uq` — consumido por `createQueuedReport` (Task 4).
- `passwordResetTokens` (tabela `password_reset_tokens`): `id uuid pk`, `user_id uuid notNull FK users.id`, `token_hash varchar(64) notNull unique`, `expira_em timestamptz notNull`, `usado_em timestamptz null`, `created_at timestamptz notNull default now()`, index `(user_id)` — consumida pela Task 13.
- `loginAttempts.escopo: varchar(16) notNull default 'login'` — consumida pelas Tasks 12/13.
- Índices: `orders_org_data_idx (org_id, data)`, `audit_log_org_created_idx (org_id, created_at)`, `login_attempts_ip_created_idx (ip, created_at)`.

- [ ] **Step 1: teste que falha primeiro** — criar `tests/integration/schema-f0.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, passwordResetTokens, reports, users } from '@/db/schema';

describe.skipIf(!process.env.DATABASE_URL_TEST)('schema F0', () => {
  const criadas: { orgId?: string; userId?: string } = {};

  afterAll(async () => {
    if (criadas.userId) {
      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, criadas.userId));
      await db.delete(users).where(eq(users.id, criadas.userId));
    }
    if (criadas.orgId) {
      await db.delete(reports).where(eq(reports.org_id, criadas.orgId));
      await db.delete(organizations).where(eq(organizations.id, criadas.orgId));
    }
  });

  it('lock: segundo report queued/running da mesma org viola reports_org_ativo_uq', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `t_f0_${randomUUID().slice(0, 8)}`, status: 'active', plano: 'monthly' })
      .returning({ id: organizations.id });
    criadas.orgId = org.id;
    const periodo = { periodo_inicio: new Date('2026-06-01'), periodo_fim: new Date('2026-07-01') };

    await db.insert(reports).values({ org_id: org.id, status: 'queued', ...periodo });
    await expect(
      db.insert(reports).values({ org_id: org.id, status: 'running', ...periodo }),
    ).rejects.toThrow();

    // done NÃO conflita (índice é parcial)
    await expect(
      db.insert(reports).values({ org_id: org.id, status: 'done', ...periodo }),
    ).resolves.not.toThrow();
  });

  it('etapa aceita valores válidos e CHECK rejeita inválido', async () => {
    const periodo = { periodo_inicio: new Date('2026-06-01'), periodo_fim: new Date('2026-07-01') };
    await expect(
      db.insert(reports).values({
        org_id: criadas.orgId!, status: 'done', etapa: 'analisando_ia', ...periodo,
      }),
    ).resolves.not.toThrow();
    await expect(
      db.insert(reports).values({
        org_id: criadas.orgId!, status: 'done', etapa: 'etapa_invalida', ...periodo,
      }),
    ).rejects.toThrow();
  });

  it('password_reset_tokens: insere e token_hash é único', async () => {
    const [user] = await db
      .insert(users)
      .values({
        org_id: criadas.orgId!,
        email: `t_f0_${randomUUID().slice(0, 8)}@teste.dev`,
        senha_hash: 'x',
        role: 'client',
      })
      .returning({ id: users.id });
    criadas.userId = user.id;
    const hash = 'a'.repeat(64);
    await db.insert(passwordResetTokens).values({
      user_id: user.id, token_hash: hash, expira_em: new Date(Date.now() + 3_600_000),
    });
    await expect(
      db.insert(passwordResetTokens).values({
        user_id: user.id, token_hash: hash, expira_em: new Date(Date.now() + 3_600_000),
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/integration/schema-f0.test.ts`. Esperado: falhas (coluna `etapa` não existe / tabela `password_reset_tokens` não existe).

- [ ] **Step 3: alterar schemas Drizzle.** Em `src/db/schema/reports.ts` (adicionar `etapa`, o índice único parcial e os imports `uniqueIndex` + `sql`):

```ts
import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const reports = pgTable(
  'reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    periodo_inicio: timestamp('periodo_inicio', { withTimezone: true, mode: 'date' }).notNull(),
    periodo_fim: timestamp('periodo_fim', { withTimezone: true, mode: 'date' }).notNull(),
    status: varchar('status', { length: 16 }).notNull().default('queued'),
    etapa: varchar('etapa', { length: 32 }),
    metricas: jsonb('metricas'),
    analise_ia: jsonb('analise_ia'),
    erro: text('erro'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_created_idx: index('reports_org_created_idx').on(t.org_id, t.created_at),
    // Lock de idempotência: no máximo 1 report ativo (queued|running) por org.
    org_ativo_uq: uniqueIndex('reports_org_ativo_uq')
      .on(t.org_id)
      .where(sql`status IN ('queued', 'running')`),
  }),
);

export type ReportRecord = typeof reports.$inferSelect;
export type NewReportRecord = typeof reports.$inferInsert;
```

Em `src/db/schema/orders.ts`, adicionar ao callback de extras (mantendo `org_bling_uq`) e importar `index`:

```ts
  (t) => ({
    org_bling_uq: unique('orders_org_bling_uq').on(t.org_id, t.bling_order_id),
    org_data_idx: index('orders_org_data_idx').on(t.org_id, t.data),
  }),
```

Em `src/db/schema/audit-log.ts`, converter para a forma com extras e importar `index`:

```ts
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id'),
    user_id: uuid('user_id'),
    acao: varchar('acao', { length: 128 }).notNull(),
    detalhes: jsonb('detalhes'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_created_idx: index('audit_log_org_created_idx').on(t.org_id, t.created_at),
  }),
);
```

Em `src/db/schema/login-attempts.ts`, adicionar coluna e índice:

```ts
    escopo: varchar('escopo', { length: 16 }).notNull().default('login'),
```

```ts
  (t) => ({
    email_created_idx: index('login_attempts_email_created_idx').on(t.email, t.created_at),
    ip_created_idx: index('login_attempts_ip_created_idx').on(t.ip, t.created_at),
  }),
```

Criar `src/db/schema/password-reset-tokens.ts`:

```ts
import { index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** sha256 hex do token em claro — o token NUNCA é persistido em claro. */
    token_hash: varchar('token_hash', { length: 64 }).notNull().unique(),
    expira_em: timestamp('expira_em', { withTimezone: true, mode: 'date' }).notNull(),
    usado_em: timestamp('usado_em', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    user_idx: index('password_reset_tokens_user_idx').on(t.user_id),
  }),
);

export type PasswordResetTokenRecord = typeof passwordResetTokens.$inferSelect;
export type NewPasswordResetTokenRecord = typeof passwordResetTokens.$inferInsert;
```

Em `src/db/schema/index.ts`, adicionar `export * from './password-reset-tokens';`.

- [ ] **Step 4: gerar a migration** — `npm run db:generate` (gera `src/db/migrations/0004_*.sql`). **Editar o arquivo gerado** e PREPENDER (antes de tudo, com breakpoint) a limpeza de relatórios presos — sem isso a criação do índice único parcial pode falhar em produção se houver 2+ reports presos da mesma org:

```sql
UPDATE "reports" SET "status" = 'failed', "erro" = 'timeout_watchdog' WHERE "status" IN ('queued','running');
--> statement-breakpoint
```

- [ ] **Step 5: migration custom de CHECKs** — `npm run db:generate -- --custom --name=f0_checks` (gera `src/db/migrations/0005_f0_checks.sql` vazia). Conteúdo exato:

```sql
ALTER TABLE "reports" ADD CONSTRAINT "reports_status_check" CHECK (status IN ('queued','running','done','failed'));
--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_etapa_check" CHECK (etapa IS NULL OR etapa IN ('coletando_vendas','analisando_mercado','analisando_ia','finalizando'));
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_status_check" CHECK (status IN ('pending','active','suspended'));
--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_plano_check" CHECK (plano IS NULL OR plano IN ('weekly','biweekly','monthly'));
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK (role IN ('admin_truth','client','analista'));
--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_status_check" CHECK (status IN ('ok','expirado','erro'));
--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_fonte_check" CHECK (fonte IN ('ml_publico','serpapi'));
--> statement-breakpoint
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_escopo_check" CHECK (escopo IN ('login','signup','reset'));
```

Notas travadas: `users_role_check` já inclui `'analista'` (contrato F2); `connections.provider` NÃO ganha CHECK (F3b generaliza providers).

- [ ] **Step 6: aplicar em main e test** (mesma convenção do Plano 4):

```bash
npm run db:migrate
TEST_DIRECT=$(grep -E '^DATABASE_URL_TEST_DIRECT=' .env.local | cut -d= -f2-)
POSTGRES_URL_DIRECT="$TEST_DIRECT" node node_modules/drizzle-kit/bin.cjs migrate
```

(Se `DATABASE_URL_TEST_DIRECT` não existir no `.env.local`, usar `DATABASE_URL_TEST`.)

- [ ] **Step 7: rodar e ver passar** — `npx vitest run tests/integration/schema-f0.test.ts` → 3 testes verdes. Depois `npm run test` + `npm run typecheck` (suite inteira verde).
- [ ] **Step 8: commit** —

```bash
git add src/db/schema src/db/migrations tests/integration/schema-f0.test.ts
git commit -m "feat(db): etapa+lock parcial em reports, password_reset_tokens, escopo em login_attempts, índices e CHECKs"
```

---

### Task 2: Pool Postgres serverless em `src/db/client.ts`

**Files:**
- Modify: `src/db/client.ts`, `src/lib/env.ts`, `.env.example`
- Test: `tests/unit/env.test.ts` (adicionar casos) ou criar `tests/unit/db-client-env.test.ts`

**Interfaces:**
- Consumes: `serverEnv` (Task existente).
- Produces: `db` inalterado na API; env nova `DB_POOL_MAX?: number` (override p/ scripts locais).

- [ ] **Step 1: teste que falha** — criar `tests/unit/db-client-env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { parseServerEnv } from '@/lib/env';

const BASE = {
  POSTGRES_URL: 'postgres://user:pass@host/db',
  AUTH_SECRET: 'segredo',
  ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
} as NodeJS.ProcessEnv;

describe('env DB_POOL_MAX', () => {
  it('ausente → undefined (client decide o default)', () => {
    expect(parseServerEnv(BASE).DB_POOL_MAX).toBeUndefined();
  });
  it('coage string numérica', () => {
    expect(parseServerEnv({ ...BASE, DB_POOL_MAX: '5' }).DB_POOL_MAX).toBe(5);
  });
  it('rejeita valor inválido', () => {
    expect(() => parseServerEnv({ ...BASE, DB_POOL_MAX: 'abc' })).toThrow();
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/unit/db-client-env.test.ts`. Esperado: `DB_POOL_MAX` não existe no tipo → erro de compilação/teste.
- [ ] **Step 3: implementar.** Em `src/lib/env.ts`, adicionar ao schema:

```ts
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).optional(),
```

Substituir `src/db/client.ts` por:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { serverEnv } from '@/lib/env';

// Serverless (Vercel): cada invocação tem sua própria instância do módulo —
// pool grande só esgota as conexões do Neon. max:1 + idle_timeout curto.
// Dev/scripts locais (seed, reencrypt) podem subir via DB_POOL_MAX.
const isServerless = Boolean(process.env.VERCEL);
const max = serverEnv.DB_POOL_MAX ?? (isServerless ? 1 : 4);

const client = postgres(serverEnv.POSTGRES_URL, {
  prepare: false,
  max,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client);
export type DatabaseClient = typeof db;
```

Adicionar `DB_POOL_MAX=` (comentada) ao `.env.example`.

- [ ] **Step 4: rodar e passar** — `npx vitest run tests/unit/db-client-env.test.ts` → verde; `npm run test` + `npm run typecheck` verdes (a suite de integração continua funcionando com `max` default 4 local).
- [ ] **Step 5: commit** —

```bash
git add src/db/client.ts src/lib/env.ts .env.example tests/unit/db-client-env.test.ts
git commit -m "feat(db): pool postgres serverless (max 1 na Vercel, idle_timeout 20s, override DB_POOL_MAX)"
```

---

### Task 3: Logger estruturado `src/lib/logger.ts` + Sentry opcional no-op

**Files:**
- Create: `src/lib/logger.ts`, `src/lib/sentry.ts`
- Modify: `src/lib/env.ts`, `.env.example`, `src/modules/pipeline/steps/collect-market.ts` (console.warn), `src/modules/pipeline/steps/analyze-ia.ts` (console.warn), `src/modules/notifications/email.ts` (console.info/warn)
- Test: `tests/unit/logger.test.ts`

**Interfaces (Produces — consumidas pelas Tasks 4, 6, 7, 8, 14):**
- `logger.debug|info(msg: string, ctx?: LogContext)`; `logger.warn|error(msg: string, ctx?: LogContext, err?: unknown)`
- `createLogger(base: LogContext)` → mesmo shape com contexto pré-mesclado (`orgId`/`reportId`/`requestId`)
- `captureException(err: unknown, ctx?: Record<string, unknown>): Promise<void>` — no-op sem `SENTRY_DSN`
- Env nova: `SENTRY_DSN?: string (url)`

- [ ] **Step 1: teste que falha** — criar `tests/unit/logger.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, logger } from '@/lib/logger';

describe('logger estruturado', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emite JSON com ts, nivel, msg e contexto', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('pipeline iniciado', { orgId: 'org-1', reportId: 'rep-1' });
    const linha = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(linha.nivel).toBe('info');
    expect(linha.msg).toBe('pipeline iniciado');
    expect(linha.orgId).toBe('org-1');
    expect(linha.reportId).toBe('rep-1');
    expect(typeof linha.ts).toBe('string');
  });

  it('error serializa Error com name/message e usa console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('falhou', { orgId: 'org-1' }, new Error('boom'));
    const linha = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(linha.erro.message).toBe('boom');
    expect(linha.erro.name).toBe('Error');
  });

  it('createLogger mescla contexto base', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger({ reportId: 'rep-9' });
    log.info('etapa', { etapa: 'analisando_ia' });
    const linha = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(linha.reportId).toBe('rep-9');
    expect(linha.etapa).toBe('analisando_ia');
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/unit/logger.test.ts` → "Cannot find module '@/lib/logger'".
- [ ] **Step 3: implementar.** Em `src/lib/env.ts` adicionar `SENTRY_DSN: z.string().url().optional(),` (+ linha comentada no `.env.example`). Criar `src/lib/sentry.ts`:

```ts
import { serverEnv } from '@/lib/env';

/** Extrai do DSN (https://<key>@<host>/<projectId>) a URL da store API + a key. */
function parseDsn(dsn: string): { url: string; key: string } | null {
  try {
    const u = new URL(dsn);
    const projectId = u.pathname.replace(/^\//, '');
    if (!u.username || !projectId) return null;
    return { url: `${u.protocol}//${u.host}/api/${projectId}/store/`, key: u.username };
  } catch {
    return null;
  }
}

/**
 * Envia a exceção para o Sentry via store API (fetch puro, sem dependência).
 * SENTRY_DSN ausente = no-op. Nunca lança — observabilidade não quebra fluxo.
 */
export async function captureException(
  err: unknown,
  ctx?: Record<string, unknown>,
): Promise<void> {
  const dsn = serverEnv.SENTRY_DSN;
  if (!dsn) return;
  const parsed = parseDsn(dsn);
  if (!parsed) return;
  const e = err instanceof Error ? err : new Error(String(err));
  try {
    await fetch(parsed.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=truth-analytics/1.0`,
      },
      body: JSON.stringify({
        message: e.message,
        level: 'error',
        platform: 'node',
        exception: { values: [{ type: e.name, value: e.message }] },
        extra: ctx ?? {},
        timestamp: Date.now() / 1000,
      }),
    });
  } catch {
    // nunca propaga
  }
}
```

Criar `src/lib/logger.ts`:

```ts
import { captureException } from '@/lib/sentry';

type Nivel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = {
  requestId?: string;
  orgId?: string;
  reportId?: string;
  [key: string]: unknown;
};

function emit(nivel: Nivel, msg: string, ctx?: LogContext, err?: unknown): void {
  const linha: Record<string, unknown> = {
    ts: new Date().toISOString(),
    nivel,
    msg,
    ...ctx,
  };
  if (err !== undefined) {
    linha.erro =
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : String(err);
  }
  const out = JSON.stringify(linha);
  if (nivel === 'error') console.error(out);
  else if (nivel === 'warn') console.warn(out);
  else console.log(out);
  if (nivel === 'error') void captureException(err ?? new Error(msg), ctx);
}

export const logger = {
  debug: (msg: string, ctx?: LogContext): void => emit('debug', msg, ctx),
  info: (msg: string, ctx?: LogContext): void => emit('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext, err?: unknown): void => emit('warn', msg, ctx, err),
  error: (msg: string, ctx?: LogContext, err?: unknown): void => emit('error', msg, ctx, err),
};

export type Logger = typeof logger;

export function createLogger(base: LogContext): Logger {
  return {
    debug: (msg, ctx) => emit('debug', msg, { ...base, ...ctx }),
    info: (msg, ctx) => emit('info', msg, { ...base, ...ctx }),
    warn: (msg, ctx, err) => emit('warn', msg, { ...base, ...ctx }, err),
    error: (msg, ctx, err) => emit('error', msg, { ...base, ...ctx }, err),
  };
}
```

Substituir os `console.*` existentes:
- `collect-market.ts`: `console.warn('[collect-market] ...')` → `logger.warn('provedor de mercado falhou', { orgId, reportId, fonte: provider.fonte, keyword }, err)` (a reescrita completa do arquivo vem na Task 7 — aqui só troca a chamada).
- `analyze-ia.ts`: `console.warn('[analyzeWithIA] ...')` → `logger.warn('análise IA: primeira tentativa inválida, re-tentando', { parseError })`.
- `email.ts`: `console.info('[email] (no-op)...')` → `logger.info('e-mail em modo no-op', { subject: input.subject })`; `console.warn('[email] falha...')` → `logger.warn('falha ao enviar e-mail', { subject: input.subject }, err)`.

- [ ] **Step 4: rodar e passar** — `npx vitest run tests/unit/logger.test.ts` → 3 verdes; `npm run test` + `npm run typecheck` verdes.
- [ ] **Step 5: commit** —

```bash
git add src/lib/logger.ts src/lib/sentry.ts src/lib/env.ts .env.example src/modules/pipeline/steps/collect-market.ts src/modules/pipeline/steps/analyze-ia.ts src/modules/notifications/email.ts tests/unit/logger.test.ts
git commit -m "feat(obs): logger estruturado JSON + Sentry opcional no-op via SENTRY_DSN"
```

---

### Task 4: Núcleo background — `PIPELINE_SECRET`, dispatch, rota `/api/pipeline/run`, orquestrador por `reportId` + `etapa`, action que enfileira

**Files:**
- Create: `src/modules/pipeline/dispatch.ts`, `src/app/api/pipeline/run/route.ts`
- Modify: `src/lib/env.ts`, `.env.example`, `package.json` (dep `@vercel/functions`), `src/modules/pipeline/orchestrator.ts`, `src/modules/pipeline/steps/finalize.ts`, `src/modules/reports/report.repository.ts`, `src/modules/reports/report.types.ts`, `src/actions/reports.actions.ts`, `src/app/(client)/dashboard/generate-report.tsx`, `tests/integration/orchestrator.test.ts`
- Test: `tests/unit/pipeline-run-route.test.ts`, `tests/unit/dispatch.test.ts`, `tests/integration/orchestrator.test.ts` (adaptado)

**Interfaces:**
- Consumes: `reports.etapa` + `reports_org_ativo_uq` (Task 1), `logger`/`createLogger` (Task 3).
- Produces:
  - `generateReport(reportId: string): Promise<{ reportId: string; status: 'done' | 'failed' | 'ignorado' }>` — só processa `status='queued'`; atualiza `etapa` entre steps (heartbeat via `updated_at`).
  - `createQueuedReport(orgId: string, periodo: { inicio: Date; fim: Date }): Promise<string>`; `markReportFailed(reportId: string, erro: string): Promise<void>` (repository).
  - `dispatchPipelineRun(reportId: string): Promise<void>` — POST `${APP_URL}/api/pipeline/run`, header `x-pipeline-secret`, espera `202`.
  - `POST /api/pipeline/run` — body `{ reportId: uuid }`; `401` secret errado, `400` body inválido, `500` `PIPELINE_SECRET` ausente, `202` + `waitUntil(generateReport(reportId))`. `export const maxDuration = 300`.
  - `ReportEtapa = 'coletando_vendas' | 'analisando_mercado' | 'analisando_ia' | 'finalizando'` (em `report.types.ts`).
  - Env nova: `PIPELINE_SECRET?: string (min 16)` — opcional no schema (app sobe sem), action retorna `pipeline_nao_configurado` se ausente.

- [ ] **Step 1: dep + env** — `npm install @vercel/functions`. Em `src/lib/env.ts` adicionar `PIPELINE_SECRET: z.string().min(16).optional(),`. Adicionar `PIPELINE_SECRET=` ao `.env.example` e um valor real (`openssl rand -hex 32`) ao `.env.local`.

- [ ] **Step 2: testes que falham** — criar `tests/unit/dispatch.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: {
      ...mod.serverEnv,
      APP_URL: 'http://localhost:3000',
      PIPELINE_SECRET: 'segredo-de-teste-com-16+',
    },
  };
});

import { dispatchPipelineRun } from '@/modules/pipeline/dispatch';

describe('dispatchPipelineRun', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POSTa com x-pipeline-secret e aceita 202', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    await dispatchPipelineRun('11111111-1111-1111-1111-111111111111');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://localhost:3000/api/pipeline/run');
    expect((init.headers as Record<string, string>)['x-pipeline-secret']).toBe(
      'segredo-de-teste-com-16+',
    );
    expect(JSON.parse(init.body as string)).toEqual({
      reportId: '11111111-1111-1111-1111-111111111111',
    });
  });

  it('não-202 lança pipeline_dispatch_falhou', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    await expect(dispatchPipelineRun('11111111-1111-1111-1111-111111111111')).rejects.toThrow(
      'pipeline_dispatch_falhou_500',
    );
  });
});
```

E `tests/unit/pipeline-run-route.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, PIPELINE_SECRET: 'segredo-de-teste-com-16+' },
  };
});
vi.mock('@vercel/functions', () => ({ waitUntil: (p: Promise<unknown>) => void p }));
vi.mock('@/modules/pipeline/orchestrator', () => ({
  generateReport: vi.fn().mockResolvedValue({ reportId: 'x', status: 'done' }),
}));

import { generateReport } from '@/modules/pipeline/orchestrator';
import { POST } from '@/app/api/pipeline/run/route';

function req(body: unknown, secret?: string): Request {
  return new Request('http://localhost:3000/api/pipeline/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-pipeline-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

const REPORT_ID = '22222222-2222-2222-2222-222222222222';

describe('POST /api/pipeline/run', () => {
  it('sem secret → 401 e não roda o pipeline', async () => {
    const res = await POST(req({ reportId: REPORT_ID }));
    expect(res.status).toBe(401);
    expect(generateReport).not.toHaveBeenCalled();
  });

  it('secret errado → 401', async () => {
    const res = await POST(req({ reportId: REPORT_ID }, 'errado-mas-16-chars!!'));
    expect(res.status).toBe(401);
  });

  it('body inválido → 400', async () => {
    const res = await POST(req({ reportId: 'nao-uuid' }, 'segredo-de-teste-com-16+'));
    expect(res.status).toBe(400);
  });

  it('ok → 202 e dispara generateReport via waitUntil', async () => {
    const res = await POST(req({ reportId: REPORT_ID }, 'segredo-de-teste-com-16+'));
    expect(res.status).toBe(202);
    expect(generateReport).toHaveBeenCalledWith(REPORT_ID);
  });
});
```

- [ ] **Step 3: rodar e ver falhar** — `npx vitest run tests/unit/dispatch.test.ts tests/unit/pipeline-run-route.test.ts` → "Cannot find module".

- [ ] **Step 4: implementar dispatch + rota.** Criar `src/modules/pipeline/dispatch.ts`:

```ts
import { serverEnv } from '@/lib/env';

/**
 * Dispara o pipeline em background: POST autenticado para /api/pipeline/run.
 * O chamador só aguarda o 202 (aceite) — nunca o pipeline inteiro.
 */
export async function dispatchPipelineRun(reportId: string): Promise<void> {
  if (!serverEnv.PIPELINE_SECRET) {
    throw new Error('pipeline_nao_configurado');
  }
  const res = await fetch(`${serverEnv.APP_URL}/api/pipeline/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-pipeline-secret': serverEnv.PIPELINE_SECRET,
    },
    body: JSON.stringify({ reportId }),
  });
  if (res.status !== 202) {
    throw new Error(`pipeline_dispatch_falhou_${res.status}`);
  }
}
```

Criar `src/app/api/pipeline/run/route.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';

import { waitUntil } from '@vercel/functions';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { generateReport } from '@/modules/pipeline/orchestrator';

export const dynamic = 'force-dynamic';
// Exige plano Vercel com suporte a 300s (validado nos pré-requisitos).
export const maxDuration = 300;

const bodySchema = z.object({ reportId: z.string().uuid() });

function secretsMatch(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!serverEnv.PIPELINE_SECRET) {
    return NextResponse.json({ error: 'pipeline_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('x-pipeline-secret'), serverEnv.PIPELINE_SECRET)) {
    return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'body_invalido' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'body_invalido' }, { status: 400 });
  }

  const { reportId } = parsed.data;
  waitUntil(
    generateReport(reportId).catch((err) => {
      logger.error('pipeline em background falhou fora do orquestrador', { reportId }, err);
    }),
  );
  return NextResponse.json({ accepted: true, reportId }, { status: 202 });
}
```

- [ ] **Step 5: repository + tipos.** Em `src/modules/reports/report.types.ts`, adicionar:

```ts
export type ReportEtapa =
  | 'coletando_vendas'
  | 'analisando_mercado'
  | 'analisando_ia'
  | 'finalizando';
```

Em `src/modules/reports/report.repository.ts`, adicionar:

```ts
export async function createQueuedReport(
  orgId: string,
  periodo: { inicio: Date; fim: Date },
): Promise<string> {
  try {
    const [row] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'queued',
        periodo_inicio: periodo.inicio,
        periodo_fim: periodo.fim,
      })
      .returning({ id: reports.id });
    return row.id;
  } catch (e: unknown) {
    // 23505 = unique_violation no índice parcial reports_org_ativo_uq
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
      throw new Error('relatorio_em_andamento');
    }
    throw e;
  }
}

export async function markReportFailed(reportId: string, erro: string): Promise<void> {
  await db.update(reports).set({ status: 'failed', erro }).where(eq(reports.id, reportId));
}
```

- [ ] **Step 6: refatorar o orquestrador** — substituir `src/modules/pipeline/orchestrator.ts` por:

```ts
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { createLogger } from '@/lib/logger';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { sendPipelineFailedEmail } from '@/modules/notifications/email';
import { getAdminAlertEmail, getOrgPrimaryEmail } from '@/modules/notifications/recipients';
import { collectBlingOrders } from '@/modules/pipeline/steps/collect-bling';
import { collectMarket } from '@/modules/pipeline/steps/collect-market';
import { computeMetrics } from '@/modules/pipeline/steps/compute-metrics';
import { analyzeWithIA } from '@/modules/pipeline/steps/analyze-ia';
import { finalize } from '@/modules/pipeline/steps/finalize';
import type { ReportEtapa } from '@/modules/reports/report.types';

/** Limita o erro persistido a 2000 chars para legibilidade no painel. */
function truncateErro(msg: string, maxLen = 2000): string {
  return msg.length <= maxLen ? msg : msg.slice(0, maxLen) + '…';
}

/** Atualiza a etapa do report — também serve de heartbeat (updated_at) p/ o watchdog. */
async function setEtapa(reportId: string, etapa: ReportEtapa): Promise<void> {
  await db.update(reports).set({ etapa }).where(eq(reports.id, reportId));
}

export type GenerateOutcome = {
  reportId: string;
  status: 'done' | 'failed' | 'ignorado';
};

/**
 * Orquestrador do pipeline — agora por reportId (o report 'queued' já foi criado
 * pela action via createQueuedReport; o lock reports_org_ativo_uq garante 1 ativo/org).
 *
 * Fluxo:
 * 1. Carrega o report; se status !== 'queued' retorna 'ignorado' (idempotência de re-POST).
 * 2. Marca running + etapa 'coletando_vendas'.
 * 3. collectBlingOrders ∥ collectMarket (Bling falha dura; mercado graciosa).
 * 4. etapa 'analisando_mercado' → computeMetrics; etapa 'analisando_ia' → analyzeWithIA;
 *    etapa 'finalizando' → finalize (done + trava + e-mail; finalize zera etapa).
 * 5. Erro: report 'failed' + erro truncado (etapa preservada p/ diagnóstico), e-mail admin,
 *    trava NÃO setada. Nunca relança.
 */
export async function generateReport(reportId: string): Promise<GenerateOutcome> {
  const [reportRow] = await db
    .select({
      id: reports.id,
      org_id: reports.org_id,
      status: reports.status,
      periodo_inicio: reports.periodo_inicio,
      periodo_fim: reports.periodo_fim,
    })
    .from(reports)
    .where(eq(reports.id, reportId))
    .limit(1);

  if (!reportRow) {
    throw new Error('report_nao_encontrado');
  }
  if (reportRow.status !== 'queued') {
    return { reportId, status: 'ignorado' };
  }

  const orgId = reportRow.org_id;
  const periodo = { inicio: reportRow.periodo_inicio, fim: reportRow.periodo_fim };
  const log = createLogger({ orgId, reportId });

  await db
    .update(reports)
    .set({ status: 'running', etapa: 'coletando_vendas' })
    .where(eq(reports.id, reportId));

  try {
    const org = await getOrganizationById(orgId);
    if (!org) throw new Error('org_nao_encontrada');
    const { plano, nicho } = org;
    if (!plano) throw new Error('sem_plano');

    // Coleta Bling ∥ mercado (allSettled: nenhuma promessa solta escreve depois do retorno).
    const [blingOutcome, marketOutcome] = await Promise.allSettled([
      collectBlingOrders(orgId, periodo),
      collectMarket(orgId, reportId),
    ]);

    if (blingOutcome.status === 'rejected') {
      throw blingOutcome.reason instanceof Error
        ? blingOutcome.reason
        : new Error(String(blingOutcome.reason));
    }
    const benchmarkParcial =
      marketOutcome.status === 'fulfilled' ? marketOutcome.value.benchmarkParcial : true;

    await setEtapa(reportId, 'analisando_mercado');
    const metricas = await computeMetrics(orgId, reportId, periodo, benchmarkParcial);

    await setEtapa(reportId, 'analisando_ia');
    const analise = await analyzeWithIA(metricas, nicho);

    await setEtapa(reportId, 'finalizando');
    let clientEmail: string | null = null;
    try {
      clientEmail = await getOrgPrimaryEmail(orgId);
    } catch {
      // lookup falhou — e-mail pulado, pipeline continua
    }
    await finalize({ reportId, orgId, metricas, analise, plano, clientEmail });

    log.info('pipeline concluído');
    return { reportId, status: 'done' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const erroTruncado = truncateErro(message);

    // etapa NÃO é zerada aqui: mostra onde o pipeline morreu.
    await db
      .update(reports)
      .set({ status: 'failed', erro: erroTruncado })
      .where(eq(reports.id, reportId));

    log.error('pipeline falhou', { erro: erroTruncado }, err);

    const adminEmail = getAdminAlertEmail();
    if (adminEmail) {
      await sendPipelineFailedEmail(adminEmail, orgId, reportId, erroTruncado);
    }
    return { reportId, status: 'failed' };
  }
}
```

Em `src/modules/pipeline/steps/finalize.ts`, no primeiro update da transação, zerar a etapa junto com o done:

```ts
      .set({
        status: 'done',
        etapa: null,
        metricas,
        analise_ia: analise,
        erro: null,
      })
```

- [ ] **Step 7: reescrever a action** — substituir `src/actions/reports.actions.ts` por:

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { getConnection } from '@/modules/connections/connection.repository';
import { diasDoPlano, podeGerar } from '@/modules/pipeline/plan-lock';
import { dispatchPipelineRun } from '@/modules/pipeline/dispatch';
import { createQueuedReport, markReportFailed } from '@/modules/reports/report.repository';

export type GenerateState = { error?: string; reportId?: string };

/**
 * Enfileira a geração de um relatório para a org autenticada.
 *
 * 1. Gating: sessão + org active, podeGerar, Bling conectado, PIPELINE_SECRET presente.
 * 2. createQueuedReport: insere 'queued' — o índice parcial reports_org_ativo_uq
 *    rejeita duplo clique/segunda aba com 'relatorio_em_andamento'.
 * 3. dispatchPipelineRun: POST /api/pipeline/run e aguarda SÓ o 202.
 *    Falha no dispatch → report vira 'failed' (não fica preso na fila).
 *
 * O processamento acontece em background; o client acompanha via
 * GET /api/reports/[id]/status (polling 3s — stepper da F1).
 */
export async function generateReportAction(
  _prev: GenerateState,
  _formData: FormData,
): Promise<GenerateState> {
  const access = await requireActiveOrg();

  const org = await getOrganizationById(access.orgId);
  if (!org) return { error: 'org_nao_encontrada' };

  const gerar = podeGerar(org);
  if (!gerar.ok) return { error: gerar.motivo };
  if (!org.plano) return { error: 'sem_plano' };

  const conn = await getConnection(access.orgId);
  if (!conn?.connected) return { error: 'bling_nao_conectado' };

  if (!serverEnv.PIPELINE_SECRET) return { error: 'pipeline_nao_configurado' };

  const agora = new Date();
  const inicio = new Date(agora.getTime() - diasDoPlano(org.plano) * 24 * 60 * 60 * 1000);

  let reportId: string;
  try {
    reportId = await createQueuedReport(access.orgId, { inicio, fim: agora });
  } catch (err) {
    if (err instanceof Error && err.message === 'relatorio_em_andamento') {
      return { error: 'relatorio_em_andamento' };
    }
    throw err;
  }

  try {
    await dispatchPipelineRun(reportId);
  } catch (err) {
    await markReportFailed(reportId, 'dispatch_falhou');
    logger.error('dispatch do pipeline falhou', { orgId: access.orgId, reportId }, err);
    return { error: 'falha_geracao', reportId };
  }

  revalidatePath('/dashboard');
  return { reportId };
}
```

Em `src/app/(client)/dashboard/generate-report.tsx` (preservando `data-testid="generate-report-button"`), atualizar labels e copy de sucesso:

```ts
const ERROR_LABELS: Record<string, string> = {
  org_inativa: 'Organização inativa.',
  sem_plano: 'Nenhum plano definido. Fale com o suporte.',
  ciclo_em_andamento: 'O próximo relatório ainda não foi liberado.',
  bling_nao_conectado: 'Conecte o Bling em Conexões.',
  org_nao_encontrada: 'Organização não encontrada. Recarregue a página.',
  falha_geracao: 'Falha ao gerar o relatório. Tente novamente.',
  relatorio_em_andamento: 'Já existe um relatório em processamento para sua conta.',
  pipeline_nao_configurado: 'Geração indisponível no momento. Fale com o suporte.',
};
```

```tsx
      {state.reportId && !state.error ? (
        <p className="mt-3 text-sm text-brand" data-testid="report-queued">
          Relatório em processamento. Avisaremos por e-mail quando estiver pronto.
        </p>
      ) : null}
```

- [ ] **Step 8: adaptar o teste de integração do orquestrador** — em `tests/integration/orchestrator.test.ts`, onde hoje se chama `generateReport(orgId)`, semear o report na fila e chamar por id (padrão para TODOS os casos do arquivo):

```ts
import { createQueuedReport } from '@/modules/reports/report.repository';

// dentro do teste, no lugar de generateReport(orgId):
const agora = new Date();
const inicio = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
const reportId = await createQueuedReport(orgId, { inicio, fim: agora });
const result = await generateReport(reportId);
```

Asserções novas no caso de sucesso: `status: 'done'` e `etapa === null` no banco. No caso de falha do Bling: `status: 'failed'`, `etapa === 'coletando_vendas'` (preservada), trava NÃO setada. Caso novo (idempotência):

```ts
it('re-executar generateReport de um report não-queued retorna ignorado', async () => {
  const agora = new Date();
  const inicio = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
  const reportId = await createQueuedReport(orgId, { inicio, fim: agora });
  await generateReport(reportId); // 1ª execução consome o queued
  const segunda = await generateReport(reportId);
  expect(segunda.status).toBe('ignorado');
});
```

Atenção ao lock: o índice parcial só permite 1 report ativo (queued/running) por org — cada caso do arquivo deve deixar o report anterior em `done`/`failed` antes de enfileirar o próximo (o próprio `generateReport` faz isso), ou usar orgs distintas por caso.

- [ ] **Step 9: rodar e passar** — `npx vitest run tests/unit/dispatch.test.ts tests/unit/pipeline-run-route.test.ts tests/integration/orchestrator.test.ts` verdes; depois `npm run test` + `npm run typecheck` (corrigir outros usos de `generateReport(orgId)` se o typecheck acusar).
- [ ] **Step 10: commit** —

```bash
git add package.json package-lock.json src/lib/env.ts .env.example src/modules/pipeline/dispatch.ts src/app/api/pipeline/run src/modules/pipeline/orchestrator.ts src/modules/pipeline/steps/finalize.ts src/modules/reports/report.repository.ts src/modules/reports/report.types.ts src/actions/reports.actions.ts "src/app/(client)/dashboard/generate-report.tsx" tests/unit/dispatch.test.ts tests/unit/pipeline-run-route.test.ts tests/integration/orchestrator.test.ts
git commit -m "feat(pipeline): geração em background via /api/pipeline/run (waitUntil+maxDuration 300) com fila, lock por org e etapa"
```

---

### Task 5: `GET /api/reports/[id]/status` (escopado por org da sessão)

**Files:**
- Create: `src/app/api/reports/[id]/status/route.ts`
- Test: `tests/unit/report-status-route.test.ts`

**Interfaces:**
- Consumes: `getSessionContext()` (`src/modules/auth/session.ts`), `reports.etapa` (Task 1).
- Produces: `GET /api/reports/[id]/status` → `200 { status, etapa }` (contrato consumido pelo stepper da F1, polling 3s enquanto `queued|running`); `401` sem sessão; `404` id inexistente/da outra org/uuid inválido. `Cache-Control: no-store`.

- [ ] **Step 1: teste que falha** — criar `tests/unit/report-status-route.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const getSessionContextMock = vi.fn();
vi.mock('@/modules/auth/session', () => ({
  getSessionContext: (...args: unknown[]) => getSessionContextMock(...args),
}));

const selectResult: unknown[] = [];
vi.mock('@/db/client', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve(selectResult) }),
      }),
    }),
  },
}));

import { GET } from '@/app/api/reports/[id]/status/route';

const ID = '33333333-3333-3333-3333-333333333333';
const req = new Request(`http://localhost:3000/api/reports/${ID}/status`);

describe('GET /api/reports/[id]/status', () => {
  it('sem sessão → 401', async () => {
    getSessionContextMock.mockResolvedValueOnce(null);
    const res = await GET(req, { params: { id: ID } });
    expect(res.status).toBe(401);
  });

  it('uuid inválido → 404 sem consultar o banco', async () => {
    getSessionContextMock.mockResolvedValueOnce({ orgId: 'org-1' });
    const res = await GET(req, { params: { id: 'nao-uuid' } });
    expect(res.status).toBe(404);
  });

  it('report da org → 200 { status, etapa } com no-store', async () => {
    getSessionContextMock.mockResolvedValueOnce({ orgId: 'org-1' });
    selectResult.length = 0;
    selectResult.push({ status: 'running', etapa: 'analisando_ia' });
    const res = await GET(req, { params: { id: ID } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ status: 'running', etapa: 'analisando_ia' });
  });

  it('report inexistente/da outra org → 404', async () => {
    getSessionContextMock.mockResolvedValueOnce({ orgId: 'org-1' });
    selectResult.length = 0;
    const res = await GET(req, { params: { id: ID } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/unit/report-status-route.test.ts` → "Cannot find module".
- [ ] **Step 3: implementar** — criar `src/app/api/reports/[id]/status/route.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { getSessionContext } from '@/modules/auth/session';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

/**
 * Status de um relatório para polling do client (stepper da F1, a cada 3s
 * enquanto status ∈ {queued, running}). SEMPRE escopado pela org da sessão —
 * nunca confia no id isoladamente (sem IDOR).
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const access = await getSessionContext();
  if (!access) {
    return NextResponse.json({ error: 'nao_autenticado' }, { status: 401 });
  }

  const parsed = idSchema.safeParse(params.id);
  if (!parsed.success) {
    return NextResponse.json({ error: 'nao_encontrado' }, { status: 404 });
  }

  const [row] = await db
    .select({ status: reports.status, etapa: reports.etapa })
    .from(reports)
    .where(and(eq(reports.id, parsed.data), eq(reports.org_id, access.orgId)))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: 'nao_encontrado' }, { status: 404 });
  }

  return NextResponse.json(
    { status: row.status, etapa: row.etapa },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
```

- [ ] **Step 4: rodar e passar** — `npx vitest run tests/unit/report-status-route.test.ts` → 4 verdes; `npm run typecheck` verde.
- [ ] **Step 5: commit** —

```bash
git add "src/app/api/reports/[id]/status/route.ts" tests/unit/report-status-route.test.ts
git commit -m "feat(reports): endpoint GET /api/reports/[id]/status para polling de progresso"
```

---

### Task 6: Watchdog cron — `/api/cron/watchdog` + `vercel.json`

**Files:**
- Create: `src/app/api/cron/watchdog/route.ts`, `vercel.json`
- Modify: `src/lib/env.ts`, `.env.example`
- Test: `tests/integration/watchdog.test.ts`

**Interfaces:**
- Consumes: `reports.updated_at` (heartbeat do orquestrador, Task 4), `logger` (Task 3).
- Produces: `GET /api/cron/watchdog` (auth `Authorization: Bearer ${CRON_SECRET}` — formato que a Vercel envia automaticamente quando a env `CRON_SECRET` existe) → marca `failed`/`erro='timeout_watchdog'` todo report `queued|running` com `updated_at` mais velho que 20 min; responde `{ marcados: n }`. Env nova: `CRON_SECRET?: string (min 16)`.

- [ ] **Step 1: env + vercel.json** — em `src/lib/env.ts` adicionar `CRON_SECRET: z.string().min(16).optional(),` (+ `.env.example`). Criar `vercel.json` na raiz:

```json
{
  "crons": [
    { "path": "/api/cron/watchdog", "schedule": "*/10 * * * *" }
  ]
}
```

- [ ] **Step 2: teste que falha** — criar `tests/integration/watchdog.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, CRON_SECRET: 'cron-segredo-de-teste-16+' },
  };
});

import { db } from '@/db/client';
import { organizations, reports } from '@/db/schema';
import { GET } from '@/app/api/cron/watchdog/route';

function req(auth?: string): Request {
  return new Request('http://localhost:3000/api/cron/watchdog', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe.skipIf(!process.env.DATABASE_URL_TEST)('watchdog', () => {
  let orgId: string;
  const periodo = { periodo_inicio: new Date('2026-06-01'), periodo_fim: new Date('2026-07-01') };

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `t_wd_${randomUUID().slice(0, 8)}`, status: 'active', plano: 'monthly' })
      .returning({ id: organizations.id });
    orgId = org.id;
  });

  afterAll(async () => {
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('sem/errado Bearer → 401', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer errado'))).status).toBe(401);
  });

  it('marca preso (>20min) como failed e preserva o recente', async () => {
    const [preso] = await db
      .insert(reports)
      .values({ org_id: orgId, status: 'running', ...periodo })
      .returning({ id: reports.id });
    // Envelhece o updated_at por SQL direto (o $onUpdateFn impediria via update Drizzle)
    await db.execute(
      sql`update reports set updated_at = now() - interval '30 minutes' where id = ${preso.id}`,
    );

    const res = await GET(req('Bearer cron-segredo-de-teste-16+'));
    expect(res.status).toBe(200);
    expect((await res.json()).marcados).toBeGreaterThanOrEqual(1);

    const [linha] = await db
      .select({ status: reports.status, erro: reports.erro })
      .from(reports)
      .where(eq(reports.id, preso.id));
    expect(linha.status).toBe('failed');
    expect(linha.erro).toBe('timeout_watchdog');

    // report recente (done) intocado — insere e roda de novo
    const [recente] = await db
      .insert(reports)
      .values({ org_id: orgId, status: 'queued', ...periodo })
      .returning({ id: reports.id });
    await GET(req('Bearer cron-segredo-de-teste-16+'));
    const [linha2] = await db
      .select({ status: reports.status })
      .from(reports)
      .where(eq(reports.id, recente.id));
    expect(linha2.status).toBe('queued'); // updated_at recente → não marcado
  });
});
```

- [ ] **Step 3: rodar e ver falhar** — `npx vitest run tests/integration/watchdog.test.ts` → "Cannot find module".
- [ ] **Step 4: implementar** — criar `src/app/api/cron/watchdog/route.ts`:

```ts
import { and, inArray, lt } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const TIMEOUT_MINUTOS = 20;

/**
 * Watchdog (Vercel Cron, a cada 10 min): marca como failed todo report
 * queued/running cujo updated_at (heartbeat de etapa do orquestrador) está
 * parado há mais de 20 min — reaper dos órfãos de crash/timeout da função.
 */
export async function GET(req: Request): Promise<NextResponse> {
  if (!serverEnv.CRON_SECRET) {
    return NextResponse.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: 'nao_autorizado' }, { status: 401 });
  }

  const limite = new Date(Date.now() - TIMEOUT_MINUTOS * 60_000);
  const presos = await db
    .update(reports)
    .set({ status: 'failed', erro: 'timeout_watchdog' })
    .where(and(inArray(reports.status, ['queued', 'running']), lt(reports.updated_at, limite)))
    .returning({ id: reports.id, org_id: reports.org_id });

  if (presos.length > 0) {
    logger.warn('watchdog marcou relatórios presos como failed', {
      quantidade: presos.length,
      reportIds: presos.map((p) => p.id),
    });
  }
  return NextResponse.json({ marcados: presos.length });
}
```

- [ ] **Step 5: rodar e passar** — `npx vitest run tests/integration/watchdog.test.ts` verdes; `npm run test` + `npm run typecheck` verdes.
- [ ] **Step 6: commit** —

```bash
git add src/app/api/cron/watchdog vercel.json src/lib/env.ts .env.example tests/integration/watchdog.test.ts
git commit -m "feat(pipeline): watchdog cron marca relatórios presos (>20min) como failed"
```

---

### Task 7: Paralelizar coleta de mercado — `src/lib/p-limit.ts` (concorrência 6), bulk insert e poda do `bruto`

**Files:**
- Create: `src/lib/p-limit.ts`
- Modify: `src/modules/market/market.types.ts`, `src/modules/market/serpapi.ts`, `src/modules/market/ml-publico.ts`, `src/modules/pipeline/steps/collect-market.ts`, `src/modules/pipeline/steps/compute-metrics.ts` (tipo `SnapshotRow.dados`), `tests/integration/collect-market.test.ts` (fixtures sem `bruto`)
- Test: `tests/unit/p-limit.test.ts`, `tests/integration/collect-market.test.ts`

**Interfaces:**
- Consumes: `logger` (Task 3).
- Produces:
  - `pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T>` — helper próprio, sem dependência nova (decisão travada).
  - `MarketResult = { precos: number[] }` (SEM `bruto` — poda de storage).
  - `SnapshotDados = { precos: number[]; quantidadeResultados: number }` — shape persistido em `market_snapshots.dados`. Linhas antigas (com `bruto`) continuam legíveis: `compute-metrics` só lê `dados.precos`.
  - `collectMarket(orgId, reportId, providers?)` — mesma assinatura/retorno `{ benchmarkParcial }`; internamente paralelo (limite 6) + bulk insert (lotes de 100).

- [ ] **Step 1: teste do p-limit que falha** — criar `tests/unit/p-limit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { pLimit } from '@/lib/p-limit';

function deferido(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('pLimit', () => {
  it('nunca excede a concorrência', async () => {
    const limit = pLimit(2);
    let ativos = 0;
    let pico = 0;
    const gates = Array.from({ length: 5 }, deferido);
    const jobs = gates.map((g) =>
      limit(async () => {
        ativos++;
        pico = Math.max(pico, ativos);
        await g.promise;
        ativos--;
      }),
    );
    await Promise.resolve(); // deixa os 2 primeiros entrarem
    expect(pico).toBeLessThanOrEqual(2);
    gates.forEach((g) => g.resolve());
    await Promise.all(jobs);
    expect(pico).toBe(2);
  });

  it('propaga o resultado e a rejeição sem travar a fila', async () => {
    const limit = pLimit(1);
    await expect(limit(async () => 42)).resolves.toBe(42);
    await expect(limit(async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(limit(async () => 'depois')).resolves.toBe('depois');
  });

  it('rejeita concorrência inválida', () => {
    expect(() => pLimit(0)).toThrow('concorrencia_invalida');
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/unit/p-limit.test.ts` → "Cannot find module '@/lib/p-limit'".
- [ ] **Step 3: implementar `src/lib/p-limit.ts`:**

```ts
/**
 * Limitador de concorrência mínimo (substitui a lib p-limit — sem dependência nova).
 * Uso: const limit = pLimit(6); await Promise.all(jobs.map((j) => limit(() => run(j))));
 */
export function pLimit(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('concorrencia_invalida');
  }
  let ativos = 0;
  const fila: (() => void)[] = [];

  function libera(): void {
    ativos--;
    const proximo = fila.shift();
    if (proximo) proximo();
  }

  return async function executa<T>(fn: () => Promise<T>): Promise<T> {
    if (ativos >= concurrency) {
      await new Promise<void>((resolve) => fila.push(resolve));
    }
    ativos++;
    try {
      return await fn();
    } finally {
      libera();
    }
  };
}
```

- [ ] **Step 4: podar `bruto` dos tipos e providers.** `src/modules/market/market.types.ts`:

```ts
export interface MarketProvider {
  readonly fonte: 'serpapi' | 'ml_publico';
  search(keyword: string): Promise<MarketResult>;
}

/** Resultado de busca: só os preços — o payload bruto NÃO é mais retido (poda de storage). */
export type MarketResult = { precos: number[] };

/** Shape persistido em market_snapshots.dados a partir da F0. */
export type SnapshotDados = { precos: number[]; quantidadeResultados: number };
```

Em `serpapi.ts` e `ml-publico.ts`: trocar o retorno `return { precos, bruto };` por `return { precos };` (renomear a variável local `bruto` para `payload` para deixar claro que não sai da função). Em `compute-metrics.ts`, o tipo `SnapshotRow.dados` passa a `{ precos: number[] }` (o acesso `snap.dados?.precos` não muda; linhas antigas com `bruto` extra continuam válidas em runtime).

- [ ] **Step 5: reescrever `collect-market.ts`:**

```ts
import { db } from '@/db/client';
import { marketSnapshots } from '@/db/schema';
import { logger } from '@/lib/logger';
import { pLimit } from '@/lib/p-limit';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { mlPublicoProvider } from '@/modules/market/ml-publico';
import { serpapiProvider } from '@/modules/market/serpapi';
import type { MarketProvider, SnapshotDados } from '@/modules/market/market.types';

export type CollectMarketResult = { benchmarkParcial: boolean };

const CONCORRENCIA = 6;
const LOTE_INSERT = 100;

type SnapshotValues = {
  org_id: string;
  report_id: string;
  fonte: MarketProvider['fonte'];
  keyword: string;
  dados: SnapshotDados;
};

/**
 * Step 2: coleta de mercado paralelizada (limite 6) com bulk insert.
 * Degradação graciosa por job: falha de provedor/keyword marca benchmarkParcial
 * e segue — nunca derruba o pipeline.
 */
export async function collectMarket(
  orgId: string,
  reportId: string,
  providers: MarketProvider[] = [serpapiProvider, mlPublicoProvider],
): Promise<CollectMarketResult> {
  const allProducts = await listTrackedProducts(orgId);
  const activeProducts = allProducts.filter((p) => p.ativo === true);

  const jobs: { keyword: string; provider: MarketProvider }[] = [];
  for (const product of activeProducts) {
    for (const keyword of product.keywords.filter((k) => k.trim() !== '')) {
      for (const provider of providers) {
        jobs.push({ keyword, provider });
      }
    }
  }

  const limit = pLimit(CONCORRENCIA);
  let benchmarkParcial = false;
  const rows: SnapshotValues[] = [];

  await Promise.all(
    jobs.map((job) =>
      limit(async () => {
        try {
          const result = await job.provider.search(job.keyword);
          rows.push({
            org_id: orgId,
            report_id: reportId,
            fonte: job.provider.fonte,
            keyword: job.keyword,
            dados: { precos: result.precos, quantidadeResultados: result.precos.length },
          });
        } catch (err) {
          benchmarkParcial = true;
          logger.warn(
            'provedor de mercado falhou',
            { orgId, reportId, fonte: job.provider.fonte, keyword: job.keyword },
            err,
          );
        }
      }),
    ),
  );

  for (let i = 0; i < rows.length; i += LOTE_INSERT) {
    await db.insert(marketSnapshots).values(rows.slice(i, i + LOTE_INSERT));
  }

  if (rows.length === 0) {
    benchmarkParcial = true;
  }
  return { benchmarkParcial };
}
```

- [ ] **Step 6: adaptar o teste de integração** — em `tests/integration/collect-market.test.ts`: mocks de provider passam a retornar `{ precos: [...] }` (sem `bruto`); adicionar asserções de que `market_snapshots.dados` gravado é exatamente `{ precos, quantidadeResultados }` e caso novo de paralelismo com contrato preservado:

```ts
it('persiste dados podados (sem bruto) com quantidadeResultados', async () => {
  const ok: MarketProvider = {
    fonte: 'ml_publico',
    search: async () => ({ precos: [10, 20] }),
  };
  const { benchmarkParcial } = await collectMarket(orgId, reportId, [ok]);
  expect(benchmarkParcial).toBe(false);
  const snaps = await db
    .select()
    .from(marketSnapshots)
    .where(eq(marketSnapshots.report_id, reportId));
  expect(snaps.length).toBeGreaterThan(0);
  expect(snaps[0]!.dados).toEqual({ precos: [10, 20], quantidadeResultados: 2 });
});
```

- [ ] **Step 7: rodar e passar** — `npx vitest run tests/unit/p-limit.test.ts tests/integration/collect-market.test.ts` verdes; `npm run test` + `npm run typecheck` verdes (ajustar fixtures de `MarketResult` em outros testes que ainda tenham `bruto`).
- [ ] **Step 8: commit** —

```bash
git add src/lib/p-limit.ts src/modules/market src/modules/pipeline/steps/collect-market.ts src/modules/pipeline/steps/compute-metrics.ts tests/unit/p-limit.test.ts tests/integration/collect-market.test.ts
git commit -m "feat(pipeline): coleta de mercado paralela (pLimit 6) com bulk insert e snapshots sem payload bruto"
```

---

### Task 8: Bling — backoff em 429/5xx com `Retry-After` + persistência de pedidos em lotes por página

**Files:**
- Modify: `src/modules/providers/types.ts`, `src/modules/providers/bling/orders.ts`, `src/modules/pipeline/steps/collect-bling.ts`
- Test: `tests/unit/bling-orders-retry.test.ts`, `tests/integration/collect-bling.test.ts` (adaptado)

**Interfaces:**
- Consumes: `getValidAccessToken(orgId)` (existente), `logger` (Task 3).
- Produces:
  - `fetchOrders(orgId: string, periodo: Periodo, onPage?: (pagina: RawOrder[]) => Promise<void>): Promise<RawOrder[]>` — com `onPage`, entrega cada página e retorna `[]` (não acumula em RAM); sem `onPage`, comportamento atual (compat).
  - Retry: 429 e 5xx tentam até 3 vezes; delay = `Retry-After` (segundos, cap 30s) quando presente, senão exponencial 1s/2s; 4xx ≠ 429 falha direto com `bling_indisponivel`; esgotou → `bling_erro_<status>`.
  - `collectBlingOrders` inalterado no contrato (`{ processados, total }`), mas upserta página a página.

- [ ] **Step 1: teste que falha** — criar `tests/unit/bling-orders-retry.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/connections/connection.repository', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('token-teste'),
}));

import { fetchOrders } from '@/modules/providers/bling/orders';

function paginaVazia(): Response {
  return new Response(JSON.stringify({ data: [] }), { status: 200 });
}

const PERIODO = { inicio: new Date('2026-06-01'), fim: new Date('2026-07-01') };

describe('fetchOrders retry/backoff', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('429 com Retry-After → aguarda e refaz; sucesso na 2ª', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'retry-after': '1' } }),
      )
      .mockResolvedValueOnce(paginaVazia());
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', PERIODO);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('3× 429 → lança bling_erro_429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchOrders('org-1', PERIODO);
    const esperado = expect(promise).rejects.toThrow('bling_erro_429');
    await vi.advanceTimersByTimeAsync(1000 + 2000); // backoff 1s + 2s
    await esperado;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('4xx ≠ 429 falha direto sem retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchOrders('org-1', PERIODO)).rejects.toThrow('bling_indisponivel');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('onPage recebe cada página e o retorno não acumula', async () => {
    const pedido = { id: 1, data: '2026-06-10', total: 100, itens: [] };
    const cheia = Array.from({ length: 100 }, (_, i) => ({ ...pedido, id: i + 1 }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: cheia }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ ...pedido, id: 999 }] }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const paginas: number[] = [];
    const retorno = await fetchOrders('org-1', PERIODO, async (pagina) => {
      paginas.push(pagina.length);
    });
    expect(paginas).toEqual([100, 1]);
    expect(retorno).toEqual([]);
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/unit/bling-orders-retry.test.ts`. Esperado: falha (sem retry hoje, `429` vira `bling_indisponivel` na 1ª tentativa; `onPage` não existe).
- [ ] **Step 3: implementar.** Em `src/modules/providers/types.ts`, atualizar a assinatura na interface:

```ts
  fetchOrders(
    orgId: string,
    periodo: Periodo,
    onPage?: (pagina: RawOrder[]) => Promise<void>,
  ): Promise<RawOrder[]>;
```

Em `src/modules/providers/bling/orders.ts`, adicionar acima de `fetchOrders` (mantendo `formatDate`/`mapItem`/`mapOrder` como estão):

```ts
const MAX_TENTATIVAS = 3;
const BASE_DELAY_MS = 1000;
const MAX_RETRY_AFTER_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET autenticado no Bling com backoff:
 * - 429/5xx: até 3 tentativas; honra Retry-After (segundos, cap 30s), senão 1s/2s exponencial.
 * - 4xx ≠ 429: falha dura imediata (bling_indisponivel).
 * - Esgotou as tentativas: bling_erro_<status> (ou bling_indisponivel em erro de rede).
 */
async function fetchBling(url: string, token: string): Promise<Response> {
  let ultimaFalha = 'bling_indisponivel';
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch {
      ultimaFalha = 'bling_indisponivel';
      if (tentativa < MAX_TENTATIVAS) {
        await sleep(BASE_DELAY_MS * 2 ** (tentativa - 1));
      }
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      ultimaFalha = `bling_erro_${res.status}`;
      if (tentativa < MAX_TENTATIVAS) {
        const retryAfter = Number(res.headers.get('retry-after'));
        const delay =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, MAX_RETRY_AFTER_MS)
            : BASE_DELAY_MS * 2 ** (tentativa - 1);
        await sleep(delay);
      }
      continue;
    }
    if (!res.ok) {
      throw new Error('bling_indisponivel');
    }
    return res;
  }
  throw new Error(ultimaFalha);
}
```

E substituir o corpo de `fetchOrders` por:

```ts
export async function fetchOrders(
  orgId: string,
  periodo: Periodo,
  onPage?: (pagina: RawOrder[]) => Promise<void>,
): Promise<RawOrder[]> {
  const token = await getValidAccessToken(orgId);
  const base = serverEnv.BLING_API_BASE;

  const allOrders: RawOrder[] = [];
  let page = 1;

  while (true) {
    const url = new URL(`${base}/pedidos/vendas`);
    url.searchParams.set('dataInicial', formatDate(periodo.inicio));
    url.searchParams.set('dataFinal', formatDate(periodo.fim));
    url.searchParams.set('pagina', String(page));
    url.searchParams.set('limite', String(PAGE_SIZE));

    const res = await fetchBling(url.toString(), token);

    let body: BlingListResponse;
    try {
      body = (await res.json()) as BlingListResponse;
    } catch {
      throw new Error('bling_indisponivel');
    }

    const pageData = body.data ?? [];
    if (pageData.length === 0) break;

    const mapeados = pageData.map(mapOrder);
    if (onPage) {
      // Persistência em lotes: entrega a página e NÃO acumula em RAM.
      await onPage(mapeados);
    } else {
      allOrders.push(...mapeados);
    }

    if (pageData.length < PAGE_SIZE) break;
    page++;
  }

  return allOrders;
}
```

Em `src/modules/pipeline/steps/collect-bling.ts`, substituir por:

```ts
import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { blingProvider } from '@/modules/providers/bling/provider';
import type { Periodo, RawOrder } from '@/modules/providers/types';

export type CollectResult = {
  processados: number;
  total: number;
};

/** Upsert idempotente de UMA página de pedidos (org_id, bling_order_id). */
async function upsertOrdersPage(orgId: string, rawOrders: RawOrder[]): Promise<number> {
  const validOrders = rawOrders.filter((o) => o.blingOrderId.trim() !== '');
  if (validOrders.length === 0) return 0;

  const values = validOrders.map((o) => ({
    org_id: orgId,
    bling_order_id: o.blingOrderId,
    canal: o.canal,
    data: o.data,
    valor_total: String(o.valorTotal),
    frete: String(o.frete),
    itens: o.itens,
  }));

  const result = await db
    .insert(orders)
    .values(values)
    .onConflictDoUpdate({
      target: [orders.org_id, orders.bling_order_id],
      set: {
        canal: sql`EXCLUDED.canal`,
        data: sql`EXCLUDED.data`,
        valor_total: sql`EXCLUDED.valor_total`,
        frete: sql`EXCLUDED.frete`,
        itens: sql`EXCLUDED.itens`,
      },
    })
    .returning({ id: orders.id });
  return result.length;
}

/**
 * Step 1: coleta pedidos do Bling página a página (lotes de 100) — nunca
 * acumula o período inteiro em RAM. Erro do Bling propaga (falha dura).
 */
export async function collectBlingOrders(
  orgId: string,
  periodo: Periodo,
): Promise<CollectResult> {
  let processados = 0;
  let total = 0;

  await blingProvider.fetchOrders(orgId, periodo, async (pagina) => {
    total += pagina.length;
    processados += await upsertOrdersPage(orgId, pagina);
  });

  return { processados, total };
}
```

- [ ] **Step 4: adaptar `tests/integration/collect-bling.test.ts`** — os mocks de `blingProvider.fetchOrders` precisam respeitar o novo contrato: quando o teste mocka com `vi.spyOn(blingProvider, 'fetchOrders')`, a implementação mock deve chamar `onPage(pedidos)` se fornecido (e retornar `[]`), por exemplo:

```ts
vi.spyOn(blingProvider, 'fetchOrders').mockImplementation(async (_orgId, _periodo, onPage) => {
  if (onPage) {
    await onPage(pedidosFake);
    return [];
  }
  return pedidosFake;
});
```

As asserções de idempotência/isolamento existentes permanecem.

- [ ] **Step 5: rodar e passar** — `npx vitest run tests/unit/bling-orders-retry.test.ts tests/integration/collect-bling.test.ts` verdes; `npm run test` + `npm run typecheck` verdes.
- [ ] **Step 6: commit** —

```bash
git add src/modules/providers/types.ts src/modules/providers/bling/orders.ts src/modules/pipeline/steps/collect-bling.ts tests/unit/bling-orders-retry.test.ts tests/integration/collect-bling.test.ts
git commit -m "feat(bling): backoff 429/5xx com Retry-After e persistência de pedidos em lotes por página"
```

---

### Task 9: Cripto versionada — payload `v1:<keyId>:<iv>:<tag>:<ct>` + `ENCRYPTION_KEYS`/`ENCRYPTION_KEY_ACTIVE` + retrocompat

**Files:**
- Modify: `src/modules/crypto/crypto.ts`, `src/lib/env.ts`, `.env.example`
- Test: `tests/unit/crypto.test.ts` (estender o existente; se não existir, criar)

**Interfaces:**
- Produces:
  - `encryptSecret(plaintext)`: com `ENCRYPTION_KEYS`+`ENCRYPTION_KEY_ACTIVE` configuradas → escreve `v1:<keyId>:<ivB64>:<tagB64>:<ctB64>`; sem elas → formato legado `iv.tag.ct` com `ENCRYPTION_KEY` (comportamento atual preservado).
  - `decryptSecret(payload)`: prefixo `v1:` → resolve a chave pelo `keyId` em `ENCRYPTION_KEYS`; sem prefixo → legado com `ENCRYPTION_KEY`. Qualquer falha → `Error('decrypt_failed')` (contrato atual).
  - `encryptionKeyIdOf(payload): string | null` — `keyId` de payloads v1, `null` p/ legado (consumido pelo script da Task 10).
  - Envs: `ENCRYPTION_KEYS?` (JSON `{ "<keyId>": "<base64 32 bytes>" }`, keyId `[a-z0-9_-]{1,16}`), `ENCRYPTION_KEY_ACTIVE?` (precisa existir em `ENCRYPTION_KEYS`), `ENCRYPTION_KEY` passa a **opcional** — mas o env schema exige pelo menos UMA das duas configurações.

- [ ] **Step 1: testes que falham** — adicionar a `tests/unit/crypto.test.ts` (novo `describe`; manter os casos legados existentes):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY_A = Buffer.alloc(32, 1).toString('base64');
const KEY_B = Buffer.alloc(32, 2).toString('base64');

// Mock mutável do env — cada teste configura o cenário.
const envMock: Record<string, unknown> = {};
vi.mock('@/lib/env', () => ({ serverEnv: envMock }));

describe('crypto versionada (v1)', () => {
  beforeEach(async () => {
    vi.resetModules();
    for (const k of Object.keys(envMock)) delete envMock[k];
  });

  it('com ENCRYPTION_KEYS ativa escreve v1:<keyId>: e decifra de volta', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A, k2: KEY_B };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k2';
    const { encryptSecret, decryptSecret, encryptionKeyIdOf } = await import(
      '@/modules/crypto/crypto'
    );
    const payload = encryptSecret('token-super-secreto');
    expect(payload.startsWith('v1:k2:')).toBe(true);
    expect(payload.split(':')).toHaveLength(5);
    expect(encryptionKeyIdOf(payload)).toBe('k2');
    expect(decryptSecret(payload)).toBe('token-super-secreto');
  });

  it('payload legado (iv.tag.ct) continua decifrável com ENCRYPTION_KEY', async () => {
    envMock.ENCRYPTION_KEY = KEY_A;
    const mod1 = await import('@/modules/crypto/crypto');
    const legado = mod1.encryptSecret('antigo'); // sem KEYS → formato legado
    expect(legado.includes(':')).toBe(false);
    expect(mod1.encryptionKeyIdOf(legado)).toBeNull();

    // Agora com versionamento ligado, o legado ainda decifra (retrocompat)
    envMock.ENCRYPTION_KEYS = { k1: KEY_B };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    vi.resetModules();
    const mod2 = await import('@/modules/crypto/crypto');
    expect(mod2.decryptSecret(legado)).toBe('antigo');
  });

  it('keyId desconhecido → decrypt_failed', async () => {
    envMock.ENCRYPTION_KEYS = { k1: KEY_A };
    envMock.ENCRYPTION_KEY_ACTIVE = 'k1';
    const { encryptSecret } = await import('@/modules/crypto/crypto');
    const payload = encryptSecret('x');
    envMock.ENCRYPTION_KEYS = { OUTRA: KEY_B };
    envMock.ENCRYPTION_KEY_ACTIVE = 'OUTRA';
    vi.resetModules();
    const { decryptSecret } = await import('@/modules/crypto/crypto');
    expect(() => decryptSecret(payload)).toThrow('decrypt_failed');
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/unit/crypto.test.ts` → falha (formato v1 e `encryptionKeyIdOf` não existem).
- [ ] **Step 3: env.** Em `src/lib/env.ts`, substituir a entrada `ENCRYPTION_KEY` e adicionar as novas + validação cruzada (o `.superRefine` vai no objeto, antes do `export type`):

```ts
const KEY_ID_RE = /^[a-z0-9_-]{1,16}$/;

const schema = z
  .object({
    // ... entradas existentes ...
    ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, {
        message: 'ENCRYPTION_KEY deve ser 32 bytes em base64',
      })
      .optional(),
    ENCRYPTION_KEYS: z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (!v) return undefined;
        let obj: Record<string, string>;
        try {
          obj = JSON.parse(v) as Record<string, string>;
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ENCRYPTION_KEYS deve ser JSON' });
          return z.NEVER;
        }
        for (const [keyId, b64] of Object.entries(obj)) {
          if (!KEY_ID_RE.test(keyId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `keyId inválido em ENCRYPTION_KEYS: ${keyId}`,
            });
            return z.NEVER;
          }
          if (Buffer.from(b64, 'base64').length !== 32) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `chave ${keyId} deve ser 32 bytes em base64`,
            });
            return z.NEVER;
          }
        }
        return obj;
      }),
    ENCRYPTION_KEY_ACTIVE: z.string().regex(KEY_ID_RE).optional(),
    // ... demais entradas ...
  })
  .superRefine((env, ctx) => {
    const temVersionada = Boolean(env.ENCRYPTION_KEYS && env.ENCRYPTION_KEY_ACTIVE);
    if (!temVersionada && !env.ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Configure ENCRYPTION_KEYS + ENCRYPTION_KEY_ACTIVE (ou ENCRYPTION_KEY legado)',
      });
    }
    if (env.ENCRYPTION_KEYS && env.ENCRYPTION_KEY_ACTIVE && !(env.ENCRYPTION_KEY_ACTIVE in env.ENCRYPTION_KEYS)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ENCRYPTION_KEY_ACTIVE não existe em ENCRYPTION_KEYS',
      });
    }
  });
```

Adicionar `ENCRYPTION_KEYS=` e `ENCRYPTION_KEY_ACTIVE=` (comentadas) ao `.env.example`. Atualizar `tests/unit/env.test.ts` se ele assumia `ENCRYPTION_KEY` obrigatória.

- [ ] **Step 4: crypto.** Substituir `src/modules/crypto/crypto.ts` por:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { serverEnv } from '@/lib/env';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const V1 = 'v1';

type KeyRing = { keys: Record<string, Buffer>; active: string };

function keyRing(): KeyRing | null {
  if (!serverEnv.ENCRYPTION_KEYS || !serverEnv.ENCRYPTION_KEY_ACTIVE) return null;
  const keys: Record<string, Buffer> = {};
  for (const [keyId, b64] of Object.entries(serverEnv.ENCRYPTION_KEYS)) {
    keys[keyId] = Buffer.from(b64, 'base64');
  }
  return { keys, active: serverEnv.ENCRYPTION_KEY_ACTIVE };
}

function legacyKey(): Buffer {
  if (!serverEnv.ENCRYPTION_KEY) throw new Error('encryption_key_ausente');
  return Buffer.from(serverEnv.ENCRYPTION_KEY, 'base64');
}

function cipherWith(key: Buffer, plaintext: string): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

function decipherWith(key: Buffer, ivB64: string, tagB64: string, ctB64: string): string {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}

/**
 * Cifra com a chave ATIVA do chaveiro (payload `v1:<keyId>:<iv>:<tag>:<ct>`).
 * Sem chaveiro configurado, mantém o formato legado `iv.tag.ct` com ENCRYPTION_KEY.
 */
export function encryptSecret(plaintext: string): string {
  const ring = keyRing();
  if (ring) {
    const { iv, tag, ct } = cipherWith(ring.keys[ring.active]!, plaintext);
    return [V1, ring.active, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
  }
  const { iv, tag, ct } = cipherWith(legacyKey(), plaintext);
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

/**
 * Decifra payloads v1 (resolve a chave pelo keyId) e legados (ENCRYPTION_KEY).
 * Qualquer falha → 'decrypt_failed' (contrato estável do chamador).
 */
export function decryptSecret(payload: string): string {
  try {
    if (payload.startsWith(`${V1}:`)) {
      const parts = payload.split(':');
      if (parts.length !== 5) throw new Error('formato');
      const [, keyId, ivB64, tagB64, ctB64] = parts;
      const key = keyRing()?.keys[keyId!];
      if (!key) throw new Error('chave_desconhecida');
      return decipherWith(key, ivB64!, tagB64!, ctB64!);
    }
    const parts = payload.split('.');
    if (parts.length !== 3) throw new Error('formato');
    return decipherWith(legacyKey(), parts[0]!, parts[1]!, parts[2]!);
  } catch {
    throw new Error('decrypt_failed');
  }
}

/** keyId de um payload v1; null para payloads legados (usado pelo reencrypt). */
export function encryptionKeyIdOf(payload: string): string | null {
  if (!payload.startsWith(`${V1}:`)) return null;
  return payload.split(':')[1] ?? null;
}
```

- [ ] **Step 5: rodar e passar** — `npx vitest run tests/unit/crypto.test.ts tests/unit/env.test.ts` verdes; `npm run test` + `npm run typecheck` verdes (o `.env.local` atual só tem `ENCRYPTION_KEY` → caminho legado segue funcionando; NENHUMA env de produção muda nesta task).
- [ ] **Step 6: commit** —

```bash
git add src/modules/crypto/crypto.ts src/lib/env.ts .env.example tests/unit/crypto.test.ts tests/unit/env.test.ts
git commit -m "feat(crypto): payload versionado v1:keyId:iv:tag:ct com chaveiro ENCRYPTION_KEYS e retrocompat legado"
```

---

### Task 10: Script `scripts/reencrypt-connections.ts`

**Files:**
- Create: `scripts/reencrypt-connections.ts`
- Modify: `package.json` (script `db:reencrypt`)
- Test: `tests/integration/reencrypt-connections.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret`/`encryptionKeyIdOf` (Task 9).
- Produces: `reencryptConnections(): Promise<{ total: number; atualizadas: number }>` (exportada para teste) + entrypoint CLI `npm run db:reencrypt`. Idempotente: linha já na chave ativa é pulada.

- [ ] **Step 1: teste que falha** — criar `tests/integration/reencrypt-connections.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it, vi } from 'vitest';

const KEY_A = Buffer.alloc(32, 7).toString('base64');
const KEY_B = Buffer.alloc(32, 9).toString('base64');

vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: {
      ...mod.serverEnv,
      ENCRYPTION_KEY: KEY_A, // chave legada ainda presente (retrocompat)
      ENCRYPTION_KEYS: { k1: KEY_A, k2: KEY_B },
      ENCRYPTION_KEY_ACTIVE: 'k2',
    },
  };
});

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';
import { decryptSecret, encryptionKeyIdOf } from '@/modules/crypto/crypto';
import { reencryptConnections } from '../../scripts/reencrypt-connections';

describe.skipIf(!process.env.DATABASE_URL_TEST)('reencrypt-connections', () => {
  let orgId: string;

  afterAll(async () => {
    if (orgId) {
      await db.delete(connections).where(eq(connections.org_id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
  });

  it('migra payload legado para v1:k2 e mantém o plaintext; 2ª rodada é no-op', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `t_re_${randomUUID().slice(0, 8)}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;

    // Payload LEGADO: cifrado com KEY_A no formato iv.tag.ct (gerado manualmente)
    const { createCipheriv, randomBytes } = await import('node:crypto');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(KEY_A, 'base64'), iv);
    const ct = Buffer.concat([cipher.update('token-legado', 'utf8'), cipher.final()]);
    const legado = [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join('.');

    await db.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: legado,
      refresh_token: legado,
      status: 'ok',
    });

    const r1 = await reencryptConnections();
    expect(r1.atualizadas).toBeGreaterThanOrEqual(1);

    const [row] = await db
      .select({ access_token: connections.access_token })
      .from(connections)
      .where(eq(connections.org_id, orgId));
    expect(encryptionKeyIdOf(row.access_token!)).toBe('k2');
    expect(decryptSecret(row.access_token!)).toBe('token-legado');

    const r2 = await reencryptConnections();
    // nossa linha já está em k2 — não é re-atualizada
    const [row2] = await db
      .select({ access_token: connections.access_token })
      .from(connections)
      .where(eq(connections.org_id, orgId));
    expect(row2.access_token).toBe(row.access_token);
    expect(r2.total).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/integration/reencrypt-connections.test.ts` → "Cannot find module '../../scripts/reencrypt-connections'".
- [ ] **Step 3: implementar** — criar `scripts/reencrypt-connections.ts`:

```ts
/**
 * Re-encripta access_token/refresh_token de `connections` com a chave ATIVA
 * (ENCRYPTION_KEY_ACTIVE). Idempotente: payloads já na chave ativa são pulados.
 *
 * Uso (runbook de rotação, DEPOIS do versionamento em produção):
 *   npm run db:reencrypt
 */
import { eq } from 'drizzle-orm';

import { db } from '../src/db/client';
import { connections } from '../src/db/schema';
import { serverEnv } from '../src/lib/env';
import { decryptSecret, encryptSecret, encryptionKeyIdOf } from '../src/modules/crypto/crypto';

export async function reencryptConnections(): Promise<{ total: number; atualizadas: number }> {
  const ativa = serverEnv.ENCRYPTION_KEY_ACTIVE;
  if (!serverEnv.ENCRYPTION_KEYS || !ativa) {
    throw new Error('Configure ENCRYPTION_KEYS e ENCRYPTION_KEY_ACTIVE antes de reencriptar.');
  }

  const rows = await db
    .select({
      id: connections.id,
      access_token: connections.access_token,
      refresh_token: connections.refresh_token,
    })
    .from(connections);

  let atualizadas = 0;
  for (const row of rows) {
    const set: { access_token?: string; refresh_token?: string } = {};
    if (row.access_token && encryptionKeyIdOf(row.access_token) !== ativa) {
      set.access_token = encryptSecret(decryptSecret(row.access_token));
    }
    if (row.refresh_token && encryptionKeyIdOf(row.refresh_token) !== ativa) {
      set.refresh_token = encryptSecret(decryptSecret(row.refresh_token));
    }
    if (Object.keys(set).length === 0) continue;
    await db.update(connections).set(set).where(eq(connections.id, row.id));
    atualizadas++;
  }

  const resultado = { total: rows.length, atualizadas };
  console.log(JSON.stringify({ msg: 'reencrypt concluído', ...resultado }));
  return resultado;
}

// Entrypoint CLI (não roda quando importado pelos testes)
if (process.argv[1]?.includes('reencrypt-connections')) {
  reencryptConnections()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
```

Em `package.json`, ao lado de `db:seed-admin`:

```json
    "db:reencrypt": "node --env-file=.env.local --import tsx scripts/reencrypt-connections.ts"
```

- [ ] **Step 4: rodar e passar** — `npx vitest run tests/integration/reencrypt-connections.test.ts` verde; `npm run test` + `npm run typecheck` verdes.
- [ ] **Step 5: commit** —

```bash
git add scripts/reencrypt-connections.ts package.json tests/integration/reencrypt-connections.test.ts
git commit -m "feat(crypto): script db:reencrypt para migrar tokens de conexão à chave ativa"
```

---

### Task 11: Runbook de rotação de TODOS os segredos (operacional — sem código de app)

**Files:**
- Create: `docs/runbooks/rotacao-segredos.md`

Esta task NÃO tem código nem testes — é um checklist operacional versionado. Conteúdo integral do arquivo:

- [ ] **Step 1: criar `docs/runbooks/rotacao-segredos.md`** com este conteúdo:

```markdown
# Runbook — Rotação de segredos (Truth Analytics)

> Contexto: auditoria 2026-07-03 (achado C4): `.env.local` com credenciais vivas,
> mesma senha Neon em prod e test, `ANTHROPIC_API_KEY` ativa.
> **ORDEM OBRIGATÓRIA: a cripto versionada (F0 Tasks 9–10) precisa estar EM PRODUÇÃO
> (deploy verificado) ANTES de rotacionar a ENCRYPTION_KEY — senão todos os tokens
> Bling em repouso viram `decrypt_failed`.**

## 0. Pré-checagens
- [ ] Deploy atual de produção contém as Tasks 9–10 da F0 (checar no painel Vercel que o commit da F0 está em Production).
- [ ] Acesso: Vercel CLI logada (`vercel whoami`), console Neon, console Anthropic, Resend, SerpAPI, portal de dev do Bling.
- [ ] Janela de baixa atividade (a troca de AUTH_SECRET derruba sessões ativas).

## 1. ENCRYPTION_KEY → chaveiro versionado (PRIMEIRO)
1. Gerar a chave nova:
   `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`
2. Montar o chaveiro mantendo a chave ATUAL como `k1` (para decifrar o legado) e a nova como `k2`:
   `ENCRYPTION_KEYS={"k1":"<valor atual de ENCRYPTION_KEY>","k2":"<chave nova>"}`
   `ENCRYPTION_KEY_ACTIVE=k2`
3. Subir na Vercel (production):
   `vercel env add ENCRYPTION_KEYS production`
   `vercel env add ENCRYPTION_KEY_ACTIVE production`
   (manter `ENCRYPTION_KEY` por enquanto — retrocompat de leitura)
4. Atualizar o `.env.local` com as mesmas 2 envs novas.
5. Redeploy: `vercel redeploy` (ou push) e smoke: login + página Conexões mostra Bling conectado.
6. Re-encriptar os tokens em repouso (roda contra o banco de PRODUÇÃO do `.env.local`):
   `npm run db:reencrypt`
   Saída esperada: `{"msg":"reencrypt concluído","total":N,"atualizadas":N}`.
7. Verificar que não restou payload legado (deve retornar 0):
   `node -e "const p=require('postgres');const fs=require('fs');const u=fs.readFileSync('.env.local','utf8').match(/^POSTGRES_URL=(.*)$/m)[1];const sql=p(u,{prepare:false});(async()=>{try{const r=await sql\`select count(*)::int n from connections where access_token is not null and access_token not like 'v1:%'\`;console.log('legados:',r[0].n);}finally{await sql.end();}})()"`
8. Smoke final: gerar um relatório real (usa getValidAccessToken → decrypt v1).
9. Remover a env legada: `vercel env rm ENCRYPTION_KEY production` e apagar do `.env.local`.
   Manter `k1` no chaveiro por 30 dias (rollback), depois removê-la do JSON.

## 2. Senhas Neon — separadas por ambiente
1. Console Neon → branch `main` → Roles → Reset password. Copiar a connection string nova
   (pooled e direct).
2. Atualizar na Vercel: `vercel env rm POSTGRES_URL production && vercel env add POSTGRES_URL production`
   (idem `POSTGRES_URL_DIRECT`). Atualizar `.env.local`.
3. Console Neon → branch `test` → Roles → Reset password (senha DIFERENTE da main).
   Atualizar `DATABASE_URL_TEST` e `DATABASE_URL_TEST_DIRECT` no `.env.local`.
4. Redeploy + smoke (login) + `npm run test` local (valida o branch test).

## 3. ANTHROPIC_API_KEY
1. Console Anthropic → criar API key nova.
2. `vercel env rm ANTHROPIC_API_KEY production && vercel env add ANTHROPIC_API_KEY production`; atualizar `.env.local`.
3. Redeploy + gerar 1 relatório de smoke.
4. Revogar a key antiga no console Anthropic (SÓ depois do smoke).

## 4. AUTH_SECRET
1. Gerar: `openssl rand -base64 32`.
2. `vercel env rm AUTH_SECRET production && vercel env add AUTH_SECRET production`; atualizar `.env.local`.
3. Redeploy. Efeito: TODAS as sessões caem (relogin) — combinar com os admins.

## 5. Demais chaves (mesmo padrão rm/add + redeploy + smoke)
- `RESEND_API_KEY` (console Resend; smoke = e-mail de relatório pronto).
- `SERPAPI_KEY` (painel SerpAPI; smoke = relatório com benchmark completo).
- `BLING_CLIENT_SECRET` (portal de dev Bling — regenerar o secret do app; smoke = reconectar OAuth de um cliente de teste). Atenção: NÃO invalide o app em si, só o secret.

## 6. Segredos NOVOS da F0 (criar se ainda não existem)
- `PIPELINE_SECRET`: `openssl rand -hex 32` → `vercel env add PIPELINE_SECRET production` + `.env.local`.
- `CRON_SECRET`: `openssl rand -hex 32` → `vercel env add CRON_SECRET production` + `.env.local`.
  (A Vercel usa `CRON_SECRET` automaticamente como Bearer nos crons de `vercel.json`.)
- Opcional: `SENTRY_DSN` (projeto Sentry) — sem ela o logger opera em no-op.

## 7. Encerramento
- [ ] `vercel env ls production` confere com a lista esperada (sem ENCRYPTION_KEY legada).
- [ ] Smoke completo: login, conexões, gerar relatório, e-mail recebido.
- [ ] Registrar a data da rotação e a próxima (sugestão: 6 meses) neste arquivo.

| Data | O que foi rotacionado | Por quem |
|---|---|---|
| _preencher_ | | |
```

- [ ] **Step 2: commit** —

```bash
git add docs/runbooks/rotacao-segredos.md
git commit -m "docs(runbook): rotação de segredos com versionamento de chave antes da ENCRYPTION_KEY"
```

---

### Task 12: Rate-limit genérico por escopo (signup) + Zod no `signInAction`

**Files:**
- Modify: `src/modules/auth/rate-limit.ts`, `src/actions/auth.actions.ts`
- Test: `tests/unit/auth-actions-zod.test.ts`, `tests/integration/rate-limit-signup.test.ts`

**Interfaces:**
- Consumes: `login_attempts.escopo` (Task 1).
- Produces:
  - `recordAttempt(input: { escopo: 'login' | 'signup' | 'reset'; email: string; ip: string | null; success: boolean }): Promise<void>`
  - `isSignupRateLimited(ip: string | null): Promise<boolean>` — ≥5 cadastros do mesmo IP em 60 min.
  - `isResetRateLimited(email: string, ip: string | null): Promise<boolean>` — ≥3 pedidos por e-mail OU ≥10 por IP em 15 min (consumida pela Task 13).
  - `recordLoginAttempt`/`isLoginRateLimited` preservados (delegam com `escopo: 'login'`).

- [ ] **Step 1: testes que falham.** Criar `tests/unit/auth-actions-zod.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('@/modules/auth/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock('@/modules/auth/rate-limit', () => ({
  isLoginRateLimited: vi.fn().mockResolvedValue(false),
  recordLoginAttempt: vi.fn(),
  recordAttempt: vi.fn(),
  isSignupRateLimited: vi.fn().mockResolvedValue(false),
  isResetRateLimited: vi.fn().mockResolvedValue(false),
}));
vi.mock('@/modules/auth/user.repository', () => ({
  createOrgWithUser: vi.fn(),
  normalizeEmail: (e: string) => e.trim().toLowerCase(),
}));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit: vi.fn() }));

import { signIn } from '@/modules/auth/auth';
import { signInAction } from '@/actions/auth.actions';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe('signInAction com Zod', () => {
  it('e-mail inválido → erro sem chamar signIn', async () => {
    const res = await signInAction({}, form({ email: 'nao-eh-email', senha: 'x'.repeat(8) }));
    expect(res.error).toBe('E-mail inválido.');
    expect(signIn).not.toHaveBeenCalled();
  });

  it('senha vazia → erro sem chamar signIn', async () => {
    const res = await signInAction({}, form({ email: 'a@b.com', senha: '' }));
    expect(res.error).toBe('Informe a senha.');
    expect(signIn).not.toHaveBeenCalled();
  });
});
```

E `tests/integration/rate-limit-signup.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { loginAttempts } from '@/db/schema';
import { isSignupRateLimited, recordAttempt } from '@/modules/auth/rate-limit';

describe.skipIf(!process.env.DATABASE_URL_TEST)('rate-limit de signup', () => {
  const ip = `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
  const emails: string[] = [];

  afterAll(async () => {
    for (const email of emails) {
      await db.delete(loginAttempts).where(eq(loginAttempts.email, email));
    }
  });

  it('5 cadastros do mesmo IP em 1h → limitado; escopo login não interfere', async () => {
    expect(await isSignupRateLimited(ip)).toBe(false);
    for (let i = 0; i < 5; i++) {
      const email = `t_su_${randomUUID().slice(0, 8)}@teste.dev`;
      emails.push(email);
      await recordAttempt({ escopo: 'signup', email, ip, success: true });
    }
    expect(await isSignupRateLimited(ip)).toBe(true);

    // tentativas de LOGIN no mesmo IP não contam para signup
    const emailLogin = `t_su_${randomUUID().slice(0, 8)}@teste.dev`;
    emails.push(emailLogin);
    await recordAttempt({ escopo: 'login', email: emailLogin, ip, success: false });
    expect(await isSignupRateLimited(ip)).toBe(true); // continua 5, não 6 — e o inverso também não vaza
  });

  it('IP null nunca é limitado (fail-open explícito)', async () => {
    expect(await isSignupRateLimited(null)).toBe(false);
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/unit/auth-actions-zod.test.ts tests/integration/rate-limit-signup.test.ts` → exports inexistentes.
- [ ] **Step 3: implementar rate-limit.** Substituir `src/modules/auth/rate-limit.ts` por:

```ts
import { and, eq, gte, isNull, or, sql as dsql } from 'drizzle-orm';

import { db } from '@/db/client';
import { loginAttempts } from '@/db/schema';
import { normalizeEmail } from '@/modules/auth/user.repository';

const MAX_FAILURES = 5;
const MAX_FAILURES_PER_EMAIL = 20;
const WINDOW_MINUTES = 15;

const SIGNUP_MAX_PER_IP = 5;
const SIGNUP_WINDOW_MINUTES = 60;

const RESET_MAX_PER_EMAIL = 3;
const RESET_MAX_PER_IP = 10;
const RESET_WINDOW_MINUTES = 15;

export type EscopoRateLimit = 'login' | 'signup' | 'reset';

export async function recordAttempt(input: {
  escopo: EscopoRateLimit;
  email: string;
  ip: string | null;
  success: boolean;
}): Promise<void> {
  await db.insert(loginAttempts).values({
    escopo: input.escopo,
    email: normalizeEmail(input.email),
    ip: input.ip,
    success: input.success,
  });
}

type CountFilter = {
  escopo: EscopoRateLimit;
  email?: string;
  ip?: string;
  apenasFalhas: boolean;
  windowMinutes: number;
};

async function countRecent(filter: CountFilter): Promise<number> {
  const since = new Date(Date.now() - filter.windowMinutes * 60_000);
  const conds = [
    eq(loginAttempts.escopo, filter.escopo),
    gte(loginAttempts.created_at, since),
  ];
  if (filter.email !== undefined) conds.push(eq(loginAttempts.email, normalizeEmail(filter.email)));
  if (filter.ip !== undefined) conds.push(eq(loginAttempts.ip, filter.ip));
  if (filter.apenasFalhas) conds.push(eq(loginAttempts.success, false));

  const [row] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(...conds));
  return row?.n ?? 0;
}

// --- LOGIN (comportamento existente preservado) ---

export async function recordLoginAttempt(input: {
  email: string;
  ip: string | null;
  success: boolean;
}): Promise<void> {
  await recordAttempt({ escopo: 'login', ...input });
}

export async function isLoginRateLimited(
  email: string,
  ip: string | null,
): Promise<boolean> {
  if (ip) {
    const perIp = await countRecent({
      escopo: 'login', email, ip, apenasFalhas: true, windowMinutes: WINDOW_MINUTES,
    });
    if (perIp >= MAX_FAILURES) return true;
  }
  // Defesa contra rotação de X-Forwarded-For: contador por e-mail (todos os IPs).
  const perEmail = await countRecent({
    escopo: 'login', email, apenasFalhas: true, windowMinutes: WINDOW_MINUTES,
  });
  return perEmail >= MAX_FAILURES_PER_EMAIL;
}

// --- SIGNUP ---

export async function isSignupRateLimited(ip: string | null): Promise<boolean> {
  if (!ip) return false; // fail-open explícito: sem IP não há chave de contagem
  const n = await countRecent({
    escopo: 'signup', ip, apenasFalhas: false, windowMinutes: SIGNUP_WINDOW_MINUTES,
  });
  return n >= SIGNUP_MAX_PER_IP;
}

// --- RESET DE SENHA (consumido pela Task 13) ---

export async function isResetRateLimited(
  email: string,
  ip: string | null,
): Promise<boolean> {
  const perEmail = await countRecent({
    escopo: 'reset', email, apenasFalhas: false, windowMinutes: RESET_WINDOW_MINUTES,
  });
  if (perEmail >= RESET_MAX_PER_EMAIL) return true;
  if (!ip) return false;
  const perIp = await countRecent({
    escopo: 'reset', ip, apenasFalhas: false, windowMinutes: RESET_WINDOW_MINUTES,
  });
  return perIp >= RESET_MAX_PER_IP;
}
```

(Nota: `isNull`/`or` só ficam no import se usados — remova imports mortos para o lint passar.)

- [ ] **Step 4: implementar as actions.** Em `src/actions/auth.actions.ts`: adicionar o schema e o parse no `signInAction`, e o rate-limit no `signUpAction`:

```ts
const signInSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
});
```

No começo do `signInAction` (substituindo os `String(formData.get(...))` diretos):

```ts
  const parsed = signInSchema.safeParse({
    email: formData.get('email'),
    senha: formData.get('senha'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const { email, senha } = parsed.data;
```

No `signUpAction`, após o parse do `signUpSchema` e antes de `createOrgWithUser`:

```ts
  const forwarded = headers().get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : null;
  if (await isSignupRateLimited(ip)) {
    return { error: 'Muitos cadastros recentes. Tente novamente em alguns minutos.' };
  }
```

E após o `recordAudit` do cadastro bem-sucedido:

```ts
  await recordAttempt({ escopo: 'signup', email: parsed.data.email, ip, success: true });
```

(Imports: `recordAttempt`, `isSignupRateLimited` de `@/modules/auth/rate-limit`.)

- [ ] **Step 5: rodar e passar** — `npx vitest run tests/unit/auth-actions-zod.test.ts tests/integration/rate-limit-signup.test.ts` verdes; `npm run test` + `npm run typecheck` verdes (testes existentes de rate-limit de login continuam passando — API preservada).
- [ ] **Step 6: commit** —

```bash
git add src/modules/auth/rate-limit.ts src/actions/auth.actions.ts tests/unit/auth-actions-zod.test.ts tests/integration/rate-limit-signup.test.ts
git commit -m "feat(auth): rate-limit por escopo (signup 5/h por IP) e validação Zod no signInAction"
```

---

### Task 13: Esqueci-senha completo — repositório de tokens, actions, rotas e e-mail (anti-enumeração)

**Files:**
- Create: `src/modules/auth/password-reset.repository.ts`, `src/actions/password-reset.actions.ts`, `src/app/(auth)/esqueci-senha/page.tsx`, `src/app/(auth)/redefinir-senha/[token]/page.tsx`, `src/app/(auth)/redefinir-senha/[token]/reset-form.tsx`
- Modify: `src/modules/notifications/templates.ts`, `src/modules/notifications/email.ts`, `src/app/(auth)/sign-in/page.tsx` (link "Esqueci minha senha")
- Test: `tests/integration/password-reset.test.ts`

**Interfaces:**
- Consumes: tabela `password_reset_tokens` (Task 1), `isResetRateLimited`/`recordAttempt` (Task 12), `sendEmail` (existente), `hashPassword` (existente).
- Produces:
  - `createPasswordResetToken(email: string): Promise<string | null>` — token em claro (64 hex) p/ o link; `null` se o e-mail não existe (o chamador responde IGUAL nos dois casos — anti-enumeração). Persiste só o sha256; expira em 1h.
  - `consumeResetToken(token: string, novaSenha: string): Promise<boolean>` — single-use atômico (marca `usado_em` + troca `senha_hash` na mesma transação); `false` se inválido/expirado/usado.
  - `requestPasswordResetAction` / `resetPasswordAction` (`useFormState`).
  - `sendPasswordResetEmail(to: string, token: string): Promise<void>` — link `${APP_URL}/redefinir-senha/${token}`; nunca lança.
  - Rotas: `/esqueci-senha` e `/redefinir-senha/[token]`.

- [ ] **Step 1: teste que falha** — criar `tests/integration/password-reset.test.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, passwordResetTokens, users } from '@/db/schema';
import { verifyPassword } from '@/modules/auth/password';
import {
  consumeResetToken,
  createPasswordResetToken,
} from '@/modules/auth/password-reset.repository';

describe.skipIf(!process.env.DATABASE_URL_TEST)('password reset', () => {
  let orgId: string;
  let userId: string;
  const email = `t_pr_${randomUUID().slice(0, 8)}@teste.dev`;

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `t_pr_${randomUUID().slice(0, 8)}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;
    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email, senha_hash: 'antigo-hash', role: 'client' })
      .returning({ id: users.id });
    userId = user.id;
  });

  afterAll(async () => {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, userId));
    await db.delete(users).where(eq(users.id, userId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('e-mail inexistente → null (anti-enumeração no chamador)', async () => {
    expect(await createPasswordResetToken('nao_existe@teste.dev')).toBeNull();
  });

  it('cria token (64 hex), consome uma única vez e troca a senha', async () => {
    const token = await createPasswordResetToken(email);
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // token em claro NÃO está no banco
    const linhas = await db
      .select({ token_hash: passwordResetTokens.token_hash })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.user_id, userId));
    expect(linhas.some((l) => l.token_hash === token)).toBe(false);

    expect(await consumeResetToken(token!, 'senha-nova-12345')).toBe(true);

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    expect(await verifyPassword('senha-nova-12345', user.senha_hash)).toBe(true);

    // single-use: segunda tentativa falha
    expect(await consumeResetToken(token!, 'outra-senha-999')).toBe(false);
  });

  it('token expirado é rejeitado', async () => {
    const token = await createPasswordResetToken(email);
    const { createHash } = await import('node:crypto');
    const hash = createHash('sha256').update(token!).digest('hex');
    await db
      .update(passwordResetTokens)
      .set({ expira_em: new Date(Date.now() - 60_000) })
      .where(eq(passwordResetTokens.token_hash, hash));
    expect(await consumeResetToken(token!, 'senha-nova-12345')).toBe(false);
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/integration/password-reset.test.ts` → "Cannot find module".
- [ ] **Step 3: repositório** — criar `src/modules/auth/password-reset.repository.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { passwordResetTokens, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import { getUserByEmail } from '@/modules/auth/user.repository';

const EXPIRACAO_MINUTOS = 60;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Cria um token de reset (64 hex) para o e-mail, se existir usuário.
 * Persiste APENAS o sha256 (vazamento do banco não vaza o link).
 * Retorna null quando o e-mail não existe — o chamador DEVE responder
 * exatamente igual nos dois casos (anti-enumeração).
 */
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await getUserByEmail(email);
  if (!user) return null;

  const token = randomBytes(32).toString('hex');
  await db.insert(passwordResetTokens).values({
    user_id: user.id,
    token_hash: hashToken(token),
    expira_em: new Date(Date.now() + EXPIRACAO_MINUTOS * 60_000),
  });
  return token;
}

/**
 * Consome o token (single-use) e troca a senha ATOMICAMENTE:
 * o UPDATE de usado_em com filtro `usado_em IS NULL` é a barreira contra corrida —
 * se outra requisição consumiu primeiro, retorna false sem trocar a senha.
 */
export async function consumeResetToken(token: string, novaSenha: string): Promise<boolean> {
  const agora = new Date();
  const [valido] = await db
    .select({ id: passwordResetTokens.id, userId: passwordResetTokens.user_id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token_hash, hashToken(token)),
        gt(passwordResetTokens.expira_em, agora),
        isNull(passwordResetTokens.usado_em),
      ),
    )
    .limit(1);
  if (!valido) return false;

  const senha_hash = await hashPassword(novaSenha);

  return db.transaction(async (tx) => {
    const marcado = await tx
      .update(passwordResetTokens)
      .set({ usado_em: agora })
      .where(and(eq(passwordResetTokens.id, valido.id), isNull(passwordResetTokens.usado_em)))
      .returning({ id: passwordResetTokens.id });
    if (marcado.length === 0) return false;

    await tx.update(users).set({ senha_hash }).where(eq(users.id, valido.userId));
    return true;
  });
}
```

- [ ] **Step 4: e-mail.** Em `src/modules/notifications/templates.ts`, adicionar:

```ts
/**
 * Template: redefinição de senha (link expira em 1h; single-use).
 */
export function passwordResetTemplate(link: string): EmailContent {
  const subject = 'Redefinição de senha — Truth Analytics';
  const text = [
    'Recebemos um pedido para redefinir a senha da sua conta no Truth Analytics.',
    '',
    `Para criar uma nova senha, acesse: ${link}`,
    '',
    'O link expira em 1 hora e só pode ser usado uma vez.',
    'Se você não pediu a redefinição, ignore este e-mail — sua senha permanece a mesma.',
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Recebemos um pedido para redefinir a senha da sua conta no <strong>Truth Analytics</strong>.</p>
<p><a href="${link}">Clique aqui para criar uma nova senha</a></p>
<p>O link expira em <strong>1 hora</strong> e só pode ser usado uma vez.</p>
<p>Se você não pediu a redefinição, ignore este e-mail — sua senha permanece a mesma.</p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;
  return { subject, html, text };
}
```

Em `src/modules/notifications/email.ts`, adicionar (importando o template):

```ts
/**
 * Envia o link de redefinição de senha. Nunca lança.
 */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${serverEnv.APP_URL}/redefinir-senha/${token}`;
  const content = passwordResetTemplate(link);
  await sendEmail({ to, ...content });
}
```

- [ ] **Step 5: actions** — criar `src/actions/password-reset.actions.ts`:

```ts
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { recordAttempt, isResetRateLimited } from '@/modules/auth/rate-limit';
import {
  consumeResetToken,
  createPasswordResetToken,
} from '@/modules/auth/password-reset.repository';
import { sendPasswordResetEmail } from '@/modules/notifications/email';

export type ResetRequestState = { error?: string; ok?: boolean };
export type ResetState = { error?: string };

const requestSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
});

/**
 * Pede o link de redefinição. ANTI-ENUMERAÇÃO: a resposta é SEMPRE ok:true
 * (com conta, sem conta ou rate-limited) — nunca revela se o e-mail existe.
 */
export async function requestPasswordResetAction(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = requestSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const forwarded = headers().get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : null;

  if (await isRateLimitedSilencioso(parsed.data.email, ip)) {
    return { ok: true }; // mesma resposta — não vaza o rate-limit
  }

  await recordAttempt({ escopo: 'reset', email: parsed.data.email, ip, success: true });
  const token = await createPasswordResetToken(parsed.data.email);
  if (token) {
    await sendPasswordResetEmail(parsed.data.email, token);
  }
  return { ok: true };
}

async function isRateLimitedSilencioso(email: string, ip: string | null): Promise<boolean> {
  return isResetRateLimited(email, ip);
}

const resetSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'Link inválido.'),
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
});

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = resetSchema.safeParse({
    token: formData.get('token'),
    senha: formData.get('senha'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const ok = await consumeResetToken(parsed.data.token, parsed.data.senha);
  if (!ok) {
    return { error: 'Link inválido ou expirado. Solicite um novo.' };
  }

  redirect('/sign-in?senha_redefinida=1');
}
```

- [ ] **Step 6: páginas** — criar `src/app/(auth)/esqueci-senha/page.tsx` (espelha o layout do `sign-in`):

```tsx
'use client';

import { useFormState } from 'react-dom';

import {
  requestPasswordResetAction,
  type ResetRequestState,
} from '@/actions/password-reset.actions';
import { Logo } from '@/components/ui/Logo';
import { Card, CardContent } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const initial: ResetRequestState = {};

export default function EsqueciSenhaPage() {
  const [state, action] = useFormState(requestPasswordResetAction, initial);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo withMark size="lg" />
        <p className="text-sm text-muted">Recupere o acesso à sua conta.</p>
      </div>

      <Card>
        <CardContent>
          <h1 className="mb-6 font-heading text-lg font-semibold text-white">Esqueci minha senha</h1>
          {state.ok ? (
            <p className="rounded-lg bg-brand/10 border border-brand/30 px-3 py-2 text-sm text-brand" data-testid="reset-solicitado">
              Se existir uma conta com este e-mail, enviamos as instruções de redefinição.
            </p>
          ) : (
            <form action={action} className="flex flex-col gap-4">
              <Field label="E-mail" htmlFor="email">
                <Input id="email" name="email" type="email" placeholder="voce@empresa.com" autoComplete="email" />
              </Field>
              {state.error ? (
                <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400">
                  {state.error}
                </p>
              ) : null}
              <Button type="submit" variant="primary" className="mt-2 w-full justify-center" data-testid="reset-request-button">
                Enviar instruções
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted">
            Lembrou a senha?{' '}
            <a href="/sign-in" className="text-brand hover:underline">
              Entrar
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
```

Criar `src/app/(auth)/redefinir-senha/[token]/page.tsx`:

```tsx
import { ResetForm } from './reset-form';

export default function RedefinirSenhaPage({ params }: { params: { token: string } }) {
  return <ResetForm token={params.token} />;
}
```

Criar `src/app/(auth)/redefinir-senha/[token]/reset-form.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import { resetPasswordAction, type ResetState } from '@/actions/password-reset.actions';
import { Logo } from '@/components/ui/Logo';
import { Card, CardContent } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

const initial: ResetState = {};

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useFormState(resetPasswordAction, initial);

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3">
        <Logo withMark size="lg" />
        <p className="text-sm text-muted">Defina sua nova senha.</p>
      </div>

      <Card>
        <CardContent>
          <h1 className="mb-6 font-heading text-lg font-semibold text-white">Redefinir senha</h1>
          <form action={action} className="flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <Field label="Nova senha" htmlFor="senha">
              <Input id="senha" name="senha" type="password" placeholder="••••••••" autoComplete="new-password" />
            </Field>
            {state.error ? (
              <p className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-sm text-red-400" data-testid="reset-erro">
                {state.error}
              </p>
            ) : null}
            <Button type="submit" variant="primary" className="mt-2 w-full justify-center" data-testid="reset-submit-button">
              Salvar nova senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

Em `src/app/(auth)/sign-in/page.tsx`, adicionar o link logo abaixo do botão Entrar (dentro do CardContent, antes do parágrafo "Não tem conta?"):

```tsx
          <p className="mt-3 text-center text-sm">
            <a href="/esqueci-senha" className="text-muted hover:text-brand hover:underline" data-testid="esqueci-senha-link">
              Esqueci minha senha
            </a>
          </p>
```

O middleware já trata o grupo `(auth)` como público? **Verificar**: se a matriz de rotas públicas é uma lista explícita (ex.: `/sign-in`, `/sign-up`), adicionar `/esqueci-senha` e `/redefinir-senha` a ela — sem isso o redirect de não-autenticado bloqueia as páginas novas.

- [ ] **Step 7: rodar e passar** — `npx vitest run tests/integration/password-reset.test.ts` verde; `npm run test` + `npm run typecheck` + `npm run build` verdes. Smoke manual: `npm run dev`, abrir `/esqueci-senha`, pedir reset de um e-mail existente (com Resend em no-op o token aparece via log estruturado? NÃO — o token não é logado; para smoke local, pegar o link da tabela `password_reset_tokens` é inviável por ser hash. Validar o fluxo com `RESEND_API_KEY` configurada OU pelo teste de integração, que cobre o ciclo completo).
- [ ] **Step 8: commit** —

```bash
git add src/modules/auth/password-reset.repository.ts src/actions/password-reset.actions.ts "src/app/(auth)/esqueci-senha" "src/app/(auth)/redefinir-senha" "src/app/(auth)/sign-in/page.tsx" src/modules/notifications/templates.ts src/modules/notifications/email.ts tests/integration/password-reset.test.ts
git commit -m "feat(auth): fluxo esqueci-senha completo com token sha256 single-use e anti-enumeração"
```

---

### Task 14: IA — prompt caching (`cache_control`) + retry de correção curto

**Files:**
- Modify: `src/modules/pipeline/steps/analyze-ia.ts`, `tests/unit/analyze-ia.test.ts`

**Interfaces:**
- Consumes: `logger` (Task 3), `AnaliseIaSchema` (existente).
- Produces: `analyzeWithIA(metricas, nicho)` — mesma assinatura/contrato de erro (`analise_ia_invalida`). Mudanças internas:
  - `system` vira **array de blocos** com `cache_control: { type: 'ephemeral' }` no bloco (metodologia estável → cache hit em toda geração e no retry).
  - Bloco `user` das métricas também marcado com `cache_control` — o retry reaproveita o prefixo inteiro (system + métricas) do cache e paga só o delta.
  - Retry de correção CURTO: o turno final envia **apenas o erro de validação truncado (500 chars) + a instrução de corrigir**, nunca re-anexa as métricas no texto da correção.
  - O motivo real da falha vai para o logger (`parseError`), mantendo o código de erro estável p/ a UI.

- [ ] **Step 1: testes que falham** — em `tests/unit/analyze-ia.test.ts` (Anthropic já mockado no arquivo), adicionar/ajustar asserções sobre o request:

```ts
it('usa cache_control no system e no bloco de métricas', async () => {
  mockCreateRetornandoJsonValido();
  await analyzeWithIA(metricasFixture, 'moda');
  const params = mockCreate.mock.calls[0]![0];

  // system como array de blocos com cache_control ephemeral
  expect(Array.isArray(params.system)).toBe(true);
  expect(params.system[0].type).toBe('text');
  expect(params.system[0].cache_control).toEqual({ type: 'ephemeral' });

  // 1º turno user: bloco de texto com métricas + cache_control
  const user = params.messages[0];
  expect(user.role).toBe('user');
  expect(user.content[0].cache_control).toEqual({ type: 'ephemeral' });
  expect(user.content[0].text).toContain('Métricas do período');
});

it('retry envia correção curta: só o erro + instrução, sem repetir as métricas', async () => {
  mockCreatePrimeiraInvalidaSegundaValida();
  await analyzeWithIA(metricasFixture, 'moda');
  const paramsRetry = mockCreate.mock.calls[1]![0];
  const turnos = paramsRetry.messages;

  expect(turnos).toHaveLength(3); // user(métricas, cacheada) + assistant(inválida) + user(correção)
  const correcao = turnos[2];
  expect(correcao.role).toBe('user');
  const textoCorrecao =
    typeof correcao.content === 'string' ? correcao.content : correcao.content[0].text;
  expect(textoCorrecao).not.toContain('Métricas do período'); // NÃO repete as métricas
  expect(textoCorrecao).toContain('JSON válido');
  expect(textoCorrecao.length).toBeLessThan(700); // erro truncado a 500 + instrução
});
```

(Adaptar os helpers `mockCreate*` ao padrão de mock já usado no arquivo — o mock existente de `getAnthropic`/SDK permanece.)

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/unit/analyze-ia.test.ts` → falha (system é string; retry atual re-envia userText).
- [ ] **Step 3: implementar.** Em `analyze-ia.ts`:

1. Substituir a montagem de `messages`/`callParams` por:

```ts
  const userBlock = {
    type: 'text' as const,
    text: userText,
    cache_control: { type: 'ephemeral' as const },
  };
  const messages: MessageParam[] = [{ role: 'user', content: [userBlock] }];

  const callParams = {
    model: serverEnv.ANALYSIS_MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' as const },
    output_config: {
      effort: 'high' as const,
      format: {
        type: 'json_schema' as const,
        schema: ANALISE_JSON_SCHEMA,
      },
    },
    // Bloco system estável marcado p/ prompt caching: toda geração (e o retry)
    // reaproveita o prefixo — reduz custo/latência da chamada Opus.
    system: [
      {
        type: 'text' as const,
        text: system,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages,
  };
```

2. Substituir a montagem do retry por (correção curta; erro truncado):

```ts
  const erroCurto = (parseError ?? 'resposta sem bloco de texto').slice(0, 500);
  logger.warn('análise IA: primeira tentativa inválida, re-tentando', { parseError: erroCurto });

  const correcao = `A resposta anterior falhou na validação do schema: ${erroCurto}. Responda APENAS com o objeto JSON válido conforme o schema, sem texto adicional.`;

  const retryMessages: MessageParam[] =
    text1 !== null
      ? [
          { role: 'user', content: [userBlock] }, // prefixo cacheado — não paga de novo
          { role: 'assistant', content: text1 },
          { role: 'user', content: correcao },
        ]
      : [
          { role: 'user', content: [userBlock] },
          { role: 'user', content: correcao },
        ];
```

3. No fracasso final, logar o motivo real antes de lançar o código estável:

```ts
  logger.error('análise IA inválida após retry', { parseError: erroCurto });
  throw new Error('analise_ia_invalida');
```

(Import: `logger` de `@/lib/logger`. O `console.warn` desta função já foi trocado na Task 3 — aqui ele é substituído pela versão com `erroCurto`.)

- [ ] **Step 4: rodar e passar** — `npx vitest run tests/unit/analyze-ia.test.ts` verde; `npm run test` + `npm run typecheck` verdes.
- [ ] **Step 5: commit** —

```bash
git add src/modules/pipeline/steps/analyze-ia.ts tests/unit/analyze-ia.test.ts
git commit -m "feat(ia): prompt caching no system/métricas e retry de correção curto no analyze-ia"
```

---

### Task 15: Headers de segurança no `next.config.mjs`

**Files:**
- Modify: `next.config.mjs`
- Test: `tests/unit/next-config-headers.test.ts`

**Interfaces:**
- Produces: headers globais (`/:path*`): CSP restritiva (com `'unsafe-eval'` APENAS em dev — exigência do runtime do `next dev`), HSTS, `frame-ancestors 'none'` (substitui X-Frame-Options), `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `poweredByHeader: false`.

- [ ] **Step 1: teste que falha** — criar `tests/unit/next-config-headers.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

// @ts-expect-error — módulo .mjs sem tipos
import nextConfig from '../../next.config.mjs';

describe('headers de segurança', () => {
  it('poweredByHeader desligado', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it('headers globais incluem CSP, HSTS, nosniff, referrer e permissions', async () => {
    const grupos = await nextConfig.headers();
    const global = grupos.find((g: { source: string }) => g.source === '/:path*');
    expect(global).toBeDefined();
    const mapa = Object.fromEntries(
      global.headers.map((h: { key: string; value: string }) => [h.key, h.value]),
    );
    expect(mapa['Content-Security-Policy']).toContain("default-src 'self'");
    expect(mapa['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(mapa['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(mapa['X-Content-Type-Options']).toBe('nosniff');
    expect(mapa['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(mapa['Permissions-Policy']).toContain('camera=()');
  });
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/unit/next-config-headers.test.ts` → config vazia.
- [ ] **Step 3: implementar** — substituir `next.config.mjs` por:

```js
const isDev = process.env.NODE_ENV === 'development';

// 'unsafe-eval' só em dev (react-refresh do next dev exige); produção fica restrita.
// 'unsafe-inline' em script/style é o piso prático do Next 14 sem nonces (App Router
// injeta inline scripts de hidratação); endurecer com nonce fica para quando o Next
// do repo suportar CSP por nonce sem custo de manutenção.
const csp = [
  "default-src 'self'",
  isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 4: rodar e passar** — `npx vitest run tests/unit/next-config-headers.test.ts` verde; `npm run build` verde; `npm run test:e2e` verde (CSP não pode quebrar login/dashboard — se algum asset for bloqueado, ajustar a diretiva específica, NUNCA remover `frame-ancestors`/`nosniff`).
- [ ] **Step 5: commit** —

```bash
git add next.config.mjs tests/unit/next-config-headers.test.ts
git commit -m "feat(seguranca): CSP, HSTS, nosniff, referrer-policy e poweredByHeader off no next.config"
```

---

### Task 16: Upgrade next-auth para o beta mais recente da v5

**Files:**
- Modify: `package.json`, `package-lock.json`; revalidar `src/modules/auth/auth.ts`, `src/modules/auth/auth-config.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts`
- Test: suite existente (unit + integration + E2E de auth) — sem teste novo; o critério é a suite inteira verde no beta novo.

**Interfaces:**
- Consumes: `NextAuth({...})` atual (Credentials + JWT callbacks) — contrato preservado.
- Produces: `next-auth@5.0.0-beta.<mais recente>` instalado; dependência transitiva `cookie` ≥ 0.7.1 (fecha o CVE-2024-47764).

- [ ] **Step 1: instalar** — `npm install next-auth@beta`. Conferir a resolução:

```bash
npm ls next-auth cookie
```

Esperado: `next-auth@5.0.0-beta.29` (ou mais novo) e NENHUM `cookie@0.6.x` na árvore do next-auth.

- [ ] **Step 2: revalidar os pontos de integração** (checklist objetivo — deltas conhecidos entre beta.4 e os betas recentes):
  - `src/modules/auth/auth.ts`: assinatura `Credentials({ credentials, authorize })` — `authorize` deve continuar retornando `{ id, email } | null`; se o typecheck acusar `User` sem `id`, tipar o retorno como `{ id: string; email: string }` (o campo é aceito).
  - `src/modules/auth/auth-config.ts`: garantir `trustHost: true` no objeto de config (betas recentes exigem host confiável fora da Vercel — em produção a env `AUTH_TRUST_HOST`/deploy Vercel já cobre; `trustHost: true` mantém o `npm run dev` e o Playwright funcionando).
  - `src/middleware.ts`: se usa `auth` exportado do config edge, confirmar que o import continua válido.
  - `src/app/api/auth/[...nextauth]/route.ts`: `export const { GET, POST } = handlers` continua o padrão.
- [ ] **Step 3: verificação completa** — comandos e resultado esperado:

```bash
npm run typecheck   # zero erros
npm run test        # 100% verde
npm run build       # build ok
npm run test:e2e    # E2E verdes (login/logout/gating são o smoke real do upgrade)
```

Qualquer quebra de API deve ser corrigida NESTA task (o diff esperado é pequeno: tipos do `authorize`/`trustHost`). Se o beta mais recente tiver breaking change estrutural não listada acima, fixar no beta mais novo que passe a suite e registrar a versão no commit.

- [ ] **Step 4: commit** —

```bash
git add package.json package-lock.json src/modules/auth src/middleware.ts
git commit -m "chore(auth): next-auth atualizado para o beta recente da v5 (corrige cookie CVE-2024-47764)"
```

---

### Task 17: `listReports` com colunas de summary + `limit 50` — e verificação final integral da F0

**Files:**
- Modify: `src/modules/reports/report.repository.ts`
- Test: `tests/integration/report-repository.test.ts` (estender/criar)

**Interfaces:**
- Produces: `listReports(orgId): Promise<ReportSummary[]>` — SELECT apenas `id, status, periodo_inicio, periodo_fim, created_at` (sem os jsonb `metricas`/`analise_ia`), `ORDER BY created_at DESC`, `LIMIT 50`. `getLatestReport` também passa a selecionar só as colunas de summary. `getReportById` (detalhe) permanece com SELECT completo.

- [ ] **Step 1: teste que falha** — em `tests/integration/report-repository.test.ts`, adicionar:

```ts
it('listReports limita a 50 e não carrega jsonb', async () => {
  const periodo = { periodo_inicio: new Date('2026-06-01'), periodo_fim: new Date('2026-07-01') };
  // 55 reports done (status done não conflita com o lock parcial)
  await db.insert(reports).values(
    Array.from({ length: 55 }, () => ({
      org_id: orgId,
      status: 'done',
      metricas: { pesado: 'x'.repeat(1000) },
      ...periodo,
    })),
  );
  const lista = await listReports(orgId);
  expect(lista).toHaveLength(50);
  // summary não expõe métricas — shape estrito
  expect(Object.keys(lista[0]!).sort()).toEqual(
    ['createdAt', 'id', 'periodoFim', 'periodoInicio', 'status'].sort(),
  );
});
```

- [ ] **Step 2: rodar e ver falhar** — `npx vitest run tests/integration/report-repository.test.ts` → 55 linhas retornadas.
- [ ] **Step 3: implementar** — em `report.repository.ts`, substituir `listReports` e `getLatestReport`:

```ts
const summaryColumns = {
  id: reports.id,
  status: reports.status,
  periodo_inicio: reports.periodo_inicio,
  periodo_fim: reports.periodo_fim,
  created_at: reports.created_at,
};

type SummaryRow = {
  id: string;
  status: string;
  periodo_inicio: Date;
  periodo_fim: Date;
  created_at: Date;
};

function summaryRowToSummary(row: SummaryRow): ReportSummary {
  return {
    id: row.id,
    status: row.status as ReportStatus,
    periodoInicio: row.periodo_inicio,
    periodoFim: row.periodo_fim,
    createdAt: row.created_at,
  };
}

const LIST_LIMIT = 50;

export async function listReports(orgId: string): Promise<ReportSummary[]> {
  const rows = await db
    .select(summaryColumns)
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at))
    .limit(LIST_LIMIT);
  return rows.map(summaryRowToSummary);
}

export async function getLatestReport(orgId: string): Promise<ReportSummary | null> {
  const [row] = await db
    .select(summaryColumns)
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at))
    .limit(1);
  return row ? summaryRowToSummary(row) : null;
}
```

(`rowToSummary`/`rowToDetail` originais permanecem para `getReportById`.)

- [ ] **Step 4: rodar e passar** — `npx vitest run tests/integration/report-repository.test.ts` verde.
- [ ] **Step 5: VERIFICAÇÃO FINAL INTEGRAL DA F0** — tudo verde, na ordem:

```bash
npm run test        # 188+ testes (novos inclusos)
npm run typecheck
npm run lint
npm run build
npm run test:e2e    # 10 E2E preservados (testids intactos)
```

E o guard de MAIN limpo (nenhum teste vazou para produção — contagens iguais às de antes da F0):

```bash
node -e "const p=require('postgres');const fs=require('fs');const u=fs.readFileSync('.env.local','utf8').match(/^POSTGRES_URL=(.*)$/m)[1];const sql=p(u,{prepare:false});(async()=>{try{for(const t of ['orders','market_snapshots','reports','password_reset_tokens']){const r=await sql.unsafe('select count(*)::int n from '+t);console.log('MAIN',t,r[0].n);}}finally{await sql.end();}})()"
```

- [ ] **Step 6: commit final** —

```bash
git add src/modules/reports/report.repository.ts tests/integration/report-repository.test.ts
git commit -m "feat(reports): listReports com colunas de summary e limit 50"
```

---

## Deploy da F0 (pós-merge — checklist operacional)

1. Merge `--no-ff` em `master` (após revisão ampla Opus, padrão do roadmap).
2. Vercel envs de produção ANTES do deploy: `PIPELINE_SECRET`, `CRON_SECRET` (`vercel env add ... production`).
3. Deploy; conferir no painel que o cron `/api/cron/watchdog` aparece registrado (Settings → Cron Jobs) e que `/api/pipeline/run` tem `maxDuration 300`.
4. Smoke em produção: login → gerar relatório → ver status `queued/running` via `GET /api/reports/<id>/status` → `done` + e-mail.
5. Executar o runbook `docs/runbooks/rotacao-segredos.md` (Task 11) — a rotação de `ENCRYPTION_KEY` SÓ depois deste deploy verificado.

## Self-Review

**Cobertura do escopo F0 (roadmap §Decisões TRAVADAS) → task:** report queued + POST `/api/pipeline/run` + `waitUntil` + `maxDuration 300` + `PIPELINE_SECRET` (Task 4) ✅; coluna `reports.etapa` (Tasks 1+4) ✅; `GET /api/reports/[id]/status` (Task 5) ✅; lock por índice único parcial (Tasks 1+4) ✅; watchdog cron + `CRON_SECRET` (Task 6) ✅; paralelização collect-market com p-limit próprio (6) + bulk insert + remoção do `bruto` (Task 7) ✅; pool postgres serverless (Task 2) ✅; backoff 429 Bling + persistência em lotes (Task 8) ✅; cripto versionada `v1:keyId:iv:tag:ct` + `ENCRYPTION_KEYS`/`ENCRYPTION_KEY_ACTIVE` + retrocompat + script reencrypt (Tasks 9–10) ✅; runbook de rotação com ordem "versionamento antes da chave" (Task 11 + Deploy §5) ✅; esqueci-senha (tabela Task 1 + fluxo Task 13, 2 rotas + e-mail + anti-enumeração) ✅; prompt caching + retry curto na IA (Task 14) ✅; headers de segurança (Task 15) ✅; índices + CHECKs (Task 1) ✅; logger estruturado + Sentry no-op (Task 3) ✅; upgrade next-auth (Task 16) ✅; rate-limit no signup + Zod no signInAction (Task 12) ✅; listReports summary + limit 50 (Task 17) ✅.

**Placeholders:** nenhum TBD/TODO/"implementar depois"; todos os steps de código mostram o código completo. As duas exceções deliberadas são tasks de natureza não-código: Task 11 (runbook operacional — conteúdo integral fornecido) e Task 16 (upgrade de dependência — checklist objetivo de deltas + verificação por suite completa).

**Consistência de nomes (verificada contra o Ledger):** `reports.etapa` e seus 4 valores idênticos em Task 1 (CHECK), Task 4 (orquestrador), Task 5 (endpoint) e F1 (contrato); header `x-pipeline-secret` idêntico em dispatch/rota/testes; `reports_org_ativo_uq` idêntico em schema/`createQueuedReport`/testes; `PIPELINE_SECRET`/`CRON_SECRET`/`ENCRYPTION_KEYS`/`ENCRYPTION_KEY_ACTIVE`/`SENTRY_DSN`/`DB_POOL_MAX` idênticos em env schema/rotas/runbook; `MarketResult { precos }`/`SnapshotDados` consistentes entre Task 7 e `compute-metrics`; `escopo` (`login|signup|reset`) idêntico em Task 1 (CHECK), Task 12 (rate-limit) e Task 13 (reset); `generateReport(reportId)` consumido por rota (Task 4), testes e watchdog-flow; `createQueuedReport` consumido por action e testes de integração.

**Riscos residuais assumidos (com mitigação no plano):** `waitUntil`+300s dependem do plano Vercel (pré-requisito + fallback watchdog); criação do índice parcial em produção precedida de UPDATE de limpeza (Task 1 Step 4); CSP com `'unsafe-inline'` é o piso do Next 14 sem nonce (comentário no código, endurecimento futuro); beta do next-auth pode exigir ajuste pequeno de tipos (checklist na Task 16).
