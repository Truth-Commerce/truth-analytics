# CRM editorial verde Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Redesenhar o Truth Analytics inteiro como um CRM editorial claro, com sidebar autenticada recolhível e identidade verde baseada no Zeneagrama.

**Architecture:** O tema será centralizado nos tokens do Tailwind e nas fontes do layout raiz. O shell autenticado será dividido em modelo puro, ícones SVG locais e componente de interface, preservando as rotas por papel. Primitivos compartilhados propagarão o novo sistema às páginas, enquanto classes legadas, gráficos e PDF serão migrados explicitamente.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS 3, Framer Motion, Recharts, React PDF, Vitest e Playwright.

## Global Constraints

- Tema exclusivamente claro; não criar alternância para tema escuro.
- Papel #FAF8F4, superfície #FFFFFF e superfície secundária #F1EDE4.
- Texto forte #14120F, texto suave #4A443C e texto discreto #8A8378.
- Verde principal #137A3E, verde forte #0D6331 e verde suave #E9F6EC.
- Instrument Serif em títulos e KPIs; Inter na interface e no corpo.
- Sidebar autenticada com 264 px aberta, 76 px recolhida e preferência truth-sidebar-collapsed.
- Ícones SVG locais; nenhuma nova dependência.
- Preservar regras de negócio, rotas, permissões, textos funcionais e data-testid.
- Motion entre 150 e 220 ms e respeito a prefers-reduced-motion.

---

### Task 1: Fundação visual clara

**Files:**
- Modify: tailwind.config.ts
- Modify: src/app/layout.tsx
- Modify: src/app/globals.css
- Modify: src/components/ui/Logo.tsx
- Modify: src/lib/motion.ts
- Test: tests/unit/chart-theme.test.ts

**Interfaces:**
- Produces: cores semânticas paper, ink, brand, line, success, warning e danger disponíveis em classes Tailwind.
- Produces: variáveis --font-heading e --font-body com Instrument Serif e Inter.
- Produces: Logo legível em superfícies claras.

- [ ] **Step 1: Atualizar a expectativa visual do gráfico**

~~~ts
expect(chartTheme).toMatchObject({
  grid: '#DED8CD',
  axis: '#6F685F',
  brand: '#137A3E',
  areaFrom: 'rgba(19,122,62,0.24)',
  areaTo: 'rgba(19,122,62,0)',
});
~~~

- [ ] **Step 2: Executar o teste e confirmar a falha**

Run: npm test -- --maxWorkers=1 --minWorkers=1 tests/unit/chart-theme.test.ts

Expected: FAIL porque os tokens ainda usam verde neon e fundo escuro.

- [ ] **Step 3: Implementar tokens, fontes e estilos globais**

Definir paper.0, paper.1, paper.2; ink.DEFAULT, ink.soft, ink.muted; brand.DEFAULT, brand.strong, brand.soft; sombras editoriais e anéis de foco. Trocar Sora e Space Mono por Instrument_Serif e Inter no layout. Atualizar body, seleção, scrollbar e motion para 0.18/0.22 s.

- [ ] **Step 4: Executar teste, lint e typecheck**

Run: npm test -- --maxWorkers=1 --minWorkers=1 tests/unit/chart-theme.test.ts && npm run lint && npm run typecheck

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add tailwind.config.ts src/app/layout.tsx src/app/globals.css src/components/ui/Logo.tsx src/lib/motion.ts tests/unit/chart-theme.test.ts
git commit -m "feat: establish editorial green design system"
~~~

### Task 2: Navegação CRM recolhível

**Files:**
- Create: src/components/navigation-icons.tsx
- Create: src/components/sidebar-model.ts
- Modify: src/components/nav-model.ts
- Modify: src/components/app-shell.tsx
- Modify: src/components/notifications/NotificationBell.tsx
- Modify: src/components/command-palette.tsx
- Modify: tests/unit/nav-model.test.ts
- Create: tests/unit/sidebar-model.test.ts

**Interfaces:**
- Consumes: NavItem e navItems de src/components/nav-model.ts.
- Produces: NavIconName, NavigationIcon, SIDEBAR_STORAGE_KEY, parseSidebarCollapsed e pageTitle.
- Produces: AppShellProps compatível com variant e planoDeAcaoCount existentes.

- [ ] **Step 1: Escrever testes do novo modelo**

~~~ts
expect(parseSidebarCollapsed('true')).toBe(true);
expect(parseSidebarCollapsed('false')).toBe(false);
expect(parseSidebarCollapsed(null)).toBe(false);
expect(pageTitle('/dashboard/relatorios/abc', navItems('client'))).toBe('Dashboard');
expect(navItems('client')[0]).toMatchObject({ icon: 'dashboard', description: expect.any(String) });
~~~

- [ ] **Step 2: Executar e confirmar a falha**

Run: npm test -- --maxWorkers=1 --minWorkers=1 tests/unit/nav-model.test.ts tests/unit/sidebar-model.test.ts

Expected: FAIL porque ícones e helpers ainda não existem.

- [ ] **Step 3: Implementar modelo e biblioteca de ícones**

NavItem recebe icon: NavIconName e description: string. Criar SVGs com currentColor para dashboard, conexões, estoque, kits, calendário, plano, configurações, clientes, playbooks, consultoria, carteira, performance, operações, usuários, busca, notificações, sair, menu e recolher.

- [ ] **Step 4: Reescrever AppShell**

Montar sidebar desktop sticky de 264/76 px, topbar sem navegação duplicada, item ativo em brand.soft, persistência localStorage, tooltips no modo recolhido e drawer mobile com overlay, Escape, scroll lock e fechamento após navegação. Preservar skip-link, CommandPalette, NotificationBell, signOutAction e data-testid nav-plano-badge.

- [ ] **Step 5: Executar testes e verificações**

Run: npm test -- --maxWorkers=1 --minWorkers=1 tests/unit/nav-model.test.ts tests/unit/sidebar-model.test.ts tests/unit/command-model.test.ts && npm run typecheck

Expected: PASS.

- [ ] **Step 6: Commit**

~~~bash
git add src/components/navigation-icons.tsx src/components/sidebar-model.ts src/components/nav-model.ts src/components/app-shell.tsx src/components/notifications/NotificationBell.tsx src/components/command-palette.tsx tests/unit/nav-model.test.ts tests/unit/sidebar-model.test.ts
git commit -m "feat: add collapsible CRM sidebar"
~~~

### Task 3: Primitivos e superfícies compartilhadas

**Files:**
- Modify: src/components/ui/Alert.tsx
- Modify: src/components/ui/Badge.tsx
- Modify: src/components/ui/Button.tsx
- Modify: src/components/ui/Card.tsx
- Modify: src/components/ui/ConfirmDialog.tsx
- Modify: src/components/ui/EmptyState.tsx
- Modify: src/components/ui/Field.tsx
- Modify: src/components/ui/Input.tsx
- Modify: src/components/ui/Markdown.tsx
- Modify: src/components/ui/Pagination.tsx
- Modify: src/components/ui/Select.tsx
- Modify: src/components/ui/Skeleton.tsx
- Modify: src/components/ui/Stat.tsx
- Modify: src/components/ui/Stepper.tsx
- Modify: src/components/ui/Table.tsx
- Modify: src/components/ui/Tabs.tsx
- Modify: src/components/ui/Toast.tsx
- Modify: src/components/page-header.tsx

**Interfaces:**
- Consumes: tokens da Task 1.
- Produces: componentes com contraste AA, foco verde, superfície branca, texto ink e estados semânticos claros.

- [ ] **Step 1: Migrar os componentes por contexto**

Usar paper.1 nos cards, paper.2 em campos, ink no texto, line nas bordas, brand em ações e text-white somente em ação sobre verde. Remover glow neon e hover que desloca conteúdo em componentes densos.

- [ ] **Step 2: Preservar contratos públicos**

Manter assinaturas, variantes, data-testid, aria labels e comportamento dos componentes. Não alterar props.

- [ ] **Step 3: Executar testes dos componentes e modelos**

Run: npm test -- --maxWorkers=1 --minWorkers=1 tests/unit/dialog-model.test.ts tests/unit/pagination-model.test.ts tests/unit/stepper-model.test.ts tests/unit/toast-store.test.ts tests/unit/href.test.ts

Expected: PASS.

- [ ] **Step 4: Executar lint e typecheck**

Run: npm run lint && npm run typecheck

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add src/components/ui src/components/page-header.tsx
git commit -m "feat: restyle shared UI primitives"
~~~

### Task 4: Páginas públicas editoriais

**Files:**
- Modify: src/app/page.tsx
- Modify: src/app/landing-mock.tsx
- Modify: src/app/landing-stats.tsx
- Modify: src/app/landing-marquee.tsx
- Modify: src/app/(auth)/layout.tsx
- Modify: src/app/(auth)/sign-in/sign-in-form.tsx
- Modify: src/app/(auth)/sign-up/sign-up-form.tsx
- Modify: src/app/(auth)/esqueci-senha/esqueci-senha-form.tsx
- Modify: src/app/(auth)/redefinir-senha/[token]/reset-form.tsx
- Modify: src/app/(legal)/layout.tsx
- Modify: src/app/(legal)/tipografia.tsx
- Modify: src/app/(legal)/termos/page.tsx
- Modify: src/app/(legal)/privacidade/page.tsx
- Modify: src/app/not-found.tsx
- Modify: src/app/error.tsx
- Modify: src/app/global-error.tsx

**Interfaces:**
- Consumes: Logo e primitivos das Tasks 1 e 3.
- Produces: landing, autenticação, páginas legais e erros no mesmo tema claro, com cabeçalho público convencional.

- [ ] **Step 1: Redesenhar landing e cabeçalhos públicos**

Aplicar hero editorial com fundo paper, serif de alto contraste, gradiente verde discreto, mock de dashboard claro, cards brancos e CTAs verdes. Preservar links /sign-in, /sign-up, /termos e /privacidade.

- [ ] **Step 2: Migrar autenticação, legal e erros**

Remover dependências visuais do tema escuro, melhorar largura e espaçamento dos formulários, manter todas as actions, nomes de campos e data-testid.

- [ ] **Step 3: Executar testes de dados e autenticação**

Run: npm test -- --maxWorkers=1 --minWorkers=1 tests/unit/landing-data.test.ts tests/unit/auth-actions-zod.test.ts tests/unit/password.test.ts

Expected: PASS.

- [ ] **Step 4: Commit**

~~~bash
git add src/app/page.tsx src/app/landing-*.tsx src/app/(auth) src/app/(legal) src/app/not-found.tsx src/app/error.tsx src/app/global-error.tsx
git commit -m "feat: bring public pages into editorial theme"
~~~

### Task 5: Migração das áreas autenticadas

**Files:**
- Modify: src/components/dashboard/*.tsx
- Modify: src/components/tasks/*.tsx
- Modify: src/components/tracked-products/StaffTrackedProducts.tsx
- Modify: src/app/(client)/dashboard/**/*.tsx
- Modify: src/app/(client)/conexoes/*.tsx
- Modify: src/app/(client)/configuracoes/*.tsx
- Modify: src/app/(client)/aguardando/page.tsx
- Modify: src/app/analista/**/*.tsx
- Modify: src/app/admin/**/*.tsx

**Interfaces:**
- Consumes: shell e primitivos já migrados.
- Produces: zero ocorrência de text-white, bg-white com opacidade, border-white, #04150a ou verde neon nas áreas visuais autenticadas.

- [ ] **Step 1: Fazer a migração semântica**

Trocar texto branco por ink, overlays claros por ink com opacidade, bordas brancas por line/ink, texto escuro de botões verdes por branco e gradientes neon por brand/brand.strong. Preservar branco apenas como superfície paper.1.

- [ ] **Step 2: Confirmar que o tema antigo não sobrou**

Run: rg -n "text-white|bg-white/|border-white/|#04150a|#07dd2b|rgba\(7,221,43" src/app src/components

Expected: nenhuma ocorrência visual; templates de e-mail são fora de escopo.

- [ ] **Step 3: Executar a suíte unitária serial**

Run: npm test -- --maxWorkers=1 --minWorkers=1

Expected: PASS.

- [ ] **Step 4: Executar lint e typecheck**

Run: npm run lint && npm run typecheck

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add src/app src/components
git commit -m "feat: migrate authenticated views to light CRM theme"
~~~

### Task 6: Gráficos, PDF e verificação final

**Files:**
- Modify: src/components/ui/charts/chart-theme.ts
- Modify: src/components/ui/charts/GlassTooltip.tsx
- Modify: src/components/ui/charts/DonutChart.tsx
- Modify: src/components/ui/charts/ScoreGauge.tsx
- Modify: src/components/ui/charts/LineChart.tsx
- Modify: src/components/ui/charts/EvolucaoComparadaChart.tsx
- Modify: src/modules/pdf/report-pdf.tsx
- Modify: tests/unit/chart-theme.test.ts
- Test: tests/unit/report-pdf.test.ts

**Interfaces:**
- Consumes: paleta editorial da Task 1.
- Produces: gráficos e PDF com papel, tinta e verde #137A3E; relatório PDF permanece Buffer válido.

- [ ] **Step 1: Migrar gráficos**

Usar grid #DED8CD, eixo #6F685F, marca #137A3E, área rgba(19,122,62,0.24) e séries acessíveis em fundo claro. Tooltips usam card branco, borda quente e texto ink.

- [ ] **Step 2: Migrar o PDF**

Trocar a capa escura por capa de papel, wordmark ink/verde, gauge com trilho bege e números ink. Preservar conteúdo, paginação, métricas e geração.

- [ ] **Step 3: Executar testes focados**

Run: npm test -- --maxWorkers=1 --minWorkers=1 tests/unit/chart-theme.test.ts tests/unit/report-pdf.test.ts tests/unit/pdf-gauge.test.ts

Expected: PASS e buffers iniciando com %PDF-.

- [ ] **Step 4: Executar verificação de produção**

Run: npm run lint && npm run typecheck && npm test -- --maxWorkers=1 --minWorkers=1 && npm run build

Expected: todos os comandos com exit code 0.

- [ ] **Step 5: Verificar visualmente**

Iniciar npm run dev. Inspecionar em desktop e mobile: landing, login, dashboard, admin, analista, sidebar aberta/recolhida, drawer, command palette, notificações, cards, tabelas e gráficos. Corrigir overflow horizontal, foco invisível, contraste e cortes.

- [ ] **Step 6: Commit**

~~~bash
git add src/components/ui/charts src/modules/pdf/report-pdf.tsx tests/unit/chart-theme.test.ts
git commit -m "feat: finish editorial visual migration"
~~~
