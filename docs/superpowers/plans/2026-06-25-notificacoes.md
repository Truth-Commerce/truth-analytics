# Notificações (Resend) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Completar o módulo de notificações por e-mail (Resend) cobrindo os 4 eventos do spec §3.6: **conta ativada** (→ cliente), **relatório pronto** (→ cliente), **falha de conexão Bling** (→ cliente) e **falha de pipeline** (→ admin interno). Hoje só existem dois envios parciais do Plano 4 (`sendReportReadyEmail` com `adminEmail=null` e `sendPipelineFailedEmail` mandando para `EMAIL_FROM`). Este plano centraliza o envio, resolve os destinatários reais e liga cada evento ao seu gatilho.

**Architecture:** Um módulo de notificações coeso (`src/modules/notifications/`): um remetente base templado (`sendEmail`) que lazy-carrega o Resend, opera em **no-op quando as chaves não estão configuradas** e **nunca lança** (e-mail jamais quebra um fluxo de negócio); wrappers tipados por evento (HTML+texto pt-BR); e um resolvedor de destinatário (`getOrgPrimaryEmail(orgId)` — o usuário cliente da org; MVP = 1 usuário por org). Os eventos são disparados **na borda** (actions/orchestrator/repository), sempre como efeito best-effort que não afeta o resultado da operação. Destinatário interno (alertas de pipeline) vem de um env novo `ADMIN_ALERT_EMAIL` (default = `EMAIL_FROM`).

**Tech Stack:** Next.js 14, Drizzle/Neon, `resend` (já instalado), Zod (env), Vitest. Sem libs novas. E-mails são MOCKADOS nos testes (`vi.mock('resend')` ou spy nos wrappers); nenhuma rede real; chave deferida (app sobe sem ela).

## Global Constraints

- **Padrões dos Planos 1–5** (em `master`): `src/modules/<domínio>/`, repositórios multi-tenant por `org_id`, actions gating reconsultando o DB, testes de integração contra o branch Neon `test` (`tests/setup.ts` redireciona; `describe.skipIf(!process.env.DATABASE_URL_TEST)`), commits conventional pt-BR.
- **E-mail é best-effort:** todo envio é embrulhado em try/catch e NUNCA lança nem propaga — falha de e-mail não pode quebrar ativação de cliente, finalização de relatório, nem o pipeline. No-op silencioso (com `console.info`/`console.warn` sem dados sensíveis) quando `RESEND_API_KEY`/`EMAIL_FROM` ausentes.
- **Sem segredos em log:** nunca logar `RESEND_API_KEY`. Logs de e-mail só com ids/eventos, sem corpo sensível.
- **Multi-tenancy:** `getOrgPrimaryEmail(orgId)` filtra por `org_id`. Nenhum destinatário vem de input do cliente — sempre resolvido a partir do `orgId` do contexto (sessão/pipeline).
- **Idempotência de notificação não é requerida no MVP** (reenvio em retry é aceitável; dedupe é fast-follow).
- **Idioma:** assuntos e corpos em pt-BR.
- **Branch `feat/notificacoes`** a partir de `master`. Nunca push/merge sem revisão.

## File Structure

| Caminho | Responsabilidade |
|---|---|
| `src/lib/env.ts` (mod) | + `ADMIN_ALERT_EMAIL: z.string().optional()` (default lógico = `EMAIL_FROM`) |
| `.env.example` (mod) | documentar `ADMIN_ALERT_EMAIL` |
| `src/modules/notifications/email.ts` (reescrever) | `sendEmail` base (lazy Resend, no-op, nunca lança) + wrappers tipados: `sendAccountActivatedEmail`, `sendReportReadyEmail`, `sendPipelineFailedEmail`, `sendBlingConnectionFailedEmail` |
| `src/modules/notifications/recipients.ts` (criar) | `getOrgPrimaryEmail(orgId): Promise<string | null>`; `getAdminAlertEmail(): string | null` |
| `src/modules/notifications/templates.ts` (criar) | funções puras `(...) => { subject, html, text }` por evento (testáveis) |
| `src/actions/admin.actions.ts` (mod) | `activateClientAction` dispara conta-ativada (best-effort) |
| `src/modules/pipeline/orchestrator.ts` (mod) | resolve e-mail do cliente; passa a `finalize`; falha → `sendPipelineFailedEmail` ao admin |
| `src/modules/pipeline/steps/finalize.ts` (mod) | `adminEmail` → `clientEmail`; envia relatório-pronto ao cliente |
| `src/modules/connections/connection.repository.ts` (mod) | `getValidAccessToken` na falha de refresh → notifica cliente (best-effort) |
| `tests/unit/*`, `tests/integration/*` | templates puros; no-op/recipients; wiring (spies) |

---

### Task 1: Núcleo de notificações (remetente base + templates + destinatários) + env

**Files:** Modify `src/lib/env.ts`, `.env.example`; Create `src/modules/notifications/templates.ts`, `src/modules/notifications/recipients.ts`; Rewrite `src/modules/notifications/email.ts`; Test `tests/unit/notification-templates.test.ts`, `tests/unit/email.test.ts`, `tests/integration/recipients.test.ts`.

**Interfaces (Produces):**
- `env.ts`: + `ADMIN_ALERT_EMAIL: z.string().optional()` (e-mail interno p/ alertas; se ausente, usar `EMAIL_FROM`).
- `templates.ts` (puro, sem I/O): `accountActivatedTemplate(plano: Plano)`, `reportReadyTemplate(reportId: string, appUrl: string)`, `pipelineFailedTemplate(orgId, reportId, erro)`, `blingConnectionFailedTemplate(appUrl: string)` — cada um retorna `{ subject: string; html: string; text: string }` (pt-BR). Links usam `serverEnv.APP_URL` passado como arg (manter puro).
- `email.ts`:
  - `sendEmail(input: { to: string; subject: string; html: string; text: string }): Promise<void>` — base. Se `!RESEND_API_KEY || !EMAIL_FROM` → `console.info('[email] (no-op) ...')` e retorna. Senão lazy `import('resend')`, `resend.emails.send({ from: EMAIL_FROM, to, subject, html, text })` dentro de try/catch (warn, nunca lança).
  - Wrappers (cada um chama `sendEmail` com o template; nunca lançam):
    - `sendAccountActivatedEmail(to: string, plano: Plano): Promise<void>`
    - `sendReportReadyEmail(to: string, reportId: string): Promise<void>`
    - `sendPipelineFailedEmail(to: string, orgId: string, reportId: string, erro: string): Promise<void>` (destinatário = admin interno, passado pelo caller)
    - `sendBlingConnectionFailedEmail(to: string): Promise<void>`
  - **Compat:** manter as assinaturas usadas hoje? NÃO — `sendReportReadyEmail(to, reportId)` mantém; `sendPipelineFailedEmail` muda de `(orgId, reportId, erro)` para `(to, orgId, reportId, erro)` (Task 2 atualiza os callers; nenhum outro caller fora do orchestrator — confirmar via grep).
- `recipients.ts`:
  - `getOrgPrimaryEmail(orgId: string): Promise<string | null>` — `select users.email where org_id = orgId` (role 'client' preferencialmente; MVP 1 usuário/org) `limit 1`; null se não houver.
  - `getAdminAlertEmail(): string | null` — `serverEnv.ADMIN_ALERT_EMAIL ?? serverEnv.EMAIL_FROM ?? null`.

- [ ] **Step 1: env** — adicionar `ADMIN_ALERT_EMAIL` em `env.ts` + `.env.example`.
- [ ] **Step 2 (unit, puro):** `notification-templates.test.ts` — cada template retorna subject/html/text não-vazios, em pt-BR, e o `text` contém o dado-chave (ex.: reportId no reportReady; "ativada" no accountActivated; o nome do plano). 
- [ ] **Step 3:** implementar `templates.ts`, `recipients.ts`, reescrever `email.ts`.
- [ ] **Step 4 (unit, Resend mockado):** `email.test.ts` — `vi.mock('resend')`. Com `RESEND_API_KEY`+`EMAIL_FROM` setados (mock do `serverEnv` ou via env de teste), `sendReportReadyEmail` chama `resend.emails.send` com `to`/`subject` corretos; SEM chaves → não chama `send`, não lança (no-op). Cobrir que um `send` que rejeita NÃO propaga (wrapper engole). 
- [ ] **Step 5 (integração):** `recipients.test.ts` (`describe.skipIf(!DATABASE_URL_TEST)`): seed org + user cliente → `getOrgPrimaryEmail` retorna o e-mail; org sem user → null; isolamento por org. Cleanup (users, orgs) em `finally`.
- [ ] **Step 6:** `npm run test` + `npm run typecheck`. **Commit:** `feat(notificacoes): núcleo de e-mail (remetente base + templates pt-BR + destinatários)`.

---

### Task 2: Ligar eventos — conta ativada, relatório pronto (cliente), falha de pipeline (admin)

**Files:** Modify `src/actions/admin.actions.ts`, `src/modules/pipeline/orchestrator.ts`, `src/modules/pipeline/steps/finalize.ts`; Test `tests/integration/orchestrator.test.ts` (estender) + `tests/unit` p/ a action se viável.

**Interfaces:**
- `admin.actions.ts` `activateClientAction`: após `activateOrganization(...)` com sucesso (antes do `revalidatePath`), resolver `getOrgPrimaryEmail(orgId)` e, se houver, `await sendAccountActivatedEmail(email, plano)` — **best-effort** (o envio já não lança; ainda assim não deixar o resultado da action depender dele). Não alterar a semântica de retorno.
- `finalize.ts`: renomear o campo `adminEmail` para `clientEmail` em `FinalizeInput` (semântica correta: o relatório-pronto vai ao cliente). Continua: se `clientEmail` presente → `sendReportReadyEmail(clientEmail, reportId)` (fora da transação, best-effort).
- `orchestrator.ts` `generateReport`:
  - No sucesso: resolver `clientEmail = await getOrgPrimaryEmail(orgId)` e passar a `finalize({ ..., clientEmail })` (substitui o `adminEmail: null` atual).
  - Na falha (catch): `const adminEmail = getAdminAlertEmail(); if (adminEmail) await sendPipelineFailedEmail(adminEmail, orgId, reportId, erroTruncado);` (substitui a chamada antiga `sendPipelineFailedEmail(orgId, reportId, erro)`). Continua best-effort (não relança).
- Confirmar via grep que não há outros callers de `sendReportReadyEmail`/`sendPipelineFailedEmail` além de finalize/orchestrator.

- [ ] **Step 1:** atualizar `finalize.ts` (campo `clientEmail`) e `orchestrator.ts` (resolver cliente no sucesso; admin no erro).
- [ ] **Step 2:** ligar `sendAccountActivatedEmail` em `activateClientAction`.
- [ ] **Step 3 (integração, estender `orchestrator.test.ts`):** com os wrappers de e-mail **espionados** (`vi.spyOn` do módulo `@/modules/notifications/email`): no happy path, semear a org COM um user cliente e assert que `sendReportReadyEmail` foi chamado com o e-mail do cliente; no caminho Bling-fail, assert que `sendPipelineFailedEmail` foi chamado com o e-mail de alerta admin. (Mockar `getAdminAlertEmail`/env conforme necessário, ou setar `ADMIN_ALERT_EMAIL` no ambiente de teste — preferir spy nos wrappers para não depender de chave.)
- [ ] **Step 4:** `npm run test` + `npm run typecheck` + `npm run build`. **Verificar MAIN limpo** (reports/orders/market_snapshots=0). **Commit:** `feat(notificacoes): liga conta ativada, relatório pronto (cliente) e falha de pipeline (admin)`.

---

### Task 3: Falha de conexão Bling (→ cliente) + revisão e fechamento

**Files:** Modify `src/modules/connections/connection.repository.ts`; Test `tests/integration/connection-repository.test.ts` (criar ou estender).

**Interfaces:**
- `connection.repository.ts` `getValidAccessToken`: no `catch` da renovação, após `update ... status='expirado'` e ANTES de lançar `refresh_bling_falhou`, disparar **best-effort** `sendBlingConnectionFailedEmail` ao cliente: `try { const to = await getOrgPrimaryEmail(orgId); if (to) await sendBlingConnectionFailedEmail(to); } catch { /* e-mail nunca quebra o fluxo */ }`. O comportamento de erro (status expirado + throw) permanece idêntico.

- [ ] **Step 1:** implementar a notificação na falha de refresh (best-effort, sem mudar o throw).
- [ ] **Step 2 (integração):** `connection-repository.test.ts` (`describe.skipIf(!DATABASE_URL_TEST)`): semear org + user cliente + connection com `expira_em` no passado (força refresh) + tokens cifrados de teste; `vi.spyOn(blingProvider, 'refresh')` lançando; `vi.spyOn` em `sendBlingConnectionFailedEmail`. Rodar `getValidAccessToken(orgId)` → assert lança `refresh_bling_falhou`, `connections.status` virou `expirado`, e `sendBlingConnectionFailedEmail` foi chamado com o e-mail do cliente. Caso de sucesso: refresh ok → status `ok`, e-mail NÃO chamado. Cleanup completo (connections, users, orgs) em `finally`. (Usar `ENCRYPTION_KEY` do `.env.local` para cifrar tokens de teste, espelhando `tests/e2e/helpers/db.ts`.)
- [ ] **Step 3:** `npm run test` (todas), `npm run typecheck`, `npm run lint`, `npm run build`. **Verificar MAIN limpo.** **Commit:** `feat(notificacoes): notifica cliente quando a conexão Bling falha na renovação`.
- [ ] **Step 4:** revisão ampla do branch (opus) → merge.

---

## Self-Review

**Cobertura (§3.6):** conta ativada (Task 2) ✅; relatório pronto → cliente (Task 2) ✅; falha de conexão Bling → cliente (Task 3) ✅; falha de pipeline → admin (Task 2) ✅. Remetente base no-op/never-throw + templates + destinatários multi-tenant (Task 1) ✅.

**Lacunas/deferidas (fast-follow):** dedupe/idempotência de envio (reenvio em retry aceitável); fila/retry de e-mail (hoje best-effort síncrono); preferências de notificação por usuário; multi-usuário por org (MVP = 1; `getOrgPrimaryEmail` pega o único); domínio verificado no Resend + DKIM (config de produção, ação do Matheus); webhook de bounce; i18n.

**Consistência:** reusa `Plano` (user.types), `serverEnv` (env), `getOrgPrimaryEmail` consumido por orchestrator/connection; `finalize.clientEmail` alimentado pelo orchestrator; nenhum caller órfão de `sendPipelineFailedEmail` (assinatura nova) fora do orchestrator (confirmar por grep). Padrão best-effort idêntico em todos os gatilhos.

**Segurança:** destinatários sempre resolvidos por `org_id` (nunca input do cliente); sem segredos em log; e-mail nunca quebra fluxo de negócio.

---

## Execução
Subagent-driven (implementer + review por task; revisão ampla ao final). E-mail mockado (sem rede/sem chave real). Testes de integração contra o branch Neon `test`.
