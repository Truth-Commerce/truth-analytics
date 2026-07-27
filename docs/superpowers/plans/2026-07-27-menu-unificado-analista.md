# Menu unificado do analista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exibir Carteira e Comparativo, junto das áreas operacionais já acessíveis, no menu lateral do analista desde `/dashboard` e durante toda a navegação.

**Architecture:** `navItems('analista')` continuará sendo a fonte única dos links do analista. O layout da árvore cliente resolverá a variante do `AppShell` a partir do papel real da sessão, enquanto a árvore `/analista` continuará fixada na variante `analista`; testes unitários cobrem o modelo e um E2E cobre a integração de sessão, layout, desktop e mobile.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Vitest, Playwright, Drizzle/PostgreSQL.

## Global Constraints

- O destino pós-login permanece `/dashboard`.
- Nenhuma permissão, middleware, consulta ou mutação será ampliada.
- Os menus de cliente e administrador não serão alterados.
- A ordem do analista será: Visão geral, Carteira, Comparativo, Plano de Ação, Estoque, Kits, Calendário, Conexões e Configurações.
- O mesmo menu será usado em desktop expandido, desktop recolhido e drawer móvel.
- Os ícones existentes `portfolio` e `compare` serão reutilizados.

---

## File Structure

- `src/components/nav-model.ts`: define os nove itens e a ordem da navegação do analista.
- `src/app/(client)/layout.tsx`: seleciona `variant="analista"` quando a sessão real pertence a um analista.
- `tests/unit/nav-model.test.ts`: protege a lista completa do analista e a separação do menu de cliente.
- `tests/e2e/helpers/db.ts`: oferece uma fixture de usuário analista isolada no banco E2E.
- `tests/e2e/analista-navegacao.spec.ts`: verifica a experiência real de login, links, navegação, estado ativo e drawer móvel.

### Task 1: Modelo unificado de navegação

**Files:**
- Modify: `tests/unit/nav-model.test.ts`
- Modify: `src/components/nav-model.ts`

**Interfaces:**
- Consumes: `navItems(variant: 'client' | 'admin' | 'analista'): NavItem[]`.
- Produces: `navItems('analista')` com os nove links na ordem aprovada; `navItems('client')` sem `/analista` e `/analista/comparativo`.

- [ ] **Step 1: Escrever o teste unitário que falha**

Substituir a expectativa atual do analista e acrescentar a regressão do cliente:

```ts
it('analista vê o menu operacional unificado na ordem aprovada', () => {
  expect(navItems('analista')).toEqual([
    { href: '/dashboard', label: 'Visão geral', icon: 'dashboard', description: 'Visão geral do negócio' },
    { href: '/analista', label: 'Carteira', icon: 'portfolio', description: 'Clientes sob acompanhamento' },
    { href: '/analista/comparativo', label: 'Comparativo', icon: 'compare', description: 'Compare contas e períodos' },
    { href: '/dashboard/plano-de-acao', label: 'Plano de Ação', icon: 'tasks', description: 'Prioridades e execução', badge: true },
    { href: '/dashboard/estoque', label: 'Estoque', icon: 'inventory', description: 'Cobertura e disponibilidade' },
    { href: '/dashboard/kits', label: 'Kits', icon: 'kits', description: 'Oportunidades de combinação' },
    { href: '/dashboard/calendario', label: 'Calendário', icon: 'calendar', description: 'Planejamento comercial' },
    { href: '/conexoes', label: 'Conexões', icon: 'connections', description: 'Integrações e canais' },
    { href: '/configuracoes', label: 'Configurações', icon: 'settings', description: 'Preferências da conta' },
  ]);
});

it('cliente não recebe áreas exclusivas do analista', () => {
  const hrefs = navItems('client').map((item) => item.href);
  expect(hrefs).not.toContain('/analista');
  expect(hrefs).not.toContain('/analista/comparativo');
});
```

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run: `npm test -- --run tests/unit/nav-model.test.ts`

Expected: FAIL porque `navItems('analista')` ainda retorna somente Carteira e Comparativo.

- [ ] **Step 3: Implementar a lista mínima do analista**

Alterar apenas o ramo `variant === 'analista'` em `nav-model.ts`:

```ts
if (variant === 'analista') {
  return [
    { href: '/dashboard', label: 'Visão geral', icon: 'dashboard', description: 'Visão geral do negócio' },
    { href: '/analista', label: 'Carteira', icon: 'portfolio', description: 'Clientes sob acompanhamento' },
    { href: '/analista/comparativo', label: 'Comparativo', icon: 'compare', description: 'Compare contas e períodos' },
    { href: '/dashboard/plano-de-acao', label: 'Plano de Ação', icon: 'tasks', description: 'Prioridades e execução', badge: true },
    { href: '/dashboard/estoque', label: 'Estoque', icon: 'inventory', description: 'Cobertura e disponibilidade' },
    { href: '/dashboard/kits', label: 'Kits', icon: 'kits', description: 'Oportunidades de combinação' },
    { href: '/dashboard/calendario', label: 'Calendário', icon: 'calendar', description: 'Planejamento comercial' },
    { href: '/conexoes', label: 'Conexões', icon: 'connections', description: 'Integrações e canais' },
    { href: '/configuracoes', label: 'Configurações', icon: 'settings', description: 'Preferências da conta' },
  ];
}
```

- [ ] **Step 4: Executar o teste e confirmar sucesso**

Run: `npm test -- --run tests/unit/nav-model.test.ts`

Expected: PASS em todos os testes de `nav-model`.

- [ ] **Step 5: Registrar a unidade concluída**

```bash
git add src/components/nav-model.ts tests/unit/nav-model.test.ts
git commit -m "feat: unify analyst navigation items"
```

### Task 2: Seleção do shell pela sessão real

**Files:**
- Modify: `tests/e2e/helpers/db.ts`
- Create: `tests/e2e/analista-navegacao.spec.ts`
- Modify: `src/app/(client)/layout.tsx`

**Interfaces:**
- Consumes: `getSessionContext(): Promise<UserAccess | null>` e `AppShell` com `variant: 'client' | 'admin' | 'analista'`.
- Produces: `seedE2EAnalista(email: string, senha: string): Promise<void>` e layout cliente que passa `variant="analista"` somente para `access.role === 'analista'`.

- [ ] **Step 1: Criar fixture e E2E que falham**

Adicionar ao helper de banco:

```ts
export async function seedE2EAnalista(email: string, senha: string): Promise<void> {
  const { sql, tdb } = makeDb();
  try {
    const senha_hash = await hashPassword(senha);
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${E2E_PREFIX}analista`, status: 'active' })
      .returning({ id: organizations.id });
    await tdb.insert(users).values({ org_id: org!.id, email, senha_hash, role: 'analista' });
  } finally {
    await sql.end();
  }
}
```

Criar `analista-navegacao.spec.ts` com login real e estas verificações:

```ts
import { expect, test } from '@playwright/test';
import { cleanupE2E, E2E_PREFIX, seedE2EAnalista } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const email = `${E2E_PREFIX}analista-nav-${RUN}@example.com`;
const senha = 'analista-forte-123';

test.beforeAll(async () => seedE2EAnalista(email, senha));
test.afterAll(async () => cleanupE2E());

async function login(page: import('@playwright/test').Page) {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('analista encontra e navega pelas áreas próprias desde o dashboard', async ({ page }) => {
  await login(page);
  const sidebar = page.getByTestId('desktop-sidebar');
  await expect(sidebar.getByRole('link', { name: 'Carteira' })).toHaveAttribute('href', '/analista');
  await expect(sidebar.getByRole('link', { name: 'Comparativo' })).toHaveAttribute('href', '/analista/comparativo');
  await sidebar.getByRole('link', { name: 'Carteira' }).click();
  await expect(sidebar.getByRole('link', { name: 'Carteira' })).toHaveAttribute('aria-current', 'page');
  await sidebar.getByRole('link', { name: 'Comparativo' }).click();
  await expect(sidebar.getByRole('link', { name: 'Comparativo' })).toHaveAttribute('aria-current', 'page');
});

test('drawer móvel do analista expõe Carteira e Comparativo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Navegação principal' });
  await expect(drawer.getByRole('link', { name: 'Carteira' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Comparativo' })).toBeVisible();
});
```

- [ ] **Step 2: Executar o E2E e confirmar a falha**

Run: `npm run test:e2e -- tests/e2e/analista-navegacao.spec.ts`

Expected: FAIL em `/dashboard`, pois o layout ainda renderiza `variant="client"` e não mostra Carteira nem Comparativo.

- [ ] **Step 3: Resolver a variante a partir do papel real**

Em `src/app/(client)/layout.tsx`, calcular e aplicar a variante sem mudar as demais regras:

```tsx
const shellVariant = access?.role === 'analista' ? 'analista' : 'client';

return (
  <>
    {impersonation ? <ImpersonationBanner orgName={impersonation.orgName} /> : null}
    <AppShell variant={shellVariant} planoDeAcaoCount={planoDeAcaoCount}>
      {children}
    </AppShell>
  </>
);
```

- [ ] **Step 4: Executar os E2E e confirmar sucesso**

Run: `npm run test:e2e -- tests/e2e/analista-navegacao.spec.ts`

Expected: PASS nos cenários desktop e mobile; a navegação mantém a variante `analista` ao alternar entre árvores de rota.

- [ ] **Step 5: Registrar a integração concluída**

```bash
git add src/app/(client)/layout.tsx tests/e2e/helpers/db.ts tests/e2e/analista-navegacao.spec.ts
git commit -m "fix: expose analyst navigation from dashboard"
```

### Task 3: Verificação integral e publicação

**Files:**
- Verify: `src/components/nav-model.ts`
- Verify: `src/app/(client)/layout.tsx`
- Verify: `tests/unit/nav-model.test.ts`
- Verify: `tests/e2e/helpers/db.ts`
- Verify: `tests/e2e/analista-navegacao.spec.ts`

**Interfaces:**
- Consumes: implementação e testes das Tasks 1 e 2.
- Produces: branch `master` verificada e publicada no remoto configurado.

- [ ] **Step 1: Executar verificações estáticas e unitárias**

Run: `npm run lint && npm run typecheck && npm test`

Expected: todos os comandos terminam com código 0.

- [ ] **Step 2: Executar a regressão E2E focal**

Run: `npm run test:e2e -- tests/e2e/analista-navegacao.spec.ts tests/e2e/dashboard.spec.ts`

Expected: os fluxos de analista e cliente passam; o cliente permanece com seu menu original.

- [ ] **Step 3: Produzir o build de produção**

Run: `npm run build`

Expected: build Next.js termina com código 0, sem erros de TypeScript ou geração de páginas.

- [ ] **Step 4: Conferir escopo e histórico**

Run: `git status --short && git log -3 --oneline && git diff HEAD~2..HEAD --check`

Expected: árvore limpa, apenas commits planejados e nenhum erro de whitespace.

- [ ] **Step 5: Publicar**

Run: `git push origin master`

Expected: o remoto confirma a atualização de `master` até o último commit local.
