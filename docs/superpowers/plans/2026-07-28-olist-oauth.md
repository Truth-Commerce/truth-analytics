# Olist ERP OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que cliente e analista responsável configurem e autorizem o Olist ERP (antigo Tiny), com OAuth 2.0 + PKCE, segredos cifrados e refresh automático, sem ativar ingestão Olist.

**Architecture:** Um registry OAuth separado registra o adapter Olist, enquanto o registry operacional continua somente com Bling. Credenciais e tokens ficam na conexão por organização, cifrados com contexto de tenant; state assinado, PKCE e guards revalidados protegem início/callback. Um card compartilhado atende cliente e analista, e um cron provider-aware renova tokens mantendo Olist em `configurado`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM, PostgreSQL, Zod, Vitest, Playwright, GitHub Actions.

## Global Constraints

- Seguir TDD: cada comportamento novo precisa falhar pelo motivo esperado antes da implementação.
- Cliente fornece `client_id`/`client_secret` do aplicativo criado na própria conta Olist.
- Callback única: `${APP_URL}/api/connections/olist/callback`; nunca derivar de `Host`, query ou `Referer`.
- OAuth Authorization Code com `scope=openid`, state assinado, PKCE S256 e cookie HttpOnly/SameSite=Lax/Secure em HTTPS por 10 minutos.
- Toda mutação, início e callback revalidam sessão, organização ativa, ausência de impersonação e acesso via `assertOrgAccess` quando staff.
- Credenciais/tokens são cifrados e vinculados a organização, provider e finalidade; nunca entram em summary, HTML, audit ou log.
- Olist autorizado permanece `status='configurado'`; `status='ok'` continua reservado ao ERP operacional.
- Bling continua sendo o único registry/data provider e a única fonte de pedidos, estoque, métricas e relatórios.
- Refresh: access token 4h, refresh token 1 dia, margem 3h, cron a cada 2h, lote 50 e uma repetição para falha transitória.
- Não criar migração, implementar pedidos/estoque Olist nem refatorar o OAuth Bling nesta etapa.

---

### Task 1: Contrato e adapter OAuth Olist

**Files:**
- Modify: `src/modules/providers/types.ts`
- Create: `src/modules/providers/oauth.types.ts`
- Create: `src/modules/providers/olist/oauth.ts`
- Create: `src/modules/providers/olist/provider.ts`
- Create: `src/modules/providers/oauth-registry.ts`
- Test: `tests/unit/olist-oauth.test.ts`
- Test: `tests/unit/oauth-registry.test.ts`

**Interfaces:**
- Produces: `OAuthConnectionProvider`, `OAuthClientCredentials`, `OAuthProviderError`.
- Produces: `olistOAuthProvider`, `getOAuthProvider(provider)`, `listRegisteredOAuthProviders()`.
- Extends: `OAuthTokens.refreshExpiresInSeconds?: number`.
- Preserves: `getErpProvider('olist')` still throws and `listRegisteredErpProviders()` remains `['bling']`.

- [ ] **Step 1: Write failing adapter and registry tests**

Cover these exact assertions:

```ts
const credentials = {
  clientId: 'olist-client',
  clientSecret: 'olist-secret',
  redirectUri: 'https://truth-analytics.vercel.app/api/connections/olist/callback',
};
const url = new URL(olistOAuthProvider.buildAuthorizeUrl({
  credentials,
  state: 'state-1',
  codeChallenge: 'challenge-1',
}));
expect(url.origin + url.pathname).toBe(
  'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth',
);
expect(Object.fromEntries(url.searchParams)).toMatchObject({
  client_id: 'olist-client', redirect_uri: credentials.redirectUri,
  response_type: 'code', scope: 'openid', state: 'state-1',
  code_challenge: 'challenge-1', code_challenge_method: 'S256',
});
expect(listRegisteredOAuthProviders()).toEqual(['olist']);
expect(getOAuthProvider('olist')).toBe(olistOAuthProvider);
expect(listRegisteredErpProviders()).toEqual(['bling']);
expect(() => getErpProvider('olist')).toThrow('erp_provider_nao_registrado:olist');
```

Mock `fetch` and assert exchange body contains `authorization_code`, credentials, fixed redirect URI, code and `code_verifier`; refresh body contains `refresh_token` and credentials. Assert a valid response maps `refresh_expires_in`, an absent value defaults to `86400`, invalid token JSON throws `olist_token_resposta_invalida`, 400/401 are permanent, and network/429/5xx retry once then throw the transient code.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/olist-oauth.test.ts tests/unit/oauth-registry.test.ts
```

Expected: imports do not exist.

- [ ] **Step 3: Implement the minimal typed adapter**

Use these endpoints and request contract:

```ts
const AUTHORIZE_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/auth';
const TOKEN_URL = 'https://accounts.tiny.com.br/realms/tiny/protocol/openid-connect/token';

export const olistOAuthProvider: OAuthConnectionProvider = {
  name: 'olist',
  buildAuthorizeUrl,
  exchangeCode,
  refresh,
};
```

Define `OAuthProviderError` with `code` and `kind: 'permanent' | 'transient'`. Never include response body or credential values in the error. Retry transient failures once, honoring numeric `Retry-After` up to 30 seconds. Register only Olist in `oauth-registry.ts`.

- [ ] **Step 4: Verify GREEN and Bling isolation**

```powershell
npm test -- tests/unit/olist-oauth.test.ts tests/unit/oauth-registry.test.ts tests/unit/bling-oauth.test.ts tests/unit/provider-registry.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/providers tests/unit/olist-oauth.test.ts tests/unit/oauth-registry.test.ts
git commit -m "feat(olist): adicionar adapter OAuth isolado"
```

---

### Task 2: Segredos tenant-bound, state assinado e PKCE

**Files:**
- Create: `src/modules/connections/connection-secrets.ts`
- Create: `src/modules/connections/olist-oauth-attempt.ts`
- Test: `tests/unit/connection-secrets.test.ts`
- Test: `tests/unit/olist-oauth-attempt.test.ts`

**Interfaces:**
- Produces: `encryptConnectionSecret(input)` and `decryptConnectionSecret(input)`.
- Produces: `createOlistOAuthAttempt(input)`, `verifyOlistOAuthAttempt(input)`.
- Produces: `OLIST_OAUTH_COOKIE`, `OLIST_OAUTH_TTL_SECONDS`, `olistCallbackUri()` and allowlisted return paths.

- [ ] **Step 1: Write failing security tests**

```ts
const encrypted = encryptConnectionSecret({
  orgId: 'org-a', provider: 'olist', kind: 'client_secret', value: 'secret-value',
});
expect(encrypted).not.toContain('secret-value');
expect(decryptConnectionSecret({
  orgId: 'org-a', provider: 'olist', kind: 'client_secret', ciphertext: encrypted,
})).toBe('secret-value');
expect(() => decryptConnectionSecret({
  orgId: 'org-b', provider: 'olist', kind: 'client_secret', ciphertext: encrypted,
})).toThrow('connection_secret_context_mismatch');
```

For attempts, freeze time and assert state/verifier have at least 43 base64url characters, challenge equals `base64url(sha256(verifier))`, valid signed payload verifies, and each of these returns `null`: changed signature, changed state, age over 600 seconds, wrong provider, wrong expected user, wrong expected organization. Assert return path accepts only `client_connections` and `analyst_org`.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/connection-secrets.test.ts tests/unit/olist-oauth-attempt.test.ts
```

- [ ] **Step 3: Implement encrypted context and signed attempt**

Encrypt this JSON through existing `encryptSecret`:

```ts
type ConnectionSecretEnvelope = {
  v: 1; orgId: string; provider: ErpProviderId;
  kind: 'client_id' | 'client_secret' | 'access_token' | 'refresh_token';
  value: string;
};
```

Create state/verifier with `randomBytes(32).toString('base64url')`; sign the base64url JSON payload with `createHmac('sha256', serverEnv.AUTH_SECRET)`. Verify signature and state using equal-length buffers plus `timingSafeEqual`. Derive callback with:

```ts
export function olistCallbackUri(): string {
  return new URL('/api/connections/olist/callback', serverEnv.APP_URL).toString();
}
```

- [ ] **Step 4: Verify GREEN**

```powershell
npm test -- tests/unit/connection-secrets.test.ts tests/unit/olist-oauth-attempt.test.ts tests/unit/crypto.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/connections/connection-secrets.ts src/modules/connections/olist-oauth-attempt.ts tests/unit/connection-secrets.test.ts tests/unit/olist-oauth-attempt.test.ts
git commit -m "feat(olist): proteger segredos state e PKCE"
```

---

### Task 3: Guard de acesso e repositório provider-aware

**Files:**
- Create: `src/modules/connections/connection-access.ts`
- Create: `src/modules/connections/provider-connection.repository.ts`
- Test: `tests/unit/connection-access.test.ts`
- Test: `tests/integration/olist-connection-repository.test.ts`

**Interfaces:**
- Produces: `assertConnectionOrgAccess(access, orgId, surface): Promise<void>`.
- Produces all repository functions listed in the design.
- Preserves: every export in `connection.repository.ts` and all Bling behavior.

- [ ] **Step 1: Write failing access and persistence tests**

Mock `assertNaoImpersonando`, `assertOrgAccess` and organization lookup. Assert client-own/client surface passes, client-other fails, analyst assigned/analyst surface passes, wrong surface fails, suspended target fails, and impersonation fails before repository access.

In the PostgreSQL integration suite, seed two active organizations and assert:

```ts
await configureProviderCredentials({
  orgId, provider: 'olist', clientId: 'client-plain', clientSecret: 'secret-plain', actorUserId,
});
const [stored] = await db.select().from(connections)
  .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'olist')));
expect(stored.status).toBe('configurado');
expect(stored.oauth_client_id).not.toContain('client-plain');
expect(stored.oauth_client_secret).not.toContain('secret-plain');
expect(JSON.stringify(await getProviderConnectionSummary(orgId, 'olist')))
  .not.toMatch(/client-plain|secret-plain/);
```

Also assert: Bling `ok` coexists; saving tokens keeps Olist `configurado`; wrong credential version returns `false`; replacing credentials clears tokens; disconnect clears all four secret columns; tenant A ciphertext fails in tenant B; audits contain actor/action but no secret; an Olist summary has `operational: false`.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/connection-access.test.ts tests/integration/olist-connection-repository.test.ts
```

- [ ] **Step 3: Implement guard and repository**

Use `assertNaoImpersonando()` first. Clients require matching `orgId`; analyst/admin paths call `assertOrgAccess`; all paths query target organization and require `active`.

Compute the internal credential version as SHA-256 over the two stored ciphertexts. `saveProviderTokens` must update with conditions on org, provider and the exact credential ciphertexts read for that version. Set:

```ts
{
  access_token: encryptConnectionSecret(...),
  refresh_token: encryptConnectionSecret(...),
  expira_em: new Date(now + tokens.expiresInSeconds * 1000),
  refresh_expira_em: new Date(now + (tokens.refreshExpiresInSeconds ?? 86400) * 1000),
  last_refresh_at: now,
  last_error_code: null,
  last_error_at: null,
  status: 'configurado',
}
```

- [ ] **Step 4: Verify GREEN and legacy repository**

```powershell
npm test -- tests/unit/connection-access.test.ts tests/integration/olist-connection-repository.test.ts tests/integration/connection-repository.test.ts tests/integration/provider-foundation-schema.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/connections/connection-access.ts src/modules/connections/provider-connection.repository.ts tests/unit/connection-access.test.ts tests/integration/olist-connection-repository.test.ts
git commit -m "feat(olist): persistir conexão OAuth por organização"
```

---

### Task 4: Server Actions e rotas OAuth seguras

**Files:**
- Create: `src/actions/olist-connections.actions.ts`
- Create: `src/app/api/connections/olist/route.ts`
- Create: `src/app/api/connections/olist/callback/route.ts`
- Test: `tests/unit/olist-connections-actions.test.ts`
- Test: `tests/unit/olist-oauth-routes.test.ts`

**Interfaces:**
- Produces: `saveOlistCredentialsAction`, `disconnectOlistAction`, `OlistConnectionActionState`.
- GET start consumes only UUID `orgId` and allowlisted `surface`.
- Callback consumes only the signed cookie plus Olist `code/state/error`.

- [ ] **Step 1: Write failing action and route tests**

For actions, assert Zod rejects blank/oversized credentials, access guard runs before repository mutation, the browser cannot change provider, success revalidates only the derived surface, repository codes map to safe Portuguese messages, and returned state never contains credentials.

For routes, mock session, cookie store, guard, repository and adapter. Assert:

- unauthenticated requests redirect to sign-in;
- invalid org/surface never reads credentials;
- start sets `olist_oauth_attempt` with `httpOnly`, `sameSite: 'lax'`, `maxAge: 600`, callback path and Secure under HTTPS;
- authorize receives state, challenge, fixed callback and decrypted credentials;
- callback deletes cookie before exchange;
- missing/tampered/expired state rejects without exchange;
- user mismatch, revoked portfolio access or credential-version mismatch never saves tokens;
- `error=access_denied` becomes `olist_autorizacao_negada`;
- success saves with compare-and-swap and returns to the signed surface.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/olist-connections-actions.test.ts tests/unit/olist-oauth-routes.test.ts
```

- [ ] **Step 3: Implement actions and routes**

The start route must execute in this order: session → parse query → access guard → credentials → create attempt → set cookie → redirect. The callback order is: session → read and delete cookie → verify signed attempt/state/actor → access guard → reload matching credentials → exchange with verifier → conditional save → derived redirect.

Use `serverEnv.APP_URL` for every local redirect. Catch only known safe codes; unexpected failures map to `olist_oauth_transiente` and log only event, provider, orgId and allowlisted code.

- [ ] **Step 4: Verify GREEN**

```powershell
npm test -- tests/unit/olist-connections-actions.test.ts tests/unit/olist-oauth-routes.test.ts tests/unit/bling-oauth.test.ts tests/unit/callback-feedback.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/actions/olist-connections.actions.ts src/app/api/connections/olist tests/unit/olist-connections-actions.test.ts tests/unit/olist-oauth-routes.test.ts
git commit -m "feat(olist): concluir fluxo OAuth seguro"
```

---

### Task 5: Card compartilhado nas superfícies cliente e analista

**Files:**
- Create: `src/components/connections/olist-connection-card.tsx`
- Create: `src/components/connections/olist-feedback.ts`
- Modify: `src/app/(client)/conexoes/page.tsx`
- Modify: `src/app/analista/[orgId]/page.tsx`
- Modify: `src/components/ui/Tabs.tsx`
- Modify: `tests/e2e/helpers/db.ts`
- Test: `tests/unit/olist-connection-card.test.ts`
- Test: `tests/unit/olist-feedback.test.ts`
- Test: `tests/e2e/olist-connections.spec.ts`

**Interfaces:**
- Produces one `OlistConnectionCard` configured by `orgId`, `surface`, `summary`, `redirectUri`.
- Extends `Tabs` with a controlled initial value derived from `?tab=conexao`, preserving current default behavior.

- [ ] **Step 1: Write failing UI and E2E tests**

Static markup tests assert the card contains “Olist ERP (antigo Tiny)”, exact callback, read-only permissions guidance, password secret field with `autocomplete="off"`, warning “relatórios continuam usando Bling”, correct status/CTA, and no supplied secret value.

Feedback tests cover success and every allowlisted error with generic fallback guarded by `hasOwnProperty`.

E2E seeds one client and assigned analyst. Assert the client saves credentials in `/conexoes`, sees “Credenciais salvas” and an authorize link; page HTML does not contain the secret. Log in as the assigned analyst, open `/analista/{orgId}?tab=conexao`, assert the connection tab/card is visible, and save replacement credentials. A second unassigned analyst must receive 404 for the same organization.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/unit/olist-connection-card.test.ts tests/unit/olist-feedback.test.ts
npm run test:e2e -- tests/e2e/olist-connections.spec.ts
```

- [ ] **Step 3: Implement shared card and page wiring**

The client page loads `getProviderConnectionSummary(access.orgId, 'olist')`. The analyst page keeps its existing `assertOrgAccess`, loads the same summary for `orgId`, and adds a `conexao` tab. Only show inputs when unconfigured or after “Alterar credenciais”; never pass decrypted credentials to React. Build authorize href from encoded org and surface.

Update `Tabs` so a changed valid `defaultValue` from navigation activates that tab; ignore values absent from `items`. Preserve arrow-key semantics and ARIA attributes.

- [ ] **Step 4: Verify GREEN and existing navigation**

```powershell
npm test -- tests/unit/olist-connection-card.test.ts tests/unit/olist-feedback.test.ts tests/unit/next16-ui-state.test.ts
npm run test:e2e -- tests/e2e/olist-connections.spec.ts tests/e2e/conexoes.spec.ts tests/e2e/analista-navegacao.spec.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/components/connections src/app/\(client\)/conexoes/page.tsx src/app/analista src/components/ui/Tabs.tsx tests/unit/olist-connection-card.test.ts tests/unit/olist-feedback.test.ts tests/e2e
git commit -m "feat(olist): expor conexão para cliente e analista"
```

---

### Task 6: Refresh concorrente, notificações e cron a cada 2 horas

**Files:**
- Modify: `src/modules/connections/provider-connection.repository.ts`
- Create: `src/modules/connections/olist-token-renewal.ts`
- Create: `src/app/api/cron/renovar-conexoes/route.ts`
- Modify: `src/modules/notifications/templates.ts`
- Modify: `src/modules/notifications/email.ts`
- Modify: `src/modules/admin/operacoes-view.ts`
- Modify: `.github/workflows/crons.yml`
- Test: `tests/integration/olist-token-renewal.test.ts`
- Test: `tests/unit/renovar-conexoes-route.test.ts`
- Modify: `tests/unit/operacoes-view.test.ts`

**Interfaces:**
- Produces: `renewOlistConnection(orgId): Promise<'renewed' | 'expired' | 'transient' | 'won-by-peer'>`.
- Produces: `OLIST_REFRESH_MARGIN_MS = 10_800_000`, `OLIST_REFRESH_BATCH = 50`.
- Produces heartbeat route `renovar-conexoes` with four safe counters.

- [ ] **Step 1: Write failing refresh and cron tests**

Integration tests assert valid access outside margin returns without HTTP; refresh success rotates both encrypted tokens and keeps `configurado`; transient error preserves tokens/status and writes safe error code; permanent error with unchanged versions writes `expirado`; a simulated peer update before success/error is neither overwritten nor expired and returns `won-by-peer`.

Assert candidate listing selects only active-org Olist rows with `status='configurado'`, both tokens, expiry inside 3h; orders earliest first and limits 50.

Route tests assert bad/missing `CRON_SECRET` is 401, processing is sequential, one org failure does not abort the batch, response/heartbeat are exactly `{ candidatas, renovadas, expiradas, transitorias }`, and logs contain no token/credential/body. Notification tests assert permanent failure warns client and assigned analyst best-effort; transient/success do not notify.

- [ ] **Step 2: Run tests and verify RED**

```powershell
npm test -- tests/integration/olist-token-renewal.test.ts tests/unit/renovar-conexoes-route.test.ts tests/unit/operacoes-view.test.ts
```

- [ ] **Step 3: Implement refresh and scheduled route**

Use compare-and-swap on exact refresh and credential ciphertexts. On CAS loss, reread and return the peer's valid token. Before permanent status update, repeat the version comparison. Add provider-aware notification copy with client href `/conexoes` and analyst href `/analista/{orgId}?tab=conexao`.

Add to the workflow:

```yaml
- cron: "17 */2 * * *" # renovar-conexoes
```

Map that schedule to `renovar-conexoes`. Add `bihorario` to `TipoCadencia`, a 150-minute freshness tolerance, and the seventh route to `CADENCIA_POR_ROTA`.

- [ ] **Step 4: Verify GREEN**

```powershell
npm test -- tests/integration/olist-token-renewal.test.ts tests/unit/renovar-conexoes-route.test.ts tests/unit/operacoes-view.test.ts tests/integration/token-renewal.test.ts tests/unit/sincronizar-pedidos-route.test.ts
npm run typecheck
```

- [ ] **Step 5: Commit**

```powershell
git add src/modules/connections src/app/api/cron/renovar-conexoes src/modules/notifications src/modules/admin/operacoes-view.ts .github/workflows/crons.yml tests/integration/olist-token-renewal.test.ts tests/unit/renovar-conexoes-route.test.ts tests/unit/operacoes-view.test.ts
git commit -m "feat(olist): renovar tokens automaticamente"
```

---

### Task 7: Documentação, segurança e gate completo

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-07-28-olist-oauth.md`

**Interfaces:**
- Documents: criação do app por cliente, callback fixa, permissões, estados e cron.
- States explicitly: Olist autorizado ainda não importa dados; Bling remains operational.

- [ ] **Step 1: Update operator documentation**

Document the exact production callback, how client/analyst configure, read-only permissions, 4h/1d token lifetime, 2h refresh cadence, safe disconnect/secret rotation, and the next phase (orders/details). Do not publish credential examples that resemble real secrets.

- [ ] **Step 2: Scan scope and secret exposure**

```powershell
rg -n "client_secret|access_token|refresh_token" src tests README.md
rg -n "getErpProvider\('olist'\)|fetchOrders|fetchStock" src/modules/providers src/modules/pipeline
git diff --check
```

Expected: secret field names appear only in server persistence/protocol/tests; no values reach logs/UI/audit; Olist has no data-provider registration or ingestion call.

- [ ] **Step 3: Run the full gate**

```powershell
npm run db:generate
npm run lint
npm run typecheck
npm run test:ci
npm run build
npm run test:e2e
git diff --check
```

Expected: `db:generate` reports no schema changes; lint has zero errors; all tests, build and E2E pass. Any pre-existing warning is reported and no new warning is introduced.

- [ ] **Step 4: Review rollback invariants**

Confirm the diff has no migration, Olist never becomes `ok`, Bling tests remain green, callback uses only `APP_URL`, all mutation paths call the shared guard, remote bodies are never logged, and removing the new code leaves Olist rows inert.

- [ ] **Step 5: Commit documentation**

```powershell
git add README.md docs/superpowers/plans/2026-07-28-olist-oauth.md
git commit -m "docs(olist): documentar conexão OAuth"
```

## Execution Handoff

Execute with `superpowers:subagent-driven-development`, one task at a time, with specification-compliance and code-quality review after every task. Use an isolated worktree created through `superpowers:using-git-worktrees`. Do not merge or deploy until CI, PostgreSQL integration tests and the full Playwright suite are green.
