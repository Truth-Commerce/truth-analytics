# Olist ERP Operational Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer pedidos, estoque, dashboard, crons e relatórios usarem automaticamente o único ERP operacional da organização, incluindo Olist ERP.

**Architecture:** O pipeline resolve e congela a fonte ERP ativa no início de cada execução. Bling e Olist implementam contratos operacionais comuns e persistem dados normalizados com origem explícita; leitores e relatórios filtram pela fonte congelada.

**Tech Stack:** Next.js 16, TypeScript, PostgreSQL 17, Drizzle ORM, Vitest, Playwright, OAuth 2.0, Olist ERP API v3.

## Global Constraints

- Cada organização pode ter no máximo um ERP operacional.
- Sem ERP operacional, geração e sincronização ficam bloqueadas com `Conecte seu ERP`.
- Organizações Bling existentes devem continuar funcionando sem ação manual.
- Tokens e credenciais nunca podem aparecer em logs.
- Olist deve respeitar paginação, deadline, `429` e falhas transitórias.
- Relatórios e leituras devem permanecer isolados por organização e provedor.

---

### Task 1: Integrar a fonte ERP ativa ao relatório e ao dashboard

**Files:**
- Modify: `src/modules/connections/active-provider.repository.ts`
- Modify: `src/modules/reports/dashboard-data.ts`
- Modify: `src/actions/reports.actions.ts`
- Modify: `src/modules/scheduler/scheduler.repository.ts`
- Modify: `src/modules/scheduler/scheduler.service.ts`
- Modify: `src/app/(client)/dashboard/page.tsx`
- Modify: `src/app/(client)/dashboard/onboarding-checklist.tsx`
- Modify: `src/app/(client)/dashboard/generate-report.tsx`
- Modify: `src/modules/reports/onboarding-model.ts`
- Modify: `src/modules/reports/report-errors.ts`
- Test: `tests/integration/dashboard-data.test.ts`
- Test: `tests/integration/cron-gerar-relatorios.test.ts`
- Test: `tests/unit/onboarding-model.test.ts`

**Interfaces:**
- Consumes: `getActiveProvider(orgId): Promise<ActiveProvider | null>`.
- Produces: dashboard `source: { provider: 'bling' | 'olist'; lastSyncAt: Date | null } | null` e gating de relatório baseado na fonte ativa.

- [ ] **Step 1: Restaurar os testes RED já preparados para fonte ativa**

Aplicar os commits `ced8330..9e5b67c`, que contêm testes esperando `erpOk`, fonte Olist e mensagens neutras.

- [ ] **Step 2: Executar os testes focados e confirmar a falha antes da implementação**

Run: `npm test -- tests/unit/onboarding-model.test.ts tests/integration/dashboard-data.test.ts tests/integration/cron-gerar-relatorios.test.ts`

Expected: FAIL porque o `master` ainda usa conexão Bling fixa.

- [ ] **Step 3: Implementar a resolução da fonte ativa**

O dashboard deve usar:

```ts
const erpOk = source !== null;
const erpLabel = source?.provider === 'olist' ? 'Olist ERP' : source?.provider === 'bling' ? 'Bling' : 'ERP';
```

O scheduler deve selecionar organizações com qualquer fonte operacional, respeitando o rollout Olist já existente.

- [ ] **Step 4: Executar os testes focados**

Run: `npm test -- tests/unit/onboarding-model.test.ts tests/integration/dashboard-data.test.ts tests/integration/cron-gerar-relatorios.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git commit -am "feat(erp): operar relatórios pelo provedor ativo"`

---

### Task 2: Completar o contrato operacional de estoque

**Files:**
- Create: `src/modules/providers/stock.types.ts`
- Modify: `src/modules/providers/data.types.ts`
- Modify: `src/modules/providers/bling/provider.ts`
- Modify: `src/modules/providers/olist/provider.ts`
- Modify: `src/modules/providers/registry.ts`
- Test: `tests/unit/provider-registry.test.ts`
- Test: `tests/unit/olist-stock.test.ts`

**Interfaces:**
- Produces: `fetchStockPage(input: StockPageInput): Promise<StockPage>` no adaptador operacional.
- Produces: `StockItem` com `externalProductId`, `sku`, `name`, `balance`, `updatedAt`.

- [ ] **Step 1: Escrever o teste RED do contrato Olist**

```ts
expect(getDataProvider('olist').fetchStockPage).toBeTypeOf('function');
```

- [ ] **Step 2: Executar e confirmar a ausência do método**

Run: `npm test -- tests/unit/provider-registry.test.ts tests/unit/olist-stock.test.ts`

Expected: FAIL em `fetchStockPage` ausente.

- [ ] **Step 3: Adicionar os tipos e o método ao contrato**

```ts
export type StockPageInput = { orgId: string; cursor?: string; deadlineAt?: number };
export type StockPage = { items: StockItem[]; nextCursor: string | null };
```

- [ ] **Step 4: Adaptar Bling sem alterar o comportamento existente**

Encapsular o retorno atual de `fetchStock` em uma única página terminal.

- [ ] **Step 5: Executar os testes**

Run: `npm test -- tests/unit/provider-registry.test.ts tests/unit/olist-stock.test.ts tests/unit/bling-stock.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add src/modules/providers tests/unit && git commit -m "refactor(erp): unificar contrato operacional de estoque"`

---

### Task 3: Implementar leitura e normalização de estoque Olist

**Files:**
- Create: `src/modules/providers/olist/stock.ts`
- Create: `tests/fixtures/olist/stock-page.json`
- Test: `tests/unit/olist-stock.test.ts`

**Interfaces:**
- Consumes: `fetchOlist`, governador distribuído e token do contexto da organização.
- Produces: `fetchOlistStockPage(input: StockPageInput): Promise<StockPage>`.

- [ ] **Step 1: Escrever testes RED para paginação, campos ausentes e 429**

```ts
expect(page.items[0]).toEqual({
  externalProductId: '123',
  sku: 'SKU-1',
  name: 'Produto',
  balance: 8,
  updatedAt: expect.any(Date),
});
expect(page.nextCursor).toBe('2');
```

- [ ] **Step 2: Confirmar as falhas**

Run: `npm test -- tests/unit/olist-stock.test.ts`

Expected: FAIL porque `olist/stock.ts` não existe.

- [ ] **Step 3: Implementar a chamada oficial paginada**

Usar o cliente HTTP Olist existente, propagar `deadlineAt`, limitar o corpo da resposta e normalizar números com fallback seguro para zero.

- [ ] **Step 4: Registrar `fetchOlistStockPage` no provider Olist**

```ts
export const olistDataProvider = {
  name: 'olist',
  fetchOrders: fetchOlistOrders,
  fetchOrderDetail: fetchOlistOrderDetail,
  fetchStockPage: fetchOlistStockPage,
};
```

- [ ] **Step 5: Executar os testes**

Run: `npm test -- tests/unit/olist-stock.test.ts tests/unit/olist-http.test.ts tests/unit/provider-registry.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add src/modules/providers/olist tests && git commit -m "feat(olist): importar estoque paginado"`

---

### Task 4: Persistir estoque por provedor com lease e fencing

**Files:**
- Create: `src/db/migrations/0025_olist_stock_expand.sql`
- Modify: `src/db/migrations/meta/_journal.json`
- Modify: `src/db/schema/product-stock.ts`
- Create: `src/modules/estoque/sync-stock-provider.ts`
- Modify: `src/modules/estoque/sync-estoque.ts`
- Test: `tests/integration/olist-stock-schema.test.ts`
- Test: `tests/integration/sync-stock-provider.test.ts`

**Interfaces:**
- Consumes: `getActiveProvider`, `fetchStockPage` e o repositório de leases.
- Produces: `syncStockFromActiveProvider(orgId, options): Promise<StockSyncResult>`.

- [ ] **Step 1: Aplicar o teste RED e expansão de schema preparados**

Aplicar `e6afc5e..092f4a6`, adicionando origem, geração, lease e fencing ao estoque.

- [ ] **Step 2: Rodar migration/schema tests**

Run: `npm test -- tests/integration/olist-stock-schema.test.ts`

Expected: PASS para a expansão e FAIL para sincronização ainda ausente.

- [ ] **Step 3: Escrever o teste RED da sincronização**

O teste deve provar que uma organização Olist chama somente o provider Olist, retoma cursor e não publica uma geração sem lease válida.

- [ ] **Step 4: Implementar sincronização cercada**

Persistir itens em geração nova, atualizar cursor após cada página e publicar atomicamente apenas quando a última página concluir sob a mesma geração de lease.

- [ ] **Step 5: Executar testes de integração**

Run: `npm test -- tests/integration/olist-stock-schema.test.ts tests/integration/sync-stock-provider.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

Run: `git add src/db src/modules/estoque tests/integration && git commit -m "feat(estoque): sincronizar pelo ERP ativo"`

---

### Task 5: Tornar crons e interface integralmente provider-aware

**Files:**
- Modify: `src/app/api/cron/sincronizar-pedidos/route.ts`
- Modify: `src/app/api/cron/sincronizar-estoque/route.ts`
- Modify: `.github/workflows/crons.yml`
- Modify: `src/components/connections/olist-connection-card.tsx`
- Modify: `src/app/(client)/dashboard/generate-report.tsx`
- Modify: `src/modules/reports/stepper-model.ts`
- Test: `tests/unit/sincronizar-pedidos-route.test.ts`
- Test: `tests/unit/sincronizar-estoque-route.test.ts`
- Test: `tests/unit/olist-connection-card.test.ts`
- Test: `tests/e2e/dashboard.spec.ts`

**Interfaces:**
- Consumes: fonte ERP ativa e sincronizadores provider-aware.
- Produces: endpoints de cron neutros e UI sem dependência textual do Bling.

- [ ] **Step 1: Escrever testes RED para mensagens e rotas neutras**

Asserções obrigatórias: `Conectar seu ERP`, `Conecte seu ERP em Conexões`, `Conectando ao ERP` e ausência do aviso “relatórios continuam usando Bling”.

- [ ] **Step 2: Confirmar as falhas**

Run: `npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/unit/sincronizar-estoque-route.test.ts tests/unit/olist-connection-card.test.ts tests/e2e/dashboard.spec.ts`

Expected: FAIL nos textos fixos e no cron Bling-only.

- [ ] **Step 3: Implementar rotas e textos provider-aware**

O cron lista organizações elegíveis por ERP ativo. O cartão Olist informa que pedidos e estoque alimentarão os relatórios após autorização e sincronização.

- [ ] **Step 4: Executar testes focados**

Run: `npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/unit/sincronizar-estoque-route.test.ts tests/unit/olist-connection-card.test.ts tests/e2e/dashboard.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add src .github tests && git commit -m "feat(erp): neutralizar fluxos e crons por provedor"`

---

### Task 6: Validar, publicar e verificar o fluxo Olist

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: build publicável, migrations aplicáveis e checklist operacional documentado.

- [ ] **Step 1: Rodar qualidade completa**

Run: `npm run lint && npm run typecheck && npm run test:ci && npm run build`

Expected: todos os comandos com exit code 0.

- [ ] **Step 2: Rodar E2E**

Run: `npx playwright install chromium && npm run test:e2e`

Expected: PASS.

- [ ] **Step 3: Atualizar documentação operacional**

Documentar: um ERP ativo por organização, callback Olist, sincronização inicial, rollback e variáveis de rollout.

- [ ] **Step 4: Commit final**

Run: `git add README.md .env.example && git commit -m "docs(olist): documentar operação completa do ERP"`

- [ ] **Step 5: Push, PR e deploy**

Run: `git push -u origin feat/olist-operational` e criar PR para `master`; após CI verde, merge e implantar no EasyPanel.

- [ ] **Step 6: Verificação de produção**

Confirmar HTTPS 200, serviço 1/1, migrations aplicadas, login, conexão Olist, sincronização de pedidos/estoque e geração de relatório sem conexão Bling.
