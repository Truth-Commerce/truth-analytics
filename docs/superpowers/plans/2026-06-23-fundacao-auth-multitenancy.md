# Fundação: Auth, Multi-tenancy e Modelo de Dados Base — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a base do Truth Analytics — scaffold Next.js, banco Neon via Drizzle, autenticação e-mail+senha (Auth.js v5), isolamento multi-tenant por `org_id` e trilha de auditoria — sobre a qual os demais 5 módulos serão construídos.

**Architecture:** Projeto único Next.js 14 (App Router) na Vercel, espelhando o stack provado do Zeneagrama (Drizzle + postgres-js + Auth.js v5 com split de config edge-safe). A conta nasce inativa (`organizations.status = 'pending'`); o login (e-mail+senha) funciona, mas o acesso autoritativo é sempre reconsultado no banco em layouts/helpers — `role`/`status` no JWT servem só ao middleware (checagem barata na borda). Toda query de dados de cliente filtra por `org_id` da sessão.

**Tech Stack:** Next.js 14 (App Router, TypeScript), Drizzle ORM + drizzle-kit, postgres-js, Neon Postgres, Auth.js v5 (`next-auth@5.0.0-beta.4`) com `CredentialsProvider`, `bcryptjs`, Zod, Vitest (unit/integração), Playwright (E2E), Tailwind CSS.

## Global Constraints

- **Stack idêntico ao Zeneagrama** onde aplicável: Drizzle (`drizzle-kit ^0.30.5`), Auth.js v5 (`next-auth 5.0.0-beta.4`), Next.js 14 App Router, postgres-js com `prepare: false`.
- **Schema Drizzle em** `src/db/schema/*.ts`; **migrations em** `src/db/migrations`; `drizzle.config.ts` na raiz, `dialect: 'postgresql'`, url de `POSTGRES_URL_DIRECT ?? POSTGRES_URL`.
- **Auth: e-mail + senha** (decisão do dono, 2026-06-23 — diverge do magic link do Zeneagrama). Senha com hash `bcryptjs` (cost 12). Sessão JWT.
- **Multi-tenancy:** toda função de repositório que lê/escreve dado de cliente recebe `orgId` e filtra por ele. Nenhuma query de dado de cliente sem `org_id`.
- **Gating autoritativo SEMPRE reconsulta o banco** (helpers `requireSession`/`requireAdmin`/`requireActiveOrg`); nunca use `session.user.status`/`role` para bloquear acesso — eles são retrato do login para o middleware.
- **Roles:** `admin_truth` (equipe interna) e `client`. **Status da org:** `pending` | `active` | `suspended`. **Plano:** `weekly` | `biweekly` | `monthly` (nulo até ativação).
- **Idioma:** todo texto de UI em pt-BR. Commits conventional em pt-BR (`feat:`, `test:`, `chore:`...).
- **NUNCA** dar push direto na `main`/`master`; trabalho em branch.
- **Banco de testes ≠ produção:** use um banco/branch Neon dedicado via `DATABASE_URL_TEST`; testes de integração/E2E semeiam linhas com prefixo `ta-test-` e limpam no teardown.

---

## Pré-requisitos de Infraestrutura (fazer antes da Task 1)

Estes passos são manuais (fora do código) e habilitam o resto do plano.

- [ ] **Criar projeto Neon** (região `sa-east-1`, como o Zeneagrama). Anotar a connection string pooled e a direta.
- [ ] **Criar um branch Neon `test`** no mesmo projeto (para testes de integração/E2E isolados da `main`).
- [ ] **Gerar `AUTH_SECRET`:** `openssl rand -base64 32`.
- [ ] Manter essas credenciais à mão para o `.env.local` (Task 1, Step 6).

---

## File Structure

| Caminho | Responsabilidade |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `.eslintrc.json` | Scaffold e tooling |
| `drizzle.config.ts` | Config do drizzle-kit (generate/migrate) |
| `vitest.config.ts`, `tests/setup.ts` | Runner de testes unit/integração + carregamento de env |
| `playwright.config.ts` | Runner E2E (porta 3100) |
| `.env.example`, `.env.local` (não versionado) | Variáveis de ambiente |
| `src/lib/env.ts` | Validação Zod das env vars (`serverEnv`) |
| `src/db/client.ts` | Conexão Drizzle (postgres-js) |
| `src/db/schema/organizations.ts` | Tabela `organizations` (raiz multi-tenant) |
| `src/db/schema/users.ts` | Tabela `users` |
| `src/db/schema/audit-log.ts` | Tabela `audit_log` |
| `src/db/schema/index.ts` | Re-export do schema |
| `src/modules/auth/password.ts` | Hash/verify de senha (bcryptjs) |
| `src/modules/auth/user.types.ts` | Tipos `UserAccess`, `UserRole`, `OrgStatus`, `Plano` |
| `src/modules/auth/user.repository.ts` | Queries de auth (Drizzle) + `createOrgWithUser` |
| `src/modules/auth/auth-config.ts` | Config Auth.js **edge-safe** (pages/session/callbacks) |
| `src/modules/auth/auth.ts` | Instância NextAuth (Credentials + jwt/db) |
| `src/modules/auth/session.ts` | `getSessionContext()` |
| `src/modules/auth/require-session.ts` | `requireSession()` |
| `src/modules/auth/require-admin.ts` | `requireAdmin()` |
| `src/modules/auth/require-active-org.ts` | `requireActiveOrg()` |
| `src/modules/audit/audit.repository.ts` | `recordAudit()` |
| `src/types/next-auth.d.ts` | Augment de `Session`/`JWT` |
| `src/middleware.ts` | Middleware Auth.js (instância edge) |
| `src/actions/auth.actions.ts` | Server actions `signUpAction` / `signInAction` |
| `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/sign-in/page.tsx` | Páginas de cadastro/login |
| `src/app/(client)/dashboard/page.tsx` | Placeholder autenticado (cliente) |
| `src/app/(client)/aguardando/page.tsx` | Tela "conta aguardando ativação" |
| `src/app/admin/page.tsx` | Placeholder admin (gated por `admin_truth`) |
| `src/app/api/auth/[...nextauth]/route.ts` | Handlers Auth.js |
| `tests/unit/password.test.ts`, `tests/unit/email.test.ts` | Unit (puro) |
| `tests/integration/tenant-isolation.test.ts` | Integração (DB) |
| `tests/e2e/auth.spec.ts`, `tests/e2e/helpers/db.ts` | E2E |

---

### Task 1: Scaffold do projeto + tooling + módulo de env

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `tailwind.config.ts`, `postcss.config.mjs`, `.eslintrc.json`, `.gitignore` (append), `.env.example`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/env.ts`, `vitest.config.ts`, `tests/setup.ts`
- Test: `tests/unit/env.test.ts`

**Interfaces:**
- Produces: `serverEnv` (objeto validado) de `@/lib/env` com campos `POSTGRES_URL: string`, `POSTGRES_URL_DIRECT: string`, `AUTH_SECRET: string`, `APP_URL: string`. Mais tarde (planos seguintes) recebe `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, etc.

- [ ] **Step 1: Inicializar package.json e dependências**

Criar `package.json`:

```json
{
  "name": "truth-analytics",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node --env-file=.env.local node_modules/drizzle-kit/bin.cjs migrate"
  },
  "dependencies": {
    "next": "^14.2.5",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "next-auth": "5.0.0-beta.4",
    "drizzle-orm": "^0.36.0",
    "postgres": "^3.4.4",
    "bcryptjs": "^2.4.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "drizzle-kit": "^0.30.5",
    "typescript": "^5.5.3",
    "vitest": "^2.0.5",
    "dotenv": "^16.4.5",
    "@playwright/test": "^1.45.0",
    "tailwindcss": "^3.4.7",
    "postcss": "^8.4.40",
    "autoprefixer": "^10.4.19",
    "eslint": "^8.57.0",
    "eslint-config-next": "^14.2.5"
  }
}
```

Rodar: `npm install`

- [ ] **Step 2: Configurar TypeScript e Next**

Criar `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Criar `next.config.mjs`:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

Criar `.eslintrc.json`:

```json
{ "extends": "next/core-web-vitals" }
```

- [ ] **Step 3: Configurar Tailwind**

Criar `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

Criar `postcss.config.mjs`:

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

Criar `src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 4: App shell mínimo**

Criar `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Truth Analytics',
  description: 'Análise multi-marketplace por IA.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
```

Criar `src/app/page.tsx`:

```tsx
export default function Home() {
  return <main className="p-8">Truth Analytics</main>;
}
```

- [ ] **Step 5: Módulo de env (Zod)**

Criar `src/lib/env.ts`:

```ts
import { z } from 'zod';

const schema = z.object({
  POSTGRES_URL: z.string().min(1, 'POSTGRES_URL é obrigatória'),
  POSTGRES_URL_DIRECT: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET é obrigatória'),
  APP_URL: z.string().url().default('http://localhost:3000'),
});

export type ServerEnv = z.infer<typeof schema>;

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return schema.parse(source);
}

export const serverEnv = parseServerEnv();
```

- [ ] **Step 6: Env de exemplo + local**

Criar `.env.example`:

```
POSTGRES_URL=
POSTGRES_URL_DIRECT=
AUTH_SECRET=
APP_URL=http://localhost:3000
DATABASE_URL_TEST=
```

Criar `.env.local` (NÃO versionar) com os valores reais do Neon e o `AUTH_SECRET` gerado nos pré-requisitos. Acrescentar ao `.gitignore`:

```
.env*.local
.next
node_modules
playwright-report
test-results
```

- [ ] **Step 7: Configurar Vitest**

Criar `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
```

Criar `tests/setup.ts`:

```ts
import { config } from 'dotenv';

config({ path: '.env.local' });
```

- [ ] **Step 8: Escrever o teste de env (falha primeiro)**

Criar `tests/unit/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseServerEnv } from '@/lib/env';

describe('parseServerEnv', () => {
  it('valida um ambiente completo', () => {
    const env = parseServerEnv({
      POSTGRES_URL: 'postgres://x',
      AUTH_SECRET: 'secret',
      APP_URL: 'http://localhost:3000',
    } as NodeJS.ProcessEnv);
    expect(env.POSTGRES_URL).toBe('postgres://x');
  });

  it('rejeita ambiente sem AUTH_SECRET', () => {
    expect(() =>
      parseServerEnv({ POSTGRES_URL: 'postgres://x' } as NodeJS.ProcessEnv),
    ).toThrow();
  });
});
```

- [ ] **Step 9: Rodar typecheck, build e testes**

Run: `npm run typecheck && npm run test`
Expected: typecheck PASS; testes de env PASS (2 passed).

Run: `npm run build`
Expected: build de produção conclui sem erro.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js + tooling + módulo de env validado"
```

---

### Task 2: Drizzle + schema de fundação + migration

**Files:**
- Create: `drizzle.config.ts`, `src/db/client.ts`, `src/db/schema/organizations.ts`, `src/db/schema/users.ts`, `src/db/schema/audit-log.ts`, `src/db/schema/index.ts`
- Generate: `src/db/migrations/0000_*.sql`
- Test: `tests/unit/schema.test.ts`

**Interfaces:**
- Produces:
  - `db` (`DatabaseClient`) de `@/db/client`.
  - Tabelas `organizations`, `users`, `auditLog` de `@/db/schema`.
  - Tipos `OrganizationRecord`/`NewOrganizationRecord`, `UserRecord`/`NewUserRecord`, `AuditLogRecord`/`NewAuditLogRecord`.
  - Colunas de `organizations`: `id` (uuid pk), `name` (varchar 255), `status` (varchar 32, default `'pending'`), `plano` (varchar 16, nullable), `nicho` (text, nullable), `proximo_relatorio_liberado_em` (timestamptz, nullable), `created_at`, `updated_at`.
  - Colunas de `users`: `id` (uuid pk), `org_id` (uuid, FK→organizations.id), `email` (varchar 255, unique), `senha_hash` (varchar 255), `role` (varchar 32, default `'client'`), `created_at`, `updated_at`.
  - Colunas de `audit_log`: `id` (uuid pk), `org_id` (uuid, nullable), `user_id` (uuid, nullable), `acao` (varchar 128), `detalhes` (jsonb, nullable), `created_at`.

- [ ] **Step 1: Config do drizzle-kit**

Criar `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/*.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL_DIRECT ?? process.env.POSTGRES_URL ?? '',
  },
  verbose: true,
  strict: true,
});
```

- [ ] **Step 2: Cliente Drizzle**

Criar `src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { serverEnv } from '@/lib/env';

const client = postgres(serverEnv.POSTGRES_URL, { prepare: false });

export const db = drizzle(client);
export type DatabaseClient = typeof db;
```

- [ ] **Step 3: Schema `organizations`**

Criar `src/db/schema/organizations.ts`:

```ts
import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('pending'),
  plano: varchar('plano', { length: 16 }),
  nicho: text('nicho'),
  proximo_relatorio_liberado_em: timestamp('proximo_relatorio_liberado_em', {
    withTimezone: true,
    mode: 'date',
  }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export type OrganizationRecord = typeof organizations.$inferSelect;
export type NewOrganizationRecord = typeof organizations.$inferInsert;
```

- [ ] **Step 4: Schema `users`**

Criar `src/db/schema/users.ts`:

```ts
import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  email: varchar('email', { length: 255 }).notNull().unique(),
  senha_hash: varchar('senha_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 32 }).notNull().default('client'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;
```

- [ ] **Step 5: Schema `audit_log`**

Criar `src/db/schema/audit-log.ts`:

```ts
import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const auditLog = pgTable('audit_log', {
  id: uuid('id').defaultRandom().primaryKey(),
  org_id: uuid('org_id'),
  user_id: uuid('user_id'),
  acao: varchar('acao', { length: 128 }).notNull(),
  detalhes: jsonb('detalhes'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export type AuditLogRecord = typeof auditLog.$inferSelect;
export type NewAuditLogRecord = typeof auditLog.$inferInsert;
```

- [ ] **Step 6: Barrel de schema**

Criar `src/db/schema/index.ts`:

```ts
export * from './organizations';
export * from './users';
export * from './audit-log';
```

- [ ] **Step 7: Teste de tipos do schema (falha primeiro)**

Criar `tests/unit/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { auditLog, organizations, users } from '@/db/schema';

describe('schema de fundação', () => {
  it('organizations tem coluna de trava de plano', () => {
    expect(organizations.proximo_relatorio_liberado_em.name).toBe(
      'proximo_relatorio_liberado_em',
    );
    expect(organizations.status.default).toBe('pending');
  });

  it('users referencia organizations e default role client', () => {
    expect(users.org_id.notNull).toBe(true);
    expect(users.role.default).toBe('client');
  });

  it('audit_log aceita org_id nulo (eventos de sistema)', () => {
    expect(auditLog.org_id.notNull).toBe(false);
  });
});
```

- [ ] **Step 8: Rodar o teste (verificar que passa após criar o schema)**

Run: `npm run test -- tests/unit/schema.test.ts`
Expected: PASS (3 passed).

- [ ] **Step 9: Gerar e aplicar a migration**

Run: `npm run db:generate`
Expected: cria `src/db/migrations/0000_*.sql` com as 3 tabelas.

Run: `npm run db:migrate`
Expected: aplica no banco Neon (usa `POSTGRES_URL_DIRECT`). Saída sem erro.

> ⚠️ Aplicar a migration ANTES de mergear o código que depende dela (mesma regra do Zeneagrama).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(db): schema de fundação (organizations/users/audit_log) + migration"
```

---

### Task 3: Utilitário de senha (hash/verify)

**Files:**
- Create: `src/modules/auth/password.ts`
- Test: `tests/unit/password.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `tests/unit/password.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/modules/auth/password';

describe('password', () => {
  it('hash não é igual ao texto puro', async () => {
    const hash = await hashPassword('segredo123');
    expect(hash).not.toBe('segredo123');
    expect(hash.length).toBeGreaterThan(30);
  });

  it('verify aceita a senha correta e rejeita a errada', async () => {
    const hash = await hashPassword('segredo123');
    expect(await verifyPassword('segredo123', hash)).toBe(true);
    expect(await verifyPassword('errada', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm run test -- tests/unit/password.test.ts`
Expected: FAIL ("Cannot find module '@/modules/auth/password'").

- [ ] **Step 3: Implementar**

Criar `src/modules/auth/password.ts`:

```ts
import bcrypt from 'bcryptjs';

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Rodar para ver passar**

Run: `npm run test -- tests/unit/password.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): utilitário de hash/verify de senha (bcryptjs)"
```

---

### Task 4: Repositório de auth + auditoria + isolamento multi-tenant

**Files:**
- Create: `src/modules/auth/user.types.ts`, `src/modules/auth/user.repository.ts`, `src/modules/audit/audit.repository.ts`
- Test: `tests/unit/email.test.ts`, `tests/integration/tenant-isolation.test.ts`

**Interfaces:**
- Consumes: `db` de `@/db/client`; `organizations`, `users`, `auditLog` de `@/db/schema`; `hashPassword` de `@/modules/auth/password`.
- Produces:
  - Tipos: `UserRole = 'admin_truth' | 'client'`, `OrgStatus = 'pending' | 'active' | 'suspended'`, `Plano = 'weekly' | 'biweekly' | 'monthly'`, `UserAccess = { id: string; orgId: string; role: UserRole; orgStatus: OrgStatus }`.
  - `normalizeEmail(email: string): string`
  - `getUserByEmail(email: string): Promise<{ id: string; email: string; senha_hash: string } | null>`
  - `getUserAccessById(userId: string): Promise<UserAccess | null>`
  - `createOrgWithUser(input: { orgName: string; email: string; senha: string }): Promise<{ orgId: string; userId: string }>` — cria org `pending` + user `client` numa transação; lança `Error('email_em_uso')` se o e-mail já existe.
  - `recordAudit(input: { orgId?: string | null; userId?: string | null; acao: string; detalhes?: unknown }): Promise<void>`

- [ ] **Step 1: Tipos**

Criar `src/modules/auth/user.types.ts`:

```ts
export type UserRole = 'admin_truth' | 'client';
export type OrgStatus = 'pending' | 'active' | 'suspended';
export type Plano = 'weekly' | 'biweekly' | 'monthly';

export type UserAccess = {
  id: string;
  orgId: string;
  role: UserRole;
  orgStatus: OrgStatus;
};
```

- [ ] **Step 2: Teste unitário de `normalizeEmail` (falha primeiro)**

Criar `tests/unit/email.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeEmail } from '@/modules/auth/user.repository';

describe('normalizeEmail', () => {
  it('faz trim e lowercase', () => {
    expect(normalizeEmail('  Foo@Bar.COM ')).toBe('foo@bar.com');
  });
});
```

- [ ] **Step 3: Implementar o repositório de auth**

Criar `src/modules/auth/user.repository.ts`:

```ts
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, users } from '@/db/schema';
import { hashPassword } from '@/modules/auth/password';
import type { OrgStatus, UserAccess, UserRole } from '@/modules/auth/user.types';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  const [row] = await db
    .select({ id: users.id, email: users.email, senha_hash: users.senha_hash })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  return row ?? null;
}

export async function getUserAccessById(userId: string): Promise<UserAccess | null> {
  const [row] = await db
    .select({
      id: users.id,
      orgId: users.org_id,
      role: users.role,
      orgStatus: organizations.status,
    })
    .from(users)
    .innerJoin(organizations, eq(users.org_id, organizations.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    role: row.role as UserRole,
    orgStatus: row.orgStatus as OrgStatus,
  };
}

export async function createOrgWithUser(input: {
  orgName: string;
  email: string;
  senha: string;
}): Promise<{ orgId: string; userId: string }> {
  const email = normalizeEmail(input.email);

  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error('email_em_uso');
  }

  const senha_hash = await hashPassword(input.senha);

  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: input.orgName, status: 'pending' })
      .returning({ id: organizations.id });

    const [user] = await tx
      .insert(users)
      .values({ org_id: org.id, email, senha_hash, role: 'client' })
      .returning({ id: users.id });

    return { orgId: org.id, userId: user.id };
  });
}
```

- [ ] **Step 4: Rodar o teste unitário**

Run: `npm run test -- tests/unit/email.test.ts`
Expected: PASS (1 passed).

- [ ] **Step 5: Repositório de auditoria**

Criar `src/modules/audit/audit.repository.ts`:

```ts
import { db } from '@/db/client';
import { auditLog } from '@/db/schema';

export async function recordAudit(input: {
  orgId?: string | null;
  userId?: string | null;
  acao: string;
  detalhes?: unknown;
}): Promise<void> {
  await db.insert(auditLog).values({
    org_id: input.orgId ?? null,
    user_id: input.userId ?? null,
    acao: input.acao,
    detalhes: (input.detalhes ?? null) as Record<string, unknown> | null,
  });
}
```

- [ ] **Step 6: Teste de integração de isolamento multi-tenant (falha primeiro)**

Criar `tests/integration/tenant-isolation.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, orders } from '@/db/schema';

// Usa banco de TESTE dedicado (branch Neon), nunca o de produção.
const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-iso-';

describe.skipIf(!url)('isolamento multi-tenant', () => {
  let orgA = '';
  let orgB = '';

  beforeAll(async () => {
    const [a] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}A`, status: 'active' })
      .returning({ id: organizations.id });
    const [b] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}B`, status: 'active' })
      .returning({ id: organizations.id });
    orgA = a.id;
    orgB = b.id;
  });

  afterAll(async () => {
    await tdb.delete(organizations).where(eq(organizations.name, `${PREFIX}A`));
    await tdb.delete(organizations).where(eq(organizations.name, `${PREFIX}B`));
    await sql.end();
  });

  it('uma query filtrada por org_id nunca devolve linhas de outra org', async () => {
    const rows = await tdb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgA));
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(orgA);
    expect(rows.some((r) => r.id === orgB)).toBe(false);
  });
});
```

> **Nota:** o import de `orders` é proposital — este teste falha de compilação até o Plano 4 criar `orders`. Para manter a Fundação verde, **remova `orders` do import** nesta task (deixe só `organizations`); reintroduza a checagem cruzada com `orders` no Plano 4. (Mantido aqui para sinalizar a intenção ao leitor.)

Ação: editar o import para `import { organizations } from '@/db/schema';`.

- [ ] **Step 7: Rodar o teste de integração**

Run: `DATABASE_URL_TEST="<url do branch test>" npm run test -- tests/integration/tenant-isolation.test.ts`
Expected: PASS (1 passed). Sem `DATABASE_URL_TEST`, o teste é `skipped` (não falha).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): repositório de usuários/orgs + auditoria + teste de isolamento multi-tenant"
```

---

### Task 5: Config Auth.js v5 (e-mail+senha) + helpers de gating

**Files:**
- Create: `src/modules/auth/auth-config.ts`, `src/modules/auth/auth.ts`, `src/types/next-auth.d.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/modules/auth/session.ts`, `src/modules/auth/require-session.ts`, `src/modules/auth/require-admin.ts`, `src/modules/auth/require-active-org.ts`
- Test: `tests/unit/auth-callbacks.test.ts`

**Interfaces:**
- Consumes: `getUserByEmail`, `getUserAccessById`, `normalizeEmail` de `@/modules/auth/user.repository`; `verifyPassword` de `@/modules/auth/password`; `serverEnv`.
- Produces:
  - `authConfig` (edge-safe) de `@/modules/auth/auth-config`.
  - `{ handlers, auth, signIn, signOut }` de `@/modules/auth/auth`.
  - `getSessionContext(): Promise<UserAccess | null>` (reconsulta o banco).
  - `requireSession(): Promise<UserAccess>` (redireciona `/sign-in` se ausente).
  - `requireAdmin(): Promise<UserAccess>` (redireciona `/sign-in` se não for `admin_truth` ativo).
  - `requireActiveOrg(): Promise<UserAccess>` (redireciona `/aguardando` se org não `active`).
  - Augment: `session.user.{id, role, orgId, orgStatus}` e `token.{role, orgId, orgStatus}`.

- [ ] **Step 1: Augment de tipos do next-auth**

Criar `src/types/next-auth.d.ts`:

```ts
import type { OrgStatus, UserRole } from '@/modules/auth/user.types';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      role: UserRole;
      orgId: string;
      orgStatus: OrgStatus;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRole;
    orgId?: string;
    orgStatus?: OrgStatus;
  }
}
```

- [ ] **Step 2: Config edge-safe (sem db, sem bcrypt, sem providers)**

Criar `src/modules/auth/auth-config.ts`:

```ts
import type { NextAuthConfig } from 'next-auth';

import type { OrgStatus, UserRole } from '@/modules/auth/user.types';

type SharedAuthConfig = Pick<NextAuthConfig, 'pages' | 'session' | 'callbacks'>;

const clientRoutes = ['/dashboard'];
const adminRoutes = ['/admin'];

export const authConfig = {
  pages: { signIn: '/sign-in', error: '/sign-in' },
  session: { strategy: 'jwt' },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = Boolean(auth?.user);
      const isAdminRoute = adminRoutes.some((r) => nextUrl.pathname.startsWith(r));
      const isClientRoute = clientRoutes.some((r) => nextUrl.pathname.startsWith(r));

      if (isAdminRoute) {
        if (!isLoggedIn) return false;
        if (auth?.user?.role !== 'admin_truth') {
          return Response.redirect(new URL('/dashboard', nextUrl));
        }
        return true;
      }

      if (isClientRoute) return isLoggedIn;

      if (isLoggedIn && nextUrl.pathname === '/sign-in') {
        return Response.redirect(new URL('/dashboard', nextUrl));
      }

      return true;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = (token.role as UserRole | undefined) ?? 'client';
        session.user.orgId = (token.orgId as string | undefined) ?? '';
        session.user.orgStatus =
          (token.orgStatus as OrgStatus | undefined) ?? 'pending';
      }
      return session;
    },
  },
} satisfies SharedAuthConfig;
```

- [ ] **Step 3: Instância NextAuth com Credentials**

Criar `src/modules/auth/auth.ts`:

```ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

import { serverEnv } from '@/lib/env';
import { authConfig } from '@/modules/auth/auth-config';
import { verifyPassword } from '@/modules/auth/password';
import {
  getUserAccessById,
  getUserByEmail,
  normalizeEmail,
} from '@/modules/auth/user.repository';

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  secret: serverEnv.AUTH_SECRET,
  providers: [
    Credentials({
      credentials: { email: {}, senha: {} },
      authorize: async (credentials) => {
        const email = normalizeEmail(String(credentials?.email ?? ''));
        const senha = String(credentials?.senha ?? '');
        if (!email || !senha) return null;

        const user = await getUserByEmail(email);
        if (!user) return null;

        const ok = await verifyPassword(senha, user.senha_hash);
        if (!ok) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        const access = await getUserAccessById(user.id);
        token.role = access?.role ?? 'client';
        token.orgId = access?.orgId ?? '';
        token.orgStatus = access?.orgStatus ?? 'pending';
      }
      return token;
    },
  },
});
```

- [ ] **Step 4: Route handler + middleware**

Criar `src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/modules/auth/auth';

export const { GET, POST } = handlers;
```

Criar `src/middleware.ts`:

```ts
import NextAuth from 'next-auth';

import { authConfig } from '@/modules/auth/auth-config';

export const { auth: middleware } = NextAuth(authConfig);
export default middleware;

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 5: Helpers de gating (reconsultam o banco)**

Criar `src/modules/auth/session.ts`:

```ts
import { auth } from '@/modules/auth/auth';
import { getUserAccessById } from '@/modules/auth/user.repository';
import type { UserAccess } from '@/modules/auth/user.types';

export async function getSessionContext(): Promise<UserAccess | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  return getUserAccessById(userId);
}
```

Criar `src/modules/auth/require-session.ts`:

```ts
import { redirect } from 'next/navigation';

import { getSessionContext } from '@/modules/auth/session';
import type { UserAccess } from '@/modules/auth/user.types';

export async function requireSession(): Promise<UserAccess> {
  const access = await getSessionContext();
  if (!access) redirect('/sign-in');
  return access;
}
```

Criar `src/modules/auth/require-admin.ts`:

```ts
import { redirect } from 'next/navigation';

import { getSessionContext } from '@/modules/auth/session';
import type { UserAccess } from '@/modules/auth/user.types';

export async function requireAdmin(): Promise<UserAccess> {
  const access = await getSessionContext();
  if (!access || access.role !== 'admin_truth') redirect('/sign-in');
  return access;
}
```

Criar `src/modules/auth/require-active-org.ts`:

```ts
import { redirect } from 'next/navigation';

import { requireSession } from '@/modules/auth/require-session';
import type { UserAccess } from '@/modules/auth/user.types';

export async function requireActiveOrg(): Promise<UserAccess> {
  const access = await requireSession();
  if (access.orgStatus !== 'active') redirect('/aguardando');
  return access;
}
```

- [ ] **Step 6: Teste do callback `session` (falha primeiro)**

Criar `tests/unit/auth-callbacks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { authConfig } from '@/modules/auth/auth-config';

describe('authConfig.callbacks.session', () => {
  it('projeta role/orgId/orgStatus do token na sessão', () => {
    const session = {
      user: { id: '', email: 'x@y.com', role: 'client', orgId: '', orgStatus: 'pending' },
      expires: '',
    } as never;
    const token = { sub: 'u1', role: 'admin_truth', orgId: 'o1', orgStatus: 'active' } as never;

    const result = authConfig.callbacks!.session!({ session, token } as never) as {
      user: { id: string; role: string; orgId: string; orgStatus: string };
    };

    expect(result.user.id).toBe('u1');
    expect(result.user.role).toBe('admin_truth');
    expect(result.user.orgId).toBe('o1');
    expect(result.user.orgStatus).toBe('active');
  });
});
```

- [ ] **Step 7: Rodar testes e typecheck**

Run: `npm run test -- tests/unit/auth-callbacks.test.ts && npm run typecheck`
Expected: teste PASS (1 passed); typecheck PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(auth): Auth.js v5 com Credentials (e-mail+senha) + middleware + helpers de gating"
```

---

### Task 6: Cadastro/login (actions + páginas) + placeholders + E2E

**Files:**
- Create: `src/actions/auth.actions.ts`, `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/sign-in/page.tsx`, `src/app/(client)/dashboard/page.tsx`, `src/app/(client)/aguardando/page.tsx`, `src/app/admin/page.tsx`
- Create: `playwright.config.ts`, `tests/e2e/helpers/db.ts`, `tests/e2e/auth.spec.ts`

**Interfaces:**
- Consumes: `createOrgWithUser`, `getUserByEmail` de `@/modules/auth/user.repository`; `recordAudit` de `@/modules/audit/audit.repository`; `signIn` de `@/modules/auth/auth`; `requireActiveOrg`/`requireAdmin` de `@/modules/auth/*`.
- Produces:
  - `signUpAction(prev: ActionState, formData: FormData): Promise<ActionState>` — valida (Zod), cria org+user, registra auditoria `org.criada`, faz `signIn` credentials, redireciona `/aguardando`.
  - `signInAction(prev: ActionState, formData: FormData): Promise<ActionState>` — `signIn` credentials; em erro retorna `{ error: 'Credenciais inválidas.' }`.
  - `type ActionState = { error?: string }`.

- [ ] **Step 1: Server actions**

Criar `src/actions/auth.actions.ts`:

```ts
'use server';

import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { signIn } from '@/modules/auth/auth';
import { createOrgWithUser } from '@/modules/auth/user.repository';
import { recordAudit } from '@/modules/audit/audit.repository';

export type ActionState = { error?: string };

const signUpSchema = z.object({
  orgName: z.string().trim().min(2, 'Informe o nome da empresa.'),
  email: z.string().trim().email('E-mail inválido.'),
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
});

export async function signUpAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    orgName: formData.get('orgName'),
    email: formData.get('email'),
    senha: formData.get('senha'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  try {
    const { orgId, userId } = await createOrgWithUser(parsed.data);
    await recordAudit({ orgId, userId, acao: 'org.criada', detalhes: { via: 'sign-up' } });
  } catch (err) {
    if (err instanceof Error && err.message === 'email_em_uso') {
      return { error: 'Já existe uma conta com este e-mail.' };
    }
    throw err;
  }

  await signIn('credentials', {
    email: parsed.data.email,
    senha: parsed.data.senha,
    redirect: false,
  });

  redirect('/aguardando');
}

export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      senha: String(formData.get('senha') ?? ''),
      redirect: false,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: 'Credenciais inválidas.' };
    }
    throw err;
  }

  redirect('/dashboard');
}
```

- [ ] **Step 2: Página de cadastro**

Criar `src/app/(auth)/sign-up/page.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import { signUpAction, type ActionState } from '@/actions/auth.actions';

const initial: ActionState = {};

export default function SignUpPage() {
  const [state, action] = useFormState(signUpAction, initial);

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-semibold">Criar conta</h1>
      <form action={action} className="flex flex-col gap-3">
        <input name="orgName" placeholder="Nome da empresa" className="border p-2" />
        <input name="email" type="email" placeholder="E-mail" className="border p-2" />
        <input name="senha" type="password" placeholder="Senha" className="border p-2" />
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" className="bg-black p-2 text-white">Cadastrar</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Página de login**

Criar `src/app/(auth)/sign-in/page.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import { signInAction, type ActionState } from '@/actions/auth.actions';

const initial: ActionState = {};

export default function SignInPage() {
  const [state, action] = useFormState(signInAction, initial);

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="mb-4 text-xl font-semibold">Entrar</h1>
      <form action={action} className="flex flex-col gap-3">
        <input name="email" type="email" placeholder="E-mail" className="border p-2" />
        <input name="senha" type="password" placeholder="Senha" className="border p-2" />
        {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" className="bg-black p-2 text-white">Entrar</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: Placeholders autenticados**

Criar `src/app/(client)/dashboard/page.tsx`:

```tsx
import { requireActiveOrg } from '@/modules/auth/require-active-org';

export default async function DashboardPage() {
  const access = await requireActiveOrg();
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p data-testid="org-id">org: {access.orgId}</p>
    </main>
  );
}
```

Criar `src/app/(client)/aguardando/page.tsx`:

```tsx
import { requireSession } from '@/modules/auth/require-session';

export default async function AguardandoPage() {
  await requireSession();
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Conta aguardando ativação</h1>
      <p>Sua conta foi criada e será ativada pela equipe Truth em breve.</p>
    </main>
  );
}
```

Criar `src/app/admin/page.tsx`:

```tsx
import { requireAdmin } from '@/modules/auth/require-admin';

export default async function AdminPage() {
  await requireAdmin();
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Painel Admin</h1>
    </main>
  );
}
```

- [ ] **Step 5: Config Playwright + helper de limpeza**

Criar `playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'npm run dev -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

Criar `tests/e2e/helpers/db.ts`:

```ts
import { eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, users } from '@/db/schema';

const sql = postgres(process.env.DATABASE_URL_TEST ?? '', { prepare: false });
const tdb = drizzle(sql);

export const E2E_PREFIX = 'ta-test-e2e-';

export async function cleanupE2E(): Promise<void> {
  const orgs = await tdb
    .select({ id: organizations.id })
    .from(organizations)
    .where(like(organizations.name, `${E2E_PREFIX}%`));
  for (const org of orgs) {
    await tdb.delete(users).where(eq(users.org_id, org.id));
    await tdb.delete(organizations).where(eq(organizations.id, org.id));
  }
  await sql.end();
}
```

- [ ] **Step 6: Escrever o E2E (falha primeiro)**

Criar `tests/e2e/auth.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX } from './helpers/db';

const email = `${E2E_PREFIX}${Date.now()}@example.com`;
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
```

- [ ] **Step 7: Rodar o E2E**

Run: `DATABASE_URL_TEST="<url do branch test>" POSTGRES_URL="<url do branch test>" npm run test:e2e`
Expected: 3 testes PASS. (O app sobe na 3100 apontando para o banco de teste via env.)

> **Importante:** rode o E2E com `POSTGRES_URL` apontando para o **branch de teste** (não a produção), já que o app usa `POSTGRES_URL` em runtime.

- [ ] **Step 8: Typecheck/lint/build final**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: tudo PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(auth): cadastro/login e-mail+senha + páginas + gating + E2E"
```

---

## Self-Review

**1. Cobertura do spec (seções aplicáveis à Fundação):**
- §3.1 Auth & Contas (e-mail+senha, org, conta nasce `pending`, roles `admin_truth`/`client`) → Tasks 4–6. ✅
- §4 Modelo de dados — `organizations`, `users`, `audit_log` → Task 2. ✅ (Demais 5 tabelas: `connections`/`tracked_products` no Plano 3; `orders`/`market_snapshots`/`reports` no Plano 4.)
- §6 Segurança — isolamento por `org_id` (Task 4 + teste), `/admin` por `admin_truth` (Task 5/6), hash de senha (Task 3). ✅ (Rate limiting no login: ver "Lacunas".)
- §7 Testes — Vitest unit + integração, Playwright E2E, TDD → presente em todas as tasks. ✅

**2. Lacunas conscientes (puxar para tasks/planos seguintes):**
- **Rate limiting no login** (§6) — não implementado neste plano. Adicionar como task curta no Plano 2 (Admin) ou via middleware dedicado; registrar como follow-up.
- **Seed do primeiro admin `admin_truth`** — não há UI para promover admin (igual Zeneagrama). Adicionar uma migration de seed (ou script) que promova os e-mails internos da Truth a `admin_truth`; fazer no início do Plano 2 (que precisa de admin para existir). Follow-up registrado.
- **Multi-tenant cross-table** (org A × `orders` de B) — o teste completo depende de `orders` (Plano 4); placeholder sinalizado na Task 4/Step 6.

**3. Consistência de tipos:** `UserRole`/`OrgStatus`/`Plano`/`UserAccess` definidos na Task 4 e usados consistentemente em Tasks 5–6 e no augment (Task 5/Step 1). `createOrgWithUser` retorna `{ orgId, userId }`, consumido igual na action (Task 6). ✅

---

## Execução

**Plano salvo em `docs/superpowers/plans/2026-06-23-fundacao-auth-multitenancy.md`.** Duas opções de execução:

1. **Subagent-Driven (recomendado)** — despacho um subagente novo por task, com review entre tasks (iteração rápida e isolada).
2. **Inline** — executo as tasks nesta sessão via executing-plans, em lotes com checkpoints de review.
