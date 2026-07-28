# Olist Provider Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preparar banco e domínio do Truth Analytics para múltiplos ERPs sem ativar o Olist nem alterar o comportamento atual do Bling.

**Architecture:** Aplicar expand-and-contract. O schema recebe identificadores neutros e estado de sincronização mantendo todas as colunas Bling legadas; um registry tipado passa a ser a única fonte de adaptadores disponíveis, inicialmente contendo somente Bling. Olist permanece impossível de selecionar nesta fase.

**Tech Stack:** Next.js 16, TypeScript, Drizzle ORM, PostgreSQL, Vitest.

## Global Constraints

- Seguir TDD estrito: teste precisa falhar pelo motivo esperado antes do código de produção.
- Não modificar o comportamento do Bling, rotas, crons, UI ou métricas neste PR.
- Não remover `bling_order_id`, índices legados ou contratos públicos existentes.
- `provider` aceita o domínio tipado `bling | olist`, mas somente `bling` fica registrado nesta fase.
- Nenhum token, client secret ou payload de cliente pode aparecer em logs ou auditoria.
- Cada organização pode ter no máximo uma conexão ERP com `status = 'ok'`.
- Migrações precisam preservar e preencher todos os registros existentes como `bling`.

## Notas operacionais e pré-requisitos das próximas fases

- Antes de habilitar o writer de pedidos Olist, tornar `orders.bling_order_id` nullable e revisar a constraint legada `orders_org_bling_uq`; pedidos exclusivamente Olist não podem depender de uma chave Bling.
- A migração desta fase inclui backfills em `orders` e `product_stock`. Em bases grandes, execute em janela de menor tráfego, monitore duração/locks e confirme o plano de execução em staging antes de produção. Não altere o migration runner para tentar contornar isso sem uma estratégia de rollout separada.

---

### Task 1: Expandir o schema de dados de forma retrocompatível

**Files:**
- Modify: `src/db/schema/connections.ts`
- Modify: `src/db/schema/orders.ts`
- Modify: `src/db/schema/product-stock.ts`
- Create: `src/db/schema/connection-sync-state.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/db/migrations/0020_olist_provider_foundation.sql`
- Modify: `src/db/migrations/meta/_journal.json`
- Test: `tests/integration/provider-foundation-schema.test.ts`

**Interfaces:**
- Produces: `orders.provider`, `orders.provider_order_id`, `productStock.provider`, `productStock.provider_product_id`.
- Produces: `connections.oauth_client_id`, `connections.oauth_client_secret`, `connections.refresh_expira_em`, `connections.last_refresh_at`, `connections.last_error_code`, `connections.last_error_at`.
- Produces: `connectionSyncState` keyed by `(org_id, provider, resource)` with resumable cursor and lease fields.
- Preserves: every existing column, unique constraint and inferred insert/select type.

- [x] **Step 1: Write the failing integration test**

Create `tests/integration/provider-foundation-schema.test.ts`. Use the existing `DATABASE_URL_TEST` safety/skip pattern. Insert an organization and verify these real database behaviors:

```ts
it('defaults legacy-compatible provider ids to bling', async () => {
  const [order] = await db.insert(orders).values({
    org_id: orgId,
    bling_order_id: `foundation-${RUN}`,
    provider_order_id: `foundation-${RUN}`,
    canal: 'Teste',
    data: new Date(),
    valor_total: '10.00',
  }).returning();

  expect(order.provider).toBe('bling');
  expect(order.provider_order_id).toBe(`foundation-${RUN}`);
});

it('impede dois ERPs saudáveis para a mesma organização', async () => {
  await db.insert(connections).values({ org_id: orgId, provider: 'bling', status: 'ok' });
  await expect(
    db.insert(connections).values({ org_id: orgId, provider: 'olist', status: 'ok' }),
  ).rejects.toMatchObject({ code: '23505' });
});

it('persiste cursor e lease por recurso do provider', async () => {
  const [state] = await db.insert(connectionSyncState).values({
    org_id: orgId,
    provider: 'bling',
    resource: 'orders',
    cursor: { offset: 100 },
    lease_token: 'lease-foundation',
    lease_expires_at: new Date(Date.now() + 60_000),
  }).returning();

  expect(state.cursor).toEqual({ offset: 100 });
  expect(state.resource).toBe('orders');
});
```

Cleanup must delete `connectionSyncState`, `orders`, `productStock`, `connections` and the organization in FK-safe order.

- [x] **Step 2: Run the test and verify RED**

Run:

```powershell
npm test -- tests/integration/provider-foundation-schema.test.ts
```

Expected: compilation fails because `connectionSyncState`, `provider_order_id` and the new fields do not exist.

- [x] **Step 3: Implement the schema expansion**

Use these exact field shapes:

```ts
// connections.ts
oauth_client_id: text('oauth_client_id'),
oauth_client_secret: text('oauth_client_secret'),
refresh_expira_em: timestamp('refresh_expira_em', { withTimezone: true, mode: 'date' }),
last_refresh_at: timestamp('last_refresh_at', { withTimezone: true, mode: 'date' }),
last_error_code: varchar('last_error_code', { length: 64 }),
last_error_at: timestamp('last_error_at', { withTimezone: true, mode: 'date' }),
```

Add a partial unique index on `connections.org_id` where `status = 'ok'`, while preserving `connections_org_provider_uq`.

```ts
// orders.ts
provider: varchar('provider', { length: 32 }).notNull().default('bling'),
provider_order_id: varchar('provider_order_id', { length: 64 }).notNull(),
```

Add unique `(org_id, provider, provider_order_id)` and keep `orders_org_bling_uq`.

```ts
// product-stock.ts
provider: varchar('provider', { length: 32 }).notNull().default('bling'),
provider_product_id: varchar('provider_product_id', { length: 64 }),
```

Add unique `(org_id, provider, sku)` and keep `product_stock_org_sku_uq`.

Create `connectionSyncState` with:

```ts
id, org_id, provider, resource, cursor: jsonb,
run_id, lease_token, lease_expires_at,
started_at, succeeded_at, failed_at,
processed_count default 0, backlog_count,
last_error_code, created_at, updated_at
```

Use a unique constraint on `(org_id, provider, resource)` and an index on `lease_expires_at`.

The SQL migration must follow this order:

1. Add nullable order/provider identifier columns.
2. Backfill `orders.provider = 'bling'` and `provider_order_id = bling_order_id`.
3. Set both order columns `NOT NULL` and provider default.
4. Add connection and stock columns; backfill stock provider to `bling`; set provider `NOT NULL DEFAULT 'bling'`.
5. Add non-conflicting unique indexes with `IF NOT EXISTS`.
6. Create `connection_sync_state` and its FK/indexes.

- [ ] **Step 4: Apply migration to the isolated test database and verify GREEN**

Run the repository's test database migration command from `package.json`, then:

```powershell
npm test -- tests/integration/provider-foundation-schema.test.ts
npm test -- tests/integration/schema-h5.test.ts tests/integration/connection-repository.test.ts tests/integration/collect-bling.test.ts tests/integration/stock-repository.test.ts
```

Expected: all available tests pass; database-dependent tests may skip only when `DATABASE_URL_TEST` is absent locally.

- [x] **Step 5: Commit the schema task**

```powershell
git add src/db/schema src/db/migrations tests/integration/provider-foundation-schema.test.ts
git commit -m "feat(olist): expandir schema para providers ERP"
```

---

### Task 2: Criar o contrato e registry tipado de ERPs

**Files:**
- Modify: `src/modules/providers/types.ts`
- Modify: `src/modules/providers/bling/provider.ts`
- Create: `src/modules/providers/registry.ts`
- Test: `tests/unit/provider-registry.test.ts`

**Interfaces:**
- Produces: `type ErpProviderId = 'bling' | 'olist'`.
- Produces: `getErpProvider(provider: ErpProviderId): ConnectionProvider`.
- Produces: `listRegisteredErpProviders(): readonly ErpProviderId[]`.
- Preserves: `blingProvider` and all current `ConnectionProvider` methods.

- [x] **Step 1: Write the failing unit tests**

```ts
import { describe, expect, it } from 'vitest';
import { blingProvider } from '@/modules/providers/bling/provider';
import { getErpProvider, listRegisteredErpProviders } from '@/modules/providers/registry';

describe('ERP provider registry', () => {
  it('resolve o Bling pelo identificador tipado', () => {
    expect(getErpProvider('bling')).toBe(blingProvider);
  });

  it('não anuncia Olist antes do adaptador existir', () => {
    expect(listRegisteredErpProviders()).toEqual(['bling']);
    expect(() => getErpProvider('olist')).toThrow('erp_provider_nao_registrado:olist');
  });
});
```

- [x] **Step 2: Run the test and verify RED**

```powershell
npm test -- tests/unit/provider-registry.test.ts
```

Expected: module `@/modules/providers/registry` not found.

- [x] **Step 3: Implement the minimal registry**

In `types.ts`, add `ErpProviderId` and change `ConnectionProvider.name` from `string` to `ErpProviderId`.

In `registry.ts`, use an explicit partial registry so `olist` remains a valid domain value but cannot be resolved before implementation:

```ts
const registry: Partial<Record<ErpProviderId, ConnectionProvider>> = {
  bling: blingProvider,
};

export function getErpProvider(provider: ErpProviderId): ConnectionProvider {
  const adapter = registry[provider];
  if (!adapter) throw new Error(`erp_provider_nao_registrado:${provider}`);
  return adapter;
}

export function listRegisteredErpProviders(): readonly ErpProviderId[] {
  return Object.freeze(Object.keys(registry) as ErpProviderId[]);
}
```

- [x] **Step 4: Run focused and provider regression tests**

```powershell
npm test -- tests/unit/provider-registry.test.ts tests/unit/bling-oauth.test.ts tests/unit/bling-orders-retry.test.ts tests/unit/bling-order-detail.test.ts tests/unit/bling-stock.test.ts
npm run typecheck
```

Expected: all tests and typecheck pass.

- [x] **Step 5: Commit the registry task**

```powershell
git add src/modules/providers/types.ts src/modules/providers/bling/provider.ts src/modules/providers/registry.ts tests/unit/provider-registry.test.ts
git commit -m "feat(olist): adicionar registry tipado de ERPs"
```

---

### Task 3: Documentar compatibilidade e executar o gate completo

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-28-olist-provider-foundation.md`

**Interfaces:**
- Documents: Bling segue como único provider operacional; Olist ainda não é conectável.
- Documents: próximos incrementos são OAuth/refresh Olist, pedidos/detalhes e estoque/rate limit.

- [x] **Step 1: Update README architecture and roadmap**

Add a concise “ERPs” subsection stating that the schema and provider registry are multi-ERP ready, while only Bling is active in this release. Do not claim Olist support is available.

- [x] **Step 2: Run the complete verification gate**

```powershell
npm run test:ci
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: tests, typecheck and build exit 0; lint has zero errors. Pre-existing warnings must be reported and not expanded by changed files.

- [x] **Step 3: Mark plan checkboxes and commit documentation**

```powershell
git add README.md docs/superpowers/plans/2026-07-28-olist-provider-foundation.md
git commit -m "docs(olist): registrar fundação multi-ERP"
```

- [x] **Step 4: Review final diff for scope and secrets**

Verify the diff contains no OAuth credential values, no Olist routes/UI, no removal of Bling fields and no unrelated formatting.
