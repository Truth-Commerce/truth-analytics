# G5 — Conta & Confiança Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

> **Pré-requisitos: G0–G4 mergeadas; revalidar contratos citados.** Este plano assume no `master`: da **G4** (`2026-07-14-g4-polimento.md`) — `src/lib/labels.ts` (`PLANO_LABEL`, `STATUS_ORG_LABEL`), `src/components/nav-model.ts` (`navItems`, `logoHref`, `hrefAtivo`, `atalhoPaletaLabel`) + `tests/unit/nav-model.test.ts`, app-shell reescrito (Link + `aria-current` — G5 **não** edita `app-shell.tsx`, só o `nav-model.ts`), `command-palette.tsx` sobre Dialog (G5 só toca `command-model.ts`, aditivo), erros de auth com `Alert` (o sign-up pode já renderizar erro via `Alert` — adaptar o snippet da Task 3), metadata por página; da **G3** — migration `task_templates` (`prioridade`/`prazo_dias`) aplicada (o número da migration da G5 é o PRÓXIMO do journal — **não fixar número**), `recipients.ts` intocado em assinatura (G3 usa `getAdminAlertEmail` existente); da **G0** — card "Status do sistema" no /admin (referenciado no runbook de onboarding) e feedback do OAuth em /conexoes. **No início de CADA task, revalide os trechos citados contra o `master` real** — os snippets deste plano foram extraídos do HEAD `feat/g0-verdade-dos-dados` atual e adaptados aos CONTRATOS dos planos G1–G4; drift pequeno = adaptar inline e anotar no commit; drift estrutural = parar e revisar.

**Goal:** Fechar os gaps P1 de produto da auditoria 2026-07-14 (seção 4/G5): o cliente passa a gerenciar a própria conta (`/configuracoes`: trocar senha exigindo a atual + editar nome da empresa + ver e-mail/plano), a org pode ter um 2º usuário (criado pelo admin com senha temporária — decisão de menor superfície, justificada abaixo), o produto ganha o mínimo viável de LGPD (/termos + /privacidade com conteúdo real + aceite obrigatório no signup com carimbo `users.aceitou_termos_em`), e a operação ganha dois runbooks executáveis: exclusão/purge de dados por org (com script `scripts/purge-org.ts` dry-run-first) e onboarding de cliente (com produtos monitorados geríveis pelo admin/analista direto em `/admin/[orgId]` e `/analista/[orgId]`).

**Architecture:** Segue o padrão do repo — server actions finas (`requireActiveOrg`/`requireAdmin`/`requireAnalista` + `assertOrgAccess` → repositório → `revalidatePath`), repositórios multi-tenant escopados por `org_id`, rate-limit reutilizando a tabela `login_attempts` com escopo novo (`troca_senha`), auditoria via `recordAudit` em TODA ação sensível (troca de senha, renome de org, criação de usuário, produto monitorado por staff, purge), e-mail best-effort (`sendEmail` nunca lança). O purge vive em `scripts/purge-org.ts` como função pura-de-I/O `purgeOrg(dbc, input)` exportada (testável no branch `test` por injeção do client, mesmo padrão de `scripts/seed-admin.ts` + `tests/integration/seed-admin.test.ts`) com CLI dry-run por default. As páginas legais vivem num route group `(legal)` público (o middleware só protege `/dashboard`, `/conexoes`, `/configuracoes`, `/admin`, `/analista`).

**Tech Stack:** Next.js 14 (App Router) + React 18.3 (`useFormState` — **não** usar `useActionState`), Drizzle/Neon (`postgres.js`), Zod, bcryptjs (cost 12 via `hashPassword`/`verifyPassword` existentes em `src/modules/auth/password.ts`), Resend best-effort, Vitest (unit + integração no branch Neon `test` via `DATABASE_URL_TEST`), Playwright E2E (2 specs editados COM justificativa — ver Global Constraints). **Sem libs novas. Uma migration aditiva** (`users.aceitou_termos_em`).

## Global Constraints

- **Regra de ouro:** antes de cada task, re-validar os trechos citados contra o `master` atual (G0–G4 mudaram `app-shell`, `command-model`, `sign-up`, `admin/[orgId]/page.tsx`, `analista/[orgId]/page.tsx`, `recipients.ts`). Ler o arquivo REAL antes de editar.
- Next 14 App Router + Drizzle + Neon — **testes de integração SEMPRE no branch `test` via `DATABASE_URL_TEST`** (`describe.skipIf(!process.env.DATABASE_URL_TEST)`, cleanup em `afterAll`/`finally`, prefixo `ta-test-` nos dados). `tests/setup.ts` é **intocável**. NUNCA rodar teste contra produção.
- **TDD com vitest** (`npm run test`): failing test primeiro → rodar e VER falhar → implementar → rodar e VER passar → commit. `npm run test` + `npm run typecheck` antes de cada commit.
- **Copy pt-BR SEMPRE**; commits em português no padrão `feat(g5): ...` / `test(g5): ...` / `fix(g5): ...`.
- **Multi-tenancy inegociável:** cliente usa `access.orgId` da sessão (NUNCA lê orgId de form); staff (admin/analista) recebe `orgId` de form mas passa por `requireAnalista()` + `assertOrgAccess(access, orgId)` ANTES de qualquer repositório; toda query nova escopada por `org_id`.
- **Senhas SEMPRE via `hashPassword`/`verifyPassword`** de `src/modules/auth/password.ts` (bcrypt cost 12 — padrão do repo). Nenhum hash manual.
- **Auditoria via `recordAudit`** nas ações sensíveis: `user.senha_alterada`, `org.nome_alterado`, `user.criado_admin`, `tracked_product.criado_staff`, `tracked_product.removido_staff`, `org.purgada`. A senha temporária da Task 2 NUNCA entra em audit/log/e-mail.
- **E-mail best-effort:** `sendEmail` nunca lança (padrão `email.ts:26-50`); falha de e-mail nunca quebra fluxo de negócio.
- **Migrations SEMPRE aditivas.** Única desta fase: `users` + `aceitou_termos_em timestamptz` nullable (Task 3). Gerar com `npm run db:generate` (número = próximo do journal pós-G0–G4), aplicar no branch `test` com `npm run db:migrate:test` antes dos testes; Neon MAIN é passo operacional do dono.
- **Preservar 100% os testids/fluxos E2E**, com **DUAS exceções justificadas nesta fase** (Task 3, steps explícitos): `tests/e2e/auth.spec.ts` e `tests/e2e/admin.spec.ts` passam pelo formulário de `/sign-up`, que ganha o checkbox OBRIGATÓRIO de aceite (a mudança de fluxo É a feature — consentimento LGPD); cada spec ganha exatamente 1 linha (`await page.check('input[name="aceite"]');`). Nenhum outro spec E2E é tocado. Os testids de `/conexoes` (`add-form`, `produto-{id}`, `disconnect-bling`) são INTOCADOS — o componente staff da Task 5 usa testids próprios (`staff-add-form`, `staff-produto-{id}`).
- **Testes unit/integration alterados de propósito** (com justificativa nos steps): `tests/unit/nav-model.test.ts` e `tests/unit/command-model.test.ts` (item novo de nav — Task 1), `tests/unit/auth-callbacks.test.ts` (rota protegida nova — Task 1), `tests/unit/auth-actions-zod.test.ts` e `tests/integration/create-org-with-user.test.ts` (aceite — Task 3), `tests/integration/recipients.test.ts` (determinismo com 2 usuários — Task 2). Nada mais.
- **Sem libs novas.**
- **Branch:** `feat/g5-conta-confianca` a partir de `master` (pós-G0–G4). Merge `--no-ff` só após a Task 6 (revisão ampla).

## Decisão central da Task 2 (tomada AQUI — não rediscutir)

**2º usuário por org = admin Truth cria direto em `/admin/[orgId]` com senha temporária exibida UMA vez. SEM tabela `org_invites`, SEM fluxo de convite por e-mail.** Justificativa (menor superfície, verificada no código real):

1. **E-mail é best-effort/no-op sem RESEND** (`email.ts:32-35`; P0-4 da auditoria — estado real de produção). Convite por e-mail seria um fluxo quebrado por default; criação direta não depende de e-mail.
2. **O onboarding já é 100% mediado pelo admin** (ativação manual, plano manual, analista manual — `admin.actions.ts`). O 2º usuário segue o MESMO modelo operacional, documentado no runbook da Task 5.
3. **Superfície mínima:** zero tabela nova (o purge da Task 4 não ganha dependência), zero rota pública nova, zero token/página de aceite, zero problema de anti-enumeração/rate-limit novo (não há endpoint público novo).
4. **Segurança:** senha temporária de 12 caracteres gerada server-side (`randomBytes(9).toString('base64url')`), exibida apenas no state da action (uma vez, para o admin repassar pelo canal atual — WhatsApp); troca em `/configuracoes` (Task 1). Auditoria `user.criado_admin` sem a senha.
5. **Fix incluído (exigência do brief):** `getOrgPrimaryUser`/`getOrgPrimaryEmail` em `recipients.ts` assumem 1 user/org — com 2 usuários o `limit(1)` sem `orderBy` fica não-determinístico. Fix: `orderBy(asc(users.created_at), asc(users.id))` → "primário" = usuário cliente mais antigo (estável).

## Constantes de negócio (decididas AQUI — não rediscutir)

| Constante | Valor | Onde | Significado |
|---|---|---|---|
| `MAX_USERS_CLIENT_POR_ORG` | `3` | user.repository.ts | máx. de usuários `role='client'` por org |
| Senha temporária | `randomBytes(9).toString('base64url')` (12 chars) | admin.actions.ts | exibida 1 vez, nunca logada/auditada |
| `TROCA_SENHA_MAX_FALHAS` | `5` | rate-limit.ts | falhas de senha atual por e-mail na janela |
| `TROCA_SENHA_WINDOW_MINUTES` | `15` | rate-limit.ts | janela do rate-limit de troca de senha |
| Escopo novo de rate-limit | `'troca_senha'` (11 chars — cabe no varchar(16)) | rate-limit.ts | reusa `login_attempts` |
| Posição na nav do cliente | último item (`/configuracoes`, "Configurações") | nav-model.ts | depois de Plano de Ação |
| Retenção pós-pedido de exclusão | 30 dias corridos | runbook exclusão | prazo operacional p/ purge |
| Ordem do purge | filhos → pais (ver Task 4) | purge-org.ts | respeita FKs reais do schema |

## Divergências do brief → adaptações (verificadas no código real)

1. **`getOrgPrimaryUser` sem `orderBy`** confirmado (`recipients.ts:35-43` e `getOrgPrimaryEmail:12-20`) — fix nos DOIS (Task 2).
2. **`/configuracoes` usa `requireActiveOrg`** (org `pending` cai em `/aguardando`, consistente com todas as páginas `(client)`); usuário pendente troca senha pelo fluxo `esqueci-senha` existente. Decisão anotada.
3. **`clientRoutes` do middleware** (`auth-config.ts:10`) hoje é `['/dashboard', '/conexoes']` — Task 1 ADICIONA `'/configuracoes'` (gate barato na borda; a autoridade continua sendo `requireActiveOrg` na página).
4. **Página `/configuracoes` lê a org via `getOrganizationById` de `admin.repository.ts`** — precedente já existe (`analista/[orgId]/page.tsx:11` importa do mesmo lugar).
5. **`taskComments.user_id` é NOT NULL** — no purge, comentários da própria org saem via `task_id`; comentário cross-org de usuário purgado é impossível no modelo atual (cliente só acessa a própria org). O runbook documenta que, se um DELETE de `users` falhar por FK residual, é sinal de dado anômalo → investigar antes de forçar.
6. **`audit_log` da org é EXCLUÍDO no purge** (LGPD — eliminação completa), e o script insere UMA linha final `org.purgada` (a tabela não tem FK — `audit-log.ts:6-8` — então a linha sobrevive à org) com as contagens excluídas: trilha da exclusão preservada sem reter dados pessoais.
7. **Disclaimers jurídicos ficam FORA do site** (exigência do brief): os textos de /termos e /privacidade são completos e afirmativos; a nota "revisar com jurídico + completar razão social/CNPJ/foro" vive SÓ neste plano e no runbook de onboarding (seção "Notas ao dono").
8. **Aba "Produtos" do admin já existe read-only** (`admin/[orgId]/page.tsx:175-194`) — Task 5 a troca pelo gerenciador; o analista ganha aba nova. As actions de staff REUSAM `addTrackedProduct`/`removeTrackedProduct` (validação de limite por plano em `tracked-product.repository.ts:28-34` — `TRACKED_LIMITS` 10/20/30) com o plano REAL da org (`getOrganizationById(orgId).plano`), não o da sessão do staff.

## Contratos assumidos de G0–G4 (revalidar na task que os toca)

| Contrato | Onde | Task |
|---|---|---|
| `PLANO_LABEL: Record<Plano, string>` | `src/lib/labels.ts` (G4 T6) | 1 |
| `navItems(variant): NavItem[]` com client = `[Dashboard, Conexões, Plano de Ação(badge)]` | `src/components/nav-model.ts` (G4 T6) | 1 |
| `buildCommands(variant)` (pode ter ganho comandos na G4 T6 — adição é ADITIVA) | `src/components/command-model.ts` | 1 |
| Erros de auth com `Alert` (sign-up pode divergir do snippet) | `src/app/(auth)/sign-up/page.tsx` (G4 T5) | 3 |
| Navegação interna com `next/link` | todo o app (G4 T2/T6) | 1, 3 |
| Migration `task_templates` aplicada (journal avançou) | `src/db/migrations/` (G3 T10) | 3 |
| `assertOrgAccess(access, orgId)` lança `'acesso_negado'` | `analista.repository.ts:17-27` | 5 |
| Card "Status do sistema" no /admin | `src/app/admin/system-status-card.tsx` (G0 T10) | 5 (runbook) |

## File Structure

| Caminho | Ação | Task | Responsabilidade |
|---|---|---|---|
| `src/modules/auth/rate-limit.ts` | mod | 1 | escopo `'troca_senha'` + `isTrocaSenhaRateLimited` |
| `src/modules/auth/user.repository.ts` | mod | 1, 2, 3 | `getUserAuthById`/`setUserPasswordHash` (T1); `listOrgUsers`/`createOrgClientUser`/`MAX_USERS_CLIENT_POR_ORG` (T2); `aceitou_termos_em` no insert (T3) |
| `src/modules/auth/password-reset.repository.ts` | mod | 1 | `invalidateUserResetTokens` |
| `src/modules/organizations/organization-settings.repository.ts` | mod | 1 | `renameOrganization` |
| `src/modules/notifications/templates.ts` | mod | 1 | `passwordChangedTemplate` |
| `src/modules/notifications/email.ts` | mod | 1 | `sendPasswordChangedEmail` |
| `src/actions/account.actions.ts` | criar | 1 | `changePasswordAction`, `updateOrgNameAction` |
| `src/app/(client)/configuracoes/page.tsx` | criar | 1 | página Configurações (server) |
| `src/app/(client)/configuracoes/trocar-senha-form.tsx` | criar | 1 | form client de troca de senha |
| `src/app/(client)/configuracoes/nome-empresa-form.tsx` | criar | 1 | form client do nome da empresa |
| `src/app/(client)/configuracoes/loading.tsx` | criar | 1 | skeleton da rota |
| `src/modules/auth/auth-config.ts` | mod | 1 | `clientRoutes` + `/configuracoes` |
| `src/components/nav-model.ts` | mod | 1 | item "Configurações" na nav do cliente |
| `src/components/command-model.ts` | mod | 1 | comando "Ir para Configurações" (client) |
| `src/modules/notifications/recipients.ts` | mod | 2 | `orderBy` determinístico em `getOrgPrimaryEmail`/`getOrgPrimaryUser` |
| `src/actions/admin.actions.ts` | mod | 2 | `adminCreateOrgUserAction` |
| `src/app/admin/[orgId]/org-users.tsx` | criar | 2 | card Usuários (lista + criar com senha temporária) |
| `src/app/admin/[orgId]/page.tsx` | mod | 2, 5 | card Usuários (T2); aba Produtos gerenciável (T5) |
| `src/db/schema/users.ts` | mod | 3 | coluna `aceitou_termos_em` (+ migration gerada) |
| `src/app/(legal)/layout.tsx` | criar | 3 | shell público das páginas legais |
| `src/app/(legal)/tipografia.tsx` | criar | 3 | componentes tipográficos compartilhados |
| `src/app/(legal)/termos/page.tsx` | criar | 3 | Termos de Uso (conteúdo real pt-BR) |
| `src/app/(legal)/privacidade/page.tsx` | criar | 3 | Política de Privacidade (conteúdo real pt-BR) |
| `src/app/page.tsx` | mod | 3 | links legais no footer da landing |
| `src/app/(auth)/layout.tsx` | mod | 3 | links legais sob os cards de auth |
| `src/app/(auth)/sign-up/page.tsx` | mod | 3 | checkbox de aceite obrigatório |
| `src/actions/auth.actions.ts` | mod | 3 | `aceite` no schema do signup |
| `tests/e2e/auth.spec.ts`, `tests/e2e/admin.spec.ts` | mod | 3 | +1 linha cada (check do aceite) — JUSTIFICADO |
| `scripts/purge-org.ts` | criar | 4 | `purgeOrg(dbc, input)` + CLI dry-run-first |
| `package.json` | mod | 4 | script `db:purge-org` |
| `docs/runbooks/exclusao-de-dados-org.md` | criar | 4 | runbook de offboarding/purge |
| `src/actions/staff.actions.ts` | criar | 5 | tracked products por admin/analista |
| `src/components/tracked-products/StaffTrackedProducts.tsx` | criar | 5 | gerenciador de produtos p/ staff |
| `src/app/analista/[orgId]/page.tsx` | mod | 5 | aba "Produtos" |
| `docs/runbooks/onboarding-cliente.md` | criar | 5 | runbook de onboarding |
| `tests/unit/account-actions.test.ts` | criar | 1 | actions de conta (mocks) |
| `tests/integration/account-repos.test.ts` | criar | 1 | repositórios novos (branch test) |
| `tests/unit/nav-model.test.ts`, `tests/unit/command-model.test.ts`, `tests/unit/auth-callbacks.test.ts` | mod | 1 | nav/comando/rota novos |
| `tests/integration/org-users.test.ts` | criar | 2 | `createOrgClientUser`/`listOrgUsers` |
| `tests/integration/recipients.test.ts` | mod | 2 | determinismo com 2 usuários |
| `tests/unit/auth-actions-zod.test.ts` | mod | 3 | aceite obrigatório |
| `tests/integration/create-org-with-user.test.ts` | mod | 3 | `aceitou_termos_em` gravado |
| `tests/unit/notification-templates.test.ts` | mod | 1 | template "senha alterada" |
| `tests/integration/purge-org.test.ts` | criar | 4 | purge em org sintética (branch test) |
| `tests/unit/staff-actions.test.ts` | criar | 5 | actions de staff (mocks) |

**Dependências entre tasks:** 1→2 (a senha temporária da T2 orienta o cliente a trocar em `/configuracoes` — dependência só de copy), 3/4/5 independentes entre si (4 depende da DECISÃO da T2 — sem `org_invites` — não do código). Ordem de execução = ordem numérica. Task 6 fecha.

---

### Task 1: Página `/configuracoes` — trocar senha (exigindo a atual), nome da empresa, e-mail/plano + nav + ⌘K

**Files:**
- Modify: `src/modules/auth/rate-limit.ts` (tipo `EscopoRateLimit` + `isTrocaSenhaRateLimited`)
- Modify: `src/modules/auth/user.repository.ts` (+ `getUserAuthById`, `setUserPasswordHash`)
- Modify: `src/modules/auth/password-reset.repository.ts` (+ `invalidateUserResetTokens`)
- Modify: `src/modules/organizations/organization-settings.repository.ts` (+ `renameOrganization`)
- Modify: `src/modules/notifications/templates.ts` (+ `passwordChangedTemplate`)
- Modify: `src/modules/notifications/email.ts` (+ `sendPasswordChangedEmail`)
- Create: `src/actions/account.actions.ts`
- Create: `src/app/(client)/configuracoes/page.tsx`, `trocar-senha-form.tsx`, `nome-empresa-form.tsx`, `loading.tsx`
- Modify: `src/modules/auth/auth-config.ts:10` (`clientRoutes`)
- Modify: `src/components/nav-model.ts` (G4), `src/components/command-model.ts`
- Test: `tests/unit/account-actions.test.ts` (novo), `tests/integration/account-repos.test.ts` (novo), `tests/unit/nav-model.test.ts` (mod), `tests/unit/command-model.test.ts` (mod), `tests/unit/auth-callbacks.test.ts` (mod), `tests/unit/notification-templates.test.ts` (mod)

**Interfaces:**
- Consumes: `hashPassword`/`verifyPassword` (`password.ts` — bcrypt cost 12), `recordAttempt`/`countRecent` (rate-limit.ts), `requireActiveOrg` (`UserAccess {id, orgId, role, orgStatus, plano}`), `recordAudit`, `sendEmail`/`serverEnv.APP_URL`, `getOrganizationById(orgId): Promise<ClientOrganization | null>` (admin.repository), `PLANO_LABEL` (G4 labels.ts), `Card/CardHeader/CardTitle/CardContent`, `Field/Input/Button/Alert/Skeleton`.
- Produces:

```ts
// rate-limit.ts
export type EscopoRateLimit = 'login' | 'signup' | 'reset' | 'troca_senha';
export async function isTrocaSenhaRateLimited(email: string): Promise<boolean>;

// user.repository.ts
export async function getUserAuthById(
  userId: string,
): Promise<{ id: string; email: string; senha_hash: string } | null>;
export async function setUserPasswordHash(userId: string, senha_hash: string): Promise<void>;

// password-reset.repository.ts
export async function invalidateUserResetTokens(userId: string): Promise<void>;

// organization-settings.repository.ts
export async function renameOrganization(orgId: string, nome: string): Promise<{ de: string } | null>;

// templates.ts / email.ts
export function passwordChangedTemplate(appUrl: string): EmailContent;
export async function sendPasswordChangedEmail(to: string): Promise<void>;

// account.actions.ts
export type AccountState = { error?: string; ok?: boolean };
export async function changePasswordAction(_prev: AccountState, formData: FormData): Promise<AccountState>;
export async function updateOrgNameAction(_prev: AccountState, formData: FormData): Promise<AccountState>;
```

- [ ] **Step 1 — testes unit falhando (actions com mocks, padrão de `auth-actions-zod.test.ts`).** Criar `tests/unit/account-actions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({ headers: () => new Headers() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/auth/require-active-org', () => ({
  requireActiveOrg: vi.fn().mockResolvedValue({
    id: 'u1', orgId: 'o1', role: 'client', orgStatus: 'active', plano: 'monthly',
  }),
}));
vi.mock('@/modules/auth/rate-limit', () => ({
  isTrocaSenhaRateLimited: vi.fn().mockResolvedValue(false),
  recordAttempt: vi.fn(),
}));
vi.mock('@/modules/auth/user.repository', () => ({
  getUserAuthById: vi.fn(),
  setUserPasswordHash: vi.fn(),
}));
vi.mock('@/modules/auth/password', () => ({
  hashPassword: vi.fn().mockResolvedValue('novo-hash'),
  verifyPassword: vi.fn(),
}));
vi.mock('@/modules/auth/password-reset.repository', () => ({
  invalidateUserResetTokens: vi.fn(),
}));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit: vi.fn() }));
vi.mock('@/modules/notifications/email', () => ({ sendPasswordChangedEmail: vi.fn() }));
vi.mock('@/modules/organizations/organization-settings.repository', () => ({
  renameOrganization: vi.fn(),
}));

import { verifyPassword } from '@/modules/auth/password';
import { invalidateUserResetTokens } from '@/modules/auth/password-reset.repository';
import { isTrocaSenhaRateLimited, recordAttempt } from '@/modules/auth/rate-limit';
import { getUserAuthById, setUserPasswordHash } from '@/modules/auth/user.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import { sendPasswordChangedEmail } from '@/modules/notifications/email';
import { renameOrganization } from '@/modules/organizations/organization-settings.repository';
import { changePasswordAction, updateOrgNameAction } from '@/actions/account.actions';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const USER = { id: 'u1', email: 'cliente@teste.dev', senha_hash: 'hash-atual' };

describe('changePasswordAction', () => {
  it('confirmação diferente → erro sem consultar o banco', async () => {
    const res = await changePasswordAction({}, form({
      senhaAtual: 'atual-123', novaSenha: 'nova-senha-8', confirmarSenha: 'outra-coisa',
    }));
    expect(res.error).toBe('A confirmação não confere com a nova senha.');
    expect(getUserAuthById).not.toHaveBeenCalled();
  });

  it('nova senha curta → erro de validação', async () => {
    const res = await changePasswordAction({}, form({
      senhaAtual: 'atual-123', novaSenha: 'curta', confirmarSenha: 'curta',
    }));
    expect(res.error).toBe('A nova senha precisa ter ao menos 8 caracteres.');
  });

  it('rate-limited → erro sem verificar a senha', async () => {
    vi.mocked(getUserAuthById).mockResolvedValueOnce(USER);
    vi.mocked(isTrocaSenhaRateLimited).mockResolvedValueOnce(true);
    const res = await changePasswordAction({}, form({
      senhaAtual: 'atual-123', novaSenha: 'nova-senha-8', confirmarSenha: 'nova-senha-8',
    }));
    expect(res.error).toBe('Muitas tentativas. Tente novamente em alguns minutos.');
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('senha atual incorreta → erro + tentativa falha registrada, sem trocar', async () => {
    vi.mocked(getUserAuthById).mockResolvedValueOnce(USER);
    vi.mocked(verifyPassword).mockResolvedValueOnce(false);
    const res = await changePasswordAction({}, form({
      senhaAtual: 'errada-123', novaSenha: 'nova-senha-8', confirmarSenha: 'nova-senha-8',
    }));
    expect(res.error).toBe('Senha atual incorreta.');
    expect(recordAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ escopo: 'troca_senha', email: USER.email, success: false }),
    );
    expect(setUserPasswordHash).not.toHaveBeenCalled();
  });

  it('sucesso → troca hash, invalida tokens de reset, audita e envia e-mail best-effort', async () => {
    vi.mocked(getUserAuthById).mockResolvedValueOnce(USER);
    vi.mocked(verifyPassword).mockResolvedValueOnce(true);
    const res = await changePasswordAction({}, form({
      senhaAtual: 'atual-123', novaSenha: 'nova-senha-8', confirmarSenha: 'nova-senha-8',
    }));
    expect(res).toEqual({ ok: true });
    expect(setUserPasswordHash).toHaveBeenCalledWith('u1', 'novo-hash');
    expect(invalidateUserResetTokens).toHaveBeenCalledWith('u1');
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'o1', userId: 'u1', acao: 'user.senha_alterada' }),
    );
    expect(sendPasswordChangedEmail).toHaveBeenCalledWith(USER.email);
  });
});

describe('updateOrgNameAction', () => {
  it('nome curto → erro sem tocar o banco', async () => {
    const res = await updateOrgNameAction({}, form({ nome: 'X' }));
    expect(res.error).toBe('Informe o nome da empresa.');
    expect(renameOrganization).not.toHaveBeenCalled();
  });

  it('sucesso → renomeia com orgId DA SESSÃO e audita de/para', async () => {
    vi.mocked(renameOrganization).mockResolvedValueOnce({ de: 'Nome Antigo' });
    const res = await updateOrgNameAction({}, form({ nome: 'Nome Novo Ltda' }));
    expect(res).toEqual({ ok: true });
    expect(renameOrganization).toHaveBeenCalledWith('o1', 'Nome Novo Ltda');
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'o1', userId: 'u1', acao: 'org.nome_alterado',
      detalhes: { de: 'Nome Antigo', para: 'Nome Novo Ltda' },
    }));
  });

  it('nome igual ao atual → ok sem auditar', async () => {
    vi.mocked(renameOrganization).mockResolvedValueOnce({ de: 'Nome Novo Ltda' });
    vi.mocked(recordAudit).mockClear();
    const res = await updateOrgNameAction({}, form({ nome: 'Nome Novo Ltda' }));
    expect(res).toEqual({ ok: true });
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/account-actions.test.ts` (FALHA: `@/actions/account.actions` não existe).

- [ ] **Step 3 — repositórios + rate-limit + template.** Em `src/modules/auth/rate-limit.ts`, trocar a linha do tipo e adicionar ao final:

```ts
export type EscopoRateLimit = 'login' | 'signup' | 'reset' | 'troca_senha';
```

```ts
// --- TROCA DE SENHA (usuário autenticado; chave = e-mail) ---

const TROCA_SENHA_MAX_FALHAS = 5;
const TROCA_SENHA_WINDOW_MINUTES = 15;

export async function isTrocaSenhaRateLimited(email: string): Promise<boolean> {
  const n = await countRecent({
    escopo: 'troca_senha',
    email,
    apenasFalhas: true,
    windowMinutes: TROCA_SENHA_WINDOW_MINUTES,
  });
  return n >= TROCA_SENHA_MAX_FALHAS;
}
```

Em `src/modules/auth/user.repository.ts`, adicionar ao final:

```ts
export async function getUserAuthById(
  userId: string,
): Promise<{ id: string; email: string; senha_hash: string } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, senha_hash: users.senha_hash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function setUserPasswordHash(userId: string, senha_hash: string): Promise<void> {
  await db.update(users).set({ senha_hash }).where(eq(users.id, userId));
}
```

Em `src/modules/auth/password-reset.repository.ts`, adicionar ao final (imports `and`/`eq`/`isNull` já existem):

```ts
/**
 * Invalida TODOS os tokens de reset ainda abertos do usuário. Chamado após a
 * troca de senha autenticada — nenhum link antigo deve continuar válido
 * (mesma invariante do consumeResetToken).
 */
export async function invalidateUserResetTokens(userId: string): Promise<void> {
  await db
    .update(passwordResetTokens)
    .set({ usado_em: new Date() })
    .where(and(eq(passwordResetTokens.user_id, userId), isNull(passwordResetTokens.usado_em)));
}
```

Em `src/modules/organizations/organization-settings.repository.ts`, adicionar:

```ts
/** Renomeia a org e devolve o nome anterior (para auditoria de/para). Null se não existir. */
export async function renameOrganization(orgId: string, nome: string): Promise<{ de: string } | null> {
  const [row] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) return null;
  await db.update(organizations).set({ name: nome }).where(eq(organizations.id, orgId));
  return { de: row.name };
}
```

Em `src/modules/notifications/templates.ts`, adicionar:

```ts
/**
 * Template: senha alterada (aviso de segurança pós-troca autenticada).
 */
export function passwordChangedTemplate(appUrl: string): EmailContent {
  const url = `${appUrl}/esqueci-senha`;
  const subject = 'Sua senha foi alterada — Truth Analytics';
  const text = [
    'A senha da sua conta no Truth Analytics acabou de ser alterada.',
    '',
    'Se foi você, nenhuma ação é necessária.',
    `Se NÃO foi você, redefina sua senha imediatamente em: ${url}`,
    'e avise nosso suporte: suporte@truthcommerce.com.br',
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>A senha da sua conta no <strong>Truth Analytics</strong> acabou de ser alterada.</p>
<p>Se foi você, nenhuma ação é necessária.</p>
<p>Se <strong>não</strong> foi você, <a href="${url}">redefina sua senha imediatamente</a> e avise nosso suporte: suporte@truthcommerce.com.br</p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;
  return { subject, html, text };
}
```

Em `src/modules/notifications/email.ts`, adicionar `passwordChangedTemplate` ao import de `./templates` e:

```ts
/**
 * Aviso de segurança: senha alterada com sucesso. Nunca lança.
 */
export async function sendPasswordChangedEmail(to: string): Promise<void> {
  const content = passwordChangedTemplate(serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}
```

Em `tests/unit/notification-templates.test.ts`, adicionar (adaptar ao estilo dos testes existentes do arquivo):

```ts
describe('passwordChangedTemplate', () => {
  it('inclui link de redefinição e canal de suporte', () => {
    const { subject, html, text } = passwordChangedTemplate('https://app.exemplo.com');
    expect(subject).toBe('Sua senha foi alterada — Truth Analytics');
    expect(html).toContain('https://app.exemplo.com/esqueci-senha');
    expect(text).toContain('suporte@truthcommerce.com.br');
  });
});
```

- [ ] **Step 4 — actions.** Criar `src/actions/account.actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { z } from 'zod';

import { recordAudit } from '@/modules/audit/audit.repository';
import { hashPassword, verifyPassword } from '@/modules/auth/password';
import { invalidateUserResetTokens } from '@/modules/auth/password-reset.repository';
import { isTrocaSenhaRateLimited, recordAttempt } from '@/modules/auth/rate-limit';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getUserAuthById, setUserPasswordHash } from '@/modules/auth/user.repository';
import { sendPasswordChangedEmail } from '@/modules/notifications/email';
import { renameOrganization } from '@/modules/organizations/organization-settings.repository';

export type AccountState = { error?: string; ok?: boolean };

const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a sua senha atual.'),
    novaSenha: z.string().min(8, 'A nova senha precisa ter ao menos 8 caracteres.'),
    confirmarSenha: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((d) => d.novaSenha === d.confirmarSenha, {
    message: 'A confirmação não confere com a nova senha.',
    path: ['confirmarSenha'],
  });

export async function changePasswordAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const access = await requireActiveOrg();
  const parsed = trocarSenhaSchema.safeParse({
    senhaAtual: formData.get('senhaAtual'),
    novaSenha: formData.get('novaSenha'),
    confirmarSenha: formData.get('confirmarSenha'),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const user = await getUserAuthById(access.id);
  if (!user) return { error: 'Sessão inválida. Entre novamente.' };

  const forwarded = headers().get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : null;

  if (await isTrocaSenhaRateLimited(user.email)) {
    return { error: 'Muitas tentativas. Tente novamente em alguns minutos.' };
  }

  const senhaOk = await verifyPassword(parsed.data.senhaAtual, user.senha_hash);
  if (!senhaOk) {
    await recordAttempt({ escopo: 'troca_senha', email: user.email, ip, success: false });
    return { error: 'Senha atual incorreta.' };
  }

  const novoHash = await hashPassword(parsed.data.novaSenha);
  await setUserPasswordHash(user.id, novoHash);
  await invalidateUserResetTokens(user.id);
  await recordAttempt({ escopo: 'troca_senha', email: user.email, ip, success: true });
  await recordAudit({ orgId: access.orgId, userId: user.id, acao: 'user.senha_alterada' });

  // Best-effort: sendEmail já nunca lança; o try é cinto-e-suspensório
  // (padrão de admin.actions.ts:47-56 — e-mail nunca quebra o fluxo).
  try {
    await sendPasswordChangedEmail(user.email);
  } catch {
    /* best-effort */
  }
  return { ok: true };
}

const nomeEmpresaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, 'Informe o nome da empresa.')
    .max(255, 'Nome longo demais (máx. 255 caracteres).'),
});

export async function updateOrgNameAction(
  _prev: AccountState,
  formData: FormData,
): Promise<AccountState> {
  const access = await requireActiveOrg();
  const parsed = nomeEmpresaSchema.safeParse({ nome: formData.get('nome') });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };

  const resultado = await renameOrganization(access.orgId, parsed.data.nome);
  if (!resultado) return { error: 'Organização não encontrada.' };
  if (resultado.de !== parsed.data.nome) {
    await recordAudit({
      orgId: access.orgId,
      userId: access.id,
      acao: 'org.nome_alterado',
      detalhes: { de: resultado.de, para: parsed.data.nome },
    });
  }
  revalidatePath('/configuracoes');
  return { ok: true };
}
```

- [ ] **Step 5 — rodar e ver passar:** `npm run test -- tests/unit/account-actions.test.ts tests/unit/notification-templates.test.ts` (PASSA).

- [ ] **Step 6 — teste de integração dos repositórios (branch test).** Criar `tests/integration/account-repos.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, passwordResetTokens, users } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/modules/auth/password';
import { invalidateUserResetTokens } from '@/modules/auth/password-reset.repository';
import { getUserAuthById, setUserPasswordHash } from '@/modules/auth/user.repository';
import { renameOrganization } from '@/modules/organizations/organization-settings.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('account repos — integração', () => {
  let orgId = '';
  let userId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-conta-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;
    const [user] = await tdb
      .insert(users)
      .values({
        org_id: orgId,
        email: `conta-${RUN}@ta-test.com`,
        senha_hash: await hashPassword('senha-antiga-123'),
        role: 'client',
      })
      .returning({ id: users.id });
    userId = user.id;
  });

  afterAll(async () => {
    try {
      await tdb.delete(passwordResetTokens).where(eq(passwordResetTokens.user_id, userId));
      await tdb.delete(users).where(eq(users.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      await sql.end();
    }
  });

  it('setUserPasswordHash troca o hash e a senha nova passa no verifyPassword', async () => {
    const novoHash = await hashPassword('senha-nova-456');
    await setUserPasswordHash(userId, novoHash);
    const user = await getUserAuthById(userId);
    expect(user).not.toBeNull();
    expect(await verifyPassword('senha-nova-456', user!.senha_hash)).toBe(true);
    expect(await verifyPassword('senha-antiga-123', user!.senha_hash)).toBe(false);
  });

  it('invalidateUserResetTokens marca todos os tokens abertos como usados', async () => {
    await tdb.insert(passwordResetTokens).values([
      {
        user_id: userId,
        token_hash: `a`.repeat(63) + '1',
        expira_em: new Date(Date.now() + 60 * 60_000),
      },
      {
        user_id: userId,
        token_hash: `a`.repeat(63) + '2',
        expira_em: new Date(Date.now() + 60 * 60_000),
      },
    ]);
    await invalidateUserResetTokens(userId);
    const abertos = await tdb
      .select({ usado_em: passwordResetTokens.usado_em })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.user_id, userId));
    expect(abertos.length).toBe(2);
    expect(abertos.every((t) => t.usado_em !== null)).toBe(true);
  });

  it('renameOrganization devolve o nome anterior e persiste o novo; org inexistente → null', async () => {
    const res = await renameOrganization(orgId, `ta-test-conta-nova-${RUN}`);
    expect(res).toEqual({ de: `ta-test-conta-${RUN}` });
    const [org] = await tdb
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    expect(org.name).toBe(`ta-test-conta-nova-${RUN}`);
    expect(await renameOrganization('00000000-0000-0000-0000-000000000000', 'x')).toBeNull();
  });
});
```

Rodar: `npm run test -- tests/integration/account-repos.test.ts` (PASSA com `DATABASE_URL_TEST`).

- [ ] **Step 7 — página + forms.** Criar `src/app/(client)/configuracoes/trocar-senha-form.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';

import { changePasswordAction, type AccountState } from '@/actions/account.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

const initial: AccountState = {};

export function TrocarSenhaForm() {
  const [state, action] = useFormState(changePasswordAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4" data-testid="trocar-senha-form">
      <Field label="Senha atual" htmlFor="senhaAtual">
        <Input id="senhaAtual" name="senhaAtual" type="password" autoComplete="current-password" />
      </Field>
      <Field label="Nova senha" htmlFor="novaSenha">
        <Input id="novaSenha" name="novaSenha" type="password" autoComplete="new-password" />
      </Field>
      <Field label="Confirmar nova senha" htmlFor="confirmarSenha">
        <Input id="confirmarSenha" name="confirmarSenha" type="password" autoComplete="new-password" />
      </Field>
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert variant="success">Senha alterada com sucesso.</Alert> : null}
      <div>
        <Button type="submit" variant="primary" size="sm">
          Alterar senha
        </Button>
      </div>
    </form>
  );
}
```

Criar `src/app/(client)/configuracoes/nome-empresa-form.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import { updateOrgNameAction, type AccountState } from '@/actions/account.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

const initial: AccountState = {};

export function NomeEmpresaForm({ nomeAtual }: { nomeAtual: string }) {
  const [state, action] = useFormState(updateOrgNameAction, initial);

  return (
    <form action={action} className="flex flex-col gap-4" data-testid="nome-empresa-form">
      <Field label="Nome da empresa" htmlFor="nome">
        <Input id="nome" name="nome" defaultValue={nomeAtual} autoComplete="organization" />
      </Field>
      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      {state.ok ? <Alert variant="success">Nome atualizado.</Alert> : null}
      <div>
        <Button type="submit" variant="primary" size="sm">
          Salvar
        </Button>
      </div>
    </form>
  );
}
```

Criar `src/app/(client)/configuracoes/page.tsx`:

```tsx
import type { Metadata } from 'next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PLANO_LABEL } from '@/lib/labels';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getUserAuthById } from '@/modules/auth/user.repository';
import { NomeEmpresaForm } from './nome-empresa-form';
import { TrocarSenhaForm } from './trocar-senha-form';

export const metadata: Metadata = {
  title: 'Configurações — Truth Analytics',
  description: 'Gerencie sua conta: senha, nome da empresa e plano.',
};

export default async function ConfiguracoesPage() {
  const access = await requireActiveOrg();
  const [org, user] = await Promise.all([
    getOrganizationById(access.orgId),
    getUserAuthById(access.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Configurações</h1>

      <Card data-testid="conta-info">
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Sua conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted">
            E-mail: <span className="font-mono text-white/80">{user?.email ?? '—'}</span>
          </p>
          <p className="text-muted">
            Plano atual:{' '}
            <span className="font-mono text-white/80">
              {access.plano ? PLANO_LABEL[access.plano] : 'Sem plano'}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card data-testid="nome-empresa-card">
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Nome da empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NomeEmpresaForm nomeAtual={org?.name ?? ''} />
        </CardContent>
      </Card>

      <Card data-testid="trocar-senha-card">
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Trocar senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrocarSenhaForm />
        </CardContent>
      </Card>
    </main>
  );
}
```

Criar `src/app/(client)/configuracoes/loading.tsx` (conferir o padrão real de `conexoes/loading.tsx` e seguir o mesmo estilo):

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
```

- [ ] **Step 8 — nav + ⌘K + middleware (testes primeiro).** Em `tests/unit/nav-model.test.ts` (G4), atualizar o teste do client (JUSTIFICATIVA: item de nav novo é a feature):

```ts
  it('client vê Dashboard, Conexões, Plano de Ação (com badge) e Configurações', () => {
    expect(navItems('client')).toEqual([
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/conexoes', label: 'Conexões' },
      { href: '/dashboard/plano-de-acao', label: 'Plano de Ação', badge: true },
      { href: '/configuracoes', label: 'Configurações' },
    ]);
  });
```

Em `tests/unit/command-model.test.ts`, atualizar a expectativa do client (REVALIDAR: a G4 T6 pode ter adicionado comandos — manter os existentes e INSERIR `nav-configuracoes` após `nav-conexoes`):

```ts
    expect(cmds.map((c) => c.id)).toEqual([
      'nav-dashboard',
      'nav-conexoes',
      'nav-configuracoes',
      'acao-gerar-relatorio',
      'acao-adicionar-produto',
    ]);
```

Em `tests/unit/auth-callbacks.test.ts`, adicionar:

```ts
  it('rota /configuracoes exige login (clientRoute)', () => {
    const url = new URL('http://localhost/configuracoes');
    const deslogado = authConfig.callbacks.authorized!({
      auth: null,
      request: { nextUrl: url } as never,
    });
    expect(deslogado).toBe(false);
    const logado = authConfig.callbacks.authorized!({
      auth: { user: { role: 'client' } } as never,
      request: { nextUrl: url } as never,
    });
    expect(logado).toBe(true);
  });
```

Rodar `npm run test -- tests/unit/nav-model.test.ts tests/unit/command-model.test.ts tests/unit/auth-callbacks.test.ts` (FALHA). Implementar:

Em `src/components/nav-model.ts`, no retorno de `navItems` para client:

```ts
  return [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/conexoes', label: 'Conexões' },
    { href: '/dashboard/plano-de-acao', label: 'Plano de Ação', badge: true },
    { href: '/configuracoes', label: 'Configurações' },
  ];
```

Em `src/components/command-model.ts`, após o push condicional existente (inserir ANTES do bloco `if (variant === 'admin')`):

```ts
  if (variant === 'client') {
    nav.push({
      id: 'nav-configuracoes',
      label: 'Ir para Configurações',
      group: 'Navegação',
      href: '/configuracoes',
      keywords: 'senha empresa conta plano',
    });
  }
```

Em `src/modules/auth/auth-config.ts:10`:

```ts
const clientRoutes = ['/dashboard', '/conexoes', '/configuracoes'];
```

Rodar de novo (PASSA).

- [ ] **Step 9 — verificação completa:** `npm run test` + `npm run typecheck` verdes. `npx playwright test` verde (nenhum spec usa a nav de Configurações; fluxos preservados). Smoke manual: login cliente → nav "Configurações" → trocar senha com senha atual errada (erro), certa (sucesso + relogin com a nova), renomear empresa (nome novo no admin), ⌘K → "Ir para Configurações".

- [ ] **Step 10 — commit:**

```bash
git add src/modules/auth/rate-limit.ts src/modules/auth/user.repository.ts src/modules/auth/password-reset.repository.ts src/modules/organizations/organization-settings.repository.ts src/modules/notifications/templates.ts src/modules/notifications/email.ts src/actions/account.actions.ts "src/app/(client)/configuracoes" src/modules/auth/auth-config.ts src/components/nav-model.ts src/components/command-model.ts tests/unit/account-actions.test.ts tests/integration/account-repos.test.ts tests/unit/nav-model.test.ts tests/unit/command-model.test.ts tests/unit/auth-callbacks.test.ts tests/unit/notification-templates.test.ts
git commit -m "feat(g5): pagina /configuracoes com troca de senha (exige atual, rate-limit, auditoria, e-mail) e nome da empresa"
```

---

### Task 2: Segundo usuário por org — admin cria direto com senha temporária + fix determinismo de `recipients`

**Files:**
- Modify: `src/modules/auth/user.repository.ts` (+ `MAX_USERS_CLIENT_POR_ORG`, `listOrgUsers`, `createOrgClientUser`)
- Modify: `src/modules/notifications/recipients.ts` (`orderBy` em `getOrgPrimaryEmail` e `getOrgPrimaryUser`)
- Modify: `src/actions/admin.actions.ts` (+ `adminCreateOrgUserAction`)
- Create: `src/app/admin/[orgId]/org-users.tsx`
- Modify: `src/app/admin/[orgId]/page.tsx` (card "Usuários")
- Test: `tests/integration/org-users.test.ts` (novo), `tests/integration/recipients.test.ts` (mod)

**Interfaces:**
- Consumes: `hashPassword` (cost 12), `getUserByEmail`/`normalizeEmail` (user.repository), `requireAdmin`, `getOrganizationById`, `recordAudit`, `formatData` (`@/lib/format`, já importado na page do admin), `randomBytes` (`node:crypto`).
- Produces:

```ts
// user.repository.ts
export const MAX_USERS_CLIENT_POR_ORG = 3;
export async function listOrgUsers(
  orgId: string,
): Promise<Array<{ id: string; email: string; role: string; created_at: Date }>>;
/** Lança 'email_em_uso' | 'limite_usuarios'. */
export async function createOrgClientUser(input: {
  orgId: string;
  email: string;
  senha: string;
}): Promise<{ userId: string }>;

// admin.actions.ts
export type CriarUsuarioState = {
  error?: string;
  ok?: boolean;
  email?: string;
  senhaTemporaria?: string; // exibida UMA vez; nunca em audit/log/e-mail
};
export async function adminCreateOrgUserAction(
  _prev: CriarUsuarioState,
  formData: FormData,
): Promise<CriarUsuarioState>;
```

- [ ] **Step 1 — teste de integração falhando.** Criar `tests/integration/org-users.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, users } from '@/db/schema';
import {
  MAX_USERS_CLIENT_POR_ORG,
  createOrgClientUser,
  listOrgUsers,
} from '@/modules/auth/user.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

describe.skipIf(!url)('createOrgClientUser / listOrgUsers — integração', () => {
  let orgId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-orgusers-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;
    await tdb.insert(users).values({
      org_id: orgId,
      email: `dono-${RUN}@ta-test.com`,
      senha_hash: 'hash_placeholder',
      role: 'client',
      created_at: new Date('2026-01-01T00:00:00Z'),
    });
  });

  afterAll(async () => {
    try {
      await tdb.delete(users).where(eq(users.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      await sql.end();
    }
  });

  it('cria o 2º usuário client na org e listOrgUsers ordena do mais antigo pro mais novo', async () => {
    const { userId } = await createOrgClientUser({
      orgId,
      email: `socio-${RUN}@ta-test.com`,
      senha: 'senha-temporaria-12',
    });
    expect(userId).toBeTruthy();
    const lista = await listOrgUsers(orgId);
    expect(lista.map((u) => u.email)).toEqual([
      `dono-${RUN}@ta-test.com`,
      `socio-${RUN}@ta-test.com`,
    ]);
  });

  it('e-mail já usado (mesmo com caixa diferente) → email_em_uso', async () => {
    await expect(
      createOrgClientUser({ orgId, email: `SOCIO-${RUN}@ta-test.com`, senha: 'x'.repeat(12) }),
    ).rejects.toThrow('email_em_uso');
  });

  it(`respeita MAX_USERS_CLIENT_POR_ORG (${3})`, async () => {
    expect(MAX_USERS_CLIENT_POR_ORG).toBe(3);
    await createOrgClientUser({ orgId, email: `terceiro-${RUN}@ta-test.com`, senha: 'x'.repeat(12) });
    await expect(
      createOrgClientUser({ orgId, email: `quarto-${RUN}@ta-test.com`, senha: 'x'.repeat(12) }),
    ).rejects.toThrow('limite_usuarios');
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/integration/org-users.test.ts` (FALHA: exports não existem).

- [ ] **Step 3 — repositório.** Em `src/modules/auth/user.repository.ts`, trocar o import do drizzle por `import { and, asc, count, eq } from 'drizzle-orm';` e adicionar ao final:

```ts
export const MAX_USERS_CLIENT_POR_ORG = 3;

export async function listOrgUsers(
  orgId: string,
): Promise<Array<{ id: string; email: string; role: string; created_at: Date }>> {
  return db
    .select({ id: users.id, email: users.email, role: users.role, created_at: users.created_at })
    .from(users)
    .where(eq(users.org_id, orgId))
    .orderBy(asc(users.created_at), asc(users.id));
}

/**
 * Cria um usuário adicional role='client' na org (fluxo do admin Truth).
 * Lança 'email_em_uso' (inclusive na corrida via unique 23505) e
 * 'limite_usuarios' (MAX_USERS_CLIENT_POR_ORG).
 */
export async function createOrgClientUser(input: {
  orgId: string;
  email: string;
  senha: string;
}): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);

  const existing = await getUserByEmail(email);
  if (existing) throw new Error('email_em_uso');

  const [{ n }] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.org_id, input.orgId), eq(users.role, 'client')));
  if (Number(n) >= MAX_USERS_CLIENT_POR_ORG) throw new Error('limite_usuarios');

  const senha_hash = await hashPassword(input.senha);
  try {
    const [user] = await db
      .insert(users)
      .values({ org_id: input.orgId, email, senha_hash, role: 'client' })
      .returning({ id: users.id });
    return { userId: user.id };
  } catch (e: unknown) {
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
      throw new Error('email_em_uso');
    }
    throw e;
  }
}
```

Rodar: `npm run test -- tests/integration/org-users.test.ts` (PASSA).

- [ ] **Step 4 — fix determinismo de recipients (teste primeiro).** Em `tests/integration/recipients.test.ts`, no `beforeAll`, trocar o insert do userA para fixar `created_at` e adicionar um 2º usuário MAIS NOVO na org A:

```ts
    const [userA] = await tdb
      .insert(users)
      .values({
        org_id: orgAId,
        email: `cliente-${RUN}@ta-test.com`,
        senha_hash: 'hash_placeholder',
        role: 'client',
        created_at: new Date('2026-01-01T00:00:00Z'),
      })
      .returning({ id: users.id });
    userAId = userA.id;

    // 2º usuário MAIS NOVO na org A — o "primário" deve continuar sendo o mais antigo
    await tdb.insert(users).values({
      org_id: orgAId,
      email: `cliente-segundo-${RUN}@ta-test.com`,
      senha_hash: 'hash_placeholder',
      role: 'client',
      created_at: new Date('2026-06-01T00:00:00Z'),
    });
```

E adicionar o teste:

```ts
  it('com 2 usuários na org, o primário é o mais antigo (determinístico)', async () => {
    const { getOrgPrimaryEmail, getOrgPrimaryUser } = await import(
      '@/modules/notifications/recipients'
    );
    expect(await getOrgPrimaryEmail(orgAId)).toBe(`cliente-${RUN}@ta-test.com`);
    const user = await getOrgPrimaryUser(orgAId);
    expect(user?.id).toBe(userAId);
  });
```

Rodar `npm run test -- tests/integration/recipients.test.ts` — pode passar por sorte (ordem física); implementar o fix MESMO ASSIM (o teste garante regressão futura). Em `src/modules/notifications/recipients.ts`, trocar o import por `import { and, asc, eq } from 'drizzle-orm';` e, em `getOrgPrimaryEmail` E `getOrgPrimaryUser`, inserir antes do `.limit(1)`:

```ts
    .orderBy(asc(users.created_at), asc(users.id))
```

Atualizar os dois docstrings: trocar a frase "MVP = 1 usuário por org." por "Com múltiplos usuários, o primário é o mais antigo (created_at, id) — determinístico.". Rodar de novo (PASSA).

- [ ] **Step 5 — action do admin.** Em `src/actions/admin.actions.ts`, adicionar aos imports:

```ts
import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { createOrgClientUser, normalizeEmail } from '@/modules/auth/user.repository';
```

e ao final do arquivo:

```ts
export type CriarUsuarioState = {
  error?: string;
  ok?: boolean;
  email?: string;
  senhaTemporaria?: string;
};

/**
 * Cria um usuário adicional (role client) para a org — fluxo do admin Truth.
 * A senha temporária é gerada aqui, devolvida SÓ no state (exibida uma vez)
 * e NUNCA vai para audit/log/e-mail.
 */
export async function adminCreateOrgUserAction(
  _prev: CriarUsuarioState,
  formData: FormData,
): Promise<CriarUsuarioState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const parsed = z.string().trim().email('E-mail inválido.').safeParse(formData.get('email'));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'E-mail inválido.' };

  const org = await getOrganizationById(orgId);
  if (!org) return { error: 'Cliente inválido.' };

  const senhaTemporaria = randomBytes(9).toString('base64url'); // 12 chars
  try {
    const { userId } = await createOrgClientUser({ orgId, email: parsed.data, senha: senhaTemporaria });
    await recordAudit({
      orgId,
      userId: admin.id,
      acao: 'user.criado_admin',
      detalhes: { email: normalizeEmail(parsed.data), novoUserId: userId },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'email_em_uso') {
      return { error: 'Já existe uma conta com este e-mail.' };
    }
    if (e instanceof Error && e.message === 'limite_usuarios') {
      return { error: 'Limite de usuários desta organização atingido (máx. 3).' };
    }
    throw e;
  }
  revalidatePath(`/admin/${orgId}`);
  return { ok: true, email: normalizeEmail(parsed.data), senhaTemporaria };
}
```

- [ ] **Step 6 — UI.** Criar `src/app/admin/[orgId]/org-users.tsx`:

```tsx
'use client';

import { useFormState } from 'react-dom';

import { adminCreateOrgUserAction, type CriarUsuarioState } from '@/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

const initial: CriarUsuarioState = {};

type Usuario = { id: string; email: string; createdAt: string };

export function OrgUsers({ orgId, usuarios }: { orgId: string; usuarios: Usuario[] }) {
  const [state, action] = useFormState(adminCreateOrgUserAction, initial);

  return (
    <div className="space-y-4">
      <ul className="flex flex-col divide-y divide-line" data-testid="org-users-list">
        {usuarios.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span className="font-mono text-white/90">{u.email}</span>
            <span className="text-xs text-dim">desde {u.createdAt}</span>
          </li>
        ))}
      </ul>

      <form action={action} className="flex flex-wrap items-end gap-3" data-testid="criar-usuario-form">
        <input type="hidden" name="orgId" value={orgId} />
        <Field label="E-mail do novo usuário" htmlFor="novo-usuario-email" className="min-w-64 flex-1">
          <Input id="novo-usuario-email" name="email" type="email" placeholder="socio@empresa.com" />
        </Field>
        <Button type="submit" variant="primary" size="sm">
          Criar usuário
        </Button>
      </form>

      {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
      {state.ok && state.senhaTemporaria ? (
        <Alert variant="success" title="Usuário criado.">
          <p>
            Envie ao cliente o acesso: <span className="font-mono">{state.email}</span> · senha
            temporária{' '}
            <span className="font-mono" data-testid="senha-temporaria">
              {state.senhaTemporaria}
            </span>
          </p>
          <p className="mt-1 text-xs">
            Esta senha aparece só uma vez. Oriente o cliente a trocá-la em Configurações após o
            primeiro acesso.
          </p>
        </Alert>
      ) : null}
    </div>
  );
}
```

Em `src/app/admin/[orgId]/page.tsx`: adicionar aos imports `import { listOrgUsers } from '@/modules/auth/user.repository';` e `import { OrgUsers } from './org-users';`; incluir `listOrgUsers(org.id)` no `Promise.all` existente (novo binding `usuarios` na desestruturação); e inserir o card entre "Consultoria" e "Meta mensal":

```tsx
      <Card data-testid="org-users-card">
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Usuários ({usuarios.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <OrgUsers
            orgId={org.id}
            usuarios={usuarios.map((u) => ({
              id: u.id,
              email: u.email,
              createdAt: formatData(u.created_at),
            }))}
          />
        </CardContent>
      </Card>
```

- [ ] **Step 7 — verificação:** `npm run test` + `npm run typecheck` verdes. `npx playwright test` verde (admin.spec não usa o card novo). Smoke manual: /admin/[orgId] → criar 2º usuário → senha temporária exibida → logout → login com o novo usuário → dashboard da MESMA org → trocar senha em /configuracoes.

- [ ] **Step 8 — commit:**

```bash
git add src/modules/auth/user.repository.ts src/modules/notifications/recipients.ts src/actions/admin.actions.ts "src/app/admin/[orgId]/org-users.tsx" "src/app/admin/[orgId]/page.tsx" tests/integration/org-users.test.ts tests/integration/recipients.test.ts
git commit -m "feat(g5): admin cria 2o usuario por org com senha temporaria + recipients deterministicos (mais antigo primeiro)"
```

---

### Task 3: LGPD mínimo viável — /termos + /privacidade (conteúdo real) + aceite obrigatório no signup

> **Nota ao dono (fica FORA do site, só neste plano):** os textos abaixo são um ponto de partida operacional completo. Antes do lançamento comercial, revisar com jurídico e completar: razão social + CNPJ da Truth Commerce, cidade do foro (seção 12 dos Termos) e eventual nomeação formal de Encarregado (DPO). Nenhum disclaimer de "não é aconselhamento jurídico" vai para o site.

**Files:**
- Modify: `src/db/schema/users.ts` (+ `aceitou_termos_em`) → migration gerada (`npm run db:generate`)
- Create: `src/app/(legal)/layout.tsx`, `src/app/(legal)/tipografia.tsx`, `src/app/(legal)/termos/page.tsx`, `src/app/(legal)/privacidade/page.tsx`
- Modify: `src/app/page.tsx` (footer), `src/app/(auth)/layout.tsx` (links), `src/app/(auth)/sign-up/page.tsx` (checkbox)
- Modify: `src/actions/auth.actions.ts` (schema), `src/modules/auth/user.repository.ts` (`createOrgWithUser` grava o aceite)
- Test: `tests/unit/auth-actions-zod.test.ts` (mod), `tests/integration/create-org-with-user.test.ts` (mod), `tests/e2e/auth.spec.ts` + `tests/e2e/admin.spec.ts` (mod JUSTIFICADO)

**Interfaces:**
- Consumes: `signUpSchema`/`signUpAction` (auth.actions.ts), `createOrgWithUser` (user.repository.ts), `Logo`, `Link` (next/link).
- Produces:

```ts
// src/db/schema/users.ts — coluna nova (nullable; usuários antigos ficam null)
aceitou_termos_em: timestamp('aceitou_termos_em', { withTimezone: true, mode: 'date' }),

// (legal)/tipografia.tsx
export function H2(props: { children: React.ReactNode }): JSX.Element;
export function P(props: { children: React.ReactNode }): JSX.Element;
export function UL(props: { children: React.ReactNode }): JSX.Element;
```

- [ ] **Step 1 — testes falhando (unit + integração).** Em `tests/unit/auth-actions-zod.test.ts`, atualizar o teste de anti-enumeração para incluir `aceite: 'on'` no form (sem isso ele passa a falhar na validação nova) e adicionar o caso novo:

```ts
    const res = await signUpAction(
      {},
      form({ orgName: 'Empresa Teste', email: 'ja-existe@teste.dev', senha: 'x'.repeat(8), aceite: 'on' }),
    );
```

```ts
describe('signUpAction — aceite dos termos (LGPD)', () => {
  it('sem aceite → erro e nada é criado', async () => {
    const res = await signUpAction(
      {},
      form({ orgName: 'Empresa Teste', email: 'novo@teste.dev', senha: 'x'.repeat(8) }),
    );
    expect(res.error).toBe(
      'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.',
    );
    expect(createOrgWithUser).not.toHaveBeenCalled();
  });
});
```

Em `tests/integration/create-org-with-user.test.ts`, adicionar após os testes existentes:

```ts
  it('grava o aceite dos termos (aceitou_termos_em preenchido)', async () => {
    const [user] = await tdb
      .select({ aceitou_termos_em: users.aceitou_termos_em })
      .from(users)
      .where(eq(users.id, createdUserId))
      .limit(1);
    expect(user.aceitou_termos_em).toBeInstanceOf(Date);
  });
```

Rodar `npm run test -- tests/unit/auth-actions-zod.test.ts tests/integration/create-org-with-user.test.ts` (FALHA: mensagem não existe / coluna não existe).

- [ ] **Step 2 — schema + migration.** Em `src/db/schema/users.ts`, adicionar entre `role` e `created_at`:

```ts
  /** Carimbo do aceite de Termos de Uso + Política de Privacidade no signup (LGPD). Null p/ contas pré-G5. */
  aceitou_termos_em: timestamp('aceitou_termos_em', { withTimezone: true, mode: 'date' }),
```

Gerar e aplicar no branch test:

```bash
npm run db:generate
npm run db:migrate:test
```

Conferir que o SQL gerado é APENAS `ALTER TABLE "users" ADD COLUMN "aceitou_termos_em" timestamp with time zone;` (aditivo). REVALIDAR: se `tests/unit/schema.test.ts` assertar a lista de colunas de `users`, incluir a coluna nova lá (mudança justificada: coluna é a feature).

- [ ] **Step 3 — action + repositório.** Em `src/actions/auth.actions.ts`, atualizar o schema e o parse:

```ts
const signUpSchema = z.object({
  orgName: z.string().trim().min(2, 'Informe o nome da empresa.'),
  email: z.string().trim().email('E-mail inválido.'),
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
  aceite: z.literal('on', {
    errorMap: () => ({
      message: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.',
    }),
  }),
});
```

```ts
  const parsed = signUpSchema.safeParse({
    orgName: formData.get('orgName'),
    email: formData.get('email'),
    senha: formData.get('senha'),
    aceite: formData.get('aceite'),
  });
```

Em `src/modules/auth/user.repository.ts`, no `createOrgWithUser`, trocar o insert do usuário por (o único caller é o signup, que SÓ chega aqui com aceite validado):

```ts
      const [user] = await tx
        .insert(users)
        .values({ org_id: org.id, email, senha_hash, role: 'client', aceitou_termos_em: new Date() })
        .returning({ id: users.id });
```

Rodar: `npm run test -- tests/unit/auth-actions-zod.test.ts tests/integration/create-org-with-user.test.ts` (PASSA).

- [ ] **Step 4 — tipografia + layout legal.** Criar `src/app/(legal)/tipografia.tsx`:

```tsx
import React from 'react';

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 font-heading text-lg font-semibold text-white">{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-muted">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">{children}</ul>;
}
```

Criar `src/app/(legal)/layout.tsx`:

```tsx
import Link from 'next/link';
import React from 'react';

import { Logo } from '@/components/ui/Logo';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-bg-base text-white">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link href="/" aria-label="Truth Analytics — início">
            <Logo size="sm" />
          </Link>
          <Link href="/" className="text-sm text-muted transition-colors hover:text-white">
            ← Voltar ao início
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-10">{children}</div>
      <footer className="border-t border-line py-6 text-center text-xs text-dim">
        <p>&copy; {new Date().getFullYear()} Truth Commerce. Todos os direitos reservados.</p>
      </footer>
    </main>
  );
}
```

- [ ] **Step 5 — Termos de Uso (conteúdo real).** Criar `src/app/(legal)/termos/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { H2, P, UL } from '../tipografia';

export const metadata: Metadata = {
  title: 'Termos de Uso — Truth Analytics',
  description: 'Condições de uso da plataforma Truth Analytics (Truth Commerce).',
};

export default function TermosPage() {
  return (
    <article>
      <h1 className="font-heading text-2xl font-bold text-white">Termos de Uso</h1>
      <p className="mt-2 text-xs text-dim">Última atualização: 14 de julho de 2026.</p>

      <H2>1. Quem somos e aceitação</H2>
      <P>
        O Truth Analytics é uma plataforma de inteligência de vendas para e-commerce operada pela
        Truth Commerce (&quot;nós&quot;), acessível em truthcommerce.com.br. Ao criar uma conta,
        marcar a caixa de aceite no cadastro ou usar a plataforma, você (&quot;cliente&quot;)
        concorda integralmente com estes Termos de Uso e com a nossa{' '}
        <Link href="/privacidade" className="text-brand hover:underline">
          Política de Privacidade
        </Link>
        . Se você aceita em nome de uma empresa, declara ter poderes para vinculá-la.
      </P>

      <H2>2. O serviço</H2>
      <P>
        O Truth Analytics conecta-se ao seu sistema de gestão (ERP Bling) mediante a sua
        autorização e, a partir dos seus dados de pedidos e de dados públicos de mercado, gera
        periodicamente relatórios de análise com métricas consolidadas, comparativos de preço,
        alertas e recomendações produzidas com apoio de inteligência artificial, além de um plano
        de ação acompanhado por analistas da Truth Commerce.
      </P>

      <H2>3. Conta, credenciais e usuários adicionais</H2>
      <UL>
        <li>Você é responsável por manter a confidencialidade das suas credenciais.</li>
        <li>
          Usuários adicionais da sua organização são criados pela equipe Truth mediante sua
          solicitação e recebem senha temporária, que deve ser trocada no primeiro acesso em
          Configurações.
        </li>
        <li>
          Avise-nos imediatamente (suporte@truthcommerce.com.br) sobre qualquer uso não autorizado
          da sua conta.
        </li>
      </UL>

      <H2>4. Conexão com o ERP</H2>
      <P>
        A conexão com o Bling é feita via OAuth, autorizada por você e revogável a qualquer momento
        na página Conexões da plataforma ou no painel do próprio Bling. Os tokens de acesso são
        armazenados cifrados. Nós lemos apenas os dados de pedidos necessários para gerar as
        análises (canal de venda, data, valores, frete e itens) — não alteramos dados no seu ERP.
      </P>

      <H2>5. Planos, limites e disponibilidade</H2>
      <UL>
        <li>
          Os planos (Semanal, Quinzenal e Mensal) definem a cadência dos relatórios e o limite de
          produtos monitorados.
        </li>
        <li>
          A plataforma é fornecida em regime de melhor esforço; manutenções e indisponibilidades
          pontuais podem ocorrer.
        </li>
        <li>
          Condições comerciais (preço, forma de pagamento, reajuste) são acordadas em proposta ou
          contrato à parte.
        </li>
      </UL>

      <H2>6. Natureza das análises</H2>
      <P>
        As análises, alertas e recomendações são geradas por software, incluindo modelos de
        inteligência artificial, a partir dos dados disponíveis no período analisado. Elas são um
        apoio à decisão do gestor — não constituem promessa de resultado, aconselhamento
        financeiro, contábil ou de investimento, e dependem da qualidade e completude dos dados do
        seu ERP e das fontes públicas de mercado. A decisão comercial é sempre sua.
      </P>

      <H2>7. Obrigações do cliente</H2>
      <UL>
        <li>Usar a plataforma de forma lícita e apenas com dados sobre os quais tem legitimidade.</li>
        <li>Não tentar acessar dados de outras organizações, burlar limites ou realizar engenharia reversa.</li>
        <li>Manter seus dados cadastrais atualizados.</li>
      </UL>

      <H2>8. Propriedade intelectual</H2>
      <P>
        A plataforma, sua marca, código e layout pertencem à Truth Commerce. Os dados de vendas
        importados do seu ERP permanecem seus; você nos concede licença de processamento desses
        dados exclusivamente para a prestação do serviço, nos termos da Política de Privacidade. Os
        relatórios gerados para a sua organização podem ser usados livremente por você.
      </P>

      <H2>9. Privacidade e proteção de dados</H2>
      <P>
        O tratamento de dados pessoais segue a nossa{' '}
        <Link href="/privacidade" className="text-brand hover:underline">
          Política de Privacidade
        </Link>{' '}
        e a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD).
      </P>

      <H2>10. Suspensão e encerramento</H2>
      <UL>
        <li>
          Podemos suspender contas por violação destes Termos, uso abusivo ou inadimplência,
          mediante aviso quando possível.
        </li>
        <li>
          Você pode encerrar sua conta a qualquer momento solicitando a
          suporte@truthcommerce.com.br. Após o encerramento, seus dados são excluídos conforme a
          seção de retenção da Política de Privacidade (em até 30 dias).
        </li>
      </UL>

      <H2>11. Limitação de responsabilidade</H2>
      <P>
        Na máxima extensão permitida em lei, a Truth Commerce não responde por lucros cessantes,
        perda de receita ou danos indiretos decorrentes do uso ou da indisponibilidade da
        plataforma, nem por decisões comerciais tomadas com base nas análises. Nada nestes Termos
        exclui responsabilidades que não possam ser excluídas por lei.
      </P>

      <H2>12. Alterações, lei aplicável e foro</H2>
      <P>
        Podemos atualizar estes Termos; mudanças relevantes serão comunicadas na plataforma ou por
        e-mail, e a data de &quot;última atualização&quot; acima será revisada. Estes Termos são
        regidos pelas leis da República Federativa do Brasil, ficando eleito o foro da comarca da
        sede da Truth Commerce, salvo disposição legal em contrário.
      </P>

      <H2>13. Contato</H2>
      <P>
        Dúvidas sobre estes Termos: <span className="font-mono">suporte@truthcommerce.com.br</span>.
      </P>
    </article>
  );
}
```

- [ ] **Step 6 — Política de Privacidade (conteúdo real).** Criar `src/app/(legal)/privacidade/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { H2, P, UL } from '../tipografia';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Truth Analytics',
  description:
    'Como a Truth Commerce trata dados pessoais e dados de vendas na plataforma Truth Analytics (LGPD).',
};

export default function PrivacidadePage() {
  return (
    <article>
      <h1 className="font-heading text-2xl font-bold text-white">Política de Privacidade</h1>
      <p className="mt-2 text-xs text-dim">Última atualização: 14 de julho de 2026.</p>

      <H2>1. Quem é o controlador</H2>
      <P>
        A Truth Commerce (&quot;nós&quot;) é a controladora dos dados pessoais tratados na
        plataforma Truth Analytics, nos termos da Lei Geral de Proteção de Dados (Lei nº
        13.709/2018 — LGPD). Canal de contato do controlador e do encarregado pelo tratamento de
        dados: <span className="font-mono">suporte@truthcommerce.com.br</span>.
      </P>

      <H2>2. Quais dados tratamos</H2>
      <UL>
        <li>
          <strong className="text-white/90">Dados de conta:</strong> nome da empresa, e-mail dos
          usuários e senha (armazenada apenas como hash criptográfico — nunca em claro).
        </li>
        <li>
          <strong className="text-white/90">Dados operacionais de vendas (via ERP Bling, com a
          sua autorização):</strong> identificador do pedido, canal de venda, data, valor total,
          frete e itens vendidos. Não importamos nome, CPF, endereço ou contato dos consumidores
          finais dos seus pedidos.
        </li>
        <li>
          <strong className="text-white/90">Dados públicos de mercado:</strong> preços e anúncios
          publicamente disponíveis em marketplaces, coletados para benchmark dos seus produtos.
        </li>
        <li>
          <strong className="text-white/90">Registros de segurança:</strong> endereço IP e
          horário de tentativas de login, cadastro e redefinição de senha (antifraude e prevenção
          de abuso), além de trilha de auditoria das ações sensíveis na plataforma.
        </li>
      </UL>

      <H2>3. Para que usamos (finalidades e bases legais)</H2>
      <UL>
        <li>
          Prestar o serviço contratado — gerar relatórios, alertas, plano de ação e benchmark
          (execução de contrato, art. 7º, V, da LGPD).
        </li>
        <li>
          Autenticação, segurança, prevenção a fraudes e cumprimento de obrigações legais de
          guarda de registros (legítimo interesse e obrigação legal, art. 7º, II e IX).
        </li>
        <li>
          Comunicações operacionais por e-mail — relatório pronto, alertas, avisos de conta
          (execução de contrato). Não enviamos marketing sem seu consentimento.
        </li>
      </UL>

      <H2>4. Inteligência artificial e operadores</H2>
      <P>
        Para gerar as análises, enviamos métricas agregadas de vendas do período (totais por canal,
        evolução diária, produtos mais vendidos, comparativos de preço) para a Anthropic, operadora
        do modelo de IA Claude, que processa esses dados exclusivamente para produzir o relatório
        da sua organização. Também utilizamos como operadores: Vercel (hospedagem da aplicação),
        Neon (banco de dados), Resend (envio de e-mails transacionais) e SerpApi (consulta de
        preços públicos de mercado). Esses fornecedores podem processar dados em servidores fora do
        Brasil (Estados Unidos); a transferência internacional segue o art. 33 da LGPD, com
        salvaguardas contratuais adequadas.
      </P>

      <H2>5. Com quem compartilhamos</H2>
      <P>
        Não vendemos nem alugamos dados pessoais. Compartilhamos dados apenas com os operadores
        listados acima (estritamente para a prestação do serviço), com analistas da Truth Commerce
        designados para a sua conta, e quando exigido por lei ou ordem de autoridade competente.
      </P>

      <H2>6. Por quanto tempo guardamos</H2>
      <UL>
        <li>Dados de conta e de vendas: enquanto durar a relação contratual.</li>
        <li>
          Após o encerramento da conta ou pedido de exclusão: eliminação em até 30 dias corridos,
          ressalvados registros cuja guarda seja exigida por lei (ex.: registros de acesso — Marco
          Civil da Internet) e o registro mínimo da própria exclusão.
        </li>
        <li>Cópias de segurança (backups) expiram nos ciclos normais de rotação.</li>
      </UL>

      <H2>7. Como protegemos</H2>
      <UL>
        <li>Criptografia em trânsito (TLS) em toda a plataforma.</li>
        <li>Tokens de acesso ao ERP armazenados cifrados (AES-256-GCM).</li>
        <li>Senhas armazenadas com hash bcrypt; links de redefinição de uso único e com expiração.</li>
        <li>Isolamento por organização: cada cliente só acessa os dados da própria conta.</li>
        <li>Trilha de auditoria das ações sensíveis e limitação de tentativas de acesso.</li>
      </UL>

      <H2>8. Seus direitos (art. 18 da LGPD)</H2>
      <P>
        Você pode solicitar, a qualquer momento: confirmação da existência de tratamento; acesso
        aos dados; correção de dados incompletos ou desatualizados; anonimização, bloqueio ou
        eliminação de dados desnecessários; portabilidade; informação sobre compartilhamentos;
        e revogação do consentimento. Para exercer, escreva para{' '}
        <span className="font-mono">suporte@truthcommerce.com.br</span> — respondemos nos prazos da
        LGPD. Você também pode peticionar à Autoridade Nacional de Proteção de Dados (ANPD).
      </P>

      <H2>9. Cookies</H2>
      <P>
        Usamos apenas cookies essenciais de sessão para autenticação. Não usamos cookies de
        rastreamento ou publicidade.
      </P>

      <H2>10. Alterações desta política</H2>
      <P>
        Mudanças relevantes serão comunicadas na plataforma ou por e-mail, com atualização da data
        no topo desta página. O uso continuado após a comunicação vale como ciência. Consulte
        também os nossos{' '}
        <Link href="/termos" className="text-brand hover:underline">
          Termos de Uso
        </Link>
        .
      </P>
    </article>
  );
}
```

- [ ] **Step 7 — checkbox no signup + links.** Em `src/app/(auth)/sign-up/page.tsx` (REVALIDAR: G4 T5 pode ter trocado o `<p>` de erro por `Alert` e `<a>` por `Link` — preservar o que estiver no master), adicionar `import Link from 'next/link';` e inserir entre o `Field` da senha e o bloco de erro:

```tsx
            <label htmlFor="aceite" className="flex items-start gap-2 text-sm text-muted">
              <input
                id="aceite"
                name="aceite"
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-line bg-bg-elevated accent-brand"
              />
              <span>
                Li e aceito os{' '}
                <Link href="/termos" target="_blank" className="text-brand hover:underline">
                  Termos de Uso
                </Link>{' '}
                e a{' '}
                <Link href="/privacidade" target="_blank" className="text-brand hover:underline">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>
```

Em `src/app/(auth)/layout.tsx`, substituir o conteúdo por:

```tsx
import Link from 'next/link';
import React from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg-base px-4 py-8">
      {children}
      <p className="text-center text-xs text-dim">
        <Link href="/termos" className="transition-colors hover:text-muted hover:underline">
          Termos de Uso
        </Link>
        <span className="mx-2">·</span>
        <Link href="/privacidade" className="transition-colors hover:text-muted hover:underline">
          Política de Privacidade
        </Link>
      </p>
    </main>
  );
}
```

Em `src/app/page.tsx` (landing — REVALIDAR pós-G4 T8, que a reescreve; o footer pode ter mudado de forma), adicionar `import Link from 'next/link';` (se ainda não houver) e, dentro do `<footer>`, após o `<p>` do copyright:

```tsx
        <p className="mt-2 text-xs text-dim">
          <Link href="/termos" className="transition-colors hover:text-muted hover:underline">
            Termos de Uso
          </Link>
          <span className="mx-2">·</span>
          <Link href="/privacidade" className="transition-colors hover:text-muted hover:underline">
            Política de Privacidade
          </Link>
        </p>
```

- [ ] **Step 8 — fix JUSTIFICADO dos specs E2E.** O checkbox obrigatório muda o fluxo de cadastro — é a própria feature (consentimento LGPD). Exatamente 1 linha em cada spec, após o fill da senha:

Em `tests/e2e/auth.spec.ts` (teste "cadastro cria conta e cai em /aguardando"):

```ts
  await page.fill('input[name="senha"]', senha);
  await page.check('input[name="aceite"]');
  await page.click('button[type="submit"]');
```

Em `tests/e2e/admin.spec.ts` (bloco de cadastro no início, linha ~21-25 — mesmo padrão):

```ts
  await page.check('input[name="aceite"]');
```

(inserida imediatamente antes do `await page.click('button[type="submit"]');` do cadastro).

- [ ] **Step 9 — verificação:** `npm run test` + `npm run typecheck` verdes. `npx playwright test` verde (specs de auth/admin com o check novo). Smoke manual: `/termos` e `/privacidade` abrem deslogado; signup sem marcar a caixa → erro pt-BR; marcando → conta criada; links visíveis na landing e nas telas de auth.

- [ ] **Step 10 — commit:**

```bash
git add src/db/schema/users.ts src/db/migrations "src/app/(legal)" src/app/page.tsx "src/app/(auth)/layout.tsx" "src/app/(auth)/sign-up/page.tsx" src/actions/auth.actions.ts src/modules/auth/user.repository.ts tests/unit/auth-actions-zod.test.ts tests/integration/create-org-with-user.test.ts tests/e2e/auth.spec.ts tests/e2e/admin.spec.ts
git commit -m "feat(g5): lgpd minimo viavel - paginas /termos e /privacidade + aceite obrigatorio no signup (users.aceitou_termos_em)"
```

---

### Task 4: Runbook de offboarding + script `scripts/purge-org.ts` (dry-run first, confirmação dupla)

**Files:**
- Create: `scripts/purge-org.ts`
- Modify: `package.json` (script `db:purge-org`)
- Create: `docs/runbooks/exclusao-de-dados-org.md`
- Test: `tests/integration/purge-org.test.ts` (novo)

**Interfaces:**
- Consumes: `DatabaseClient` (type de `@/db/client`), todas as tabelas de `@/db/schema`. FKs REAIS verificadas no schema: `notifications.user_id→users`; `task_comments.task_id→tasks`, `task_comments.user_id→users (NOT NULL)`; `task_activities.task_id→tasks`, `task_activities.user_id→users (nullable)`; `tasks.org_id→organizations`, `tasks.report_id→reports`, `tasks.assignee_user_id→users`; `alerts.org_id→organizations`; `market_snapshots.org_id→organizations`, `market_snapshots.report_id→reports`; `reports.org_id→organizations`; `orders.org_id→organizations`; `tracked_products.org_id→organizations`; `connections.org_id→organizations`; `password_reset_tokens.user_id→users`; `users.org_id→organizations`; `organizations.analista_id→users`; `login_attempts` e `audit_log` SEM FK (email/uuid crus). `org_invites` NÃO existe (decisão da Task 2).
- Produces:

```ts
// scripts/purge-org.ts
export type PurgeResultado = { executado: boolean; contagens: Record<string, number> };
/** Lança 'org_nao_encontrada' | 'confirmacao_invalida' | 'org_interna'. */
export async function purgeOrg(
  dbc: DatabaseClient,
  input: { orgId: string; nomeConfirmacao: string; confirm: boolean },
): Promise<PurgeResultado>;
```

- [ ] **Step 1 — teste de integração falhando.** Criar `tests/integration/purge-org.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  alerts,
  auditLog,
  connections,
  loginAttempts,
  marketSnapshots,
  notifications,
  orders,
  organizations,
  passwordResetTokens,
  reports,
  taskActivities,
  taskComments,
  tasks,
  trackedProducts,
  users,
} from '@/db/schema';
import { purgeOrg } from '../../scripts/purge-org';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();
const NOME = `ta-test-purge-${RUN}`;

describe.skipIf(!url)('purgeOrg — integração (org sintética completa)', () => {
  let orgId = '';
  let userId = '';
  let internaId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: NOME, status: 'active', plano: 'monthly' })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [user] = await tdb
      .insert(users)
      .values({ org_id: orgId, email: `purge-${RUN}@ta-test.com`, senha_hash: 'h', role: 'client' })
      .returning({ id: users.id });
    userId = user.id;

    const [report] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: new Date('2026-07-01T00:00:00Z'),
        periodo_fim: new Date('2026-07-07T23:59:59Z'),
        status: 'done',
      })
      .returning({ id: reports.id });

    const [task] = await tdb
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${NOME}-task`, criado_por: 'ia', report_id: report.id })
      .returning({ id: tasks.id });

    await tdb.insert(taskComments).values({ task_id: task.id, user_id: userId, corpo: 'c' });
    await tdb.insert(taskActivities).values({ task_id: task.id, user_id: userId, evento: 'criada' });
    await tdb.insert(notifications).values({ user_id: userId, tipo: 'alerta', titulo: 't' });
    await tdb.insert(alerts).values({ org_id: orgId, tipo: 'queda_vendas', titulo: 't', corpo: 'c' });
    await tdb.insert(marketSnapshots).values({
      org_id: orgId,
      report_id: report.id,
      fonte: 'mercadolivre',
      keyword: 'kw',
      dados: {},
    });
    await tdb.insert(orders).values({
      org_id: orgId,
      bling_order_id: `${RUN}`,
      canal: 'Mercado Livre',
      data: new Date('2026-07-02T12:00:00Z'),
      valor_total: '100.00',
    });
    await tdb.insert(trackedProducts).values({ org_id: orgId, nome: 'Produto', keywords: [] });
    await tdb.insert(connections).values({ org_id: orgId, provider: 'bling', status: 'ok' });
    await tdb.insert(passwordResetTokens).values({
      user_id: userId,
      token_hash: 'f'.repeat(64),
      expira_em: new Date(Date.now() + 3_600_000),
    });
    await tdb.insert(loginAttempts).values({ email: `purge-${RUN}@ta-test.com`, success: true });
    await tdb.insert(auditLog).values({ org_id: orgId, user_id: userId, acao: 'org.criada' });

    // Org interna (guard org_interna)
    const [interna] = await tdb
      .insert(organizations)
      .values({ name: `ta-test-purge-interna-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internaId = interna.id;
    await tdb.insert(users).values({
      org_id: internaId,
      email: `purge-admin-${RUN}@ta-test.com`,
      senha_hash: 'h',
      role: 'admin_truth',
    });
  });

  afterAll(async () => {
    try {
      // A org principal deve ter sido purgada pelo teste; limpar a interna e resíduos.
      await tdb.delete(users).where(eq(users.org_id, internaId));
      await tdb.delete(organizations).where(eq(organizations.id, internaId));
      await tdb.delete(auditLog).where(eq(auditLog.org_id, orgId));
      await tdb.delete(loginAttempts).where(eq(loginAttempts.email, `purge-${RUN}@ta-test.com`));
    } finally {
      await sql.end();
    }
  });

  it('nome de confirmação errado → confirmacao_invalida (nada excluído)', async () => {
    await expect(
      purgeOrg(tdb, { orgId, nomeConfirmacao: 'Nome Errado', confirm: true }),
    ).rejects.toThrow('confirmacao_invalida');
  });

  it('org com usuário admin_truth → org_interna (proteção absoluta)', async () => {
    await expect(
      purgeOrg(tdb, {
        orgId: internaId,
        nomeConfirmacao: `ta-test-purge-interna-${RUN}`,
        confirm: true,
      }),
    ).rejects.toThrow('org_interna');
  });

  it('dry-run (default) conta tudo e NÃO exclui nada', async () => {
    const res = await purgeOrg(tdb, { orgId, nomeConfirmacao: NOME, confirm: false });
    expect(res.executado).toBe(false);
    expect(res.contagens).toMatchObject({
      notifications: 1,
      task_comments: 1,
      task_activities: 1,
      tasks: 1,
      alerts: 1,
      market_snapshots: 1,
      reports: 1,
      orders: 1,
      tracked_products: 1,
      connections: 1,
      password_reset_tokens: 1,
      login_attempts: 1,
      audit_log: 1,
      users: 1,
      organizations: 1,
    });
    const [org] = await tdb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org).toBeTruthy();
  });

  it('com --confirm exclui tudo na ordem de FK e registra org.purgada', async () => {
    const res = await purgeOrg(tdb, { orgId, nomeConfirmacao: NOME, confirm: true });
    expect(res.executado).toBe(true);

    const [org] = await tdb
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    expect(org).toBeUndefined();
    const restoUsers = await tdb.select({ id: users.id }).from(users).where(eq(users.org_id, orgId));
    expect(restoUsers.length).toBe(0);
    const restoOrders = await tdb.select({ id: orders.id }).from(orders).where(eq(orders.org_id, orgId));
    expect(restoOrders.length).toBe(0);

    const trilha = await tdb
      .select({ acao: auditLog.acao })
      .from(auditLog)
      .where(eq(auditLog.org_id, orgId));
    expect(trilha.map((t) => t.acao)).toEqual(['org.purgada']);
  });

  it('org inexistente → org_nao_encontrada', async () => {
    await expect(
      purgeOrg(tdb, {
        orgId: '00000000-0000-0000-0000-000000000000',
        nomeConfirmacao: 'x',
        confirm: false,
      }),
    ).rejects.toThrow('org_nao_encontrada');
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/integration/purge-org.test.ts` (FALHA: `scripts/purge-org` não existe).

- [ ] **Step 3 — script.** Criar `scripts/purge-org.ts`:

```ts
import { fileURLToPath } from 'node:url';

import { and, count, eq, inArray, ne } from 'drizzle-orm';

import type { DatabaseClient } from '@/db/client';
import {
  alerts,
  auditLog,
  connections,
  loginAttempts,
  marketSnapshots,
  notifications,
  orders,
  organizations,
  passwordResetTokens,
  reports,
  taskActivities,
  taskComments,
  tasks,
  trackedProducts,
  users,
} from '@/db/schema';

export type PurgeResultado = { executado: boolean; contagens: Record<string, number> };

/**
 * Exclusão TOTAL e IRREVERSÍVEL dos dados de uma organização (LGPD — direito
 * de eliminação). Regras de segurança:
 *  - confirmação dupla: orgId + nome EXATO da org (confirmacao_invalida);
 *  - org com usuário admin_truth NUNCA é purgada (org_interna);
 *  - dry-run por default (confirm=false → só conta, nada é excluído);
 *  - deletes em UMA transação, na ordem de FK (filhos → pais);
 *  - ao final grava 1 linha `org.purgada` no audit_log (sem FK — sobrevive à org).
 */
export async function purgeOrg(
  dbc: DatabaseClient,
  input: { orgId: string; nomeConfirmacao: string; confirm: boolean },
): Promise<PurgeResultado> {
  const [org] = await dbc
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);
  if (!org) throw new Error('org_nao_encontrada');
  if (org.name !== input.nomeConfirmacao) throw new Error('confirmacao_invalida');

  const usuarios = await dbc
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.org_id, input.orgId));
  if (usuarios.some((u) => u.role === 'admin_truth')) throw new Error('org_interna');

  const userIds = usuarios.map((u) => u.id);
  const emails = usuarios.map((u) => u.email);
  const taskRows = await dbc
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.org_id, input.orgId));
  const taskIds = taskRows.map((t) => t.id);

  const n = async (q: Promise<Array<{ n: number }>>) => Number((await q)[0]?.n ?? 0);
  const contagens: Record<string, number> = {
    notifications:
      userIds.length === 0
        ? 0
        : await n(dbc.select({ n: count() }).from(notifications).where(inArray(notifications.user_id, userIds))),
    task_comments:
      taskIds.length === 0
        ? 0
        : await n(dbc.select({ n: count() }).from(taskComments).where(inArray(taskComments.task_id, taskIds))),
    task_activities:
      taskIds.length === 0
        ? 0
        : await n(dbc.select({ n: count() }).from(taskActivities).where(inArray(taskActivities.task_id, taskIds))),
    tasks: taskIds.length,
    alerts: await n(dbc.select({ n: count() }).from(alerts).where(eq(alerts.org_id, input.orgId))),
    market_snapshots: await n(
      dbc.select({ n: count() }).from(marketSnapshots).where(eq(marketSnapshots.org_id, input.orgId)),
    ),
    reports: await n(dbc.select({ n: count() }).from(reports).where(eq(reports.org_id, input.orgId))),
    orders: await n(dbc.select({ n: count() }).from(orders).where(eq(orders.org_id, input.orgId))),
    tracked_products: await n(
      dbc.select({ n: count() }).from(trackedProducts).where(eq(trackedProducts.org_id, input.orgId)),
    ),
    connections: await n(
      dbc.select({ n: count() }).from(connections).where(eq(connections.org_id, input.orgId)),
    ),
    password_reset_tokens:
      userIds.length === 0
        ? 0
        : await n(
            dbc
              .select({ n: count() })
              .from(passwordResetTokens)
              .where(inArray(passwordResetTokens.user_id, userIds)),
          ),
    login_attempts:
      emails.length === 0
        ? 0
        : await n(dbc.select({ n: count() }).from(loginAttempts).where(inArray(loginAttempts.email, emails))),
    audit_log: await n(dbc.select({ n: count() }).from(auditLog).where(eq(auditLog.org_id, input.orgId))),
    users: userIds.length,
    organizations: 1,
  };

  if (!input.confirm) return { executado: false, contagens };

  await dbc.transaction(async (tx) => {
    // Filhos de users/tasks primeiro
    if (userIds.length > 0) {
      await tx.delete(notifications).where(inArray(notifications.user_id, userIds));
    }
    if (taskIds.length > 0) {
      await tx.delete(taskComments).where(inArray(taskComments.task_id, taskIds));
      await tx.delete(taskActivities).where(inArray(taskActivities.task_id, taskIds));
    }
    // Tabelas escopadas por org (tasks antes de reports por tasks.report_id;
    // market_snapshots antes de reports por market_snapshots.report_id)
    await tx.delete(tasks).where(eq(tasks.org_id, input.orgId));
    await tx.delete(alerts).where(eq(alerts.org_id, input.orgId));
    await tx.delete(marketSnapshots).where(eq(marketSnapshots.org_id, input.orgId));
    await tx.delete(reports).where(eq(reports.org_id, input.orgId));
    await tx.delete(orders).where(eq(orders.org_id, input.orgId));
    await tx.delete(trackedProducts).where(eq(trackedProducts.org_id, input.orgId));
    await tx.delete(connections).where(eq(connections.org_id, input.orgId));
    if (userIds.length > 0) {
      await tx.delete(passwordResetTokens).where(inArray(passwordResetTokens.user_id, userIds));
      // Referências cruzadas defensivas (não deveriam existir p/ org cliente,
      // mas quebrariam o DELETE de users por FK):
      await tx
        .update(organizations)
        .set({ analista_id: null })
        .where(inArray(organizations.analista_id, userIds));
      await tx
        .update(tasks)
        .set({ assignee_user_id: null })
        .where(and(inArray(tasks.assignee_user_id, userIds), ne(tasks.org_id, input.orgId)));
      await tx
        .update(taskActivities)
        .set({ user_id: null })
        .where(inArray(taskActivities.user_id, userIds));
    }
    if (emails.length > 0) {
      await tx.delete(loginAttempts).where(inArray(loginAttempts.email, emails));
    }
    // LGPD: trilha antiga da org sai; a linha final `org.purgada` (abaixo) fica.
    await tx.delete(auditLog).where(eq(auditLog.org_id, input.orgId));
    await tx.delete(users).where(eq(users.org_id, input.orgId));
    await tx.delete(organizations).where(eq(organizations.id, input.orgId));

    await tx.insert(auditLog).values({
      org_id: input.orgId,
      user_id: null,
      acao: 'org.purgada',
      detalhes: { nome: org.name, tabelas: contagens },
    });
  });

  return { executado: true, contagens };
}

// ---------------------------------------------------------------------------
// CLI: npm run db:purge-org -- --org <uuid> --nome "Nome Exato" [--confirm]
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { orgId?: string; nome?: string; confirm: boolean } {
  const out: { orgId?: string; nome?: string; confirm: boolean } = { confirm: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--org') out.orgId = argv[++i];
    else if (argv[i] === '--nome') out.nome = argv[++i];
    else if (argv[i] === '--confirm') out.confirm = true;
  }
  return out;
}

async function main() {
  const { orgId, nome, confirm } = parseArgs(process.argv.slice(2));
  if (!orgId || !nome) {
    console.error('Uso: npm run db:purge-org -- --org <uuid> --nome "Nome Exato da Org" [--confirm]');
    console.error('Sem --confirm o script roda em DRY-RUN (só conta, nada é excluído).');
    process.exit(1);
  }
  const { db } = await import('@/db/client');
  try {
    const resultado = await purgeOrg(db, { orgId, nomeConfirmacao: nome, confirm });
    console.log(
      resultado.executado
        ? `EXCLUÍDO — org ${orgId} purgada. Linhas removidas por tabela:`
        : 'DRY-RUN (nada excluído — repita com --confirm para executar):',
    );
    for (const [tabela, qtd] of Object.entries(resultado.contagens)) {
      console.log(`  ${tabela}: ${qtd}`);
    }
    process.exit(0);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'org_nao_encontrada') console.error('Org não encontrada. Confira o UUID.');
    else if (msg === 'confirmacao_invalida')
      console.error('O nome informado NÃO confere com o nome da org. Nada foi excluído.');
    else if (msg === 'org_interna')
      console.error('Org interna (tem usuário admin_truth) — purge BLOQUEADO.');
    else console.error(`Falha no purge: ${msg}`);
    process.exit(1);
  }
}

// Executa main() apenas quando rodado como script (não em import de teste).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
```

Em `package.json`, adicionar ao bloco `scripts` (após `db:reencrypt`):

```json
    "db:purge-org": "node --env-file=.env.local --import tsx scripts/purge-org.ts"
```

- [ ] **Step 4 — rodar e ver passar:** `npm run test -- tests/integration/purge-org.test.ts` (PASSA). `npm run typecheck` verde.

- [ ] **Step 5 — runbook.** Criar `docs/runbooks/exclusao-de-dados-org.md`:

```markdown
# Runbook — Exclusão total de dados de uma organização (offboarding / LGPD)

> Uso: pedido de encerramento de conta ou pedido de eliminação de dados do titular
> (LGPD art. 18, VI). Prazo operacional: **até 30 dias corridos** após o pedido.
> A exclusão é **IRREVERSÍVEL**. Órgão executor: admin Truth com acesso ao banco.

## Pré-requisitos

- Pedido registrado por e-mail (suporte@truthcommerce.com.br) com identificação do cliente.
- `.env.local` apontando para o banco CERTO (produção = Neon MAIN). Confira `POSTGRES_URL` antes.
- Backup/branch recente do Neon (o Neon mantém histórico point-in-time; anote o horário do purge).

## Passo a passo

1. **Identificar a org**: no /admin, abrir o cliente e copiar o UUID da URL (`/admin/<orgId>`)
   e o nome EXATO exibido.
2. **Revogar a conexão Bling** (se ativa): pedir ao cliente para revogar o app no painel do
   Bling, ou desconectar em nome dele (a linha de `connections` some no purge de toda forma,
   mas a autorização no Bling é externa ao nosso banco).
3. **Dry-run** (obrigatório — mostra as contagens sem excluir nada):

   ```bash
   npm run db:purge-org -- --org <uuid> --nome "Nome Exato da Org"
   ```

4. **Conferir as contagens** com o esperado (nº de relatórios/pedidos visto no admin).
5. **Executar**:

   ```bash
   npm run db:purge-org -- --org <uuid> --nome "Nome Exato da Org" --confirm
   ```

6. **Verificar**: login do ex-cliente falha; `/admin` não lista mais a org; a única linha
   remanescente é `audit_log.acao = 'org.purgada'` (registro mínimo da exclusão, sem dados
   pessoais além do nome da org e contagens).
7. **Responder ao titular** confirmando a eliminação (modelo curto, citando a data e o registro).

## O que o script exclui (ordem de FK real do schema)

| # | Tabela | Critério |
|---|---|---|
| 1 | `notifications` | `user_id` ∈ usuários da org |
| 2 | `task_comments` | `task_id` ∈ tasks da org |
| 3 | `task_activities` | `task_id` ∈ tasks da org |
| 4 | `tasks` | `org_id` |
| 5 | `alerts` | `org_id` |
| 6 | `market_snapshots` | `org_id` (antes de `reports` por FK `report_id`) |
| 7 | `reports` | `org_id` |
| 8 | `orders` | `org_id` |
| 9 | `tracked_products` | `org_id` |
| 10 | `connections` | `org_id` (tokens cifrados do Bling) |
| 11 | `password_reset_tokens` | `user_id` ∈ usuários da org |
| 12 | `login_attempts` | `email` ∈ e-mails dos usuários (sem FK — dado pessoal, sai também) |
| 13 | `audit_log` | `org_id` (sem FK; a linha final `org.purgada` é gravada DEPOIS) |
| 14 | `users` | `org_id` (antes: `organizations.analista_id`/`tasks.assignee_user_id`/`task_activities.user_id` cruzados são anulados defensivamente) |
| 15 | `organizations` | `id` |

> `org_invites` não existe (decisão G5/Task 2: 2º usuário é criado direto pelo admin).
> Se uma fase futura criar a tabela, incluir aqui entre os passos 13 e 14.

## Salvaguardas do script

- **Dry-run por default** — sem `--confirm` nada é excluído.
- **Confirmação dupla** — exige o UUID **e** o nome exato da org (`confirmacao_invalida` se divergir).
- **Proteção absoluta da org interna** — org com usuário `admin_truth` nunca é purgada (`org_interna`).
- **Transação única** — ou tudo, ou nada.
- Se o DELETE de `users` falhar por FK residual: existe referência anômala fora do modelo
  (ex.: comentário cross-org). **NÃO forçar** — investigar a linha antes.

## Retenção pós-purge

- Backups do Neon expiram no ciclo normal de retenção do branch.
- A linha `org.purgada` do audit_log fica como registro mínimo da própria exclusão
  (base: cumprimento de obrigação e exercício regular de direito).
- E-mails já enviados via Resend seguem a retenção do provedor (logs transacionais).
```

- [ ] **Step 6 — verificação:** `npm run test` + `npm run typecheck` verdes. Dry-run manual no branch test: criar uma org descartável via UI local ou seed, rodar o CLI sem `--confirm` e conferir a saída.

- [ ] **Step 7 — commit:**

```bash
git add scripts/purge-org.ts package.json docs/runbooks/exclusao-de-dados-org.md tests/integration/purge-org.test.ts
git commit -m "feat(g5): script purge-org (dry-run first, confirmacao dupla, ordem de FK) + runbook de exclusao de dados LGPD"
```

---

### Task 5: Produtos monitorados geríveis por admin/analista + runbook de onboarding

**Files:**
- Create: `src/actions/staff.actions.ts`
- Create: `src/components/tracked-products/StaffTrackedProducts.tsx`
- Modify: `src/app/admin/[orgId]/page.tsx` (aba Produtos → gerenciador)
- Modify: `src/app/analista/[orgId]/page.tsx` (+ aba Produtos)
- Create: `docs/runbooks/onboarding-cliente.md`
- Test: `tests/unit/staff-actions.test.ts` (novo)

**Interfaces:**
- Consumes: `requireAnalista` (admite `analista` E `admin_truth` — `require-analista.ts:6-12`), `assertOrgAccess(access, orgId)` (lança `'acesso_negado'`; admin passa sempre, analista só carteira — `analista.repository.ts:17-27`), `addTrackedProduct`/`removeTrackedProduct`/`listTrackedProducts` (tracked-product.repository — validação `limite_tracked_products` embutida), `getOrganizationById` (plano REAL da org), `recordAudit`, `ConfirmDialog`/`EmptyState`/`useToast` (mesmos primitivos do `TrackedProducts` do cliente).
- Produces:

```ts
// staff.actions.ts
export type StaffProdutosState = { error?: string; ok?: boolean };
export async function staffAddTrackedProductAction(
  _prev: StaffProdutosState,
  formData: FormData, // orgId, nome, sku, keywords
): Promise<StaffProdutosState>;
export async function staffRemoveTrackedProductAction(
  _prev: StaffProdutosState,
  formData: FormData, // orgId, id
): Promise<StaffProdutosState>;

// StaffTrackedProducts.tsx
export function StaffTrackedProducts(props: {
  orgId: string;
  produtos: Array<{ id: string; nome: string; sku: string | null; keywords: string[] }>;
}): JSX.Element;
```

- [ ] **Step 1 — teste unit falhando (mocks).** Criar `tests/unit/staff-actions.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/auth/require-analista', () => ({
  requireAnalista: vi.fn().mockResolvedValue({
    id: 'staff1', orgId: 'org-interna', role: 'analista', orgStatus: 'active', plano: null,
  }),
}));
vi.mock('@/modules/analista/analista.repository', () => ({ assertOrgAccess: vi.fn() }));
vi.mock('@/modules/admin/admin.repository', () => ({ getOrganizationById: vi.fn() }));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit: vi.fn() }));
vi.mock('@/modules/tracked-products/tracked-product.repository', () => ({
  addTrackedProduct: vi.fn(),
  removeTrackedProduct: vi.fn(),
}));

import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import {
  addTrackedProduct,
  removeTrackedProduct,
} from '@/modules/tracked-products/tracked-product.repository';
import {
  staffAddTrackedProductAction,
  staffRemoveTrackedProductAction,
} from '@/actions/staff.actions';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const ORG = {
  id: 'org-cliente', name: 'Loja', status: 'active' as const, plano: 'weekly' as const,
  nicho: null, created_at: new Date(), proximo_relatorio_liberado_em: null,
};

describe('staffAddTrackedProductAction', () => {
  it('analista fora da carteira → Acesso negado (assertOrgAccess barra ANTES do repositório)', async () => {
    vi.mocked(assertOrgAccess).mockRejectedValueOnce(new Error('acesso_negado'));
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'Produto X', sku: '', keywords: 'a, b',
    }));
    expect(res.error).toBe('Acesso negado.');
    expect(addTrackedProduct).not.toHaveBeenCalled();
  });

  it('usa o plano REAL da org (não o da sessão do staff) e audita', async () => {
    vi.mocked(getOrganizationById).mockResolvedValueOnce(ORG);
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'Produto X', sku: 'PX-1', keywords: 'a, b',
    }));
    expect(res).toEqual({ ok: true });
    expect(addTrackedProduct).toHaveBeenCalledWith({
      orgId: 'org-cliente', nome: 'Produto X', sku: 'PX-1', keywords: ['a', 'b'], plano: 'weekly',
    });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-cliente', userId: 'staff1', acao: 'tracked_product.criado_staff',
    }));
  });

  it('limite do plano do cliente → mensagem clara', async () => {
    vi.mocked(getOrganizationById).mockResolvedValueOnce(ORG);
    vi.mocked(addTrackedProduct).mockRejectedValueOnce(new Error('limite_tracked_products'));
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'Produto X', sku: '', keywords: '',
    }));
    expect(res.error).toBe('Limite de produtos do plano deste cliente atingido.');
  });

  it('nome curto → erro de validação sem tocar o repositório', async () => {
    const res = await staffAddTrackedProductAction({}, form({
      orgId: 'org-cliente', nome: 'X', sku: '', keywords: '',
    }));
    expect(res.error).toBe('Informe o nome do produto.');
    expect(addTrackedProduct).not.toHaveBeenCalled();
  });
});

describe('staffRemoveTrackedProductAction', () => {
  it('remove escopado pela org e audita', async () => {
    const res = await staffRemoveTrackedProductAction({}, form({
      orgId: 'org-cliente', id: 'prod-1',
    }));
    expect(res).toEqual({ ok: true });
    expect(removeTrackedProduct).toHaveBeenCalledWith({ orgId: 'org-cliente', id: 'prod-1' });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      orgId: 'org-cliente', userId: 'staff1', acao: 'tracked_product.removido_staff',
      detalhes: { id: 'prod-1' },
    }));
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/staff-actions.test.ts` (FALHA: módulo não existe).

- [ ] **Step 3 — actions.** Criar `src/actions/staff.actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { getOrganizationById } from '@/modules/admin/admin.repository';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { recordAudit } from '@/modules/audit/audit.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import type { UserAccess } from '@/modules/auth/user.types';
import {
  addTrackedProduct,
  removeTrackedProduct,
} from '@/modules/tracked-products/tracked-product.repository';

export type StaffProdutosState = { error?: string; ok?: boolean };

/**
 * Gate de staff: admin_truth sempre passa; analista só nas orgs da carteira.
 * Retorna null (com erro pt-BR pronto) quando o acesso é negado.
 */
async function autorizarStaff(orgId: string): Promise<UserAccess | null> {
  const access = await requireAnalista();
  try {
    await assertOrgAccess(access, orgId);
  } catch (e) {
    if (e instanceof Error && e.message === 'acesso_negado') return null;
    throw e;
  }
  return access;
}

function revalidarPaginas(orgId: string) {
  revalidatePath(`/admin/${orgId}`);
  revalidatePath(`/analista/${orgId}`);
  revalidatePath('/conexoes');
}

export async function staffAddTrackedProductAction(
  _prev: StaffProdutosState,
  formData: FormData,
): Promise<StaffProdutosState> {
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const access = await autorizarStaff(orgId);
  if (!access) return { error: 'Acesso negado.' };

  const nome = String(formData.get('nome') ?? '').trim();
  const sku = String(formData.get('sku') ?? '').trim() || null;
  const keywords = String(formData.get('keywords') ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (nome.length < 2) return { error: 'Informe o nome do produto.' };

  const org = await getOrganizationById(orgId);
  if (!org) return { error: 'Cliente inválido.' };

  try {
    // Limite pelo plano REAL do cliente (não o da sessão do staff)
    await addTrackedProduct({ orgId, nome, sku, keywords, plano: org.plano ?? 'monthly' });
  } catch (e) {
    if (e instanceof Error && e.message === 'limite_tracked_products') {
      return { error: 'Limite de produtos do plano deste cliente atingido.' };
    }
    throw e;
  }
  await recordAudit({
    orgId,
    userId: access.id,
    acao: 'tracked_product.criado_staff',
    detalhes: { nome, sku },
  });
  revalidarPaginas(orgId);
  return { ok: true };
}

export async function staffRemoveTrackedProductAction(
  _prev: StaffProdutosState,
  formData: FormData,
): Promise<StaffProdutosState> {
  const orgId = String(formData.get('orgId') ?? '');
  const id = String(formData.get('id') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  if (!id) return { error: 'Produto inválido.' };
  const access = await autorizarStaff(orgId);
  if (!access) return { error: 'Acesso negado.' };

  await removeTrackedProduct({ orgId, id });
  await recordAudit({
    orgId,
    userId: access.id,
    acao: 'tracked_product.removido_staff',
    detalhes: { id },
  });
  revalidarPaginas(orgId);
  return { ok: true };
}
```

Rodar: `npm run test -- tests/unit/staff-actions.test.ts` (PASSA).

- [ ] **Step 4 — componente staff.** Criar `src/components/tracked-products/StaffTrackedProducts.tsx` (testids `staff-*` — os testids do E2E de /conexoes ficam intocados):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';

import {
  staffAddTrackedProductAction,
  staffRemoveTrackedProductAction,
  type StaffProdutosState,
} from '@/actions/staff.actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

const initial: StaffProdutosState = {};

type Produto = { id: string; nome: string; sku: string | null; keywords: string[] };

export function StaffTrackedProducts({ orgId, produtos }: { orgId: string; produtos: Produto[] }) {
  const [addState, add] = useFormState(staffAddTrackedProductAction, initial);
  const [rmState, remove] = useFormState(staffRemoveTrackedProductAction, initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const formsRef = useRef<Map<string, HTMLFormElement>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    if (addState.error)
      toast({ title: 'Não foi possível adicionar.', description: addState.error, variant: 'error' });
  }, [addState, toast]);

  useEffect(() => {
    if (rmState.error)
      toast({ title: 'Não foi possível remover.', description: rmState.error, variant: 'error' });
  }, [rmState, toast]);

  const pendente = produtos.find((p) => p.id === pendingId);

  return (
    <div>
      <form action={add} className="mb-5 grid gap-3 sm:grid-cols-3" data-testid="staff-add-form">
        <input type="hidden" name="orgId" value={orgId} />
        <Field label="Nome do produto" htmlFor="staff-nome">
          <Input id="staff-nome" name="nome" placeholder="Ex: Tênis Running Pro" />
        </Field>
        <Field label="SKU (opcional)" htmlFor="staff-sku">
          <Input id="staff-sku" name="sku" placeholder="Ex: TRP-001" />
        </Field>
        <Field label="Palavras-chave" htmlFor="staff-keywords">
          <Input id="staff-keywords" name="keywords" placeholder="tênis, corrida, running" />
        </Field>
        <div className="flex items-end sm:col-span-3">
          <Button type="submit" variant="primary" size="sm">
            Adicionar
          </Button>
        </div>
      </form>

      {addState.error ? (
        <p role="alert" className="mb-3 text-sm text-danger-fg">
          {addState.error}
        </p>
      ) : null}
      {rmState.error ? (
        <p role="alert" className="mb-3 text-sm text-danger-fg">
          {rmState.error}
        </p>
      ) : null}

      <ul className="flex flex-col divide-y divide-line">
        {produtos.map((p) => (
          <li
            key={p.id}
            data-testid={`staff-produto-${p.id}`}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="text-white/90">
              {p.nome}
              {p.sku ? <span className="ml-1.5 font-mono text-xs text-muted">({p.sku})</span> : ''}
              {p.keywords.length > 0 ? (
                <span className="ml-2 font-mono text-xs text-dim">{p.keywords.join(', ')}</span>
              ) : null}
            </span>
            <form
              action={remove}
              ref={(el) => {
                if (el) formsRef.current.set(p.id, el);
                else formsRef.current.delete(p.id);
              }}
            >
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="id" value={p.id} />
              <Button type="button" variant="danger" size="sm" onClick={() => setPendingId(p.id)}>
                Remover
              </Button>
            </form>
          </li>
        ))}
        {produtos.length === 0 ? (
          <li className="py-3">
            <EmptyState
              title="Nenhum produto monitorado ainda."
              description="Cadastre os produtos e palavras-chave deste cliente — eles alimentam o benchmark do relatório."
            />
          </li>
        ) : null}
      </ul>

      <ConfirmDialog
        open={pendingId !== null}
        title={`Remover ${pendente?.nome ?? 'este produto'}?`}
        description="O produto sai do monitoramento de mercado dos próximos relatórios deste cliente."
        confirmLabel="Remover"
        onConfirm={() => {
          if (pendingId) formsRef.current.get(pendingId)?.requestSubmit();
          setPendingId(null);
        }}
        onCancel={() => setPendingId(null)}
      />
    </div>
  );
}
```

- [ ] **Step 5 — wire nas páginas.** Em `src/app/admin/[orgId]/page.tsx`: adicionar `import { StaffTrackedProducts } from '@/components/tracked-products/StaffTrackedProducts';` e trocar TODO o `content` da aba `produtos` (o ternário `produtos.length === 0 ? <EmptyState…> : <ul>…</ul>`) por:

```tsx
            content: (
              <Card>
                <CardContent>
                  <StaffTrackedProducts
                    orgId={org.id}
                    produtos={produtos.map((p) => ({
                      id: p.id,
                      nome: p.nome,
                      sku: p.sku,
                      keywords: p.keywords,
                    }))}
                  />
                </CardContent>
              </Card>
            ),
```

Em `src/app/analista/[orgId]/page.tsx`: adicionar os imports

```tsx
import { StaffTrackedProducts } from '@/components/tracked-products/StaffTrackedProducts';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
```

incluir `listTrackedProducts(orgId)` no `Promise.all` existente (novo binding `produtos`), e adicionar o 4º item ao array do `Tabs` (depois de `achados`):

```tsx
          {
            id: 'produtos',
            label: `Produtos (${produtos.length})`,
            content: (
              <Card>
                <CardContent>
                  <StaffTrackedProducts
                    orgId={orgId}
                    produtos={produtos.map((p) => ({
                      id: p.id,
                      nome: p.nome,
                      sku: p.sku,
                      keywords: p.keywords,
                    }))}
                  />
                </CardContent>
              </Card>
            ),
          },
```

(REVALIDAR: `CardContent` precisa estar no import de `Card` da página do analista — já está: `Card, CardContent, CardHeader, CardTitle`.)

- [ ] **Step 6 — runbook de onboarding.** Criar `docs/runbooks/onboarding-cliente.md`:

```markdown
# Runbook — Onboarding de cliente (Truth Analytics)

> Fluxo REAL de colocar um cliente novo no ar, do cadastro ao primeiro relatório com QA.
> Executores: admin Truth + analista designado. Tempo típico: 1 dia útil
> (limitado pela autorização do Bling pelo cliente).

## Pré-requisitos do ambiente (checar 1x — card "Status do sistema" no /admin)

- [ ] `RESEND_API_KEY` + `EMAIL_FROM` configurados (sem isso NENHUM e-mail sai — inclusive reset de senha).
- [ ] `CRON_SECRET`/`PIPELINE_SECRET` configurados (relatórios automáticos e sync diário).
- [ ] `SERPAPI_KEY` (opcional — melhora o benchmark de mercado).
- [ ] App Bling: modelo por cliente (sem homologação) — cada cliente autoriza o app na própria conta.

## Checklist do onboarding

1. **Conta** — o cliente cria a conta em `/sign-up` (nome da empresa + e-mail + senha
   + aceite dos Termos/Privacidade). Ele cai em `/aguardando` (org `pending`).
2. **Ativar + plano** — admin em `/admin`: botão **Ativar** na linha do cliente, escolhendo o
   plano (Semanal / Quinzenal / Mensal → define cadência do relatório e limite de produtos:
   10 / 20 / 30). O cliente recebe e-mail de conta ativada (se RESEND ok).
3. **Atribuir analista** — em `/admin/<orgId>`, card **Consultoria** → selecionar o analista.
   Sem analista, notificações de consultoria caem no e-mail interno (ADMIN_ALERT_EMAIL).
4. **Meta mensal** — em `/admin/<orgId>`, card **Meta mensal** → combinar o valor com o
   cliente e salvar (alimenta o pace do dashboard).
5. **Conectar o Bling** — o CLIENTE faz: `/conexoes` → **Conectar Bling** → autoriza no
   painel Bling. Conferir em `/admin/<orgId>` aba **Conexão** que a saúde está "Conectada".
6. **Produtos e palavras-chave — feito pelo ANALISTA** — em `/analista/<orgId>` aba
   **Produtos** (ou pelo admin em `/admin/<orgId>` aba **Produtos**): cadastrar os produtos
   estratégicos do cliente com palavras-chave de busca (alimentam o benchmark de mercado).
   Respeitar o limite do plano; priorizar os produtos de maior receita.
7. **(Opcional) 2º usuário** — em `/admin/<orgId>`, card **Usuários** → criar com o e-mail
   do sócio/gestor; repassar a senha temporária pelo canal do cliente e orientar a troca em
   **Configurações** no primeiro acesso.
8. **Primeiro relatório** — em `/admin/<orgId>` → **Gerar relatório agora** (ignora o gate de
   ciclo). Acompanhar o status na aba Relatórios.
9. **QA do primeiro relatório** (admin + analista, ~10 min):
   - [ ] Relatório `done` sem erro; Truth Score plausível; período correto (dias fechados BRT).
   - [ ] Dashboard do cliente: faturamento, meta com pace, alertas coerentes.
   - [ ] Benchmark: posição de preço sem "R$ 0,00"; badge de parcial só se fizer sentido.
   - [ ] Plano de Ação: achados viraram tasks com prazo; analista recebeu a notificação.
   - [ ] E-mail "relatório pronto" chegou ao cliente (se RESEND ok).
10. **Kickoff com o cliente** — analista apresenta o relatório e o plano de ação; combina o
    ritmo de acompanhamento (a cadência do plano gera os próximos automaticamente).

## Notas ao dono

- Homologação do app Bling segue pendente para modelo app-único (bloqueia terceiros no
  modelo antigo — hoje operamos app-por-cliente).
- Os textos de /termos e /privacidade devem ser revisados com jurídico antes do lançamento
  comercial (completar razão social, CNPJ e foro).

## Offboarding

Ver `docs/runbooks/exclusao-de-dados-org.md` (purge completo por org, dry-run first).
```

- [ ] **Step 7 — verificação:** `npm run test` + `npm run typecheck` verdes. `npx playwright test` verde (conexoes.spec usa os testids do componente do CLIENTE, intocado; admin.spec não entra na aba Produtos). Smoke manual: como admin, adicionar/remover produto em `/admin/<orgId>`; como analista da carteira, o mesmo em `/analista/<orgId>` (aba Produtos); como analista SEM a org na carteira, a página já devolve 404 (guard existente); limite do plano respeitado (weekly = 10).

- [ ] **Step 8 — commit:**

```bash
git add src/actions/staff.actions.ts src/components/tracked-products/StaffTrackedProducts.tsx "src/app/admin/[orgId]/page.tsx" "src/app/analista/[orgId]/page.tsx" docs/runbooks/onboarding-cliente.md tests/unit/staff-actions.test.ts
git commit -m "feat(g5): admin/analista gerenciam produtos monitorados do cliente + runbook de onboarding"
```

---

### Task 6: Revisão ampla da fase (fecha a G5)

**Files:** nenhum novo (só correções que a revisão apontar).

- [ ] **Step 1 — suíte completa:** `npm run test` (todas), `npm run typecheck`, `npm run lint`, `npx playwright test` — TUDO verde.
- [ ] **Step 2 — varredura de placeholders/segredos:** `git diff master --stat` + revisar o diff completo. Grep de segurança: nenhuma ocorrência de `senhaTemporaria` em `recordAudit`/`logger`/templates de e-mail; nenhum `TODO`/`TBD` novo.
- [ ] **Step 3 — invariantes E2E:** confirmar que APENAS `tests/e2e/auth.spec.ts` e `tests/e2e/admin.spec.ts` mudaram (1 linha cada, o check do aceite) — `git diff master -- tests/e2e`.
- [ ] **Step 4 — smoke integrado (dev local + banco test):** signup com aceite → admin ativa → cria 2º usuário → 2º usuário loga e troca senha em /configuracoes → analista cadastra produto → admin dispara relatório → dry-run do purge na org de teste → purge com `--confirm` → org sumiu do /admin e login falha.
- [ ] **Step 5 — migration no MAIN (operacional do dono, documentar no PR):** `npm run db:migrate` no Neon MAIN antes do deploy (coluna `users.aceitou_termos_em`).
- [ ] **Step 6 — requesting-code-review:** rodar a revisão ampla da fase (superpowers:requesting-code-review) sobre `git diff master...feat/g5-conta-confianca`; corrigir achados críticos antes do merge.
- [ ] **Step 7 — commit final (se houver correções) e merge `--no-ff`:**

```bash
git commit -m "fix(g5): ajustes da revisao ampla da fase"
git checkout master && git merge --no-ff feat/g5-conta-confianca -m "feat(g5): conta & confianca - /configuracoes, 2o usuario, LGPD minimo, runbooks purge/onboarding"
```

---

## Self-review (executado na escrita do plano)

1. **Cobertura do brief:** /configuracoes (senha atual + rate-limit escopo próprio + auditoria + e-mail best-effort + nome da empresa + e-mail/plano read-only + nav + ⌘K) → Task 1. 2º usuário com decisão de menor superfície justificada + fix `getOrgPrimaryUser` determinístico → Task 2. LGPD (/termos, /privacidade com conteúdo real, links landing+auth, aceite com coluna `users.aceitou_termos_em` + migration aditiva) → Task 3. Runbook purge com ordem de FK real + script dry-run-first + teste de integração em org sintética → Task 4. Tracked products por admin/analista reusando validações/limite por plano + runbook onboarding → Task 5. ✔
2. **Placeholders:** nenhum TBD/TODO; todo step de código tem o código; textos legais completos (nota jurídica fica no plano/runbook, fora do site). ✔
3. **Consistência de tipos:** `AccountState`/`CriarUsuarioState`/`StaffProdutosState` usados igualmente nas actions, forms e testes; `EscopoRateLimit` ganha `'troca_senha'` e `recordAttempt` já aceita o escopo por tipo; `purgeOrg` recebe `DatabaseClient` (o `tdb` do teste é o mesmo tipo drizzle/postgres-js). ✔
