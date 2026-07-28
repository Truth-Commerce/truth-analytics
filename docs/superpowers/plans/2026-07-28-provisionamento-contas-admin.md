# Provisionamento administrativo de contas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin crie uma organização com seu primeiro cliente em uma única operação e crie analistas internos sem selecionar uma organização manualmente.

**Architecture:** Um novo repositório administrativo executará provisionamento e audit na mesma transação. Duas Server Actions de papel fixo validarão os formulários e dois componentes independentes substituirão o formulário genérico atual.

**Tech Stack:** Next.js 16 Server Actions, TypeScript, React 19, Drizzle ORM, PostgreSQL, Zod, Vitest e Playwright.

## Global Constraints

- Somente `admin_truth` pode provisionar contas.
- Cliente administrativo nasce em organização `pending`, sem plano, com `aceitou_termos_em=null`.
- Analista nasce na organização interna do admin autenticado; nenhum `orgId` é aceito do formulário.
- Senha temporária de 12 caracteres é exibida uma vez e nunca auditada ou registrada em claro.
- Organização, usuário e audit do cliente são uma única transação.
- Toda implementação seguirá RED → GREEN → REFACTOR.

---

### Task 1: Repositório transacional de provisionamento

**Files:**
- Create: `src/modules/admin/account-provisioning.repository.ts`
- Test: `tests/integration/account-provisioning.test.ts`

**Interfaces:**
- Consumes: `db`, `organizations`, `users`, `auditLog`, `hashPassword`, `normalizeEmail`, `hasPostgresErrorCode`.
- Produces: `provisionClientAccount(input): Promise<{ orgId: string; userId: string }>` e `provisionAnalystAccount(input): Promise<{ userId: string }>`.

- [ ] **Step 1: Escrever teste de integração falhando para o cliente atômico**

Cobrir uma criação com `orgName`, `email`, `senha` e `actorUserId`; verificar organização `pending`, usuário `client`, `aceitou_termos_em=null` e audit `org.criada_admin` ligado ao admin.

- [ ] **Step 2: Executar o teste e confirmar RED**

Run: `npm test -- tests/integration/account-provisioning.test.ts`

Expected: FAIL porque `account-provisioning.repository.ts` ainda não existe.

- [ ] **Step 3: Implementar o mínimo para criar cliente em transação**

Implementar:

```ts
export async function provisionClientAccount(input: {
  orgName: string;
  email: string;
  senha: string;
  actorUserId: string;
}): Promise<{ orgId: string; userId: string }>
```

Gerar o hash antes da transação; dentro dela inserir organização, usuário e audit. Traduzir `23505` para `Error('email_em_uso')`.

- [ ] **Step 4: Confirmar GREEN do cliente**

Run: `npm test -- tests/integration/account-provisioning.test.ts`

Expected: PASS para o primeiro caso.

- [ ] **Step 5: Escrever teste falhando de rollback em e-mail duplicado**

Criar previamente o e-mail, chamar `provisionClientAccount` com um nome de empresa único, esperar `email_em_uso` e verificar que nenhuma organização com esse nome existe.

- [ ] **Step 6: Confirmar RED e ajustar a barreira de concorrência**

Run: `npm test -- tests/integration/account-provisioning.test.ts`

Expected antes do ajuste: FAIL se a organização órfã persistir; depois implementar `try/catch` ao redor da transação e confirmar PASS.

- [ ] **Step 7: Escrever teste falhando para analista interno**

Chamar `provisionAnalystAccount({ internalOrgId, email, senha, actorUserId })` e verificar `role='analista'`, `org_id=internalOrgId` e audit `user.criado_admin` sem senha.

- [ ] **Step 8: Implementar e confirmar GREEN do analista**

Run: `npm test -- tests/integration/account-provisioning.test.ts`

Expected: todos os casos PASS.

### Task 2: Server Actions específicas e seguras

**Files:**
- Modify: `src/actions/admin.actions.ts`
- Test: `tests/unit/admin-account-provisioning-actions.test.ts`

**Interfaces:**
- Consumes: `provisionClientAccount`, `provisionAnalystAccount`, `requireAdmin`, `randomBytes`, `z`, `normalizeEmail`.
- Produces: `adminCreateClientAccountAction`, `adminCreateAnalystAccountAction` e `CriarContaState`.

- [ ] **Step 1: Escrever testes falhando das validações puras**

Extrair e exportar schemas de entrada ou funções puras de parsing para testar: empresa curta, e-mail inválido e ausência de `orgId`/`role` no contrato aceito.

- [ ] **Step 2: Confirmar RED**

Run: `npm test -- tests/unit/admin-account-provisioning-actions.test.ts`

Expected: FAIL porque as novas actions/parsers ainda não existem.

- [ ] **Step 3: Implementar as actions**

`adminCreateClientAccountAction` lê somente `orgName` e `email`; `adminCreateAnalystAccountAction` lê somente `email`. Ambas geram `randomBytes(9).toString('base64url')`, traduzem `email_em_uso`, revalidam `/admin/usuarios` e retornam e-mail normalizado + senha temporária.

- [ ] **Step 4: Confirmar GREEN**

Run: `npm test -- tests/unit/admin-account-provisioning-actions.test.ts tests/integration/account-provisioning.test.ts`

Expected: PASS.

### Task 3: Dois formulários explícitos na Gestão de contas

**Files:**
- Create: `src/app/admin/usuarios/criar-cliente-form.tsx`
- Create: `src/app/admin/usuarios/criar-analista-form.tsx`
- Modify: `src/app/admin/usuarios/page.tsx`
- Delete: `src/app/admin/usuarios/criar-usuario-form.tsx`
- Modify: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: as duas actions e `CriarContaState` da Task 2.
- Produces: formulários com test IDs `usuarios-criar-cliente-form` e `usuarios-criar-analista-form`.

- [ ] **Step 1: Escrever cenário E2E que falha**

Depois do login admin, abrir `/admin/usuarios`, criar cliente usando apenas empresa + e-mail e criar analista usando apenas e-mail. Verificar alertas de sucesso, ausência de selects de organização/papel e presença dos dois usuários na lista.

- [ ] **Step 2: Executar e confirmar RED**

Run: `npm run test:e2e -- tests/e2e/admin.spec.ts`

Expected: FAIL porque os dois formulários ainda não existem.

- [ ] **Step 3: Implementar os componentes e atualizar a página**

Remover `listAllOrganizationsMinimal()` do carregamento da página. Renderizar cards “Criar conta de cliente” e “Criar conta de analista” antes da transferência de carteira, cada um com estado e credenciais temporárias próprios.

- [ ] **Step 4: Confirmar GREEN do E2E**

Run: `npm run test:e2e -- tests/e2e/admin.spec.ts`

Expected: PASS.

### Task 4: Verificação integral e entrega

**Files:**
- Modify: `README.md` somente se a seção de gestão de contas descrever o formulário genérico antigo.

**Interfaces:**
- Consumes: aplicação completa.
- Produces: mudança pronta para produção.

- [ ] **Step 1: Executar verificações focadas**

Run: `npm test -- tests/unit/admin-account-provisioning-actions.test.ts tests/integration/account-provisioning.test.ts tests/integration/admin-usuarios.test.ts`

Expected: PASS.

- [ ] **Step 2: Executar suíte e verificações estáticas**

Run: `npm test && npm run typecheck && npm run lint && npm run build`

Expected: todos com exit code 0 e zero falhas.

- [ ] **Step 3: Revisar diff e requisitos**

Confirmar que nenhum formulário envia `role` ou `orgId`, nenhuma senha aparece em audit/log e nenhuma mudança do conector Olist foi misturada neste commit.

- [ ] **Step 4: Commit, push e deploy**

Commit: `feat(admin): separar provisionamento de clientes e analistas`

- [ ] **Step 5: Smoke test em produção**

Abrir `/admin/usuarios`, confirmar os dois cards e que as rotas principais carregam sem erros; não criar contas reais durante o smoke test.

## Self-Review

- Cobertura: criação atômica, rollback, termos, organização interna, audit, UI separada e regressão estão ligados a tarefas específicas.
- Placeholders: não há `TBD`, `TODO` ou etapas delegadas sem comportamento observável.
- Tipos: os nomes `provisionClientAccount`, `provisionAnalystAccount`, `adminCreateClientAccountAction`, `adminCreateAnalystAccountAction` e `CriarContaState` são consistentes em todas as tarefas.
