# F3b — Expansão de Mercado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o Truth Analytics de "Bling-only" em plataforma multi-marketplace: (1) generalizar a camada de conexões por `provider` com registry; (2) Mercado Livre como segunda fonte de VENDAS (OAuth + `fetchOrders`); (3) monitor de ranqueamento na busca do ML (`ranking_snapshots`); (4) radar de concorrentes (`competitors` + snapshots `fonte='concorrente'` + comparação no relatório IA); (5) Central de Qualidade de Catálogo (`scoreCatalogo` + `catalog_scores` + task tipo `catalogo` via F2).

**Architecture:** A interface `ConnectionProvider` (`src/modules/providers/types.ts`) já existe — este plano a estende (id/label/PKCE opcional/`externalOrderId`) e cria o registry `src/modules/providers/registry.ts` (`getProvider`/`listProviders`). O `connection.repository` deixa de fixar `PROVIDER='bling'` e vira parametrizado por provider (com defaults e aliases para zero regressão). As rotas OAuth viram dinâmicas `/api/connections/[provider]` — como o segmento literal `bling` casa com `[provider]`, as URLs antigas (incluindo o `redirect_uri` registrado no app Bling) continuam funcionando sem redirect extra. O step de coleta de pedidos vira polimórfico (`collectOrders` itera providers conectados via registry) e a tabela `orders` migra de `(org_id, bling_order_id)` para `(org_id, provider, external_order_id)` com backfill `provider='bling'`. Ranqueamento, concorrentes e catálogo entram como steps GRACIOSOS no pipeline (nunca derrubam o relatório), persistem em tabelas próprias (`ranking_snapshots`, `catalog_scores`) ou em `market_snapshots` (`fonte='concorrente'`), e ganham UI numa página nova `/mercado` com abas por URL (`?aba=ranqueamento|concorrentes|catalogo`). `computeMetrics` passa a incluir `concorrentes` e `qualidadeCatalogo` (opcionais) nas `Metricas`, e o prompt da IA passa a considerá-los.

**Tech Stack:** Next.js 14 (App Router, Server Actions), Drizzle/Neon, Auth.js v5, Zod, AES-256-GCM (módulo `crypto` existente), recharts (F1), Vitest + Playwright. Consome de F0: `src/lib/logger.ts`, `src/lib/p-limit.ts`, padrão de backoff 429, pipeline em background com `reports.etapa`. Consome de F2: `createTask` (task tipo `catalogo`).

## Global Constraints

- **Regra de ouro do roadmap:** antes de implementar cada task, RE-VALIDAR os trechos citados contra o `master` atual — F0/F1/F2/F3a mudam o terreno (orquestrador com `etapa`, logger, p-limit, `collect-market` sem `bruto`, CHECK constraints, primitivos de UI, tabela `tasks`). Divergência pequena = ajustar inline; estrutural = parar e revisar.
- **Provider ids canônicos:** `'bling' | 'mercadolivre'` (`ProviderId`). Esses literais aparecem em `connections.provider`, `orders.provider`, `ranking_snapshots.provider`, `competitors.provider`, rotas e registry — NUNCA outra grafia (`ml`, `mercado_livre` etc.).
- **Zero regressão Bling:** os testes existentes (`tests/unit/bling-oauth.test.ts`, `tests/integration/connection-repository.test.ts`, pipeline) devem continuar verdes. Estratégia: parâmetro `provider` com default `'bling'` + aliases `saveBlingConnection`/`disconnectBling` + strings de erro por template (`sem_conexao_bling` preservada).
- **Chamadas externas SEMPRE mockadas nos testes** (padrão dos testes Bling: `vi.stubGlobal('fetch', ...)` / `vi.spyOn`). OAuth ML, `/orders/search`, busca pública ML e `/produtos` Bling nunca tocam a rede em teste.
- **Multi-tenancy:** `org_id` SEMPRE da sessão (`requireActiveOrg`/`getSessionContext`); toda query das tabelas novas filtra por `org_id`. Tokens sempre cifrados via `encryptSecret`/`decryptSecret`; nunca logar tokens.
- **Steps novos são graciosos:** `collectRanking`, `collectCompetitors`, `collectCatalog` NUNCA lançam — capturam erro por item, logam via `logger` (F0) e seguem. Só `collectOrders` é falha dura (e apenas se NENHUM provider conectado coletar).
- **Sem etapas novas no stepper:** os steps novos rodam sob a etapa `analisando_mercado` existente (contrato F0/F1) — não adicionar valores novos a `reports.etapa`.
- **Migrations:** geradas com `npm run db:generate` e SEMPRE inspecionadas antes de aplicar; a migration de `orders` (rename + unique) é escrita À MÃO (Task 5) para não perder dados de produção. Aplicar em main E no branch Neon `test`.
- **Testes ≠ produção:** integração usa `describe.skipIf(!process.env.DATABASE_URL_TEST)` + prefixo `ta-test-*` + cleanup em `afterAll` (padrão existente). Blindagem de `tests/setup.ts` intocável.
- **Idioma:** UI e copy pt-BR; commits conventional pt-BR (`feat:`, `fix:`, `chore:`).
- **Branch:** `feat/f3b-expansao-mercado` a partir de `master`. Nunca push/merge sem revisão.

---

## Pré-requisitos

- [ ] F0 e F3a mergeados em `master` (logger, p-limit, pipeline background com `etapa`, CHECKs, alertas). F1/F2 mergeados (charts/recharts, tabela `tasks` + `createTask`).
- [ ] Branch `feat/f3b-expansao-mercado` a partir de `master`.
- [ ] (Deferido, ação do dono — NÃO bloqueia: tudo é mockado) Criar app no DevCenter do Mercado Livre (developers.mercadolivre.com.br) com redirect URI `{APP_URL}/api/connections/mercadolivre/callback` e scopes `read offline_access`; preencher `ML_CLIENT_ID`/`ML_CLIENT_SECRET` nos envs Vercel/local.

---

## File Structure

| Caminho | Responsabilidade |
|---|---|
| `src/modules/providers/types.ts` (modificar) | `ProviderId`, `ConnectionProvider` com `id`/`label`/`usesPkce`/PKCE params, `RawOrder.externalOrderId` |
| `src/modules/providers/registry.ts` (criar) | `getProvider(name)`, `listProviders()`, `isProviderId(name)` |
| `src/modules/providers/pkce.ts` (criar) | `generatePkcePair()` (S256, base64url) |
| `src/modules/providers/bling/provider.ts` (modificar) | adequar à interface nova (`id`, `label`, `usesPkce:false`) |
| `src/modules/providers/bling/orders.ts` (modificar) | `RawOrder.externalOrderId` |
| `src/modules/providers/bling/products.ts` (criar) | `fetchProdutoBySku` (GET /produtos p/ catálogo) |
| `src/modules/providers/mercadolivre/oauth.ts` (criar) | authorize/exchange/refresh ML (PKCE S256) |
| `src/modules/providers/mercadolivre/orders.ts` (criar) | `fetchOrders` paginado (GET /orders/search) |
| `src/modules/providers/mercadolivre/provider.ts` (criar) | `mercadoLivreProvider: ConnectionProvider` |
| `src/modules/connections/connection.repository.ts` (modificar) | parametrizado por provider + `external_account_id` + `listConnectedProviders` |
| `src/modules/connections/oauth-callback.ts` (criar) | `validarCallback` (helper puro do callback OAuth) |
| `src/db/schema/connections.ts` (modificar) | coluna `external_account_id` |
| `src/db/schema/orders.ts` (modificar) | `provider` + `external_order_id` + unique novo |
| `src/db/schema/ranking-snapshots.ts` (criar) | tabela `ranking_snapshots` |
| `src/db/schema/competitors.ts` (criar) | tabela `competitors` |
| `src/db/schema/catalog-scores.ts` (criar) | tabela `catalog_scores` |
| `src/db/schema/index.ts` (modificar) | exportar tabelas novas |
| `src/app/api/connections/[provider]/route.ts` (criar) | inicia OAuth genérico (valida provider no registry) |
| `src/app/api/connections/[provider]/callback/route.ts` (criar) | callback genérico (state + PKCE) |
| `src/app/api/connections/bling/*` (REMOVER) | substituídos pela rota dinâmica (mesma URL) |
| `src/modules/pipeline/steps/collect-orders.ts` (criar; substitui `collect-bling.ts`) | coleta polimórfica de pedidos |
| `src/modules/pipeline/steps/collect-ranking.ts` (criar) | step gracioso de ranqueamento |
| `src/modules/pipeline/steps/collect-competitors.ts` (criar) | step gracioso de concorrentes |
| `src/modules/pipeline/steps/collect-catalog.ts` (criar) | step gracioso de qualidade de catálogo |
| `src/modules/pipeline/orchestrator.ts` (modificar) | usar `collectOrders` + steps novos no `allSettled` |
| `src/modules/pipeline/contracts.ts` (modificar) | `Metricas.concorrentes?` + `Metricas.qualidadeCatalogo?` |
| `src/modules/pipeline/steps/compute-metrics.ts` (modificar) | preencher os dois campos novos |
| `src/modules/pipeline/steps/analyze-ia.ts` (modificar) | prompt com concorrentes + catálogo |
| `src/modules/market/ml-search.ts` (criar) | client baixo nível da busca pública ML (títulos/seller/preço) |
| `src/modules/market/market.types.ts` (modificar) | `FonteSnapshot` com `'concorrente'` |
| `src/modules/ranking/match.ts` (criar) | `encontrarPosicao` (match por seller_id ou título) — puro |
| `src/modules/ranking/ranking.repository.ts` (criar) | persistência/consulta de `ranking_snapshots` |
| `src/modules/competitors/referencia.ts` (criar) | `parseReferencia` (URL ou seller_id) — puro |
| `src/modules/competitors/competitor.repository.ts` (criar) | CRUD (limite 10/org) |
| `src/modules/catalog/score.ts` (criar) | `scoreCatalogo` — puro |
| `src/modules/catalog/catalog.repository.ts` (criar) | persistência/consulta de `catalog_scores` |
| `src/actions/connections.actions.ts` (modificar) | `disconnectProviderAction(provider)` |
| `src/actions/mercado.actions.ts` (criar) | CRUD concorrentes + `criarTaskDeCatalogoAction` |
| `src/app/(client)/conexoes/page.tsx` (modificar) | cards por provider do registry |
| `src/app/(client)/mercado/page.tsx` (criar) | página com abas Ranqueamento / Concorrentes / Catálogo |
| `src/app/(client)/mercado/ranking-chart.tsx` (criar) | line chart de posição (recharts, tema F1) |
| `src/app/(client)/mercado/concorrentes-form.tsx` (criar) | CRUD client de concorrentes |
| `src/components/app-shell.tsx` (modificar) | item de navegação "Mercado" |
| `src/lib/env.ts` + `.env.example` (modificar) | `ML_CLIENT_ID/SECRET/REDIRECT_URI/AUTH_BASE/API_BASE` |

**Decisões já tomadas (não rediscutir):**
1. **PKCE ML:** SEMPRE enviado (S256). A doc oficial (developers.mercadolivre.com.br/en_us/authentication-and-authorization) trata `code_verifier`/`code_challenge` como opcionais por app ("only applies if the application has PKCE enabled") — enviar sempre é compatível com app sem PKCE e obrigatório com PKCE ligado. Verifier fica em cookie httpOnly de 10 min ao lado do state.
2. **Migration `orders`:** rename `bling_order_id` → `external_order_id` + `provider varchar(32) NOT NULL DEFAULT 'bling'` (Postgres 11+ preenche o default sem rewrite = backfill implícito das linhas de produção) + troca do unique. SQL manual (drizzle-kit tende a gerar DROP+ADD no rename, o que PERDERIA dados).
3. **UI de ranqueamento:** página própria `/mercado` com abas por URL (`?aba=`). Justificativa: `/conexoes` é configuração (conectar contas, cadastrar produtos); ranqueamento/concorrentes/catálogo são LEITURA analítica recorrente e compartilham a mesma audiência — uma página "Mercado" com 3 abas evita 3 itens de nav e dá deep-link por aba sem depender do contrato exato do `Tabs` da F1.
4. **Rotas antigas do Bling:** os arquivos estáticos são REMOVIDOS; a rota dinâmica `[provider]` atende exatamente `/api/connections/bling` e `/api/connections/bling/callback` — o `redirect_uri` registrado no Bling não muda.
5. **`seller_id` do ML:** vem no próprio token response (`user_id`) — persistido em `connections.external_account_id`; usado por `fetchOrders` (`?seller=`) e pelo match de ranqueamento.

---

### Task 1: Tipos generalizados + registry de providers

**Files:**
- Modify: `src/modules/providers/types.ts`, `src/modules/providers/bling/provider.ts`, `src/modules/providers/bling/orders.ts`, `src/modules/pipeline/steps/collect-bling.ts` (só o campo renomeado)
- Create: `src/modules/providers/registry.ts`, `src/modules/providers/pkce.ts`
- Test: `tests/unit/provider-registry.test.ts`, `tests/unit/pkce.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `type ProviderId = 'bling'` (expande na Task 2); `OAuthTokens` ganha `externalAccountId?: string`; `RawOrder.blingOrderId` renomeado para `externalOrderId`; `interface ConnectionProvider { readonly id: ProviderId; readonly label: string; readonly usesPkce: boolean; buildAuthorizeUrl(state: string, codeChallenge?: string): string; exchangeCode(code: string, codeVerifier?: string): Promise<OAuthTokens>; refresh(refreshToken: string): Promise<OAuthTokens>; fetchOrders(orgId: string, periodo: Periodo): Promise<RawOrder[]> }` (o campo `name` é substituído por `id`+`label`).
  - `registry.ts`: `isProviderId(v: string): v is ProviderId`; `getProvider(name: string): ConnectionProvider` (lança `Error('provider_desconhecido')`); `listProviders(): ConnectionProvider[]`.
  - `pkce.ts`: `generatePkcePair(): { verifier: string; challenge: string }` — verifier = 32 bytes base64url; challenge = base64url(sha256(verifier)).

- [ ] **Step 1: Testes (falham primeiro)**

Criar `tests/unit/provider-registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { getProvider, isProviderId, listProviders } from '@/modules/providers/registry';

describe('providers/registry', () => {
  it('getProvider("bling") devolve o provider com id/label/usesPkce', () => {
    const p = getProvider('bling');
    expect(p.id).toBe('bling');
    expect(p.label).toBe('Bling');
    expect(p.usesPkce).toBe(false);
    expect(typeof p.fetchOrders).toBe('function');
  });

  it('getProvider desconhecido lança provider_desconhecido', () => {
    expect(() => getProvider('shopee')).toThrow('provider_desconhecido');
  });

  it('isProviderId valida ids', () => {
    expect(isProviderId('bling')).toBe(true);
    expect(isProviderId('qualquer')).toBe(false);
  });

  it('listProviders devolve todos os providers registrados', () => {
    const ids = listProviders().map((p) => p.id);
    expect(ids).toContain('bling');
  });
});
```

Criar `tests/unit/pkce.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { generatePkcePair } from '@/modules/providers/pkce';

describe('pkce', () => {
  it('challenge = base64url(sha256(verifier)) e verifier é aleatório', () => {
    const a = generatePkcePair();
    const b = generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
    const esperado = createHash('sha256').update(a.verifier).digest('base64url');
    expect(a.challenge).toBe(esperado);
  });
});
```

Run: `npm run test -- tests/unit/provider-registry.test.ts tests/unit/pkce.test.ts`
Expected: FAIL ("Cannot find module '@/modules/providers/registry'").

- [ ] **Step 2: Implementar tipos + pkce + registry**

Substituir `src/modules/providers/types.ts` por:

```ts
export type ProviderId = 'bling'; // Task 2 expande para 'bling' | 'mercadolivre'

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope?: string;
  /** Id da conta no provider (ex.: user_id do Mercado Livre) — persiste em connections.external_account_id. */
  externalAccountId?: string;
};

export type RawOrderItem = {
  sku?: string;
  nome: string;
  quantidade: number;
  valor: number;
};

export type RawOrder = {
  externalOrderId: string;
  canal: string;
  data: Date;
  valorTotal: number;
  frete: number;
  itens: RawOrderItem[];
};

export type Periodo = {
  inicio: Date;
  fim: Date;
};

export interface ConnectionProvider {
  readonly id: ProviderId;
  readonly label: string;
  /** true = a rota OAuth genérica gera code_verifier/code_challenge (S256). */
  readonly usesPkce: boolean;
  buildAuthorizeUrl(state: string, codeChallenge?: string): string;
  exchangeCode(code: string, codeVerifier?: string): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
  fetchOrders(orgId: string, periodo: Periodo): Promise<RawOrder[]>;
}
```

Criar `src/modules/providers/pkce.ts`:

```ts
import { createHash, randomBytes } from 'node:crypto';

export function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}
```

Criar `src/modules/providers/registry.ts` (já no formato `Partial` que a Task 4 preenche):

```ts
import { blingProvider } from '@/modules/providers/bling/provider';
import type { ConnectionProvider, ProviderId } from '@/modules/providers/types';

const REGISTRY: Partial<Record<ProviderId, ConnectionProvider>> = {
  bling: blingProvider,
};

export function isProviderId(v: string): v is ProviderId {
  return Object.prototype.hasOwnProperty.call(REGISTRY, v);
}

export function getProvider(name: string): ConnectionProvider {
  const p = isProviderId(name) ? REGISTRY[name] : undefined;
  if (!p) throw new Error('provider_desconhecido');
  return p;
}

export function listProviders(): ConnectionProvider[] {
  return Object.values(REGISTRY).filter((p): p is ConnectionProvider => p !== undefined);
}
```

- [ ] **Step 3: Adequar o Bling à interface nova**

Substituir `src/modules/providers/bling/provider.ts` por:

```ts
import { buildAuthorizeUrl, exchangeCode, refreshTokens } from '@/modules/providers/bling/oauth';
import { fetchOrders } from '@/modules/providers/bling/orders';
import type { ConnectionProvider } from '@/modules/providers/types';

export const blingProvider: ConnectionProvider = {
  id: 'bling',
  label: 'Bling',
  usesPkce: false,
  buildAuthorizeUrl,
  exchangeCode,
  refresh: refreshTokens,
  fetchOrders,
};
```

> As funções do Bling têm aridade menor que a interface (params PKCE opcionais) — TypeScript aceita. `oauth.ts` do Bling NÃO muda.

Em `src/modules/providers/bling/orders.ts`, na função `mapOrder`, trocar o retorno:

```ts
  return { externalOrderId: id, canal, data, valorTotal, frete, itens };
```

Em `src/modules/pipeline/steps/collect-bling.ts`, trocar as 2 referências `o.blingOrderId` por `o.externalOrderId` (o nome da COLUNA `bling_order_id` só muda na Task 5):

```ts
  const validOrders = rawOrders.filter((o) => o.externalOrderId.trim() !== '');
  // ...
    bling_order_id: o.externalOrderId,
```

- [ ] **Step 4: Rodar para ver passar + varrer regressões**

Run: `npm run test -- tests/unit/provider-registry.test.ts tests/unit/pkce.test.ts` → PASS (5).
Run: `npm run typecheck` → limpo. Se algum teste/arquivo referenciar `blingOrderId` ou `blingProvider.name`, atualizar para `externalOrderId`/`blingProvider.id` (buscar com `rg -l "blingOrderId|blingProvider\.name" src tests`).
Run: `npm run test` → suíte inteira verde.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(providers): registry + interface generalizada (id/label/pkce) + RawOrder.externalOrderId"
```

---

### Task 2: `connection.repository` parametrizado por provider + `external_account_id`

**Files:**
- Modify: `src/modules/connections/connection.repository.ts`, `src/db/schema/connections.ts`, `src/modules/providers/types.ts` (union completo), `src/modules/notifications/email.ts`
- Generate: migration `00XX_connections_external_account.sql` (número conforme o estado do repo)
- Test: `tests/integration/connection-repository.test.ts` (existente deve continuar verde + casos novos no mesmo arquivo)

**Interfaces:**
- Produces:
  - `saveConnection(orgId: string, provider: ProviderId, tokens: OAuthTokens): Promise<void>` — upsert por `(org_id, provider)`, persiste `external_account_id` quando `tokens.externalAccountId` presente; audita `connection.${provider}.conectada`.
  - `getConnection(orgId: string, provider: ProviderId = 'bling'): Promise<{ status: string; connected: boolean; expira_em: Date | null; last_sync_at: Date | null } | null>`.
  - `getValidAccessToken(orgId: string, provider: ProviderId = 'bling'): Promise<string>` — erros `sem_conexao_${provider}` / `refresh_${provider}_falhou` (preserva as strings atuais do bling); refresh via `getProvider(provider)` com **import dinâmico** (evita ciclo registry → bling/provider → bling/orders → connection.repository → registry).
  - `getConnectionExternalAccountId(orgId: string, provider: ProviderId): Promise<string | null>`.
  - `listConnectedProviders(orgId: string): Promise<ProviderId[]>` — providers com `status='ok'` e `access_token` não nulo.
  - `disconnectProvider(orgId: string, provider: ProviderId): Promise<void>` — audita `connection.${provider}.desconectada`.
  - Aliases retrocompat: `saveBlingConnection(orgId, tokens)`, `disconnectBling(orgId)`.
  - `sendConnectionFailedEmail(to: string, provider: string)` em `notifications/email.ts`; `sendBlingConnectionFailedEmail` vira alias fino.
  - Coluna nova `connections.external_account_id varchar(64)` nullable.

- [ ] **Step 1: Casos de teste novos (falham primeiro)**

Em `src/modules/providers/types.ts`: `export type ProviderId = 'bling' | 'mercadolivre';` (o registry `Partial` da Task 1 continua compilando só com bling).

Acrescentar ao `tests/integration/connection-repository.test.ts` (mesmo describe, mesma org semeada):

```ts
  it('saveConnection persiste provider e external_account_id (mercadolivre)', async () => {
    const { saveConnection, getConnectionExternalAccountId, listConnectedProviders } = await import(
      '@/modules/connections/connection.repository'
    );
    await saveConnection(orgId, 'mercadolivre', {
      accessToken: 'ML-ACCESS',
      refreshToken: 'ML-REFRESH',
      expiresInSeconds: 21600,
      externalAccountId: '123456789',
    });
    expect(await getConnectionExternalAccountId(orgId, 'mercadolivre')).toBe('123456789');
    const conectados = await listConnectedProviders(orgId);
    expect(conectados).toContain('mercadolivre');
  });

  it('getValidAccessToken é isolado por provider (ML devolve o token do ML)', async () => {
    const { getValidAccessToken } = await import('@/modules/connections/connection.repository');
    expect(await getValidAccessToken(orgId, 'mercadolivre')).toBe('ML-ACCESS');
  });

  it('sem conexão do provider lança sem_conexao_<provider>', async () => {
    const { getValidAccessToken } = await import('@/modules/connections/connection.repository');
    await expect(
      getValidAccessToken('00000000-0000-0000-0000-000000000000', 'mercadolivre'),
    ).rejects.toThrow('sem_conexao_mercadolivre');
  });
```

Run: `npm run test -- tests/integration/connection-repository.test.ts` → FAIL (funções novas inexistentes).

- [ ] **Step 2: Schema + migration**

Em `src/db/schema/connections.ts`, adicionar após `provider`:

```ts
    external_account_id: varchar('external_account_id', { length: 64 }),
```

Run: `npm run db:generate` → inspecionar: deve conter APENAS `ALTER TABLE "connections" ADD COLUMN "external_account_id" varchar(64);`. Acrescentar À MÃO no mesmo arquivo a expansão do CHECK de provider criado na F0 (nome real do constraint: verificar com `rg -n "provider" drizzle/`; se a F0 não tiver criado CHECK em connections.provider, criar mesmo assim):

```sql
ALTER TABLE "connections" DROP CONSTRAINT IF EXISTS "connections_provider_check";
ALTER TABLE "connections" ADD CONSTRAINT "connections_provider_check" CHECK (provider IN ('bling','mercadolivre'));
```

Aplicar em main (`npm run db:migrate`) e no branch test:

```bash
TEST_DIRECT=$(grep '^DATABASE_URL_TEST_DIRECT=' .env.local | cut -d= -f2-)
POSTGRES_URL_DIRECT="$TEST_DIRECT" node node_modules/drizzle-kit/bin.cjs migrate
```

- [ ] **Step 3: Reescrever o repository parametrizado**

Substituir `src/modules/connections/connection.repository.ts` por:

```ts
import { and, eq, isNotNull } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import { decryptSecret, encryptSecret } from '@/modules/crypto/crypto';
import { sendConnectionFailedEmail } from '@/modules/notifications/email';
import { getOrgPrimaryEmail } from '@/modules/notifications/recipients';
import type { OAuthTokens, ProviderId } from '@/modules/providers/types';

const REFRESH_MARGIN_MS = 60_000;

function expiresAt(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

export async function saveConnection(
  orgId: string,
  provider: ProviderId,
  tokens: OAuthTokens,
): Promise<void> {
  const values = {
    org_id: orgId,
    provider,
    external_account_id: tokens.externalAccountId ?? null,
    access_token: encryptSecret(tokens.accessToken),
    refresh_token: encryptSecret(tokens.refreshToken),
    expira_em: expiresAt(tokens.expiresInSeconds),
    status: 'ok' as const,
  };
  await db
    .insert(connections)
    .values(values)
    .onConflictDoUpdate({
      target: [connections.org_id, connections.provider],
      set: {
        external_account_id: values.external_account_id,
        access_token: values.access_token,
        refresh_token: values.refresh_token,
        expira_em: values.expira_em,
        status: 'ok',
      },
    });
  await recordAudit({ orgId, acao: `connection.${provider}.conectada` });
}

export async function getConnection(orgId: string, provider: ProviderId = 'bling') {
  const [row] = await db
    .select({
      status: connections.status,
      expira_em: connections.expira_em,
      last_sync_at: connections.last_sync_at,
      access_token: connections.access_token,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)))
    .limit(1);
  if (!row) return null;
  return {
    status: row.status,
    connected: row.status === 'ok' && row.access_token !== null,
    expira_em: row.expira_em,
    last_sync_at: row.last_sync_at,
  };
}

export async function getConnectionExternalAccountId(
  orgId: string,
  provider: ProviderId,
): Promise<string | null> {
  const [row] = await db
    .select({ external_account_id: connections.external_account_id })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)))
    .limit(1);
  return row?.external_account_id ?? null;
}

export async function listConnectedProviders(orgId: string): Promise<ProviderId[]> {
  const rows = await db
    .select({ provider: connections.provider })
    .from(connections)
    .where(
      and(
        eq(connections.org_id, orgId),
        eq(connections.status, 'ok'),
        isNotNull(connections.access_token),
      ),
    );
  return rows.map((r) => r.provider as ProviderId);
}

export async function getValidAccessToken(
  orgId: string,
  provider: ProviderId = 'bling',
): Promise<string> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)))
    .limit(1);
  if (!row || !row.access_token || !row.refresh_token) {
    throw new Error(`sem_conexao_${provider}`);
  }

  const expMs = row.expira_em ? row.expira_em.getTime() : 0;
  if (expMs - Date.now() > REFRESH_MARGIN_MS) {
    return decryptSecret(row.access_token);
  }

  // precisa renovar — import dinâmico do registry para evitar ciclo de módulos
  // (registry → bling/provider → bling/orders → connection.repository)
  try {
    const { getProvider } = await import('@/modules/providers/registry');
    const refreshed = await getProvider(provider).refresh(decryptSecret(row.refresh_token));
    await db
      .update(connections)
      .set({
        access_token: encryptSecret(refreshed.accessToken),
        refresh_token: encryptSecret(refreshed.refreshToken),
        expira_em: expiresAt(refreshed.expiresInSeconds),
        status: 'ok',
      })
      .where(eq(connections.id, row.id));
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof Error && err.message === 'provider_desconhecido') throw err;
    await db
      .update(connections)
      .set({ status: 'expirado' })
      .where(eq(connections.id, row.id));
    try {
      const to = await getOrgPrimaryEmail(orgId);
      if (to) await sendConnectionFailedEmail(to, provider);
    } catch {
      // e-mail nunca quebra o fluxo de erro do refresh
    }
    throw new Error(`refresh_${provider}_falhou`);
  }
}

export async function disconnectProvider(orgId: string, provider: ProviderId): Promise<void> {
  await db
    .update(connections)
    .set({ access_token: null, refresh_token: null, status: 'erro' })
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, provider)));
  await recordAudit({ orgId, acao: `connection.${provider}.desconectada` });
}

// ---- aliases retrocompat (testes e call sites do Bling) ----
export function saveBlingConnection(orgId: string, tokens: OAuthTokens): Promise<void> {
  return saveConnection(orgId, 'bling', tokens);
}

export function disconnectBling(orgId: string): Promise<void> {
  return disconnectProvider(orgId, 'bling');
}
```

Em `src/modules/notifications/email.ts`, criar `sendConnectionFailedEmail(to: string, provider: string)` reaproveitando o corpo do e-mail atual do Bling com label legível (mapa local `const PROVIDER_LABELS: Record<string, string> = { bling: 'Bling', mercadolivre: 'Mercado Livre' }`, fallback = o próprio id), e reduzir `sendBlingConnectionFailedEmail(to)` a `return sendConnectionFailedEmail(to, 'bling')`.

> O mock existente dos testes (`vi.spyOn(provider.blingProvider, 'refresh')`) continua funcionando — o registry devolve a MESMA instância `blingProvider`.

- [ ] **Step 4: Rodar tudo**

Run: `npm run test -- tests/integration/connection-repository.test.ts` → PASS (casos antigos + 3 novos).
Run: `npm run test && npm run typecheck` → suíte inteira verde (em especial pipeline/e2e que usam `getValidAccessToken(orgId)` sem segundo argumento e `getConnection(orgId)` na página /conexoes).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(connections): repository parametrizado por provider + external_account_id + aliases bling"
```

---

### Task 3: Rotas OAuth genéricas `/api/connections/[provider]` (+ callback)

**Files:**
- Create: `src/app/api/connections/[provider]/route.ts`, `src/app/api/connections/[provider]/callback/route.ts`
- Delete: `src/app/api/connections/bling/route.ts`, `src/app/api/connections/bling/callback/route.ts`
- Modify: `src/actions/connections.actions.ts` (action genérica de desconectar)
- Test: `tests/unit/oauth-callback-params.test.ts` (helper puro), E2E existente `tests/e2e/conexoes.spec.ts` continua verde

**Interfaces:**
- Produces:
  - `GET /api/connections/[provider]` — valida provider no registry (`isProviderId`); gera `state` (16 bytes hex) em cookie `oauth_state_${provider}` (httpOnly, secure, lax, 600s); se `provider.usesPkce`, gera par PKCE e guarda o verifier em cookie `oauth_verifier_${provider}`; redireciona para `provider.buildAuthorizeUrl(state, challenge?)`. Provider desconhecido → `/conexoes?erro=provider_desconhecido`.
  - `GET /api/connections/[provider]/callback` — valida state vs cookie, lê verifier (se houver), `provider.exchangeCode(code, verifier)`, `saveConnection(orgId, provider.id, tokens)`, redireciona `/conexoes?ok=1`.
  - `disconnectProviderAction(_prev: ConnState, formData: FormData): Promise<ConnState>` — lê `provider` do form, valida com `isProviderId`, chama `disconnectProvider`.
  - Helper puro `validarCallback` (testável sem contexto Next): `validarCallback(params: { code: string | null; state: string | null; expected: string | undefined }): boolean`.
- URLs antigas preservadas: `/api/connections/bling` e `/api/connections/bling/callback` passam a ser atendidas pela rota dinâmica (mesmo path — o `BLING_REDIRECT_URI` registrado no Bling não muda).

- [ ] **Step 1: Teste do helper puro (falha primeiro)**

Criar `src/modules/connections/oauth-callback.ts`:

```ts
export function validarCallback(params: {
  code: string | null;
  state: string | null;
  expected: string | undefined;
}): boolean {
  return Boolean(params.code && params.state && params.expected && params.state === params.expected);
}
```

Antes, criar `tests/unit/oauth-callback-params.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { validarCallback } from '@/modules/connections/oauth-callback';

describe('validarCallback', () => {
  it('aceita code + state igual ao cookie', () => {
    expect(validarCallback({ code: 'abc', state: 's1', expected: 's1' })).toBe(true);
  });
  it('rejeita state divergente, ausente ou sem cookie', () => {
    expect(validarCallback({ code: 'abc', state: 's1', expected: 's2' })).toBe(false);
    expect(validarCallback({ code: 'abc', state: null, expected: 's1' })).toBe(false);
    expect(validarCallback({ code: 'abc', state: 's1', expected: undefined })).toBe(false);
    expect(validarCallback({ code: null, state: 's1', expected: 's1' })).toBe(false);
  });
});
```

Run: `npm run test -- tests/unit/oauth-callback-params.test.ts` → FAIL (módulo inexistente) → implementar o helper acima → PASS (2).

- [ ] **Step 2: Rota de início do OAuth**

Criar `src/app/api/connections/[provider]/route.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getSessionContext } from '@/modules/auth/session';
import { generatePkcePair } from '@/modules/providers/pkce';
import { getProvider, isProviderId } from '@/modules/providers/registry';

export async function GET(
  _req: Request,
  { params }: { params: { provider: string } },
) {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  if (!isProviderId(params.provider)) {
    return NextResponse.redirect(new URL('/conexoes?erro=provider_desconhecido', base));
  }
  const access = await getSessionContext();
  if (!access || access.orgStatus !== 'active') {
    return NextResponse.redirect(new URL('/sign-in', base));
  }
  try {
    const provider = getProvider(params.provider);
    const state = randomBytes(16).toString('hex');
    const jar = cookies();
    const cookieOpts = {
      httpOnly: true,
      secure: true,
      sameSite: 'lax' as const,
      maxAge: 600,
      path: '/',
    };
    jar.set(`oauth_state_${provider.id}`, state, cookieOpts);

    let challenge: string | undefined;
    if (provider.usesPkce) {
      const pkce = generatePkcePair();
      jar.set(`oauth_verifier_${provider.id}`, pkce.verifier, cookieOpts);
      challenge = pkce.challenge;
    }
    return NextResponse.redirect(provider.buildAuthorizeUrl(state, challenge));
  } catch {
    return NextResponse.redirect(
      new URL(`/conexoes?erro=${encodeURIComponent(params.provider)}_indisponivel`, base),
    );
  }
}
```

- [ ] **Step 3: Rota de callback**

Criar `src/app/api/connections/[provider]/callback/route.ts`:

```ts
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { getSessionContext } from '@/modules/auth/session';
import { saveConnection } from '@/modules/connections/connection.repository';
import { validarCallback } from '@/modules/connections/oauth-callback';
import { getProvider, isProviderId } from '@/modules/providers/registry';

export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  if (!isProviderId(params.provider)) {
    return NextResponse.redirect(new URL('/conexoes?erro=provider_desconhecido', base));
  }
  const access = await getSessionContext();
  if (!access || access.orgStatus !== 'active') {
    return NextResponse.redirect(new URL('/sign-in', base));
  }

  const provider = getProvider(params.provider);
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const jar = cookies();
  const expected = jar.get(`oauth_state_${provider.id}`)?.value;
  const verifier = jar.get(`oauth_verifier_${provider.id}`)?.value;
  jar.delete(`oauth_state_${provider.id}`);
  jar.delete(`oauth_verifier_${provider.id}`);

  if (!validarCallback({ code, state, expected })) {
    return NextResponse.redirect(new URL('/conexoes?erro=state_invalido', base));
  }

  try {
    const tokens = await provider.exchangeCode(code as string, verifier);
    await saveConnection(access.orgId, provider.id, tokens);
    return NextResponse.redirect(new URL('/conexoes?ok=1', base));
  } catch {
    return NextResponse.redirect(new URL('/conexoes?erro=falha_conexao', base));
  }
}
```

Remover `src/app/api/connections/bling/route.ts` e `src/app/api/connections/bling/callback/route.ts` (a pasta `bling/` inteira sob `api/connections/`). Verificar que NENHUM outro arquivo importa deles: `rg -l "api/connections/bling" src tests` — links `href="/api/connections/bling"` na UI podem ficar (a URL continua válida).

- [ ] **Step 4: Action genérica de desconexão**

Em `src/actions/connections.actions.ts`, adicionar (mantendo `disconnectBlingAction` existente delegando):

```ts
export async function disconnectProviderAction(
  _prev: ConnState,
  formData: FormData,
): Promise<ConnState> {
  const access = await requireActiveOrg();
  const provider = String(formData.get('provider') ?? '');
  if (!isProviderId(provider)) return { error: 'Integração inválida.' };
  await disconnectProvider(access.orgId, provider);
  revalidatePath('/conexoes');
  return { ok: true };
}
```

(imports: `isProviderId` de `@/modules/providers/registry`, `disconnectProvider` do repository). `disconnectBlingAction` passa a chamar `disconnectProvider(access.orgId, 'bling')` — assinatura pública inalterada.

- [ ] **Step 5: Verificação**

Run: `npm run test && npm run typecheck && npm run build` → verdes (o build confirma que a rota dinâmica compila e não colide com nada).
Run: `npm run test:e2e -- conexoes` → o spec existente de /conexoes continua verde (estado "Não conectado" usa o mesmo href).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(connections): rotas OAuth genéricas /api/connections/[provider] com PKCE opcional"
```

---

### Task 4: Provider Mercado Livre (OAuth PKCE + fetchOrders paginado)

**Files:**
- Create: `src/modules/providers/mercadolivre/oauth.ts`, `src/modules/providers/mercadolivre/orders.ts`, `src/modules/providers/mercadolivre/provider.ts`
- Modify: `src/modules/providers/registry.ts` (registrar ML), `src/lib/env.ts`, `.env.example`
- Test: `tests/unit/ml-oauth.test.ts`, `tests/unit/ml-orders.test.ts`

**Interfaces:**
- Consumes: `serverEnv`, `getValidAccessToken(orgId, 'mercadolivre')`, `getConnectionExternalAccountId(orgId, 'mercadolivre')`.
- Produces:
  - `oauth.ts`: `buildAuthorizeUrl(state: string, codeChallenge?: string): string` (base `ML_AUTH_BASE/authorization`); `exchangeCode(code: string, codeVerifier?: string): Promise<OAuthTokens>`; `refreshTokens(refreshToken: string): Promise<OAuthTokens>` — token endpoint `ML_API_BASE/oauth/token`, body `application/x-www-form-urlencoded` com `client_id`/`client_secret` NO BODY (ML não usa HTTP Basic, diferente do Bling); resposta traz `user_id` → `externalAccountId`. Erros: `ml_oauth_nao_configurado` / `ml_token_falhou`.
  - `orders.ts`: `fetchOrders(orgId: string, periodo: Periodo): Promise<RawOrder[]>` — `GET {ML_API_BASE}/orders/search?seller={id}&order.date_created.from=...&order.date_created.to=...&sort=date_asc&limit=50&offset=N`, paginado por offset; normaliza para `RawOrder` com `canal='mercadolivre'`, `frete=0` (custo de frete não vem no search — documentado). Erros: `ml_sem_seller_id` / `ml_indisponivel`; 429 → backoff (mesmo padrão F0 do Bling — reusar o helper de backoff da F0 se existir em `src/lib/`, senão 3 tentativas com `Retry-After`/exponencial local).
  - `provider.ts`: `mercadoLivreProvider: ConnectionProvider` com `id:'mercadolivre'`, `label:'Mercado Livre'`, `usesPkce:true`.
  - Envs novas (todas opcionais/default): `ML_CLIENT_ID?`, `ML_CLIENT_SECRET?`, `ML_REDIRECT_URI?`, `ML_AUTH_BASE` (default `https://auth.mercadolivre.com.br`), `ML_API_BASE` (default `https://api.mercadolibre.com`).

**Fatos da doc oficial (developers.mercadolivre.com.br/en_us/authentication-and-authorization), verificados em 2026-07-03:** authorize em `auth.mercadolivre.com.br/authorization`; token em `api.mercadolibre.com/oauth/token`; access token expira em 6h (`expires_in: 21600`); refresh token é SINGLE-USE e rotaciona a cada refresh (o repository já persiste o novo — nada a fazer); PKCE opcional por app (enviamos sempre S256); token response inclui `user_id` (seller id). Re-verificar endpoints na execução se a doc tiver mudado.

- [ ] **Step 1: Envs**

Em `src/lib/env.ts`, adicionar ao schema:

```ts
  ML_CLIENT_ID: z.string().min(1).optional(),
  ML_CLIENT_SECRET: z.string().min(1).optional(),
  ML_REDIRECT_URI: z.string().url().optional(),
  ML_AUTH_BASE: z.string().url().default('https://auth.mercadolivre.com.br'),
  ML_API_BASE: z.string().url().default('https://api.mercadolibre.com'),
```

Em `.env.example`, acrescentar:

```
ML_CLIENT_ID=
ML_CLIENT_SECRET=
ML_REDIRECT_URI=http://localhost:3000/api/connections/mercadolivre/callback
ML_AUTH_BASE=https://auth.mercadolivre.com.br
ML_API_BASE=https://api.mercadolibre.com
```

- [ ] **Step 2: Teste do OAuth ML (falha primeiro)**

Criar `tests/unit/ml-oauth.test.ts` (mock de `@/lib/env` — mesmo padrão adotado no `bling-oauth.test.ts` existente; ajustar o shape do mock ao arquivo real):

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: {
    ML_CLIENT_ID: 'ml-app-1',
    ML_CLIENT_SECRET: 'ml-secret-1',
    ML_REDIRECT_URI: 'http://localhost:3000/api/connections/mercadolivre/callback',
    ML_AUTH_BASE: 'https://auth.mercadolivre.com.br',
    ML_API_BASE: 'https://api.mercadolibre.com',
  },
}));

describe('mercadolivre/oauth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('buildAuthorizeUrl inclui client_id, state e PKCE S256', async () => {
    const { buildAuthorizeUrl } = await import('@/modules/providers/mercadolivre/oauth');
    const url = new URL(buildAuthorizeUrl('st-1', 'chal-abc'));
    expect(url.origin).toBe('https://auth.mercadolivre.com.br');
    expect(url.pathname).toBe('/authorization');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('ml-app-1');
    expect(url.searchParams.get('state')).toBe('st-1');
    expect(url.searchParams.get('code_challenge')).toBe('chal-abc');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('exchangeCode envia credenciais no body + code_verifier e mapeia user_id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'APP_USR-token',
          token_type: 'Bearer',
          expires_in: 21600,
          scope: 'offline_access read',
          user_id: 987654321,
          refresh_token: 'TG-refresh',
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { exchangeCode } = await import('@/modules/providers/mercadolivre/oauth');
    const tokens = await exchangeCode('code-1', 'verif-1');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [reqUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(reqUrl).toBe('https://api.mercadolibre.com/oauth/token');
    const body = String(init.body);
    expect(body).toContain('grant_type=authorization_code');
    expect(body).toContain('client_id=ml-app-1');
    expect(body).toContain('client_secret=ml-secret-1');
    expect(body).toContain('code_verifier=verif-1');
    expect(tokens.accessToken).toBe('APP_USR-token');
    expect(tokens.refreshToken).toBe('TG-refresh');
    expect(tokens.expiresInSeconds).toBe(21600);
    expect(tokens.externalAccountId).toBe('987654321');
  });

  it('refreshTokens usa grant_type=refresh_token e falha não-2xx lança ml_token_falhou', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'novo', refresh_token: 'novo-rt', expires_in: 21600, user_id: 987654321 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('{}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const { refreshTokens } = await import('@/modules/providers/mercadolivre/oauth');
    const ok = await refreshTokens('TG-velho');
    expect(ok.accessToken).toBe('novo');
    expect(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body)).toContain(
      'grant_type=refresh_token',
    );
    await expect(refreshTokens('TG-x')).rejects.toThrow('ml_token_falhou');
  });
});
```

Run: `npm run test -- tests/unit/ml-oauth.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `oauth.ts`**

Criar `src/modules/providers/mercadolivre/oauth.ts`:

```ts
import { serverEnv } from '@/lib/env';
import type { OAuthTokens } from '@/modules/providers/types';

function creds() {
  const { ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI } = serverEnv;
  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
    throw new Error('ml_oauth_nao_configurado');
  }
  return { id: ML_CLIENT_ID, secret: ML_CLIENT_SECRET, redirect: ML_REDIRECT_URI };
}

export function buildAuthorizeUrl(state: string, codeChallenge?: string): string {
  const c = creds();
  const u = new URL(`${serverEnv.ML_AUTH_BASE}/authorization`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', c.id);
  u.searchParams.set('redirect_uri', c.redirect);
  u.searchParams.set('state', state);
  if (codeChallenge) {
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
  }
  return u.toString();
}

type MlTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  user_id?: number | string;
};

function parseTokens(json: MlTokenPayload): OAuthTokens {
  return {
    accessToken: String(json.access_token ?? ''),
    refreshToken: String(json.refresh_token ?? ''),
    expiresInSeconds: Number(json.expires_in ?? 0),
    scope: json.scope ? String(json.scope) : undefined,
    externalAccountId: json.user_id !== undefined ? String(json.user_id) : undefined,
  };
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  const res = await fetch(`${serverEnv.ML_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error('ml_token_falhou');
  return parseTokens((await res.json()) as MlTokenPayload);
}

export function exchangeCode(code: string, codeVerifier?: string): Promise<OAuthTokens> {
  const c = creds();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: c.id,
    client_secret: c.secret,
    code,
    redirect_uri: c.redirect,
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);
  return tokenRequest(body);
}

export function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  const c = creds();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: c.id,
    client_secret: c.secret,
    refresh_token: refreshToken,
  });
  return tokenRequest(body);
}
```

Run: `npm run test -- tests/unit/ml-oauth.test.ts` → PASS (3).

- [ ] **Step 4: Teste do fetchOrders ML (falha primeiro)**

Criar `tests/unit/ml-orders.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: { ML_API_BASE: 'https://api.mercadolibre.com' },
}));
vi.mock('@/modules/connections/connection.repository', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('APP_USR-token'),
  getConnectionExternalAccountId: vi.fn().mockResolvedValue('987654321'),
}));

function mlOrder(id: number, total: number) {
  return {
    id,
    date_created: '2026-06-15T10:00:00.000-03:00',
    total_amount: total,
    paid_amount: total,
    order_items: [
      { item: { title: `Item ${id}`, seller_sku: `SKU-${id}` }, quantity: 2, unit_price: total / 2 },
    ],
  };
}

describe('mercadolivre/orders fetchOrders', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pagina por offset e normaliza para RawOrder (canal mercadolivre)', async () => {
    const page1 = { results: Array.from({ length: 50 }, (_, i) => mlOrder(i + 1, 100)), paging: { total: 60, offset: 0, limit: 50 } };
    const page2 = { results: Array.from({ length: 10 }, (_, i) => mlOrder(i + 51, 200)), paging: { total: 60, offset: 50, limit: 50 } };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchOrders } = await import('@/modules/providers/mercadolivre/orders');
    const orders = await fetchOrders('org-1', {
      inicio: new Date('2026-06-01T00:00:00Z'),
      fim: new Date('2026-07-01T00:00:00Z'),
    });

    expect(orders).toHaveLength(60);
    expect(orders[0]).toMatchObject({
      externalOrderId: '1',
      canal: 'mercadolivre',
      valorTotal: 100,
      frete: 0,
    });
    expect(orders[0].itens[0]).toMatchObject({ sku: 'SKU-1', nome: 'Item 1', quantidade: 2, valor: 50 });

    const url1 = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url1.pathname).toBe('/orders/search');
    expect(url1.searchParams.get('seller')).toBe('987654321');
    expect(url1.searchParams.get('limit')).toBe('50');
    expect(url1.searchParams.get('offset')).toBe('0');
    expect(url1.searchParams.get('order.date_created.from')).toContain('2026-06-01');
    const url2 = new URL(String(fetchMock.mock.calls[1][0]));
    expect(url2.searchParams.get('offset')).toBe('50');
  });

  it('sem seller_id lança ml_sem_seller_id; não-2xx lança ml_indisponivel', async () => {
    const repo = await import('@/modules/connections/connection.repository');
    vi.mocked(repo.getConnectionExternalAccountId).mockResolvedValueOnce(null);
    const { fetchOrders } = await import('@/modules/providers/mercadolivre/orders');
    const periodo = { inicio: new Date(), fim: new Date() };
    await expect(fetchOrders('org-1', periodo)).rejects.toThrow('ml_sem_seller_id');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    await expect(fetchOrders('org-1', periodo)).rejects.toThrow('ml_indisponivel');
  });
});
```

Run: `npm run test -- tests/unit/ml-orders.test.ts` → FAIL.

- [ ] **Step 5: Implementar `orders.ts` + `provider.ts` + registrar**

Criar `src/modules/providers/mercadolivre/orders.ts`:

```ts
import { serverEnv } from '@/lib/env';
import {
  getConnectionExternalAccountId,
  getValidAccessToken,
} from '@/modules/connections/connection.repository';
import type { Periodo, RawOrder, RawOrderItem } from '@/modules/providers/types';

const PAGE_SIZE = 50;
const MAX_RETRIES = 3;

type MlOrderItemPayload = {
  item?: { title?: string | null; seller_sku?: string | null; seller_custom_field?: string | null } | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
};

type MlOrderPayload = {
  id?: number | string | null;
  date_created?: string | null;
  total_amount?: number | string | null;
  paid_amount?: number | string | null;
  order_items?: MlOrderItemPayload[] | null;
};

type MlSearchResponse = {
  results?: MlOrderPayload[] | null;
  paging?: { total?: number; offset?: number; limit?: number } | null;
};

/** ML espera ISO-8601 com offset explícito; troca o sufixo Z por -00:00. */
function formatMlDate(d: Date): string {
  return d.toISOString().replace('Z', '-00:00');
}

function mapItem(i: MlOrderItemPayload): RawOrderItem {
  const sku = i.item?.seller_sku ?? i.item?.seller_custom_field ?? undefined;
  return {
    sku: sku ? String(sku) : undefined,
    nome: i.item?.title ? String(i.item.title) : '',
    quantidade: Number(i.quantity ?? 0),
    valor: Number(i.unit_price ?? 0),
  };
}

function mapOrder(raw: MlOrderPayload): RawOrder {
  return {
    externalOrderId: String(raw.id ?? ''),
    canal: 'mercadolivre',
    data: raw.date_created ? new Date(raw.date_created) : new Date(0),
    valorTotal: Number(raw.paid_amount ?? raw.total_amount ?? 0),
    // custo de frete não vem em /orders/search — 0 documentado (evolução futura: GET /shipments/{id})
    frete: 0,
    itens: (raw.order_items ?? []).map(mapItem),
  };
}

async function fetchPage(url: string, token: string): Promise<MlSearchResponse> {
  for (let tentativa = 1; ; tentativa++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
    } catch {
      throw new Error('ml_indisponivel');
    }
    if (res.status === 429 && tentativa < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 0);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** tentativa;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (!res.ok) throw new Error('ml_indisponivel');
    try {
      return (await res.json()) as MlSearchResponse;
    } catch {
      throw new Error('ml_indisponivel');
    }
  }
}

export async function fetchOrders(orgId: string, periodo: Periodo): Promise<RawOrder[]> {
  const sellerId = await getConnectionExternalAccountId(orgId, 'mercadolivre');
  if (!sellerId) throw new Error('ml_sem_seller_id');
  const token = await getValidAccessToken(orgId, 'mercadolivre');
  const base = serverEnv.ML_API_BASE;

  const all: RawOrder[] = [];
  let offset = 0;

  while (true) {
    const url = new URL(`${base}/orders/search`);
    url.searchParams.set('seller', sellerId);
    url.searchParams.set('order.date_created.from', formatMlDate(periodo.inicio));
    url.searchParams.set('order.date_created.to', formatMlDate(periodo.fim));
    url.searchParams.set('sort', 'date_asc');
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));

    const body = await fetchPage(url.toString(), token);
    const results = body.results ?? [];
    all.push(...results.map(mapOrder));

    const total = Number(body.paging?.total ?? 0);
    offset += PAGE_SIZE;
    if (results.length < PAGE_SIZE || offset >= total) break;
  }

  return all;
}
```

> Se a F0 tiver extraído um helper de backoff compartilhado (ex.: `src/lib/backoff.ts` usado pelo Bling), USAR o helper no lugar do laço de retry local de `fetchPage` — mesmo comportamento (3 tentativas, `Retry-After`, exponencial).

Criar `src/modules/providers/mercadolivre/provider.ts`:

```ts
import {
  buildAuthorizeUrl,
  exchangeCode,
  refreshTokens,
} from '@/modules/providers/mercadolivre/oauth';
import { fetchOrders } from '@/modules/providers/mercadolivre/orders';
import type { ConnectionProvider } from '@/modules/providers/types';

export const mercadoLivreProvider: ConnectionProvider = {
  id: 'mercadolivre',
  label: 'Mercado Livre',
  usesPkce: true,
  buildAuthorizeUrl,
  exchangeCode,
  refresh: refreshTokens,
  fetchOrders,
};
```

Em `src/modules/providers/registry.ts`, registrar e voltar ao `Record` completo:

```ts
import { blingProvider } from '@/modules/providers/bling/provider';
import { mercadoLivreProvider } from '@/modules/providers/mercadolivre/provider';
import type { ConnectionProvider, ProviderId } from '@/modules/providers/types';

const REGISTRY: Record<ProviderId, ConnectionProvider> = {
  bling: blingProvider,
  mercadolivre: mercadoLivreProvider,
};

export function isProviderId(v: string): v is ProviderId {
  return Object.prototype.hasOwnProperty.call(REGISTRY, v);
}

export function getProvider(name: string): ConnectionProvider {
  if (!isProviderId(name)) throw new Error('provider_desconhecido');
  return REGISTRY[name];
}

export function listProviders(): ConnectionProvider[] {
  return Object.values(REGISTRY);
}
```

Em `tests/unit/provider-registry.test.ts`, acrescentar assert: `expect(listProviders().map((p) => p.id)).toEqual(['bling', 'mercadolivre']);` e `expect(getProvider('mercadolivre').usesPkce).toBe(true);`.

- [ ] **Step 6: Rodar tudo**

Run: `npm run test -- tests/unit/ml-oauth.test.ts tests/unit/ml-orders.test.ts tests/unit/provider-registry.test.ts` → PASS.
Run: `npm run test && npm run typecheck` → suíte verde.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(providers): Mercado Livre — OAuth PKCE + fetchOrders paginado + registro"
```

---

### Task 5: Migration de `orders` (provider + external_order_id) + coleta polimórfica

> **ATENÇÃO — dados existentes em produção.** A tabela `orders` tem pedidos reais (Comercial Mattos) sob o unique `(org_id, bling_order_id)`. A migration É ESCRITA À MÃO: rename de coluna (preserva dados) + coluna `provider` com `DEFAULT 'bling'` (backfill implícito e barato no Postgres 11+) + troca do unique. drizzle-kit NÃO pode gerar DROP+ADD aqui.

**Files:**
- Modify: `src/db/schema/orders.ts`, `src/modules/pipeline/orchestrator.ts`
- Create: `src/modules/pipeline/steps/collect-orders.ts` (substitui `collect-bling.ts`, que é REMOVIDO)
- Create: migration manual `drizzle/00XX_orders_multi_provider.sql`
- Test: `tests/integration/collect-orders.test.ts` (novo; absorve os casos do teste do collect-bling se existirem)

**Interfaces:**
- Produces:
  - `orders` novo shape: `provider varchar(32) NOT NULL DEFAULT 'bling'`, `external_order_id varchar(64) NOT NULL` (ex-`bling_order_id`), unique `orders_org_provider_external_uq (org_id, provider, external_order_id)`.
  - `collectOrders(orgId: string, periodo: Periodo): Promise<CollectResult>` com `CollectResult = { processados: number; total: number; providers: ProviderId[] }` — itera `listConnectedProviders(orgId)`, roda `getProvider(id).fetchOrders`, upsert com dedupe por `(org_id, provider, external_order_id)`. Nenhum provider conectado → `Error('sem_conexao')`. TODOS os conectados falharam → relança o primeiro erro (falha dura). Falha parcial (1 de 2) → segue e loga `logger.warn`.
- Consumes: `logger` (F0), registry, `listConnectedProviders`.

- [ ] **Step 1: Schema Drizzle**

Em `src/db/schema/orders.ts`, substituir a coluna e o unique:

```ts
    provider: varchar('provider', { length: 32 }).notNull().default('bling'),
    external_order_id: varchar('external_order_id', { length: 64 }).notNull(),
```

e no bloco de constraints:

```ts
  (t) => ({
    org_provider_external_uq: unique('orders_org_provider_external_uq').on(
      t.org_id,
      t.provider,
      t.external_order_id,
    ),
  }),
```

(remover `bling_order_id` e `org_bling_uq` do schema; manter o índice `orders(org_id, data)` da F0 se existir no arquivo.)

- [ ] **Step 2: Migration manual**

Criar o próximo arquivo de migration (numeração sequencial do repo; registrar no journal do drizzle conforme o padrão dos arquivos vizinhos em `drizzle/meta/`) com EXATAMENTE:

```sql
ALTER TABLE "orders" RENAME COLUMN "bling_order_id" TO "external_order_id";
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "provider" varchar(32) DEFAULT 'bling' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_org_bling_uq";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_org_provider_external_uq" UNIQUE("org_id","provider","external_order_id");
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_provider_check";
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_provider_check" CHECK (provider IN ('bling','mercadolivre'));
```

> Racional: (1) RENAME preserva todos os dados; (2) `ADD COLUMN ... DEFAULT 'bling' NOT NULL` faz o backfill das linhas existentes sem rewrite (Postgres 11+); (3) o unique novo é estritamente mais permissivo para os dados atuais (todas as linhas têm provider='bling', então a unicidade antiga implica a nova — a criação não pode falhar); (4) CHECK garante a grafia canônica.
> Forma de gerar: rodar `npm run db:generate` após o Step 1 e SUBSTITUIR o conteúdo do SQL gerado pelo bloco acima (mantém journal/meta consistentes). Conferir com `cat` antes de aplicar.

Aplicar em main e test (mesmos comandos da Task 2, Step 2). Verificar dados preservados no main:

```bash
node -e 'const p=require("postgres");const fs=require("fs");const u=fs.readFileSync(".env.local","utf8").match(/^POSTGRES_URL=(.*)$/m)[1];const sql=p(u,{prepare:false});(async()=>{try{const r=await sql`select provider, count(*)::int n from orders group by provider`;console.log(r);}finally{await sql.end();}})()'
```

Expected: todas as linhas existentes com `provider: 'bling'` e a mesma contagem de antes da migration.

- [ ] **Step 3: Teste de integração do collectOrders (falha primeiro)**

Criar `tests/integration/collect-orders.test.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connections, orders, organizations } from '@/db/schema';
import { blingProvider } from '@/modules/providers/bling/provider';
import { mercadoLivreProvider } from '@/modules/providers/mercadolivre/provider';
import type { RawOrder } from '@/modules/providers/types';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

function raw(id: string, canal: string): RawOrder {
  return {
    externalOrderId: id,
    canal,
    data: new Date('2026-06-15T12:00:00Z'),
    valorTotal: 150,
    frete: 10,
    itens: [{ sku: 'S1', nome: 'Produto', quantidade: 1, valor: 150 }],
  };
}

describe.skipIf(!url)('collect-orders — integração', () => {
  let orgId = '';
  const periodo = { inicio: new Date('2026-06-01'), fim: new Date('2026-07-01') };

  beforeAll(async () => {
    const [o] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-co-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = o.id;
    const { saveConnection } = await import('@/modules/connections/connection.repository');
    await saveConnection(orgId, 'bling', { accessToken: 'a', refreshToken: 'r', expiresInSeconds: 3600 });
    await saveConnection(orgId, 'mercadolivre', {
      accessToken: 'a2',
      refreshToken: 'r2',
      expiresInSeconds: 21600,
      externalAccountId: '999',
    });
  });

  afterAll(async () => {
    await tdb.delete(orders).where(eq(orders.org_id, orgId));
    await tdb.delete(connections).where(eq(connections.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
    vi.restoreAllMocks();
  });

  it('coleta dos dois providers conectados e deduplica por (org, provider, external_id)', async () => {
    vi.spyOn(blingProvider, 'fetchOrders').mockResolvedValue([raw('B-1', 'Shopee'), raw('B-2', 'Loja')]);
    vi.spyOn(mercadoLivreProvider, 'fetchOrders').mockResolvedValue([raw('B-1', 'mercadolivre')]);

    const { collectOrders } = await import('@/modules/pipeline/steps/collect-orders');
    const r1 = await collectOrders(orgId, periodo);
    expect(r1.processados).toBe(3); // 'B-1' do bling e 'B-1' do ML NÃO colidem (providers distintos)
    expect(r1.providers).toEqual(['bling', 'mercadolivre']);

    // idempotente: rodar de novo não duplica
    await collectOrders(orgId, periodo);
    const rows = await tdb.select().from(orders).where(eq(orders.org_id, orgId));
    expect(rows).toHaveLength(3);
    const ml = rows.filter((r) => r.provider === 'mercadolivre');
    expect(ml).toHaveLength(1);
    expect(ml[0].external_order_id).toBe('B-1');
  });

  it('falha parcial: um provider cai, o outro coleta — não lança', async () => {
    vi.spyOn(blingProvider, 'fetchOrders').mockRejectedValue(new Error('bling_indisponivel'));
    vi.spyOn(mercadoLivreProvider, 'fetchOrders').mockResolvedValue([raw('B-9', 'mercadolivre')]);
    const { collectOrders } = await import('@/modules/pipeline/steps/collect-orders');
    const r = await collectOrders(orgId, periodo);
    expect(r.providers).toEqual(['mercadolivre']);
  });

  it('todos falham → relança o primeiro erro; sem conexões → sem_conexao', async () => {
    vi.spyOn(blingProvider, 'fetchOrders').mockRejectedValue(new Error('bling_indisponivel'));
    vi.spyOn(mercadoLivreProvider, 'fetchOrders').mockRejectedValue(new Error('ml_indisponivel'));
    const { collectOrders } = await import('@/modules/pipeline/steps/collect-orders');
    await expect(collectOrders(orgId, periodo)).rejects.toThrow('bling_indisponivel');
    await expect(
      collectOrders('00000000-0000-0000-0000-000000000000', periodo),
    ).rejects.toThrow('sem_conexao');
  });
});
```

Run: `npm run test -- tests/integration/collect-orders.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 4: Implementar `collect-orders.ts` e ligar no orquestrador**

Criar `src/modules/pipeline/steps/collect-orders.ts`:

```ts
import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { logger } from '@/lib/logger';
import { listConnectedProviders } from '@/modules/connections/connection.repository';
import { getProvider } from '@/modules/providers/registry';
import type { Periodo, ProviderId, RawOrder } from '@/modules/providers/types';

export type CollectResult = {
  processados: number;
  total: number;
  providers: ProviderId[];
};

async function upsertOrders(
  orgId: string,
  provider: ProviderId,
  rawOrders: RawOrder[],
): Promise<{ processados: number; total: number }> {
  const validOrders = rawOrders.filter((o) => o.externalOrderId.trim() !== '');
  if (validOrders.length === 0) {
    return { processados: 0, total: rawOrders.length };
  }

  const values = validOrders.map((o) => ({
    org_id: orgId,
    provider,
    external_order_id: o.externalOrderId,
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
      target: [orders.org_id, orders.provider, orders.external_order_id],
      set: {
        canal: sql`EXCLUDED.canal`,
        data: sql`EXCLUDED.data`,
        valor_total: sql`EXCLUDED.valor_total`,
        frete: sql`EXCLUDED.frete`,
        itens: sql`EXCLUDED.itens`,
      },
    })
    .returning({ id: orders.id });

  return { processados: result.length, total: rawOrders.length };
}

export async function collectOrders(orgId: string, periodo: Periodo): Promise<CollectResult> {
  const conectados = await listConnectedProviders(orgId);
  if (conectados.length === 0) {
    throw new Error('sem_conexao');
  }

  let processados = 0;
  let total = 0;
  const okProviders: ProviderId[] = [];
  let firstError: Error | null = null;

  for (const providerId of conectados) {
    try {
      const raw = await getProvider(providerId).fetchOrders(orgId, periodo);
      const r = await upsertOrders(orgId, providerId, raw);
      processados += r.processados;
      total += r.total;
      okProviders.push(providerId);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      logger.warn('collect-orders: provider falhou', { orgId, provider: providerId, erro: e.message });
      firstError ??= e;
    }
  }

  if (okProviders.length === 0 && firstError) {
    throw firstError;
  }
  return { processados, total, providers: okProviders };
}
```

> Se a F0 tiver mudado o upsert do Bling para lotes por página (contrato F0: "persistir pedidos em lotes por página"), preservar esse comportamento aqui: `upsertOrders` já opera sobre o array que o provider devolve; se o provider passar a expor streaming/lotes, adaptar mantendo o dedupe por `(org_id, provider, external_order_id)`.

No `src/modules/pipeline/orchestrator.ts`, trocar o import e a chamada (nomes conforme o orquestrador PÓS-F0 — re-validar):

```ts
import { collectOrders } from '@/modules/pipeline/steps/collect-orders';
// ...
    const [ordersOutcome, marketOutcome] = await Promise.allSettled([
      collectOrders(orgId, periodo),
      collectMarket(orgId, reportId),
    ]);

    if (ordersOutcome.status === 'rejected') {
      throw ordersOutcome.reason instanceof Error
        ? ordersOutcome.reason
        : new Error(String(ordersOutcome.reason));
    }
```

Remover `src/modules/pipeline/steps/collect-bling.ts`. Buscar referências restantes: `rg -l "collect-bling|collectBlingOrders|bling_order_id" src tests` — atualizar testes do orquestrador que mockavam `collectBlingOrders` para mockar `collectOrders` (mesma semântica de falha dura) e qualquer assert de erro `sem_conexao_bling` vindo do step para `sem_conexao`.

- [ ] **Step 5: Rodar tudo**

Run: `npm run test -- tests/integration/collect-orders.test.ts` → PASS (3).
Run: `npm run test && npm run typecheck && npm run build` → suíte inteira verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(pipeline): coleta polimórfica de pedidos + migration orders (org, provider, external_order_id)"
```

---

### Task 6: UI `/conexoes` multi-provider (cards do registry)

**Files:**
- Modify: `src/app/(client)/conexoes/page.tsx`
- Create: `src/app/(client)/conexoes/provider-card.tsx`
- Test: `tests/e2e/conexoes.spec.ts` (ajustar/estender)

**Interfaces:**
- Produces: seção "Integrações" renderizando um card por provider de `listProviders()`: nome (`label`), status (`Conectado ✓` / `Não conectado` / `Conexão expirada`), botão `Conectar` (link `/api/connections/{id}`) ou `Desconectar` (form → `disconnectProviderAction`). Testids: `provider-status-{id}`, `provider-conectar-{id}`, `provider-desconectar-{id}`. O testid legado `bling-status` é mantido no card do Bling (compat com E2E existente).
- Consumes: `listProviders()`, `getConnection(orgId, id)`, `disconnectProviderAction`.

- [ ] **Step 1: Card client**

Criar `src/app/(client)/conexoes/provider-card.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import { disconnectProviderAction, type ConnState } from '@/actions/connections.actions';

const initial: ConnState = {};

export type ProviderCardProps = {
  id: string;
  label: string;
  status: string | null; // null = nunca conectado
  connected: boolean;
};

export function ProviderCard({ id, label, status, connected }: ProviderCardProps) {
  const [state, dispatch] = useFormState(disconnectProviderAction, initial);

  const statusTexto = connected
    ? 'Conectado ✓'
    : status === 'expirado'
      ? 'Conexão expirada — reconecte'
      : 'Não conectado';

  return (
    <div className="rounded-lg border border-white/10 p-4" data-testid={`provider-card-${id}`}>
      <h3 className="font-medium">{label}</h3>
      <p
        data-testid={id === 'bling' ? 'bling-status' : `provider-status-${id}`}
        className={connected ? 'text-green-500' : 'text-zinc-400'}
      >
        {statusTexto}
      </p>
      {connected ? (
        <form action={dispatch}>
          <input type="hidden" name="provider" value={id} />
          <button type="submit" data-testid={`provider-desconectar-${id}`} className="mt-2 border px-3 py-1 text-sm">
            Desconectar
          </button>
        </form>
      ) : (
        <a
          href={`/api/connections/${id}`}
          data-testid={`provider-conectar-${id}`}
          className="mt-2 inline-block bg-white/10 px-3 py-1 text-sm"
        >
          Conectar {label}
        </a>
      )}
      {state.error ? <p className="mt-1 text-sm text-red-500">{state.error}</p> : null}
    </div>
  );
}
```

> Estilos: usar os primitivos/tokens da F1 já presentes na página real (Card/Alert/glass) — o markup acima é o mínimo funcional; ao implementar, seguir o visual vigente da página `/conexoes` pós-F1.

- [ ] **Step 2: Página iterando o registry**

Em `src/app/(client)/conexoes/page.tsx`, substituir a seção fixa do Bling por:

```tsx
import { listProviders } from '@/modules/providers/registry';
import { getConnection } from '@/modules/connections/connection.repository';
import { ProviderCard } from './provider-card';
// ...
  const providers = listProviders();
  const conexoes = await Promise.all(
    providers.map(async (p) => ({
      id: p.id,
      label: p.label,
      conn: await getConnection(access.orgId, p.id),
    })),
  );
// ... no JSX, no lugar da seção Bling:
      <section className="mb-8">
        <h2 className="mb-2 font-medium">Integrações</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {conexoes.map(({ id, label, conn }) => (
            <ProviderCard
              key={id}
              id={id}
              label={label}
              status={conn?.status ?? null}
              connected={conn?.connected ?? false}
            />
          ))}
        </div>
      </section>
```

(mantendo intacta a seção de produtos monitorados e o restante da página pós-F1.)

- [ ] **Step 3: E2E**

Em `tests/e2e/conexoes.spec.ts`, estender o teste existente: além do estado do Bling (`bling-status` = "Não conectado"), assertar que o card do Mercado Livre aparece (`provider-status-mercadolivre` visível com "Não conectado") e que `provider-conectar-mercadolivre` tem `href="/api/connections/mercadolivre"`.

Run: `npm run test:e2e -- conexoes` → PASS. `npm run test && npm run typecheck && npm run build` → verdes.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(conexoes): cards de integração por provider (registry) na UI"
```

---

### Task 7: Monitor de ranqueamento — schema + client de busca + matcher + step

**Files:**
- Create: `src/db/schema/ranking-snapshots.ts`, `src/modules/market/ml-search.ts`, `src/modules/ranking/match.ts`, `src/modules/ranking/ranking.repository.ts`, `src/modules/pipeline/steps/collect-ranking.ts`
- Modify: `src/db/schema/index.ts`, `src/modules/pipeline/orchestrator.ts`
- Generate: migration `00XX_ranking_snapshots.sql`
- Test: `tests/unit/ranking-match.test.ts`, `tests/unit/collect-ranking.test.ts` (mocks), `tests/integration/ranking-repository.test.ts`

**Interfaces:**
- Produces:
  - Tabela `ranking_snapshots`: `id` uuid pk; `org_id` uuid notNull FK; `tracked_product_id` uuid notNull FK→tracked_products.id; `keyword` varchar(160) notNull; `provider` varchar(32) notNull default `'mercadolivre'`; `posicao` integer nullable (null = fora do top 100); `pagina` integer nullable; `created_at` timestamptz notNull. Index `(org_id, tracked_product_id, keyword, created_at)`.
  - `ml-search.ts`: `type MlSearchItem = { id: string; titulo: string; preco: number | null; sellerId: string | null }`; `searchMlItems(params: { keyword?: string; sellerId?: string; limit?: number; offset?: number }): Promise<MlSearchItem[]>` — GET `{ML_API_BASE}/sites/MLB/search` sem autenticação (mesma API do `ml-publico.ts`, mas expondo título/seller/preço por item em vez de só a lista de preços). Lança `ml_busca_erro_{status}` em não-2xx.
  - `match.ts` (puro): `normalizar(s: string): string` (lowercase + sem acentos); `tituloCorresponde(nomeProduto: string, titulo: string): boolean` (≥60% dos tokens >2 chars do nome presentes no título, mínimo 2 tokens); `encontrarPosicao(params: { itens: MlSearchItem[]; sellerId: string | null; nomeProduto: string }): { posicao: number; pagina: number } | null` — prioriza match por `sellerId`; sem seller, cai para título; `pagina = floor((posicao-1)/50)+1`.
  - `ranking.repository.ts`: `saveRankingSnapshot(input: { orgId: string; trackedProductId: string; keyword: string; provider: string; posicao: number | null; pagina: number | null }): Promise<void>`; `listRankingHistory(orgId: string, trackedProductId: string, keyword: string, limit?: number)` (asc por created_at); `listLatestRankings(orgId: string): Promise<Array<{ trackedProductId: string; nome: string; keyword: string; posicao: number | null; pagina: number | null; createdAt: Date }>>` (último snapshot por (produto, keyword), via `DISTINCT ON`).
  - `collect-ranking.ts`: `collectRanking(orgId: string): Promise<{ consultas: number }>` — GRACIOSO (nunca lança): para cada tracked product ativo × keyword, busca top 100 do ML (2 páginas de 50) com concorrência limitada (p-limit 4, helper F0), acha a posição (seller da conexão ML quando existir, senão título) e salva snapshot (inclusive `posicao: null` quando não encontrado — o "sumiu do top 100" é informação).

- [ ] **Step 1: Teste do matcher (falha primeiro)**

Criar `tests/unit/ranking-match.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { encontrarPosicao, normalizar, tituloCorresponde } from '@/modules/ranking/match';
import type { MlSearchItem } from '@/modules/market/ml-search';

function item(i: number, titulo: string, sellerId: string | null = null): MlSearchItem {
  return { id: `MLB${i}`, titulo, preco: 100, sellerId };
}

describe('ranking/match', () => {
  it('normalizar remove acentos e baixa a caixa', () => {
    expect(normalizar('Fritadeira Elétrica AirFry 4L')).toBe('fritadeira eletrica airfry 4l');
  });

  it('tituloCorresponde exige >=60% dos tokens do nome (min 2)', () => {
    expect(tituloCorresponde('Fritadeira Elétrica 4L', 'Fritadeira eletrica sem oleo 4l preta')).toBe(true);
    expect(tituloCorresponde('Fritadeira Elétrica 4L', 'Panela de pressao inox')).toBe(false);
    expect(tituloCorresponde('4L', 'Fritadeira 4l')).toBe(false); // 1 token útil só — não confia
  });

  it('prioriza match por sellerId e devolve posicao/pagina', () => {
    const itens = [item(1, 'Outro produto'), item(2, 'Qualquer', '777'), item(3, 'Fritadeira eletrica 4l')];
    expect(encontrarPosicao({ itens, sellerId: '777', nomeProduto: 'Fritadeira Elétrica 4L' })).toEqual({
      posicao: 2,
      pagina: 1,
    });
  });

  it('sem sellerId cai para título; posicao 51+ = pagina 2; sem match = null', () => {
    const cinquenta = Array.from({ length: 50 }, (_, i) => item(i, `Produto irrelevante ${i}`));
    const itens = [...cinquenta, item(99, 'Fritadeira eletrica airfry 4l')];
    expect(encontrarPosicao({ itens, sellerId: null, nomeProduto: 'Fritadeira Elétrica 4L' })).toEqual({
      posicao: 51,
      pagina: 2,
    });
    expect(encontrarPosicao({ itens: cinquenta, sellerId: null, nomeProduto: 'Fritadeira Elétrica 4L' })).toBeNull();
  });
});
```

Run: `npm run test -- tests/unit/ranking-match.test.ts` → FAIL.

- [ ] **Step 2: Implementar `ml-search.ts` + `match.ts`**

Criar `src/modules/market/ml-search.ts`:

```ts
import { serverEnv } from '@/lib/env';

export type MlSearchItem = {
  id: string;
  titulo: string;
  preco: number | null;
  sellerId: string | null;
};

type MlSearchPayload = {
  results?: Array<{
    id?: string | number | null;
    title?: string | null;
    price?: number | null;
    seller?: { id?: number | string | null } | null;
  }> | null;
};

export async function searchMlItems(params: {
  keyword?: string;
  sellerId?: string;
  limit?: number;
  offset?: number;
}): Promise<MlSearchItem[]> {
  const url = new URL(`${serverEnv.ML_API_BASE}/sites/MLB/search`);
  if (params.keyword) url.searchParams.set('q', params.keyword);
  if (params.sellerId) url.searchParams.set('seller_id', params.sellerId);
  url.searchParams.set('limit', String(params.limit ?? 50));
  url.searchParams.set('offset', String(params.offset ?? 0));

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`ml_busca_erro_${res.status}`);
  const body = (await res.json()) as MlSearchPayload;

  return (body.results ?? []).map((r) => ({
    id: String(r.id ?? ''),
    titulo: String(r.title ?? ''),
    preco: typeof r.price === 'number' && r.price > 0 ? r.price : null,
    sellerId: r.seller?.id !== undefined && r.seller?.id !== null ? String(r.seller.id) : null,
  }));
}
```

> `ml-publico.ts` continua como está (contrato `MarketProvider` do benchmark). Consolidar os dois clients é refactor opcional FORA deste plano.

Criar `src/modules/ranking/match.ts`:

```ts
import type { MlSearchItem } from '@/modules/market/ml-search';

const PAGE = 50;
const MIN_TOKENS = 2;
const MIN_COBERTURA = 0.6;

export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function tokens(s: string): string[] {
  return normalizar(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 || /^\d+[a-z]*$/.test(t));
}

export function tituloCorresponde(nomeProduto: string, titulo: string): boolean {
  const ts = tokens(nomeProduto);
  if (ts.length < MIN_TOKENS) return false;
  const alvo = normalizar(titulo);
  const presentes = ts.filter((t) => alvo.includes(t)).length;
  return presentes / ts.length >= MIN_COBERTURA;
}

export function encontrarPosicao(params: {
  itens: MlSearchItem[];
  sellerId: string | null;
  nomeProduto: string;
}): { posicao: number; pagina: number } | null {
  const idx = params.itens.findIndex((item) =>
    params.sellerId
      ? item.sellerId === params.sellerId
      : tituloCorresponde(params.nomeProduto, item.titulo),
  );
  if (idx === -1) return null;
  const posicao = idx + 1;
  return { posicao, pagina: Math.floor(idx / PAGE) + 1 };
}
```

Run: `npm run test -- tests/unit/ranking-match.test.ts` → PASS (4).

> Nota sobre o teste de `tituloCorresponde('4L', ...)`: com a regra `MIN_TOKENS`, "4L" gera 1 token útil → false. Se o filtro de tokens divergir, ajustar o filtro (não o teste) até os 4 casos passarem.

- [ ] **Step 3: Schema + migration + repository (teste de integração primeiro)**

Criar `src/db/schema/ranking-snapshots.ts`:

```ts
import { index, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { trackedProducts } from './tracked-products';

export const rankingSnapshots = pgTable(
  'ranking_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    tracked_product_id: uuid('tracked_product_id')
      .notNull()
      .references(() => trackedProducts.id),
    keyword: varchar('keyword', { length: 160 }).notNull(),
    provider: varchar('provider', { length: 32 }).notNull().default('mercadolivre'),
    posicao: integer('posicao'),
    pagina: integer('pagina'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_prod_kw_idx: index('ranking_snapshots_org_prod_kw_idx').on(
      t.org_id,
      t.tracked_product_id,
      t.keyword,
      t.created_at,
    ),
  }),
);

export type RankingSnapshotRecord = typeof rankingSnapshots.$inferSelect;
export type NewRankingSnapshotRecord = typeof rankingSnapshots.$inferInsert;
```

Exportar em `src/db/schema/index.ts` (`export * from './ranking-snapshots';`). `npm run db:generate` → inspecionar (CREATE TABLE + index) → aplicar em main e test.

Criar `tests/integration/ranking-repository.test.ts` (padrão `skipIf`, org + tracked product semeados com prefixo `ta-test-rk-${RUN}`, cleanup em afterAll):

```ts
  it('salva snapshots e devolve histórico asc + último por produto/keyword', async () => {
    const { saveRankingSnapshot, listRankingHistory, listLatestRankings } = await import(
      '@/modules/ranking/ranking.repository'
    );
    await saveRankingSnapshot({ orgId, trackedProductId, keyword: 'fritadeira', provider: 'mercadolivre', posicao: 12, pagina: 1 });
    await saveRankingSnapshot({ orgId, trackedProductId, keyword: 'fritadeira', provider: 'mercadolivre', posicao: 8, pagina: 1 });
    await saveRankingSnapshot({ orgId, trackedProductId, keyword: 'fritadeira', provider: 'mercadolivre', posicao: null, pagina: null });

    const hist = await listRankingHistory(orgId, trackedProductId, 'fritadeira');
    expect(hist.map((h) => h.posicao)).toEqual([12, 8, null]);

    const latest = await listLatestRankings(orgId);
    const linha = latest.find((l) => l.keyword === 'fritadeira');
    expect(linha?.posicao).toBeNull(); // o mais recente
  });

  it('não vaza snapshots de outra org', async () => {
    const { listLatestRankings } = await import('@/modules/ranking/ranking.repository');
    expect(await listLatestRankings('00000000-0000-0000-0000-000000000000')).toEqual([]);
  });
```

Implementar `src/modules/ranking/ranking.repository.ts`:

```ts
import { and, asc, eq, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { rankingSnapshots, trackedProducts } from '@/db/schema';

export async function saveRankingSnapshot(input: {
  orgId: string;
  trackedProductId: string;
  keyword: string;
  provider: string;
  posicao: number | null;
  pagina: number | null;
}): Promise<void> {
  await db.insert(rankingSnapshots).values({
    org_id: input.orgId,
    tracked_product_id: input.trackedProductId,
    keyword: input.keyword.slice(0, 160),
    provider: input.provider,
    posicao: input.posicao,
    pagina: input.pagina,
  });
}

export async function listRankingHistory(
  orgId: string,
  trackedProductId: string,
  keyword: string,
  limit = 60,
) {
  return db
    .select({
      posicao: rankingSnapshots.posicao,
      pagina: rankingSnapshots.pagina,
      created_at: rankingSnapshots.created_at,
    })
    .from(rankingSnapshots)
    .where(
      and(
        eq(rankingSnapshots.org_id, orgId),
        eq(rankingSnapshots.tracked_product_id, trackedProductId),
        eq(rankingSnapshots.keyword, keyword),
      ),
    )
    .orderBy(asc(rankingSnapshots.created_at))
    .limit(limit);
}

export async function listLatestRankings(orgId: string) {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (rs.tracked_product_id, rs.keyword)
      rs.tracked_product_id AS "trackedProductId",
      tp.nome AS "nome",
      rs.keyword AS "keyword",
      rs.posicao AS "posicao",
      rs.pagina AS "pagina",
      rs.created_at AS "createdAt"
    FROM ranking_snapshots rs
    JOIN tracked_products tp ON tp.id = rs.tracked_product_id
    WHERE rs.org_id = ${orgId}
    ORDER BY rs.tracked_product_id, rs.keyword, rs.created_at DESC
  `);
  return rows as unknown as Array<{
    trackedProductId: string;
    nome: string;
    keyword: string;
    posicao: number | null;
    pagina: number | null;
    createdAt: Date;
  }>;
}
```

> `db.execute` com `sql` cru: conferir o helper equivalente já usado no repo (se `db.execute` não existir no client postgres-js, usar `db.select` + subquery ou o padrão que o repo já adota para `DISTINCT ON`). O importante é o contrato de retorno.

Run: `npm run test -- tests/integration/ranking-repository.test.ts` → PASS (2).

- [ ] **Step 4: Step gracioso + teste com mocks**

Criar `tests/unit/collect-ranking.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const searchMock = vi.fn();
const saveMock = vi.fn();

vi.mock('@/modules/market/ml-search', () => ({ searchMlItems: (...a: unknown[]) => searchMock(...a) }));
vi.mock('@/modules/ranking/ranking.repository', () => ({
  saveRankingSnapshot: (...a: unknown[]) => saveMock(...a),
}));
vi.mock('@/modules/tracked-products/tracked-product.repository', () => ({
  listTrackedProducts: vi.fn().mockResolvedValue([
    { id: 'tp-1', nome: 'Fritadeira Elétrica 4L', keywords: ['fritadeira eletrica'], ativo: true },
    { id: 'tp-2', nome: 'Inativo', keywords: ['x'], ativo: false },
  ]),
}));
vi.mock('@/modules/connections/connection.repository', () => ({
  getConnectionExternalAccountId: vi.fn().mockResolvedValue('777'),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

describe('collect-ranking', () => {
  it('consulta 2 páginas, salva a posição do seller e ignora produto inativo', async () => {
    searchMock.mockReset();
    saveMock.mockReset();
    searchMock
      .mockResolvedValueOnce([
        { id: 'MLB1', titulo: 'Outro', preco: 90, sellerId: '111' },
        { id: 'MLB2', titulo: 'Nossa fritadeira', preco: 100, sellerId: '777' },
      ])
      .mockResolvedValueOnce([]);

    const { collectRanking } = await import('@/modules/pipeline/steps/collect-ranking');
    const r = await collectRanking('org-1');

    expect(r.consultas).toBe(1); // 1 produto ativo × 1 keyword
    expect(saveMock).toHaveBeenCalledWith(
      expect.objectContaining({ trackedProductId: 'tp-1', keyword: 'fritadeira eletrica', posicao: 2, pagina: 1 }),
    );
  });

  it('é gracioso: erro na busca não lança e salva nada para aquela keyword', async () => {
    searchMock.mockReset();
    saveMock.mockReset();
    searchMock.mockRejectedValue(new Error('ml_busca_erro_500'));
    const { collectRanking } = await import('@/modules/pipeline/steps/collect-ranking');
    await expect(collectRanking('org-1')).resolves.toEqual({ consultas: 0 });
    expect(saveMock).not.toHaveBeenCalled();
  });
});
```

Run → FAIL. Criar `src/modules/pipeline/steps/collect-ranking.ts`:

```ts
import { logger } from '@/lib/logger';
import { pLimit } from '@/lib/p-limit';
import { getConnectionExternalAccountId } from '@/modules/connections/connection.repository';
import { searchMlItems } from '@/modules/market/ml-search';
import { encontrarPosicao } from '@/modules/ranking/match';
import { saveRankingSnapshot } from '@/modules/ranking/ranking.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';

const CONCORRENCIA = 4;
const TOP_N_PAGINAS = 2; // top 100 (2 × 50)

export async function collectRanking(orgId: string): Promise<{ consultas: number }> {
  let consultas = 0;
  try {
    const sellerId = await getConnectionExternalAccountId(orgId, 'mercadolivre');
    const produtos = (await listTrackedProducts(orgId)).filter((p) => p.ativo);

    const jobs: Array<() => Promise<void>> = [];
    for (const produto of produtos) {
      for (const keyword of produto.keywords.filter((k) => k.trim() !== '')) {
        jobs.push(async () => {
          try {
            const paginas = await Promise.all(
              Array.from({ length: TOP_N_PAGINAS }, (_, i) =>
                searchMlItems({ keyword, limit: 50, offset: i * 50 }),
              ),
            );
            const itens = paginas.flat();
            const hit = encontrarPosicao({ itens, sellerId, nomeProduto: produto.nome });
            await saveRankingSnapshot({
              orgId,
              trackedProductId: produto.id,
              keyword,
              provider: 'mercadolivre',
              posicao: hit?.posicao ?? null,
              pagina: hit?.pagina ?? null,
            });
            consultas++;
          } catch (err) {
            logger.warn('collect-ranking: keyword falhou', {
              orgId,
              keyword,
              erro: err instanceof Error ? err.message : String(err),
            });
          }
        });
      }
    }
    await pLimit(jobs, CONCORRENCIA);
  } catch (err) {
    logger.warn('collect-ranking: step falhou por inteiro', {
      orgId,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
  return { consultas };
}
```

> Assinatura real do `pLimit` da F0: re-validar (`rg -n "export" src/lib/p-limit.ts`) e adaptar a chamada (o contrato F0 é "helper próprio com limite de concorrência 6" — usar o formato real do helper).

No orquestrador, adicionar ao `Promise.allSettled` da fase de mercado (resultado ignorado além de log — o step nunca rejeita):

```ts
    const [ordersOutcome, marketOutcome] = await Promise.allSettled([
      collectOrders(orgId, periodo),
      collectMarket(orgId, reportId),
    ]);
    // steps graciosos de inteligência de mercado (nunca lançam; rodam após a coleta principal
    // para não competir com o rate limit da busca do ML usada pelo benchmark)
    await collectRanking(orgId);
```

Run: `npm run test -- tests/unit/collect-ranking.test.ts` → PASS (2). `npm run test && npm run typecheck` → verdes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ranking): ranking_snapshots + busca publica ML + matcher + step gracioso no pipeline"
```

---

### Task 8: Página `/mercado` + aba Ranqueamento (evolução de posição)

**Files:**
- Create: `src/app/(client)/mercado/page.tsx`, `src/app/(client)/mercado/tabs.tsx`, `src/app/(client)/mercado/ranking-chart.tsx`
- Modify: `src/components/app-shell.tsx` (item de nav "Mercado")
- Test: `tests/e2e/mercado.spec.ts`

**Interfaces:**
- Produces: rota `/mercado?aba=ranqueamento|concorrentes|catalogo` (default `ranqueamento`), gating `requireActiveOrg()`. Aba Ranqueamento: tabela dos últimos rankings (`listLatestRankings`) com posição/página/quando + seletor de produto/keyword (`?produto=<id>&keyword=<kw>`) que renderiza o histórico (`listRankingHistory`) num line chart com eixo Y INVERTIDO (posição 1 no topo). Abas Concorrentes/Catálogo entram nas Tasks 9 e 12 (placeholder de EmptyState até lá).
- Consumes: `listLatestRankings`, `listRankingHistory`, recharts (F1), `EmptyState` (F1).

- [ ] **Step 1: Tabs por URL**

Criar `src/app/(client)/mercado/tabs.tsx`:

```tsx
import Link from 'next/link';

const ABAS = [
  { id: 'ranqueamento', label: 'Ranqueamento' },
  { id: 'concorrentes', label: 'Concorrentes' },
  { id: 'catalogo', label: 'Qualidade de Catálogo' },
] as const;

export type AbaMercado = (typeof ABAS)[number]['id'];

export function abaAtiva(param: string | undefined): AbaMercado {
  const found = ABAS.find((a) => a.id === param);
  return found ? found.id : 'ranqueamento';
}

export function MercadoTabs({ ativa }: { ativa: AbaMercado }) {
  return (
    <nav className="mb-6 flex gap-2 border-b border-white/10" aria-label="Seções de mercado">
      {ABAS.map((aba) => (
        <Link
          key={aba.id}
          href={`/mercado?aba=${aba.id}`}
          data-testid={`aba-${aba.id}`}
          aria-current={ativa === aba.id ? 'page' : undefined}
          className={
            ativa === aba.id
              ? 'border-b-2 border-[#07dd2b] px-3 py-2 text-sm font-medium'
              : 'px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200'
          }
        >
          {aba.label}
        </Link>
      ))}
    </nav>
  );
}
```

> Decisão registrada: abas por URL (deep-link, server-rendered) em vez do `Tabs` client da F1 — cada aba busca dados próprios no servidor. Se o `Tabs` da F1 suportar modo controlado por URL, pode ser adotado na execução mantendo os testids.

- [ ] **Step 2: Chart de posição**

Criar `src/app/(client)/mercado/ranking-chart.tsx`:

```tsx
'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type PontoRanking = { data: string; posicao: number | null };

export function RankingChart({ pontos }: { pontos: PontoRanking[] }) {
  return (
    <div className="h-64 w-full" data-testid="ranking-chart">
      <ResponsiveContainer>
        <LineChart data={pontos} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="#ffffff0f" vertical={false} />
          <XAxis dataKey="data" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
          <YAxis
            reversed
            allowDecimals={false}
            domain={[1, 'dataMax']}
            tick={{ fill: '#a1a1aa', fontSize: 12 }}
            label={{ value: 'Posição', angle: -90, fill: '#a1a1aa', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{ background: '#0a0c10', border: '1px solid #ffffff0f', borderRadius: 8 }}
            formatter={(v: number) => [`#${v}`, 'Posição']}
          />
          <Line
            type="monotone"
            dataKey="posicao"
            stroke="#07dd2b"
            strokeWidth={2}
            dot={{ r: 3, fill: '#07dd2b' }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

> Se a F1 tiver exportado `charts/LineChart` com API compatível (eixo invertido configurável), usar o primitivo da F1 no lugar — manter o testid `ranking-chart`.

- [ ] **Step 3: Página**

Criar `src/app/(client)/mercado/page.tsx`:

```tsx
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { listLatestRankings, listRankingHistory } from '@/modules/ranking/ranking.repository';
import { abaAtiva, MercadoTabs } from './tabs';
import { RankingChart } from './ranking-chart';

export default async function MercadoPage({
  searchParams,
}: {
  searchParams: { aba?: string; produto?: string; keyword?: string };
}) {
  const access = await requireActiveOrg();
  const aba = abaAtiva(searchParams.aba);

  return (
    <main className="p-8">
      <h1 className="mb-4 text-xl font-semibold">Mercado</h1>
      <MercadoTabs ativa={aba} />
      {aba === 'ranqueamento' ? (
        <RankingSection
          orgId={access.orgId}
          produtoId={searchParams.produto}
          keyword={searchParams.keyword}
        />
      ) : null}
      {aba === 'concorrentes' ? <p data-testid="aba-vazia-concorrentes">Em breve.</p> : null}
      {aba === 'catalogo' ? <p data-testid="aba-vazia-catalogo">Em breve.</p> : null}
    </main>
  );
}

async function RankingSection({
  orgId,
  produtoId,
  keyword,
}: {
  orgId: string;
  produtoId?: string;
  keyword?: string;
}) {
  const rankings = await listLatestRankings(orgId);

  if (rankings.length === 0) {
    return (
      <p data-testid="ranking-vazio" className="text-zinc-400">
        Nenhum dado de ranqueamento ainda — os dados são coletados a cada relatório gerado.
      </p>
    );
  }

  const selecionado =
    rankings.find((r) => r.trackedProductId === produtoId && r.keyword === keyword) ?? rankings[0];
  const historico = await listRankingHistory(orgId, selecionado.trackedProductId, selecionado.keyword);
  const pontos = historico.map((h) => ({
    data: h.created_at.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    posicao: h.posicao,
  }));

  return (
    <section>
      <table className="mb-6 w-full text-sm" data-testid="ranking-tabela">
        <thead>
          <tr className="text-left text-zinc-400">
            <th className="py-2">Produto</th>
            <th>Palavra-chave</th>
            <th>Posição</th>
            <th>Página</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((r) => (
            <tr key={`${r.trackedProductId}-${r.keyword}`} className="border-t border-white/5">
              <td className="py-2">
                <a
                  href={`/mercado?aba=ranqueamento&produto=${r.trackedProductId}&keyword=${encodeURIComponent(r.keyword)}`}
                  className="underline-offset-2 hover:underline"
                >
                  {r.nome}
                </a>
              </td>
              <td>{r.keyword}</td>
              <td>{r.posicao === null ? 'fora do top 100' : `#${r.posicao}`}</td>
              <td>{r.pagina ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className="mb-2 font-medium">
        Evolução — {selecionado.nome} · “{selecionado.keyword}”
      </h2>
      <RankingChart pontos={pontos} />
    </section>
  );
}
```

Em `src/components/app-shell.tsx`, adicionar o item de navegação (seguir o formato do array de links existente): rótulo `Mercado`, href `/mercado`, entre Conexões e Relatórios (visível para role client/analista/admin conforme o padrão dos itens vizinhos).

- [ ] **Step 4: E2E + verificação**

Criar `tests/e2e/mercado.spec.ts`: login cliente ativo (helper existente) → `/mercado` → vê as 3 abas (`aba-ranqueamento`, `aba-concorrentes`, `aba-catalogo`) e o empty state `ranking-vazio` → navega para `?aba=concorrentes` e vê `aba-vazia-concorrentes`.

Run: `npm run test:e2e -- mercado` → PASS. `npm run test && npm run typecheck && npm run build` → verdes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(mercado): pagina /mercado com abas + monitor de ranqueamento com chart de posicao"
```

---

### Task 9: Radar de concorrentes — schema + CRUD + aba Concorrentes

**Files:**
- Create: `src/db/schema/competitors.ts`, `src/modules/competitors/referencia.ts`, `src/modules/competitors/competitor.repository.ts`, `src/actions/mercado.actions.ts`, `src/app/(client)/mercado/concorrentes-form.tsx`
- Modify: `src/db/schema/index.ts`, `src/app/(client)/mercado/page.tsx` (aba Concorrentes real)
- Generate: migration `00XX_competitors.sql`
- Test: `tests/unit/competitor-referencia.test.ts`, `tests/integration/competitor-repository.test.ts`, `tests/e2e/mercado.spec.ts` (estender)

**Interfaces:**
- Produces:
  - Tabela `competitors`: `id` uuid pk; `org_id` uuid notNull FK; `nome` varchar(120) notNull; `referencia` varchar(255) notNull (seller_id numérico OU URL/código de anúncio MLB); `provider` varchar(32) notNull default `'mercadolivre'`; `ativo` boolean notNull default true; `created_at`/`updated_at`. Index `(org_id)`.
  - `referencia.ts` (puro): `type ReferenciaConcorrente = { tipo: 'seller'; sellerId: string } | { tipo: 'item'; itemId: string }`; `parseReferencia(ref: string): ReferenciaConcorrente | null` — dígitos puros → seller; contém `MLB` + dígitos (com ou sem hífen, inclusive dentro de URL de produto) → item `MLB<digitos>`; senão null.
  - `competitor.repository.ts`: `COMPETITOR_LIMIT = 10`; `listCompetitors(orgId)`; `addCompetitor(input: { orgId: string; nome: string; referencia: string; provider: string }): Promise<void>` (valida `parseReferencia` → `Error('referencia_invalida')`; conta ativos+inativos → `Error('limite_concorrentes')`); `toggleCompetitor({ orgId, id, ativo })`; `removeCompetitor({ orgId, id })`. Todas filtram por `org_id`.
  - `mercado.actions.ts`: `addCompetitorAction`, `toggleCompetitorAction`, `removeCompetitorAction` (Server Actions `(prev, formData)` com `requireActiveOrg` + `revalidatePath('/mercado')`); `type MercadoState = { error?: string; ok?: boolean }`.
  - Aba Concorrentes: lista (nome, referência, ativo, último preço se houver) + form de adicionar + remover/pausar. Testids: `concorrente-form`, `concorrente-linha-{id}`.

- [ ] **Step 1: Teste do parser de referência (falha primeiro)**

Criar `tests/unit/competitor-referencia.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { parseReferencia } from '@/modules/competitors/referencia';

describe('parseReferencia', () => {
  it('dígitos puros = seller_id', () => {
    expect(parseReferencia('123456789')).toEqual({ tipo: 'seller', sellerId: '123456789' });
    expect(parseReferencia('  987654 ')).toEqual({ tipo: 'seller', sellerId: '987654' });
  });

  it('código ou URL de anúncio = item MLB', () => {
    expect(parseReferencia('MLB1234567890')).toEqual({ tipo: 'item', itemId: 'MLB1234567890' });
    expect(parseReferencia('MLB-1234567890')).toEqual({ tipo: 'item', itemId: 'MLB1234567890' });
    expect(
      parseReferencia('https://produto.mercadolivre.com.br/MLB-1234567890-fritadeira-4l-_JM'),
    ).toEqual({ tipo: 'item', itemId: 'MLB1234567890' });
  });

  it('inválido = null', () => {
    expect(parseReferencia('loja do joao')).toBeNull();
    expect(parseReferencia('')).toBeNull();
    expect(parseReferencia('https://mercadolivre.com.br/loja/x')).toBeNull();
  });
});
```

Run → FAIL. Implementar `src/modules/competitors/referencia.ts`:

```ts
export type ReferenciaConcorrente =
  | { tipo: 'seller'; sellerId: string }
  | { tipo: 'item'; itemId: string };

export function parseReferencia(ref: string): ReferenciaConcorrente | null {
  const limpo = ref.trim();
  if (limpo === '') return null;
  if (/^\d+$/.test(limpo)) {
    return { tipo: 'seller', sellerId: limpo };
  }
  const m = limpo.match(/MLB-?(\d{6,})/i);
  if (m) {
    return { tipo: 'item', itemId: `MLB${m[1]}` };
  }
  return null;
}
```

Run: `npm run test -- tests/unit/competitor-referencia.test.ts` → PASS (3).

- [ ] **Step 2: Schema + migration**

Criar `src/db/schema/competitors.ts`:

```ts
import { boolean, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const competitors = pgTable(
  'competitors',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    nome: varchar('nome', { length: 120 }).notNull(),
    referencia: varchar('referencia', { length: 255 }).notNull(),
    provider: varchar('provider', { length: 32 }).notNull().default('mercadolivre'),
    ativo: boolean('ativo').notNull().default(true),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_idx: index('competitors_org_idx').on(t.org_id),
  }),
);

export type CompetitorRecord = typeof competitors.$inferSelect;
export type NewCompetitorRecord = typeof competitors.$inferInsert;
```

Exportar no barrel. `npm run db:generate` → inspecionar → aplicar em main e test.

- [ ] **Step 3: Repository (teste de integração primeiro)**

Criar `tests/integration/competitor-repository.test.ts` (padrão `skipIf`, org `ta-test-cp-${RUN}`, cleanup):

```ts
  it('adiciona, lista por org e respeita o limite de 10', async () => {
    const { addCompetitor, listCompetitors, COMPETITOR_LIMIT } = await import(
      '@/modules/competitors/competitor.repository'
    );
    for (let i = 0; i < COMPETITOR_LIMIT; i++) {
      await addCompetitor({ orgId, nome: `Rival ${i}`, referencia: `10000${i}`, provider: 'mercadolivre' });
    }
    expect((await listCompetitors(orgId)).length).toBe(10);
    await expect(
      addCompetitor({ orgId, nome: 'Excedente', referencia: '999999', provider: 'mercadolivre' }),
    ).rejects.toThrow('limite_concorrentes');
  });

  it('rejeita referência inválida e isola por org', async () => {
    const { addCompetitor, listCompetitors } = await import(
      '@/modules/competitors/competitor.repository'
    );
    await expect(
      addCompetitor({ orgId, nome: 'X', referencia: 'sem sentido', provider: 'mercadolivre' }),
    ).rejects.toThrow('referencia_invalida');
    expect(await listCompetitors('00000000-0000-0000-0000-000000000000')).toEqual([]);
  });

  it('toggle e remove afetam só a linha da org', async () => {
    const { listCompetitors, removeCompetitor, toggleCompetitor } = await import(
      '@/modules/competitors/competitor.repository'
    );
    const [c] = await listCompetitors(orgId);
    await toggleCompetitor({ orgId, id: c.id, ativo: false });
    expect((await listCompetitors(orgId)).find((x) => x.id === c.id)?.ativo).toBe(false);
    await removeCompetitor({ orgId, id: c.id });
    expect((await listCompetitors(orgId)).find((x) => x.id === c.id)).toBeUndefined();
  });
```

Run → FAIL. Implementar `src/modules/competitors/competitor.repository.ts`:

```ts
import { and, count, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { competitors } from '@/db/schema';
import { parseReferencia } from '@/modules/competitors/referencia';

export const COMPETITOR_LIMIT = 10;

export async function listCompetitors(orgId: string) {
  return db
    .select()
    .from(competitors)
    .where(eq(competitors.org_id, orgId))
    .orderBy(competitors.created_at);
}

export async function addCompetitor(input: {
  orgId: string;
  nome: string;
  referencia: string;
  provider: string;
}): Promise<void> {
  if (parseReferencia(input.referencia) === null) {
    throw new Error('referencia_invalida');
  }
  const [{ n }] = await db
    .select({ n: count() })
    .from(competitors)
    .where(eq(competitors.org_id, input.orgId));
  if (n >= COMPETITOR_LIMIT) {
    throw new Error('limite_concorrentes');
  }
  await db.insert(competitors).values({
    org_id: input.orgId,
    nome: input.nome,
    referencia: input.referencia.trim(),
    provider: input.provider,
  });
}

export async function toggleCompetitor(input: {
  orgId: string;
  id: string;
  ativo: boolean;
}): Promise<void> {
  await db
    .update(competitors)
    .set({ ativo: input.ativo })
    .where(and(eq(competitors.id, input.id), eq(competitors.org_id, input.orgId)));
}

export async function removeCompetitor(input: { orgId: string; id: string }): Promise<void> {
  await db
    .delete(competitors)
    .where(and(eq(competitors.id, input.id), eq(competitors.org_id, input.orgId)));
}
```

Run: `npm run test -- tests/integration/competitor-repository.test.ts` → PASS (3).

- [ ] **Step 4: Actions + UI da aba**

Criar `src/actions/mercado.actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import {
  addCompetitor,
  removeCompetitor,
  toggleCompetitor,
} from '@/modules/competitors/competitor.repository';

export type MercadoState = { error?: string; ok?: boolean };

export async function addCompetitorAction(
  _prev: MercadoState,
  formData: FormData,
): Promise<MercadoState> {
  const access = await requireActiveOrg();
  const nome = String(formData.get('nome') ?? '').trim();
  const referencia = String(formData.get('referencia') ?? '').trim();
  if (nome.length < 2) return { error: 'Informe o nome do concorrente.' };

  try {
    await addCompetitor({ orgId: access.orgId, nome, referencia, provider: 'mercadolivre' });
  } catch (e) {
    if (e instanceof Error && e.message === 'referencia_invalida') {
      return { error: 'Referência inválida — informe o seller ID (números) ou a URL do anúncio.' };
    }
    if (e instanceof Error && e.message === 'limite_concorrentes') {
      return { error: 'Limite de 10 concorrentes atingido.' };
    }
    throw e;
  }
  revalidatePath('/mercado');
  return { ok: true };
}

export async function toggleCompetitorAction(
  _prev: MercadoState,
  formData: FormData,
): Promise<MercadoState> {
  const access = await requireActiveOrg();
  const id = String(formData.get('id') ?? '');
  const ativo = String(formData.get('ativo') ?? '') === 'true';
  if (!id) return { error: 'Concorrente inválido.' };
  await toggleCompetitor({ orgId: access.orgId, id, ativo });
  revalidatePath('/mercado');
  return { ok: true };
}

export async function removeCompetitorAction(
  _prev: MercadoState,
  formData: FormData,
): Promise<MercadoState> {
  const access = await requireActiveOrg();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Concorrente inválido.' };
  await removeCompetitor({ orgId: access.orgId, id });
  revalidatePath('/mercado');
  return { ok: true };
}
```

Criar `src/app/(client)/mercado/concorrentes-form.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import {
  addCompetitorAction,
  removeCompetitorAction,
  toggleCompetitorAction,
  type MercadoState,
} from '@/actions/mercado.actions';

const initial: MercadoState = {};

export type ConcorrenteItem = {
  id: string;
  nome: string;
  referencia: string;
  ativo: boolean;
};

export function ConcorrentesForm({ concorrentes }: { concorrentes: ConcorrenteItem[] }) {
  const [addState, add] = useFormState(addCompetitorAction, initial);
  const [, toggle] = useFormState(toggleCompetitorAction, initial);
  const [, remove] = useFormState(removeCompetitorAction, initial);

  return (
    <div>
      <form action={add} className="mb-4 flex flex-wrap gap-2" data-testid="concorrente-form">
        <input name="nome" placeholder="Nome do concorrente" className="border bg-transparent p-1" />
        <input
          name="referencia"
          placeholder="Seller ID ou URL do anúncio"
          className="border bg-transparent p-1"
        />
        <button type="submit" className="bg-white/10 px-3 py-1">Adicionar</button>
      </form>
      {addState.error ? (
        <p role="alert" className="mb-2 text-sm text-red-500">{addState.error}</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {concorrentes.map((c) => (
          <li
            key={c.id}
            data-testid={`concorrente-linha-${c.id}`}
            className="flex items-center gap-3 border-b border-white/5 pb-2"
          >
            <span className={c.ativo ? '' : 'text-zinc-500 line-through'}>
              {c.nome} <span className="text-xs text-zinc-500">({c.referencia})</span>
            </span>
            <form action={toggle}>
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="ativo" value={String(!c.ativo)} />
              <button type="submit" className="border px-2 text-xs">
                {c.ativo ? 'Pausar' : 'Reativar'}
              </button>
            </form>
            <form action={remove}>
              <input type="hidden" name="id" value={c.id} />
              <button type="submit" className="border px-2 text-xs">Remover</button>
            </form>
          </li>
        ))}
        {concorrentes.length === 0 ? (
          <li className="text-zinc-400" data-testid="concorrentes-vazio">
            Nenhum concorrente monitorado — adicione até 10.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
```

Em `src/app/(client)/mercado/page.tsx`, trocar o placeholder da aba:

```tsx
      {aba === 'concorrentes' ? <ConcorrentesSection orgId={access.orgId} /> : null}
// ...
async function ConcorrentesSection({ orgId }: { orgId: string }) {
  const { listCompetitors } = await import('@/modules/competitors/competitor.repository');
  const lista = await listCompetitors(orgId);
  return (
    <ConcorrentesForm
      concorrentes={lista.map((c) => ({
        id: c.id,
        nome: c.nome,
        referencia: c.referencia,
        ativo: c.ativo,
      }))}
    />
  );
}
```

(import estático de `ConcorrentesForm`; o import do repository pode ser estático também — o dinâmico acima é só para deixar explícito o boundary server.)

- [ ] **Step 5: E2E + verificação**

Estender `tests/e2e/mercado.spec.ts`: `?aba=concorrentes` → vê `concorrentes-vazio` → adiciona concorrente (nome "Rival", referência "123456") → vê a linha → remove → vazio de novo. Referência inválida ("loja x") → vê o erro em `role=alert`.

Run: `npm run test:e2e -- mercado` → PASS. `npm run test && npm run typecheck` → verdes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(concorrentes): tabela competitors + CRUD com limite 10 + aba na pagina /mercado"
```

---

### Task 10: Coleta de preços de concorrentes + `Metricas.concorrentes` + prompt IA

**Files:**
- Create: `src/modules/pipeline/steps/collect-competitors.ts`, `src/modules/competitors/resumo.ts`
- Modify: `src/modules/market/market.types.ts` (fonte `'concorrente'`), `src/modules/market/ml-search.ts` (já suporta `sellerId`), `src/modules/pipeline/contracts.ts`, `src/modules/pipeline/steps/compute-metrics.ts`, `src/modules/pipeline/steps/analyze-ia.ts`, `src/modules/pipeline/orchestrator.ts`
- Generate: migration `00XX_market_snapshots_fonte_concorrente.sql` (só o CHECK)
- Test: `tests/unit/collect-competitors.test.ts`, `tests/unit/resumo-concorrentes.test.ts`

**Interfaces:**
- Produces:
  - `collectCompetitors(orgId: string, reportId: string): Promise<{ coletados: number }>` — GRACIOSO: para cada concorrente ATIVO: `parseReferencia` → seller: `searchMlItems({ sellerId, limit: 20 })` → precos; item: `GET {ML_API_BASE}/items/{id}` → `[price]`. Insere em `market_snapshots` com `fonte='concorrente'`, `keyword=nome do concorrente` e `dados = { precos, concorrente: { id, nome, referencia, provider } }` (SEM payload bruto — segue F0). **Contrato p/ F3a:** o gatilho `concorrente_preco` lê o último snapshot `fonte='concorrente'` por concorrente e compara `min(dados.precos)` com o preço do cliente.
  - `resumo.ts` (puro): `resumirConcorrentes(snapshots: Array<{ keyword: string; dados: unknown }>): Array<{ nome: string; menorPreco: number; precoMediano: number }>` — ignora snapshots sem preços; mediana simples.
  - `contracts.ts`: `MetricasSchema` ganha `concorrentes: z.array(z.object({ nome: z.string(), menorPreco: z.number(), precoMediano: z.number() }).strict()).optional()` (opcional = relatórios antigos continuam validando).
  - `market.types.ts`: `export type FonteSnapshot = 'serpapi' | 'ml_publico' | 'concorrente';` (o `MarketProvider.fonte` continua restrito a serpapi/ml_publico — concorrente não é um `MarketProvider`, é inserção direta).
  - Prompt IA: item novo na lista numerada do system prompt instruindo a comparação nominal com concorrentes quando `concorrentes` presente.

- [ ] **Step 1: Migration do CHECK de fonte**

Gerar migration vazia (`npm run db:generate` sem mudança de schema não gera — criar o arquivo manualmente seguindo a numeração + journal) com:

```sql
ALTER TABLE "market_snapshots" DROP CONSTRAINT IF EXISTS "market_snapshots_fonte_check";
--> statement-breakpoint
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_fonte_check" CHECK (fonte IN ('serpapi','ml_publico','concorrente'));
```

> Nome real do CHECK criado na F0: conferir (`rg -n "fonte" drizzle/`). Se a F0 não criou CHECK de fonte, criar com este nome. Aplicar em main e test.

- [ ] **Step 2: Testes (falham primeiro)**

Criar `tests/unit/resumo-concorrentes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { resumirConcorrentes } from '@/modules/competitors/resumo';

describe('resumirConcorrentes', () => {
  it('calcula menor preço e mediana por concorrente, ignorando snapshots vazios', () => {
    const out = resumirConcorrentes([
      { keyword: 'Rival A', dados: { precos: [90, 110, 100], concorrente: { nome: 'Rival A' } } },
      { keyword: 'Rival B', dados: { precos: [], concorrente: { nome: 'Rival B' } } },
      { keyword: 'Rival C', dados: { precos: [200], concorrente: { nome: 'Rival C' } } },
      { keyword: 'Quebrado', dados: { qualquer: true } },
    ]);
    expect(out).toEqual([
      { nome: 'Rival A', menorPreco: 90, precoMediano: 100 },
      { nome: 'Rival C', menorPreco: 200, precoMediano: 200 },
    ]);
  });

  it('mediana de quantidade par = média dos centrais', () => {
    const out = resumirConcorrentes([
      { keyword: 'R', dados: { precos: [10, 20, 30, 40], concorrente: { nome: 'R' } } },
    ]);
    expect(out[0].precoMediano).toBe(25);
  });
});
```

Criar `tests/unit/collect-competitors.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const searchMock = vi.fn();
const insertValuesMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/env', () => ({ serverEnv: { ML_API_BASE: 'https://api.mercadolibre.com' } }));
vi.mock('@/modules/market/ml-search', () => ({ searchMlItems: (...a: unknown[]) => searchMock(...a) }));
vi.mock('@/modules/competitors/competitor.repository', () => ({
  listCompetitors: vi.fn().mockResolvedValue([
    { id: 'c1', nome: 'Rival A', referencia: '777', provider: 'mercadolivre', ativo: true },
    { id: 'c2', nome: 'Rival B', referencia: 'MLB-123456789', provider: 'mercadolivre', ativo: true },
    { id: 'c3', nome: 'Pausado', referencia: '888', provider: 'mercadolivre', ativo: false },
  ]),
}));
vi.mock('@/db/client', () => ({
  db: { insert: vi.fn(() => ({ values: insertValuesMock })) },
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

describe('collect-competitors', () => {
  it('coleta seller via busca e item via /items, só ativos, e snapshota fonte=concorrente', async () => {
    searchMock.mockResolvedValue([
      { id: 'MLB1', titulo: 'x', preco: 90, sellerId: '777' },
      { id: 'MLB2', titulo: 'y', preco: 110, sellerId: '777' },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'MLB123456789', price: 150 }), { status: 200 })),
    );

    const { collectCompetitors } = await import('@/modules/pipeline/steps/collect-competitors');
    const r = await collectCompetitors('org-1', 'rep-1');

    expect(r.coletados).toBe(2); // c3 pausado fica de fora
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org_id: 'org-1',
        report_id: 'rep-1',
        fonte: 'concorrente',
        keyword: 'Rival A',
        dados: expect.objectContaining({ precos: [90, 110] }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it('é gracioso: erro em um concorrente não derruba o step', async () => {
    insertValuesMock.mockClear();
    searchMock.mockRejectedValue(new Error('ml_busca_erro_500'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })));
    const { collectCompetitors } = await import('@/modules/pipeline/steps/collect-competitors');
    await expect(collectCompetitors('org-1', 'rep-1')).resolves.toEqual({ coletados: 0 });
    vi.unstubAllGlobals();
  });
});
```

Run → FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar resumo + step**

Criar `src/modules/competitors/resumo.ts`:

```ts
type SnapshotConcorrente = { keyword: string; dados: unknown };

export type ResumoConcorrente = { nome: string; menorPreco: number; precoMediano: number };

function mediana(valores: number[]): number {
  const s = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[meio - 1] + s[meio]) / 2 : s[meio];
}

export function resumirConcorrentes(snapshots: SnapshotConcorrente[]): ResumoConcorrente[] {
  const out: ResumoConcorrente[] = [];
  for (const snap of snapshots) {
    const dados = snap.dados as { precos?: unknown; concorrente?: { nome?: unknown } } | null;
    const precos = Array.isArray(dados?.precos)
      ? dados.precos.filter((p): p is number => typeof p === 'number' && p > 0)
      : [];
    if (precos.length === 0) continue;
    const nome =
      typeof dados?.concorrente?.nome === 'string' ? dados.concorrente.nome : snap.keyword;
    out.push({ nome, menorPreco: Math.min(...precos), precoMediano: mediana(precos) });
  }
  return out;
}
```

Criar `src/modules/pipeline/steps/collect-competitors.ts`:

```ts
import { db } from '@/db/client';
import { marketSnapshots } from '@/db/schema';
import { logger } from '@/lib/logger';
import { serverEnv } from '@/lib/env';
import { listCompetitors } from '@/modules/competitors/competitor.repository';
import { parseReferencia } from '@/modules/competitors/referencia';
import { searchMlItems } from '@/modules/market/ml-search';

async function precosDoConcorrente(referencia: string): Promise<number[]> {
  const ref = parseReferencia(referencia);
  if (!ref) return [];
  if (ref.tipo === 'seller') {
    const itens = await searchMlItems({ sellerId: ref.sellerId, limit: 20 });
    return itens.map((i) => i.preco).filter((p): p is number => p !== null);
  }
  const res = await fetch(`${serverEnv.ML_API_BASE}/items/${ref.itemId}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`ml_item_erro_${res.status}`);
  const body = (await res.json()) as { price?: number | null };
  return typeof body.price === 'number' && body.price > 0 ? [body.price] : [];
}

export async function collectCompetitors(
  orgId: string,
  reportId: string,
): Promise<{ coletados: number }> {
  let coletados = 0;
  try {
    const ativos = (await listCompetitors(orgId)).filter((c) => c.ativo);
    for (const c of ativos) {
      try {
        const precos = await precosDoConcorrente(c.referencia);
        await db.insert(marketSnapshots).values({
          org_id: orgId,
          report_id: reportId,
          fonte: 'concorrente',
          keyword: c.nome.slice(0, 160),
          dados: {
            precos,
            concorrente: { id: c.id, nome: c.nome, referencia: c.referencia, provider: c.provider },
          },
        });
        coletados++;
      } catch (err) {
        logger.warn('collect-competitors: concorrente falhou', {
          orgId,
          concorrente: c.nome,
          erro: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    logger.warn('collect-competitors: step falhou por inteiro', {
      orgId,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
  return { coletados };
}
```

Em `src/modules/market/market.types.ts`, adicionar:

```ts
export type FonteSnapshot = 'serpapi' | 'ml_publico' | 'concorrente';
```

Run: `npm run test -- tests/unit/collect-competitors.test.ts tests/unit/resumo-concorrentes.test.ts` → PASS (4).

- [ ] **Step 4: Contrato Metricas + computeMetrics + prompt + orquestrador**

Em `src/modules/pipeline/contracts.ts`, dentro do objeto de `MetricasSchema` (antes de `benchmarkParcial`):

```ts
    concorrentes: z
      .array(
        z
          .object({
            nome: z.string(),
            menorPreco: z.number(),
            precoMediano: z.number(),
          })
          .strict(),
      )
      .optional(),
```

Em `src/modules/pipeline/steps/compute-metrics.ts`: onde as métricas são montadas (re-validar o shape pós-F0), buscar os snapshots de concorrente do relatório e anexar:

```ts
import { and, eq } from 'drizzle-orm';
import { marketSnapshots } from '@/db/schema';
import { resumirConcorrentes } from '@/modules/competitors/resumo';
// ... dentro de computeMetrics, antes do return/validação final:
  const snapshotsConcorrentes = await db
    .select({ keyword: marketSnapshots.keyword, dados: marketSnapshots.dados })
    .from(marketSnapshots)
    .where(and(eq(marketSnapshots.report_id, reportId), eq(marketSnapshots.fonte, 'concorrente')));
  const concorrentes = resumirConcorrentes(snapshotsConcorrentes);
// ... e no objeto retornado/validado:
    ...(concorrentes.length > 0 ? { concorrentes } : {}),
```

Em `src/modules/pipeline/steps/analyze-ia.ts`, no `buildSystemPrompt`, acrescentar o item 6 à lista numerada (mantendo o restante intacto):

```
6. Se as métricas incluírem "concorrentes" (radar de concorrentes nomeados pelo cliente), compare EXPLICITAMENTE os preços do cliente com o menorPreco/precoMediano de cada concorrente citado pelo nome, e incorpore isso nas recomendacoesPreco quando relevante. Nunca invente concorrentes que não estejam na lista.
```

No orquestrador, adicionar após `collectRanking` (mesma região graciosa):

```ts
    await collectCompetitors(orgId, reportId);
```

- [ ] **Step 5: Verificação**

Run: `npm run test && npm run typecheck` → suíte verde (atenção aos testes existentes de `compute-metrics` — o campo novo é opcional e só aparece quando há snapshots de concorrente; nenhum assert antigo deve quebrar).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(concorrentes): coleta de precos no pipeline (fonte=concorrente) + Metricas.concorrentes + prompt IA"
```

---

### Task 11: Qualidade de Catálogo — `scoreCatalogo` + client Bling `/produtos` + tabela + step

**Files:**
- Create: `src/modules/catalog/score.ts`, `src/modules/catalog/catalog.repository.ts`, `src/modules/providers/bling/products.ts`, `src/db/schema/catalog-scores.ts`, `src/modules/pipeline/steps/collect-catalog.ts`
- Modify: `src/db/schema/index.ts`, `src/modules/pipeline/orchestrator.ts`
- Generate: migration `00XX_catalog_scores.sql`
- Test: `tests/unit/catalog-score.test.ts`, `tests/unit/bling-products.test.ts`, `tests/unit/collect-catalog.test.ts`, `tests/integration/catalog-repository.test.ts`

**Interfaces:**
- Produces:
  - `score.ts` (puro): `type ProdutoCatalogo = { nome: string; gtin: string | null; descricao: string | null; numFotos: number; marca: string | null; unidade: string | null }`; `type FatorCatalogo = { fator: 'titulo' | 'ean' | 'fotos' | 'descricao' | 'atributos'; ok: boolean; detalhe: string }`; `scoreCatalogo(p: ProdutoCatalogo): { score: number; fatores: FatorCatalogo[] }` — 5 fatores × 20 pontos: título 20–60 chars; EAN/GTIN preenchido; ≥3 fotos; descrição (sem HTML) ≥300 chars; atributos (marca E unidade preenchidos).
  - `bling/products.ts`: `fetchProdutoBySku(orgId: string, sku: string): Promise<ProdutoCatalogo | null>` — `GET {BLING_API_BASE}/produtos?codigo={sku}&pagina=1&limite=1` (Bearer via `getValidAccessToken(orgId, 'bling')`) → se vazio, `null`; senão `GET {BLING_API_BASE}/produtos/{id}` e mapeia. **Campos confirmados na API v3 do Bling** (developer.bling.com.br/referencia, espelhados no SDK bling-erp-api-js): `nome`, `codigo`, `gtin`, `descricaoCurta` (descrição principal, HTML), `descricaoComplementar`, `marca`, `unidade`, `midia.imagens.internas[]`/`midia.imagens.externas[]`. `numFotos = internas.length + externas.length`. Erro de rede/HTTP → `Error('bling_indisponivel')`.
  - Tabela `catalog_scores`: `id` uuid pk; `org_id` uuid notNull FK; `tracked_product_id` uuid notNull FK; `score` integer notNull; `fatores` jsonb notNull; `created_at` timestamptz notNull. Index `(org_id, tracked_product_id, created_at)`.
  - `catalog.repository.ts`: `saveCatalogScore(input: { orgId: string; trackedProductId: string; score: number; fatores: FatorCatalogo[] }): Promise<void>`; `listLatestCatalogScores(orgId: string): Promise<Array<{ trackedProductId: string; nome: string; sku: string | null; score: number; fatores: FatorCatalogo[]; createdAt: Date }>>` (último por produto, `DISTINCT ON`).
  - `collect-catalog.ts`: `collectCatalog(orgId: string): Promise<{ avaliados: number }>` — GRACIOSO: se Bling não conectado, retorna `{ avaliados: 0 }`; para cada tracked product ATIVO com `sku`, busca no Bling, calcula score, persiste (concorrência p-limit 4; produto sem sku ou não encontrado = pulado com log).

- [ ] **Step 1: Teste do score puro (falha primeiro)**

Criar `tests/unit/catalog-score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { scoreCatalogo, type ProdutoCatalogo } from '@/modules/catalog/score';

const completo: ProdutoCatalogo = {
  nome: 'Fritadeira Elétrica Air Fryer 4L 220V Preta', // 43 chars
  gtin: '7891234567890',
  descricao: `<p>${'Descrição rica em detalhes. '.repeat(15)}</p>`, // >300 sem HTML
  numFotos: 5,
  marca: 'Mondial',
  unidade: 'UN',
};

describe('scoreCatalogo', () => {
  it('produto completo = 100, todos os fatores ok', () => {
    const r = scoreCatalogo(completo);
    expect(r.score).toBe(100);
    expect(r.fatores).toHaveLength(5);
    expect(r.fatores.every((f) => f.ok)).toBe(true);
  });

  it('título curto e sem EAN = 60, fatores reprovados com detalhe', () => {
    const r = scoreCatalogo({ ...completo, nome: 'Fritadeira', gtin: null });
    expect(r.score).toBe(60);
    const titulo = r.fatores.find((f) => f.fator === 'titulo');
    expect(titulo?.ok).toBe(false);
    expect(titulo?.detalhe).toContain('20');
    expect(r.fatores.find((f) => f.fator === 'ean')?.ok).toBe(false);
  });

  it('descrição conta SEM tags HTML; fotos <3 e atributos incompletos reprovam', () => {
    const r = scoreCatalogo({
      ...completo,
      descricao: `<p>${'a'.repeat(299)}</p>`,
      numFotos: 2,
      marca: null,
    });
    expect(r.fatores.find((f) => f.fator === 'descricao')?.ok).toBe(false);
    expect(r.fatores.find((f) => f.fator === 'fotos')?.ok).toBe(false);
    expect(r.fatores.find((f) => f.fator === 'atributos')?.ok).toBe(false);
    expect(r.score).toBe(40);
  });

  it('título com 61+ chars também reprova (limite 20-60)', () => {
    const r = scoreCatalogo({ ...completo, nome: 'x'.repeat(61) });
    expect(r.fatores.find((f) => f.fator === 'titulo')?.ok).toBe(false);
  });
});
```

Run → FAIL. Implementar `src/modules/catalog/score.ts`:

```ts
export type ProdutoCatalogo = {
  nome: string;
  gtin: string | null;
  descricao: string | null;
  numFotos: number;
  marca: string | null;
  unidade: string | null;
};

export type FatorCatalogo = {
  fator: 'titulo' | 'ean' | 'fotos' | 'descricao' | 'atributos';
  ok: boolean;
  detalhe: string;
};

const PESO = 20;
const TITULO_MIN = 20;
const TITULO_MAX = 60;
const FOTOS_MIN = 3;
const DESCRICAO_MIN = 300;

function semHtml(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function preenchido(s: string | null): boolean {
  return typeof s === 'string' && s.trim() !== '';
}

export function scoreCatalogo(p: ProdutoCatalogo): { score: number; fatores: FatorCatalogo[] } {
  const tituloLen = p.nome.trim().length;
  const descricaoLen = p.descricao ? semHtml(p.descricao).length : 0;

  const fatores: FatorCatalogo[] = [
    {
      fator: 'titulo',
      ok: tituloLen >= TITULO_MIN && tituloLen <= TITULO_MAX,
      detalhe: `Título com ${tituloLen} caracteres (ideal: ${TITULO_MIN}-${TITULO_MAX}).`,
    },
    {
      fator: 'ean',
      ok: preenchido(p.gtin),
      detalhe: preenchido(p.gtin) ? 'EAN/GTIN cadastrado.' : 'Sem EAN/GTIN — prejudica o catálogo dos marketplaces.',
    },
    {
      fator: 'fotos',
      ok: p.numFotos >= FOTOS_MIN,
      detalhe: `${p.numFotos} foto(s) (mínimo recomendado: ${FOTOS_MIN}).`,
    },
    {
      fator: 'descricao',
      ok: descricaoLen >= DESCRICAO_MIN,
      detalhe: `Descrição com ${descricaoLen} caracteres úteis (mínimo recomendado: ${DESCRICAO_MIN}).`,
    },
    {
      fator: 'atributos',
      ok: preenchido(p.marca) && preenchido(p.unidade),
      detalhe:
        preenchido(p.marca) && preenchido(p.unidade)
          ? 'Marca e unidade preenchidas.'
          : `Atributos incompletos: ${[!preenchido(p.marca) && 'marca', !preenchido(p.unidade) && 'unidade'].filter(Boolean).join(', ')}.`,
    },
  ];

  const score = fatores.filter((f) => f.ok).length * PESO;
  return { score, fatores };
}
```

Run: `npm run test -- tests/unit/catalog-score.test.ts` → PASS (4).

- [ ] **Step 2: Client Bling `/produtos` (teste primeiro)**

Criar `tests/unit/bling-products.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/env', () => ({
  serverEnv: { BLING_API_BASE: 'https://www.bling.com.br/Api/v3' },
}));
vi.mock('@/modules/connections/connection.repository', () => ({
  getValidAccessToken: vi.fn().mockResolvedValue('bling-token'),
}));

describe('bling/products fetchProdutoBySku', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('busca por codigo, pega o detalhe e mapeia ProdutoCatalogo', async () => {
    const lista = { data: [{ id: 111, nome: 'Fritadeira', codigo: 'SKU-1' }] };
    const detalhe = {
      data: {
        id: 111,
        nome: 'Fritadeira Elétrica 4L',
        codigo: 'SKU-1',
        gtin: '7891234567890',
        descricaoCurta: '<p>desc</p>',
        marca: 'Mondial',
        unidade: 'UN',
        midia: { imagens: { internas: [{ linkMiniatura: 'a' }, { linkMiniatura: 'b' }], externas: [{ link: 'c' }] } },
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(lista), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(detalhe), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchProdutoBySku } = await import('@/modules/providers/bling/products');
    const p = await fetchProdutoBySku('org-1', 'SKU-1');

    expect(p).toEqual({
      nome: 'Fritadeira Elétrica 4L',
      gtin: '7891234567890',
      descricao: '<p>desc</p>',
      numFotos: 3,
      marca: 'Mondial',
      unidade: 'UN',
    });
    const url1 = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url1.pathname.endsWith('/produtos')).toBe(true);
    expect(url1.searchParams.get('codigo')).toBe('SKU-1');
    expect(String(fetchMock.mock.calls[1][0])).toContain('/produtos/111');
  });

  it('sku não encontrado = null; não-2xx = bling_indisponivel', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchProdutoBySku } = await import('@/modules/providers/bling/products');
    expect(await fetchProdutoBySku('org-1', 'NAO-EXISTE')).toBeNull();
    await expect(fetchProdutoBySku('org-1', 'SKU-2')).rejects.toThrow('bling_indisponivel');
  });
});
```

Run → FAIL. Implementar `src/modules/providers/bling/products.ts`:

```ts
import { serverEnv } from '@/lib/env';
import { getValidAccessToken } from '@/modules/connections/connection.repository';
import type { ProdutoCatalogo } from '@/modules/catalog/score';

type BlingProdutoResumo = { id?: number | string | null };
type BlingProdutoDetalhe = {
  nome?: string | null;
  gtin?: string | null;
  descricaoCurta?: string | null;
  marca?: string | null;
  unidade?: string | null;
  midia?: {
    imagens?: {
      internas?: unknown[] | null;
      externas?: unknown[] | null;
    } | null;
  } | null;
};

async function blingGet<T>(path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${serverEnv.BLING_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
  } catch {
    throw new Error('bling_indisponivel');
  }
  if (!res.ok) throw new Error('bling_indisponivel');
  try {
    return (await res.json()) as T;
  } catch {
    throw new Error('bling_indisponivel');
  }
}

export async function fetchProdutoBySku(
  orgId: string,
  sku: string,
): Promise<ProdutoCatalogo | null> {
  const token = await getValidAccessToken(orgId, 'bling');

  const lista = await blingGet<{ data?: BlingProdutoResumo[] | null }>(
    `/produtos?codigo=${encodeURIComponent(sku)}&pagina=1&limite=1`,
    token,
  );
  const id = lista.data?.[0]?.id;
  if (id === undefined || id === null) return null;

  const detalhe = await blingGet<{ data?: BlingProdutoDetalhe | null }>(`/produtos/${id}`, token);
  const d = detalhe.data;
  if (!d) return null;

  const internas = d.midia?.imagens?.internas?.length ?? 0;
  const externas = d.midia?.imagens?.externas?.length ?? 0;

  return {
    nome: String(d.nome ?? ''),
    gtin: d.gtin ? String(d.gtin) : null,
    descricao: d.descricaoCurta ? String(d.descricaoCurta) : null,
    numFotos: internas + externas,
    marca: d.marca ? String(d.marca) : null,
    unidade: d.unidade ? String(d.unidade) : null,
  };
}
```

Run: `npm run test -- tests/unit/bling-products.test.ts` → PASS (2).

- [ ] **Step 3: Schema + repository (integração primeiro)**

Criar `src/db/schema/catalog-scores.ts`:

```ts
import { index, integer, jsonb, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './organizations';
import { trackedProducts } from './tracked-products';

export const catalogScores = pgTable(
  'catalog_scores',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    tracked_product_id: uuid('tracked_product_id')
      .notNull()
      .references(() => trackedProducts.id),
    score: integer('score').notNull(),
    fatores: jsonb('fatores').notNull(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_prod_idx: index('catalog_scores_org_prod_idx').on(
      t.org_id,
      t.tracked_product_id,
      t.created_at,
    ),
  }),
);

export type CatalogScoreRecord = typeof catalogScores.$inferSelect;
export type NewCatalogScoreRecord = typeof catalogScores.$inferInsert;
```

Barrel + `npm run db:generate` → inspecionar → aplicar em main e test.

Criar `tests/integration/catalog-repository.test.ts` (padrão `skipIf`, org + tracked product `ta-test-cs-${RUN}`, cleanup):

```ts
  it('salva scores e devolve o mais recente por produto', async () => {
    const { saveCatalogScore, listLatestCatalogScores } = await import(
      '@/modules/catalog/catalog.repository'
    );
    await saveCatalogScore({
      orgId,
      trackedProductId,
      score: 40,
      fatores: [{ fator: 'titulo', ok: false, detalhe: 'curto' }],
    });
    await saveCatalogScore({
      orgId,
      trackedProductId,
      score: 80,
      fatores: [{ fator: 'titulo', ok: true, detalhe: 'ok' }],
    });
    const latest = await listLatestCatalogScores(orgId);
    expect(latest).toHaveLength(1);
    expect(latest[0].score).toBe(80);
    expect(latest[0].trackedProductId).toBe(trackedProductId);
  });

  it('não vaza scores de outra org', async () => {
    const { listLatestCatalogScores } = await import('@/modules/catalog/catalog.repository');
    expect(await listLatestCatalogScores('00000000-0000-0000-0000-000000000000')).toEqual([]);
  });
```

Implementar `src/modules/catalog/catalog.repository.ts`:

```ts
import { sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { catalogScores } from '@/db/schema';
import type { FatorCatalogo } from '@/modules/catalog/score';

export async function saveCatalogScore(input: {
  orgId: string;
  trackedProductId: string;
  score: number;
  fatores: FatorCatalogo[];
}): Promise<void> {
  await db.insert(catalogScores).values({
    org_id: input.orgId,
    tracked_product_id: input.trackedProductId,
    score: input.score,
    fatores: input.fatores,
  });
}

export async function listLatestCatalogScores(orgId: string) {
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (cs.tracked_product_id)
      cs.tracked_product_id AS "trackedProductId",
      tp.nome AS "nome",
      tp.sku AS "sku",
      cs.score AS "score",
      cs.fatores AS "fatores",
      cs.created_at AS "createdAt"
    FROM catalog_scores cs
    JOIN tracked_products tp ON tp.id = cs.tracked_product_id
    WHERE cs.org_id = ${orgId}
    ORDER BY cs.tracked_product_id, cs.created_at DESC
  `);
  return rows as unknown as Array<{
    trackedProductId: string;
    nome: string;
    sku: string | null;
    score: number;
    fatores: FatorCatalogo[];
    createdAt: Date;
  }>;
}
```

(mesma nota da Task 7 sobre o padrão `DISTINCT ON` do repo.)

Run: `npm run test -- tests/integration/catalog-repository.test.ts` → PASS (2).

- [ ] **Step 4: Step gracioso + orquestrador (teste primeiro)**

Criar `tests/unit/collect-catalog.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

const fetchProdutoMock = vi.fn();
const saveScoreMock = vi.fn();

vi.mock('@/modules/providers/bling/products', () => ({
  fetchProdutoBySku: (...a: unknown[]) => fetchProdutoMock(...a),
}));
vi.mock('@/modules/catalog/catalog.repository', () => ({
  saveCatalogScore: (...a: unknown[]) => saveScoreMock(...a),
}));
vi.mock('@/modules/connections/connection.repository', () => ({
  getConnection: vi.fn().mockResolvedValue({ connected: true, status: 'ok' }),
}));
vi.mock('@/modules/tracked-products/tracked-product.repository', () => ({
  listTrackedProducts: vi.fn().mockResolvedValue([
    { id: 'tp-1', nome: 'Com SKU', sku: 'SKU-1', keywords: [], ativo: true },
    { id: 'tp-2', nome: 'Sem SKU', sku: null, keywords: [], ativo: true },
    { id: 'tp-3', nome: 'Inativo', sku: 'SKU-3', keywords: [], ativo: false },
  ]),
}));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

describe('collect-catalog', () => {
  it('avalia só ativos com sku e persiste score + fatores', async () => {
    fetchProdutoMock.mockReset();
    saveScoreMock.mockReset();
    fetchProdutoMock.mockResolvedValue({
      nome: 'Fritadeira Elétrica Air Fryer 4L 220V Preta',
      gtin: '789',
      descricao: 'x'.repeat(400),
      numFotos: 4,
      marca: 'M',
      unidade: 'UN',
    });

    const { collectCatalog } = await import('@/modules/pipeline/steps/collect-catalog');
    const r = await collectCatalog('org-1');

    expect(r.avaliados).toBe(1);
    expect(fetchProdutoMock).toHaveBeenCalledTimes(1);
    expect(saveScoreMock).toHaveBeenCalledWith(
      expect.objectContaining({ trackedProductId: 'tp-1', score: 100 }),
    );
  });

  it('é gracioso: erro do Bling não lança', async () => {
    fetchProdutoMock.mockReset();
    saveScoreMock.mockReset();
    fetchProdutoMock.mockRejectedValue(new Error('bling_indisponivel'));
    const { collectCatalog } = await import('@/modules/pipeline/steps/collect-catalog');
    await expect(collectCatalog('org-1')).resolves.toEqual({ avaliados: 0 });
    expect(saveScoreMock).not.toHaveBeenCalled();
  });
});
```

Run → FAIL. Criar `src/modules/pipeline/steps/collect-catalog.ts`:

```ts
import { logger } from '@/lib/logger';
import { pLimit } from '@/lib/p-limit';
import { saveCatalogScore } from '@/modules/catalog/catalog.repository';
import { scoreCatalogo } from '@/modules/catalog/score';
import { getConnection } from '@/modules/connections/connection.repository';
import { fetchProdutoBySku } from '@/modules/providers/bling/products';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';

const CONCORRENCIA = 4;

export async function collectCatalog(orgId: string): Promise<{ avaliados: number }> {
  let avaliados = 0;
  try {
    const conn = await getConnection(orgId, 'bling');
    if (!conn?.connected) {
      return { avaliados: 0 };
    }

    const produtos = (await listTrackedProducts(orgId)).filter((p) => p.ativo && p.sku);

    const jobs = produtos.map((produto) => async () => {
      try {
        const dadosBling = await fetchProdutoBySku(orgId, produto.sku as string);
        if (!dadosBling) {
          logger.warn('collect-catalog: sku não encontrado no Bling', { orgId, sku: produto.sku });
          return;
        }
        const { score, fatores } = scoreCatalogo(dadosBling);
        await saveCatalogScore({ orgId, trackedProductId: produto.id, score, fatores });
        avaliados++;
      } catch (err) {
        logger.warn('collect-catalog: produto falhou', {
          orgId,
          sku: produto.sku,
          erro: err instanceof Error ? err.message : String(err),
        });
      }
    });
    await pLimit(jobs, CONCORRENCIA);
  } catch (err) {
    logger.warn('collect-catalog: step falhou por inteiro', {
      orgId,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
  return { avaliados };
}
```

(mesma nota da Task 7 sobre a assinatura real do `pLimit` da F0.)

No orquestrador, adicionar após `collectCompetitors`:

```ts
    await collectCatalog(orgId);
```

Run: `npm run test -- tests/unit/collect-catalog.test.ts` → PASS (2). `npm run test && npm run typecheck` → verdes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(catalogo): scoreCatalogo + catalog_scores + coleta via Bling /produtos no pipeline"
```

---

### Task 12: Central de Qualidade de Catálogo — aba UI + "virar task" (F2) + resumo no relatório IA

**Files:**
- Create: `src/app/(client)/mercado/catalogo-lista.tsx`
- Modify: `src/app/(client)/mercado/page.tsx` (aba Catálogo real), `src/actions/mercado.actions.ts` (`criarTaskDeCatalogoAction`), `src/modules/pipeline/contracts.ts` (`qualidadeCatalogo`), `src/modules/pipeline/steps/compute-metrics.ts`, `src/modules/pipeline/steps/analyze-ia.ts`
- Test: `tests/unit/metricas-qualidade-catalogo.test.ts`, `tests/e2e/mercado.spec.ts` (estender)

**Interfaces:**
- Produces:
  - `criarTaskDeCatalogoAction(_prev: MercadoState, formData: FormData): Promise<MercadoState>` — lê `trackedProductId`; carrega o último score do produto (validando que pertence à org da sessão); cria task via F2: `createTask({ orgId, titulo: 'Melhorar cadastro: <nome>', descricao: '<lista dos fatores reprovados>', tipo: 'catalogo', prioridade: 'media', criadoPor: 'cliente' })`. **Contrato F2** — re-validar assinatura/caminho reais (`src/modules/tasks/task.repository.ts` ou action `createTaskAction` em `src/actions/tasks.actions.ts`) e adaptar a chamada mantendo `tipo: 'catalogo'`.
  - `contracts.ts`: `MetricasSchema` ganha `qualidadeCatalogo: z.object({ mediaScore: z.number(), produtos: z.array(z.object({ nome: z.string(), score: z.number(), fatoresReprovados: z.array(z.string()) }).strict()) }).strict().optional()`.
  - Helper puro em `compute-metrics.ts` (exportado p/ teste): `resumirQualidadeCatalogo(scores: Array<{ nome: string; score: number; fatores: Array<{ fator: string; ok: boolean }> }>): { mediaScore: number; produtos: Array<{ nome: string; score: number; fatoresReprovados: string[] }> } | undefined` — `undefined` quando não há scores; `produtos` só os com score < 100, ordenados do pior para o melhor.
  - Aba Catálogo: lista produtos com score (badge colorido: <50 vermelho, 50–79 amarelo, ≥80 verde), fatores reprovados e botão "Virar task" por produto (testid `catalogo-virar-task-{id}`).
  - Prompt IA: item 7 sobre qualidade de catálogo.

- [ ] **Step 1: Teste do resumo (falha primeiro)**

Criar `tests/unit/metricas-qualidade-catalogo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { resumirQualidadeCatalogo } from '@/modules/pipeline/steps/compute-metrics';

describe('resumirQualidadeCatalogo', () => {
  it('média + só produtos imperfeitos, do pior ao melhor, com fatores reprovados', () => {
    const out = resumirQualidadeCatalogo([
      {
        nome: 'A',
        score: 100,
        fatores: [{ fator: 'titulo', ok: true }],
      },
      {
        nome: 'B',
        score: 40,
        fatores: [
          { fator: 'titulo', ok: false },
          { fator: 'ean', ok: false },
          { fator: 'fotos', ok: false },
          { fator: 'descricao', ok: true },
          { fator: 'atributos', ok: true },
        ],
      },
      {
        nome: 'C',
        score: 80,
        fatores: [{ fator: 'ean', ok: false }],
      },
    ]);
    expect(out?.mediaScore).toBeCloseTo(73.33, 1);
    expect(out?.produtos.map((p) => p.nome)).toEqual(['B', 'C']);
    expect(out?.produtos[0].fatoresReprovados).toEqual(['titulo', 'ean', 'fotos']);
  });

  it('sem scores = undefined (campo fica de fora das métricas)', () => {
    expect(resumirQualidadeCatalogo([])).toBeUndefined();
  });
});
```

Run → FAIL.

- [ ] **Step 2: Contrato + computeMetrics + prompt**

Em `src/modules/pipeline/contracts.ts` (após `concorrentes`):

```ts
    qualidadeCatalogo: z
      .object({
        mediaScore: z.number(),
        produtos: z.array(
          z
            .object({
              nome: z.string(),
              score: z.number(),
              fatoresReprovados: z.array(z.string()),
            })
            .strict(),
        ),
      })
      .strict()
      .optional(),
```

Em `src/modules/pipeline/steps/compute-metrics.ts`, exportar o helper puro e usá-lo:

```ts
import { listLatestCatalogScores } from '@/modules/catalog/catalog.repository';

export function resumirQualidadeCatalogo(
  scores: Array<{ nome: string; score: number; fatores: Array<{ fator: string; ok: boolean }> }>,
):
  | { mediaScore: number; produtos: Array<{ nome: string; score: number; fatoresReprovados: string[] }> }
  | undefined {
  if (scores.length === 0) return undefined;
  const mediaScore = scores.reduce((acc, s) => acc + s.score, 0) / scores.length;
  const produtos = scores
    .filter((s) => s.score < 100)
    .sort((a, b) => a.score - b.score)
    .map((s) => ({
      nome: s.nome,
      score: s.score,
      fatoresReprovados: s.fatores.filter((f) => !f.ok).map((f) => f.fator),
    }));
  return { mediaScore, produtos };
}

// ... dentro de computeMetrics, junto da montagem final:
  const scoresCatalogo = await listLatestCatalogScores(orgId);
  const qualidadeCatalogo = resumirQualidadeCatalogo(
    scoresCatalogo.map((s) => ({ nome: s.nome, score: s.score, fatores: s.fatores })),
  );
// ... no objeto validado:
    ...(qualidadeCatalogo ? { qualidadeCatalogo } : {}),
```

Em `analyze-ia.ts`, acrescentar o item 7 ao system prompt:

```
7. Se as métricas incluírem "qualidadeCatalogo", incorpore aos gargalos os produtos com score baixo (cite nome, score e fatores reprovados) e às sugestoesMelhoria ações concretas de cadastro (título, EAN, fotos, descrição, atributos) — são melhorias de conversão de baixo custo.
```

Run: `npm run test -- tests/unit/metricas-qualidade-catalogo.test.ts` → PASS (2). `npm run test` → testes existentes de compute-metrics seguem verdes (campo opcional).

- [ ] **Step 3: Action "virar task" + aba Catálogo**

Em `src/actions/mercado.actions.ts`, adicionar:

```ts
import { listLatestCatalogScores } from '@/modules/catalog/catalog.repository';
import { createTask } from '@/modules/tasks/task.repository'; // F2 — re-validar caminho/assinatura

export async function criarTaskDeCatalogoAction(
  _prev: MercadoState,
  formData: FormData,
): Promise<MercadoState> {
  const access = await requireActiveOrg();
  const trackedProductId = String(formData.get('trackedProductId') ?? '');
  if (!trackedProductId) return { error: 'Produto inválido.' };

  const scores = await listLatestCatalogScores(access.orgId);
  const alvo = scores.find((s) => s.trackedProductId === trackedProductId);
  if (!alvo) return { error: 'Produto sem avaliação de catálogo.' };

  const reprovados = alvo.fatores.filter((f) => !f.ok);
  const descricao = [
    `Score atual do cadastro: ${alvo.score}/100.`,
    '',
    'Fatores a corrigir:',
    ...reprovados.map((f) => `- ${f.detalhe}`),
  ].join('\n');

  await createTask({
    orgId: access.orgId,
    titulo: `Melhorar cadastro: ${alvo.nome}`,
    descricao,
    tipo: 'catalogo',
    prioridade: 'media',
    criadoPor: 'cliente',
  });

  revalidatePath('/mercado');
  return { ok: true };
}
```

> A assinatura de `createTask` acima segue o contrato F2 do roadmap (tasks: org_id, titulo, descricao, tipo `catalogo|...`, prioridade, criado_por `analista|cliente|ia`). Ao implementar, usar EXATAMENTE a API que a F2 mergeou (repository ou action) — mantendo `tipo: 'catalogo'` e a descrição gerada acima. Se a F2 exigir `status`/`assignee`, usar os defaults dela (`backlog`/null).

Criar `src/app/(client)/mercado/catalogo-lista.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import { criarTaskDeCatalogoAction, type MercadoState } from '@/actions/mercado.actions';

const initial: MercadoState = {};

export type ItemCatalogo = {
  trackedProductId: string;
  nome: string;
  score: number;
  fatoresReprovados: string[];
};

function corDoScore(score: number): string {
  if (score < 50) return 'text-red-500';
  if (score < 80) return 'text-yellow-500';
  return 'text-green-500';
}

export function CatalogoLista({ itens }: { itens: ItemCatalogo[] }) {
  const [state, criarTask] = useFormState(criarTaskDeCatalogoAction, initial);

  if (itens.length === 0) {
    return (
      <p className="text-zinc-400" data-testid="catalogo-vazio">
        Nenhuma avaliação de catálogo ainda — conecte o Bling, cadastre produtos com SKU e gere um relatório.
      </p>
    );
  }

  return (
    <div>
      {state.ok ? <p className="mb-2 text-sm text-green-500">Task criada no plano de ação.</p> : null}
      {state.error ? <p role="alert" className="mb-2 text-sm text-red-500">{state.error}</p> : null}
      <ul className="flex flex-col gap-3">
        {itens.map((p) => (
          <li
            key={p.trackedProductId}
            className="rounded-lg border border-white/10 p-4"
            data-testid={`catalogo-item-${p.trackedProductId}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{p.nome}</span>
              <span className={`font-mono text-lg ${corDoScore(p.score)}`}>{p.score}/100</span>
            </div>
            {p.fatoresReprovados.length > 0 ? (
              <p className="mt-1 text-sm text-zinc-400">
                A corrigir: {p.fatoresReprovados.join(', ')}
              </p>
            ) : (
              <p className="mt-1 text-sm text-green-500">Cadastro completo.</p>
            )}
            {p.fatoresReprovados.length > 0 ? (
              <form action={criarTask} className="mt-2">
                <input type="hidden" name="trackedProductId" value={p.trackedProductId} />
                <button
                  type="submit"
                  data-testid={`catalogo-virar-task-${p.trackedProductId}`}
                  className="border px-3 py-1 text-sm"
                >
                  Virar task
                </button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Em `src/app/(client)/mercado/page.tsx`, trocar o placeholder da aba Catálogo:

```tsx
      {aba === 'catalogo' ? <CatalogoSection orgId={access.orgId} /> : null}
// ...
async function CatalogoSection({ orgId }: { orgId: string }) {
  const { listLatestCatalogScores } = await import('@/modules/catalog/catalog.repository');
  const scores = await listLatestCatalogScores(orgId);
  return (
    <CatalogoLista
      itens={scores.map((s) => ({
        trackedProductId: s.trackedProductId,
        nome: s.nome,
        score: s.score,
        fatoresReprovados: s.fatores.filter((f) => !f.ok).map((f) => f.fator),
      }))}
    />
  );
}
```

- [ ] **Step 4: E2E + verificação**

Estender `tests/e2e/mercado.spec.ts`: `?aba=catalogo` → sem dados vê `catalogo-vazio`. (Fluxo completo com score + virar task exige semear `catalog_scores` + `tasks` via helper de DB do E2E — semear um score `{ score: 40, fatores: [...] }` para um tracked product da org de teste, recarregar, clicar `catalogo-virar-task-*` e assertar a mensagem "Task criada no plano de ação." — implementar se o helper F2 de tasks estiver disponível no harness E2E; senão, cobrir o clique via teste de integração da action.)

Run: `npm run test:e2e -- mercado` → PASS. `npm run test && npm run typecheck && npm run build` → verdes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(catalogo): aba qualidade de catalogo + virar task (tipo catalogo) + resumo nas metricas/prompt IA"
```

---

### Task 13: Verificação integrada final

**Files:**
- Nenhum arquivo novo (correções pontuais se algo falhar).

- [ ] **Step 1: Suíte completa**

Run: `npm run test` → TODOS os testes verdes (existentes + novos). Contagem esperada: os 188+ testes pré-F3b (com os ajustes documentados nas Tasks 1 e 5) + ~35 novos deste plano.
Run: `npm run typecheck && npm run lint && npm run build` → limpos.
Run: `npm run test:e2e` → todos os specs (incluindo `conexoes` e `mercado`) verdes.

- [ ] **Step 2: Guard de invariantes**

- `rg -n "PROVIDER = 'bling'|PROVIDER='bling'" src` → NENHUM resultado (constante hardcoded eliminada).
- `rg -n "collectBlingOrders|collect-bling|blingOrderId|bling_order_id" src tests` → NENHUM resultado.
- `rg -n "'mercado_livre'|'ml'" src --type ts | rg -v "ml_publico|ml_busca|ml_sem|ml_indisponivel|ml_token|ml_oauth|ml_item|html"` → nenhum id de provider fora da grafia canônica `mercadolivre` (revisar manualmente os hits restantes).
- `rg -n "console\.(log|warn|error)" src/modules/pipeline src/modules/ranking src/modules/competitors src/modules/catalog` → nenhum (tudo via logger F0).

- [ ] **Step 3: Main limpo (sem lixo de teste) + dados de produção intactos**

Criar `scripts/check-f3b-main.mjs` (temporário, apagar após o check):

```js
import postgres from 'postgres';
import { readFileSync } from 'node:fs';

const url = readFileSync('.env.local', 'utf8').match(/^POSTGRES_URL=(.*)$/m)[1];
const sql = postgres(url, { prepare: false });
try {
  const [o] = await sql`select count(*)::int n from orders where provider = 'bling'`;
  const [r] = await sql`select count(*)::int n from ranking_snapshots`;
  const [c] = await sql`select count(*)::int n from competitors`;
  const [s] = await sql`select count(*)::int n from catalog_scores`;
  console.log('pedidos bling preservados:', o.n);
  console.log('novas tabelas no MAIN (ranking/competitors/catalog):', r.n, c.n, s.n);
} finally {
  await sql.end();
}
```

Run: `node scripts/check-f3b-main.mjs`
Expected: contagem de pedidos `bling` IGUAL à registrada antes da Task 5; tabelas novas sem linhas de teste no main (qualquer linha aqui deve ser de uso real, nunca `ta-test-*`). Remover o script após o check.

- [ ] **Step 4: Smoke manual documentado (deferido p/ credenciais reais)**

Registrar no PR: o fluxo OAuth ML real (authorize → callback → `external_account_id` preenchido) e um relatório com ranqueamento/concorrentes/catálogo reais dependem de `ML_CLIENT_ID`/`ML_CLIENT_SECRET` no ambiente (pré-requisito deferido) — mockados em 100% dos testes.

- [ ] **Step 5: Commit final + finishing-a-development-branch**

```bash
git add -A
git commit -m "chore(f3b): verificacao integrada da expansao de mercado"
```

Seguir superpowers:finishing-a-development-branch (merge `--no-ff` em `master` após revisão ampla com Opus, como nas fases anteriores).

---

## Self-Review

**1. Cobertura do escopo F3b (roadmap + auditoria §7 itens 2/5 + ideias extras):**
- Generalização multi-provider (registry, repository parametrizado, rotas `[provider]`, UI cards) → Tasks 1, 2, 3, 6. ✅
- Mercado Livre como fonte de VENDAS (OAuth PKCE, refresh rotativo, fetchOrders paginado, canal `mercadolivre`, dedupe `(org_id, provider, external_order_id)` com migration manual + backfill `provider='bling'`) → Tasks 4, 5. ✅
- Monitor de ranqueamento (`ranking_snapshots`, busca pública ML top 100, match por seller_id da conexão ML com fallback por título, step gracioso, UI com line chart de posição invertida) → Tasks 7, 8. ✅
- Radar de concorrentes (`competitors`, CRUD limite 10, coleta → `market_snapshots` `fonte='concorrente'` com CHECK estendido, `Metricas.concorrentes`, prompt IA nominal, contrato de dados p/ gatilho F3a `concorrente_preco`) → Tasks 9, 10. ✅
- Central de Qualidade de Catálogo (`scoreCatalogo` puro 5×20 pts, campos confirmados da API Bling v3, `catalog_scores`, step gracioso, aba com score+fatores+"virar task" tipo `catalogo` via F2, `Metricas.qualidadeCatalogo` + prompt) → Tasks 11, 12. ✅

**2. Decisões e riscos assumidos:**
- **PKCE sempre-on no ML** — compatível com app com ou sem PKCE habilitado (doc oficial); Bling permanece sem PKCE (params opcionais na interface).
- **Migration de `orders` manual** (rename + default + swap de unique) — dados de produção preservados por construção; verificação explícita de contagem no Step de migration e na Task 13.
- **`/mercado` com abas por URL** em vez de detalhe em `/conexoes` — separa configuração de leitura analítica e dá deep-link; não depende do contrato exato do `Tabs` F1.
- **Semântica de falha do `collectOrders`**: hard-fail apenas se zero providers coletarem (preserva o espírito "Bling = falha dura" com 1 conexão; com 2, falha parcial vira coleta parcial logada). Erro `sem_conexao` substitui `sem_conexao_bling` NA CAMADA DO STEP (o repository preserva `sem_conexao_bling`); testes que asseguravam a string antiga no step são atualizados na Task 5.
- **Steps novos sequenciais e graciosos após a coleta principal** — não competem com o rate limit da busca ML usada pelo benchmark e nunca derrubam o relatório; sem etapas novas no stepper F0/F1.
- **Dependências de fases anteriores marcadas para re-validação pontual**: assinatura do `pLimit` (Tasks 7/11), helper de backoff F0 (Task 4), API real de `createTask` F2 (Task 12), nomes reais dos CHECKs F0 (Tasks 2/5/10), orquestrador pós-F0 (Tasks 5/7/10/11) e padrão de `DISTINCT ON` do repo (Tasks 7/11).

**3. Consistência de nomes verificada:** provider ids `'bling' | 'mercadolivre'` em todo o plano; `registry.ts` com `getProvider`/`listProviders`/`isProviderId`; tabelas `ranking_snapshots`/`competitors`/`catalog_scores`; steps `collect-orders`/`collect-ranking`/`collect-competitors`/`collect-catalog`; erros `sem_conexao_${provider}`, `refresh_${provider}_falhou`, `provider_desconhecido`, `ml_token_falhou`, `ml_indisponivel`, `ml_sem_seller_id`, `referencia_invalida`, `limite_concorrentes`, `bling_indisponivel` (inalterado).

**4. Lacunas conscientes (fora do escopo F3b):**
- Frete do pedido ML = 0 (custo real exigiria `GET /shipments/{id}` por pedido — evolução futura documentada no código).
- Ranqueamento limitado ao top 100 do ML (2 páginas) e só provider `mercadolivre` (a coluna `provider` já existe para expansão).
- Consolidação de `ml-publico.ts` com `ml-search.ts` é refactor opcional não incluído.
- Homologação do app ML para terceiros e credenciais reais = operacional deferido (igual ao padrão do app Bling).

---

## Execução

**Plano salvo em `docs/superpowers/plans/2026-07-03-f3b-expansao-mercado.md`.** Execução: subagent-driven (implementer Opus 4.8 → spec-review → code-review → fix por task; revisão ampla ao final), branch `feat/f3b-expansao-mercado`, ledger em `.superpowers/sdd/progress.md`. Todas as chamadas externas (Bling, ML OAuth/orders/busca) mockadas; integração contra o branch Neon `test`.
