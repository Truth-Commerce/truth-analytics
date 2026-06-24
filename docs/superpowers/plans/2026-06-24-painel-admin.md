# Painel Admin (interno Truth) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o módulo `/admin` (role `admin_truth`): seed do primeiro admin, rate-limit no login, e a gestão de clientes (listar, ativar definindo plano, suspender, reativar) — tudo auditado e gated por `requireAdmin`, sobre a Fundação (Plano 1).

**Architecture:** Reaproveita o stack da Fundação (Next.js 14 App Router, Drizzle/Neon, Auth.js v5, Server Actions, Vitest/Playwright). O painel **só lê e muda o estado de contas** (`organizations.status`/`plano`/`proximo_relatorio_liberado_em`); não toca em integrações nem relatórios (Planos 3/4). Toda mutação registra `audit_log` e é gated por `requireAdmin()` (reconsulta o banco). Rate-limit de login é baseado numa tabela `login_attempts` no Neon (sem serviço externo).

**Tech Stack:** Next.js 14, Drizzle ORM + drizzle-kit, Neon Postgres, Auth.js v5, Zod, bcryptjs, Vitest, Playwright. Igual ao Plano 1.

## Global Constraints

- **Stack e padrões idênticos ao Plano 1** (já em `master`): `src/db/schema/*.ts`, `src/modules/<domínio>/`, `src/actions/`, Server Actions com `(prev, formData)` + Zod, helpers de gating reconsultando o DB.
- **Gating:** todas as páginas e actions de admin chamam `requireAdmin()` (de `@/modules/auth/require-admin`), que reconsulta o banco. Nunca confiar em `session.user.role`.
- **Roles:** `admin_truth` (equipe interna) | `client`. **Status org:** `pending` | `active` | `suspended`. **Plano:** `weekly` | `biweekly` | `monthly`. Tipos já existem em `@/modules/auth/user.types`.
- **Auditoria:** toda mutação de conta chama `recordAudit` (de `@/modules/audit/audit.repository`) com `org_id`, `user_id` (admin ator) e `acao` (`org.ativada` | `org.suspensa` | `org.reativada` | `org.plano_alterado` | `admin.seed`).
- **Multi-tenancy:** consultas/mutações de admin referenciam orgs por `id`; a lista de clientes EXCLUI orgs internas (que possuem usuário `admin_truth`).
- **Rate-limit:** baseado na tabela `login_attempts` (Neon). Limite: **5 falhas** por (email+ip) em janela de **15 minutos** → bloqueia.
- **Seed admin:** script idempotente lendo `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` do ambiente. Nunca hardcodar segredo. Cria org interna `active` + user `admin_truth`; se o e-mail já existe, promove para `admin_truth`.
- **Ativação** seta `status='active'`, `plano` (obrigatório) e `proximo_relatorio_liberado_em = new Date()`.
- **`updated_at` auto-atualiza** via Drizzle `$onUpdateFn(() => new Date())` nas tabelas `organizations` e `users` (follow-up do Plano 1; é ORM-level, sem DDL).
- **Idioma:** UI em pt-BR; commits conventional em pt-BR.
- **Testes ≠ produção:** `tests/setup.ts` (do Plano 1) já redireciona o client do app para o branch `test`; todo teste de integração usa `describe.skipIf(!process.env.DATABASE_URL_TEST)`. E2E usa `playwright.config.ts` blindado.
- **NUNCA** push/merge sem revisão; trabalho na branch `feat/admin` (a partir de `master`).

---

## Pré-requisitos

- [ ] Branch `feat/admin` criada a partir de `master` (a Fundação já está em `master`).
- [ ] `.env.local` já tem as credenciais Neon (Plano 1). Para rodar o seed manualmente depois, você definirá `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD` (não precisam ir ao `.env.local`; podem ser passados inline no comando).

---

## File Structure

| Caminho | Responsabilidade |
|---|---|
| `src/db/schema/organizations.ts` (modificar) | adicionar `$onUpdateFn` em `updated_at` |
| `src/db/schema/users.ts` (modificar) | adicionar `$onUpdateFn` em `updated_at` |
| `src/db/schema/login-attempts.ts` (criar) | tabela `login_attempts` (rate-limit) |
| `src/db/schema/index.ts` (modificar) | exportar `login-attempts` |
| `src/modules/admin/admin.repository.ts` (criar) | queries/mutações de gestão de clientes |
| `src/modules/auth/rate-limit.ts` (criar) | `recordLoginAttempt`, `countRecentFailures`, `isLoginRateLimited` |
| `src/actions/admin.actions.ts` (criar) | Server Actions: ativar/suspender/reativar/definir plano |
| `src/actions/auth.actions.ts` (modificar) | integrar rate-limit no `signInAction` |
| `src/app/admin/page.tsx` (modificar) | lista de clientes + ações (substitui o placeholder) |
| `src/app/admin/client-row.tsx` (criar) | componente client das ações por linha |
| `scripts/seed-admin.ts` (criar) | seed idempotente do 1º admin (env-driven) |
| `package.json` (modificar) | script `db:seed-admin` |
| `tests/unit/*.test.ts` | validação de plano/transições, rate-limit (lógica pura) |
| `tests/integration/admin-repository.test.ts` | mutações + auditoria + exclusão da org interna |
| `tests/integration/rate-limit.test.ts` | contagem/bloqueio por janela |
| `tests/integration/seed-admin.test.ts` | seed idempotente |
| `tests/e2e/admin.spec.ts` | admin lista e ativa cliente; não-admin bloqueado |
| `tests/e2e/helpers/db.ts` (modificar) | helper para semear admin no branch test |

---

### Task 1: Domínio de gestão de clientes (repository + schema `$onUpdateFn`)

**Files:**
- Modify: `src/db/schema/organizations.ts`, `src/db/schema/users.ts`
- Create: `src/modules/admin/admin.repository.ts`
- Test: `tests/unit/plano.test.ts`, `tests/integration/admin-repository.test.ts`

**Interfaces:**
- Consumes: `db` de `@/db/client`; `organizations`, `users` de `@/db/schema`; `recordAudit` de `@/modules/audit/audit.repository`; tipos `Plano`, `OrgStatus` de `@/modules/auth/user.types`.
- Produces:
  - `isValidPlano(value: unknown): value is Plano` — aceita `'weekly'|'biweekly'|'monthly'`.
  - `type ClientOrganization = { id: string; name: string; status: OrgStatus; plano: Plano | null; nicho: string | null; created_at: Date; proximo_relatorio_liberado_em: Date | null }`.
  - `listClientOrganizations(): Promise<ClientOrganization[]>` — exclui orgs com usuário `admin_truth`, ordena por `created_at` desc.
  - `getOrganizationById(orgId: string): Promise<ClientOrganization | null>`.
  - `activateOrganization(input: { orgId: string; plano: Plano; actorUserId: string }): Promise<void>` — set `status='active'`, `plano`, `proximo_relatorio_liberado_em=new Date()`; audit `org.ativada`.
  - `suspendOrganization(input: { orgId: string; actorUserId: string }): Promise<void>` — `status='suspended'`; audit `org.suspensa`.
  - `reactivateOrganization(input: { orgId: string; actorUserId: string }): Promise<void>` — `status='active'`; audit `org.reativada`.
  - `setPlano(input: { orgId: string; plano: Plano; actorUserId: string }): Promise<void>` — atualiza `plano`; audit `org.plano_alterado`.

- [ ] **Step 1: Adicionar `$onUpdateFn` em `updated_at` (organizations e users)**

Em `src/db/schema/organizations.ts`, troque a coluna `updated_at` por:

```ts
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
```

Faça a MESMA troca em `src/db/schema/users.ts`. (É ORM-level; não gera migration.)

- [ ] **Step 2: Teste unitário de `isValidPlano` (falha primeiro)**

Criar `tests/unit/plano.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isValidPlano } from '@/modules/admin/admin.repository';

describe('isValidPlano', () => {
  it('aceita os 3 planos válidos', () => {
    expect(isValidPlano('weekly')).toBe(true);
    expect(isValidPlano('biweekly')).toBe(true);
    expect(isValidPlano('monthly')).toBe(true);
  });
  it('rejeita valores inválidos', () => {
    expect(isValidPlano('anual')).toBe(false);
    expect(isValidPlano('')).toBe(false);
    expect(isValidPlano(null)).toBe(false);
    expect(isValidPlano(undefined)).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `npm run test -- tests/unit/plano.test.ts`
Expected: FAIL ("Cannot find module '@/modules/admin/admin.repository'").

- [ ] **Step 4: Implementar o repository**

Criar `src/modules/admin/admin.repository.ts`:

```ts
import { and, desc, eq, exists } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, users } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import type { OrgStatus, Plano } from '@/modules/auth/user.types';

const PLANOS: readonly Plano[] = ['weekly', 'biweekly', 'monthly'];

export function isValidPlano(value: unknown): value is Plano {
  return typeof value === 'string' && (PLANOS as readonly string[]).includes(value);
}

export type ClientOrganization = {
  id: string;
  name: string;
  status: OrgStatus;
  plano: Plano | null;
  nicho: string | null;
  created_at: Date;
  proximo_relatorio_liberado_em: Date | null;
};

// Org interna = possui ao menos um usuário admin_truth. Clientes = as demais.
function isInternalOrg() {
  return exists(
    db
      .select({ one: users.id })
      .from(users)
      .where(and(eq(users.org_id, organizations.id), eq(users.role, 'admin_truth'))),
  );
}

function rowToClient(row: typeof organizations.$inferSelect): ClientOrganization {
  return {
    id: row.id,
    name: row.name,
    status: row.status as OrgStatus,
    plano: (row.plano as Plano | null) ?? null,
    nicho: row.nicho,
    created_at: row.created_at,
    proximo_relatorio_liberado_em: row.proximo_relatorio_liberado_em,
  };
}

export async function listClientOrganizations(): Promise<ClientOrganization[]> {
  const rows = await db
    .select()
    .from(organizations)
    .where(eq(isInternalOrg(), false))
    .orderBy(desc(organizations.created_at));
  return rows.map(rowToClient);
}

export async function getOrganizationById(
  orgId: string,
): Promise<ClientOrganization | null> {
  const [row] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return row ? rowToClient(row) : null;
}

export async function activateOrganization(input: {
  orgId: string;
  plano: Plano;
  actorUserId: string;
}): Promise<void> {
  await db
    .update(organizations)
    .set({
      status: 'active',
      plano: input.plano,
      proximo_relatorio_liberado_em: new Date(),
    })
    .where(eq(organizations.id, input.orgId));
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.ativada',
    detalhes: { plano: input.plano },
  });
}

export async function suspendOrganization(input: {
  orgId: string;
  actorUserId: string;
}): Promise<void> {
  await db
    .update(organizations)
    .set({ status: 'suspended' })
    .where(eq(organizations.id, input.orgId));
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.suspensa',
  });
}

export async function reactivateOrganization(input: {
  orgId: string;
  actorUserId: string;
}): Promise<void> {
  await db
    .update(organizations)
    .set({ status: 'active' })
    .where(eq(organizations.id, input.orgId));
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.reativada',
  });
}

export async function setPlano(input: {
  orgId: string;
  plano: Plano;
  actorUserId: string;
}): Promise<void> {
  await db
    .update(organizations)
    .set({ plano: input.plano })
    .where(eq(organizations.id, input.orgId));
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.plano_alterado',
    detalhes: { plano: input.plano },
  });
}
```

> Nota sobre `eq(isInternalOrg(), false)`: se o tipo do `exists(...)` não casar com `eq` no seu drizzle-orm, use `not(isInternalOrg())` (import `not` de `drizzle-orm`). Aplique o que typecheckar; ambos expressam "orgs que NÃO são internas".

- [ ] **Step 5: Rodar o teste unitário**

Run: `npm run test -- tests/unit/plano.test.ts`
Expected: PASS (2 passed).

- [ ] **Step 6: Teste de integração (falha primeiro)**

Criar `tests/integration/admin-repository.test.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { auditLog, organizations, users } from '@/db/schema';
import {
  activateOrganization,
  listClientOrganizations,
  suspendOrganization,
} from '@/modules/admin/admin.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-admin-';
const RUN = Date.now();

describe.skipIf(!url)('admin.repository — integração', () => {
  let clientOrgId = '';
  let internalOrgId = '';
  let adminUserId = '';

  beforeAll(async () => {
    const [client] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}cliente-${RUN}`, status: 'pending' })
      .returning({ id: organizations.id });
    clientOrgId = client.id;

    const [internal] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}truth-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internalOrgId = internal.id;

    const [admin] = await tdb
      .insert(users)
      .values({
        org_id: internalOrgId,
        email: `admin-${RUN}@ta-test-admin.example.com`,
        senha_hash: 'x',
        role: 'admin_truth',
      })
      .returning({ id: users.id });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    await tdb.delete(auditLog).where(eq(auditLog.org_id, clientOrgId));
    await tdb.delete(users).where(eq(users.org_id, internalOrgId));
    await tdb.delete(organizations).where(eq(organizations.id, clientOrgId));
    await tdb.delete(organizations).where(eq(organizations.id, internalOrgId));
    await sql.end();
  });

  it('listClientOrganizations exclui a org interna (admin_truth)', async () => {
    const list = await listClientOrganizations();
    const ids = list.map((o) => o.id);
    expect(ids).toContain(clientOrgId);
    expect(ids).not.toContain(internalOrgId);
  });

  it('activateOrganization seta active+plano+proximo_relatorio e audita', async () => {
    await activateOrganization({
      orgId: clientOrgId,
      plano: 'weekly',
      actorUserId: adminUserId,
    });
    const [org] = await tdb
      .select()
      .from(organizations)
      .where(eq(organizations.id, clientOrgId))
      .limit(1);
    expect(org.status).toBe('active');
    expect(org.plano).toBe('weekly');
    expect(org.proximo_relatorio_liberado_em).not.toBeNull();

    const audits = await tdb
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.org_id, clientOrgId), eq(auditLog.acao, 'org.ativada')));
    expect(audits.length).toBe(1);
  });

  it('suspendOrganization seta suspended', async () => {
    await suspendOrganization({ orgId: clientOrgId, actorUserId: adminUserId });
    const [org] = await tdb
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, clientOrgId))
      .limit(1);
    expect(org.status).toBe('suspended');
  });
});
```

- [ ] **Step 7: Rodar integração + typecheck**

Run: `DATABASE_URL_TEST` já no `.env.local` → `npm run test -- tests/integration/admin-repository.test.ts`
Expected: PASS (3 passed, não skipped). Depois `npm run typecheck` (limpo).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin): repository de gestão de clientes + updated_at auto-atualiza"
```

---

### Task 2: Seed idempotente do primeiro admin

**Files:**
- Create: `scripts/seed-admin.ts`
- Modify: `package.json` (script `db:seed-admin`)
- Test: `tests/integration/seed-admin.test.ts`

**Interfaces:**
- Consumes: `db`, `organizations`, `users`, `hashPassword` (de `@/modules/auth/password`), `normalizeEmail` (de `@/modules/auth/user.repository`), `recordAudit`.
- Produces:
  - `seedAdmin(input: { email: string; senha: string; orgName?: string }): Promise<{ userId: string; orgId: string; promoted: boolean }>` — idempotente: se o e-mail existe, promove para `admin_truth` (sem recriar); senão cria org interna `active` + user `admin_truth`. Audita `admin.seed`.

- [ ] **Step 1: Implementar a função e o script**

Criar `scripts/seed-admin.ts`:

```ts
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, users } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import { hashPassword } from '@/modules/auth/password';
import { normalizeEmail } from '@/modules/auth/user.repository';

export async function seedAdmin(input: {
  email: string;
  senha: string;
  orgName?: string;
}): Promise<{ userId: string; orgId: string; promoted: boolean }> {
  const email = normalizeEmail(input.email);

  const [existing] = await db
    .select({ id: users.id, org_id: users.org_id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing) {
    await db
      .update(users)
      .set({ role: 'admin_truth' })
      .where(eq(users.id, existing.id));
    await recordAudit({
      orgId: existing.org_id,
      userId: existing.id,
      acao: 'admin.seed',
      detalhes: { promoted: true },
    });
    return { userId: existing.id, orgId: existing.org_id, promoted: true };
  }

  const senha_hash = await hashPassword(input.senha);
  return db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: input.orgName ?? 'Truth Commerce (interno)', status: 'active' })
      .returning({ id: organizations.id });
    const [user] = await tx
      .insert(users)
      .values({ org_id: org.id, email, senha_hash, role: 'admin_truth' })
      .returning({ id: users.id });
    await recordAudit({
      orgId: org.id,
      userId: user.id,
      acao: 'admin.seed',
      detalhes: { promoted: false },
    });
    return { userId: user.id, orgId: org.id, promoted: false };
  });
}

// CLI entrypoint: lê credenciais do ambiente (nunca hardcodar).
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const senha = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !senha) {
    console.error('Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD no ambiente.');
    process.exit(1);
  }
  const result = await seedAdmin({ email, senha });
  console.log(
    result.promoted
      ? `Usuário ${email} promovido a admin_truth.`
      : `Admin ${email} criado (org ${result.orgId}).`,
  );
  process.exit(0);
}

// Executa main() apenas quando rodado como script (não em import de teste).
if (process.argv[1] && process.argv[1].includes('seed-admin')) {
  void main();
}
```

- [ ] **Step 2: Script no package.json**

Em `package.json`, adicionar em `scripts`:

```json
    "db:seed-admin": "node --env-file=.env.local --import tsx scripts/seed-admin.ts",
```

E adicionar `tsx` às devDependencies:

```bash
npm install -D tsx
```

> `tsx` executa TypeScript direto (o script usa imports `@/...` resolvidos via tsconfig paths; `tsx` respeita `paths`). Se o resolver de paths falhar no `tsx`, rode com `tsx` + `tsconfig-paths` ou troque os imports do script para caminhos relativos — aplique o que funcionar.

- [ ] **Step 3: Teste de integração de idempotência (falha primeiro)**

Criar `tests/integration/seed-admin.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { auditLog, organizations, users } from '@/db/schema';
import { seedAdmin } from '../../scripts/seed-admin';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const RUN = Date.now();
const email = `seed-${RUN}@ta-test-admin.example.com`;

describe.skipIf(!url)('seedAdmin — idempotência', () => {
  let orgId = '';

  afterAll(async () => {
    if (orgId) {
      await tdb.delete(auditLog).where(eq(auditLog.org_id, orgId));
      await tdb.delete(users).where(eq(users.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
    await sql.end();
  });

  it('cria admin_truth + org interna na primeira vez', async () => {
    const r = await seedAdmin({ email, senha: 'senha-admin-123', orgName: `ta-test-admin-${RUN}` });
    orgId = r.orgId;
    expect(r.promoted).toBe(false);
    const [u] = await tdb.select().from(users).where(eq(users.id, r.userId)).limit(1);
    expect(u.role).toBe('admin_truth');
    const [o] = await tdb.select().from(organizations).where(eq(organizations.id, r.orgId)).limit(1);
    expect(o.status).toBe('active');
  });

  it('segunda chamada com mesmo e-mail promove (não duplica)', async () => {
    const r = await seedAdmin({ email, senha: 'irrelevante', orgName: 'ignored' });
    expect(r.promoted).toBe(true);
    const all = await tdb.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(all.length).toBe(1);
  });
});
```

- [ ] **Step 4: Rodar e typecheck**

Run: `npm run test -- tests/integration/seed-admin.test.ts`
Expected: PASS (2 passed). `npm run typecheck` limpo.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(admin): script idempotente de seed do 1º admin (env-driven)"
```

---

### Task 3: Rate-limit de login (tabela `login_attempts`)

**Files:**
- Create: `src/db/schema/login-attempts.ts`, `src/modules/auth/rate-limit.ts`
- Modify: `src/db/schema/index.ts`, `src/actions/auth.actions.ts`
- Generate: migration `0001_*.sql`
- Test: `tests/integration/rate-limit.test.ts`

**Interfaces:**
- Produces:
  - tabela `loginAttempts` (colunas: `id` uuid pk, `email` varchar(255) notNull, `ip` varchar(64) nullable, `success` boolean notNull default false, `created_at` timestamptz notNull defaultNow).
  - `recordLoginAttempt(input: { email: string; ip: string | null; success: boolean }): Promise<void>`
  - `countRecentFailures(email: string, ip: string | null, windowMinutes: number): Promise<number>`
  - `isLoginRateLimited(email: string, ip: string | null): Promise<boolean>` — true se `countRecentFailures(...,15) >= 5`.
- Consumes (na action): `headers` de `next/headers`.

- [ ] **Step 1: Schema `login_attempts`**

Criar `src/db/schema/login-attempts.ts`:

```ts
import { boolean, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    ip: varchar('ip', { length: 64 }),
    success: boolean('success').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    email_created_idx: index('login_attempts_email_created_idx').on(t.email, t.created_at),
  }),
);

export type LoginAttemptRecord = typeof loginAttempts.$inferSelect;
export type NewLoginAttemptRecord = typeof loginAttempts.$inferInsert;
```

Em `src/db/schema/index.ts`, adicionar:

```ts
export * from './login-attempts';
```

- [ ] **Step 2: Implementar rate-limit**

Criar `src/modules/auth/rate-limit.ts`:

```ts
import { and, eq, gte, sql as dsql } from 'drizzle-orm';

import { db } from '@/db/client';
import { loginAttempts } from '@/db/schema';
import { normalizeEmail } from '@/modules/auth/user.repository';

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

export async function recordLoginAttempt(input: {
  email: string;
  ip: string | null;
  success: boolean;
}): Promise<void> {
  await db.insert(loginAttempts).values({
    email: normalizeEmail(input.email),
    ip: input.ip,
    success: input.success,
  });
}

export async function countRecentFailures(
  email: string,
  ip: string | null,
  windowMinutes: number,
): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const normalized = normalizeEmail(email);
  const where = ip
    ? and(
        eq(loginAttempts.email, normalized),
        eq(loginAttempts.ip, ip),
        eq(loginAttempts.success, false),
        gte(loginAttempts.created_at, since),
      )
    : and(
        eq(loginAttempts.email, normalized),
        eq(loginAttempts.success, false),
        gte(loginAttempts.created_at, since),
      );
  const [row] = await db
    .select({ n: dsql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(where);
  return row?.n ?? 0;
}

export async function isLoginRateLimited(
  email: string,
  ip: string | null,
): Promise<boolean> {
  const failures = await countRecentFailures(email, ip, WINDOW_MINUTES);
  return failures >= MAX_FAILURES;
}
```

- [ ] **Step 3: Integrar no `signInAction`**

Em `src/actions/auth.actions.ts`, substituir a `signInAction` por (mantendo `signUpAction` intacta e o import de `AuthError`):

```ts
import { headers } from 'next/headers';
import {
  isLoginRateLimited,
  recordLoginAttempt,
} from '@/modules/auth/rate-limit';

export async function signInAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get('email') ?? '');
  const senha = String(formData.get('senha') ?? '');

  const forwarded = headers().get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : null;

  if (await isLoginRateLimited(email, ip)) {
    return { error: 'Muitas tentativas. Tente novamente em alguns minutos.' };
  }

  try {
    await signIn('credentials', { email, senha, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      await recordLoginAttempt({ email, ip, success: false });
      return { error: 'Credenciais inválidas.' };
    }
    throw err;
  }

  await recordLoginAttempt({ email, ip, success: true });
  redirect('/dashboard');
}
```

> `headers()` é síncrono no Next 14. Mantenha os demais imports já existentes no arquivo (`signIn`, `AuthError`, `redirect`, `z`, etc.).

- [ ] **Step 4: Gerar e aplicar migration (main + test)**

Run: `npm run db:generate`
Expected: cria `src/db/migrations/0001_*.sql` com a tabela `login_attempts` + índice.

Run: `npm run db:migrate` (aplica em `main`).
Depois, aplicar no branch `test`:

```bash
TEST_DIRECT=$(grep '^DATABASE_URL_TEST_DIRECT=' .env.local | cut -d= -f2-)
POSTGRES_URL_DIRECT="$TEST_DIRECT" node node_modules/drizzle-kit/bin.cjs migrate
```

Expected: ambos aplicam sem erro.

- [ ] **Step 5: Teste de integração (falha primeiro)**

Criar `tests/integration/rate-limit.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { loginAttempts } from '@/db/schema';
import {
  countRecentFailures,
  isLoginRateLimited,
  recordLoginAttempt,
} from '@/modules/auth/rate-limit';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const RUN = Date.now();
const email = `ratelimit-${RUN}@ta-test-admin.example.com`;
const ip = '203.0.113.7';

describe.skipIf(!url)('rate-limit de login', () => {
  afterAll(async () => {
    await tdb.delete(loginAttempts).where(eq(loginAttempts.email, email));
    await sql.end();
  });

  it('não bloqueia abaixo do limite', async () => {
    for (let i = 0; i < 4; i++) {
      await recordLoginAttempt({ email, ip, success: false });
    }
    expect(await countRecentFailures(email, ip, 15)).toBe(4);
    expect(await isLoginRateLimited(email, ip)).toBe(false);
  });

  it('bloqueia ao atingir 5 falhas na janela', async () => {
    await recordLoginAttempt({ email, ip, success: false });
    expect(await isLoginRateLimited(email, ip)).toBe(true);
  });

  it('sucesso não conta como falha', async () => {
    const other = `ok-${RUN}@ta-test-admin.example.com`;
    await recordLoginAttempt({ email: other, ip, success: true });
    expect(await countRecentFailures(other, ip, 15)).toBe(0);
    await tdb.delete(loginAttempts).where(eq(loginAttempts.email, other));
  });
});
```

- [ ] **Step 6: Rodar suíte + typecheck**

Run: `npm run test` (todas), depois `npm run typecheck`.
Expected: tudo PASS (inclui os novos testes de integração, não skipped).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): rate-limit de login baseado em login_attempts (Neon)"
```

---

### Task 4: Painel `/admin` (UI + Server Actions) + E2E

**Files:**
- Create: `src/actions/admin.actions.ts`, `src/app/admin/client-row.tsx`
- Modify: `src/app/admin/page.tsx`, `tests/e2e/helpers/db.ts`
- Test: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `requireAdmin` de `@/modules/auth/require-admin`; o repository da Task 1; `isValidPlano`.
- Produces:
  - Server Actions (todas chamam `requireAdmin()` e `revalidatePath('/admin')`):
    - `activateClientAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState>` (campos: `orgId`, `plano`).
    - `suspendClientAction(_prev, formData)` (campo: `orgId`).
    - `reactivateClientAction(_prev, formData)` (campo: `orgId`).
    - `setPlanoAction(_prev, formData)` (campos: `orgId`, `plano`).
  - `type AdminActionState = { error?: string; ok?: boolean }`.
  - Helper de teste `seedE2EAdmin(email, senha): Promise<void>` em `tests/e2e/helpers/db.ts`.

- [ ] **Step 1: Server Actions de admin**

Criar `src/actions/admin.actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/modules/auth/require-admin';
import {
  activateOrganization,
  isValidPlano,
  reactivateOrganization,
  setPlano,
  suspendOrganization,
} from '@/modules/admin/admin.repository';

export type AdminActionState = { error?: string; ok?: boolean };

export async function activateClientAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  const plano = formData.get('plano');
  if (!orgId) return { error: 'Cliente inválido.' };
  if (!isValidPlano(plano)) return { error: 'Selecione um plano válido.' };

  await activateOrganization({ orgId, plano, actorUserId: admin.id });
  revalidatePath('/admin');
  return { ok: true };
}

export async function suspendClientAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  await suspendOrganization({ orgId, actorUserId: admin.id });
  revalidatePath('/admin');
  return { ok: true };
}

export async function reactivateClientAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  await reactivateOrganization({ orgId, actorUserId: admin.id });
  revalidatePath('/admin');
  return { ok: true };
}

export async function setPlanoAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  const plano = formData.get('plano');
  if (!orgId) return { error: 'Cliente inválido.' };
  if (!isValidPlano(plano)) return { error: 'Selecione um plano válido.' };
  await setPlano({ orgId, plano, actorUserId: admin.id });
  revalidatePath('/admin');
  return { ok: true };
}
```

- [ ] **Step 2: Componente client de ações por linha**

Criar `src/app/admin/client-row.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import {
  activateClientAction,
  reactivateClientAction,
  setPlanoAction,
  suspendClientAction,
  type AdminActionState,
} from '@/actions/admin.actions';

const initial: AdminActionState = {};

type Props = {
  orgId: string;
  name: string;
  status: 'pending' | 'active' | 'suspended';
  plano: string | null;
};

function PlanoSelect() {
  return (
    <select name="plano" className="border p-1" defaultValue="">
      <option value="" disabled>
        Plano…
      </option>
      <option value="weekly">Semanal</option>
      <option value="biweekly">Quinzenal</option>
      <option value="monthly">Mensal</option>
    </select>
  );
}

export function ClientRow({ orgId, name, status, plano }: Props) {
  const [actState, activate] = useFormState(activateClientAction, initial);
  const [suspState, suspend] = useFormState(suspendClientAction, initial);
  const [reactState, reactivate] = useFormState(reactivateClientAction, initial);
  const [planoState, changePlano] = useFormState(setPlanoAction, initial);
  const err = actState.error || suspState.error || reactState.error || planoState.error;

  return (
    <tr className="border-b" data-testid={`org-${orgId}`}>
      <td className="p-2">{name}</td>
      <td className="p-2" data-testid={`status-${orgId}`}>{status}</td>
      <td className="p-2">{plano ?? '—'}</td>
      <td className="p-2">
        <div className="flex flex-wrap items-center gap-2">
          {status === 'pending' ? (
            <form action={activate} className="flex gap-1">
              <input type="hidden" name="orgId" value={orgId} />
              <PlanoSelect />
              <button type="submit" className="bg-black px-2 text-white">Ativar</button>
            </form>
          ) : null}
          {status === 'active' ? (
            <>
              <form action={changePlano} className="flex gap-1">
                <input type="hidden" name="orgId" value={orgId} />
                <PlanoSelect />
                <button type="submit" className="border px-2">Trocar plano</button>
              </form>
              <form action={suspend}>
                <input type="hidden" name="orgId" value={orgId} />
                <button type="submit" className="border px-2">Suspender</button>
              </form>
            </>
          ) : null}
          {status === 'suspended' ? (
            <form action={reactivate}>
              <input type="hidden" name="orgId" value={orgId} />
              <button type="submit" className="border px-2">Reativar</button>
            </form>
          ) : null}
          {err ? <span className="text-sm text-red-600">{err}</span> : null}
        </div>
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: Página `/admin` (substitui o placeholder)**

Substituir `src/app/admin/page.tsx` por:

```tsx
import { requireAdmin } from '@/modules/auth/require-admin';
import { listClientOrganizations } from '@/modules/admin/admin.repository';
import { ClientRow } from './client-row';

export default async function AdminPage() {
  await requireAdmin();
  const clientes = await listClientOrganizations();

  return (
    <main className="p-8">
      <h1 className="mb-4 text-xl font-semibold">Painel Admin — Clientes</h1>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th className="p-2">Empresa</th>
            <th className="p-2">Status</th>
            <th className="p-2">Plano</th>
            <th className="p-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {clientes.length === 0 ? (
            <tr>
              <td className="p-2" colSpan={4}>Nenhum cliente ainda.</td>
            </tr>
          ) : (
            clientes.map((c) => (
              <ClientRow
                key={c.id}
                orgId={c.id}
                name={c.name}
                status={c.status}
                plano={c.plano}
              />
            ))
          )}
        </tbody>
      </table>
    </main>
  );
}
```

- [ ] **Step 4: Helper de teste para semear admin**

Em `tests/e2e/helpers/db.ts`, adicionar (mantendo `cleanupE2E` e `E2E_PREFIX` existentes):

```ts
import { hashPassword } from '@/modules/auth/password';

export async function seedE2EAdmin(email: string, senha: string): Promise<void> {
  const senha_hash = await hashPassword(senha);
  const [org] = await tdb
    .insert(organizations)
    .values({ name: `${E2E_PREFIX}truth-interno`, status: 'active' })
    .returning({ id: organizations.id });
  await tdb
    .insert(users)
    .values({ org_id: org.id, email, senha_hash, role: 'admin_truth' });
}
```

> Garanta que `users` esteja importado de `@/db/schema` no topo do helper (já há `organizations`). O `cleanupE2E` existente, que apaga por `E2E_PREFIX`, já remove a org interna semeada aqui (nome com o prefixo) — confirme que ele apaga `users` antes da `organizations`.

- [ ] **Step 5: E2E (falha primeiro)**

Criar `tests/e2e/admin.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EAdmin } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const adminEmail = `${E2E_PREFIX}admin-${RUN}@example.com`;
const adminSenha = 'admin-forte-123';
const clienteEmail = `${E2E_PREFIX}cli-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-123';

test.beforeAll(async () => {
  await seedE2EAdmin(adminEmail, adminSenha);
});

test.afterAll(async () => {
  await cleanupE2E();
});

test('admin ativa um cliente pendente definindo plano', async ({ page }) => {
  // cria um cliente pendente via cadastro
  await page.goto('/sign-up');
  await page.fill('input[name="orgName"]', `${E2E_PREFIX}Loja-${RUN}`);
  await page.fill('input[name="email"]', clienteEmail);
  await page.fill('input[name="senha"]', clienteSenha);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/aguardando/);

  // loga como admin
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="senha"]', adminSenha);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'));

  // vai ao painel, encontra o cliente, ativa com plano semanal
  await page.goto('/admin');
  await expect(page.getByText(`${E2E_PREFIX}Loja-${RUN}`)).toBeVisible();
  const row = page.locator('tr', { hasText: `${E2E_PREFIX}Loja-${RUN}` });
  await row.locator('select[name="plano"]').selectOption('weekly');
  await row.getByRole('button', { name: 'Ativar' }).click();

  await expect(row.getByText('active')).toBeVisible();
});
```

- [ ] **Step 6: Instalar browser (se necessário) e rodar E2E**

Run: `npx playwright install chromium` (se ainda não instalado).
Run: `npm run test:e2e`
Expected: o novo teste + os do Plano 1 passam. O dev server usa o branch `test` (playwright.config blindado do Plano 1).

- [ ] **Step 7: Verificações finais + main limpo**

Run: `npm run test` (unit/integração — todas), `npm run typecheck`, `npm run lint`, `npm run build`.
Verificar que o `main` não recebeu linhas de teste:

```bash
node -e 'const p=require("postgres");const fs=require("fs");const u=fs.readFileSync(".env.local","utf8").match(/^POSTGRES_URL=(.*)$/m)[1];const sql=p(u,{prepare:false});(async()=>{try{const o=await sql`select count(*)::int n from organizations`;const us=await sql`select count(*)::int n from users`;const la=await sql`select count(*)::int n from login_attempts`;console.log("MAIN orgs:",o[0].n,"users:",us[0].n,"login_attempts:",la[0].n);}finally{await sql.end();}})()'
```

Expected: `MAIN orgs: 0 users: 0` (login_attempts pode ter linhas só se você testou login real em dev; em teste deve ficar no branch test). Se o MAIN tiver linhas de teste, PARAR e reportar.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(admin): painel /admin com gestão de clientes (ativar/suspender/plano) + E2E"
```

---

## Self-Review

**1. Cobertura do spec (§3.2 Painel Admin + §6 rate-limit):**
- Ativar/desativar/suspender clientes + definir plano → Task 1 (repo) + Task 4 (UI/actions). ✅
- Protegido por `admin_truth` → `requireAdmin()` em página e actions (Task 4). ✅
- Rate limiting no login (§6) → Task 3. ✅
- Seed do 1º admin (follow-up obrigatório do Plano 1) → Task 2. ✅
- "Ver status de integrações/histórico/falhas de relatórios" → **DIFERIDO** (depende de `connections`/`reports`, Planos 3/4). A lista mostra status/plano/datas; colunas de integração/relatório entram quando as tabelas existirem.

**2. Lacunas conscientes:**
- A lista de clientes não pagina (ok no volume MVP; adicionar paginação quando crescer).
- Rate-limit não tem job de limpeza de `login_attempts` antigos (adicionar limpeza/retention depois; não bloqueia).

**3. Consistência de tipos:** `Plano`/`OrgStatus` reusados de `@/modules/auth/user.types`. `isValidPlano` (Task 1) consumido pelas actions (Task 4). Assinaturas do repository (Task 1) batem com o consumo nas actions e no seed. `AdminActionState`/`ActionState` distintos e usados corretamente.

---

## Execução

**Plano salvo em `docs/superpowers/plans/2026-06-24-painel-admin.md`.** Execução: subagent-driven (mesmo fluxo do Plano 1) — implementer + review por task, review amplo ao final.
