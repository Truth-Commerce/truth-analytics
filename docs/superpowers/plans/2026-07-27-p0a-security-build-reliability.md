# P0A Security and Build Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the known critical/high production dependency vulnerabilities and make local/CI validation deterministic before the Truth Analytics portfolio grows.

**Architecture:** Keep the existing Auth.js credentials/JWT architecture and modular monolith. Upgrade in compatibility-preserving increments: first hermetic tests and direct security patches, then async request contracts, Next 15/React 19, and finally Next 16/proxy/ESLint CLI. Every dependency checkpoint must leave build, unit tests, authorization tests, and audit results reviewable.

**Tech Stack:** Next.js App Router, React, Auth.js/next-auth, Drizzle ORM, PostgreSQL, TypeScript, Vitest, Playwright, GitHub Actions, Vercel.

## Global Constraints

- Faturamento bruto remains the value of valid orders before commission, freight, taxes, and costs; this plan does not change financial calculations.
- Keep the application as a modular monolith; do not introduce microservices.
- Keep Auth.js credentials/JWT authentication; do not migrate to Clerk, Auth0, or another identity provider in P0A.
- Preserve authoritative database revalidation in `requireAdmin`, `requireAnalista`, and `requireActiveOrg`; the JWT is only an edge routing snapshot.
- Preserve organization isolation and existing impersonation mutation guards.
- Target Node.js `>=20.9.0`; the verified local runtime is Node.js `22.19.0`.
- Target `next@16.2.12`, `react@19.2.8`, `react-dom@19.2.8`, `next-auth@5.0.0-beta.32`, and `drizzle-orm@0.45.2`.
- Use `eslint@9.39.5` with `eslint-config-next@16.2.12`; Next.js 16 does not provide `next lint`.
- Do not access production PostgreSQL from tests. Integration/E2E tests run only with `DATABASE_URL_TEST`.
- Do not deploy between the Next 15 checkpoint and the completed Next 16 acceptance checkpoint.

---

## Scope Boundaries

This is the first independently executable P0 subsystem plan. It owns dependency security, framework compatibility, test bootstrapping, and CI validation.

Separate implementation plans will own:

- P0B: analyst client context and the broken comparative page;
- P0C: dashboard/mobile/alerts/stock/360 scalability;
- P0D: valid gross revenue, order status, cancellations, and sync cursors;
- P0E: job history, freshness SLOs, backup, restore, and production smoke monitoring.

## File Responsibility Map

- `tests/setup.ts`: creates a deterministic, non-production unit-test environment before application modules load.
- `tests/unit/test-environment.test.ts`: proves the test bootstrap cannot inherit the production DB or secrets.
- `tests/unit/auth-callbacks.test.ts`: locks fail-closed edge authorization behavior across the Auth.js patch.
- `package.json` / `package-lock.json`: pin dependency and script migrations.
- `src/actions/*.ts`, `src/modules/auth/require-active-org.ts`, and Bling routes: migrate `headers()`/`cookies()` to async request APIs.
- App Router pages and report API routes listed in Task 4: migrate `params`/`searchParams` to promises.
- `src/proxy.ts`: replaces the Next.js 14 middleware convention while retaining the lightweight Auth.js edge config.
- `eslint.config.mjs`: replaces `.eslintrc.json` and `next lint`.
- `.github/workflows/ci.yml`: runs deterministic lint, typecheck, tests, build, audit, migration, and E2E validation.

### Task 1: Hermetic unit-test bootstrap

**Files:**
- Modify: `tests/setup.ts`
- Create: `tests/unit/test-environment.test.ts`

**Interfaces:**
- Consumes: Vitest `setupFiles` entry already configured in `vitest.config.ts`.
- Produces: deterministic `POSTGRES_URL`, `POSTGRES_URL_DIRECT`, `AUTH_SECRET`, and `ENCRYPTION_KEY` for unit tests; preserves `DATABASE_URL_TEST` for guarded integration tests.

- [ ] **Step 1: Write the failing bootstrap test**

Create `tests/unit/test-environment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('ambiente hermético de testes', () => {
  it('usa credenciais inertes sem DATABASE_URL_TEST', () => {
    if (process.env.DATABASE_URL_TEST) return;
    expect(process.env.POSTGRES_URL).toBe(
      'postgresql://unit:unit@127.0.0.1:5432/truth_analytics_unit',
    );
    expect(process.env.POSTGRES_URL_DIRECT).toBe(process.env.POSTGRES_URL);
    expect(process.env.AUTH_SECRET).toBe('truth-analytics-unit-test-secret');
    expect(process.env.ENCRYPTION_KEY).toBe(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    );
  });

  it('nunca deixa URL de produção no processo de teste', () => {
    expect(process.env.POSTGRES_URL).not.toMatch(/neon\.tech|vercel-storage|production|main/i);
  });
});
```

- [ ] **Step 2: Run the test and verify the current bootstrap fails**

Run:

```bash
npm test -- --run tests/unit/test-environment.test.ts
```

Expected: FAIL because the current setup leaves required values undefined or inherited from `.env.local` when `DATABASE_URL_TEST` is absent.

- [ ] **Step 3: Make `tests/setup.ts` deterministic**

Replace the environment-routing block after `config({ path: '.env.local' })` with:

```ts
const UNIT_DB_URL = 'postgresql://unit:unit@127.0.0.1:5432/truth_analytics_unit';
const UNIT_AUTH_SECRET = 'truth-analytics-unit-test-secret';
const UNIT_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

if (process.env.DATABASE_URL_TEST) {
  process.env.POSTGRES_URL = process.env.DATABASE_URL_TEST;
  process.env.POSTGRES_URL_DIRECT =
    process.env.DATABASE_URL_TEST_DIRECT ?? process.env.DATABASE_URL_TEST;
} else {
  process.env.POSTGRES_URL = UNIT_DB_URL;
  process.env.POSTGRES_URL_DIRECT = UNIT_DB_URL;
}

process.env.AUTH_SECRET = UNIT_AUTH_SECRET;
process.env.ENCRYPTION_KEY = UNIT_ENCRYPTION_KEY;
delete process.env.ENCRYPTION_KEYS;
delete process.env.ENCRYPTION_KEY_ACTIVE;
```

Keep the existing invariant comment, updating it to say that integration tests remain guarded by `describe.skipIf(!process.env.DATABASE_URL_TEST)` while unit tests use an unreachable local URL.

- [ ] **Step 4: Verify the bootstrap and full non-DB suite**

Run:

```bash
npm test -- --run tests/unit/test-environment.test.ts tests/unit/env.test.ts tests/unit/db-client-env.test.ts
npm test -- --run --reporter=dot
```

Expected: the targeted tests PASS; the full suite finishes without requiring shell-provided secrets, with DB-dependent tests skipped when `DATABASE_URL_TEST` is absent.

- [ ] **Step 5: Commit the hermetic bootstrap**

```bash
git add tests/setup.ts tests/unit/test-environment.test.ts
git commit -m "test: isolate unit environment from production"
```

### Task 2: Patch Auth.js and lock fail-closed authorization

**Files:**
- Modify: `tests/unit/auth-callbacks.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `authConfig.callbacks.authorized`, `next-auth@5.0.0-beta.31`.
- Produces: `next-auth@5.0.0-beta.32` / `@auth/core@0.41.3` and an explicit regression test that an auth object without a valid user never grants access.

- [ ] **Step 1: Add the fail-closed regression test**

Append inside `describe('authConfig.callbacks.authorized', ...)`:

```ts
  it('falha fechada quando Auth.js entrega objeto com erro sem usuário', () => {
    const result = authConfig.callbacks.authorized!({
      auth: { user: null, error: 'Configuration' } as never,
      request: { nextUrl: new URL('http://localhost/dashboard') } as never,
    });
    expect(result).toBe(false);
  });
```

- [ ] **Step 2: Verify the regression test against the current callback**

Run:

```bash
npm test -- --run tests/unit/auth-callbacks.test.ts
```

Expected: PASS. This is a characterization test proving the application callback is already fail-closed before changing the dependency.

- [ ] **Step 3: Capture the vulnerable dependency gate**

Run:

```bash
npm audit --omit=dev --audit-level=critical
```

Expected: FAIL and report `next-auth <=5.0.0-beta.31` / `@auth/core <=0.41.2` as critical.

- [ ] **Step 4: Install the patched Auth.js beta**

Run:

```bash
npm install --save-exact next-auth@5.0.0-beta.32
```

Expected lockfile: `next-auth@5.0.0-beta.32` resolves `@auth/core@0.41.3`.

- [ ] **Step 5: Verify auth behavior and audit removal**

Run:

```bash
npm test -- --run tests/unit/auth-callbacks.test.ts tests/unit/auth-actions-zod.test.ts tests/unit/account-actions.test.ts tests/unit/impersonation.test.ts
npm audit --omit=dev --audit-level=critical
```

Expected: tests PASS; no critical Auth.js advisory remains.

- [ ] **Step 6: Commit the Auth.js patch**

```bash
git add package.json package-lock.json tests/unit/auth-callbacks.test.ts
git commit -m "fix: patch Auth.js critical vulnerabilities"
```

### Task 3: Patch Drizzle ORM identifier escaping

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: schema/query code using `drizzle-orm@0.36.4` and migrations generated by `drizzle-kit@0.30.5`.
- Produces: `drizzle-orm@0.45.2` and `drizzle-kit@0.31.10` without schema or migration changes.

- [ ] **Step 1: Capture the high-severity audit failure**

Run:

```bash
npm audit --omit=dev --audit-level=high
```

Expected: FAIL and include `drizzle-orm <0.45.2` SQL identifier escaping advisory.

- [ ] **Step 2: Install the fixed ORM and matching migration tool**

Run:

```bash
npm install --save-exact drizzle-orm@0.45.2
npm install --save-dev --save-exact drizzle-kit@0.31.10
```

- [ ] **Step 3: Verify type compatibility without generating migrations**

Run:

```bash
npm run typecheck
npm test -- --run tests/unit/compute-metrics.test.ts tests/unit/alert-detectors.test.ts tests/unit/dashboard-model.test.ts
```

Expected: PASS. Do not run `db:generate`; this task changes no schema and must create no SQL migration.

- [ ] **Step 4: Verify guarded repository tests when a test database is configured**

Run:

```bash
npm test -- --run tests/integration/report-repository.test.ts tests/integration/task-repository.test.ts tests/integration/connection-repository.test.ts
```

Expected without `DATABASE_URL_TEST`: tests are SKIPPED. Expected in CI with `DATABASE_URL_TEST`: tests PASS against the disposable PostgreSQL service.

- [ ] **Step 5: Commit the Drizzle patch**

```bash
git add package.json package-lock.json
git commit -m "fix: patch Drizzle identifier escaping"
```

### Task 4: Migrate all request-time APIs to async contracts

**Files:**
- Modify: `src/actions/account.actions.ts`
- Modify: `src/actions/admin.actions.ts`
- Modify: `src/actions/auth.actions.ts`
- Modify: `src/actions/password-reset.actions.ts`
- Modify: `src/modules/auth/require-active-org.ts`
- Modify: `src/app/api/connections/bling/route.ts`
- Modify: `src/app/api/connections/bling/callback/route.ts`
- Modify: `src/app/api/reports/[id]/pdf/route.ts`
- Modify: `src/app/api/reports/[id]/status/route.ts`
- Modify: `src/app/admin/[orgId]/page.tsx`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/analista/[orgId]/page.tsx`
- Modify: `src/app/analista/[orgId]/tasks/[taskId]/page.tsx`
- Modify: `src/app/(auth)/redefinir-senha/[token]/page.tsx`
- Modify: `src/app/(client)/dashboard/notificacoes/page.tsx`
- Modify: `src/app/(client)/dashboard/plano-de-acao/[taskId]/page.tsx`
- Modify: `src/app/(client)/dashboard/relatorios/[id]/page.tsx`
- Modify: `src/app/(client)/dashboard/relatorios/comparar/page.tsx`
- Modify: `tests/unit/report-status-route.test.ts`

**Interfaces:**
- Consumes: synchronous Next.js 14 request APIs.
- Produces: Next.js 15/16-compatible promises for `headers`, `cookies`, `params`, and `searchParams` while still running under Next.js 14 during this commit.

- [ ] **Step 1: Run the official async request codemod**

Run:

```bash
npx @next/codemod@latest next-async-request-api src
```

Expected: mechanical edits in the listed request-time files. Do not commit generated `UnsafeUnwrapped*` casts or `@next-codemod-error` comments.

- [ ] **Step 2: Convert `headers()` and `cookies()` call sites explicitly**

Use these exact contracts in every async action/helper/route:

```ts
const forwarded = (await headers()).get('x-forwarded-for');
const cookieStore = await cookies();
const cookieValue = cookieStore.get(IMPERSONATION_COOKIE)?.value;
cookieStore.set(IMPERSONATION_COOKIE, valor, options);
cookieStore.delete(IMPERSONATION_COOKIE);
```

For the Bling state cookie, use one `const cookieStore = await cookies()` per request and call `get`, `set`, or `delete` on that store.

- [ ] **Step 3: Convert page props to promises**

Use this contract for server pages and metadata:

```ts
type PageProps = {
  params: Promise<{ orgId: string }>;
};

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const { orgId } = await props.params;
  // existing body using orgId
}

export default async function Page(props: PageProps) {
  const { orgId } = await props.params;
  // existing body using orgId
}
```

Apply the same pattern with `{ id }`, `{ taskId }`, `{ token }`, `{ orgId, taskId }`, and the existing search parameter shapes. Convert the reset-password page to `async` before awaiting `props.params`.

- [ ] **Step 4: Convert route handler contexts and direct unit calls**

Use:

```ts
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // existing body using id
}
```

Update direct route calls in `tests/unit/report-status-route.test.ts`:

```ts
const res = await GET(req, { params: Promise.resolve({ id: ID }) });
```

Use `Promise.resolve({ id: 'nao-uuid' })` in the invalid-ID case.

- [ ] **Step 5: Prove no synchronous request API remains**

Run:

```bash
rg -n 'headers\(\)\.|cookies\(\)\.' src tests
rg -n 'params\s*:\s*\{|searchParams\s*:\s*\{' src/app tests
rg -n "UnsafeUnwrapped|@next-codemod" src
```

Expected: no synchronous call, old page-prop contract, unsafe cast, or unresolved codemod marker is returned.

- [ ] **Step 6: Run compatibility tests under the current framework**

Run:

```bash
npm run typecheck
npm test -- --run tests/unit/report-status-route.test.ts tests/unit/auth-callbacks.test.ts tests/integration/password-reset-actions.test.ts tests/integration/tasks-actions-crm.test.ts
```

Expected: PASS or guarded DB tests SKIPPED; no Next.js request API type error.

- [ ] **Step 7: Commit async request compatibility**

```bash
git add src tests/unit/report-status-route.test.ts
git commit -m "refactor: adopt async Next request APIs"
```

### Task 5: Upgrade through Next.js 15 and React 19

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify if produced by Next build: `next-env.d.ts`
- Modify: all files reported by the Next 15 typecheck only when required by React 19 types.

**Interfaces:**
- Consumes: async request contracts from Task 4.
- Produces: a clean Next.js 15.5.21 / React 19.2.8 checkpoint before the Next.js 16 migration.

- [ ] **Step 1: Install the exact Next 15 checkpoint**

Run:

```bash
npm install --save-exact next@15.5.21 react@19.2.8 react-dom@19.2.8
npm install --save-dev --save-exact eslint-config-next@15.5.21 @types/react@19.2.17 @types/react-dom@19.2.3
```

- [ ] **Step 2: Verify the resolved dependency graph**

Run:

```bash
npm ls next react react-dom next-auth @auth/core drizzle-orm
```

Expected top-level versions: Next 15.5.21, React/React DOM 19.2.8, next-auth beta.32, @auth/core 0.41.3, Drizzle 0.45.2.

- [ ] **Step 3: Run the Next 15 checkpoint validation**

Run:

```bash
npm run lint
npm run typecheck
npm test -- --run --reporter=dot
npm run build
```

Expected: all commands PASS with the inert Vitest environment. `useFormState` deprecation does not block this checkpoint; migrating it to `useActionState` is a separate non-P0 refactor because React 19 retains compatibility.

- [ ] **Step 4: Commit the Next 15 checkpoint**

```bash
git add package.json package-lock.json next-env.d.ts src tests
git commit -m "chore: upgrade to Next 15 and React 19"
```

### Task 6: Upgrade to Next.js 16, proxy convention, and ESLint CLI

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `.eslintrc.json`
- Create: `eslint.config.mjs`
- Delete: `src/middleware.ts`
- Create: `src/proxy.ts`
- Create: `tests/unit/proxy-config.test.ts`
- Modify if produced by build: `next-env.d.ts`

**Interfaces:**
- Consumes: Next 15/React 19 checkpoint and `authConfig` lightweight edge authorization.
- Produces: Next 16.2.12, named Auth.js `proxy`, ESLint flat config, and a test locking the public API exclusion matcher.

- [ ] **Step 1: Write the proxy contract test before renaming middleware**

Create `tests/unit/proxy-config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { config, proxy } from '@/proxy';

describe('proxy de autenticação', () => {
  it('exporta handler e exclui APIs e arquivos estáticos do matcher', () => {
    expect(typeof proxy).toBe('function');
    expect(config.matcher).toEqual([
      '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm test -- --run tests/unit/proxy-config.test.ts
```

Expected: FAIL because `src/proxy.ts` does not exist.

- [ ] **Step 3: Replace middleware with the Auth.js proxy convention**

Delete `src/middleware.ts` and create `src/proxy.ts`:

```ts
import NextAuth from 'next-auth';

import { authConfig } from '@/modules/auth/auth-config';

export const { auth: proxy } = NextAuth(authConfig);

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

This follows the Auth.js Next.js 16 convention while retaining the provider-free edge configuration.

- [ ] **Step 4: Replace legacy ESLint configuration**

Delete `.eslintrc.json` and create `eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
  ]),
]);
```

Change the `lint` script in `package.json` from `next lint` to:

```json
"lint": "eslint ."
```

- [ ] **Step 5: Install the exact Next 16 toolchain**

Run:

```bash
npm install --save-exact next@16.2.12
npm install --save-dev --save-exact eslint@9.39.5 eslint-config-next@16.2.12 postcss@8.5.23
```

Add this top-level package override so Next's nested PostCSS resolution also receives the patched version:

```json
"overrides": {
  "postcss": "8.5.23"
}
```

Run `npm install` once more to update the lockfile after adding the override.

- [ ] **Step 6: Verify proxy, authorization, lint, types, and build**

Run:

```bash
npm test -- --run tests/unit/proxy-config.test.ts tests/unit/auth-callbacks.test.ts
npm run lint
npm run typecheck
npm run build
```

Expected: all commands PASS; no `middleware` deprecation, synchronous request API, or `next lint` error appears.

- [ ] **Step 7: Verify production dependency audit**

Run:

```bash
npm audit --omit=dev --audit-level=high
```

Expected: exit code 0 with zero critical/high production vulnerabilities. If npm still reports the patched top-level versions as vulnerable because the advisory database changed, stop this task and record the exact advisory; do not suppress or force-resolve it.

- [ ] **Step 8: Commit the Next 16 checkpoint**

```bash
git add package.json package-lock.json eslint.config.mjs src/proxy.ts tests/unit/proxy-config.test.ts next-env.d.ts
git rm .eslintrc.json src/middleware.ts
git commit -m "chore: upgrade runtime to Next 16"
```

### Task 7: Add deterministic CI with disposable PostgreSQL

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`
- Modify: `scripts/migrate-test.ts`

**Interfaces:**
- Consumes: hermetic tests, Next 16 toolchain, existing migrations, Playwright configuration.
- Produces: pull-request/push CI with a PostgreSQL 16 service and explicit audit/build/E2E gates.

- [ ] **Step 1: Make the test migration command CI-safe**

Change `package.json`:

```json
"db:migrate:test": "node --import tsx scripts/migrate-test.ts"
```

Add environment loading at the top of `scripts/migrate-test.ts`; dotenv does not override variables already provided by CI:

```ts
import { config } from 'dotenv';

config({ path: '.env.local' });
```

Keep the existing selection of `DATABASE_URL_TEST_DIRECT ?? DATABASE_URL_TEST`. Local developers receive `.env.local`; CI supplies the same variables directly.

- [ ] **Step 2: Create the CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [master]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: truth
          POSTGRES_PASSWORD: truth
          POSTGRES_DB: truth_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U truth -d truth_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    env:
      POSTGRES_URL: postgresql://truth:truth@127.0.0.1:5432/truth_test
      POSTGRES_URL_DIRECT: postgresql://truth:truth@127.0.0.1:5432/truth_test
      DATABASE_URL_TEST: postgresql://truth:truth@127.0.0.1:5432/truth_test
      DATABASE_URL_TEST_DIRECT: postgresql://truth:truth@127.0.0.1:5432/truth_test
      AUTH_SECRET: truth-analytics-ci-auth-secret
      APP_URL: http://localhost:3100
      ENCRYPTION_KEY: AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.19.0
          cache: npm
      - run: npm ci
      - run: npm audit --omit=dev --audit-level=high
      - run: npm run db:migrate:test
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test -- --run --reporter=dot
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```

- [ ] **Step 3: Validate the workflow command sequence locally**

Run without a test DB:

```bash
npm run lint
npm run typecheck
npm test -- --run --reporter=dot
npm run build
npm audit --omit=dev --audit-level=high
```

Expected: all non-DB commands PASS. Do not run `npm run test:e2e` locally without `DATABASE_URL_TEST`; Playwright must fail closed if that variable is absent.

- [ ] **Step 4: Commit CI**

```bash
git add .github/workflows/ci.yml package.json scripts/migrate-test.ts
git commit -m "ci: gate builds with disposable PostgreSQL"
```

### Task 8: End-to-end security acceptance checkpoint

**Files:**
- No file changes expected; this task verifies the committed outputs of Tasks 1–7.

**Interfaces:**
- Consumes: all outputs from Tasks 1–7.
- Produces: a single reviewable acceptance record in commit history; no deployment is performed by this task.

- [ ] **Step 1: Verify the exact installed versions**

Run:

```bash
npm ls next react react-dom next-auth @auth/core drizzle-orm postcss eslint eslint-config-next
```

Expected top-level versions: Next 16.2.12, React/React DOM 19.2.8, next-auth beta.32, @auth/core 0.41.3, Drizzle 0.45.2, PostCSS 8.5.23, ESLint 9.39.5, eslint-config-next 16.2.12.

- [ ] **Step 2: Run the complete local acceptance suite**

Run:

```bash
npm run lint
npm run typecheck
npm test -- --run --reporter=dot
npm run build
npm audit --omit=dev --audit-level=high
git diff --check
git status --short
```

Expected: lint/typecheck/tests/build/audit/diff check PASS. `git status --short` is empty after the task commits.

- [ ] **Step 3: Let GitHub CI run database and browser coverage**

Push the branch only after local acceptance. Expected GitHub `CI / verify`: migrations, all DB integration tests, and Playwright E2E PASS against the disposable PostgreSQL service.

- [ ] **Step 4: Perform post-deploy read-only smoke checks after a separately approved deployment**

Verify:

```text
/sign-in loads without console errors except no known tolerated errors
unauthenticated /dashboard redirects to /sign-in
analyst login reaches the authenticated shell
/analista loads the portfolio
/dashboard loads the selected current organization behavior unchanged
/api/auth/session returns a valid authenticated/unauthenticated shape
```

No alert, task, connection, report, or organization mutation is allowed during smoke validation.

## Self-Review Record

- Spec coverage: this plan covers P0 security dependencies, deterministic tests, framework migration, and CI. Analyst context, comparative behavior, visual scaling, revenue truth, and job observability are intentionally separated into P0B–P0E plans.
- Type consistency: all Next.js route/page params use `Promise<...>`; `src/proxy.ts` exports named `proxy`; CI uses the same environment variable names as `scripts/migrate-test.ts`, `playwright.config.ts`, and `src/lib/env.ts`.
- Official references consulted:
  - `https://nextjs.org/docs/app/guides/upgrading/version-15`
  - `https://nextjs.org/docs/app/guides/upgrading/version-16`
  - `https://nextjs.org/docs/app/guides/upgrading/codemods`
  - `https://authjs.dev/` (`export { auth as proxy }` convention)
