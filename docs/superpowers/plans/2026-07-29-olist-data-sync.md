# Olist ERP Data Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar pedidos, detalhes e estoque do Olist ERP API v3 no domínio provider-aware do Truth Analytics, preservando integralmente o Bling e permitindo relatórios, métricas e alertas reproduzíveis pelo ERP ativo.

**Architecture:** A implementação usa branch-by-abstraction em dois incrementos. O incremento A torna pedidos e todas as leituras de negócio provider-aware, adiciona o adapter Olist, backfill/readiness e cutover transacional; o incremento B adiciona catálogo e estoque Olist retomáveis sobre o mesmo orçamento de API e `connection_sync_state`. Dados Olist podem existir em shadow, mas somente a conexão `status='ok'` alimenta o produto.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM 0.45, PostgreSQL, Zod, Vitest, Playwright, GitHub Actions, Vercel Functions.

## Global Constraints

- Seguir TDD estrito: cada comportamento novo precisa falhar pelo motivo esperado antes da implementação.
- Base Olist fixa: `https://api.tiny.com.br/public-api/v3`; todas as operações desta fase são somente leitura.
- No máximo uma conexão `status='ok'` por organização; Olist `configurado` permanece shadow enquanto outro ERP estiver operacional.
- Toda leitura e escrita de pedido ou estoque recebe `org_id`, `provider` e `source_generation`; identidades idempotentes são `(org_id, provider, source_generation, provider_order_id)` e `(org_id, provider, source_generation, sku)`.
- Relatórios gravam `source_provider` e `source_generation` no claim da execução e usam essa fonte imutável até o fim, mesmo se houver cutover concorrente.
- Nunca registrar token, client secret, bearer header, URL completa com query, payload remoto, cliente, CPF/CNPJ ou endereço.
- Reutilizar `getValidAccessTokenForProvider`; um `401` permite uma renovação/replay e nunca mistura estado Olist com Bling.
- Os limites oficiais de leitura são 30/60/120/140 req/min conforme plano. Olist usa governor PostgreSQL distribuído por fingerprint HMAC da conta, não memória/processo/org, e opera abaixo do menor plano: teto 27/min, intervalo mínimo 2.200 ms com jitter, concorrência inicial 1 e timeout 10 s.
- `429`, rede e `5xx` recebem no máximo 2 tentativas totais; `Retry-After` é limitado a 30 segundos; outros `4xx` são permanentes.
- Nenhuma execução inicia novas chamadas depois de 240 segundos; cursor avança apenas depois do lote persistido e com fencing token válido.
- Backfill inicial de pedidos cobre 90 dias em duas passagens: snapshot por criação e catch-up por `dataAtualizacao` desde o instante capturado antes da primeira página. Incrementais usam `dataAtualizacao` com sobreposição de cinco minutos, sem limitar pela data de criação, para capturar cancelamentos antigos; cinco falhas permanentes de detail colocam o pedido em quarentena sem apagar a linha.
- Bling deve continuar operacional em todas as tarefas e passar por seus testes de regressão antes de cada merge.
- Migrações, unique constraints, lease/fencing e isolamento multi-tenant/provider exigem PostgreSQL real em `DATABASE_URL_TEST`; skips locais não satisfazem o gate de merge.
- O incremento A precisa entregar relatório Olist completo antes de começar o incremento B; o incremento B precisa entregar cobertura/alertas de estoque antes de ser considerado concluído.
- Olist ativo precisa renovar tokens tanto em `configurado` quanto em `ok`, preservando o status que possuía antes do refresh.
- Depois que a primeira linha shadow Olist existir, o rollback mínimo de binário é a release provider-aware completa; deploy de binário anterior é proibido porque ele lê por org apenas e depende da unique Bling legada.
- SLOs operacionais: pedidos incrementais p95 até 30 minutos e hard limit 2 horas; backfill/readiness de até 90 dias em 24 horas; estoque de catálogos até 10.000 SKUs em 24 horas; catálogos acima de 50.000 produtos param com `olist_catalogo_acima_do_limite`.

---

## Incremento A — pedidos, detalhes, relatórios e ativação

### Task 1: Release expand — compatibilizar Bling e adicionar identidade/generation sem contract

**Files:**
- Modify: `src/modules/pipeline/steps/collect-bling.ts`
- Modify: `src/db/schema/orders.ts`
- Modify: `src/db/schema/reports.ts`
- Modify: `src/db/schema/connections.ts`
- Create: `src/db/schema/provider-rate-limit-state.ts`
- Modify: `src/db/schema/index.ts`
- Create: `src/db/migrations/0022_olist_orders_reports_expand.sql`
- Create: `src/db/migrations/meta/0022_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`
- Modify: `tests/integration/collect-bling.test.ts`
- Create: `tests/integration/olist-orders-schema.test.ts`
- Modify: `tests/unit/schema-pipeline.test.ts`

**Interfaces:**
- Preserves: `collectBlingOrders(orgId: string, periodo: Periodo): Promise<CollectResult>`.
- Produces: nullable `orders.bling_order_id`; `orders.provider_status`, `source_generation`, `enrichment_attempts`, `enrichment_last_attempt_at`, `enrichment_last_error_code`; rolling nullable `reports.source_provider`, `source_generation`.
- Produces: `connections.provider_account_fingerprint`, `data_generation`; distributed `provider_rate_limit_state` keyed by `(provider, account_fingerprint)`.
- Establishes: `orders_org_provider_generation_order_uq(org_id,provider,source_generation,provider_order_id)` alongside legacy uniques. `orders_org_bling_uq`, `orders_fill_legacy_provider_id`, defaults and nullable report source fields remain durante toda esta entrega; o contract/NOT NULL só ocorrerá em migration/release posterior, fora deste plano, após confirmar frota/job compatíveis e encerrar a janela de rollback.

- [ ] **Step 1: Write failing PostgreSQL and Bling compatibility tests**

Add these real-database assertions to the named suites:

```ts
it('grava Bling pela chave provider-aware sem apagar detalhe', async () => {
  await collectBlingOrders(orgId, periodo);
  await db.update(orders).set({ itens: [{ sku: 'SKU-1', nome: 'Item', quantidade: 1, valor: 10 }], enriquecido_em: new Date() })
    .where(and(eq(orders.org_id, orgId), eq(orders.provider_order_id, 'bling-1')));
  await collectBlingOrders(orgId, periodo);
  const [row] = await db.select().from(orders)
    .where(and(eq(orders.org_id, orgId), eq(orders.provider, 'bling'), eq(orders.provider_order_id, 'bling-1')));
  expect(row.bling_order_id).toBe('bling-1');
  expect(row.itens).toHaveLength(1);
});

it('aceita pedido Olist sem identificador Bling e mantém unicidade por provider', async () => {
  const value = { org_id: orgId, provider: 'olist', provider_order_id: '991', bling_order_id: null,
    canal: 'Mercado Livre', data: new Date(), valor_total: '100.00' };
  await db.insert(orders).values(value);
  await expect(db.insert(orders).values(value)).rejects.toMatchObject({ code: '23505' });
});

it('preenche relatórios históricos como Bling', async () => {
  const rows = await db.select({ source: reports.source_provider }).from(reports)
    .where(eq(reports.org_id, orgId));
  expect(rows.every((row) => row.source === 'bling')).toBe(true);
});

it('mantém writers legados válidos durante rolling deploy', async () => {
  const [row] = await db.insert(orders).values({
    org_id: orgId, bling_order_id: 'legacy-1', canal: 'Bling', data: new Date(), valor_total: '10.00',
  }).returning();
  expect(row.provider_order_id).toBe('legacy-1');
  expect(row.source_generation).toBe(1);
});
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm run db:migrate:test
npm test -- tests/integration/collect-bling.test.ts tests/integration/olist-orders-schema.test.ts tests/unit/schema-pipeline.test.ts
```

Expected: compilation or migration assertions fail because the new columns/nullability are absent and `collect-bling` still conflicts on `(org_id, bling_order_id)`.

- [ ] **Step 3: Implement the compatibility writer and migration**

Change Bling insert values and conflict target exactly as follows while preserving the current list-only update set:

```ts
const values = validOrders.map((o) => ({
  org_id: orgId,
  provider: 'bling' as const,
  source_generation: 1,
  provider_order_id: o.blingOrderId,
  bling_order_id: o.blingOrderId,
  canal: o.canal,
  data: o.data,
  valor_total: String(o.valorTotal),
  frete: String(o.frete),
  itens: o.itens,
}));

target: [orders.org_id, orders.provider, orders.source_generation, orders.provider_order_id]
```

Migration order:

```sql
ALTER TABLE "orders" ALTER COLUMN "bling_order_id" DROP NOT NULL;
ALTER TABLE "orders" ADD COLUMN "provider_status" varchar(32);
ALTER TABLE "orders" ADD COLUMN "source_generation" integer DEFAULT 1 NOT NULL;
CREATE UNIQUE INDEX "orders_org_provider_generation_order_uq"
  ON "orders" ("org_id", "provider", "source_generation", "provider_order_id");
ALTER TABLE "orders" ADD COLUMN "enrichment_attempts" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN "enrichment_last_attempt_at" timestamptz;
ALTER TABLE "orders" ADD COLUMN "enrichment_last_error_code" varchar(64);
CREATE INDEX "orders_org_provider_data_idx" ON "orders" ("org_id", "provider", "data");
ALTER TABLE "reports" ADD COLUMN "source_provider" varchar(32);
UPDATE "reports" SET "source_provider" = 'bling' WHERE "source_provider" IS NULL;
ALTER TABLE "reports" ADD COLUMN "source_generation" integer;
UPDATE "reports" SET "source_generation" = 1 WHERE "source_generation" IS NULL;
ALTER TABLE "connections" ADD COLUMN "provider_account_fingerprint" varchar(64);
ALTER TABLE "connections" ADD COLUMN "data_generation" integer DEFAULT 1 NOT NULL;
```

Create `provider_rate_limit_state(provider, account_fingerprint, next_request_at, window_started_at, requests_in_window, consecutive_high_priority, observed_limit, observed_remaining, observed_reset_at, updated_at)` with a composite unique key. Do **not** drop `orders_org_bling_uq`, trigger or defaults in `0022`. The release order is: apply expand migration; deploy Bling writer using the new conflict key; deploy every provider-aware reader with Olist disabled; only then allow shadow. Generate and commit the matching Drizzle snapshot/journal entry.

- [ ] **Step 4: Verify GREEN against PostgreSQL and Bling regressions**

```powershell
npm run db:migrate:test
npm test -- tests/integration/olist-orders-schema.test.ts tests/integration/collect-bling.test.ts tests/integration/provider-foundation-schema.test.ts tests/integration/orchestrator.test.ts
npm test -- tests/unit/bling-orders-retry.test.ts tests/unit/bling-order-detail.test.ts tests/unit/schema-pipeline.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/pipeline/steps/collect-bling.ts src/db/schema/orders.ts src/db/schema/reports.ts src/db/migrations tests/integration/collect-bling.test.ts tests/integration/olist-orders-schema.test.ts tests/unit/schema-pipeline.test.ts
git commit -m "refactor(erp): compatibilizar pedidos e relatórios por provider"
```

---

### Task 2: Separar contratos de dados do OAuth e registrar os adapters operacionais

**Files:**
- Modify: `src/modules/providers/types.ts`
- Create: `src/modules/providers/data.types.ts`
- Modify: `src/modules/providers/registry.ts`
- Modify: `src/modules/providers/bling/orders.ts`
- Modify: `src/modules/providers/bling/order-detail.ts`
- Modify: `src/modules/providers/bling/provider.ts`
- Modify: `tests/unit/provider-registry.test.ts`
- Modify: `tests/unit/bling-orders-retry.test.ts`
- Modify: `tests/unit/bling-order-detail.test.ts`

**Interfaces:**
- Produces: `RawOrder`, `RawOrderDetail`, `OrderPage`, `OrderPageRequest`, `ErpDataProvider`, `OrderPageHandler` from `data.types.ts`.
- Produces: `getErpDataProvider(provider: ErpProviderId): ErpDataProvider` and `listRegisteredErpDataProviders()`.
- Preserves: `OAuthTokens`, `ErpProviderId`, `RawStockItem` in `types.ts`; OAuth registry remains separate.

- [ ] **Step 1: Write failing contract/registry tests**

```ts
expect(mapOrder({ id: 17, data: '2026-07-29', total: 50 }, new Map()))
  .toMatchObject({ providerOrderId: '17', providerStatus: '' });
expect(getErpDataProvider('bling').name).toBe('bling');
expect(() => getErpDataProvider('olist')).toThrow('erp_data_provider_nao_registrado:olist');
expect(listRegisteredErpDataProviders()).toEqual(['bling']);
```

Assert the Bling detail adapter now returns `canal` instead of exposing `canalId` outside the adapter and still maps commission/freight/items exactly.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/provider-registry.test.ts tests/unit/bling-orders-retry.test.ts tests/unit/bling-order-detail.test.ts
```

Expected: the provider-neutral exports and properties do not exist.

- [ ] **Step 3: Implement focused data contracts**

```ts
export type RawOrder = {
  providerOrderId: string;
  providerStatus: string;
  canal: string;
  data: Date;
  valorTotal: number;
  frete: number;
  itens: RawOrderItem[];
};

export type RawOrderDetail = {
  itens: RawOrderItem[];
  frete: number;
  comissao: number;
  canal?: string;
};

export type ErpDataSource = {
  orgId: string;
  provider: ErpProviderId;
  sourceGeneration: number;
};

export type OrderPageRequest =
  | { mode: 'created'; periodo: Periodo; offset: number; limit: 100 }
  | { mode: 'updated'; updatedAfter: Date; offset: number; limit: 100 };
export type OrderPage = { orders: RawOrder[]; offset: number; nextOffset: number; total: number; done: boolean };
export type OrderPageHandler = (page: OrderPage) => Promise<void>;

export interface ErpDataProvider {
  readonly name: ErpProviderId;
  fetchOrders(orgId: string, request: OrderPageRequest, onPage: OrderPageHandler): Promise<void>;
  fetchOrderDetail(orgId: string, providerOrderId: string): Promise<RawOrderDetail>;
}
```

The Bling adapter may translate its page-number API internally, but must emit offsets `0, 100, ...`. Resolve `loja.id` to a name inside the Bling adapter so consumers never branch on provider-specific detail shapes.

- [ ] **Step 4: Verify GREEN and OAuth isolation**

```powershell
npm test -- tests/unit/provider-registry.test.ts tests/unit/oauth-registry.test.ts tests/unit/bling-orders-retry.test.ts tests/unit/bling-order-detail.test.ts tests/unit/bling-oauth.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/providers tests/unit/provider-registry.test.ts tests/unit/bling-orders-retry.test.ts tests/unit/bling-order-detail.test.ts
git commit -m "refactor(erp): extrair contrato operacional de pedidos"
```

---

### Task 3: Criar cliente HTTP Olist com token, orçamento compartilhado e erros seguros

**Files:**
- Create: `src/modules/providers/olist/account.ts`
- Create: `src/modules/providers/olist/rate-governor.repository.ts`
- Create: `src/modules/providers/olist/http.ts`
- Modify: `src/modules/connections/provider-connection.repository.ts`
- Modify: `src/modules/connections/olist-token-renewal.ts`
- Modify: `src/app/api/connections/olist/callback/route.ts`
- Create: `tests/integration/olist-rate-governor.test.ts`
- Create: `tests/unit/olist-account.test.ts`
- Test: `tests/unit/olist-http.test.ts`
- Modify: `tests/unit/olist-oauth-routes.test.ts`
- Modify: `tests/integration/olist-token-renewal.test.ts`

**Interfaces:**
- Produces: `fingerprintOlistAccount(cpfCnpj: string): string` using HMAC-SHA-256 and `loadAndBindOlistAccount(orgId): Promise<{ fingerprint: string; sourceGeneration: number }>` from `GET /info`.
- Produces: `reserveOlistRequest(input: { accountFingerprint: string; priority: 'orders' | 'details' | 'stock' }): Promise<{ startAt: Date }>` using PostgreSQL time/state.
- Produces: `observeOlistRateHeaders(fingerprint, headers): Promise<void>` for case-insensitive `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` when present; absence keeps the conservative 27/min governor.
- Produces: `fetchOlistJson<T>(input: { orgId: string; priority: OlistRequestPriority; path: string; query?: Record<string,string>; schema: z.ZodType<T> }): Promise<T>`.
- Produces: `OlistDataError` with `code`, `kind: 'transient' | 'permanent' | 'auth'`, and HTTP status only.
- Changes: `renewOlistConnection(orgId: string, now?: Date, options?: { force?: boolean }): Promise<OlistRenewalResult>`; `force` bypasses only the expiry-margin short circuit and retains compare-and-swap.

- [ ] **Step 1: Write failing account, distributed-governor and HTTP tests**

```ts
expect(fingerprintOlistAccount('12.345.678/0001-99')).toMatch(/^[a-f0-9]{64}$/);
expect(fingerprintOlistAccount('12345678000199')).toBe(fingerprintOlistAccount('12.345.678/0001-99'));

const slots = await Promise.all([
  reserveOlistRequest({ accountFingerprint: account, priority: 'orders' }),
  reserveOlistRequest({ accountFingerprint: account, priority: 'details' }),
  reserveOlistRequest({ accountFingerprint: account, priority: 'stock' }),
]);
expect(slots[1].startAt.getTime() - slots[0].startAt.getTime()).toBeGreaterThanOrEqual(2200);
expect(slots[2].startAt.getTime() - slots[1].startAt.getTime()).toBeGreaterThanOrEqual(2200);

await expect(fetchOlistJson({ orgId: 'org-a', priority: 'orders', path: '/pedidos', schema }))
  .resolves.toEqual({ itens: [] });
```

Use two independent DB clients/process simulations and assert they cannot reserve the same account slot concurrently; different orgs with the same fingerprint share state; different fingerprints do not block each other. Assert five order/detail slots followed by a pending stock request grants one stock slot before the sixth high-priority slot, and stock yields while the order-update backlog is above its SLO.

For `/info`, assert the OAuth callback saves tokens, calls account binding before redirecting success and fails closed as `olist_conta_nao_validada` if fingerprint cannot be bound. Only normalized `cpfCnpj` is HMACed; raw document, company name, address, email and response body are discarded. Binding a different fingerprint increments `connections.data_generation`, clears readiness state and leaves old generation rows stored but unreadable. Replacing credentials increments generation even when `/info` later resolves to the same account, forcing a conservative two-pass rebuild.

HTTP assertions: timeout aborts at 10s; 429/5xx/network retry once after a new distributed reservation; `Retry-After: 40` waits 30s; 403/404 do not retry; first 401 forces refresh/replay once; rate headers update observed state but never raise the configured ceiling above 27; Authorization/query/body are absent from logs/errors.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/olist-account.test.ts tests/integration/olist-rate-governor.test.ts tests/unit/olist-http.test.ts tests/unit/olist-oauth-routes.test.ts tests/integration/olist-token-renewal.test.ts
```

- [ ] **Step 3: Implement account binding and PostgreSQL governor**

The one-time bootstrap `/info` call uses the connection ID as a conservative temporary lock, then binds the stable fingerprint `HMAC-SHA256(CONNECTION_ENCRYPTION_KEY, digits(cpfCnpj))`. Every subsequent request requires that fingerprint. Reservation uses one PostgreSQL transaction, `clock_timestamp()`, row lock and persisted next slot; JavaScript clocks never decide lease/rate ownership. Apply weighted fairness of five `orders/details` reservations to one waiting `stock` reservation, while overdue incremental orders suppress new stock work until freshness recovers.

`fetchOlistJson` builds URLs only from the fixed base and path beginning `/`, reserves before every attempt, reads the token immediately before the request, records the three rate headers case-insensitively, and parses only through the supplied Zod schema. Keep `MAX_ATTEMPTS=2` and `OLIST_REQUEST_TIMEOUT_MS=10_000`. `renewOlistConnection` candidate selection and CAS accept both `configurado` and `ok`; success preserves the previous status instead of setting `configurado`.

- [ ] **Step 4: Verify GREEN and secret safety**

```powershell
npm run db:migrate:test
npm test -- tests/unit/olist-account.test.ts tests/integration/olist-rate-governor.test.ts tests/unit/olist-http.test.ts tests/unit/olist-oauth-routes.test.ts tests/integration/olist-token-renewal.test.ts tests/unit/logger.test.ts
npm run typecheck
rg -n "Authorization|accessToken|refreshToken|cpfCnpj" src/modules/providers/olist src/modules/connections/provider-connection.repository.ts
```

Expected: secrets/document appear only in protocol parsing/HMAC/request construction, never in logger metadata, audit, stored account state or thrown messages.

- [ ] **Step 5: Commit**

```powershell
git add src/modules/providers/olist src/modules/connections src/db/schema src/db/migrations tests/unit/olist-account.test.ts tests/integration/olist-rate-governor.test.ts tests/unit/olist-http.test.ts tests/integration/olist-token-renewal.test.ts
git commit -m "feat(olist): governar API por conta e geração"
```

---

### Task 4: Mapear páginas e detalhes oficiais de pedidos Olist

**Files:**
- Create: `src/modules/providers/olist/channel.ts`
- Create: `src/modules/providers/olist/orders.ts`
- Create: `src/modules/providers/olist/order-detail.ts`
- Modify: `src/modules/providers/olist/provider.ts`
- Create: `tests/fixtures/olist/orders-page.json`
- Create: `tests/fixtures/olist/order-detail.json`
- Create: `tests/unit/olist-channel.test.ts`
- Create: `tests/unit/olist-orders.test.ts`
- Create: `tests/unit/olist-order-detail.test.ts`
- Modify: `tests/unit/provider-registry.test.ts`

**Interfaces:**
- Produces: `resolveOlistChannel(input): string`, always trimmed to 32 characters.
- Produces: `fetchOlistOrders(orgId, request, onPage): Promise<void>` and `fetchOlistOrderDetail(orgId, providerOrderId): Promise<RawOrderDetail>`.
- Produces: `olistDataProvider: ErpDataProvider`; registry order becomes `['bling', 'olist']`.

- [ ] **Step 1: Add complete official fixtures and failing mapping tests**

Fixtures must include `itens`, `paginacao.limit/offset/total`, ecommerce fields, origin, invalid date case, detail items, freight and intermediary. Assert:

```ts
expect(resolveOlistChannel({ ecommerce: { canalVenda: 'Mercado Livre', nome: 'Loja ML' } })).toBe('Mercado Livre');
expect(resolveOlistChannel({ ecommerce: { nome: 'Loja Shopee' } })).toBe('Loja Shopee');
expect(resolveOlistChannel({ intermediador: { nome: 'Amazon' } })).toBe('Amazon');
expect(resolveOlistChannel({})).toBe('Olist ERP');

expect(page.orders[0]).toMatchObject({
  providerOrderId: '6201', providerStatus: '3', canal: 'Mercado Livre', valorTotal: 199.9,
});
expect(page).toMatchObject({ offset: 0, nextOffset: 2, total: 3, done: false });
expect(detail).toEqual({
  itens: [{ sku: 'SKU-1', nome: 'Produto 1', quantidade: 2, valor: 49.95 }],
  frete: 10, comissao: 0, canal: 'Mercado Livre',
});
```

Assert invalid/missing `id`, `dataCriacao`, `valor`, pagination or used detail fields throws `olist_pedidos_resposta_invalida`/`olist_detalhe_resposta_invalida`; unknown extra fields are accepted; an invalid date never becomes epoch.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/olist-channel.test.ts tests/unit/olist-orders.test.ts tests/unit/olist-order-detail.test.ts tests/unit/provider-registry.test.ts
```

- [ ] **Step 3: Implement strict-used/tolerant-extra Zod mapping**

Call the creation backfill exactly as below; for incremental/catch-up replace `dataInicial/dataFinal` with `dataAtualizacao: formatDateTime(request.updatedAfter)` and do not send a creation-date filter:

```ts
await fetchOlistJson({
  orgId,
  path: '/pedidos',
  query: {
    dataInicial: formatDate(request.periodo.inicio),
    dataFinal: formatDate(request.periodo.fim),
    orderBy: 'asc', limit: '100', offset: String(request.offset),
  },
  schema: OlistOrdersPageSchema,
});
```

For detail use `/pedidos/${encodeURIComponent(providerOrderId)}`. Map `id` to string, `dataCriacao` to a validated `Date`, `valor` to finite number, status to string, and emit the page to `onPage` once. Add a test in which an order created 120 days ago is returned by `dataAtualizacao` as newly cancelled and maps `providerStatus='2'`. Detail maps `produto.id` only as remote context, `produto.sku/descricao`, quantity/unit value, freight and channel; it never reads customer/address/document fields and always sets commission to zero.

- [ ] **Step 4: Verify GREEN and registry behavior**

```powershell
npm test -- tests/unit/olist-channel.test.ts tests/unit/olist-orders.test.ts tests/unit/olist-order-detail.test.ts tests/unit/provider-registry.test.ts tests/unit/bling-order-detail.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/providers/olist src/modules/providers/registry.ts tests/fixtures/olist tests/unit/olist-channel.test.ts tests/unit/olist-orders.test.ts tests/unit/olist-order-detail.test.ts tests/unit/provider-registry.test.ts
git commit -m "feat(olist): mapear pedidos e detalhes v3"
```

---

### Task 5: Implementar lease, fencing e cursor durável

**Files:**
- Create: `src/modules/connections/sync-state.repository.ts`
- Create: `tests/integration/sync-state-lease.test.ts`
- Create: `tests/unit/sync-state-cursor.test.ts`

**Interfaces:**
- Produces: `SyncResource = 'orders_list' | 'order_details' | 'stock'`.
- Produces: `acquireSyncLease(input): Promise<SyncLease | null>`, `advanceSyncCursor(input): Promise<boolean>`, `completeSyncLease(input): Promise<boolean>`, `failSyncLease(input): Promise<boolean>`.
- Produces: `parseOrdersCursor(value): OlistOrdersCursor` where `{ pass: 'created' | 'updated'; from: string; to: string; updatedAfter: string; offset: number; total: number | null; sourceGeneration: number }`.

- [ ] **Step 1: Write failing concurrent PostgreSQL tests**

```ts
const first = await acquireSyncLease({ orgId, provider: 'olist', resource: 'orders_list', ttlMs: 270_000, now });
expect(first).not.toBeNull();
expect(await acquireSyncLease({ orgId, provider: 'olist', resource: 'orders_list', ttlMs: 270_000, now })).toBeNull();

const successor = await acquireSyncLease({ orgId, provider: 'olist', resource: 'orders_list', ttlMs: 270_000, now: afterExpiry });
expect(successor?.token).not.toBe(first?.token);
expect(await advanceSyncCursor({ ...first!, cursor: { from, to, offset: 100, total: 200 }, processedDelta: 100 })).toBe(false);
expect(await advanceSyncCursor({ ...successor!, cursor: { from, to, offset: 100, total: 200 }, processedDelta: 100 })).toBe(true);
```

Assert separate resources can lease concurrently; separate providers/orgs do not collide; completion sets `succeeded_at`, clears lease and error; failure preserves cursor, sets allowlisted error, clears lease only for current owner; malformed cursors reset to the explicit initial cursor supplied by caller.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/integration/sync-state-lease.test.ts tests/unit/sync-state-cursor.test.ts
```

- [ ] **Step 3: Implement atomic acquisition and fenced updates**

Define:

```ts
export type SyncLease = {
  orgId: string; provider: ErpProviderId; resource: SyncResource;
  token: string; runId: string; expiresAt: Date; cursor: unknown;
};
```

Acquisition performs one `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE lease_token IS NULL OR lease_expires_at <= now RETURNING`, with `randomUUID()` for run/token. Every advance/complete/fail predicate includes org, provider, resource and the exact token. Do not hold a transaction or row lock while calling an ERP.

- [ ] **Step 4: Verify GREEN on PostgreSQL**

```powershell
npm run db:migrate:test
npm test -- tests/integration/sync-state-lease.test.ts tests/unit/sync-state-cursor.test.ts tests/integration/provider-foundation-schema.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/connections/sync-state.repository.ts tests/integration/sync-state-lease.test.ts tests/unit/sync-state-cursor.test.ts
git commit -m "feat(sync): adicionar cursor e lease com fencing"
```

---

### Task 6: Tornar coleta de pedidos provider-aware e retomável

**Files:**
- Create: `src/modules/pipeline/steps/collect-orders.ts`
- Modify: `src/modules/pipeline/steps/collect-bling.ts`
- Create: `tests/integration/collect-orders-provider.test.ts`
- Modify: `tests/integration/collect-bling.test.ts`

**Interfaces:**
- Produces: `collectOrders(source: ErpDataSource, periodo: Periodo, options?: { deadlineMs?: number; startOffset?: number }): Promise<CollectResult & { expectedTotal?: number; incompleto?: boolean }>`.
- Preserves: `collectBlingOrders` as a deprecated wrapper resolving Bling generation and calling `collectOrders(source, periodo)`.
- Produces: `persistOrdersPageWithLease(input): Promise<boolean>`; page upsert and cursor advance share one transaction fenced by lease token, DB expiry and data generation.

- [ ] **Step 1: Write failing idempotency, resume and isolation tests**

Mock registry pages and assert:

```ts
await collectOrders(orgA, 'olist', periodo);
await collectOrders(orgA, 'olist', periodo);
await collectOrders(orgB, 'olist', periodo);
expect(await countOrders(orgA, 'olist', '6201')).toBe(1);
expect(await countOrders(orgB, 'olist', '6201')).toBe(1);
```

Seed an enriched row and assert list replay updates date/total/status/channel but preserves `itens`, `frete`, `comissao`, `enriquecido_em`. Make page 2 persistence fail and assert cursor remains at page 2 start; rerun and assert it resumes there. Expire/replace the lease after HTTP returns and assert the stale worker writes neither orders nor cursor. Increment connection generation and assert the old worker is fenced out. Assert an Olist order writes `bling_order_id=null` and current generation, while a Bling order continues mirroring both IDs.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/integration/collect-orders-provider.test.ts tests/integration/collect-bling.test.ts
```

- [ ] **Step 3: Implement neutral upsert and progress**

Use conflict target:

```ts
target: [orders.org_id, orders.provider, orders.provider_order_id]
```

Values include provider, provider order ID, nullable mirrored Bling ID, provider status, `source_generation`, channel/date/total. Conflict target is `(org_id,provider,source_generation,provider_order_id)`. The update set excludes detail-owned fields and preserves a good channel when the incoming value is `Bling`, `Canal não identificado` or `Olist ERP`. For Olist acquire `orders_list`, use the saved offset when cursor window/generation matches, persist each page and advance cursor in one transaction whose first predicate checks `lease_token`, `lease_expires_at > clock_timestamp()` and current connection generation. Complete the lease only after `done=true`; if the deadline arrives first, fenced-release with cursor preserved and return `incompleto=true`. For Bling keep the existing non-leased report collection behavior but use the same neutral upsert.

- [ ] **Step 4: Verify GREEN and no Bling behavior drift**

```powershell
npm test -- tests/integration/collect-orders-provider.test.ts tests/integration/collect-bling.test.ts tests/unit/bling-orders-retry.test.ts tests/unit/olist-orders.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/pipeline/steps/collect-orders.ts src/modules/pipeline/steps/collect-bling.ts tests/integration/collect-orders-provider.test.ts tests/integration/collect-bling.test.ts
git commit -m "feat(pipeline): coletar pedidos por provider"
```

---

### Task 7: Tornar enriquecimento provider-aware, limitado e não bloqueante

**Files:**
- Modify: `src/modules/pipeline/steps/enrich-orders.ts`
- Modify: `tests/unit/enrich-orders.test.ts`
- Create: `tests/integration/enrich-orders-provider.test.ts`

**Interfaces:**
- Changes: `enrichOrders(source: ErpDataSource, opts: EnrichOptions): Promise<EnrichResult>`.
- Extends: `EnrichResult` with `quarentenados: number` while preserving `enriquecidos`, `falhas`, `restantes`, `incompleto`.
- Uses: `getErpDataProvider(provider).fetchOrderDetail(orgId, providerOrderId)`.
- Produces safe classification: `network|429|5xx -> transient`, `401 -> forced-refresh-once`, `403 -> permission`, `404 -> missing_remote`, invalid payload -> `contract`, local DB -> `local_transient`.

- [ ] **Step 1: Write failing queue/quarantine tests**

```ts
const result = await enrichOrders({ orgId, provider: 'olist', sourceGeneration: 3 }, { maxPedidos: 100, prazoMs: 240_000, periodo });
expect(fetchOrderDetail).toHaveBeenCalledWith(orgId, '6201');
expect(result).toMatchObject({ enriquecidos: 1, falhas: 0, quarentenados: 0 });
```

Assert selection filters org, provider and current generation; excludes rows with `enrichment_attempts >= 5`; success writes items/freight/commission/channel, clears error/attempts and sets `enriquecido_em`; stale/expired detail lease writes nothing. Transient/local failures remain retryable with exponential next-attempt time and do not consume the five permanent attempts; `missing_remote`, `permission` and `contract` increment permanent attempts; fifth permanent failure becomes quarantined. One failing order does not prevent the next; no request starts after deadline; Olist uses concurrency 1 while Bling preserves its 340ms gate/concurrency 3.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/enrich-orders.test.ts tests/integration/enrich-orders-provider.test.ts
```

- [ ] **Step 3: Implement provider-specific execution policy behind one queue**

Pending projection becomes `{ id, providerOrderId }` from `orders.provider_order_id`. The SQL predicate is org, provider, current generation, `enriquecido_em IS NULL`, permanent attempts below five, `next_attempt_at <= clock_timestamp()`, optional period. Acquire resource `order_details`; after HTTP, update detail/attempt state only when token remains owner, lease is unexpired by `clock_timestamp()` and generation still matches. Olist HTTP uses the distributed governor, so no second limiter is created. Count pending/quarantined with the same source. Log only provider, orgId, local row ID and safe code.

- [ ] **Step 4: Verify GREEN**

```powershell
npm test -- tests/unit/enrich-orders.test.ts tests/integration/enrich-orders-provider.test.ts tests/unit/bling-order-detail.test.ts tests/unit/olist-order-detail.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/pipeline/steps/enrich-orders.ts tests/unit/enrich-orders.test.ts tests/integration/enrich-orders-provider.test.ts
git commit -m "feat(pipeline): enriquecer pedidos por provider"
```

---

### Task 8: Resolver ERP ativo e escopar todas as leituras de pedidos

**Files:**
- Create: `src/modules/connections/active-provider.repository.ts`
- Create: `src/modules/orders/order-scope.ts`
- Modify: `src/modules/pipeline/steps/compute-metrics.ts`
- Modify: `src/modules/alerts/alert-data.repository.ts`
- Modify: `src/modules/analista/carteira-data.repository.ts`
- Modify: `src/modules/calendario/gerar-calendario.ts`
- Modify: `src/modules/kits/gerar-kits.ts`
- Modify: `src/modules/organizations/organization-settings.repository.ts`
- Modify: `src/modules/estoque/stock.repository.ts`
- Test: `tests/integration/active-provider-read-isolation.test.ts`
- Create: `tests/unit/order-query-scope-static.test.ts`
- Modify: `tests/integration/compute-metrics.test.ts`
- Modify: `tests/integration/alert-repository.test.ts`
- Modify: `tests/integration/carteira-data.test.ts`
- Modify: `tests/integration/organization-settings.test.ts`
- Modify: `tests/integration/stock-repository.test.ts`
- Modify: `tests/integration/calendario-repository.test.ts`
- Modify: `tests/integration/kit-repository.test.ts`

**Interfaces:**
- Produces: `ActiveErpRef = { orgId: string; provider: ErpProviderId; sourceGeneration: number; accountFingerprint: string | null; lastSyncAt: Date | null }`.
- Produces: `getActiveErpConnection(orgId): Promise<ActiveErpRef | null>` and `listActiveErpConnections(options?: { limit?: number }): Promise<ActiveErpRef[]>`.
- Produces: `orderScope(ref: ActiveErpRef)` and `orderScopes(refs)` including generation and known Olist cancellation exclusion.
- Changes order-reading functions to receive provider explicitly; batch functions receive `readonly ActiveErpRef[]`.

- [ ] **Step 1: Write one adversarial PostgreSQL isolation fixture**

For one org seed active Bling orders totaling 100, current-generation Olist totaling 900 and old-generation Olist totaling 8.000 in the same periods/SKUs. Assert every named reader returns only 100/active-provider results. Flip statuses transactionally and assert the same readers return only 900/current-generation Olist. Seed Olist `provider_status='2'` and assert it remains stored but is excluded.

The exact signature changes are:

```ts
computeMetrics(source, reportId, periodo, benchmarkParcial)
getTotaisSemanais(source, agora)
getUltimaVendaPorSku(source, desde)
getUltimaDataPedido(source)
getTotalVendasMesCorrente(source, agora?)
getTotalVendasMesAnterior(source, agora?)
getVendas30dPorSku(source, agora)
getVendas30dPorSkuBatch(refs, agora)
gerarCalendarioDoCiclo({ ...input, provider })
gerarKitsDoCiclo({ ...input, provider })
```

Internal cross-org carteira queries receive `refs` and use `orderScopes(refs)`, never `IN (orgIds)` alone.

- [ ] **Step 2: Run the isolation suite and verify RED**

```powershell
npm test -- tests/integration/active-provider-read-isolation.test.ts tests/integration/compute-metrics.test.ts tests/integration/alert-repository.test.ts tests/integration/carteira-data.test.ts tests/integration/organization-settings.test.ts tests/integration/stock-repository.test.ts tests/integration/calendario-repository.test.ts tests/integration/kit-repository.test.ts
```

- [ ] **Step 3: Implement active-source resolution and explicit predicates**

`getActiveErpConnection` requires active organization, connection `status='ok'`, non-null access token and registered data provider. `orderScope` receives the frozen ref and returns:

```ts
and(
  eq(orders.org_id, orgId),
  eq(orders.provider, provider),
  eq(orders.source_generation, sourceGeneration),
  provider === 'olist'
    ? or(isNull(orders.provider_status), ne(orders.provider_status, '2'))
    : undefined,
)
```

For a list of refs, build a bounded OR of `(org_id, provider, source_generation, cancellation predicate)`; the caller caps the organization batch before constructing it. Thread the frozen source through every caller. Do not resolve it inside low-level metric readers because reports must remain frozen to claim source.

- [ ] **Step 4: Prove no unscoped `orders` reader remains**

```powershell
npm test -- tests/integration/active-provider-read-isolation.test.ts tests/integration/compute-metrics.test.ts tests/integration/alert-repository.test.ts tests/integration/carteira-data.test.ts tests/integration/organization-settings.test.ts tests/integration/stock-repository.test.ts tests/integration/calendario-repository.test.ts tests/integration/kit-repository.test.ts
npm test -- tests/unit/order-query-scope-static.test.ts
rg -n "from\(orders\)|FROM orders|JOIN orders" src
npm run typecheck
```

The static test recursively scans `src/**/*.ts` and `src/**/*.tsx`, inventories every file containing `.from(orders)`, raw `FROM orders` or `JOIN orders`, and fails if a file is absent from an exact allowlist or lacks `orderScope/orderScopes` use. Expected: every match receives provider+generation; no production query filters orders by org alone.

- [ ] **Step 5: Commit**

```powershell
git add src/modules/connections/active-provider.repository.ts src/modules/orders src/modules/pipeline/steps/compute-metrics.ts src/modules/alerts src/modules/analista/carteira-data.repository.ts src/modules/calendario/gerar-calendario.ts src/modules/kits/gerar-kits.ts src/modules/organizations/organization-settings.repository.ts src/modules/estoque/stock.repository.ts tests/integration tests/unit/order-query-scope-static.test.ts
git commit -m "refactor(erp): isolar leituras pelo provider ativo"
```

---

### Task 9: Congelar source provider no relatório e neutralizar o pipeline

**Files:**
- Modify: `src/modules/reports/report.repository.ts`
- Modify: `src/modules/reports/report.types.ts`
- Modify: `src/modules/pipeline/orchestrator.ts`
- Modify: `src/modules/pipeline/sync-pedidos.ts`
- Modify: `src/modules/pipeline/steps/pos-finalize-extras.ts`
- Modify: `src/modules/pipeline/steps/analysis-context.ts`
- Modify: `src/modules/reports/compare.ts`
- Modify: `src/app/(client)/dashboard/relatorios/comparar/page.tsx`
- Modify: `src/app/(client)/dashboard/relatorios/comparar/comparar-form.tsx`
- Modify: `tests/integration/report-repository.test.ts`
- Modify: `tests/integration/orchestrator.test.ts`
- Modify: `tests/integration/sync-pedidos.test.ts`
- Create: `tests/integration/pipeline-olist.test.ts`
- Modify: `tests/unit/compare-reports.test.ts`
- Create: `tests/integration/report-source-generation.test.ts`

**Interfaces:**
- Produces: `claimQueuedReport(reportId): Promise<{ orgId: string; provider: ErpProviderId; sourceGeneration: number; periodo: Periodo } | null>`.
- Changes: `sincronizarPedidosDaOrg(source: ErpDataSource, agora: Date): Promise<SyncResult>`.
- Preserves: `generateReport(reportId): Promise<GenerateOutcome>` public signature.

- [ ] **Step 1: Write failing claim and Olist end-to-end pipeline integration tests**

```ts
const claimed = await claimQueuedReport(reportId);
expect(claimed?.provider).toBe('olist');
expect(claimed?.sourceGeneration).toBe(3);
const [stored] = await db.select({ provider: reports.source_provider, generation: reports.source_generation })
  .from(reports).where(eq(reports.id, reportId));
expect(stored).toEqual({ provider: 'olist', generation: 3 });
```

Assert claim and source resolution occur in one DB transaction; no active ERP throws `sem_conexao_erp`; a concurrent claim returns null; switching provider or generation after claim does not change collection/metrics. Seed old-generation rows and prove the report ignores them. `getDoneAnterior`, default comparison and explicit comparison accept only reports with equal non-null `(source_provider,source_generation)`; a cross-source request returns `relatorios_fontes_incompativeis` instead of a misleading delta. Existing historical null source is interpreted as `('bling',1)` only during rolling compatibility.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/integration/report-repository.test.ts tests/integration/report-source-generation.test.ts tests/integration/orchestrator.test.ts tests/integration/sync-pedidos.test.ts tests/integration/pipeline-olist.test.ts tests/unit/compare-reports.test.ts
```

- [ ] **Step 3: Implement transactional claim and provider threading**

In `claimQueuedReport`, lock the queued report row, select the organization connection `status='ok'`, validate its provider through `getErpDataProvider`, update report to `running`, `etapa='coletando_vendas'`, `source_provider=provider`, `source_generation=data_generation`, and return the frozen source. These report fields never change after claim. Orchestrator then calls:

```ts
const source = { orgId, provider, sourceGeneration };
await collectOrders(source, periodo);
await enrichOrders(source, { ...ENRIQUECIMENTO_PIPELINE, periodo });
const metricas = await computeMetrics(source, reportId, periodo, benchmarkParcial);
```

Pass the frozen source to post-finalize kits/calendar and any order-backed analysis context. Olist incremental sync uses `dataAtualizacao = last_success_at - 5 minutes`, not a creation window; Bling retains its existing window. Olist detail budget is at most 100/240s; Bling retains 200/70s.

- [ ] **Step 4: Verify GREEN and Bling regression**

```powershell
npm test -- tests/integration/report-repository.test.ts tests/integration/report-source-generation.test.ts tests/integration/orchestrator.test.ts tests/integration/sync-pedidos.test.ts tests/integration/pipeline-olist.test.ts tests/integration/collect-bling.test.ts tests/unit/compare-reports.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/reports src/modules/pipeline tests/integration/report-repository.test.ts tests/integration/orchestrator.test.ts tests/integration/sync-pedidos.test.ts tests/integration/pipeline-olist.test.ts
git commit -m "feat(pipeline): gerar relatório pelo ERP ativo"
```

---

### Task 10: Implementar backfill, reconciliação e gate de readiness

**Files:**
- Create: `src/modules/pipeline/order-reconciliation.ts`
- Create: `src/modules/pipeline/prepare-olist.ts`
- Modify: `src/modules/connections/sync-state.repository.ts`
- Modify: `src/modules/connections/provider-connection.repository.ts`
- Create: `src/app/api/cron/preparar-olist/route.ts`
- Modify: `src/modules/admin/operacoes-view.ts`
- Modify: `.github/workflows/crons.yml`
- Create: `src/db/migrations/0023_olist_shadow_enable.sql`
- Create: `src/db/migrations/meta/0023_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`
- Create: `tests/integration/olist-order-reconciliation.test.ts`
- Create: `tests/integration/prepare-olist.test.ts`
- Create: `tests/unit/preparar-olist-route.test.ts`
- Modify: `tests/unit/operacoes-view.test.ts`

**Interfaces:**
- Produces: `prepareOlistOrders(source: ErpDataSource, now?: Date): Promise<PreparationResult>`.
- Produces: `reconcileOlistOrders(input): Promise<OrderReadiness>`.
- `OrderReadiness = { ready: boolean; expected: number; persisted: number; pendingDetails: number; quarantinedDetails: number; dailyTotalMatches: boolean; channelSamplesMatch: boolean; reasons: string[] }`.
- Produces: `listOlistConnectionsPendingPreparation(limit: number): Promise<ErpDataSource[]>` and protected cron heartbeat `preparar-olist`.

- [ ] **Step 1: Write failing readiness tests**

```ts
expect(await reconcileOlistOrders({ orgId, periodo, expectedTotal: 2, samples })).toEqual({
  ready: true, expected: 2, persisted: 2, pendingDetails: 0, quarantinedDetails: 0,
  dailyTotalMatches: true, channelSamplesMatch: true, reasons: [],
});
```

Assert readiness is false for count mismatch, duplicate IDs within the same generation, pending/quarantined detail, daily total mismatch, channel mismatch, generation mismatch, unfinished creation pass or unfinished update catch-up. Assert preparation captures `catchUpFrom=clock_timestamp()` before the first snapshot page, completes `[now-90d,now]`, then performs a second full pagination with only `dataAtualizacao=catchUpFrom`; an order created 120 days ago and cancelled during snapshot is updated before readiness. Repeat is idempotent and a crash resumes the current pass/offset.

Route tests assert `CRON_SECRET`, `OLIST_DATA_SYNC_ENABLED`, batch cap 10, configured+authorized+fingerprinted candidates ordered oldest state first, failure isolation and automatic activation attempt only after readiness. Workflow test/config requires `*/10 * * * *` for `/api/cron/preparar-olist`; admin cadence marks it stale after 25 minutes.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm run db:migrate:test
npm test -- tests/integration/olist-order-reconciliation.test.ts tests/integration/prepare-olist.test.ts tests/unit/preparar-olist-route.test.ts tests/unit/operacoes-view.test.ts
```

- [ ] **Step 3: Implement bounded preparation and deterministic readiness**

Migration `0023_olist_shadow_enable` drops only the obsolete `orders_org_provider_order_uq`; it retains `orders_org_bling_uq`, trigger/default and relies on the generation-aware unique created in `0022`. Deploy it only after Task 8 static/read isolation gate is green; after this migration the minimum rollback binary is the provider-aware release.

`prepareOlistOrders` owns a two-pass cursor for the current generation. It completes creation pages, switches cursor pass to `updated` without declaring readiness, completes all `dataAtualizacao` pages from the captured DB timestamp, then enriches at most 100 details and reconciles. Store counts/backlog/error by generation. The cron is the durable trigger; UI may request an early run but is not the scheduler. Comparison uses cents and explicit provider-order/channel samples, never remote customer data.

- [ ] **Step 4: Verify GREEN and crash recovery**

```powershell
npm run db:migrate:test
npm test -- tests/integration/olist-order-reconciliation.test.ts tests/integration/prepare-olist.test.ts tests/unit/preparar-olist-route.test.ts tests/unit/operacoes-view.test.ts tests/integration/sync-state-lease.test.ts tests/integration/collect-orders-provider.test.ts tests/integration/enrich-orders-provider.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/pipeline/order-reconciliation.ts src/modules/pipeline/prepare-olist.ts src/modules/connections src/app/api/cron/preparar-olist src/modules/admin/operacoes-view.ts .github/workflows/crons.yml src/db/migrations tests/integration/olist-order-reconciliation.test.ts tests/integration/prepare-olist.test.ts tests/unit/preparar-olist-route.test.ts tests/unit/operacoes-view.test.ts
git commit -m "feat(olist): preparar e reconciliar backfill de pedidos"
```

---

### Task 11: Implementar ativação, cutover, rollback e controles de UI

**Files:**
- Modify: `src/modules/connections/provider-connection.repository.ts`
- Create: `src/modules/connections/erp-activation.repository.ts`
- Create: `src/actions/erp-activation.actions.ts`
- Modify: `src/actions/olist-connections.actions.ts`
- Modify: `src/components/connections/olist-connection-card.tsx`
- Modify: `src/app/(client)/conexoes/page.tsx`
- Modify: `src/app/analista/[orgId]/page.tsx`
- Modify: `src/lib/env.ts`
- Create: `tests/integration/erp-activation.test.ts`
- Create: `tests/unit/erp-activation-actions.test.ts`
- Modify: `tests/unit/olist-connection-card.test.ts`
- Create: `tests/e2e/olist-activation.spec.ts`

**Interfaces:**
- Produces: `activateErp(input: { orgId; target; actorUserId; mode: 'automatic' | 'explicit' }): Promise<ActivationResult>`.
- Produces: `rollbackErp(input: { orgId; target; actorUserId }): Promise<ActivationResult>`.
- Produces actions `activateOlistAction` and `rollbackToBlingAction` restricted to analyst/admin for explicit switch.
- Adds: `OLIST_DATA_SYNC_ENABLED: boolean` default `false` outside explicitly configured environments.

- [ ] **Step 1: Write failing transactional activation and E2E tests**

PostgreSQL assertions:

```ts
await expect(activateErp({ orgId, target: 'olist', actorUserId, mode: 'explicit' }))
  .resolves.toMatchObject({ previous: 'bling', active: 'olist' });
expect(await activeProviders(orgId)).toEqual(['olist']);
expect(await auditDetails(orgId)).toMatchObject({ previous: 'bling', target: 'olist', mode: 'explicit' });
```

Assert readiness false leaves Bling `ok`; automatic activation succeeds only when no ERP is active and CAS rechecks that condition at commit; automatic activation never replaces Bling; an injected failure between demotion/promotion rolls back both changes; rollback to Bling preserves Olist tokens/data; client cannot explicit-cutover; analyst must have org access; kill switch blocks preparation/activation but not Bling.

E2E seeds shadow Olist rows and active Bling, verifies dashboard metrics remain Bling, analyst sees readiness and “Ativar Olist”, confirms cutover, dashboard switches to Olist, then “Voltar para Bling” restores prior metrics. Assert page HTML/log responses contain no secret.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/integration/erp-activation.test.ts tests/unit/erp-activation-actions.test.ts tests/unit/olist-connection-card.test.ts
npm run test:e2e -- tests/e2e/olist-activation.spec.ts
```

- [ ] **Step 3: Implement activation with one transaction and audit**

Inside a serializable transaction: lock both org connections, reload readiness, validate target authorized, enforce mode rule, demote current `ok` to `configurado`, promote target to `ok`, and insert audit details `{ previous, target, mode, expected, persisted, pendingDetails, quarantinedDetails }`. Catch unique conflict as `erp_ativo_alterado`; never leave zero active after a failed explicit cutover.

After OAuth callback or preparation, call automatic activation only when no `ok` exists and readiness is true. Update `getProviderConnectionSummary` so `operational` means `status==='ok'` for either provider and `authorized` accepts `configurado` or `ok` with tokens. UI displays “Preparando 90 dias”, counts/readiness, active ERP, last successful sync and explicit cutover/rollback only to authorized staff.

- [ ] **Step 4: Verify GREEN**

```powershell
npm test -- tests/integration/erp-activation.test.ts tests/unit/erp-activation-actions.test.ts tests/unit/olist-connection-card.test.ts tests/unit/olist-connections-actions.test.ts
npm run test:e2e -- tests/e2e/olist-activation.spec.ts tests/e2e/olist-connections.spec.ts tests/e2e/conexoes.spec.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/connections src/actions/erp-activation.actions.ts src/actions/olist-connections.actions.ts src/components/connections/olist-connection-card.tsx src/app/\(client\)/conexoes/page.tsx src/app/analista src/lib/env.ts tests/integration/erp-activation.test.ts tests/unit/erp-activation-actions.test.ts tests/unit/olist-connection-card.test.ts tests/e2e/olist-activation.spec.ts
git commit -m "feat(olist): ativar e reverter ERP com segurança"
```

---

### Task 12: Neutralizar crons, scheduler, dashboard e onboarding

**Files:**
- Modify: `src/app/api/cron/sincronizar-pedidos/route.ts`
- Modify: `src/modules/scheduler/scheduler.repository.ts`
- Modify: `src/modules/scheduler/scheduler.service.ts`
- Modify: `src/modules/reports/dashboard-data.ts`
- Modify: `src/modules/reports/onboarding-model.ts`
- Modify: `src/app/(client)/dashboard/page.tsx`
- Modify: `src/app/(client)/dashboard/onboarding-checklist.tsx`
- Modify: `src/app/(client)/dashboard/generate-report.tsx`
- Modify: `src/actions/reports.actions.ts`
- Modify: `src/modules/reports/report-errors.ts`
- Modify: `.github/workflows/crons.yml`
- Modify: `tests/unit/sincronizar-pedidos-route.test.ts`
- Modify: `tests/integration/scheduler-backoff.test.ts`
- Modify: `tests/unit/scheduler-service.test.ts`
- Modify: `tests/integration/dashboard-data.test.ts`
- Modify: `tests/unit/onboarding-model.test.ts`
- Modify: `tests/unit/report-errors.test.ts`

**Interfaces:**
- Replaces: `listOrgsComBlingOk()` in data-sync consumers with `listActiveErpConnections({ limit })`.
- Changes: `OrgElegibilidade.blingConectado` to `erpConectado`.
- Changes: onboarding input to `{ erpOk, erpLabel, temProdutos, temRelatorio }`, first step id `'erp'`.

- [ ] **Step 1: Write failing neutral-behavior tests**

Assert orders cron receives frozen refs including generation, isolates failure per org, honors `LOTE_MAXIMO_SYNC`, skips Olist when kill switch is false and emits counters grouped by provider without secrets. Workflow calls `/api/cron/sincronizar-pedidos` every 15 minutes so p95 freshness can remain below 30 minutes. Scheduler SQL joins any registered `connections.status='ok'`, not provider literal Bling. Dashboard resolves one source, passes it to readers and displays active ERP/last sync. Generation action rejects no ERP with `sem_conexao_erp`; onboarding says “Conectar seu ERP” and shows the active label.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/integration/scheduler-backoff.test.ts tests/unit/scheduler-service.test.ts tests/integration/dashboard-data.test.ts tests/unit/onboarding-model.test.ts tests/unit/report-errors.test.ts
```

- [ ] **Step 3: Implement provider-neutral scheduling and copy**

Use `ActiveErpRef` through cron loops and `sincronizarPedidosDaOrg(ref, agora)`. Add workflow schedule `*/15 * * * *` for pedidos while preserving per-org failure isolation. Keep token renewal providers in their existing dedicated paths. Scheduler requires `status='ok'`, active organization and non-null access token, then validates registry before enqueue. Dashboard passes the same frozen source to all order readers. Replace client-safe Bling-only codes with `sem_conexao_erp` and `erp_indisponivel`, preserving provider-specific staff logs.

- [ ] **Step 4: Verify GREEN and existing scheduled behavior**

```powershell
npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/integration/scheduler-backoff.test.ts tests/unit/scheduler-service.test.ts tests/integration/dashboard-data.test.ts tests/unit/onboarding-model.test.ts tests/unit/report-errors.test.ts tests/integration/cron-gerar-relatorios.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit increment A**

```powershell
git add src/app/api/cron/sincronizar-pedidos src/modules/scheduler src/modules/reports src/app/\(client\)/dashboard src/actions/reports.actions.ts tests/unit tests/integration
git commit -m "feat(erp): operar pedidos e relatórios pelo provider ativo"
```

- [ ] **Step 6: Run the Increment A value gate before starting stock**

```powershell
npm run db:migrate:test
npm run lint
npm run typecheck
npm test -- tests/unit/olist-http.test.ts tests/unit/olist-orders.test.ts tests/unit/olist-order-detail.test.ts tests/integration/active-provider-read-isolation.test.ts tests/integration/pipeline-olist.test.ts tests/integration/erp-activation.test.ts
npm run test:e2e -- tests/e2e/olist-activation.spec.ts tests/e2e/dashboard.spec.ts tests/e2e/olist-connections.spec.ts
npm run build
git diff --check
```

Expected: uma organização sem Bling conclui backfill/readiness, torna Olist `ok` e gera relatório `done`; uma organização Bling não muda sem cutover explícito; rollback restaura Bling.

---

## Incremento B — estoque Olist retomável

### Task 13: Migrar identidade de estoque e criar capability provider-aware

**Files:**
- Modify: `src/db/schema/product-stock.ts`
- Create: `src/db/migrations/0024_olist_stock_expand.sql`
- Create: `src/db/migrations/0025_olist_stock_shadow_enable.sql`
- Create: `src/db/migrations/meta/0024_snapshot.json`
- Create: `src/db/migrations/meta/0025_snapshot.json`
- Modify: `src/db/migrations/meta/_journal.json`
- Create: `src/modules/providers/stock.types.ts`
- Create: `src/modules/providers/stock-registry.ts`
- Modify: `src/modules/providers/bling/stock.ts`
- Modify: `src/modules/providers/bling/provider.ts`
- Modify: `src/modules/estoque/stock.repository.ts`
- Create: `tests/integration/olist-stock-schema.test.ts`
- Create: `tests/unit/stock-provider-registry.test.ts`
- Modify: `tests/integration/stock-repository.test.ts`
- Modify: `tests/unit/bling-stock.test.ts`

**Interfaces:**
- Produces: `RawStockItem = { providerProductId?: string; sku?: string; nome: string; saldo: number }`.
- Produces: `StockDataProvider` with `fetchStockPage(orgId, cursor: StockCursor, onItem: StockItemHandler): Promise<StockPageResult>`.
- Produces: `getStockDataProvider(provider)` with registry `['bling']`; Task 14 registers `olist` after its adapter is green.
- Produces: `product_stock.source_generation` and unique `(org_id,provider,source_generation,sku)`.
- Changes: `upsertStock(source: ErpDataSource, itens)` and all stock reads to require the frozen source.

- [ ] **Step 1: Write failing PostgreSQL identity and Bling compatibility tests**

```ts
await upsertStock({ orgId, provider: 'bling', sourceGeneration: 1 }, [{ providerProductId: 'b-1', sku: 'SKU', nome: 'Bling', saldo: 3 }]);
await upsertStock({ orgId, provider: 'olist', sourceGeneration: 3 }, [{ providerProductId: 'o-1', sku: 'SKU', nome: 'Olist', saldo: 7 }]);
await upsertStock({ orgId, provider: 'olist', sourceGeneration: 2 }, [{ providerProductId: 'old', sku: 'SKU', nome: 'Old', saldo: 99 }]);
expect(await getStockRows({ orgId, provider: 'olist', sourceGeneration: 3 })).toEqual([{ sku: 'SKU', nome: 'Olist', saldo: 7 }]);
```

Assert unique `(org,provider,source_generation,sku)`, same SKU across providers/generations, generation-1 backfill, provider product ID persistence and unchanged Bling mapping.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm run db:migrate:test
npm test -- tests/integration/olist-stock-schema.test.ts tests/integration/stock-repository.test.ts tests/unit/stock-provider-registry.test.ts tests/unit/bling-stock.test.ts
```

- [ ] **Step 3: Implement compatibility writer then migration**

Release 1 applies `0024`: add/backfill `source_generation=1`, create `product_stock_org_provider_generation_sku_uq`, keep both old uniques. Release 2 deploys the Bling writer with values `{ org_id, provider:'bling', source_generation:1, provider_product_id, sku, nome, saldo }` and conflict target `(org_id,provider,source_generation,sku)`. Only after that code is live, release 3 applies `0025`, dropping `product_stock_org_sku_uq` and `product_stock_org_provider_sku_uq` so Olist/generations can coexist. Neither migration deletes a row; rollback floor remains the provider-aware binary.

- [ ] **Step 4: Verify GREEN on PostgreSQL**

```powershell
npm run db:migrate:test
npm test -- tests/integration/olist-stock-schema.test.ts tests/integration/stock-repository.test.ts tests/unit/stock-provider-registry.test.ts tests/unit/bling-stock.test.ts tests/integration/schema-h1.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/db/schema/product-stock.ts src/db/migrations src/modules/providers/stock.types.ts src/modules/providers/stock-registry.ts src/modules/providers/bling src/modules/estoque/stock.repository.ts tests/integration/olist-stock-schema.test.ts tests/integration/stock-repository.test.ts tests/unit/stock-provider-registry.test.ts tests/unit/bling-stock.test.ts
git commit -m "refactor(estoque): concluir identidade por provider"
```

---

### Task 14: Implementar catálogo e saldo Olist com cursor retomável

**Files:**
- Create: `src/modules/providers/olist/products.ts`
- Create: `src/modules/providers/olist/stock.ts`
- Create: `src/modules/estoque/stock-reconciliation.ts`
- Modify: `src/modules/providers/stock-registry.ts`
- Modify: `src/modules/estoque/sync-estoque.ts`
- Create: `tests/fixtures/olist/products-page.json`
- Create: `tests/fixtures/olist/product-stock.json`
- Create: `tests/unit/olist-products.test.ts`
- Create: `tests/unit/olist-stock.test.ts`
- Create: `tests/integration/sync-stock-provider.test.ts`
- Create: `tests/integration/stock-resume-lease.test.ts`

**Interfaces:**
- Produces: `OlistStockCursor = { offset: number; index: number; sourceGeneration: number }`.
- Produces: `fetchOlistProductsPage(orgId, offset): Promise<OlistProductPage>` and `fetchOlistProductStock(orgId, productId): Promise<number>`.
- Changes: `sincronizarEstoqueDaOrg(source: ErpDataSource, options?: { deadlineMs?: number }): Promise<StockSyncResult>`.
- Produces: `persistStockItemAndAdvance(input: { lease: SyncLease; source: ErpDataSource; item: RawStockItem; nextCursor: OlistStockCursor }): Promise<boolean>`.
- Produces: `StockSyncResult = { produtos: number; ignoradosSemSku: number; restantes: number; incompleto: boolean }`.

- [ ] **Step 1: Add official fixtures and failing cursor tests**

Assert `/produtos?limit=100&offset=N` maps ID/SKU/name/pagination; `/estoque/{id}` uses `disponivel`, not `saldo` or `reservado`; invalid finite numbers fail safely. For cursor:

```ts
expect(parseStockCursor({ offset: 100, index: 7, sourceGeneration: 3 }))
  .toEqual({ offset: 100, index: 7, sourceGeneration: 3 });
await sincronizarEstoqueDaOrg({ orgId, provider: 'olist', sourceGeneration: 3 }, { deadlineMs: 240_000 });
expect(await readStockCursor(orgId)).toEqual({ offset: 100, index: 8, sourceGeneration: 3 });
```

Inject failure after item 7 and assert item 7/cursor commit atomically. Steal/expire the lease after HTTP returns and assert stale worker changes neither stock row nor cursor; increment connection generation and assert old worker is fenced out. Rerun resumes without duplicate effects, product without SKU increments ignored counter, and no absent product is deleted. A page reporting total above 50.000 stops before detail fan-out with `olist_catalogo_acima_do_limite`.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/olist-products.test.ts tests/unit/olist-stock.test.ts tests/integration/sync-stock-provider.test.ts tests/integration/stock-resume-lease.test.ts
```

- [ ] **Step 3: Implement page/index state machine**

Acquire resource `stock` for the exact source generation. Load one product page at `cursor.offset`; for each product from `cursor.index`, call stock detail through the shared governor. `persistStockItemAndAdvance` runs one transaction whose ownership predicate uses `lease_token`, `lease_expires_at > clock_timestamp()` and current connection generation; only its successful CTE/upsert advances cursor. At page completion set the next offset/index with generation. On total completion reset offset/index for the same generation, set `succeeded_at` and only then update connection `last_sync_at`. Stop before deadline with cursor preserved. Stock yields to overdue orders, while weighted fairness guarantees one stock slot after five high-priority slots when order freshness is within SLO.

- [ ] **Step 4: Verify GREEN and shared 27/min budget**

```powershell
npm test -- tests/unit/olist-products.test.ts tests/unit/olist-stock.test.ts tests/integration/olist-rate-governor.test.ts tests/integration/sync-stock-provider.test.ts tests/integration/stock-resume-lease.test.ts tests/integration/sync-state-lease.test.ts
npm run typecheck
```

Assert a mixed sequence `pedidos → detail → produtos → estoque` for one org has start times separated by at least 2.200 ms; no module owns a second Olist limiter.

- [ ] **Step 5: Commit**

```powershell
git add src/modules/providers/olist src/modules/providers/stock-registry.ts src/modules/estoque src/modules/connections/sync-state.repository.ts tests/fixtures/olist tests/unit/olist-products.test.ts tests/unit/olist-stock.test.ts tests/integration/sync-stock-provider.test.ts tests/integration/stock-resume-lease.test.ts
git commit -m "feat(olist): sincronizar estoque com cursor retomável"
```

---

### Task 15: Ligar estoque ativo a queries, cron, dashboard e alertas

**Files:**
- Modify: `src/app/api/cron/sincronizar-estoque/route.ts`
- Modify: `src/modules/estoque/stock.repository.ts`
- Modify: `src/modules/estoque/estoque-view-model.ts`
- Modify: `src/modules/alerts/alert-data.repository.ts`
- Modify: `src/modules/analista/carteira-data.repository.ts`
- Modify: `src/modules/reports/dashboard-data.ts`
- Modify: `src/app/(client)/dashboard/estoque/page.tsx`
- Modify: `src/app/(client)/dashboard/estoque-resumo.tsx`
- Modify: `tests/integration/cron-sincronizar-estoque.test.ts`
- Modify: `tests/integration/stock-repository.test.ts`
- Modify: `tests/integration/alert-repository.test.ts`
- Modify: `tests/integration/carteira-data.test.ts`
- Modify: `tests/unit/estoque-view-model.test.ts`
- Create: `tests/e2e/olist-stock.spec.ts`

**Interfaces:**
- Changes: `getStockRows(source)` and `getStockRowsBatch(refs)` are the only snapshot readers; both predicate provider and source generation.
- Uses: active provider for both stock snapshot and 30-day sales velocity.
- Cron emits `{ orgs, sincronizadas, incompletas, falhas, produtos, ignoradosSemSku }` plus provider counters in heartbeat metadata.

- [ ] **Step 1: Write failing active-stock isolation and E2E tests**

Seed different Bling/current-Olist/old-generation-Olist balances for the same SKU and assert coverage, stock alerts, analyst carteira and dashboard use only the active provider+generation for numerator and velocity. Flip active source and assert all four switch together. Cron test includes Bling and Olist refs with generation, isolates one failing org and records incomplete Olist progress without reporting success. E2E activates Olist, runs at least two stock batches, displays progress/freshness while incomplete and final available balance/coverage when complete.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/integration/cron-sincronizar-estoque.test.ts tests/integration/stock-repository.test.ts tests/integration/alert-repository.test.ts tests/integration/carteira-data.test.ts tests/unit/estoque-view-model.test.ts
npm run test:e2e -- tests/e2e/olist-stock.spec.ts
```

- [ ] **Step 3: Thread active provider through every stock consumer**

Cron iterates bounded `ActiveErpRef[]`, calls `sincronizarEstoqueDaOrg(ref)`, and records one organization failure without aborting others. Batch repository functions accept refs rather than bare org IDs and build bounded provider+generation predicates. UI reads `connection_sync_state(resource='stock')` for the active generation to show last success, processed/backlog and “Sincronização em andamento”; it never promises a complete snapshot while `incompleto=true`.

- [ ] **Step 4: Prove no unscoped stock query remains**

```powershell
npm test -- tests/integration/cron-sincronizar-estoque.test.ts tests/integration/stock-repository.test.ts tests/integration/alert-repository.test.ts tests/integration/carteira-data.test.ts tests/unit/estoque-view-model.test.ts
npm run test:e2e -- tests/e2e/olist-stock.spec.ts tests/e2e/dashboard.spec.ts
rg -n "from\(productStock\)|FROM product_stock|JOIN product_stock" src
npm run typecheck
```

Expected: every production match includes a provider predicate derived from the frozen/active source.

- [ ] **Step 5: Commit increment B**

```powershell
git add src/app/api/cron/sincronizar-estoque src/modules/estoque src/modules/alerts/alert-data.repository.ts src/modules/analista/carteira-data.repository.ts src/modules/reports/dashboard-data.ts src/app/\(client\)/dashboard/estoque src/app/\(client\)/dashboard/estoque-resumo.tsx tests/integration tests/unit/estoque-view-model.test.ts tests/e2e/olist-stock.spec.ts
git commit -m "feat(estoque): operar cobertura pelo ERP ativo"
```

---

### Task 16: Documentar operação, validar segurança e executar gate de produção

**Files:**
- Modify: `README.md`
- Create: `docs/runbooks/olist-data-sync.md`
- Modify: `.github/workflows/crons.yml`
- Modify: `docs/superpowers/plans/2026-07-29-olist-data-sync.md`

**Interfaces:**
- Documents: permissões read-only, backfill/readiness, cutover/rollback, kill switch, rate limit, cursor/lease, reconciliação e recuperação de 401/429.
- Requires: migration `0022` before Olist orders writer and `0023` before Olist stock writer.

- [ ] **Step 1: Write exact operator runbook**

Document this rollout sequence:

1. Deploy compatibility code with Olist sync disabled.
2. Apply `0022`, run PostgreSQL schema/isolation tests and verify Bling report smoke.
3. Enable Olist sync for one authorized no-active-ERP organization, complete 90-day readiness and generate one report.
4. Prepare one Bling organization in shadow, compare totals/channels, explicit-cutover, generate report, rollback, and verify old Bling metrics.
5. Apply `0023`, enable stock pilot, run repeated cron until cursor completes and compare available balance.
6. Expand rollout; on incident set `OLIST_DATA_SYNC_ENABLED=false`, keep Bling active and preserve Olist rows/tokens.

Include SQL read-only checks for active connection uniqueness, sync-state backlog/error, report source provider, order duplicates and stock duplicates. Include commands for protected cron smoke with `CRON_SECRET` supplied through environment, never pasted into shell history or documentation.

- [ ] **Step 2: Run scope, placeholder and secret scans**

```powershell
rg -n "TBD|TODO|implement later|fill in details|Add appropriate|handle edge cases|Write tests for the above|Similar to Task" docs/superpowers/plans/2026-07-29-olist-data-sync.md
rg -n "from\(orders\)|FROM orders|JOIN orders|from\(productStock\)|FROM product_stock|JOIN product_stock" src
rg -n "client_secret|access_token|refresh_token|Authorization" src tests README.md docs/runbooks/olist-data-sync.md
git diff --check
```

Expected: placeholder scan has no match; every data query is provider-scoped; secret names occur only in protocol/persistence/test assertions, with no credential value or remote body in UI/log/audit/docs.

- [ ] **Step 3: Run the full PostgreSQL, unit, build and E2E gate**

```powershell
npm run db:migrate:test
npm run lint
npm run typecheck
npm run test:ci
npm run build
npm run test:e2e
git diff --check
```

Expected: both migrations apply to a fresh PostgreSQL database; no integration suite is skipped in CI; lint/typecheck/build pass; all unit/integration tests and 25+ Playwright scenarios pass.

- [ ] **Step 4: Execute production smoke and rollback rehearsal**

With deployment credentials configured outside the repository: authorize a test Olist account with Pedidos/Produtos/Estoque/Informações da Conta read permissions; confirm callback, preparation, report, repeated stock resume and protected crons have no 5xx; inspect structured logs for provider/org/resource/counts only; rehearse explicit switch back to Bling and confirm the preceding report remains `source_provider='olist'`.

- [ ] **Step 5: Commit documentation and execution record**

```powershell
git add README.md docs/runbooks/olist-data-sync.md .github/workflows/crons.yml docs/superpowers/plans/2026-07-29-olist-data-sync.md
git commit -m "docs(olist): documentar sincronização e operação v3"
```

## Execution Handoff

Execute with `superpowers:subagent-driven-development`, one task and one review gate at a time, in an isolated worktree created through `superpowers:using-git-worktrees`. Tasks 1–12 form the independently deployable Incremento A and must pass its value gate before Tasks 13–15 begin. Do not merge, migrate production or enable `OLIST_DATA_SYNC_ENABLED` until PostgreSQL integration tests, the complete Playwright suite and the rollout checks in Task 16 are green.
