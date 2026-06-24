# Conexões (Bling OAuth + tracked_products) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que um cliente ativo conecte sua conta **Bling (OAuth v3)** com tokens criptografados (AES-256-GCM) e refresh automático, e cadastre seus `tracked_products` (produtos-chave + keywords) que alimentarão a coleta de mercado — através de uma camada `providers/` com interface comum preparada para a fase 2.

**Architecture:** Reaproveita o stack (Next 14, Drizzle/Neon, Auth.js v5, Server Actions). Tokens de integração são cifrados em repouso com AES-256-GCM (chave em `ENCRYPTION_KEY`). O OAuth do Bling é encapsulado em `src/modules/providers/bling/` que implementa uma interface comum `ConnectionProvider` (`src/modules/providers/types.ts`) — o pipeline (Plano 4) consumirá essa interface, não o Bling diretamente. A coleta efetiva de pedidos (`fetchOrders`) fica para o Plano 4; este plano entrega conexão, gestão de token e tracked_products. Credenciais do app Bling são lidas do ambiente (deferidas — o Matheus registra o app Bling depois); a base da API é configurável (`BLING_API_BASE`) para permitir testes com mock.

**Tech Stack:** Next.js 14, Drizzle ORM/Neon, Auth.js v5, Node `crypto` (AES-256-GCM), Zod, Vitest, Playwright. Igual aos Planos 1–2.

## Global Constraints

- **Stack e padrões idênticos aos Planos 1–2** (em `master`): `src/db/schema/*.ts`, `src/modules/<domínio>/`, `src/actions/`, Server Actions `(prev, formData)` + Zod, gating reconsultando o DB.
- **Segurança de tokens:** access_token e refresh_token do Bling SEMPRE cifrados com AES-256-GCM antes de persistir; nunca logar nem retornar tokens em respostas. Chave em `ENCRYPTION_KEY` (32 bytes, base64, em env). Cada cifragem usa IV aleatório de 12 bytes; o auth tag do GCM é armazenado e verificado (detecção de adulteração).
- **Multi-tenancy:** `connections` e `tracked_products` têm `org_id`; TODA query filtra por `org_id` da sessão. Um cliente nunca acessa conexão/produtos de outra org.
- **Gating:** páginas/actions de conexão usam `requireActiveOrg()` (cliente com org ativa). O `org_id` vem SEMPRE da sessão (`getSessionContext().orgId`), nunca de input do cliente.
- **Bling OAuth v3:** Authorization Code + HTTP Basic (`Authorization: Basic base64(client_id:client_secret)`) no `/oauth/token`. Endpoints sob `BLING_API_BASE` (default `https://www.bling.com.br/Api/v3`): `GET {base}/oauth/authorize` e `POST {base}/oauth/token`. Resposta: `access_token`, `token_type`, `expires_in` (segundos), `refresh_token`, `scope`. Refresh token ~30 dias. **Confirmar os dois caminhos exatos contra developer.bling.com.br ao fiar (Task 3).**
- **Credenciais do app Bling** (`BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_REDIRECT_URI`): lidas do ambiente, OPCIONAIS no schema de env (app sobe sem elas); rotas de conexão falham graciosamente se ausentes. NUNCA hardcodar.
- **`state` do OAuth:** gerado aleatoriamente, guardado em cookie httpOnly assinado/efêmero e validado no callback (proteção CSRF).
- **Idioma:** UI pt-BR; commits conventional pt-BR.
- **Testes ≠ produção:** `tests/setup.ts` já redireciona o client do app para o branch `test`; integração usa `describe.skipIf(!process.env.DATABASE_URL_TEST)`. Chamadas ao Bling em testes são MOCKADAS (sem rede real); `ENCRYPTION_KEY` de teste vem de `.env.local`.
- **Trabalho na branch `feat/conexoes`** (a partir de `master`). Nunca push/merge sem revisão.

---

## Pré-requisitos

- [ ] Branch `feat/conexoes` a partir de `master`.
- [ ] `ENCRYPTION_KEY` gerada (32 bytes base64) e adicionada ao `.env.local` (controlador provisiona — ver Task 1, mesma chave serve main e test; é app-level).
- [ ] (Deferido, ação do Matheus para o smoke test real) Registrar um app no portal de desenvolvedor do Bling para obter `BLING_CLIENT_ID`/`BLING_CLIENT_SECRET` e cadastrar o `redirect_uri` (`{APP_URL}/api/connections/bling/callback`). NÃO bloqueia este plano (tudo é testado com mock).

---

## File Structure

| Caminho | Responsabilidade |
|---|---|
| `src/lib/env.ts` (modificar) | adicionar `ENCRYPTION_KEY` (obrigatória), `BLING_CLIENT_ID`/`BLING_CLIENT_SECRET`/`BLING_REDIRECT_URI` (opcionais), `BLING_API_BASE` (default) |
| `.env.example` (modificar) | documentar as novas vars |
| `src/modules/crypto/crypto.ts` (criar) | `encryptSecret`/`decryptSecret` (AES-256-GCM) |
| `src/db/schema/connections.ts` (criar) | tabela `connections` |
| `src/db/schema/tracked-products.ts` (criar) | tabela `tracked_products` |
| `src/db/schema/index.ts` (modificar) | exportar as duas tabelas |
| `src/modules/providers/types.ts` (criar) | interface `ConnectionProvider` + tipos |
| `src/modules/providers/bling/oauth.ts` (criar) | `buildAuthorizeUrl`, `exchangeCode`, `refreshTokens` (HTTP Bling) |
| `src/modules/connections/connection.repository.ts` (criar) | persistência cifrada + `getValidAccessToken` (refresh on demand) |
| `src/modules/providers/bling/provider.ts` (criar) | `blingProvider: ConnectionProvider` (liga oauth + repository) |
| `src/modules/tracked-products/tracked-product.repository.ts` (criar) | CRUD de tracked_products (por org) + limite por plano |
| `src/app/api/connections/bling/route.ts` (criar) | inicia OAuth (redirect p/ authorize + cookie state) |
| `src/app/api/connections/bling/callback/route.ts` (criar) | valida state, troca code, persiste cifrado |
| `src/actions/connections.actions.ts` (criar) | actions: desconectar Bling; add/remover/toggle tracked_product |
| `src/app/(client)/conexoes/page.tsx` (criar) | UI: status Bling + conectar/desconectar + tracked_products |
| `src/app/(client)/conexoes/tracked-products.tsx` (criar) | componente client de gestão de tracked_products |
| `tests/unit/crypto.test.ts` | roundtrip, IV único, detecção de adulteração |
| `tests/unit/bling-oauth.test.ts` | buildAuthorizeUrl + parsing (mock fetch) |
| `tests/integration/connection-repository.test.ts` | persistência cifrada + getValidAccessToken (refresh mockado) |
| `tests/integration/tracked-product-repository.test.ts` | CRUD + isolamento + limite por plano |
| `tests/e2e/conexoes.spec.ts` | página /conexoes: estado desconectado + gestão de tracked_products |

---

### Task 1: Criptografia de segredos (AES-256-GCM) + env

**Files:**
- Modify: `src/lib/env.ts`, `.env.example`
- Create: `src/modules/crypto/crypto.ts`
- Test: `tests/unit/crypto.test.ts`

**Interfaces:**
- Produces:
  - `encryptSecret(plaintext: string): string` — retorna string base64 no formato `iv.authTag.ciphertext` (cada parte base64, separadas por `.`).
  - `decryptSecret(payload: string): string` — inverte; lança `Error('decrypt_failed')` se o auth tag não validar (adulteração) ou o formato for inválido.
  - `serverEnv.ENCRYPTION_KEY` (string base64 de 32 bytes), `serverEnv.BLING_CLIENT_ID?`, `serverEnv.BLING_CLIENT_SECRET?`, `serverEnv.BLING_REDIRECT_URI?`, `serverEnv.BLING_API_BASE` (default `https://www.bling.com.br/Api/v3`).
- Consumes: Node `crypto`.

- [ ] **Step 1: Estender o schema de env**

Em `src/lib/env.ts`, adicionar ao objeto Zod (mantendo os campos existentes):

```ts
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'ENCRYPTION_KEY deve ser 32 bytes em base64',
    }),
  BLING_CLIENT_ID: z.string().min(1).optional(),
  BLING_CLIENT_SECRET: z.string().min(1).optional(),
  BLING_REDIRECT_URI: z.string().url().optional(),
  BLING_API_BASE: z.string().url().default('https://www.bling.com.br/Api/v3'),
```

Em `.env.example`, acrescentar:

```
ENCRYPTION_KEY=
BLING_CLIENT_ID=
BLING_CLIENT_SECRET=
BLING_REDIRECT_URI=http://localhost:3000/api/connections/bling/callback
BLING_API_BASE=https://www.bling.com.br/Api/v3
```

> O controlador adiciona `ENCRYPTION_KEY` real ao `.env.local` antes de rodar os testes (32 bytes base64). As `BLING_*` ficam vazias por ora (deferidas).

- [ ] **Step 2: Escrever o teste de cripto (falha primeiro)**

Criar `tests/unit/crypto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from '@/modules/crypto/crypto';

describe('crypto AES-256-GCM', () => {
  it('roundtrip: decrypt(encrypt(x)) === x', () => {
    const secret = 'token-super-secreto-123';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('usa IV aleatório: dois encrypts do mesmo texto diferem', () => {
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });

  it('detecta adulteração (auth tag inválido)', () => {
    const payload = encryptSecret('y');
    const [iv, tag, ct] = payload.split('.');
    // corrompe o ciphertext
    const corrupted = `${iv}.${tag}.${Buffer.from('zzzz').toString('base64')}`;
    expect(() => decryptSecret(corrupted)).toThrow('decrypt_failed');
  });

  it('rejeita formato inválido', () => {
    expect(() => decryptSecret('nao-tem-tres-partes')).toThrow('decrypt_failed');
  });
});
```

- [ ] **Step 3: Rodar para ver falhar**

Run: `npm run test -- tests/unit/crypto.test.ts`
Expected: FAIL ("Cannot find module '@/modules/crypto/crypto'").

- [ ] **Step 4: Implementar a cripto**

Criar `src/modules/crypto/crypto.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { serverEnv } from '@/lib/env';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function key(): Buffer {
  return Buffer.from(serverEnv.ENCRYPTION_KEY, 'base64');
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  try {
    const parts = payload.split('.');
    if (parts.length !== 3) throw new Error('formato');
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    throw new Error('decrypt_failed');
  }
}
```

- [ ] **Step 5: Rodar para ver passar**

Run: `npm run test -- tests/unit/crypto.test.ts`
Expected: PASS (4 passed). Depois `npm run typecheck` (limpo).

> Se falhar por `ENCRYPTION_KEY` ausente no ambiente de teste, confirme que o controlador já a colocou no `.env.local` (carregado por `tests/setup.ts`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(crypto): AES-256-GCM para segredos + env (ENCRYPTION_KEY, BLING_*)"
```

---

### Task 2: Schema `connections` + `tracked_products` + migration

**Files:**
- Create: `src/db/schema/connections.ts`, `src/db/schema/tracked-products.ts`
- Modify: `src/db/schema/index.ts`
- Generate: migration `0002_*.sql`
- Test: `tests/unit/schema-conexoes.test.ts`

**Interfaces:**
- Produces:
  - `connections` (colunas: `id` uuid pk; `org_id` uuid notNull FK→organizations.id; `provider` varchar(32) notNull default `'bling'`; `access_token` text (cifrado) nullable; `refresh_token` text (cifrado) nullable; `expira_em` timestamptz nullable; `status` varchar(16) notNull default `'erro'` (`ok`|`erro`|`expirado`); `last_sync_at` timestamptz nullable; `created_at`/`updated_at` timestamptz notNull, `updated_at` com `$onUpdateFn`). Unique em `(org_id, provider)`.
  - `tracked_products` (colunas: `id` uuid pk; `org_id` uuid notNull FK→organizations.id; `nome` varchar(255) notNull; `sku` varchar(120) nullable; `keywords` `text[]` notNull default `[]`; `ativo` boolean notNull default true; `created_at`/`updated_at`). Index em `org_id`.
  - Tipos `$inferSelect`/`$inferInsert` de cada.

- [ ] **Step 1: Schema `connections`**

Criar `src/db/schema/connections.ts`:

```ts
import {
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const connections = pgTable(
  'connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    provider: varchar('provider', { length: 32 }).notNull().default('bling'),
    access_token: text('access_token'),
    refresh_token: text('refresh_token'),
    expira_em: timestamp('expira_em', { withTimezone: true, mode: 'date' }),
    status: varchar('status', { length: 16 }).notNull().default('erro'),
    last_sync_at: timestamp('last_sync_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdateFn(() => new Date())
      .notNull(),
  },
  (t) => ({
    org_provider_uq: unique('connections_org_provider_uq').on(t.org_id, t.provider),
  }),
);

export type ConnectionRecord = typeof connections.$inferSelect;
export type NewConnectionRecord = typeof connections.$inferInsert;
```

- [ ] **Step 2: Schema `tracked_products`**

Criar `src/db/schema/tracked-products.ts`:

```ts
import {
  boolean,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const trackedProducts = pgTable(
  'tracked_products',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    nome: varchar('nome', { length: 255 }).notNull(),
    sku: varchar('sku', { length: 120 }),
    keywords: varchar('keywords', { length: 120 })
      .array()
      .notNull()
      .default([]),
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
    org_idx: index('tracked_products_org_idx').on(t.org_id),
  }),
);

export type TrackedProductRecord = typeof trackedProducts.$inferSelect;
export type NewTrackedProductRecord = typeof trackedProducts.$inferInsert;
```

- [ ] **Step 3: Barrel**

Em `src/db/schema/index.ts`, adicionar:

```ts
export * from './connections';
export * from './tracked-products';
```

- [ ] **Step 4: Teste de schema (falha primeiro)**

Criar `tests/unit/schema-conexoes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { connections, trackedProducts } from '@/db/schema';

describe('schema conexões', () => {
  it('connections: org_id notNull, status default erro', () => {
    expect(connections.org_id.notNull).toBe(true);
    expect(connections.status.default).toBe('erro');
  });
  it('tracked_products: keywords array notNull, ativo default true', () => {
    expect(trackedProducts.ativo.default).toBe(true);
    expect(trackedProducts.org_id.notNull).toBe(true);
  });
});
```

- [ ] **Step 5: Rodar teste + gerar/aplicar migration**

Run: `npm run test -- tests/unit/schema-conexoes.test.ts` → PASS (2).
Run: `npm run db:generate` → cria `0002_*.sql` (2 tabelas + unique + index).
Run: `npm run db:migrate` (aplica em main). Depois no test:

```bash
TEST_DIRECT=$(grep '^DATABASE_URL_TEST_DIRECT=' .env.local | cut -d= -f2-)
POSTGRES_URL_DIRECT="$TEST_DIRECT" node node_modules/drizzle-kit/bin.cjs migrate
```

Expected: ambos aplicam sem erro.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): schema connections + tracked_products + migration"
```

---

### Task 3: Bling OAuth + connection repository (token cifrado + refresh)

**Files:**
- Create: `src/modules/providers/types.ts`, `src/modules/providers/bling/oauth.ts`, `src/modules/connections/connection.repository.ts`, `src/modules/providers/bling/provider.ts`
- Test: `tests/unit/bling-oauth.test.ts`, `tests/integration/connection-repository.test.ts`

**Interfaces:**
- Consumes: `serverEnv`, `encryptSecret`/`decryptSecret`, `db`, `connections`, `recordAudit`.
- Produces:
  - `types.ts`: `type OAuthTokens = { accessToken: string; refreshToken: string; expiresInSeconds: number; scope?: string }`; `interface ConnectionProvider { readonly name: string; buildAuthorizeUrl(state: string): string; exchangeCode(code: string): Promise<OAuthTokens>; refresh(refreshToken: string): Promise<OAuthTokens> }`.
  - `bling/oauth.ts`: `buildAuthorizeUrl(state)`, `exchangeCode(code)`, `refreshTokens(refreshToken)` — falam com o Bling via `fetch` usando `serverEnv.BLING_*`; lançam `Error('bling_oauth_nao_configurado')` se faltam credenciais e `Error('bling_token_falhou')` em resposta não-2xx.
  - `connection.repository.ts`:
    - `saveBlingConnection(orgId: string, tokens: OAuthTokens): Promise<void>` — cifra tokens, upsert por `(org_id,'bling')`, `status='ok'`, `expira_em = now + expiresInSeconds`. Audita `connection.bling.conectada`.
    - `getConnection(orgId: string): Promise<{ status: string; connected: boolean; expira_em: Date | null; last_sync_at: Date | null } | null>` — metadados SEM tokens.
    - `getValidAccessToken(orgId: string): Promise<string>` — decifra; se faltar ≤60s p/ expirar, faz refresh (via provider), re-cifra/persiste, devolve o novo; lança `Error('sem_conexao_bling')` se não há conexão e marca `status='expirado'` se o refresh falhar.
    - `disconnectBling(orgId: string): Promise<void>` — apaga tokens, `status='erro'`. Audita `connection.bling.desconectada`.
  - `bling/provider.ts`: `export const blingProvider: ConnectionProvider` implementando a interface com as funções de `oauth.ts`.

- [ ] **Step 1: Confirmar endpoints Bling e implementar `types.ts` + `oauth.ts`**

Antes de codar, confirme os dois caminhos OAuth contra `https://developer.bling.com.br` (autorização e token sob `BLING_API_BASE`). Use `{base}/oauth/authorize` e `{base}/oauth/token` salvo indicação contrária na doc.

Criar `src/modules/providers/types.ts`:

```ts
export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope?: string;
};

export interface ConnectionProvider {
  readonly name: string;
  buildAuthorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  refresh(refreshToken: string): Promise<OAuthTokens>;
}
```

Criar `src/modules/providers/bling/oauth.ts`:

```ts
import { serverEnv } from '@/lib/env';
import type { OAuthTokens } from '@/modules/providers/types';

function creds() {
  const { BLING_CLIENT_ID, BLING_CLIENT_SECRET, BLING_REDIRECT_URI } = serverEnv;
  if (!BLING_CLIENT_ID || !BLING_CLIENT_SECRET || !BLING_REDIRECT_URI) {
    throw new Error('bling_oauth_nao_configurado');
  }
  return { id: BLING_CLIENT_ID, secret: BLING_CLIENT_SECRET, redirect: BLING_REDIRECT_URI };
}

export function buildAuthorizeUrl(state: string): string {
  const c = creds();
  const u = new URL(`${serverEnv.BLING_API_BASE}/oauth/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', c.id);
  u.searchParams.set('redirect_uri', c.redirect);
  u.searchParams.set('state', state);
  return u.toString();
}

function parseTokens(json: Record<string, unknown>): OAuthTokens {
  return {
    accessToken: String(json.access_token),
    refreshToken: String(json.refresh_token),
    expiresInSeconds: Number(json.expires_in),
    scope: json.scope ? String(json.scope) : undefined,
  };
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens> {
  const c = creds();
  const basic = Buffer.from(`${c.id}:${c.secret}`).toString('base64');
  const res = await fetch(`${serverEnv.BLING_API_BASE}/oauth/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  if (!res.ok) throw new Error('bling_token_falhou');
  return parseTokens((await res.json()) as Record<string, unknown>);
}

export function exchangeCode(code: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code });
  return tokenRequest(body);
}

export function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
  return tokenRequest(body);
}
```

- [ ] **Step 2: Teste unitário do `buildAuthorizeUrl` (falha primeiro)**

Criar `tests/unit/bling-oauth.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('buildAuthorizeUrl', () => {
  it('monta a URL de autorização com os params certos quando configurado', async () => {
    process.env.BLING_CLIENT_ID = 'cli-123';
    process.env.BLING_CLIENT_SECRET = 'sec-123';
    process.env.BLING_REDIRECT_URI = 'http://localhost:3000/api/connections/bling/callback';
    // re-import isolado para pegar env atual
    const { buildAuthorizeUrl } = await import('@/modules/providers/bling/oauth');
    const url = new URL(buildAuthorizeUrl('xyz-state'));
    expect(url.pathname.endsWith('/oauth/authorize')).toBe(true);
    expect(url.searchParams.get('client_id')).toBe('cli-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('xyz-state');
    expect(url.searchParams.get('redirect_uri')).toContain('/api/connections/bling/callback');
  });
});
```

> `serverEnv` é parseado no import de `@/lib/env`. Como `tests/setup.ts` carrega `.env.local` (sem BLING_*), e este teste seta `process.env.BLING_*` antes do `import()` dinâmico, o `oauth.ts` lê `serverEnv` — que pode já estar cacheado SEM as BLING_*. Se o teste falhar por isso, ajuste `oauth.ts` para ler `process.env`/`serverEnv` de forma tardia (função `creds()` já é chamada por-request, mas `serverEnv` é snapshot). Solução robusta: em `creds()`, ler de `serverEnv` (já tardio via função) — e no teste, em vez de setar `process.env`, mockar `@/lib/env` com `vi.mock`. Aplique a abordagem que passar de forma determinística; o objetivo do teste é validar a montagem da URL.

- [ ] **Step 3: Rodar + implementar repository**

Run: `npm run test -- tests/unit/bling-oauth.test.ts` (após ajustar conforme nota) → PASS.

Criar `src/modules/connections/connection.repository.ts`:

```ts
import { and, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections } from '@/db/schema';
import { recordAudit } from '@/modules/audit/audit.repository';
import { decryptSecret, encryptSecret } from '@/modules/crypto/crypto';
import { blingProvider } from '@/modules/providers/bling/provider';
import type { OAuthTokens } from '@/modules/providers/types';

const PROVIDER = 'bling';
const REFRESH_MARGIN_MS = 60_000;

function expiresAt(seconds: number): Date {
  return new Date(Date.now() + seconds * 1000);
}

export async function saveBlingConnection(
  orgId: string,
  tokens: OAuthTokens,
): Promise<void> {
  const values = {
    org_id: orgId,
    provider: PROVIDER,
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
        access_token: values.access_token,
        refresh_token: values.refresh_token,
        expira_em: values.expira_em,
        status: 'ok',
      },
    });
  await recordAudit({ orgId, acao: 'connection.bling.conectada' });
}

export async function getConnection(orgId: string) {
  const [row] = await db
    .select({
      status: connections.status,
      expira_em: connections.expira_em,
      last_sync_at: connections.last_sync_at,
      access_token: connections.access_token,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, PROVIDER)))
    .limit(1);
  if (!row) return null;
  return {
    status: row.status,
    connected: row.status === 'ok' && row.access_token !== null,
    expira_em: row.expira_em,
    last_sync_at: row.last_sync_at,
  };
}

export async function getValidAccessToken(orgId: string): Promise<string> {
  const [row] = await db
    .select()
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, PROVIDER)))
    .limit(1);
  if (!row || !row.access_token || !row.refresh_token) {
    throw new Error('sem_conexao_bling');
  }

  const expMs = row.expira_em ? row.expira_em.getTime() : 0;
  if (expMs - Date.now() > REFRESH_MARGIN_MS) {
    return decryptSecret(row.access_token);
  }

  // precisa renovar
  try {
    const refreshed = await blingProvider.refresh(decryptSecret(row.refresh_token));
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
  } catch {
    await db
      .update(connections)
      .set({ status: 'expirado' })
      .where(eq(connections.id, row.id));
    throw new Error('refresh_bling_falhou');
  }
}

export async function disconnectBling(orgId: string): Promise<void> {
  await db
    .update(connections)
    .set({ access_token: null, refresh_token: null, status: 'erro' })
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, PROVIDER)));
  await recordAudit({ orgId, acao: 'connection.bling.desconectada' });
}
```

Criar `src/modules/providers/bling/provider.ts`:

```ts
import { buildAuthorizeUrl, exchangeCode, refreshTokens } from '@/modules/providers/bling/oauth';
import type { ConnectionProvider } from '@/modules/providers/types';

export const blingProvider: ConnectionProvider = {
  name: 'bling',
  buildAuthorizeUrl,
  exchangeCode,
  refresh: refreshTokens,
};
```

- [ ] **Step 4: Teste de integração do repository (falha primeiro)**

Criar `tests/integration/connection-repository.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { connections, organizations } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('connection.repository — integração', () => {
  let orgId = '';

  beforeAll(async () => {
    const [o] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-conn-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = o.id;
  });

  afterAll(async () => {
    await tdb.delete(connections).where(eq(connections.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('salva tokens cifrados (não em texto puro) e lê token válido', async () => {
    const { saveBlingConnection, getValidAccessToken } = await import(
      '@/modules/connections/connection.repository'
    );
    await saveBlingConnection(orgId, {
      accessToken: 'ACCESS-puro',
      refreshToken: 'REFRESH-puro',
      expiresInSeconds: 3600,
    });
    const [row] = await tdb
      .select()
      .from(connections)
      .where(eq(connections.org_id, orgId))
      .limit(1);
    expect(row.access_token).not.toContain('ACCESS-puro'); // cifrado
    expect(row.status).toBe('ok');
    // token ainda válido (1h) → retorna sem refresh
    expect(await getValidAccessToken(orgId)).toBe('ACCESS-puro');
  });

  it('faz refresh quando próximo de expirar', async () => {
    // expira já (0s) → força refresh
    const repo = await import('@/modules/connections/connection.repository');
    await repo.saveBlingConnection(orgId, {
      accessToken: 'velho',
      refreshToken: 'refresh-velho',
      expiresInSeconds: 0,
    });
    // mocka o provider.refresh
    const provider = await import('@/modules/providers/bling/provider');
    vi.spyOn(provider.blingProvider, 'refresh').mockResolvedValueOnce({
      accessToken: 'novo',
      refreshToken: 'refresh-novo',
      expiresInSeconds: 3600,
    });
    expect(await repo.getValidAccessToken(orgId)).toBe('novo');
  });

  it('lança sem_conexao_bling quando não há conexão', async () => {
    const repo = await import('@/modules/connections/connection.repository');
    await expect(repo.getValidAccessToken('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
      'sem_conexao_bling',
    );
  });
});
```

> Nota: o mock de `blingProvider.refresh` precisa atingir a MESMA instância importada pelo repository. Como o repository importa `blingProvider` no escopo do módulo, use `vi.spyOn` sobre o objeto exportado (mutável) ANTES de chamar `getValidAccessToken`, e garanta import dinâmico do repository após o spy se necessário. Ajuste para o mock ser efetivo de forma determinística.

- [ ] **Step 5: Rodar integração + typecheck**

Run: `npm run test -- tests/integration/connection-repository.test.ts` → PASS (3, não skipped). `npm run typecheck` limpo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(connections): OAuth Bling + repository com tokens cifrados e refresh automático"
```

---

### Task 4: Rotas OAuth + tracked_products + UI `/conexoes` + E2E

**Files:**
- Create: `src/modules/tracked-products/tracked-product.repository.ts`, `src/app/api/connections/bling/route.ts`, `src/app/api/connections/bling/callback/route.ts`, `src/actions/connections.actions.ts`, `src/app/(client)/conexoes/page.tsx`, `src/app/(client)/conexoes/tracked-products.tsx`
- Test: `tests/integration/tracked-product-repository.test.ts`, `tests/e2e/conexoes.spec.ts`
- Modify: `tests/e2e/helpers/db.ts` (helper p/ semear org ativa + login de cliente)

**Interfaces:**
- Consumes: `requireActiveOrg`, `getSessionContext`, `blingProvider`, `saveBlingConnection`/`getConnection`/`disconnectBling`, crypto, `recordAudit`, `Plano`.
- Produces:
  - `tracked-product.repository.ts`: `listTrackedProducts(orgId)`, `addTrackedProduct({orgId, nome, sku, keywords, plano})` (valida limite por plano → lança `Error('limite_tracked_products')`), `toggleTrackedProduct({orgId, id, ativo})`, `removeTrackedProduct({orgId, id})`. `TRACKED_LIMITS: Record<Plano, number>` = `{ weekly: 10, biweekly: 20, monthly: 30 }`. Todas filtram por `org_id`.
  - `connections.actions.ts`: `disconnectBlingAction`, `addTrackedProductAction`, `toggleTrackedProductAction`, `removeTrackedProductAction` (Server Actions; `requireActiveOrg`; `org_id` da sessão; `revalidatePath('/conexoes')`).
  - Rotas: `GET /api/connections/bling` (gera `state`, seta cookie httpOnly, redireciona p/ `buildAuthorizeUrl`); `GET /api/connections/bling/callback` (valida `state` vs cookie, troca `code`, `saveBlingConnection`, redireciona `/conexoes`).

- [ ] **Step 1: Repository de tracked_products**

Criar `src/modules/tracked-products/tracked-product.repository.ts`:

```ts
import { and, count, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { trackedProducts } from '@/db/schema';
import type { Plano } from '@/modules/auth/user.types';

export const TRACKED_LIMITS: Record<Plano, number> = {
  weekly: 10,
  biweekly: 20,
  monthly: 30,
};

export async function listTrackedProducts(orgId: string) {
  return db
    .select()
    .from(trackedProducts)
    .where(eq(trackedProducts.org_id, orgId))
    .orderBy(trackedProducts.created_at);
}

export async function addTrackedProduct(input: {
  orgId: string;
  nome: string;
  sku: string | null;
  keywords: string[];
  plano: Plano;
}): Promise<void> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(trackedProducts)
    .where(eq(trackedProducts.org_id, input.orgId));
  if (n >= TRACKED_LIMITS[input.plano]) {
    throw new Error('limite_tracked_products');
  }
  await db.insert(trackedProducts).values({
    org_id: input.orgId,
    nome: input.nome,
    sku: input.sku,
    keywords: input.keywords,
  });
}

export async function toggleTrackedProduct(input: {
  orgId: string;
  id: string;
  ativo: boolean;
}): Promise<void> {
  await db
    .update(trackedProducts)
    .set({ ativo: input.ativo })
    .where(and(eq(trackedProducts.id, input.id), eq(trackedProducts.org_id, input.orgId)));
}

export async function removeTrackedProduct(input: {
  orgId: string;
  id: string;
}): Promise<void> {
  await db
    .delete(trackedProducts)
    .where(and(eq(trackedProducts.id, input.id), eq(trackedProducts.org_id, input.orgId)));
}
```

- [ ] **Step 2: Rotas OAuth Bling**

Criar `src/app/api/connections/bling/route.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { getSessionContext } from '@/modules/auth/session';
import { blingProvider } from '@/modules/providers/bling/provider';

export async function GET() {
  const access = await getSessionContext();
  if (!access || access.orgStatus !== 'active') {
    return NextResponse.redirect(new URL('/sign-in', process.env.APP_URL ?? 'http://localhost:3000'));
  }
  try {
    const state = randomBytes(16).toString('hex');
    cookies().set('bling_oauth_state', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
    return NextResponse.redirect(blingProvider.buildAuthorizeUrl(state));
  } catch {
    return NextResponse.redirect(
      new URL('/conexoes?erro=bling_indisponivel', process.env.APP_URL ?? 'http://localhost:3000'),
    );
  }
}
```

Criar `src/app/api/connections/bling/callback/route.ts`:

```ts
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { getSessionContext } from '@/modules/auth/session';
import { saveBlingConnection } from '@/modules/connections/connection.repository';
import { blingProvider } from '@/modules/providers/bling/provider';

export async function GET(req: NextRequest) {
  const base = process.env.APP_URL ?? 'http://localhost:3000';
  const access = await getSessionContext();
  if (!access || access.orgStatus !== 'active') {
    return NextResponse.redirect(new URL('/sign-in', base));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = cookies().get('bling_oauth_state')?.value;
  cookies().delete('bling_oauth_state');

  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL('/conexoes?erro=state_invalido', base));
  }

  try {
    const tokens = await blingProvider.exchangeCode(code);
    await saveBlingConnection(access.orgId, tokens);
    return NextResponse.redirect(new URL('/conexoes?ok=1', base));
  } catch {
    return NextResponse.redirect(new URL('/conexoes?erro=falha_conexao', base));
  }
}
```

- [ ] **Step 3: Server Actions**

Criar `src/actions/connections.actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { disconnectBling } from '@/modules/connections/connection.repository';
import {
  addTrackedProduct,
  removeTrackedProduct,
  toggleTrackedProduct,
} from '@/modules/tracked-products/tracked-product.repository';
import type { Plano } from '@/modules/auth/user.types';

export type ConnState = { error?: string; ok?: boolean };

export async function disconnectBlingAction(): Promise<ConnState> {
  const access = await requireActiveOrg();
  await disconnectBling(access.orgId);
  revalidatePath('/conexoes');
  return { ok: true };
}

export async function addTrackedProductAction(
  _prev: ConnState,
  formData: FormData,
): Promise<ConnState> {
  const access = await requireActiveOrg();
  const nome = String(formData.get('nome') ?? '').trim();
  const sku = String(formData.get('sku') ?? '').trim() || null;
  const keywords = String(formData.get('keywords') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (nome.length < 2) return { error: 'Informe o nome do produto.' };

  try {
    await addTrackedProduct({
      orgId: access.orgId,
      nome,
      sku,
      keywords,
      plano: (access as { plano?: Plano }).plano ?? 'monthly',
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'limite_tracked_products') {
      return { error: 'Limite de produtos do seu plano atingido.' };
    }
    throw e;
  }
  revalidatePath('/conexoes');
  return { ok: true };
}

export async function toggleTrackedProductAction(
  _prev: ConnState,
  formData: FormData,
): Promise<ConnState> {
  const access = await requireActiveOrg();
  const id = String(formData.get('id') ?? '');
  const ativo = String(formData.get('ativo') ?? '') === 'true';
  if (!id) return { error: 'Produto inválido.' };
  await toggleTrackedProduct({ orgId: access.orgId, id, ativo });
  revalidatePath('/conexoes');
  return { ok: true };
}

export async function removeTrackedProductAction(
  _prev: ConnState,
  formData: FormData,
): Promise<ConnState> {
  const access = await requireActiveOrg();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'Produto inválido.' };
  await removeTrackedProduct({ orgId: access.orgId, id });
  revalidatePath('/conexoes');
  return { ok: true };
}
```

> Nota: `requireActiveOrg` hoje retorna `UserAccess` (sem `plano`). O `plano` da org é necessário para o limite. Ajuste mínimo permitido: estender `getUserAccessById`/`UserAccess` para incluir `plano` (a query já faz join em organizations — adicionar `plano: organizations.plano`). Se preferir não tocar no Plano 1/2, busque o plano da org no repo de admin (`getOrganizationById`) dentro da action. Aplique a opção mais limpa; documente no report.

- [ ] **Step 4: UI `/conexoes`**

Criar `src/app/(client)/conexoes/page.tsx`:

```tsx
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getConnection } from '@/modules/connections/connection.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { TrackedProducts } from './tracked-products';

export default async function ConexoesPage() {
  const access = await requireActiveOrg();
  const conn = await getConnection(access.orgId);
  const produtos = await listTrackedProducts(access.orgId);

  return (
    <main className="p-8">
      <h1 className="mb-4 text-xl font-semibold">Conexões</h1>

      <section className="mb-8">
        <h2 className="mb-2 font-medium">Bling</h2>
        {conn?.connected ? (
          <p data-testid="bling-status" className="text-green-700">Conectado ✓</p>
        ) : (
          <div>
            <p data-testid="bling-status" className="mb-2 text-gray-600">Não conectado</p>
            <a href="/api/connections/bling" className="bg-black px-3 py-2 text-white">
              Conectar Bling
            </a>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">Produtos monitorados</h2>
        <TrackedProducts produtos={produtos.map((p) => ({ id: p.id, nome: p.nome, sku: p.sku, ativo: p.ativo }))} />
      </section>
    </main>
  );
}
```

Criar `src/app/(client)/conexoes/tracked-products.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import {
  addTrackedProductAction,
  removeTrackedProductAction,
  type ConnState,
} from '@/actions/connections.actions';

const initial: ConnState = {};

type Produto = { id: string; nome: string; sku: string | null; ativo: boolean };

export function TrackedProducts({ produtos }: { produtos: Produto[] }) {
  const [addState, add] = useFormState(addTrackedProductAction, initial);
  const [rmState, remove] = useFormState(removeTrackedProductAction, initial);

  return (
    <div>
      <form action={add} className="mb-4 flex flex-wrap gap-2" data-testid="add-form">
        <input name="nome" placeholder="Nome do produto" className="border p-1" />
        <input name="sku" placeholder="SKU (opcional)" className="border p-1" />
        <input name="keywords" placeholder="palavras-chave, separadas, por vírgula" className="border p-1" />
        <button type="submit" className="bg-black px-2 text-white">Adicionar</button>
      </form>
      {addState.error ? <p className="text-sm text-red-600">{addState.error}</p> : null}
      {rmState.error ? <p className="text-sm text-red-600">{rmState.error}</p> : null}

      <ul className="flex flex-col gap-1">
        {produtos.map((p) => (
          <li key={p.id} data-testid={`produto-${p.id}`} className="flex items-center gap-2">
            <span>{p.nome}{p.sku ? ` (${p.sku})` : ''}</span>
            <form action={remove}>
              <input type="hidden" name="id" value={p.id} />
              <button type="submit" className="border px-2 text-sm">Remover</button>
            </form>
          </li>
        ))}
        {produtos.length === 0 ? <li className="text-gray-500">Nenhum produto ainda.</li> : null}
      </ul>
    </div>
  );
}
```

- [ ] **Step 5: Teste de integração tracked_products (falha primeiro)**

Criar `tests/integration/tracked-product-repository.test.ts` (cobre: add, list por org, isolamento, toggle/remove, e limite por plano — semeie uma org `weekly` e tente passar de `TRACKED_LIMITS.weekly`). Use o padrão dos outros testes de integração (`describe.skipIf(!url)`, prefixo `ta-test-tp-`, cleanup em `afterAll`). Asserts mínimos:
- `addTrackedProduct` cria e `listTrackedProducts` devolve só os da org.
- adicionar além de `TRACKED_LIMITS.weekly` (10) lança `limite_tracked_products`.
- `toggleTrackedProduct`/`removeTrackedProduct` afetam só a linha da org correta.

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, trackedProducts } from '@/db/schema';
import {
  addTrackedProduct,
  listTrackedProducts,
  removeTrackedProduct,
  TRACKED_LIMITS,
} from '@/modules/tracked-products/tracked-product.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('tracked-product.repository — integração', () => {
  let orgId = '';

  beforeAll(async () => {
    const [o] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-tp-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgId = o.id;
  });

  afterAll(async () => {
    await tdb.delete(trackedProducts).where(eq(trackedProducts.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('adiciona e lista por org', async () => {
    await addTrackedProduct({ orgId, nome: 'Produto A', sku: 'A1', keywords: ['a'], plano: 'weekly' });
    const list = await listTrackedProducts(orgId);
    expect(list.length).toBe(1);
    expect(list[0].nome).toBe('Produto A');
  });

  it('respeita o limite do plano', async () => {
    // já tem 1; adiciona até o limite weekly (10) e a próxima falha
    for (let i = list_count_placeholder(); i < TRACKED_LIMITS.weekly; i++) {
      await addTrackedProduct({ orgId, nome: `P${i}`, sku: null, keywords: [], plano: 'weekly' });
    }
    await expect(
      addTrackedProduct({ orgId, nome: 'excedente', sku: null, keywords: [], plano: 'weekly' }),
    ).rejects.toThrow('limite_tracked_products');
  });

  it('remove só a linha da org', async () => {
    const [p] = await listTrackedProducts(orgId);
    await removeTrackedProduct({ orgId, id: p.id });
    const after = await listTrackedProducts(orgId);
    expect(after.find((x) => x.id === p.id)).toBeUndefined();
  });
});

function list_count_placeholder() {
  return 1; // já existe 1 produto do teste anterior nesta mesma org/run
}
```

> Ajuste o laço para a contagem real existente (o `beforeAll` não cria produtos; o 1º teste cria 1). Mantenha os testes determinísticos e independentes da ordem se possível (ou documente a dependência de ordem como os testes de rate-limit do Plano 2 fazem).

- [ ] **Step 6: E2E `/conexoes`**

Em `tests/e2e/helpers/db.ts`, adicionar `seedE2EActiveClient(email, senha): Promise<void>` (cria org `active` com `plano='weekly'` + user `client` com senha hash). Criar `tests/e2e/conexoes.spec.ts`: loga como cliente ativo → `/conexoes` → vê "Não conectado" (sem Bling configurado) → adiciona um produto monitorado → vê o produto na lista → remove. (O fluxo OAuth real do Bling NÃO é exercido no E2E — exige app Bling registrado; coberto por unit/integration com mock.)

- [ ] **Step 7: Verificações + main limpo**

Run: `npm run test` (todas), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e`.
Verificar `main` sem linhas de teste (orgs/connections/tracked_products):

```bash
node -e 'const p=require("postgres");const fs=require("fs");const u=fs.readFileSync(".env.local","utf8").match(/^POSTGRES_URL=(.*)$/m)[1];const sql=p(u,{prepare:false});(async()=>{try{const o=await sql`select count(*)::int n from organizations`;const c=await sql`select count(*)::int n from connections`;const t=await sql`select count(*)::int n from tracked_products`;console.log("MAIN orgs:",o[0].n,"connections:",c[0].n,"tracked:",t[0].n);}finally{await sql.end();}})()'
```

Expected `MAIN orgs: 0 connections: 0 tracked: 0`. Se não, PARAR.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(connections): rotas OAuth Bling + tracked_products + UI /conexoes + E2E"
```

---

## Self-Review

**1. Cobertura do spec (§3.3 Conexões + §6 segurança):**
- OAuth Bling v3, tokens cifrados AES-256-GCM (chave em env), refresh automático → Tasks 1, 3. ✅
- `tracked_products` (nome, sku, keywords) → Tasks 2, 4. ✅
- Camada `providers/` com interface comum (fase 2) → `ConnectionProvider` (Task 3). ✅
- Isolamento multi-tenant por `org_id` + gating → todas as queries filtram por org da sessão. ✅
- Limite de tracked_products por plano (risco §9) → `TRACKED_LIMITS` (Task 4). ✅

**2. Lacunas conscientes / deferidas:**
- **`fetchOrders`/coleta de pedidos** é do pipeline (Plano 4); aqui só conexão + token + tracked_products. A interface `ConnectionProvider` pode ganhar `fetchOrders` no Plano 4.
- **Smoke test do OAuth real** depende do Matheus registrar o app Bling (credenciais env). Todo o fluxo é testado com mock; a verificação real fica deferida.
- **Confirmar os dois caminhos exatos do OAuth** (`/oauth/authorize`, `/oauth/token`) contra a doc viva na Task 3.
- Conexão de mercado (ML/SerpAPI) NÃO é deste plano (entra no pipeline/Plano 4 como coleta de mercado) — aqui só a integração do cliente (Bling) + os tracked_products que alimentam aquela coleta.

**3. Consistência de tipos:** `OAuthTokens`/`ConnectionProvider` (Task 3) consumidos pelo repository e rotas. `Plano` reusado. `TRACKED_LIMITS: Record<Plano, number>`. Ajuste de `UserAccess.plano` (se adotado) documentado na Task 4/Step 3.

---

## Execução

**Plano salvo em `docs/superpowers/plans/2026-06-24-conexoes-bling.md`.** Execução: subagent-driven (implementer + review por task; revisão ampla ao final). Credenciais Bling deferidas; cripto/OAuth/tracked_products testados com mock contra o branch Neon `test`.
