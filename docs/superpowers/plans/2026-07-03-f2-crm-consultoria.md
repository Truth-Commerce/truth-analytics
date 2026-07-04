# F2 — CRM de Consultoria Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Transformar o relatório em **plano de ação**: cada achado da análise IA (gargalos, sugestões de melhoria, ideias de venda) pode virar uma task com 1 clique; o cliente executa e acompanha num kanban ("Plano de Ação"); o **analista de marketplace** (novo role) gerencia a carteira de orgs, cria tasks manuais/de playbook, aprova ou devolve conclusões; o admin gere playbooks, atribui carteira e mede a consultoria; notificações in-app (bell) + e-mail best-effort fecham o loop; o impacto é medido comparando as vendas do relatório de origem com o relatório mais recente.

**Architecture:** Novo domínio `src/modules/tasks/` (tipos + transições puras, repositórios multi-tenant, heurística relatório→task, impacto) + `src/modules/analista/` (carteira, atribuição, métricas da consultoria) + extensão de `src/modules/notifications/` com camada **in-app** (`notification.repository.ts` com API genérica `notify()` que a F3 reusa para alertas). Actions em `src/actions/tasks.actions.ts` / `task-templates.actions.ts` / `notifications.actions.ts` seguem o padrão existente (gate por sessão → repositório escopado → `revalidatePath`). **Multi-tenancy:** `org_id` NUNCA vem de input para clientes (sempre da sessão); para analista/admin o `orgId` do form é validado contra a carteira (`assertOrgAccess`). Toda mudança de task grava `task_activities`; ações sensíveis (aprovar/devolver/excluir/atribuir carteira) gravam também `audit_log`. UI: kanban **sem lib de drag-and-drop** (botões mover/reordenar — ver Decisões), rotas `/dashboard/plano-de-acao` (cliente), `/analista` + `/analista/[orgId]` (analista), `/admin/playbooks` + `/admin/consultoria` (admin), bell no `AppShell`.

**Tech Stack:** Next.js 14 App Router (server actions + RSC), Drizzle/Neon (branch `test` p/ integração), next-auth v5, Zod, Vitest, Playwright. **Nenhuma dependência nova.** Consome contratos da F0 (logger `src/lib/logger.ts`) e da F1 (primitivos `Toast`/`useToast`, `ConfirmDialog`, `Tabs`, `Dropdown`, `EmptyState`, `Badge` em `src/components/ui/`).

## Global Constraints

- **Regra de ouro do roadmap:** antes de executar, re-validar os trechos citados contra o `master` atual (F0/F1 mudam o terreno: logger, primitivos ui, `reports.etapa`, CHECKs de enum). Divergência pequena = ajustar inline; estrutural = revisar o plano.
- **Multi-tenancy:** repositórios de tasks/comments/activities SEMPRE filtram por `org_id` (e por `task.org_id` via join quando a PK é `task_id`). Cliente: `orgId = access.orgId` da sessão, nunca de formData. Analista/admin: `orgId` de formData/rota passa OBRIGATORIAMENTE por `assertOrgAccess(access, orgId)`. Notifications SEMPRE filtradas por `user_id` da sessão. **Testes de escopo são obrigatórios** (Tasks 4, 6, 7).
- **Autoridade de acesso:** o JWT é retrato; a autoridade é a reconsulta ao DB (`requireAdmin`/`requireActiveOrg`/`requireAnalista` → `getUserAccessById`). O middleware (`auth-config.authorized`) é só a checagem barata na borda — manter o comentário-invariante existente.
- **Analista NÃO é admin:** `requireAnalista` aceita `analista` e `admin_truth` (admin herda tudo), mas o analista só enxerga orgs onde `organizations.analista_id = access.id`.
- **E-mail é best-effort e in-app `notify()` nunca lança** — notificação jamais quebra um fluxo de negócio (padrão do plano de Notificações).
- **Testes:** integração no branch Neon `test` (`describe.skipIf(!process.env.DATABASE_URL_TEST)`, cleanup em `finally`/`afterAll`, prefixo `ta-test-*`); `tests/setup.ts` é intocável. E2E com seed/cleanup via `tests/e2e/helpers/db.ts`.
- **Não quebrar E2E existentes:** preservar testids/fluxos atuais (`latest-report`, `ver-relatorio`, `resumo-executivo`, `metricas`, `report-status`, `report-erro`) — o AppShell e a página de relatório ganham elementos NOVOS, sem remover os antigos.
- **Copy pt-BR** em toda UI, e-mail e notificação. Commits conventional pt-BR. Branch **`feat/f2-crm-consultoria`** a partir de `master`. Nunca push/merge sem revisão.
- **Logger:** usar `logger` (F0) em vez de `console.*` nos módulos novos; sem dados sensíveis em log.

## Decisões de design (travadas neste plano)

1. **Kanban sem lib de DnD — botões de mover + reordenar.** Cada card tem `←`/`→` (transição de status validada por `podeTransicionar`) e `↑`/`↓` (troca `ordem` com o vizinho da mesma coluna). Justificativa: zero dependência nova (dnd-kit ≈ +30kb e exige client state complexo), acessível por teclado de graça, funciona em mobile, e E2E determinístico (clicar botão ≫ simular drag). Drag nativo fica como fast-follow.
2. **Detalhe da task = página** (`/dashboard/plano-de-acao/[taskId]`), não drawer: RSC puro, URL compartilhável (é o `href` das notificações), sem estado client.
3. **Bell com polling leve:** o `NotificationBell` (client) busca `GET /api/notifications` ao montar, a cada **60s** e no `visibilitychange` (voltou à aba). Justificativa: serverless (sem websocket), 1 query indexada (`user_id, lida`) por minuto por usuário logado — custo desprezível; F3 reusa o mesmo endpoint para alertas.
4. **Heurística de tipo** (relatório→task): texto normalizado (lowercase + sem acentos) testado NESTA ordem — `preco` → `logistica` → `anuncio` → `catalogo` → `conta` → `outro` (regexes na Task 3). Prioridade por fonte: `gargalos`→`alta`, `sugestoesMelhoria`→`media`, `ideiasVenda`→`baixa`. `criado_por='ia'`, `report_id` preenchido.
5. **Checklist do playbook vive na descrição da task** como linhas markdown `- [ ] item` (o contrato TRAVADO de `tasks` não tem coluna checklist). O detalhe renderiza essas linhas como checkboxes interativos que reescrevem a linha (`- [x]`) via action. `task_templates.checklist` é `jsonb` (array de strings) e é copiado para a descrição ao instanciar.
6. **Status inicial de toda task é `backlog`** (triagem única para manual/template/IA/cliente). Fluxo canônico: `backlog → todo → em_andamento → em_revisao → concluida`.
7. **Conclusão pelo cliente:** task com `criado_por` `analista`/`ia` vai para `em_revisao` (analista aprova/devolve); task criada pelo próprio cliente vai direto a `concluida`. Cliente não mexe em tasks `em_revisao`/`concluida` (reabrir é do analista/admin).
8. **Dedup do relatório→task:** por `(report_id, titulo)` — o título deriva deterministicamente do texto do achado (`texto.slice(0, 140)`), então re-clicar não duplica.
9. **Badge "Plano de Ação" no nav** = contagem de tasks em `backlog|todo|em_andamento` da org, calculada no layout `(client)` (server) e passada por prop ao AppShell; atualiza via `revalidatePath` das actions.
10. **Conversão relatório→task disponível nas duas pontas:** página de relatório do cliente e painel `/analista/[orgId]` (mesmo componente, mesma action).

## File Structure

| Caminho | Responsabilidade |
|---|---|
| `src/db/schema/tasks.ts`, `task-comments.ts`, `task-activities.ts`, `task-templates.ts`, `notifications.ts` (criar); `organizations.ts`, `index.ts` (mod) | tabelas F2 + `organizations.analista_id` |
| `src/db/migrations/00NN_f2_crm.sql` (gerar+editar) | DDL + CHECKs + índices + CHECK `users.role` com `analista` |
| `scripts/migrate-test.ts` (criar); `package.json` (mod) | migrar o branch Neon `test` |
| `src/modules/auth/user.types.ts` (mod), `require-analista.ts` (criar), `auth-config.ts` (mod) | role `analista` + gates |
| `scripts/seed-analista.ts` (criar) | criar/promover usuário analista na org interna |
| `src/modules/analista/analista.repository.ts` (criar) | `assertOrgAccess`, `listAnalistas`, `setOrgAnalista`, `getCarteira`, `getConsultoriaMetrics` |
| `src/modules/tasks/task.types.ts`, `task-transitions.ts`, `report-to-task.ts` (criar) | domínio puro: tipos, matriz de transição, heurística |
| `src/modules/tasks/task.repository.ts`, `task-comment.repository.ts`, `task-activity.repository.ts`, `task-template.repository.ts`, `task-impact.ts` (criar) | persistência escopada + impacto |
| `src/modules/notifications/notification.repository.ts` (criar), `recipients.ts`, `templates.ts`, `email.ts` (mod) | in-app `notify()` + destinatários por papel + e-mails novos |
| `src/actions/tasks.actions.ts`, `task-templates.actions.ts`, `notifications.actions.ts` (criar), `admin.actions.ts` (mod) | server actions |
| `src/app/api/notifications/route.ts` (criar) | polling do bell |
| `src/app/(client)/dashboard/plano-de-acao/page.tsx`, `[taskId]/page.tsx` (criar); `(client)/layout.tsx` (mod); `dashboard/relatorios/[id]/page.tsx` (mod) | UI cliente |
| `src/app/analista/layout.tsx`, `page.tsx`, `[orgId]/page.tsx`, `[orgId]/tasks/[taskId]/page.tsx` (criar) | UI analista |
| `src/app/admin/playbooks/page.tsx`, `admin/consultoria/page.tsx` (criar); `admin/page.tsx`/`client-row.tsx` (mod) | UI admin |
| `src/components/tasks/*` (criar), `src/components/notifications/NotificationBell.tsx` (criar), `src/components/app-shell.tsx` (mod) | componentes |
| `tests/unit/*`, `tests/integration/*`, `tests/e2e/plano-de-acao.spec.ts`, `tests/e2e/relatorio-task.spec.ts`, `tests/e2e/helpers/db.ts` (mod) | testes |

---

### Task 1: Schema F2 + migration (main + test)

**Files:** Create `src/db/schema/tasks.ts`, `src/db/schema/task-comments.ts`, `src/db/schema/task-activities.ts`, `src/db/schema/task-templates.ts`, `src/db/schema/notifications.ts`, `scripts/migrate-test.ts`; Modify `src/db/schema/organizations.ts`, `src/db/schema/index.ts`, `package.json`; Generate+edit `src/db/migrations/00NN_f2_crm.sql`; Test `tests/unit/schema-crm.test.ts`.

**Interfaces (Produces):**
- `tasks` / `taskComments` / `taskActivities` / `taskTemplates` / `notifications` (Drizzle) + tipos `$inferSelect/$inferInsert`; `organizations.analista_id: uuid | null` (FK `users.id`).
- npm script `db:migrate:test` (roda as migrations no branch Neon `test`).

- [ ] **Step 1 (teste falha):** criar `tests/unit/schema-crm.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';

import { notifications, organizations, taskActivities, taskComments, taskTemplates, tasks } from '@/db/schema';

describe('schema F2 (CRM)', () => {
  it('tasks tem as colunas do contrato', () => {
    const cols = Object.keys(getTableColumns(tasks));
    for (const c of [
      'id', 'org_id', 'titulo', 'descricao', 'tipo', 'prioridade', 'status',
      'prazo', 'criado_por', 'report_id', 'assignee_user_id', 'ordem',
      'created_at', 'updated_at',
    ]) expect(cols).toContain(c);
  });
  it('task_comments referencia task e user', () => {
    const cols = Object.keys(getTableColumns(taskComments));
    expect(cols).toEqual(expect.arrayContaining(['id', 'task_id', 'user_id', 'corpo', 'created_at']));
  });
  it('task_activities tem evento/de/para', () => {
    const cols = Object.keys(getTableColumns(taskActivities));
    expect(cols).toEqual(expect.arrayContaining(['id', 'task_id', 'user_id', 'evento', 'de', 'para', 'created_at']));
  });
  it('task_templates tem checklist jsonb + ativo', () => {
    const cols = Object.keys(getTableColumns(taskTemplates));
    expect(cols).toEqual(expect.arrayContaining(['id', 'titulo', 'tipo', 'descricao', 'checklist', 'ativo', 'created_at', 'updated_at']));
  });
  it('notifications tem user_id/tipo/titulo/corpo/href/lida', () => {
    const cols = Object.keys(getTableColumns(notifications));
    expect(cols).toEqual(expect.arrayContaining(['id', 'user_id', 'tipo', 'titulo', 'corpo', 'href', 'lida', 'created_at']));
  });
  it('organizations tem analista_id', () => {
    expect(Object.keys(getTableColumns(organizations))).toContain('analista_id');
  });
});
```

Rodar `npx vitest run tests/unit/schema-crm.test.ts` → **falha** (`tasks` não exportado de `@/db/schema`).

- [ ] **Step 2 (implementar):** `src/db/schema/tasks.ts`:

```ts
import { date, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { reports } from './reports';
import { users } from './users';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    descricao: text('descricao').notNull().default(''),
    tipo: varchar('tipo', { length: 16 }).notNull().default('outro'),
    prioridade: varchar('prioridade', { length: 8 }).notNull().default('media'),
    status: varchar('status', { length: 16 }).notNull().default('backlog'),
    prazo: date('prazo', { mode: 'string' }),
    criado_por: varchar('criado_por', { length: 8 }).notNull(),
    report_id: uuid('report_id').references(() => reports.id),
    assignee_user_id: uuid('assignee_user_id').references(() => users.id),
    ordem: integer('ordem').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_status_idx: index('tasks_org_status_idx').on(t.org_id, t.status),
    report_idx: index('tasks_report_idx').on(t.report_id),
  }),
);

export type TaskRecord = typeof tasks.$inferSelect;
export type NewTaskRecord = typeof tasks.$inferInsert;
```

`src/db/schema/task-comments.ts`:

```ts
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { tasks } from './tasks';
import { users } from './users';

export const taskComments = pgTable(
  'task_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    corpo: text('corpo').notNull(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({ task_idx: index('task_comments_task_idx').on(t.task_id) }),
);

export type TaskCommentRecord = typeof taskComments.$inferSelect;
```

`src/db/schema/task-activities.ts`:

```ts
import { index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { tasks } from './tasks';
import { users } from './users';

export const taskActivities = pgTable(
  'task_activities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    task_id: uuid('task_id')
      .notNull()
      .references(() => tasks.id),
    user_id: uuid('user_id').references(() => users.id),
    evento: varchar('evento', { length: 32 }).notNull(),
    de: text('de'),
    para: text('para'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({ task_idx: index('task_activities_task_idx').on(t.task_id) }),
);

export type TaskActivityRecord = typeof taskActivities.$inferSelect;
```

`src/db/schema/task-templates.ts`:

```ts
import { boolean, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const taskTemplates = pgTable('task_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  titulo: varchar('titulo', { length: 200 }).notNull(),
  tipo: varchar('tipo', { length: 16 }).notNull().default('outro'),
  descricao: text('descricao').notNull().default(''),
  checklist: jsonb('checklist').notNull().default([]),
  ativo: boolean('ativo').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});

export type TaskTemplateRecord = typeof taskTemplates.$inferSelect;
```

`src/db/schema/notifications.ts`:

```ts
import { boolean, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tipo: varchar('tipo', { length: 32 }).notNull(),
    titulo: varchar('titulo', { length: 200 }).notNull(),
    corpo: text('corpo').notNull().default(''),
    href: varchar('href', { length: 500 }),
    lida: boolean('lida').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => ({ user_lida_idx: index('notifications_user_lida_idx').on(t.user_id, t.lida) }),
);

export type NotificationRecord = typeof notifications.$inferSelect;
```

Em `organizations.ts`, adicionar a coluna (o FK circular orgs↔users exige callback com anotação de tipo, padrão Drizzle):

```ts
import { type AnyPgColumn, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { users } from './users';

// dentro de organizations:
  analista_id: uuid('analista_id').references((): AnyPgColumn => users.id),
```

> Se o import circular `organizations ⇄ users` travar o `tsc`, mover a referência para SQL puro na migration (coluna `uuid` sem `.references()` no Drizzle + `ALTER TABLE ... ADD CONSTRAINT organizations_analista_id_users_id_fk FOREIGN KEY ...` no arquivo gerado). O teste do Step 1 só exige a coluna.

Atualizar `src/db/schema/index.ts` com os 5 novos exports (manter ordem: tabelas base primeiro).

- [ ] **Step 3:** `npx vitest run tests/unit/schema-crm.test.ts` → **passa**. `npm run typecheck` → limpo.
- [ ] **Step 4 (migration):** `npm run db:generate` → gera `src/db/migrations/00NN_*.sql` (N = próximo número no repo pós-F0/F1). **Editar o arquivo gerado** adicionando ao final (CHECKs — Drizzle não os gera a partir deste schema; e o CHECK de role da F0 precisa ser recriado com `analista`):

```sql
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tipo_check" CHECK ("tipo" IN ('catalogo','preco','anuncio','logistica','conta','outro'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_prioridade_check" CHECK ("prioridade" IN ('baixa','media','alta'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check" CHECK ("status" IN ('backlog','todo','em_andamento','em_revisao','concluida'));--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_criado_por_check" CHECK ("criado_por" IN ('analista','cliente','ia'));--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_tipo_check" CHECK ("tipo" IN ('catalogo','preco','anuncio','logistica','conta','outro'));--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('admin_truth','analista','client'));
```

> Re-validação F0: se o CHECK de role da F0 tiver outro nome, descobrir com `SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype='c';` e dropar esse nome.

- [ ] **Step 5 (migrate test):** criar `scripts/migrate-test.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL_TEST_DIRECT ?? process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST ausente — defina no .env.local');
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: './src/db/migrations' });
    console.info('[migrate-test] branch de teste migrado com sucesso');
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

`package.json` scripts: `"db:migrate:test": "node --env-file=.env.local --import tsx scripts/migrate-test.ts"`.

- [ ] **Step 6:** rodar `npm run db:migrate` (main) e `npm run db:migrate:test` (test) → ambas terminam sem erro; conferir no test: `tasks`, `task_comments`, `task_activities`, `task_templates`, `notifications` existem e `INSERT INTO tasks (org_id,titulo,criado_por,tipo) VALUES (<org>, 'x','cliente','invalido')` **falha** no CHECK.
- [ ] **Step 7:** `npm run test` + `npm run typecheck` → verdes. **Commit:** `feat(crm): tabelas tasks/comments/activities/templates/notifications + carteira do analista (migration main+test)`.

---

### Task 2: Role `analista` — tipos, gates, middleware, seed e atribuição

**Files:** Modify `src/modules/auth/user.types.ts`, `src/modules/auth/auth-config.ts`, `src/actions/admin.actions.ts`; Create `src/modules/auth/require-analista.ts`, `src/modules/analista/analista.repository.ts`, `scripts/seed-analista.ts`; Modify `package.json`; Test `tests/unit/auth-callbacks.test.ts` (estender), `tests/integration/analista-carteira.test.ts`.

**Interfaces (Produces):**
- `UserRole = 'admin_truth' | 'analista' | 'client'`.
- `requireAnalista(): Promise<UserAccess>` — role `analista` ou `admin_truth`, senão `redirect('/sign-in')` (padrão `requireAdmin`).
- `analista.repository.ts`:
  - `assertOrgAccess(access: UserAccess, orgId: string): Promise<void>` — admin passa; analista passa se `organizations.analista_id === access.id`; senão `throw new Error('acesso_negado')`.
  - `listAnalistas(): Promise<Array<{ id: string; email: string }>>` — `users.role = 'analista'`.
  - `setOrgAnalista(input: { orgId: string; analistaUserId: string | null; actorUserId: string }): Promise<void>` — valida que o alvo é um analista (quando não-null), atualiza `organizations.analista_id`, `recordAudit({ acao: 'org.analista_atribuido' })`.
- `admin.actions.ts`: `setOrgAnalistaAction(_prev: AdminActionState, formData: FormData): Promise<AdminActionState>` (`requireAdmin`; campos `orgId`, `analistaUserId` — string vazia = remover).
- `auth-config.ts`: `analistaRoutes = ['/analista']` — logado + role `analista`/`admin_truth`, senão redirect `/dashboard`.
- Script `db:seed-analista` (envs `ANALISTA_EMAIL`, `ANALISTA_SENHA`): cria (ou promove) usuário `analista` **na org interna** (a org do usuário `admin_truth` mais antigo).

**Consumes:** `getSessionContext`, `getUserAccessById`, `recordAudit`, `hashPassword`, `normalizeEmail`.

- [ ] **Step 1 (teste falha, unit):** estender `tests/unit/auth-callbacks.test.ts` com o bloco de borda do analista (seguir o padrão dos testes existentes de `authConfig.callbacks.authorized`):

```ts
it('rota /analista: analista entra, cliente é redirecionado, deslogado bloqueado', () => {
  const url = new URL('http://localhost/analista');
  const asRole = (role?: string) =>
    authConfig.callbacks.authorized!({
      auth: role ? ({ user: { role } } as never) : null,
      request: { nextUrl: url } as never,
    });
  expect(asRole('analista')).toBe(true);
  expect(asRole('admin_truth')).toBe(true);
  const cliente = asRole('client');
  expect(cliente).toBeInstanceOf(Response); // redirect /dashboard
  expect(asRole(undefined)).toBe(false);
});
```

`npx vitest run tests/unit/auth-callbacks.test.ts` → **falha** (hoje `/analista` cai no `return true` público).

- [ ] **Step 2 (implementar):** em `user.types.ts`: `export type UserRole = 'admin_truth' | 'analista' | 'client';`. Em `auth-config.ts`, após `adminRoutes`:

```ts
const analistaRoutes = ['/analista'];
// dentro de authorized(), ANTES do bloco isClientRoute:
const isAnalistaRoute = analistaRoutes.some((r) => nextUrl.pathname.startsWith(r));
if (isAnalistaRoute) {
  if (!isLoggedIn) return false;
  const role = auth?.user?.role;
  if (role !== 'analista' && role !== 'admin_truth') {
    return Response.redirect(new URL('/dashboard', nextUrl));
  }
  return true;
}
```

`src/modules/auth/require-analista.ts`:

```ts
import { redirect } from 'next/navigation';

import { getSessionContext } from '@/modules/auth/session';
import type { UserAccess } from '@/modules/auth/user.types';

export async function requireAnalista(): Promise<UserAccess> {
  const access = await getSessionContext();
  if (!access || (access.role !== 'analista' && access.role !== 'admin_truth')) {
    redirect('/sign-in');
  }
  return access;
}
```

- [ ] **Step 3 (implementar repositório):** `src/modules/analista/analista.repository.ts`:

```ts
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, users } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import type { UserAccess } from '@/modules/auth/user.types';

export async function assertOrgAccess(access: UserAccess, orgId: string): Promise<void> {
  if (access.role === 'admin_truth') return;
  if (access.role !== 'analista') throw new Error('acesso_negado');
  const [row] = await db
    .select({ analista_id: organizations.analista_id })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row || row.analista_id !== access.id) throw new Error('acesso_negado');
}

export async function listAnalistas(): Promise<Array<{ id: string; email: string }>> {
  return db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.role, 'analista'));
}

export async function setOrgAnalista(input: {
  orgId: string;
  analistaUserId: string | null;
  actorUserId: string;
}): Promise<void> {
  if (input.analistaUserId) {
    const [alvo] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, input.analistaUserId))
      .limit(1);
    if (!alvo || alvo.role !== 'analista') throw new Error('analista_invalido');
  }
  await db
    .update(organizations)
    .set({ analista_id: input.analistaUserId })
    .where(eq(organizations.id, input.orgId));
  await recordAudit({
    orgId: input.orgId,
    userId: input.actorUserId,
    acao: 'org.analista_atribuido',
    detalhes: { analistaUserId: input.analistaUserId },
  });
}
```

`setOrgAnalistaAction` em `admin.actions.ts` (mesmo shape das actions existentes: `requireAdmin`, try/catch com `analista_invalido` → `{ error: 'Analista inválido.' }`, `revalidatePath('/admin')`, `{ ok: true }`).

`scripts/seed-analista.ts` (espelha `seed-admin.ts`): resolve org interna (`select users.org_id where role='admin_truth' order by created_at limit 1`; erro claro se não houver admin), cria user `role:'analista'` com `ANALISTA_EMAIL`/`ANALISTA_SENHA` (ou promove se o e-mail já existir), `recordAudit({ acao: 'analista.seed' })`. Script npm: `"db:seed-analista": "node --env-file=.env.local --import tsx scripts/seed-analista.ts"`.

- [ ] **Step 4 (teste falha → passa, integração):** `tests/integration/analista-carteira.test.ts`:

```ts
import { inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { auditLog, organizations, users } from '@/db/schema';
import { assertOrgAccess, listAnalistas, setOrgAnalista } from '@/modules/analista/analista.repository';
import { hashPassword } from '@/modules/auth/password';
import type { UserAccess } from '@/modules/auth/user.types';

const PREFIX = 'ta-test-carteira-';
const asAccess = (id: string, role: UserAccess['role']): UserAccess =>
  ({ id, orgId: 'x', role, orgStatus: 'active', plano: null }) as UserAccess;

describe.skipIf(!process.env.DATABASE_URL_TEST)('carteira do analista', () => {
  let orgA = '';
  let orgB = '';
  let analistaId = '';
  const userIds: string[] = [];

  beforeAll(async () => {
    const senha_hash = await hashPassword('senha-forte-teste-123');
    const [a] = await db.insert(organizations).values({ name: `${PREFIX}A`, status: 'active' }).returning({ id: organizations.id });
    const [b] = await db.insert(organizations).values({ name: `${PREFIX}B`, status: 'active' }).returning({ id: organizations.id });
    orgA = a.id; orgB = b.id;
    const [an] = await db.insert(users).values({ org_id: orgA, email: `${PREFIX}an@example.com`, senha_hash, role: 'analista' }).returning({ id: users.id });
    analistaId = an.id; userIds.push(an.id);
    await setOrgAnalista({ orgId: orgA, analistaUserId: analistaId, actorUserId: analistaId });
  });

  afterAll(async () => {
    await db.delete(auditLog).where(inArray(auditLog.org_id, [orgA, orgB].filter(Boolean)));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organizations).where(like(organizations.name, `${PREFIX}%`));
  });

  it('analista acessa org da carteira e é barrado fora dela', async () => {
    await expect(assertOrgAccess(asAccess(analistaId, 'analista'), orgA)).resolves.toBeUndefined();
    await expect(assertOrgAccess(asAccess(analistaId, 'analista'), orgB)).rejects.toThrow('acesso_negado');
  });

  it('admin passa em qualquer org; cliente nunca passa', async () => {
    await expect(assertOrgAccess(asAccess('qualquer', 'admin_truth'), orgB)).resolves.toBeUndefined();
    await expect(assertOrgAccess(asAccess(analistaId, 'client'), orgA)).rejects.toThrow('acesso_negado');
  });

  it('listAnalistas devolve o analista; setOrgAnalista rejeita não-analista', async () => {
    const lista = await listAnalistas();
    expect(lista.some((u) => u.id === analistaId)).toBe(true);
    await expect(
      setOrgAnalista({ orgId: orgB, analistaUserId: orgB, actorUserId: analistaId }),
    ).rejects.toThrow('analista_invalido');
  });
});
```

`npx vitest run tests/integration/analista-carteira.test.ts tests/unit/auth-callbacks.test.ts` → **passa**.

- [ ] **Step 5:** `npm run test` + `npm run typecheck` → verdes. **Commit:** `feat(crm): role analista, gate requireAnalista, carteira por org e seed`.

---

### Task 3: Domínio puro de tasks — tipos, transições e heurística relatório→task

**Files:** Create `src/modules/tasks/task.types.ts`, `src/modules/tasks/task-transitions.ts`, `src/modules/tasks/report-to-task.ts`; Test `tests/unit/task-transitions.test.ts`, `tests/unit/report-to-task.test.ts`.

**Interfaces (Produces):**
- `task.types.ts`:
  - `TASK_STATUSES = ['backlog','todo','em_andamento','em_revisao','concluida'] as const`; `TaskStatus`; `TASK_TIPOS = ['catalogo','preco','anuncio','logistica','conta','outro'] as const`; `TaskTipo`; `TASK_PRIORIDADES = ['baixa','media','alta'] as const`; `TaskPrioridade`; `TaskCriadoPor = 'analista' | 'cliente' | 'ia'`; `TaskAtor = 'cliente' | 'analista' | 'admin'`.
  - Labels pt-BR: `STATUS_TASK_LABEL: Record<TaskStatus, string>` (`backlog: 'Backlog'`, `todo: 'A fazer'`, `em_andamento: 'Em andamento'`, `em_revisao: 'Em revisão'`, `concluida: 'Concluída'`), `TIPO_TASK_LABEL`, `PRIORIDADE_TASK_LABEL`.
  - `TaskSummary = { id: string; titulo: string; tipo: TaskTipo; prioridade: TaskPrioridade; status: TaskStatus; prazo: string | null; criadoPor: TaskCriadoPor; reportId: string | null; ordem: number; createdAt: Date }`; `TaskDetail = TaskSummary & { descricao: string; assigneeUserId: string | null; orgId: string; updatedAt: Date }`.
  - `atorFromRole(role: UserRole): TaskAtor` (`client→cliente`, `analista→analista`, `admin_truth→admin`).
  - `isTaskAtrasada(task: Pick<TaskSummary, 'prazo' | 'status'>, hoje?: Date): boolean` — `prazo < hoje (YYYY-MM-DD)` e `status !== 'concluida'`.
- `task-transitions.ts`:
  - `proximoStatusAoConcluir(criadoPor: TaskCriadoPor): TaskStatus` — `'cliente' → 'concluida'`, senão `'em_revisao'`.
  - `podeTransicionar(input: { ator: TaskAtor; criadoPor: TaskCriadoPor; de: TaskStatus; para: TaskStatus }): boolean`.
- `report-to-task.ts`:
  - `FONTES_ANALISE = ['gargalos','sugestoesMelhoria','ideiasVenda'] as const`; `FonteAnalise`.
  - `PRIORIDADE_POR_FONTE: Record<FonteAnalise, TaskPrioridade>` (alta/media/baixa).
  - `normalizarTexto(s: string): string`; `inferTipoTask(texto: string): TaskTipo`; `tituloFromItem(texto: string): string` (= `texto.trim().slice(0, 140)`); `itemToTaskInput(input: { fonte: FonteAnalise; texto: string; reportId: string }): { titulo; descricao; tipo; prioridade; criadoPor: 'ia'; reportId }` (descricao = texto completo + `\n\n_Origem: análise IA do relatório._`).

- [ ] **Step 1 (teste falha):** `tests/unit/task-transitions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { podeTransicionar, proximoStatusAoConcluir } from '@/modules/tasks/task-transitions';

describe('transições de task', () => {
  it('concluir: task do cliente vai direto a concluida; de analista/ia vai a em_revisao', () => {
    expect(proximoStatusAoConcluir('cliente')).toBe('concluida');
    expect(proximoStatusAoConcluir('analista')).toBe('em_revisao');
    expect(proximoStatusAoConcluir('ia')).toBe('em_revisao');
  });

  it('cliente move livremente entre backlog/todo/em_andamento', () => {
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'backlog', para: 'todo' })).toBe(true);
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'em_andamento', para: 'todo' })).toBe(true);
  });

  it('cliente NÃO conclui direto task criada por ia/analista (vai a em_revisao)', () => {
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'em_andamento', para: 'concluida' })).toBe(false);
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'em_andamento', para: 'em_revisao' })).toBe(true);
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'cliente', de: 'em_andamento', para: 'concluida' })).toBe(true);
  });

  it('cliente não mexe em em_revisao/concluida', () => {
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'ia', de: 'em_revisao', para: 'em_andamento' })).toBe(false);
    expect(podeTransicionar({ ator: 'cliente', criadoPor: 'cliente', de: 'concluida', para: 'todo' })).toBe(false);
  });

  it('analista e admin fazem qualquer transição (aprovar, devolver, reabrir)', () => {
    expect(podeTransicionar({ ator: 'analista', criadoPor: 'ia', de: 'em_revisao', para: 'concluida' })).toBe(true);
    expect(podeTransicionar({ ator: 'analista', criadoPor: 'ia', de: 'em_revisao', para: 'em_andamento' })).toBe(true);
    expect(podeTransicionar({ ator: 'admin', criadoPor: 'cliente', de: 'concluida', para: 'todo' })).toBe(true);
  });

  it('de === para é sempre inválido', () => {
    expect(podeTransicionar({ ator: 'admin', criadoPor: 'ia', de: 'todo', para: 'todo' })).toBe(false);
  });
});
```

E `tests/unit/report-to-task.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { inferTipoTask, itemToTaskInput, tituloFromItem } from '@/modules/tasks/report-to-task';

describe('heurística relatório→task', () => {
  it('classifica por palavra-chave (com acentos)', () => {
    expect(inferTipoTask('Reajustar o preço do SKU-001 para proteger a margem')).toBe('preco');
    expect(inferTipoTask('Custo de frete elevado no canal ML')).toBe('logistica');
    expect(inferTipoTask('Melhorar título e fotos do anúncio principal')).toBe('anuncio');
    expect(inferTipoTask('Cadastrar EAN nos produtos sem código')).toBe('catalogo');
    expect(inferTipoTask('Responder reclamações para recuperar reputação')).toBe('conta');
    expect(inferTipoTask('Fazer live de lançamento no Instagram')).toBe('outro');
  });

  it('preço vence quando há ambiguidade (ordem de precedência)', () => {
    expect(inferTipoTask('Baixar o preço do anúncio com frete grátis')).toBe('preco');
  });

  it('itemToTaskInput monta task da IA com prioridade por fonte', () => {
    const t = itemToTaskInput({ fonte: 'gargalos', texto: 'Custo de frete elevado', reportId: 'r1' });
    expect(t).toMatchObject({ titulo: 'Custo de frete elevado', tipo: 'logistica', prioridade: 'alta', criadoPor: 'ia', reportId: 'r1' });
    expect(itemToTaskInput({ fonte: 'ideiasVenda', texto: 'Criar kit promocional', reportId: 'r1' }).prioridade).toBe('baixa');
  });

  it('tituloFromItem trunca em 140 chars', () => {
    expect(tituloFromItem('x'.repeat(200))).toHaveLength(140);
  });
});
```

`npx vitest run tests/unit/task-transitions.test.ts tests/unit/report-to-task.test.ts` → **falha** (módulos inexistentes).

- [ ] **Step 2 (implementar):** `task.types.ts` conforme Interfaces. `task-transitions.ts`:

```ts
import type { TaskAtor, TaskCriadoPor, TaskStatus } from './task.types';

export function proximoStatusAoConcluir(criadoPor: TaskCriadoPor): TaskStatus {
  return criadoPor === 'cliente' ? 'concluida' : 'em_revisao';
}

const LIVRES_CLIENTE: readonly TaskStatus[] = ['backlog', 'todo', 'em_andamento'];

export function podeTransicionar(input: {
  ator: TaskAtor;
  criadoPor: TaskCriadoPor;
  de: TaskStatus;
  para: TaskStatus;
}): boolean {
  const { ator, criadoPor, de, para } = input;
  if (de === para) return false;
  if (ator === 'analista' || ator === 'admin') return true;
  // cliente
  if (!LIVRES_CLIENTE.includes(de)) return false;
  if (LIVRES_CLIENTE.includes(para)) return true;
  return para === proximoStatusAoConcluir(criadoPor);
}
```

`report-to-task.ts`:

```ts
import type { TaskPrioridade, TaskTipo } from './task.types';

export const FONTES_ANALISE = ['gargalos', 'sugestoesMelhoria', 'ideiasVenda'] as const;
export type FonteAnalise = (typeof FONTES_ANALISE)[number];

export const PRIORIDADE_POR_FONTE: Record<FonteAnalise, TaskPrioridade> = {
  gargalos: 'alta',
  sugestoesMelhoria: 'media',
  ideiasVenda: 'baixa',
};

export function normalizarTexto(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

// Ordem de precedência: preco > logistica > anuncio > catalogo > conta > outro.
const REGRAS: ReadonlyArray<{ tipo: TaskTipo; re: RegExp }> = [
  { tipo: 'preco', re: /(preco|precific|margem|desconto|reajust|mais barato|mais caro)/ },
  { tipo: 'logistica', re: /(frete|envio|entrega|logistic|fulfillment|\bfull\b|prazo)/ },
  { tipo: 'anuncio', re: /(anuncio|titulo|foto|imagem|descricao|\bads\b|publicidade|ranquea|palavra[- ]chave|visita)/ },
  { tipo: 'catalogo', re: /(catalogo|cadastr|\bean\b|\bsku\b|variac|\bkit\b|portfolio|mix de produto|ficha tecnica)/ },
  { tipo: 'conta', re: /(reputac|atendimento|cancelament|reclamac|medalha|resposta|\bconta\b)/ },
];

export function inferTipoTask(texto: string): TaskTipo {
  const t = normalizarTexto(texto);
  for (const { tipo, re } of REGRAS) if (re.test(t)) return tipo;
  return 'outro';
}

export function tituloFromItem(texto: string): string {
  return texto.trim().slice(0, 140);
}

export function itemToTaskInput(input: { fonte: FonteAnalise; texto: string; reportId: string }): {
  titulo: string;
  descricao: string;
  tipo: TaskTipo;
  prioridade: TaskPrioridade;
  criadoPor: 'ia';
  reportId: string;
} {
  return {
    titulo: tituloFromItem(input.texto),
    descricao: `${input.texto.trim()}\n\n_Origem: análise IA do relatório._`,
    tipo: inferTipoTask(input.texto),
    prioridade: PRIORIDADE_POR_FONTE[input.fonte],
    criadoPor: 'ia',
    reportId: input.reportId,
  };
}
```

- [ ] **Step 3:** testes do Step 1 → **passam**. `npm run typecheck` limpo. **Commit:** `feat(crm): domínio de tasks — transições por papel e heurística relatório→task`.

---

### Task 4: `task.repository` — CRUD escopado, ordem no kanban e atividades

**Files:** Create `src/modules/tasks/task.repository.ts`, `src/modules/tasks/task-activity.repository.ts`; Test `tests/integration/task-repository.test.ts`.

**Interfaces (Produces):**
- `task-activity.repository.ts`:
  - `recordTaskActivity(input: { taskId: string; userId?: string | null; evento: string; de?: string | null; para?: string | null }): Promise<void>`.
  - `listTaskActivities(taskId: string, orgId: string): Promise<Array<{ id: string; evento: string; de: string | null; para: string | null; userId: string | null; createdAt: Date }>>` — join `tasks` filtrando `tasks.org_id = orgId` (escopo!), desc, limit 50.
- `task.repository.ts` (todas escopadas por `orgId`):
  - `listTasksByOrg(orgId: string): Promise<TaskSummary[]>` — ordena `status, ordem`.
  - `getTaskById(taskId: string, orgId: string): Promise<TaskDetail | null>`.
  - `createTask(input: { orgId: string; titulo: string; descricao?: string; tipo: TaskTipo; prioridade: TaskPrioridade; criadoPor: TaskCriadoPor; prazo?: string | null; reportId?: string | null; assigneeUserId?: string | null; actorUserId?: string | null }): Promise<string>` — `status:'backlog'`, `ordem = max(ordem)+1` na coluna, activity `criada`.
  - `updateTask(input: { taskId: string; orgId: string; actorUserId: string; patch: Partial<Pick<..., 'titulo'|'descricao'|'tipo'|'prioridade'|'prazo'|'assigneeUserId'>> }): Promise<void>` — activity `editada` (e `prazo`/`assignee` quando mudarem).
  - `moveTask(input: { taskId: string; orgId: string; ator: TaskAtor; actorUserId: string; para: TaskStatus }): Promise<TaskStatus>` — carrega a task escopada, valida `podeTransicionar` (`throw new Error('transicao_invalida')`), `ordem = max+1` no destino, activity `status` com `de`/`para`; retorna o novo status.
  - `reorderTask(input: { taskId: string; orgId: string; direcao: 'up' | 'down' }): Promise<void>` — troca `ordem` com o vizinho da mesma `(org_id, status)`; sem vizinho = no-op.
  - `deleteTask(taskId: string, orgId: string): Promise<void>` — apaga comments/activities/task (nesta ordem).
  - `countTasksAbertas(orgId: string): Promise<number>` — `status IN ('backlog','todo','em_andamento')`.
  - `countTasksByStatus(orgId: string): Promise<Record<TaskStatus, number>>`.
  - `listTaskTitulosByReport(reportId: string, orgId: string): Promise<string[]>` — para o dedup relatório→task.

**Consumes:** `podeTransicionar` (Task 3), schema (Task 1).

- [ ] **Step 1 (teste falha):** `tests/integration/task-repository.test.ts` — seed 2 orgs (`ta-test-task-A/B`) + 1 user por org; cobrir:
  - `createTask` em A → `listTasksByOrg(A)` devolve 1; **`listTasksByOrg(B)` devolve 0 e `getTaskById(taskA, B)` é `null`** (escopo entre orgs — obrigatório).
  - `ordem` incremental: 2 tasks em backlog → ordens 1 e 2; `reorderTask` up na 2ª → ordens trocadas; up na 1ª = no-op.
  - `moveTask` cliente `backlog→todo` ok e grava activity `status` (`de:'backlog'`, `para:'todo'`); cliente `em_andamento→concluida` com `criadoPor:'ia'` → rejeita `transicao_invalida`; analista `em_revisao→concluida` ok.
  - `moveTask` com `orgId` de B sobre task de A → task não encontrada (`throw 'task_nao_encontrada'`).
  - `countTasksAbertas` e `listTaskTitulosByReport` corretos (semear report com `seed` direto na tabela `reports`).
  - Cleanup em `afterAll`: `task_activities` → `task_comments` → `tasks` → `reports` → `users` → `organizations` (prefixo).

  Rodar → **falha** (módulos inexistentes).
- [ ] **Step 2 (implementar):** `task-activity.repository.ts`:

```ts
import { desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { taskActivities, tasks } from '@/db/schema';

export async function recordTaskActivity(input: {
  taskId: string;
  userId?: string | null;
  evento: string;
  de?: string | null;
  para?: string | null;
}): Promise<void> {
  await db.insert(taskActivities).values({
    task_id: input.taskId,
    user_id: input.userId ?? null,
    evento: input.evento,
    de: input.de ?? null,
    para: input.para ?? null,
  });
}

export async function listTaskActivities(taskId: string, orgId: string) {
  const rows = await db
    .select({
      id: taskActivities.id,
      evento: taskActivities.evento,
      de: taskActivities.de,
      para: taskActivities.para,
      userId: taskActivities.user_id,
      createdAt: taskActivities.created_at,
    })
    .from(taskActivities)
    .innerJoin(tasks, eq(taskActivities.task_id, tasks.id))
    .where(eq(taskActivities.task_id, taskId))
    .orderBy(desc(taskActivities.created_at))
    .limit(50);
  // escopo: valida que a task pertence à org (join não filtra org — checar explícito)
  const [own] = await db.select({ org_id: tasks.org_id }).from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!own || own.org_id !== orgId) return [];
  return rows;
}
```

`task.repository.ts` (núcleo — demais funções seguem o mesmo shape escopado):

```ts
import { and, count, desc, eq, inArray, max, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { taskComments, taskActivities, tasks } from '@/db/schema';
import type {
  TaskAtor, TaskCriadoPor, TaskDetail, TaskPrioridade, TaskStatus, TaskSummary, TaskTipo,
} from './task.types';
import { podeTransicionar } from './task-transitions';
import { recordTaskActivity } from './task-activity.repository';

type TaskRow = typeof tasks.$inferSelect;

function rowToSummary(r: TaskRow): TaskSummary {
  return {
    id: r.id, titulo: r.titulo, tipo: r.tipo as TaskTipo,
    prioridade: r.prioridade as TaskPrioridade, status: r.status as TaskStatus,
    prazo: r.prazo, criadoPor: r.criado_por as TaskCriadoPor,
    reportId: r.report_id, ordem: r.ordem, createdAt: r.created_at,
  };
}

function rowToDetail(r: TaskRow): TaskDetail {
  return { ...rowToSummary(r), descricao: r.descricao, assigneeUserId: r.assignee_user_id, orgId: r.org_id, updatedAt: r.updated_at };
}

async function proximaOrdem(orgId: string, status: TaskStatus): Promise<number> {
  const [row] = await db
    .select({ m: max(tasks.ordem) })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), eq(tasks.status, status)));
  return (row?.m ?? 0) + 1;
}

export async function listTasksByOrg(orgId: string): Promise<TaskSummary[]> {
  const rows = await db.select().from(tasks).where(eq(tasks.org_id, orgId)).orderBy(tasks.status, tasks.ordem);
  return rows.map(rowToSummary);
}

export async function getTaskById(taskId: string, orgId: string): Promise<TaskDetail | null> {
  const [row] = await db
    .select().from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgId)))
    .limit(1);
  return row ? rowToDetail(row) : null;
}

export async function createTask(input: {
  orgId: string; titulo: string; descricao?: string; tipo: TaskTipo; prioridade: TaskPrioridade;
  criadoPor: TaskCriadoPor; prazo?: string | null; reportId?: string | null;
  assigneeUserId?: string | null; actorUserId?: string | null;
}): Promise<string> {
  const ordem = await proximaOrdem(input.orgId, 'backlog');
  const [row] = await db
    .insert(tasks)
    .values({
      org_id: input.orgId, titulo: input.titulo, descricao: input.descricao ?? '',
      tipo: input.tipo, prioridade: input.prioridade, status: 'backlog',
      prazo: input.prazo ?? null, criado_por: input.criadoPor,
      report_id: input.reportId ?? null, assignee_user_id: input.assigneeUserId ?? null, ordem,
    })
    .returning({ id: tasks.id });
  await recordTaskActivity({ taskId: row.id, userId: input.actorUserId ?? null, evento: 'criada', para: 'backlog' });
  return row.id;
}

export async function moveTask(input: {
  taskId: string; orgId: string; ator: TaskAtor; actorUserId: string; para: TaskStatus;
}): Promise<TaskStatus> {
  const task = await getTaskById(input.taskId, input.orgId);
  if (!task) throw new Error('task_nao_encontrada');
  if (!podeTransicionar({ ator: input.ator, criadoPor: task.criadoPor, de: task.status, para: input.para })) {
    throw new Error('transicao_invalida');
  }
  const ordem = await proximaOrdem(input.orgId, input.para);
  await db
    .update(tasks)
    .set({ status: input.para, ordem })
    .where(and(eq(tasks.id, input.taskId), eq(tasks.org_id, input.orgId)));
  await recordTaskActivity({ taskId: input.taskId, userId: input.actorUserId, evento: 'status', de: task.status, para: input.para });
  return input.para;
}

export async function reorderTask(input: { taskId: string; orgId: string; direcao: 'up' | 'down' }): Promise<void> {
  const task = await getTaskById(input.taskId, input.orgId);
  if (!task) throw new Error('task_nao_encontrada');
  const vizinhos = await db
    .select({ id: tasks.id, ordem: tasks.ordem })
    .from(tasks)
    .where(and(
      eq(tasks.org_id, input.orgId),
      eq(tasks.status, task.status),
      input.direcao === 'up' ? sql`${tasks.ordem} < ${task.ordem}` : sql`${tasks.ordem} > ${task.ordem}`,
    ))
    .orderBy(input.direcao === 'up' ? desc(tasks.ordem) : tasks.ordem)
    .limit(1);
  const vizinho = vizinhos[0];
  if (!vizinho) return; // já é o extremo
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ ordem: vizinho.ordem }).where(eq(tasks.id, input.taskId));
    await tx.update(tasks).set({ ordem: task.ordem }).where(eq(tasks.id, vizinho.id));
  });
}

export async function deleteTask(taskId: string, orgId: string): Promise<void> {
  const task = await getTaskById(taskId, orgId);
  if (!task) throw new Error('task_nao_encontrada');
  await db.transaction(async (tx) => {
    await tx.delete(taskComments).where(eq(taskComments.task_id, taskId));
    await tx.delete(taskActivities).where(eq(taskActivities.task_id, taskId));
    await tx.delete(tasks).where(and(eq(tasks.id, taskId), eq(tasks.org_id, orgId)));
  });
}

export async function countTasksAbertas(orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), inArray(tasks.status, ['backlog', 'todo', 'em_andamento'])));
  return Number(row?.n ?? 0);
}

export async function countTasksByStatus(orgId: string): Promise<Record<TaskStatus, number>> {
  const rows = await db
    .select({ status: tasks.status, n: count() })
    .from(tasks)
    .where(eq(tasks.org_id, orgId))
    .groupBy(tasks.status);
  const base: Record<TaskStatus, number> = { backlog: 0, todo: 0, em_andamento: 0, em_revisao: 0, concluida: 0 };
  for (const r of rows) base[r.status as TaskStatus] = Number(r.n);
  return base;
}

export async function listTaskTitulosByReport(reportId: string, orgId: string): Promise<string[]> {
  const rows = await db
    .select({ titulo: tasks.titulo })
    .from(tasks)
    .where(and(eq(tasks.report_id, reportId), eq(tasks.org_id, orgId)));
  return rows.map((r) => r.titulo);
}
```

`updateTask` completo no mesmo arquivo: carrega escopado, monta `set` a partir do patch (mapear `assigneeUserId → assignee_user_id`), grava activity `editada` (e `prazo` com `de`/`para` quando `patch.prazo !== undefined && patch.prazo !== task.prazo`; idem `assignee`).

- [ ] **Step 3:** `npx vitest run tests/integration/task-repository.test.ts` → **passa** (com `DATABASE_URL_TEST`). `npm run typecheck` limpo.
- [ ] **Step 4:** `npm run test` completo verde. **Commit:** `feat(crm): repositório de tasks escopado por org com ordem de kanban e atividades`.

---

### Task 5: Comentários de task

**Files:** Create `src/modules/tasks/task-comment.repository.ts`; Test `tests/integration/task-comments.test.ts`.

**Interfaces (Produces):**
- `addTaskComment(input: { taskId: string; orgId: string; userId: string; corpo: string }): Promise<string>` — valida task na org (`getTaskById`; senão `throw 'task_nao_encontrada'`), insere, activity `comentario`.
- `listTaskComments(taskId: string, orgId: string): Promise<Array<{ id: string; corpo: string; userId: string; userEmail: string; createdAt: Date }>>` — join `users` p/ e-mail do autor; valida escopo como em `listTaskActivities` (task fora da org → `[]`); asc por `created_at`, limit 100.

- [ ] **Step 1 (teste falha):** `tests/integration/task-comments.test.ts` — seed 2 orgs + users + 1 task em A: `addTaskComment` ok e aparece em `listTaskComments(task, A)` com `userEmail`; **`listTaskComments(task, B)` → `[]`**; `addTaskComment` com `orgId: B` → rejeita `task_nao_encontrada`; activity `comentario` gravada. Cleanup completo. Rodar → **falha**.
- [ ] **Step 2 (implementar):**

```ts
import { asc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { taskComments, users } from '@/db/schema';
import { getTaskById } from './task.repository';
import { recordTaskActivity } from './task-activity.repository';

export async function addTaskComment(input: {
  taskId: string; orgId: string; userId: string; corpo: string;
}): Promise<string> {
  const task = await getTaskById(input.taskId, input.orgId);
  if (!task) throw new Error('task_nao_encontrada');
  const [row] = await db
    .insert(taskComments)
    .values({ task_id: input.taskId, user_id: input.userId, corpo: input.corpo })
    .returning({ id: taskComments.id });
  await recordTaskActivity({ taskId: input.taskId, userId: input.userId, evento: 'comentario' });
  return row.id;
}

export async function listTaskComments(taskId: string, orgId: string) {
  const task = await getTaskById(taskId, orgId);
  if (!task) return [];
  return db
    .select({
      id: taskComments.id,
      corpo: taskComments.corpo,
      userId: taskComments.user_id,
      userEmail: users.email,
      createdAt: taskComments.created_at,
    })
    .from(taskComments)
    .innerJoin(users, eq(taskComments.user_id, users.id))
    .where(eq(taskComments.task_id, taskId))
    .orderBy(asc(taskComments.created_at))
    .limit(100);
}
```

- [ ] **Step 3:** teste → **passa**; `npm run test` + `npm run typecheck` verdes. **Commit:** `feat(crm): comentários de task com escopo por org`.

---### Task 6: Notificações in-app — `notify()` genérico, rota de polling e e-mails novos

**Files:** Create `src/modules/notifications/notification.repository.ts`, `src/actions/notifications.actions.ts`, `src/app/api/notifications/route.ts`; Modify `src/modules/notifications/recipients.ts`, `src/modules/notifications/templates.ts`, `src/modules/notifications/email.ts`; Test `tests/integration/notification-repository.test.ts`, `tests/unit/notification-templates.test.ts` (estender).

**Interfaces (Produces):**
- `notification.repository.ts` (API genérica — F3 reusa p/ alertas):
  - `export type NotifyInput = { tipo: string; titulo: string; corpo: string; href?: string }`.
  - `notify(userId: string, input: NotifyInput): Promise<void>` — insere; **try/catch, NUNCA lança** (loga `warn`).
  - `listNotifications(userId: string, limit = 10): Promise<Array<{ id: string; tipo: string; titulo: string; corpo: string; href: string | null; lida: boolean; createdAt: Date }>>` — desc.
  - `countUnread(userId: string): Promise<number>`.
  - `markRead(userId: string, notificationId: string): Promise<void>` — `where user_id = userId AND id = notificationId` (escopo!).
  - `markAllRead(userId: string): Promise<void>`.
- `recipients.ts` (adicionar; manter as funções existentes):
  - `getOrgPrimaryUser(orgId: string): Promise<{ id: string; email: string } | null>` — user `role='client'` da org, `limit 1`.
  - `getOrgAnalistaUser(orgId: string): Promise<{ id: string; email: string } | null>` — join `organizations.analista_id → users`.
- `templates.ts` (adicionar, puros): `taskCriadaTemplate(titulo: string, url: string)`, `taskComentarioTemplate(titulo: string, url: string)`, `taskDevolvidaTemplate(titulo: string, url: string)`, `taskAprovadaTemplate(titulo: string, url: string)` — cada um `EmailContent` pt-BR (subject com "— Truth Analytics", text contém o título da task e a url).
- `email.ts` (adicionar wrappers best-effort no padrão existente): `sendTaskCriadaEmail(to, titulo, url)`, `sendTaskComentarioEmail(to, titulo, url)`, `sendTaskDevolvidaEmail(to, titulo, url)`, `sendTaskAprovadaEmail(to, titulo, url)`.
- `GET /api/notifications` — sessão via `auth()` (padrão do projeto p/ route handlers; se não houver sessão → `401`); resposta `{ unread: number; items: [...] }` (10 últimas). `export const dynamic = 'force-dynamic'`.
- `notifications.actions.ts`: `markNotificationReadAction(formData: FormData): Promise<void>` (campo `notificationId`) e `markAllNotificationsReadAction(): Promise<void>` — `requireSession`, repo escopado por `access.id`, sem revalidate (o bell refaz o fetch).

- [ ] **Step 1 (teste falha, unit):** estender `tests/unit/notification-templates.test.ts`: os 4 templates novos retornam subject/html/text não-vazios, pt-BR, contendo o título da task e a url. Rodar → falha.
- [ ] **Step 2 (teste falha, integração):** `tests/integration/notification-repository.test.ts` — seed 2 users (orgs distintas, prefixo `ta-test-notif-`):
  - `notify(u1, {...})` → `countUnread(u1) === 1` e `countUnread(u2) === 0` (escopo).
  - `listNotifications(u1)` traz a notificação com `lida:false`; `markRead(u2, idDeU1)` **não** marca (escopo); `markRead(u1, id)` marca; `markAllRead(u1)` zera.
  - `notify` com `userId` inexistente **não lança** (FK falha → engolida, `resolves.toBeUndefined()`).
  - Cleanup: `notifications` → `users` → `organizations`. Rodar → falha.
- [ ] **Step 3 (implementar):** repositório:

```ts
import { and, count, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { notifications } from '@/db/schema';
import { logger } from '@/lib/logger';

export type NotifyInput = { tipo: string; titulo: string; corpo: string; href?: string };

export async function notify(userId: string, input: NotifyInput): Promise<void> {
  try {
    await db.insert(notifications).values({
      user_id: userId,
      tipo: input.tipo,
      titulo: input.titulo,
      corpo: input.corpo,
      href: input.href ?? null,
    });
  } catch (e) {
    logger.warn('notify falhou', { userId, tipo: input.tipo, erro: e instanceof Error ? e.message : String(e) });
  }
}

export async function listNotifications(userId: string, limit = 10) {
  return db
    .select({
      id: notifications.id, tipo: notifications.tipo, titulo: notifications.titulo,
      corpo: notifications.corpo, href: notifications.href, lida: notifications.lida,
      createdAt: notifications.created_at,
    })
    .from(notifications)
    .where(eq(notifications.user_id, userId))
    .orderBy(desc(notifications.created_at))
    .limit(limit);
}

export async function countUnread(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.user_id, userId), eq(notifications.lida, false)));
  return Number(row?.n ?? 0);
}

export async function markRead(userId: string, notificationId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ lida: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.user_id, userId)));
}

export async function markAllRead(userId: string): Promise<void> {
  await db.update(notifications).set({ lida: true }).where(eq(notifications.user_id, userId));
}
```

> Re-validação F0: se `src/lib/logger.ts` não existir no master (F0 divergiu), usar `console.warn` com o mesmo formato e anotar no ledger.

Rota `src/app/api/notifications/route.ts`:

```ts
import { NextResponse } from 'next/server';

import { auth } from '@/modules/auth/auth';
import { countUnread, listNotifications } from '@/modules/notifications/notification.repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: 'nao_autenticado' }, { status: 401 });
  const [unread, items] = await Promise.all([countUnread(userId), listNotifications(userId, 10)]);
  return NextResponse.json({ unread, items });
}
```

Templates/wrappers/recipients conforme Interfaces (mesmo estilo dos existentes; wrappers usam `sendEmail` base e nunca lançam). Actions conforme Interfaces.

- [ ] **Step 4:** testes dos Steps 1–2 → **passam**. `npm run test` + `npm run typecheck` verdes. **Commit:** `feat(crm): notificações in-app com notify() genérico, rota de polling e e-mails de task`.

---

### Task 7: Server actions de tasks — CRUD, mover, concluir, aprovar/devolver, comentar, checklist

**Files:** Create `src/actions/tasks.actions.ts`, `src/modules/tasks/task-notifications.ts`; Test `tests/integration/tasks-actions.test.ts` (testa a camada de orquestração via repositórios + gatilhos com spies; os gates de sessão são cobertos por E2E).

**Interfaces (Produces):** todas em `'use server'`; dois shapes:
- Com estado (forms com erro visível): `createTaskAction(_prev: TaskActionState, formData: FormData): Promise<TaskActionState>`, `addCommentAction(...)`, `updateTaskAction(...)` onde `TaskActionState = { error?: string; ok?: boolean; taskId?: string }`.
- Fire-and-refresh (botões): `moveTaskFormAction(formData): Promise<void>`, `concluirTaskFormAction(formData): Promise<void>`, `reorderTaskFormAction(formData): Promise<void>`, `aprovarTaskFormAction(formData): Promise<void>`, `devolverTaskFormAction(formData): Promise<void>`, `deleteTaskFormAction(formData): Promise<void>`, `toggleChecklistItemFormAction(formData): Promise<void>` — erros de validação viram no-op com `logger.warn` (a UI só oferece botões válidos).

**Resolução de contexto (função interna `resolveTaskContext`)** — o coração do multi-tenancy:

```ts
async function resolveTaskContext(formData: FormData): Promise<{ access: UserAccess; orgId: string; ator: TaskAtor }> {
  const access = await requireSession();
  if (access.role === 'client') {
    if (access.orgStatus !== 'active') redirect('/aguardando');
    return { access, orgId: access.orgId, ator: 'cliente' }; // NUNCA lê orgId do form
  }
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) throw new Error('org_obrigatoria');
  await assertOrgAccess(access, orgId); // analista: só carteira; admin: tudo
  return { access, orgId, ator: access.role === 'admin_truth' ? 'admin' : 'analista' };
}
```

**Regras por action:**
- `createTaskAction`: Zod (`titulo` 3–200, `tipo` em `TASK_TIPOS`, `prioridade` em `TASK_PRIORIDADES`, `descricao` ≤ 5000, `prazo` `YYYY-MM-DD` opcional; `templateId` opcional — analista). `criadoPor = ator === 'cliente' ? 'cliente' : 'analista'`. Se `templateId`: carregar template ativo e copiar titulo/tipo/descricao + checklist como linhas `- [ ] item` ao fim da descricao. **Gatilho:** se ator analista/admin → `notify(clienteUser.id, { tipo: 'task_criada', titulo: 'Nova task no seu Plano de Ação', corpo: titulo, href: '/dashboard/plano-de-acao/<id>' })` + `sendTaskCriadaEmail` best-effort. `recordAudit({ acao: 'task.criada' })`. `revalidatePath('/dashboard/plano-de-acao')` + `revalidatePath('/analista/' + orgId)`.
- `moveTaskFormAction` (`taskId`, `para`): `moveTask` com `ator`; `revalidatePath` das duas rotas.
- `concluirTaskFormAction` (`taskId`): carrega task, `para = proximoStatusAoConcluir(task.criadoPor)` **calculado no servidor**; se resultado `em_revisao` e ator cliente → `notify` ao analista da org (`getOrgAnalistaUser`) `tipo:'task_em_revisao'`, href `/analista/<orgId>/tasks/<taskId>`.
- `aprovarTaskFormAction` (analista/admin; task deve estar `em_revisao`): `moveTask(→'concluida')`, activity extra `aprovada`, `recordAudit({ acao: 'task.aprovada' })`, `notify` cliente `tipo:'task_aprovada'` + e-mail.
- `devolverTaskFormAction` (analista/admin; `motivo` opcional): `moveTask(em_revisao→'em_andamento')`, se `motivo` → `addTaskComment`, activity `devolvida`, `recordAudit({ acao: 'task.devolvida' })`, `notify` cliente `tipo:'task_devolvida'` + e-mail.
- `addCommentAction` (`taskId`, `corpo` 1–2000): `addTaskComment`; **notifica o outro lado** — autor cliente → `getOrgAnalistaUser(orgId)`; autor analista/admin → `getOrgPrimaryUser(orgId)`; `tipo:'task_comentario'` + e-mail.
- `deleteTaskFormAction`: só analista/admin (`ator === 'cliente'` → no-op logado); `recordAudit({ acao: 'task.excluida', detalhes: { titulo } })`.
- `toggleChecklistItemFormAction` (`taskId`, `index`): reescreve a `index`-ésima linha `- [ ]`/`- [x]` da descricao (helper puro `toggleChecklistLine(descricao: string, index: number): string` exportado para unit test).

- [ ] **Step 1 (teste falha):** `tests/integration/tasks-actions.test.ts` — como actions dependem de sessão, testar a lógica extraída: exportar de `tasks.actions.ts` apenas o helper puro `toggleChecklistLine` (unit no mesmo arquivo de teste) e cobrir os gatilhos via composição repo+notify com spies:
  - `vi.spyOn` em `notification.repository.notify` e nos wrappers de e-mail; simular o fluxo "analista cria task para org com cliente" chamando `createTask` + o bloco de notificação extraído em `src/modules/tasks/task-notifications.ts` (criar): `notifyTaskCriada(orgId, taskId, titulo)`, `notifyTaskEmRevisao(orgId, taskId, titulo)`, `notifyTaskAprovada(orgId, taskId, titulo)`, `notifyTaskDevolvida(orgId, taskId, titulo)`, `notifyTaskComentario(orgId, taskId, titulo, autorEhCliente: boolean)` — cada um resolve destinatário via recipients e chama `notify` + e-mail, tudo best-effort.
  - Asserts: org com cliente → `notify` chamado com `href` correto; org **sem** analista → `notifyTaskEmRevisao` não lança e não chama `notify` (destinatário null); e-mail spy chamado com o e-mail do cliente.
  - `toggleChecklistLine('- [ ] a\n- [ ] b', 1)` → `'- [ ] a\n- [x] b'`; toggle de volta; index fora do range = string intacta.
  Rodar → falha.
- [ ] **Step 2 (implementar):** criar `src/modules/tasks/task-notifications.ts` (best-effort, nunca lança — resolve destinatário e dispara in-app + e-mail com `serverEnv.APP_URL`), depois `src/actions/tasks.actions.ts` completo com `resolveTaskContext` acima, Zod schemas locais, e os gatilhos delegando a `task-notifications.ts`. Erros de repo conhecidos (`task_nao_encontrada`, `transicao_invalida`, `acesso_negado`) → `{ error: 'mensagem pt-BR' }` nos stateful e no-op+warn nos fire-and-refresh.
- [ ] **Step 3:** testes → **passam**; `npm run test` + `npm run typecheck` verdes. **Commit:** `feat(crm): actions de tasks com contexto por papel, gatilhos de notificação e auditoria`.

---

### Task 8: Relatório → task — action de conversão + UI nos achados

**Files:** Create `src/components/tasks/AchadosParaTasks.tsx`, `src/modules/tasks/report-to-task.repository.ts`; Modify `src/actions/tasks.actions.ts`, `src/app/(client)/dashboard/relatorios/[id]/page.tsx`; Test `tests/integration/report-to-task-action.test.ts`.

**Interfaces (Produces):**
- Em `tasks.actions.ts`: `createTasksFromReportAction(_prev: TaskActionState, formData: FormData): Promise<TaskActionState & { criadas?: number }>` — campos `reportId` e `itens` (JSON `Array<{ fonte: FonteAnalise; indice: number }>`, validado por Zod, máx 50).
  - Contexto: `resolveTaskContext` **com uma diferença** — para cliente valida que o report pertence a `access.orgId`; para analista/admin o `orgId` é o **do report** (carregar report primeiro via `db` por id, extrair `org_id`, então `assertOrgAccess`). O texto do achado vem SEMPRE do `analise_ia` do banco (validado com `AnaliseIaSchema.safeParse`), **nunca do input** — o input só aponta `(fonte, indice)`.
  - Para cada item: resolver `texto = analise[fonte][indice]` (índice inválido = pular); `itemToTaskInput(...)`; **dedup** por `listTaskTitulosByReport(reportId, orgId)` (título já existente = pular); `createTask({..., criadoPor: 'ia', reportId })`.
  - Se `criadas > 0`: `recordAudit({ acao: 'task.criadas_de_relatorio', detalhes: { reportId, criadas } })` + **1 notificação agregada** ao cliente (`tipo:'tasks_do_relatorio'`, titulo `"${criadas} nova(s) task(s) do seu relatório"`, href `/dashboard/plano-de-acao`) — exceto quando o ator é o próprio cliente (não se auto-notifica). `revalidatePath` de plano-de-acao, do relatório e de `/analista/<orgId>`.
  - Retorno `{ ok: true, criadas }`. (A leitura do report por id sem filtro de org fica encapsulada em `report-to-task.repository.ts` — Step 2 — que valida `report.org_id === orgId` internamente; nada exposto no `report.repository`.)
- `AchadosParaTasks.tsx` (client): recebe `{ reportId: string; fonte: FonteAnalise; itens: string[]; titulosExistentes: string[] }`; renderiza a lista (mesmo visual atual com `•`) e, por item, botão `Virar task` (`data-testid="virar-task-{fonte}-{i}"`) — desabilitado com label `Task criada` quando `tituloFromItem(item)` ∈ `titulosExistentes`; no topo, botão `Criar todas` (`data-testid="criar-todas-{fonte}"`). Usa `useFormState(createTasksFromReportAction)` com input hidden `itens` JSON; sucesso → `useToast()` "N task(s) criada(s) no Plano de Ação".

- [ ] **Step 1 (teste falha):** `tests/integration/report-to-task-action.test.ts` — sem sessão (testar a camada logo abaixo da action): extrair a lógica pura de conversão para `src/modules/tasks/report-to-task.repository.ts` (criar) com `createTasksFromReport(input: { reportId: string; orgId: string; itens: Array<{ fonte: FonteAnalise; indice: number }>; actorUserId: string | null }): Promise<number>` — a action vira: resolver contexto → chamar isto → audit/notify. Teste: seed org + report `done` com `analise_ia` (usar o `SAMPLE_ANALISE` do dashboard.spec como base):
  - converter `{gargalos,0}` e `{sugestoesMelhoria,0}` → retorna 2; tasks têm `criado_por:'ia'`, `report_id` preenchido, tipos `logistica` (frete) e `logistica|outro` conforme texto, prioridades `alta`/`media`.
  - re-converter os mesmos itens → retorna 0 (dedup).
  - índice fora do range → pulado sem erro; `analise_ia` null → retorna 0.
  - **escopo:** `createTasksFromReport` com `orgId` de outra org e `reportId` da primeira → retorna 0 e não cria nada (a task nasceria na org errada — o guard é comparar `report.org_id === orgId` DENTRO da função e retornar 0 se divergir).
  Rodar → falha.
- [ ] **Step 2 (implementar):** `report-to-task.repository.ts`:

```ts
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { AnaliseIaSchema } from '@/modules/pipeline/contracts';
import { itemToTaskInput, tituloFromItem, type FonteAnalise } from './report-to-task';
import { createTask, listTaskTitulosByReport } from './task.repository';

export async function createTasksFromReport(input: {
  reportId: string;
  orgId: string;
  itens: Array<{ fonte: FonteAnalise; indice: number }>;
  actorUserId: string | null;
}): Promise<number> {
  const [rep] = await db
    .select({ org_id: reports.org_id, analise_ia: reports.analise_ia })
    .from(reports)
    .where(eq(reports.id, input.reportId))
    .limit(1);
  if (!rep || rep.org_id !== input.orgId) return 0; // escopo: report precisa ser da org resolvida
  const parsed = AnaliseIaSchema.safeParse(rep.analise_ia);
  if (!parsed.success) return 0;
  const existentes = new Set(await listTaskTitulosByReport(input.reportId, input.orgId));
  let criadas = 0;
  for (const { fonte, indice } of input.itens) {
    const texto = parsed.data[fonte]?.[indice];
    if (typeof texto !== 'string' || texto.length === 0) continue;
    const titulo = tituloFromItem(texto);
    if (existentes.has(titulo)) continue;
    const t = itemToTaskInput({ fonte, texto, reportId: input.reportId });
    await createTask({ orgId: input.orgId, ...t, actorUserId: input.actorUserId });
    existentes.add(titulo);
    criadas += 1;
  }
  return criadas;
}
```

Depois a action (resolve contexto pelo report p/ analista/admin, cliente = org da sessão) e o componente `AchadosParaTasks`. Na página do relatório, substituir os 3 blocos de lista (gargalos/sugestões/ideias) pelo componente, passando `titulosExistentes = await listTaskTitulosByReport(rel.id, access.orgId)` — **manter** os testids existentes (`resumo-executivo` etc.) e o render das listas dentro do componente.

- [ ] **Step 3:** testes → **passam**; `npm run test` + `npm run typecheck` + `npm run build` verdes. **Commit:** `feat(crm): converter achados da análise IA em tasks (com dedup e escopo por report)`.

---

### Task 9: UI Cliente — kanban "Plano de Ação" + badge no nav

**Files:** Create `src/app/(client)/dashboard/plano-de-acao/page.tsx`, `src/components/tasks/KanbanBoard.tsx`, `src/components/tasks/TaskCard.tsx`, `src/components/tasks/NewTaskForm.tsx`; Modify `src/components/app-shell.tsx`, `src/app/(client)/layout.tsx`.

**Interfaces (Produces):**
- `KanbanBoard` (server component): `{ tasks: TaskSummary[]; ator: TaskAtor; taskHrefBase: string; orgId?: string }` — 5 colunas (`data-testid="kanban-col-{status}"`) na ordem canônica, header com `STATUS_TASK_LABEL` + contagem, `EmptyState` por coluna vazia; cards ordenados por `ordem`. Para cliente, coluna `em_revisao` renderiza cards sem controles (aguardando analista) e `concluida` só leitura.
- `TaskCard` (server component): `{ task: TaskSummary; ator: TaskAtor; taskHrefBase: string; orgId?: string }` — `data-testid="task-card"`, título linka para `${taskHrefBase}/${task.id}`, `Badge` de tipo + prioridade (`alta` = variante de alerta), badge `Atrasada` quando `isTaskAtrasada`, e os controles:
  - `←`/`→` (forms para `moveTaskFormAction` com hidden `taskId`, `para` e — quando `orgId` presente — `orgId`): destino = status vizinho na ordem canônica **permitido** por `podeTransicionar` (computado no server ao renderizar; botão ausente quando inválido). Para cliente em `em_andamento`, o `→` vira botão **Concluir** (`concluirTaskFormAction`, `data-testid="task-concluir"`).
  - `↑`/`↓` → `reorderTaskFormAction` (aria-labels "Subir na coluna"/"Descer na coluna").
- `NewTaskForm` (client, `useFormState(createTaskAction)`): titulo, tipo (Select com `TIPO_TASK_LABEL`), prioridade, prazo (input date), descricao; `data-testid="nova-task-form"`; erro inline; sucesso → toast.
- Página `/dashboard/plano-de-acao`: `requireActiveOrg()` → `listTasksByOrg(access.orgId)` → header "Plano de Ação" + `NewTaskForm` (colapsado num `<details>` "Nova task") + `KanbanBoard` com `ator='cliente'`, `taskHrefBase='/dashboard/plano-de-acao'` (sem `orgId` — cliente nunca envia org).
- AppShell: prop nova opcional `planoDeAcaoCount?: number`; link "Plano de Ação" (`href="/dashboard/plano-de-acao"`, desktop + mobile) com badge de contagem (`data-testid="nav-plano-badge"`, oculto quando 0) — apenas `variant='client'`. `(client)/layout.tsx` vira async: `getSessionContext()`; se sessão de client com org ativa, `countTasksAbertas(orgId)`, senão 0; passa a prop. **Não remover nada do AppShell existente.**

- [ ] **Step 1:** implementar componentes + página + nav (código conforme Interfaces; classes visuais seguem o padrão do repo: `Card`, `Badge`, `text-muted`, grid `md:grid-cols-5` com `overflow-x-auto` no mobile).
- [ ] **Step 2 (verificação manual):** `npm run dev` → login cliente ativo → `/dashboard/plano-de-acao`: criar task manual (nasce em Backlog), mover `→` até Em andamento, `Concluir` (task própria → coluna Concluída), reordenar com `↑↓`; badge do nav reflete a contagem após navegar. Sem erros no console do server.
- [ ] **Step 3:** `npm run build` + `npm run lint` + `npm run typecheck` verdes; `npm run test:e2e` (specs existentes) verde — o AppShell mudou, os E2E antigos não podem quebrar. **Commit:** `feat(crm): kanban Plano de Ação do cliente com badge no nav`.

---

### Task 10: UI Cliente — detalhe da task (comentários, checklist, atividades, impacto)

**Files:** Create `src/app/(client)/dashboard/plano-de-acao/[taskId]/page.tsx`, `src/components/tasks/TaskDetail.tsx`, `src/components/tasks/TaskComments.tsx`, `src/components/tasks/TaskChecklist.tsx`, `src/modules/tasks/task-impact.ts`, `src/modules/tasks/checklist.ts`; Modify `src/modules/reports/report.repository.ts`, `src/actions/tasks.actions.ts`; Test `tests/integration/task-impact.test.ts`, `tests/unit/checklist.test.ts`.

**Interfaces (Produces):**
- `task-impact.ts`:

```ts
export type TaskImpact = {
  periodoOrigem: { inicio: Date; fim: Date };
  totalOrigem: number;
  periodoAtual: { inicio: Date; fim: Date };
  totalAtual: number;
  deltaPct: number; // (atual - origem) / origem * 100; origem 0 → deltaPct 0
} | null;

export async function getTaskImpact(taskId: string, orgId: string): Promise<TaskImpact>;
```

  Regras: task precisa existir na org, ter `reportId` e `status === 'concluida'`, senão `null`. Report origem: `getReportById(reportId, orgId)` com `status done` + `metricas` válidas (`MetricasSchema.safeParse`), senão `null`. Report atual: o `done` mais recente da org **diferente** do de origem e **posterior** (`created_at` maior); senão `null` (ainda não há relatório seguinte). `total = metricas.vendasPorCanal.reduce((s, c) => s + c.total, 0)`. Precisa de `listReports`/select direto — adicionar em `report.repository.ts`: `getLatestDoneReportAfter(orgId: string, afterCreatedAt: Date, excludeId: string): Promise<ReportDetail | null>`.
- `toggleChecklistLine` e `parseChecklist(descricao: string): Array<{ texto: string; feito: boolean }>` movidos/criados em `src/modules/tasks/checklist.ts` (puro; a action da Task 7 importa daqui — ajustar import).
- `TaskDetail` (server, **compartilhado com o analista na Task 11**): `{ task: TaskDetail; ator: TaskAtor; orgId?: string; comments; activities; impact: TaskImpact; backHref: string }` — layout: header (titulo, badges status/tipo/prioridade/atrasada, prazo, criado por `analista|cliente|ia` com label pt-BR "Criada pela análise IA" quando `ia`), descrição (com `TaskChecklist` quando `parseChecklist` achar itens), seção **Impacto** (só quando `impact !== null`): "Vendas no período do relatório de origem: R$ X → relatório mais recente: R$ Y (**±Z%**)" com `formatBRL` (`data-testid="task-impacto"`); comentários (`TaskComments`); timeline de atividades (evento pt-BR: `criada`→"Task criada", `status`→"Movida de {label} para {label}", `comentario`→"Novo comentário", `aprovada`→"Conclusão aprovada", `devolvida`→"Devolvida para ajustes", `editada`→"Editada", `prazo`→"Prazo alterado"). Controles de mover: reusar `TaskCard` NÃO — no detalhe só aprovar/devolver (analista, Task 11) e Concluir (cliente, quando aplicável).
- `TaskComments` (client): lista + form `useFormState(addCommentAction)` (`data-testid="task-comentario-form"`).
- `TaskChecklist` (client): checkboxes → `toggleChecklistItemFormAction` (cliente e analista podem togglar).
- Página `[taskId]`: `requireActiveOrg()` → `getTaskById(params.taskId, access.orgId)` → `notFound()` se null → carrega comments/activities/impact em `Promise.all` → `TaskDetail` com `ator='cliente'`, `backHref='/dashboard/plano-de-acao'`.

- [ ] **Step 1 (teste falha, unit):** `tests/unit/checklist.test.ts` — `parseChecklist('desc\n- [ ] a\n- [x] b')` → `[{texto:'a',feito:false},{texto:'b',feito:true}]`; descrição sem checklist → `[]`; `toggleChecklistLine` roundtrip. Rodar → falha; implementar `checklist.ts`; passa.
- [ ] **Step 2 (teste falha, integração):** `tests/integration/task-impact.test.ts` — seed org, report origem `done` (metricas com `vendasPorCanal` somando 1000, `created_at` antigo via update direto), report atual `done` (somando 1500), task `concluida` com `report_id` origem:
  - `getTaskImpact` → `{ totalOrigem: 1000, totalAtual: 1500, deltaPct: 50 }`.
  - task `em_andamento` → `null`; task sem `report_id` → `null`; sem relatório posterior → `null`.
  - **escopo:** `getTaskImpact(taskId, outraOrg)` → `null`.
  Rodar → falha; implementar `task-impact.ts` + `getLatestDoneReportAfter`; passa.
- [ ] **Step 3:** implementar componentes + página; verificação manual (`npm run dev`): abrir task com checklist de template → togglar; comentar; ver timeline.
- [ ] **Step 4:** `npm run test` + `npm run typecheck` + `npm run build` verdes. **Commit:** `feat(crm): detalhe da task com comentários, checklist, atividades e impacto medido`.

---

### Task 11: UI Analista — carteira, kanban por org, fila de revisão e achados

**Files:** Create `src/app/analista/layout.tsx`, `src/app/analista/page.tsx`, `src/app/analista/[orgId]/page.tsx`, `src/app/analista/[orgId]/tasks/[taskId]/page.tsx`, `src/components/tasks/RevisaoQueue.tsx`, `src/components/tasks/NewTaskFromTemplateForm.tsx`; Modify `src/modules/analista/analista.repository.ts`, `src/components/app-shell.tsx`.

**Interfaces (Produces):**
- `analista.repository.ts` (adicionar):
  - `getCarteira(access: UserAccess): Promise<Array<{ orgId: string; orgName: string; counts: Record<TaskStatus, number>; atrasadas: number; emRevisao: number }>>` — admin: todas as orgs cliente (reusar `listClientOrganizations`); analista: `organizations.analista_id = access.id`. Contadores por org via `countTasksByStatus` + query de atrasadas (`prazo < CURRENT_DATE AND status != 'concluida'`).
  - `listTasksEmRevisao(access: UserAccess): Promise<Array<TaskSummary & { orgId: string; orgName: string }>>` — tasks `em_revisao` das orgs da carteira (join organizations), asc por `updated_at`.
- `app-shell.tsx`: `variant` ganha `'analista'` (nav: "Carteira" → `/analista`; sem link admin); `analista/layout.tsx` = `requireAnalista()` + `<AppShell variant="analista">`.
- `/analista` (page): `requireAnalista()` → `getCarteira` → grid de `Card` por org (`data-testid="carteira-org"`): nome, contadores por status (mini badges), `atrasadas` em vermelho quando > 0, `emRevisao` em destaque, link "Abrir kanban" → `/analista/[orgId]`. Acima do grid, `RevisaoQueue` (fila global): lista de `listTasksEmRevisao` com org, título e botões **Aprovar** (`aprovarTaskFormAction`, `data-testid="aprovar-task"`) e **Devolver** (abre `ConfirmDialog` com textarea `motivo` → `devolverTaskFormAction`, `data-testid="devolver-task"`). `EmptyState` "Nenhuma task aguardando revisão".
- `/analista/[orgId]` (page): `requireAnalista()` + `await assertOrgAccess(access, params.orgId)` com try/catch → `notFound()` quando `acesso_negado`. Conteúdo em `Tabs`: **Kanban** (`KanbanBoard` com `ator` do papel, `taskHrefBase=/analista/{orgId}/tasks`, `orgId` — os forms incluem hidden `orgId`), **Nova task** (`NewTaskForm` reutilizado + `NewTaskFromTemplateForm`: Select de `listTemplates(true)` → `createTaskAction` com `templateId`), **Achados do relatório** (último report `done` da org via `getLatestReport` + `getReportById` → `AchadosParaTasks` reutilizado, passando os 3 blocos; `EmptyState` sem relatório).
- `/analista/[orgId]/tasks/[taskId]`: mesmos gates → `getTaskById(taskId, orgId)` → `TaskDetail` com `ator` analista/admin, `orgId`, `backHref=/analista/{orgId}`, e no header os botões Aprovar/Devolver quando `status === 'em_revisao'`.

- [ ] **Step 1:** implementar repositório (`getCarteira`, `listTasksEmRevisao`) + estender `tests/integration/analista-carteira.test.ts`: seed task em org da carteira com `prazo` ontem → `getCarteira(analista)` traz só a org da carteira com `atrasadas: 1`; `getCarteira(admin)` traz ambas; task `em_revisao` aparece em `listTasksEmRevisao(analista)` só quando a org é da carteira. Teste primeiro (falha) → implementação → passa.
- [ ] **Step 2:** implementar layout/páginas/componentes conforme Interfaces.
- [ ] **Step 3 (verificação manual):** `npm run db:seed-analista` (env local) → login analista → `/analista` mostra carteira; org fora da carteira via URL direta → 404; kanban da org: criar task de template (checklist na descrição), aprovar/devolver da fila (task devolvida volta a Em andamento e cliente recebe notificação — conferir na tabela).
- [ ] **Step 4:** `npm run test` + `npm run typecheck` + `npm run build` verdes. **Commit:** `feat(crm): painel do analista — carteira, kanban por org, fila de revisão e achados`.

---

### Task 12: UI Admin — playbooks, atribuição de analista e métricas da consultoria

**Files:** Create `src/modules/tasks/task-template.repository.ts`, `src/actions/task-templates.actions.ts`, `src/app/admin/playbooks/page.tsx`, `src/app/admin/consultoria/page.tsx`; Modify `src/modules/analista/analista.repository.ts`, `src/app/admin/page.tsx` (ou `client-row.tsx`), `src/components/app-shell.tsx`; Test `tests/integration/task-template-repository.test.ts`, `tests/integration/consultoria-metrics.test.ts`.

**Interfaces (Produces):**
- `task-template.repository.ts`: `listTemplates(soAtivos = false)`, `getTemplateById(id)`, `createTemplate(input: { titulo; tipo: TaskTipo; descricao; checklist: string[] })`, `updateTemplate(id, patch)`, `setTemplateAtivo(id, ativo: boolean)` — templates são globais (sem org). Tipos de retorno `TaskTemplate = { id; titulo; tipo: TaskTipo; descricao; checklist: string[]; ativo: boolean }` (cast do jsonb com Zod `z.array(z.string()).catch([])`).
- `task-templates.actions.ts`: `createTemplateAction(_prev, formData)` (`requireAdmin`; Zod: titulo 3–200, tipo válido, checklist = textarea 1 item/linha), `updateTemplateAction`, `toggleTemplateAtivoAction(formData): Promise<void>` — `recordAudit({ acao: 'template.criado' | 'template.editado' | 'template.ativo_alterado' })`, `revalidatePath('/admin/playbooks')`.
- `getConsultoriaMetrics()` em `analista.repository.ts`:

```ts
export type ConsultoriaMetrics = {
  concluidas7d: number;
  concluidas30d: number;
  tempoMedioConclusaoDias: number | null; // avg(activity 'status'→'concluida'.created_at - task.created_at)
  porAnalista: Array<{ analistaId: string; email: string; orgs: number; abertas: number; concluidas30d: number }>;
};
```

  SQL agregado simples (Drizzle `sql`): concluídas = activities `evento='status' AND para='concluida'` no intervalo (contando task 1x via `DISTINCT task_id`); tempo médio em dias com `EXTRACT(EPOCH FROM ...)/86400`; por analista = join `organizations.analista_id → users` + contagens de tasks das suas orgs.
- `/admin/playbooks`: `requireAdmin()` → tabela de templates (titulo, tipo, nº itens do checklist, ativo com toggle) + form criar/editar (`data-testid="novo-playbook-form"`). Nav admin ganha links "Playbooks" e "Consultoria" no AppShell (`variant='admin'`).
- `/admin/consultoria`: `requireAdmin()` → `Stat`s (concluídas 7d/30d, tempo médio) + tabela por analista.
- Atribuição: na listagem do admin (linha da org — re-validar contra o master pós-F1, que adiciona `/admin/[orgId]`; colocar onde a linha da org é renderizada), Select de analistas (`listAnalistas`) + botão "Atribuir" → `setOrgAnalistaAction` (`data-testid="atribuir-analista"`), mostrando o e-mail do analista atual.

- [ ] **Step 1 (teste falha → passa):** `task-template-repository.test.ts` — criar template com checklist 2 itens → `listTemplates()` traz; `setTemplateAtivo(false)` → some de `listTemplates(true)`; `updateTemplate` altera titulo. Cleanup por prefixo `ta-test-tpl-`.
- [ ] **Step 2 (teste falha → passa):** `consultoria-metrics.test.ts` — seed analista + org na carteira + task; mover a task a `concluida` via `moveTask` (gera a activity) → `getConsultoriaMetrics()` conta 1 em `concluidas7d`, `tempoMedioConclusaoDias` ≥ 0, e `porAnalista` traz o analista com `orgs: 1`. (Métricas são globais — o teste tolera valores ≥ dos semeados, nunca igualdade estrita com o banco compartilhado.)
- [ ] **Step 3:** implementar actions + páginas + atribuição + nav.
- [ ] **Step 4:** `npm run test` + `npm run typecheck` + `npm run build` verdes; manual: criar playbook, atribuir analista a uma org, ver métricas. **Commit:** `feat(crm): admin — playbooks, atribuição de carteira e métricas da consultoria`.

---

### Task 13: Bell de notificações no AppShell

**Files:** Create `src/components/notifications/NotificationBell.tsx`; Modify `src/components/app-shell.tsx`.

**Interfaces (Produces):**
- `NotificationBell` (client): sem props. Estado `{ unread, items, open }`. Efeito: `fetchNotifications()` no mount, `setInterval` 60s (limpo no unmount) e listener `visibilitychange` (refaz quando a aba volta a ficar visível). Fetch: `fetch('/api/notifications', { cache: 'no-store' })`; `401`/erro → estado vazio silencioso (nunca quebra o shell).
- Render: botão sino (`data-testid="notification-bell"`, `aria-label="Notificações"`) com dot/contagem quando `unread > 0` (`data-testid="notification-unread"`); dropdown (F1 `Dropdown`; fallback: popover próprio com `useState` + click-outside) com as 10 últimas — cada item: titulo, corpo (line-clamp), tempo relativo pt-BR simples (`agora`, `Xmin`, `Xh`, `Xd`), não-lida com fundo destacado; clique = `markNotificationReadAction` (form) + navegação para `href` quando existir; rodapé "Marcar todas como lidas" → `markAllNotificationsReadAction` + refetch local.
- AppShell: renderizar `<NotificationBell />` entre o nav e o botão Sair (desktop) e no topo do drawer mobile — **em todas as variants** (client/analista/admin).

- [ ] **Step 1:** implementar componente + integração no AppShell.
- [ ] **Step 2 (verificação manual):** com uma notificação semeada via SQL no dev, o bell mostra a contagem; clicar marca como lida e navega; "marcar todas" zera; deslogado, a página `/sign-in` não renderiza AppShell (sem fetch).
- [ ] **Step 3:** `npm run test:e2e` (specs existentes) + `npm run build` + `npm run typecheck` verdes. **Commit:** `feat(crm): bell de notificações in-app com polling leve no AppShell`.

---

### Task 14: E2E — kanban do cliente e relatório→task + fechamento

**Files:** Modify `tests/e2e/helpers/db.ts`; Create `tests/e2e/plano-de-acao.spec.ts`, `tests/e2e/relatorio-task.spec.ts`.

**Interfaces (Produces):** em `helpers/db.ts`:
- `seedTask(orgId: string, opts: { titulo: string; criadoPor?: 'analista' | 'cliente' | 'ia'; status?: string; tipo?: string; prioridade?: string }): Promise<string>`.
- `cleanupE2E` atualizado: por org, deletar ANTES da cadeia atual — `notifications` (dos users da org), `task_activities` e `task_comments` (das tasks da org), `tasks`; e globalmente `task_templates` com `titulo like 'ta-test-e2e-%'`.

- [ ] **Step 1:** atualizar helpers (ordem FK: notifications → task_activities → task_comments → tasks → [cadeia existente]).
- [ ] **Step 2:** `tests/e2e/plano-de-acao.spec.ts`:

```ts
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
  await expect(page.getByTestId('kanban-col-backlog').getByTestId('task-card')).toHaveCount(1);
});
```

- [ ] **Step 3:** `tests/e2e/relatorio-task.spec.ts` (reusar `SAMPLE_METRICAS`/`SAMPLE_ANALISE` do `dashboard.spec.ts` — duplicar as constantes no spec, não importar entre specs):

```ts
test('relatório → task: achado da IA vira task no Plano de Ação', async ({ page }) => {
  // login (mesmo padrão), org com seedReport(status done + análise)
  await page.goto(`/dashboard/relatorios/${seededReportId}`);
  await expect(page.getByTestId('resumo-executivo')).toBeVisible();

  await page.getByTestId('virar-task-gargalos-0').click();
  // botão vira "Task criada" (desabilitado) após o refresh da action
  await expect(page.getByTestId('virar-task-gargalos-0')).toBeDisabled();

  await page.goto('/dashboard/plano-de-acao');
  const backlog = page.getByTestId('kanban-col-backlog');
  await expect(backlog.getByTestId('task-card')).toHaveCount(1);
  await expect(backlog).toContainText('Custo de frete elevado no canal ML');
});
```

  (spec completo com beforeAll/afterAll no padrão do `dashboard.spec.ts`.)
- [ ] **Step 4:** `npm run test:e2e` → **TODOS os specs** (antigos + 2 novos) verdes. `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build` verdes. Verificar MAIN limpo (nenhum registro `ta-test-*` no branch main).
- [ ] **Step 5:** **Commit:** `test(crm): e2e do kanban do cliente e do fluxo relatório→task`. Revisão ampla do branch (Opus) → merge `--no-ff` em `master`.

---

## Self-Review

**Cobertura do escopo (9 itens):** (1) schema 5 tabelas + CHECKs + índices `tasks(org_id,status)`/`notifications(user_id,lida)` + migration main/test — Task 1 ✅; (2) role analista + `analista_id` + `requireAnalista` + middleware + atribuição na UI admin + seed — Tasks 2 e 12 ✅; (3) repositório+actions escopados com transições por papel, ordem, activities e audit — Tasks 3, 4, 5, 7 ✅; (4) relatório→task com heurística, dedup, `criado_por 'ia'` e UI por item/"criar todas" — Tasks 3, 8 ✅; (5) UI cliente kanban + detalhe + badge nav — Tasks 9, 10 ✅; (6) UI analista carteira/kanban/fila revisão/template/achados — Task 11 ✅; (7) UI admin playbooks/atribuição/métricas — Task 12 ✅; (8) notificações in-app com `notify()` genérico (F3 reusa), bell com polling 60s, 4 gatilhos + e-mail best-effort — Tasks 6, 7, 13 ✅; (9) impacto no detalhe da task concluída lendo `metricas` jsonb, sem pipeline novo — Task 10 ✅.

**Multi-tenancy:** cliente nunca envia `orgId` (`resolveTaskContext`); analista/admin passam por `assertOrgAccess`; `createTasksFromReport` valida `report.org_id === orgId`; notifications escopadas por `user_id`. Testes de escopo obrigatórios presentes: Task 2 (carteira), Task 4 (task entre orgs), Task 5 (comments), Task 6 (notifications), Task 8 (report de outra org), Task 10 (impacto), Task 11 (carteira com dados).

**Consistência de nomes:** tabelas `tasks`/`task_comments`/`task_activities`/`task_templates`/`notifications`; rotas `/dashboard/plano-de-acao(/[taskId])`, `/analista(/[orgId](/tasks/[taskId]))`, `/admin/playbooks`, `/admin/consultoria`, `/api/notifications`; actions `createTaskAction`, `moveTaskFormAction`, `concluirTaskFormAction`, `reorderTaskFormAction`, `aprovarTaskFormAction`, `devolverTaskFormAction`, `addCommentAction`, `toggleChecklistItemFormAction`, `createTasksFromReportAction`, `setOrgAnalistaAction`, `createTemplateAction`, `markNotificationReadAction` — conferidos entre as tasks que os produzem/consomem (7↔8↔9↔10↔11).

**Riscos assumidos:** (a) plano escrito contra código pós-F0/F1 — mitigado pela regra de re-validação (pontos marcados: nome do CHECK de role, `logger`, primitivos ui, `/admin/[orgId]`); (b) FK circular `organizations.analista_id → users` — fallback SQL documentado na Task 1; (c) `ordem` por `max+1` sem lock — colisão exigiria 2 escritas simultâneas na mesma coluna da mesma org (1 analista + 1 cliente); empate de `ordem` só afeta ordenação visual, aceitável no MVP.

**Deferido (fast-follow, não bloqueia):** drag nativo no kanban; anexos/evidências em comentários; menções; SLA configurável; notificação de prazo vencendo (cron — casa com F3a); paginação do kanban (>200 tasks); preferências de notificação; edição de task pelo cliente após criação.

## Execução

Subagent-driven (implementer Opus → spec-review → code-review por task; revisão ampla ao final). Integração no branch Neon `test`; E2E com seed/cleanup próprios; MAIN sempre limpo. Ledger em `.superpowers/sdd/progress.md`.
