# G4 — Polimento Cinematográfico & A11y Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

> **Pré-requisitos: G0–G3 mergeadas; revalidar contratos citados.** Este plano assume no `master`: da **G0** — `formatData` (BRT) / `formatDataUtc` / `formatPeriodo` (UTC) em `src/lib/format.ts`, banner de conexão expirada na page do dashboard, badge Expirada `danger` em `client-row.tsx`, feedback de OAuth em `/conexoes`, card "Status do sistema" no `/admin`; da **G1** — página do relatório v2 (hero com KPIs, charts novos com `srSummary` próprio), comparar v2 (`comparar-form.tsx` já nos primitivos DS), PDF v2, `Reveal` usado pelas seções do relatório; da **G2** — `dashboard/page.tsx` REESCRITA (view-model único, sem "Relatórios gerados", sem query dupla, `SUM()` no SQL), `LineChart` com props `srSummary`/`formatTooltip`, `app-shell.tsx` sem o `px-4` do wrapper de conteúdo, `KanbanBoard` com `md:grid-cols-3 xl:grid-cols-5`, marquee do dashboard REMOVIDO (chips estáticos); da **G3** — `NotificationBell` com prop `verTodasHref`, página `/dashboard/notificacoes`, `TaskCard` sem setas (`MoverTaskSelect`), N+1 da carteira resolvido, `useToast` consumido pelo kanban. **No início de CADA task, revalide os trechos citados contra o `master` real** — os snippets deste plano foram extraídos do branch `feat/g0-verdade-dos-dados` (HEAD `3684771`, G0 em execução) e adaptados aos CONTRATOS dos planos G1/G2/G3; drift pequeno = adaptar inline e anotar no commit; drift estrutural = parar e revisar.

**Goal:** Fechar a fase de polimento da auditoria 2026-07-14 (seções 3-P2 e 4/G4): um primitivo `Dialog` acessível único, navegação client-side `next/link` com transições por área, `PageHeader` compartilhado, Toast v2, focus rings/erros/touch targets WCAG, admin 100% pt-BR com nav por papel, identidade em movimento (`ease-truth`, hover-lift, ScoreGauge animado), landing cinematográfica + metadata por rota, higiene de tokens e um lote de micro-fixes de engenharia (brl milhar, escapeHtml, requeue 23505, checklist atômico, /aguardando, LazyMotion).

**Architecture:** Segue o padrão do repo — **lógica de UI em módulos `.ts` puros testáveis** (vitest roda em node, não renderiza componentes) com componentes finos:

- **Primitivos** (`src/components/ui/`): `Dialog.tsx` (portal + focus-trap + inert + scroll-lock + AnimatePresence) com a matemática do trap em `dialog-model.ts` (puro); `Toast.tsx` v2 com regras de duração em `toast-store.ts` (puro); `Button.tsx` ganha renderização `next/link` para href interno decidida por `src/components/ui/href.ts` (puro).
- **Shell** (`src/components/app-shell.tsx`): reescrito UMA vez (Task 6) — `Link` + nav ativa (`usePathname` + `aria-current`) + nav por papel + skip-link + atalho por plataforma; as regras vivem em `src/components/nav-model.ts` (puro).
- **Identidade**: tokens no `tailwind.config.ts` (`dim` rebaixado, `ease-truth` aplicado); `PageHeader` server-safe extrai o padrão do hero do relatório; `Reveal` promovido a `src/components/reveal.tsx` (re-export no caminho antigo preserva a G1); `corDoScore` puro em `chart-theme.ts`.
- **Engenharia**: fixes pontuais em `alert-detectors.ts`, `templates.ts`, `admin.repository.ts`/`admin.actions.ts`, `task.repository.ts`/`tasks.actions.ts` (transação `FOR UPDATE`), `/aguardando`, rota PDF; `LazyMotion` global (`m.`) + `next/dynamic ssr:false` nos charts do dashboard.

**Tech Stack:** Next.js 14 (App Router), framer-motion 11 (`LazyMotion`/`m`, `MotionConfig reducedMotion="user"` já global), Recharts 2, cmdk, Tailwind (tokens da casa), Drizzle/Neon (`postgres.js`), Vitest (unit em `tests/unit`, integração em `tests/integration` no branch Neon `test` via `DATABASE_URL_TEST`), Playwright E2E existente. **Sem libs novas. Sem migrations.**

## Global Constraints

- **Next 14 + tailwind + framer-motion instalados** — nenhuma dependência nova.
- **TDD vitest (`npm run test`)**: lógica de UI em models `.ts` puros testáveis; componentes finos. Failing test primeiro → rodar e VER falhar → implementar → rodar e VER passar → commit. CSS/layout não é testável em vitest — steps de CSS são verificados por typecheck + suíte + E2E/smoke.
- **Copy pt-BR SEMPRE; commits em português** no padrão `feat(g4): ...` / `fix(g4): ...` / `test(g4): ...`.
- **PRESERVAR 100% testids/fluxos E2E** — nenhum spec muda sem step explícito justificado. Guardas desta fase: `confirm-dialog-confirm`/`confirm-dialog-cancel` (conexoes/admin specs), `command-palette`, `notification-bell`/`notification-unread`, `generate-report-button`, `latest-report`, `ver-relatorio`, `bling-status`, `disconnect-bling`, `add-form`, `nova-task-form`, `kanban-col-*`, `task-card`, `task-concluir`, `virar-task-gargalos-0`, `metricas`, `resumo-executivo`, `esqueci-senha-link`, `reset-solicitado`, `reset-erro`, `reset-request-button`, `reset-submit-button`, `org-*`, `status-*`, `conexao-*`, `reprocessar-relatorio`, `pagination`, `score-gauge`, `comparar-link`, `export-pdf`, textos `getByRole('button', { name: 'Ativar' })` e `getByText('Conecte o Bling em Conexões.')`. **Única mudança de spec da fase (justificada): `tests/e2e/admin.spec.ts` `getByText('active')` → `getByText('Ativo')`** (Task 6 — o label EN cru é exatamente o bug P2 que a task corrige; semântica do teste preservada).
- **Reduced-motion respeitado em toda animação nova** — `MotionConfig reducedMotion="user"` global já existe (`motion-provider.tsx`); animações CSS novas usam `motion-safe:`/`motion-reduce:`; `useCountUp` já devolve o alvo direto sob reduced-motion.
- **A11y: mudanças devem manter/melhorar WCAG, nunca regredir** — contraste AA ≥ 4.5:1 verificado numericamente onde cor muda; roles/labels/focus só evoluem.
- **Multi-tenancy inegociável**: nenhuma query nova sem `org_id`; `orgId` sempre da sessão. Testes de integração SEMPRE no branch `test` via `DATABASE_URL_TEST` (`describe.skipIf(!process.env.DATABASE_URL_TEST)`, cleanup em `afterAll`, prefixo `ta-test-`). `tests/setup.ts` é intocável. NUNCA rodar teste contra produção.
- **Branch:** `feat/g4-polimento` a partir de `master` (pós-G0+G1+G2+G3). Merge `--no-ff` só após a Task 11 (revisão ampla).

## Divergências do escopo auditado → exclusões e decisões (verificadas no código real + planos G1–G3)

1. **EXCLUÍDO — sr-only do LineChart**: G2/Task 8 já adiciona `srSummary`/`formatTooltip` ao `LineChart`. G4 apenas VERIFICA a existência na Task 9 (fallback documentado lá caso drift).
2. **EXCLUÍDO — stat "Relatórios gerados"**: G2/Task 1 o substitui por "Variação vs análise anterior" (`statCardsModel`).
3. **EXCLUÍDO — query dupla do dashboard**: G2/Task 1 (`getDashboardData` deduplica `getLatestReport`/`listReports`).
4. **EXCLUÍDO — SUM em JS do total do mês**: G2/Task 1 (`getTotalVendasMesCorrente` vira `SUM()` no SQL).
5. **EXCLUÍDO — N+1 da carteira**: G3/Task 6 ("Meu dia" do analista + fix N+1).
6. **EXCLUÍDO — comparar-form com primitivos DS**: G1/Task 12 já migra `comparar-form.tsx` para `Select`/`Button` do DS.
7. **EXCLUÍDO — adoção do BarChart**: G1/Task 6 cria `WeekdayBarChart` sobre o `BarChart` existente.
8. **EXCLUÍDO — eixos/datas/tooltip dos charts do dashboard + overflow mobile + gutter + colunas do kanban**: tudo G2/Task 8.
9. **REDUZIDO — touch targets**: G3/Task 9 remove as setas `←→↑↓` do TaskCard (vira `MoverTaskSelect`). Sobram: links da `Pagination` (h-8 = 32px), botão fechar do Toast (p-0.5) e botão do sino (p-2 = 36px) — tratados nas Tasks 4/5.
10. **MANTIDO — toggle de checklist atômico**: verificado que a G3 NÃO altera `toggleChecklistItemFormAction` nem o read-modify-write de `updateTask` (G3 só agrega checklist na leitura do kanban). Fica na Task 10 (transação + `FOR UPDATE`).
11. **DECISÃO — Tooltip/Dropdown: DELETAR ambos** (Task 9). Verificado por grep: **zero consumidores** de `@/components/ui/Tooltip` e `@/components/ui/Dropdown` em todo o `src/`. O sino NÃO adota Dropdown: a G3/Task 12 já evoluiu o popover próprio (prop `verTodasHref`) e o contrato do bell exige estado controlado que o Dropdown não expõe (divergência já documentada no próprio componente). O Tooltip CSS-only (hover/focus-within) viola WCAG 1.4.13 (não é dispensável por Esc) — manter um primitivo quebrado e órfão é pior que remover (YAGNI).
12. **DECISÃO — bell vira `role="dialog"` não-modal anclado, NÃO o Dialog modal** (Task 1). O primitivo `Dialog` é modal (overlay + trap + inert); um popover ancorado ao sino com overlay modal seria regressão de UX. O que a auditoria pede — semântica correta em vez do `role="menu"` quebrado — se resolve com `role="dialog"` + `aria-label` + foco gerenciado (entra no abrir, volta ao sino no fechar).
13. **DIVERGÊNCIA — PDF 404**: `new Response(string)` já emite `text/plain;charset=UTF-8` por default (confirmado na spec do Fetch/undici). A Task 10 apenas torna o header explícito (1 linha) para blindar contra mudança de runtime.
14. **NÃO CONFLITA — marquee**: o marquee do dashboard morre na G2 (chips estáticos). O marquee da G4 (Task 8) é OUTRO, novo, na landing — com pausa no hover e `motion-reduce:animate-none` desde o nascimento (WCAG 2.2.2).
15. **DIVERGÊNCIA — PageHeader NÃO é aplicado à página do relatório**: a G1/Task 7 reescreve o hero do relatório com faixa de KPIs (bespoke). O `PageHeader` EXTRAI o padrão visual dele (eyebrow mono + título Sora + radial-gradient) e é aplicado às DEMAIS páginas das 3 áreas.
16. **DECISÃO — `next/dynamic ssr:false` só nos charts do dashboard** (Task 10): `dashboard-charts.tsx` é client component (pode usar `ssr:false`); os charts do relatório (G1) são conteúdo principal server-rendered de uma página de conteúdo — lazy neles exigiria reestruturar a página da G1 (risco > ganho). Documentado.
17. **REDISTRIBUIÇÃO interna**: o skip-link (item 5 da auditoria) é implementado na Task 6 junto da reescrita única do `app-shell.tsx` (evita editar o mesmo arquivo grande em 3 tasks); o botão fechar do Toast ganha os 40px na própria Task 4; a unificação do `Button.danger` para tokens `danger-*` acontece na Task 5 (reescrita única dos variants); `corDoScore` (tokens do gauge) nasce na Task 7 — a Task 9 só varre os remanescentes.
18. **Áreas admin/analista ganham motion via `Reveal` por seção** (Task 3) — `staggerContainer` explícito só onde já há grid client-side; grids server-rendered usam `Reveal` (client component que recebe children server — mesmo padrão da página do relatório). Decisão de simplicidade: 1 mecanismo, zero re-render de dados.

## Constantes e decisões de design (decididas AQUI — não rediscutir)

| Constante | Valor | Onde | Significado |
|---|---|---|---|
| `DIM_NOVO` | `#8b8b94` | tailwind.config.ts | contraste 6.0:1 sobre `#040507`, 5.8:1 sobre `#0a0c10`, 5.7:1 sobre `#0d0d10` — AA ≥ 4.5 em todos os fundos reais |
| `FOCUS_RING` | `focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base` | Button.tsx | anel padrão (danger usa `ring-danger/60`, escrito literal p/ o JIT do Tailwind) |
| `AUTO_DISMISS_MS` | `5000` | toast-store.ts | duração de success/info; **error = `null` (persistente)** |
| Touch target mínimo | `h-10`/`w-10`/`min-w-10` (40px) | Pagination, Toast close, sino | WCAG 2.5.8 |
| Transição padrão | `duration-200` + `ease-truth` | primitivos | `transition-[color,background-color,border-color,box-shadow,transform,opacity]` |
| Fade do template | `0.3s` + `EASE_TRUTH`, `y: 12` | template.tsx ×3 | fade+lift por navegação de rota |
| Labels de negócio | `STATUS_ORG_LABEL`, `PLANO_LABEL` | src/lib/labels.ts | active→Ativo, pending→Pendente, suspended→Suspenso; weekly→Semanal, biweekly→Quinzenal, monthly→Mensal |
| Alvo do inert | `<div id="app-content">` | src/app/layout.tsx | Dialog (portal no body) aplica `inert`+`aria-hidden` aqui; toasts ficam FORA (irmãos) |
| Atalho do palette | `'⌘ K'` se `/Mac|iPhone|iPad|iPod/i` no userAgent, senão `'Ctrl K'` | nav-model.ts | default SSR = `'Ctrl K'`, corrigido em `useEffect` (sem hydration mismatch) |
| Erro de requeue | `'relatorio_em_andamento'` | admin.repository.ts | 23505 do índice `reports_org_ativo_uq` mapeado p/ mensagem amigável |

## Contratos assumidos de G0–G3 (revalidar na task que os toca)

| Contrato | Onde | Task |
|---|---|---|
| `dashboard/page.tsx` pós-G2: view-model, sem marquee, `<h1>Dashboard</h1>` presente | G2 T2 | 2, 3 |
| `LineChart` com `srSummary?`/`formatTooltip?` | `LineChart.tsx` (G2 T8) | 9, 10 |
| `app-shell.tsx` com wrapper de conteúdo `py-8` (sem `px-4`) | G2 T8 | 6 |
| `NotificationBell({ verTodasHref }?)` + link "Ver todas" no rodapé do popover | G3 T12 | 1 |
| `/dashboard/notificacoes` existe (página paginada) | G3 T12 | 2, 8 |
| `TaskCard` sem setas; `MoverTaskSelect`; `useToast` no kanban | G3 T9 | (nenhuma edição G4) |
| `comparar-form.tsx` nos primitivos DS; comparar v2 default vs anterior | G1 T12 | 8, 9 |
| Página do relatório: hero v2 com KPIs; `Reveal` importado de `./reveal` | G1 T7 | 3 |
| `formatData` (BRT), `formatPeriodo` (UTC) | `src/lib/format.ts` (G0) | 8, 10 |
| `client-row.tsx` com badge Expirada `danger` | G0 T7 | 6 |
| `getReportById(id, orgId)`, `requireActiveOrg()` | repo/auth existentes | 8 |
| `toggleChecklistLine`/`parseChecklist` | `checklist-line.ts` | 10 |
| `useToast()`/`toast({ title, description?, variant? })` — assinatura preservada | `Toast.tsx` (F2/G3) | 4 |

## File Structure

| Caminho | Ação | Task | Responsabilidade |
|---|---|---|---|
| `src/components/ui/dialog-model.ts` | criar | 1 | matemática pura do focus-trap (`proximoIndiceFoco`, `FOCUSABLE_SELECTOR`) |
| `src/components/ui/Dialog.tsx` | criar | 1 | primitivo modal: portal, trap, inert, scroll-lock, restore, Escape, AnimatePresence |
| `src/components/ui/ConfirmDialog.tsx` | mod | 1 | refeito sobre Dialog (API e testids preservados) |
| `src/components/command-palette.tsx` | mod | 1 | refeito sobre Dialog (testid preservado) |
| `src/components/notifications/NotificationBell.tsx` | mod | 1 | popover `role="dialog"` + foco gerenciado (preserva `verTodasHref` da G3) |
| `src/app/layout.tsx` | mod | 1, 8 | `<div id="app-content">` (T1); title template (T8) |
| `src/components/ui/href.ts` | criar | 2 | `isInternalHref` (puro) |
| `src/components/ui/Button.tsx` | mod | 2, 5, 7 | `Link` interno (T2); focus rings + danger tokens (T5); ease-truth (T7) |
| `src/app/(client)/template.tsx`, `src/app/admin/template.tsx`, `src/app/analista/template.tsx` | criar | 2 | fade+lift 0.3s EASE_TRUTH por navegação |
| `loading.tsx` em: plano-de-acao, relatorios/comparar, dashboard/notificacoes, analista, analista/[orgId], admin/[orgId], admin/playbooks, admin/consultoria | criar | 2 | skeletons padrão |
| `src/app/(auth)/*/page.tsx`, `admin/[orgId]/page.tsx`, varredura `<a>` | mod | 2 | anchors internos → `Link` |
| `src/components/page-header.tsx` | criar | 3 | eyebrow mono + título Sora + radial-gradient + slots |
| `src/components/reveal.tsx` | criar | 3 | `Reveal` compartilhado (re-export no caminho antigo) |
| `src/app/(client)/dashboard/relatorios/[id]/reveal.tsx` | mod | 3 | vira re-export |
| páginas: dashboard, conexoes, plano-de-acao, analista, analista/[orgId], admin, admin/[orgId], consultoria, playbooks | mod | 3 | PageHeader + Reveal (admin/analista) |
| `src/components/ui/toast-store.ts` | mod | 4 | `duracaoDoToast`, `action` no item |
| `src/components/ui/Toast.tsx` | mod | 4 | timers em Map, pausa hover/focus, error persistente `role="alert"`, slot ação, fechar 40px |
| `src/app/(auth)/sign-in/page.tsx`, `sign-up/page.tsx`, `esqueci-senha/page.tsx`, `redefinir-senha/[token]/reset-form.tsx` | mod | 5 | erros → `Alert` do DS |
| `src/components/ui/Alert.tsx` | mod | 5 | + `data-testid` passthrough |
| `src/components/tasks/TaskComments.tsx` | mod | 5 | `aria-label` no textarea |
| `src/components/ui/Pagination.tsx` | mod | 5 | `Link` + alvos 40px |
| `src/lib/labels.ts` | criar | 6 | `STATUS_ORG_LABEL`, `PLANO_LABEL` |
| `src/modules/notifications/templates.ts` | mod | 6, 10 | DRY `PLANO_LABEL` (T6); escapeHtml no pipelineFailed (T10) |
| `src/components/nav-model.ts` | criar | 6 | `navItems`, `logoHref`, `hrefAtivo`, `atalhoPaletaLabel` (puros) |
| `src/components/app-shell.tsx` | mod | 6 | reescrita: Link + nav ativa + nav por papel + skip-link + atalho |
| `src/components/command-model.ts` | mod | 6 | comandos por papel (Plano de Ação, Comparar períodos) |
| `src/app/admin/client-row.tsx` | mod | 6 | TR/TD do DS + labels pt-BR + Link |
| `src/app/admin/[orgId]/page.tsx` | mod | 2, 3, 6 | Link (T2), PageHeader (T3), labels (T6) |
| `tests/e2e/admin.spec.ts` | mod | 6 | `'active'` → `'Ativo'` (única mudança de spec, justificada) |
| `src/components/ui/Card.tsx` | mod | 7 | hover-lift + ease-truth + prop `lift` |
| `src/components/ui/Tabs.tsx` | mod | 7 | ease-truth |
| `src/components/ui/charts/chart-theme.ts` | mod | 7 | + `corDoScore` (tokens) |
| `src/components/ui/charts/ScoreGauge.tsx` | mod | 7 | arco/número animados via `useCountUp` + `role="img"` |
| `src/app/page.tsx` | mod | 8 | landing v2 (count-up, mock, marquee, CTA glow-3) |
| `src/app/landing-stats.tsx`, `src/app/landing-marquee.tsx`, `src/app/landing-mock.tsx` | criar | 8 | blocos da landing |
| `src/app/(auth)/sign-in/sign-in-form.tsx`, `sign-up/sign-up-form.tsx`, `esqueci-senha/esqueci-senha-form.tsx` | criar | 8 | split client p/ metadata |
| `export const metadata`/`generateMetadata` nas rotas | mod | 8 | títulos por página |
| `tailwind.config.ts` | mod | 9 | `dim: '#8b8b94'` |
| `src/components/ui/Tooltip.tsx`, `src/components/ui/Dropdown.tsx` | **remover** | 9 | órfãos (decisão 11) |
| `src/modules/alerts/alert-detectors.ts` | mod | 10 | `brl` → `formatBRL`; data pt-BR no produto parado |
| `src/modules/admin/admin.repository.ts` + `src/actions/admin.actions.ts` | mod | 10 | 23505 → `relatorio_em_andamento` → mensagem amigável |
| `src/modules/tasks/task.repository.ts` + `src/actions/tasks.actions.ts` | mod | 10 | `toggleChecklistItemTx` (FOR UPDATE) |
| `src/app/(client)/aguardando/page.tsx` | mod | 10 | redirects por papel/status + copy de suspensa |
| `src/app/api/reports/[id]/pdf/route.ts` | mod | 10 | content-type explícito no 404 |
| `src/components/motion-provider.tsx` | mod | 10 | LazyMotion strict + MotionConfig |
| varredura `motion.` → `m.` | mod | 10 | todos os .tsx com framer |
| `src/app/(client)/dashboard/dashboard-charts.tsx` | mod | 10 | `next/dynamic ssr:false` + Skeleton |
| `tests/unit/dialog-model.test.ts`, `href.test.ts`, `labels.test.ts`, `nav-model.test.ts`, `cor-do-score.test.ts` | criar | 1, 2, 6, 7 | modelos puros novos |
| `tests/unit/toast-store.test.ts`, `command-model.test.ts`, `alert-detectors.test.ts`, `notification-templates.test.ts` | mod | 4, 6, 10 | contratos evoluídos |
| `tests/integration/requeue-conflito.test.ts`, `tests/integration/checklist-toggle-tx.test.ts` | criar | 10 | 23505 amigável; toggle serializado |

**Dependências entre tasks:** 1→6 (o shell da Task 6 monta o palette refeito na 1), 2→{3,5,6,8} (Button/Link, templates e a regra de conversão são a base das demais), 7→9 (`corDoScore` nasce na 7; a 9 só varre remanescentes), {1..9}→10 (a varredura `m.` da 10 cobre os componentes motion criados antes). Ordem de execução = ordem numérica. Task 11 fecha a fase.

---

### Task 1: Primitivo `Dialog` único + refatoração de ConfirmDialog, ⌘K e sino

**Files:**
- Create: `src/components/ui/dialog-model.ts`
- Create: `src/components/ui/Dialog.tsx`
- Modify: `src/app/layout.tsx` (wrapper `#app-content`)
- Modify: `src/components/ui/ConfirmDialog.tsx` (reescrita sobre Dialog)
- Modify: `src/components/command-palette.tsx` (reescrita sobre Dialog)
- Modify: `src/components/notifications/NotificationBell.tsx` (roles + foco)
- Test: `tests/unit/dialog-model.test.ts` (novo)

**Interfaces:**
- Consumes: `DUR`/`EASE_TRUTH` (`src/lib/motion.ts`); `buildCommands` (`command-model.ts`); `Button` (`ui/Button.tsx`); actions de notificação existentes; prop `verTodasHref` do bell (G3 T12 — REVALIDAR e preservar o link "Ver todas" no rodapé do popover).
- Produces:

```ts
// dialog-model.ts
export const FOCUSABLE_SELECTOR: string;
export function proximoIndiceFoco(total: number, atual: number, shiftKey: boolean): number;

// Dialog.tsx
interface DialogProps {
  open: boolean;
  onClose: () => void;
  'aria-label'?: string;      // OU labelledBy — pelo menos um
  labelledBy?: string;
  position?: 'center' | 'top'; // default 'center'; 'top' = pt-[18vh] (palette)
  maxWidthClassName?: string;  // default 'max-w-sm'
  children: React.ReactNode;
  'data-testid'?: string;      // vai no overlay
}
export function Dialog(props: DialogProps): JSX.Element | null;
```

Regras do Dialog (todas obrigatórias): portal em `document.body`; `role="dialog"` + `aria-modal="true"`; foca `[data-autofocus]` (senão o 1º focável, senão o painel `tabIndex={-1}`) ao abrir; loop de Tab preso ao painel; `Escape` fecha; clique no overlay fecha (clique no painel não); `document.body.style.overflow='hidden'` enquanto aberto (restaura o valor anterior); `inert` + `aria-hidden="true"` em `#app-content` enquanto aberto; foco restaurado ao elemento que abriu; `AnimatePresence` com fade no overlay e fade+lift+scale no painel (`DUR.fast`, `EASE_TRUTH`).

- [ ] **Step 1 — teste puro falhando.** Criar `tests/unit/dialog-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { FOCUSABLE_SELECTOR, proximoIndiceFoco } from '@/components/ui/dialog-model';

describe('proximoIndiceFoco (loop de Tab do focus-trap)', () => {
  it('Tab avança e dá a volta no fim', () => {
    expect(proximoIndiceFoco(3, 0, false)).toBe(1);
    expect(proximoIndiceFoco(3, 2, false)).toBe(0); // loop
  });

  it('Shift+Tab recua e dá a volta no início', () => {
    expect(proximoIndiceFoco(3, 2, true)).toBe(1);
    expect(proximoIndiceFoco(3, 0, true)).toBe(2); // loop reverso
  });

  it('foco fora da lista (atual = -1): Tab vai ao primeiro, Shift+Tab ao último', () => {
    expect(proximoIndiceFoco(3, -1, false)).toBe(0);
    expect(proximoIndiceFoco(3, -1, true)).toBe(2);
  });

  it('lista vazia devolve -1 (nada a focar)', () => {
    expect(proximoIndiceFoco(0, 0, false)).toBe(-1);
  });
});

describe('FOCUSABLE_SELECTOR', () => {
  it('cobre os controles interativos padrão e exclui tabindex=-1', () => {
    expect(FOCUSABLE_SELECTOR).toContain('a[href]');
    expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/dialog-model.test.ts` (FALHA: módulo não existe).
- [ ] **Step 3 — implementar o model.** Criar `src/components/ui/dialog-model.ts`:

```ts
/** Matemática pura do focus-trap — testável em node, sem DOM. */

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Índice do próximo elemento a focar num loop de Tab dentro do trap.
 * `atual` = índice do elemento focado na lista de focáveis (-1 se o foco
 * está fora da lista, ex.: no próprio painel).
 */
export function proximoIndiceFoco(total: number, atual: number, shiftKey: boolean): number {
  if (total <= 0) return -1;
  if (atual === -1) return shiftKey ? total - 1 : 0;
  if (shiftKey) return atual <= 0 ? total - 1 : atual - 1;
  return atual >= total - 1 ? 0 : atual + 1;
}
```

Rodar de novo: `npm run test -- tests/unit/dialog-model.test.ts` (PASSA).

- [ ] **Step 4 — wrapper inert no root layout.** Em `src/app/layout.tsx`, envolver `{children}` (dentro do ToastProvider) num div identificável — o viewport de toasts do `ToastProvider` fica FORA dele (é irmão de `children` dentro do provider), então toasts continuam clicáveis com modal aberto:

```tsx
<MotionProvider>
  <ToastProvider>
    <div id="app-content">{children}</div>
  </ToastProvider>
</MotionProvider>
```

- [ ] **Step 5 — criar o primitivo.** Criar `src/components/ui/Dialog.tsx`:

```tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';

import { DUR, EASE_TRUTH } from '@/lib/motion';

import { FOCUSABLE_SELECTOR, proximoIndiceFoco } from './dialog-model';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  'aria-label'?: string;
  labelledBy?: string;
  position?: 'center' | 'top';
  maxWidthClassName?: string;
  children: React.ReactNode;
  'data-testid'?: string;
}

/**
 * Primitivo modal único da casa: portal no body, focus-trap com loop de Tab,
 * inert/aria-hidden no #app-content, scroll-lock do body, Escape, restauração
 * de foco ao trigger e AnimatePresence com EASE_TRUTH. ConfirmDialog e o ⌘K
 * são construídos sobre ele.
 */
export function Dialog({
  open,
  onClose,
  'aria-label': ariaLabel,
  labelledBy,
  position = 'center',
  maxWidthClassName = 'max-w-sm',
  children,
  'data-testid': testid,
}: DialogProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Scroll-lock + inert no fundo + foco inicial + restauração ao fechar.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const app = document.getElementById('app-content');
    app?.setAttribute('inert', '');
    app?.setAttribute('aria-hidden', 'true');

    // Foco inicial: [data-autofocus] > 1º focável > painel.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const auto = panel.querySelector<HTMLElement>('[data-autofocus]');
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (auto ?? first ?? panel).focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      app?.removeAttribute('inert');
      app?.removeAttribute('aria-hidden');
      triggerRef.current?.focus();
    };
  }, [open]);

  // Escape fecha; Tab fica preso ao painel.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focaveis = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const atual = focaveis.indexOf(document.activeElement as HTMLElement);
      const proximo = proximoIndiceFoco(focaveis.length, atual, e.shiftKey);
      e.preventDefault();
      if (proximo >= 0) focaveis[proximo]!.focus();
      else panel.focus();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.fast }}
          data-testid={testid}
          onClick={onClose}
          className={`fixed inset-0 z-50 flex justify-center bg-black/60 p-4 backdrop-blur-sm ${
            position === 'top' ? 'items-start pt-[18vh]' : 'items-center'
          }`}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: DUR.fast, ease: EASE_TRUTH }}
            onClick={(e) => e.stopPropagation()}
            className={`w-full outline-none ${maxWidthClassName}`}
          >
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
```

- [ ] **Step 6 — ConfirmDialog sobre o Dialog.** Reescrever `src/components/ui/ConfirmDialog.tsx` (API pública e testids IDÊNTICOS — `confirm-dialog-cancel`/`confirm-dialog-confirm` são usados pelos E2E de conexões e admin):

```tsx
'use client';

import React from 'react';

import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} labelledBy="confirm-dialog-title" maxWidthClassName="max-w-sm">
      <div className="rounded-2xl border border-line bg-bg-surface p-6">
        <h2 id="confirm-dialog-title" className="font-heading text-base font-semibold text-white">
          {title}
        </h2>
        {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          {/* ref/autofocus não passam pelo Button (props tipadas) — botão nativo estilizado */}
          <button
            type="button"
            data-autofocus
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium outline-none transition-all duration-150 ${
              variant === 'danger'
                ? 'border border-danger-border text-danger-fg hover:bg-danger-tint focus-visible:ring-2 focus-visible:ring-danger/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base'
                : 'bg-brand font-semibold text-[#04150a] hover:shadow-glow focus-visible:shadow-glow'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 7 — ⌘K sobre o Dialog.** Reescrever `src/components/command-palette.tsx` mantendo o testid `command-palette` (agora no overlay do Dialog) e o listener global de `⌘/Ctrl+K` (o app-shell dispara um KeyboardEvent sintético — comportamento preservado):

```tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';

import { Dialog } from '@/components/ui/Dialog';

import { buildCommands } from './command-model';

export function CommandPalette({ variant }: { variant: 'client' | 'admin' | 'analista' }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const commands = useMemo(() => buildCommands(variant), [variant]);
  const groups = ['Navegação', 'Ações'] as const;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function run(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      aria-label="Comandos"
      position="top"
      maxWidthClassName="max-w-lg"
      data-testid="command-palette"
    >
      <Command
        label="Comandos"
        className="overflow-hidden rounded-2xl border border-line bg-bg-surface/95 shadow-glow-3 backdrop-blur-md"
      >
        <Command.Input
          autoFocus
          data-autofocus
          placeholder="Digite um comando ou busque…"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm text-white placeholder:text-dim outline-none"
        />
        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
            Nada encontrado.
          </Command.Empty>
          {groups.map((group) => (
            <Command.Group
              key={group}
              heading={group}
              className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-dim"
            >
              {commands
                .filter((c) => c.group === group)
                .map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`${c.label} ${c.keywords ?? ''}`}
                    onSelect={() => run(c.href)}
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm text-muted transition-colors data-[selected=true]:bg-brand-glow data-[selected=true]:text-white"
                  >
                    {c.label}
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
        <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
          <kbd className="rounded border border-line bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-dim">
            esc
          </kbd>
          <span className="text-[10px] text-dim">fechar</span>
        </div>
      </Command>
    </Dialog>
  );
}
```

*(o grupo vazio "Ações" do analista continua renderizando só o heading — comportamento atual preservado; a Task 6 mexe nos comandos.)*

- [ ] **Step 8 — sino com semântica de dialog + foco gerenciado.** Em `src/components/notifications/NotificationBell.tsx` (REVALIDAR contra o master: a G3/T12 adicionou a prop `verTodasHref` e o link "Ver todas" — PRESERVAR ambos), aplicar exatamente estas mudanças:
  1. No botão do sino: `aria-haspopup="menu"` → `aria-haspopup="dialog"`; classe `p-2` → `p-2.5` (alvo ≥40px); adicionar `ref={btnRef}` (`const btnRef = useRef<HTMLButtonElement>(null);`).
  2. No popover: `role="menu"` → `role="dialog"` + `aria-label="Notificações"`; adicionar `ref={popRef}` (`const popRef = useRef<HTMLDivElement>(null);`).
  3. Foco entra ao abrir e volta ao sino ao fechar — adicionar o effect (depois do effect de click-outside existente):

```tsx
  // Foco: entra no popover ao abrir; volta ao sino ao fechar (a11y do "dialog" não-modal).
  const abertoAntes = useRef(false);
  useEffect(() => {
    if (open) {
      abertoAntes.current = true;
      const primeiro = popRef.current?.querySelector<HTMLElement>('button, a[href]');
      primeiro?.focus();
    } else if (abertoAntes.current) {
      abertoAntes.current = false;
      btnRef.current?.focus();
    }
  }, [open]);
```

  *(Escape e click-outside já existem e ficam; NÃO adotar o primitivo Dialog aqui — ver decisão 12 no topo.)*

- [ ] **Step 9 — verificação.** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/conexoes.spec.ts tests/e2e/admin.spec.ts` → **verdes** (usam `confirm-dialog-confirm`). Smoke manual (`npm run dev`): abrir ConfirmDialog de suspender no /admin → Tab dá voltas SÓ dentro do modal, fundo não rola, Escape fecha e o foco volta ao botão "Suspender"; ⌘K abre com foco no input, Escape fecha e restaura; sino abre com foco na primeira notificação, fecha devolvendo o foco ao sino.
- [ ] **Step 10 — Commit:**

```bash
git add src/components/ui/dialog-model.ts src/components/ui/Dialog.tsx src/components/ui/ConfirmDialog.tsx src/components/command-palette.tsx src/components/notifications/NotificationBell.tsx src/app/layout.tsx tests/unit/dialog-model.test.ts
git commit -m "feat(g4): primitivo Dialog unico (focus-trap, inert, scroll-lock, restore) + ConfirmDialog, cmd-K e sino refeitos"
```

---

### Task 2: Navegação `next/link` em todo o app + `template.tsx` por área + `loading.tsx` faltantes

**Files:**
- Create: `src/components/ui/href.ts`
- Modify: `src/components/ui/Button.tsx` (render `Link` p/ href interno)
- Create: `src/app/(client)/template.tsx`, `src/app/admin/template.tsx`, `src/app/analista/template.tsx`
- Create: `loading.tsx` em `src/app/(client)/dashboard/plano-de-acao/`, `src/app/(client)/dashboard/relatorios/comparar/`, `src/app/(client)/dashboard/notificacoes/`, `src/app/analista/`, `src/app/analista/[orgId]/`, `src/app/admin/[orgId]/`, `src/app/admin/playbooks/`, `src/app/admin/consultoria/`
- Modify (varredura `<a>` → `Link`): `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/esqueci-senha/page.tsx`, `src/app/admin/[orgId]/page.tsx`, `src/app/(client)/dashboard/page.tsx` (pós-G2), `src/app/(client)/dashboard/onboarding-checklist.tsx`, `src/app/(client)/dashboard/generation-progress.tsx` + o que a varredura do Step 6 encontrar
- Test: `tests/unit/href.test.ts` (novo)

**Interfaces:**
- Consumes: `EASE_TRUTH` (`src/lib/motion.ts`); `Skeleton` (`ui/Skeleton.tsx`).
- Produces:

```ts
// src/components/ui/href.ts
/** true = navegação interna do app (usa next/link); false = <a> cru (api/pdf, mailto, externo, hash). */
export function isInternalHref(href: string): boolean;
```

Regra de conversão da varredura (vale para TODA a fase): `<a href="/rota-interna">` → `<Link href="...">` (mesmas classes); manter `<a>` para `mailto:`, `http(s)://`, `/api/...` (download de PDF NÃO pode ser Link) e âncoras `#hash` puras. `app-shell.tsx`, `client-row.tsx` e `Pagination.tsx` NÃO entram aqui (Tasks 6, 6 e 5 os reescrevem — evita editar 2×).

- [ ] **Step 1 — teste puro falhando.** Criar `tests/unit/href.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { isInternalHref } from '@/components/ui/href';

describe('isInternalHref', () => {
  it('rotas do app são internas', () => {
    expect(isInternalHref('/dashboard')).toBe(true);
    expect(isInternalHref('/dashboard/relatorios/comparar?a=1')).toBe(true);
    expect(isInternalHref('/sign-in')).toBe(true);
  });

  it('api, externos, mailto, hash e protocol-relative NÃO são internos', () => {
    expect(isInternalHref('/api/reports/123/pdf')).toBe(false);
    expect(isInternalHref('https://truthcommerce.com.br')).toBe(false);
    expect(isInternalHref('mailto:suporte@truthcommerce.com.br')).toBe(false);
    expect(isInternalHref('#gerar-relatorio')).toBe(false);
    expect(isInternalHref('//evil.com')).toBe(false);
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/href.test.ts` (FALHA: módulo não existe).
- [ ] **Step 3 — implementar helper + Button.** Criar `src/components/ui/href.ts`:

```ts
/**
 * Decide se um href é navegação interna do App Router (next/link) ou precisa
 * de <a> cru: /api/* é resposta binária/download (PDF), // é protocol-relative
 * (externo), hash puro é âncora na própria página.
 */
export function isInternalHref(href: string): boolean {
  return href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api/');
}
```

Em `src/components/ui/Button.tsx`, adicionar os imports e trocar SÓ o ramo `as === 'a'`:

```tsx
import Link from 'next/link';

import { isInternalHref } from './href';
```

```tsx
  if (rest.as === 'a') {
    const { as: _as, href, ...anchorRest } = rest as ButtonAsAnchor;
    if (isInternalHref(href)) {
      return (
        <Link href={href} className={base} {...anchorRest}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} className={base} {...anchorRest}>
        {children}
      </a>
    );
  }
```

Rodar: `npm run test -- tests/unit/href.test.ts` (PASSA) + `npm run typecheck`.

- [ ] **Step 4 — templates por área (fade+lift na navegação).** Criar os TRÊS arquivos com o MESMO conteúdo — `src/app/(client)/template.tsx`, `src/app/admin/template.tsx`, `src/app/analista/template.tsx` (o template remonta a cada navegação de rota — é o mecanismo do fade; `MotionConfig reducedMotion="user"` global zera o `y` sob reduced-motion e mantém só o fade):

```tsx
'use client';

import { motion } from 'framer-motion';

import { EASE_TRUTH } from '@/lib/motion';

/** Transição de rota da área: fade + lift 0.3s com o easing assinatura. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_TRUTH }}
    >
      {children}
    </motion.div>
  );
}
```

- [ ] **Step 5 — skeletons nas rotas sem loading.tsx.** Criar (padrão do `dashboard/loading.tsx` existente — `main` + `Skeleton`):

`src/app/(client)/dashboard/plano-de-acao/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function PlanoDeAcaoLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-12 rounded-2xl" />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
```

`src/app/(client)/dashboard/relatorios/comparar/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function CompararLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-12 w-full max-w-xl rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
    </main>
  );
}
```

`src/app/(client)/dashboard/notificacoes/loading.tsx` (rota criada pela G3/T12 — se ela não existir no master, PARE e revise o pré-requisito):

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function NotificacoesLoading() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
```

`src/app/analista/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function AnalistaLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
```

`src/app/analista/[orgId]/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function AnalistaOrgLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-10 w-full max-w-md rounded-2xl" />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
```

`src/app/admin/[orgId]/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function AdminOrgLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </main>
  );
}
```

`src/app/admin/playbooks/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function PlaybooksLoading() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-5 w-96" />
      <Skeleton className="h-96 rounded-2xl" />
    </main>
  );
}
```

`src/app/admin/consultoria/loading.tsx`:

```tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function ConsultoriaLoading() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-28 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </main>
  );
}
```

- [ ] **Step 6 — varredura `<a>` interno → `Link`.** Rodar:

```bash
grep -rn --include="*.tsx" -E '<a$|<a ' src | grep -v 'mailto\|http'
```

Converter TODOS os hits de navegação interna (regra do topo da task), EXCETO `app-shell.tsx` (Task 6), `client-row.tsx` (Task 6), `Pagination.tsx` (Task 5) e âncoras `#hash` (ex.: `toc.tsx`). Conversões conhecidas (adaptar ao master pós-G1/G2/G3 — os arquivos reescritos por eles podem já usar `Link`):
  - `sign-in/page.tsx`: links "Esqueci minha senha" (manter `data-testid="esqueci-senha-link"`) e "Criar conta" → `Link`.
  - `sign-up/page.tsx`: link "Entrar" → `Link`.
  - `esqueci-senha/page.tsx`: link "Entrar" → `Link`.
  - `admin/[orgId]/page.tsx`: `← Clientes` → `Link`.
  - `dashboard/page.tsx` (pós-G2): `ver-relatorio`, links "Ver" do histórico, link do banner de conexão expirada, `comparar-periodos-link` → `Link` (manter testids).
  - `onboarding-checklist.tsx` e `generation-progress.tsx`: anchors internos → `Link`.

Em cada arquivo convertido: `import Link from 'next/link';` no topo. Ao final, o MESMO grep deve devolver apenas: `app-shell.tsx`, `client-row.tsx`, `Pagination.tsx`, âncoras `#`, `mailto:` e `/api/`.

- [ ] **Step 7 — verificação.** `npm run test` + `npm run typecheck` verdes. `npx playwright test` → **verde** (navegação por Link preserva os fluxos). Smoke: navegar Dashboard → Conexões → Plano de Ação sem full reload (sem flash branco), com fade de 0.3s e skeletons nas rotas novas.
- [ ] **Step 8 — Commit:**

```bash
git add -A
git commit -m "feat(g4): navegacao next/link em todo o app + template fade por area + skeletons nas rotas faltantes"
```

---

### Task 3: PageHeader compartilhado + Reveal global + motion em admin/analista

**Files:**
- Create: `src/components/page-header.tsx`
- Create: `src/components/reveal.tsx` (movido de `relatorios/[id]/reveal.tsx`)
- Modify: `src/app/(client)/dashboard/relatorios/[id]/reveal.tsx` (vira re-export — imports da G1 intactos)
- Modify: `src/app/(client)/dashboard/page.tsx`, `src/app/(client)/conexoes/page.tsx`, `src/app/(client)/dashboard/plano-de-acao/page.tsx`, `src/app/analista/page.tsx`, `src/app/analista/[orgId]/page.tsx`, `src/app/admin/page.tsx`, `src/app/admin/[orgId]/page.tsx`, `src/app/admin/consultoria/page.tsx`, `src/app/admin/playbooks/page.tsx`

**Interfaces:**
- Consumes: `fadeLift` (`src/lib/motion.ts`); padrão visual do hero do relatório (eyebrow `font-mono text-[11px] uppercase tracking-widest text-brand` + `h1 font-heading` + radial-gradient — extraído de `relatorios/[id]/page.tsx`).
- Produces:

```tsx
// page-header.tsx — server-safe (zero interatividade)
interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;   // slot à direita (botões)
  children?: React.ReactNode;  // slot abaixo do título (badges etc.)
  className?: string;
}
export function PageHeader(props: PageHeaderProps): JSX.Element;

// reveal.tsx — mesmo contrato do Reveal atual
export function Reveal(props: { children: React.ReactNode; className?: string; id?: string; 'data-testid'?: string }): JSX.Element;
```

- [ ] **Step 1 — criar o PageHeader.** `src/components/page-header.tsx`:

```tsx
import React from 'react';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Cabeçalho editorial das páginas (padrão extraído do hero do relatório):
 * eyebrow Space Mono uppercase verde + título Sora + radial-gradient sutil +
 * slots de ações (direita) e badges (abaixo do título). Server-safe.
 */
export function PageHeader({ eyebrow, title, description, actions, children, className = '' }: PageHeaderProps) {
  return (
    <header className={`relative overflow-hidden rounded-2xl border border-line bg-bg-surface p-6 md:p-8 ${className}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 90% at 20% 0%, rgba(7,221,43,0.08) 0%, transparent 60%)',
        }}
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-widest text-brand">{eyebrow}</p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-white md:text-3xl">{title}</h1>
          {description ? <p className="mt-2 text-sm text-muted">{description}</p> : null}
          {children ? <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
```

- [ ] **Step 2 — promover o Reveal.** Criar `src/components/reveal.tsx` com o CONTEÚDO ATUAL de `src/app/(client)/dashboard/relatorios/[id]/reveal.tsx` (copiar o arquivo inteiro — `'use client'`, `motion.section`, `fadeLift`, `whileInView`, `viewport={{ once: true, margin: '-60px' }}`). Substituir o conteúdo de `src/app/(client)/dashboard/relatorios/[id]/reveal.tsx` por:

```tsx
export { Reveal } from '@/components/reveal';
```

`npm run typecheck` (PASSA — os imports `./reveal` da página do relatório/G1 continuam válidos).

- [ ] **Step 3 — aplicar o PageHeader nas 9 páginas.** Em cada uma, substituir o `<h1 className="font-heading text-2xl font-bold text-white">…</h1>` (e a linha descritiva, quando existir) por `<PageHeader …/>` com `import { PageHeader } from '@/components/page-header';`. Eyebrows/títulos (copy travada):
  - `dashboard/page.tsx` (pós-G2 — só a linha do h1): `<PageHeader eyebrow="Visão geral" title="Dashboard" description={org?.name ?? undefined} />` *(o `org` já está carregado no view-model da G2; se o nome da variável divergir, adaptar)*.
  - `conexoes/page.tsx`: `<PageHeader eyebrow="Configuração" title="Conexões" description="Bling, produtos monitorados e preferências de geração." />`
  - `plano-de-acao/page.tsx`: `<PageHeader eyebrow="Consultoria Truth" title="Plano de Ação" />` (substitui o div flex + h1).
  - `analista/page.tsx`: `<PageHeader eyebrow="Consultoria Truth" title="Carteira de clientes" />`
  - `analista/[orgId]/page.tsx`: `<PageHeader eyebrow="Cliente da carteira" title={org.name} />` (o link `← Carteira` fica acima, fora do header).
  - `admin/page.tsx`: `<PageHeader eyebrow="Operação Truth" title="Clientes" />` (o form de busca fica abaixo, fora do header).
  - `admin/[orgId]/page.tsx`: substituir o bloco `<div className="flex flex-wrap items-start justify-between gap-4">…</div>` inteiro por:

```tsx
      <PageHeader eyebrow="Cliente" title={org.name} actions={<GenerateNow orgId={org.id} />}>
        <Badge variant={org.status === 'active' ? 'success' : org.status === 'suspended' ? 'danger' : 'warn'}>
          {org.status}
        </Badge>
        <span className="font-mono text-sm text-muted">{org.plano ?? 'sem plano'}</span>
        <Badge variant={saudeInfo.variant}>{saudeInfo.label}</Badge>
      </PageHeader>
```

  *(os labels EN viram pt-BR na Task 6 — aqui só muda a moldura.)*
  - `admin/consultoria/page.tsx`: `<PageHeader eyebrow="Operação Truth" title="Consultoria" />`
  - `admin/playbooks/page.tsx`: `<PageHeader eyebrow="Operação Truth" title="Playbooks" description="Templates de task reutilizáveis pelo analista ao criar uma nova tarefa. Global — não pertence a nenhum cliente específico." />` (o `<p>` solto sai).

- [ ] **Step 4 — motion nas áreas admin/analista (Reveal por seção).** Com `import { Reveal } from '@/components/reveal';`:
  - `analista/page.tsx`: trocar `<section className="space-y-3">` das DUAS seções (Fila de revisão, Organizações) por `<Reveal className="space-y-3">` (Reveal renderiza `<section>`; children server passam como slot).
  - `admin/page.tsx`: envolver o `<Card className="!p-0">` da tabela em `<Reveal>` (e o card "Status do sistema" da G0/T10, se presente).
  - `admin/consultoria/page.tsx`: envolver cada um dos dois `<Card>` em `<Reveal>`.
  - `admin/[orgId]/page.tsx`: envolver os Cards "Consultoria" e "Meta mensal" e o `<Tabs>` em `<Reveal>` (um por bloco; manter `data-testid="meta-mensal-card"` no Card interno).

- [ ] **Step 5 — verificação.** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/admin.spec.ts tests/e2e/dashboard.spec.ts` → verdes (headers não carregam testids). Smoke: as 9 páginas com o mesmo DNA de cabeçalho; admin/analista com reveal ao rolar; com `prefers-reduced-motion` o conteúdo aparece sem deslocamento.
- [ ] **Step 6 — Commit:**

```bash
git add -A
git commit -m "feat(g4): PageHeader compartilhado nas 3 areas + Reveal global e motion em admin/analista"
```

---

### Task 4: Toast v2 — timers limpos, pausa no hover/focus, erro persistente, slot de ação

**Files:**
- Modify: `src/components/ui/toast-store.ts`
- Modify: `src/components/ui/Toast.tsx`
- Test: `tests/unit/toast-store.test.ts` (mod)

**Interfaces:**
- Consumes: `addToast`/`removeToast` existentes; `DUR`/`EASE_TRUTH`; consumidores de `useToast` (kanban da G3 usa `toast({ title, variant })` — assinatura PRESERVADA, apenas estendida com `action?`).
- Produces:

```ts
// toast-store.ts (adições — nada é removido)
export type ToastAction = { label: string; onClick: () => void };
export type ToastItem = { id: number; title: string; description?: string; variant: ToastVariant; action?: ToastAction };
export type ToastInput = { title: string; description?: string; variant?: ToastVariant; action?: ToastAction };
export const AUTO_DISMISS_MS = 5000;
/** null = persistente (variant error nunca auto-fecha). */
export function duracaoDoToast(variant: ToastVariant): number | null;
```

- [ ] **Step 1 — testes puros falhando.** Em `tests/unit/toast-store.test.ts`, ADICIONAR ao describe existente (imports passam a incluir `AUTO_DISMISS_MS, duracaoDoToast`):

```ts
  it('duracaoDoToast: success/info expiram em AUTO_DISMISS_MS; error é persistente (null)', () => {
    expect(duracaoDoToast('success')).toBe(AUTO_DISMISS_MS);
    expect(duracaoDoToast('info')).toBe(AUTO_DISMISS_MS);
    expect(duracaoDoToast('error')).toBeNull();
  });

  it('addToast preserva o slot de ação opcional', () => {
    const onClick = () => {};
    const list = addToast([], { title: 'Task movida', action: { label: 'Desfazer', onClick } }, 7);
    expect(list[0]!.action).toEqual({ label: 'Desfazer', onClick });
  });
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/toast-store.test.ts` (FALHA: `duracaoDoToast` não exportado / `action` não preservado).
- [ ] **Step 3 — evoluir a store.** Substituir o conteúdo de `src/components/ui/toast-store.ts` por:

```ts
/** Fila de toasts pura — testável em node, sem React. */
export type ToastVariant = 'success' | 'error' | 'info';

export type ToastAction = { label: string; onClick: () => void };

export type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  action?: ToastAction;
};

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
};

const MAX_TOASTS = 4;

export const AUTO_DISMISS_MS = 5000;

/**
 * Duração do auto-dismiss por variant. Erro é PERSISTENTE (null): o usuário
 * precisa ler e agir — sumir em 5s é perder a informação.
 */
export function duracaoDoToast(variant: ToastVariant): number | null {
  return variant === 'error' ? null : AUTO_DISMISS_MS;
}

export function addToast(list: ToastItem[], input: ToastInput, id: number): ToastItem[] {
  const item: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'info',
    action: input.action,
  };
  return [...list, item].slice(-MAX_TOASTS);
}

export function removeToast(list: ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id);
}
```

Rodar: `npm run test -- tests/unit/toast-store.test.ts` (PASSA).

- [ ] **Step 4 — Toast v2 (provider).** Reescrever `src/components/ui/Toast.tsx` — timers num `Map` com `clearTimeout` no dismiss/unmount, pausa on-hover/focus (retoma com a duração cheia — decisão de simplicidade), erro com `role="alert"` sem timer, slot de ação, botão fechar com alvo de 40px:

```tsx
'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { DUR, EASE_TRUTH } from '@/lib/motion';

import {
  addToast,
  duracaoDoToast,
  removeToast,
  type ToastInput,
  type ToastItem,
  type ToastVariant,
} from './toast-store';

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return ctx;
}

const variantClasses: Record<ToastVariant, string> = {
  success: 'border-success-border',
  error: 'border-danger-border',
  info: 'border-line',
};

const dotClasses: Record<ToastVariant, string> = {
  success: 'bg-success',
  error: 'bg-danger',
  info: 'bg-muted',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(1);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    setItems((list) => removeToast(list, id));
  }, []);

  const agendar = useCallback(
    (id: number, variant: ToastVariant) => {
      const dur = duracaoDoToast(variant);
      if (dur === null) return; // erro é persistente
      const timer = setTimeout(() => dismiss(id), dur);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const pausar = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = idRef.current++;
      setItems((list) => addToast(list, input, id));
      agendar(id, input.variant ?? 'info');
      // Toasts empurrados p/ fora pelo cap MAX_TOASTS: o timer órfão só chama
      // removeToast de um id ausente (no-op) — sem vazamento de estado.
    },
    [agendar],
  );

  // Unmount do provider: nenhum timer sobrevive.
  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: DUR.fast, ease: EASE_TRUTH }}
              data-testid="toast"
              role={t.variant === 'error' ? 'alert' : undefined}
              onMouseEnter={() => pausar(t.id)}
              onMouseLeave={() => agendar(t.id, t.variant)}
              onFocusCapture={() => pausar(t.id)}
              onBlurCapture={() => agendar(t.id, t.variant)}
              className={`pointer-events-auto rounded-2xl border bg-bg-surface/80 p-4 backdrop-blur-md ${variantClasses[t.variant]}`}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotClasses[t.variant]}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{t.title}</p>
                  {t.description ? (
                    <p className="mt-0.5 text-xs text-muted">{t.description}</p>
                  ) : null}
                  {t.action ? (
                    <button
                      type="button"
                      onClick={() => {
                        t.action!.onClick();
                        dismiss(t.id);
                      }}
                      className="mt-2 inline-flex min-h-10 items-center rounded-lg px-2 py-1 text-sm font-medium text-brand outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-brand/60"
                    >
                      {t.action.label}
                    </button>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={() => dismiss(t.id)}
                  className="-my-2 -mr-2 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
```

- [ ] **Step 5 — verificação.** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/plano-de-acao.spec.ts` → verde (o kanban da G3 usa toast de erro — que agora PERSISTE; o spec não depende do sumiço). Smoke: toast success some em 5s; mouse em cima congela; toast de erro fica até fechar no ✕ (alvo grande).
- [ ] **Step 6 — Commit:**

```bash
git add src/components/ui/toast-store.ts src/components/ui/Toast.tsx tests/unit/toast-store.test.ts
git commit -m "feat(g4): toast v2 - timers com clearTimeout, pausa no hover/focus, erro persistente com role=alert e slot Desfazer"
```

---

### Task 5: Focus rings padronizados + erros de auth no Alert + a11y de formulários e touch targets

**Files:**
- Modify: `src/components/ui/Button.tsx` (variants com FOCUS_RING + danger tokens)
- Modify: `src/components/ui/Alert.tsx` (+ `data-testid` passthrough)
- Modify: `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/sign-up/page.tsx`, `src/app/(auth)/esqueci-senha/page.tsx`, `src/app/(auth)/redefinir-senha/[token]/reset-form.tsx`
- Modify: `src/components/tasks/TaskComments.tsx` (aria-label no textarea)
- Modify: `src/components/ui/Pagination.tsx` (Link + alvos 40px)

**Interfaces:**
- Consumes: `Alert` (role="alert" automático no variant danger); tokens `danger-*`/`success-*` do tailwind; `paginationRange` (`pagination-model.ts`).
- Produces: `Button` com foco visível AA em TODOS os variants (glow do primary vira ADICIONAL ao anel, não substituto); `Alert` aceita `data-testid`.

- [ ] **Step 1 — Button: anel de foco em todos os variants + danger nos tokens.** Em `src/components/ui/Button.tsx`, substituir `variantClasses` por (classes literais — o JIT do Tailwind lê o fonte):

```ts
const FOCUS_RING =
  'focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base';

const FOCUS_RING_DANGER =
  'focus-visible:ring-2 focus-visible:ring-danger/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base';

const variantClasses: Record<ButtonVariant, string> = {
  primary: `bg-brand text-[#04150a] font-semibold hover:shadow-glow focus-visible:shadow-glow ${FOCUS_RING} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none`,
  secondary: `border border-strong bg-white/5 text-white hover:bg-white/10 ${FOCUS_RING} disabled:opacity-50 disabled:cursor-not-allowed`,
  ghost: `text-muted hover:text-white ${FOCUS_RING} disabled:opacity-50 disabled:cursor-not-allowed`,
  danger: `border border-danger-border text-danger-fg hover:bg-danger-tint ${FOCUS_RING_DANGER} disabled:opacity-50 disabled:cursor-not-allowed`,
};
```

*(o primary mantém o glow no foco, mas agora TAMBÉM tem anel — foco distinguível do hover; o danger sai de `red-400/500` cru para os tokens `danger-*` — parte do item 9 da auditoria resolvida aqui, ver decisão 17.)*

- [ ] **Step 2 — Alert com testid.** Em `src/components/ui/Alert.tsx`, adicionar `'data-testid'?: string` à interface e espalhar no div:

```tsx
interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  className?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}

export function Alert({ variant = 'info', title, className = '', children, ...rest }: AlertProps) {
  return (
    <div
      role={variant === 'danger' ? 'alert' : undefined}
      className={`rounded-2xl border px-4 py-3 text-sm ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {title ? <p className="mb-0.5 font-medium">{title}</p> : null}
      {children}
    </div>
  );
}
```

- [ ] **Step 3 — erros de auth migram para o Alert.** Nos 4 arquivos, adicionar `import { Alert } from '@/components/ui/Alert';` e substituir os `<p className="rounded-lg bg-red-500/10 border border-red-500/30 …">` por:
  - `sign-in/page.tsx` e `sign-up/page.tsx`:

```tsx
            {state.error ? <Alert variant="danger">{state.error}</Alert> : null}
```

  - `esqueci-senha/page.tsx` — o erro igual acima E a caixa de sucesso (hoje um `<p>` verde manual) vira:

```tsx
            <Alert variant="success" data-testid="reset-solicitado">
              Se existir uma conta com este e-mail, enviamos as instruções de redefinição.
            </Alert>
```

  - `redefinir-senha/[token]/reset-form.tsx`:

```tsx
            {state.error ? (
              <Alert variant="danger" data-testid="reset-erro">
                {state.error}
              </Alert>
            ) : null}
```

*(role="alert" vem do variant danger; testids `reset-solicitado`/`reset-erro` preservados — o E2E de auth continua verde.)*

- [ ] **Step 4 — textarea de comentário com nome acessível.** Em `src/components/tasks/TaskComments.tsx`, no `<textarea name="corpo" …>`, adicionar o atributo:

```tsx
          aria-label="Escreva um comentário"
```

- [ ] **Step 5 — Pagination: Link + alvos de 40px.** Reescrever `src/components/ui/Pagination.tsx`:

```tsx
import Link from 'next/link';
import React from 'react';

import { paginationRange } from './pagination-model';

interface PaginationProps {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
}

const linkCls =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-lg px-2 font-mono text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60';

export function Pagination({ page, pageCount, hrefFor, className = '' }: PaginationProps) {
  if (pageCount <= 1) return null;
  const items = paginationRange(page, pageCount);
  return (
    <nav aria-label="Paginação" data-testid="pagination" className={className}>
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} aria-label="Página anterior" className={linkCls}>
              ←
            </Link>
          ) : (
            <span className="inline-flex h-10 items-center px-2 text-sm text-white/20">←</span>
          )}
        </li>
        {items.map((item, i) => (
          <li key={`${item}-${i}`}>
            {item === 'gap' ? (
              <span className="inline-flex h-10 items-center px-1.5 text-sm text-dim">…</span>
            ) : item === page ? (
              <span
                aria-current="page"
                className="inline-flex h-10 min-w-10 items-center justify-center rounded-lg bg-brand-glow px-2 font-mono text-sm text-brand"
              >
                {item}
              </span>
            ) : (
              <Link href={hrefFor(item)} className={linkCls}>
                {item}
              </Link>
            )}
          </li>
        ))}
        <li>
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} aria-label="Próxima página" className={linkCls}>
              →
            </Link>
          ) : (
            <span className="inline-flex h-10 items-center px-2 text-sm text-white/20">→</span>
          )}
        </li>
      </ul>
    </nav>
  );
}
```

- [ ] **Step 6 — verificação.** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/auth.spec.ts tests/e2e/admin.spec.ts` → verdes. Smoke com teclado: Tab pelo dashboard — TODO botão tem anel visível (inclusive o primary, distinto do hover); erro de login num Alert com role=alert; paginação do admin com alvos grandes e sem full reload.
- [ ] **Step 7 — Commit:**

```bash
git add src/components/ui/Button.tsx src/components/ui/Alert.tsx src/components/ui/Pagination.tsx src/components/tasks/TaskComments.tsx "src/app/(auth)"
git commit -m "feat(g4): focus ring padrao em todos os variants do Button + erros de auth no Alert do DS + aria e touch targets"
```

---

### Task 6: Admin pt-BR (labels.ts) + tabela DS + nav ativa/por papel + skip-link + Ctrl K + comandos do palette

**Files:**
- Create: `src/lib/labels.ts`
- Create: `src/components/nav-model.ts`
- Modify: `src/modules/notifications/templates.ts` (DRY: `PLANO_LABELS` local → `PLANO_LABEL`)
- Modify: `src/app/admin/client-row.tsx` (TR/TD do DS + labels + Link)
- Modify: `src/app/admin/[orgId]/page.tsx` (labels no header da Task 3)
- Modify: `src/components/app-shell.tsx` (reescrita única: Link + nav ativa + nav por papel + logo por variant + skip-link + atalho por plataforma)
- Modify: `src/components/command-model.ts` (comandos por papel)
- Modify: `tests/e2e/admin.spec.ts` (ÚNICA mudança de spec da fase — justificada abaixo)
- Test: `tests/unit/labels.test.ts` (novo), `tests/unit/nav-model.test.ts` (novo), `tests/unit/command-model.test.ts` (mod)

**Interfaces:**
- Consumes: `OrgStatus`/`Plano` (`user.types.ts`); `Badge`, `TR`/`TD` (`ui/Table.tsx`); `CommandPalette` (Task 1); `NotificationBell` com `verTodasHref` (G3 T12); `signOutAction`; `Logo`.
- Produces:

```ts
// src/lib/labels.ts
export const STATUS_ORG_LABEL: Record<OrgStatus, string>; // Pendente/Ativo/Suspenso
export const PLANO_LABEL: Record<Plano, string>;          // Semanal/Quinzenal/Mensal

// src/components/nav-model.ts (puros)
export type NavItem = { href: string; label: string; badge?: boolean };
export function navItems(variant: 'client' | 'admin' | 'analista'): NavItem[];
export function logoHref(variant: 'client' | 'admin' | 'analista'): string;
/** href ativo = prefixo MAIS LONGO do pathname entre os hrefs da nav (null se nenhum). */
export function hrefAtivo(pathname: string, hrefs: string[]): string | null;
export function atalhoPaletaLabel(userAgent: string): 'Ctrl K' | '⌘ K';
```

- [ ] **Step 1 — testes puros falhando.** Criar `tests/unit/labels.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { PLANO_LABEL, STATUS_ORG_LABEL } from '@/lib/labels';

describe('labels de negócio pt-BR', () => {
  it('status de organização', () => {
    expect(STATUS_ORG_LABEL).toEqual({ pending: 'Pendente', active: 'Ativo', suspended: 'Suspenso' });
  });

  it('planos', () => {
    expect(PLANO_LABEL).toEqual({ weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal' });
  });
});
```

Criar `tests/unit/nav-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { atalhoPaletaLabel, hrefAtivo, logoHref, navItems } from '@/components/nav-model';

describe('navItems — nav por papel', () => {
  it('client vê Dashboard, Conexões e Plano de Ação (com badge)', () => {
    expect(navItems('client')).toEqual([
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/conexoes', label: 'Conexões' },
      { href: '/dashboard/plano-de-acao', label: 'Plano de Ação', badge: true },
    ]);
  });

  it('admin NÃO vê rotas de cliente', () => {
    const hrefs = navItems('admin').map((i) => i.href);
    expect(hrefs).toEqual(['/admin', '/admin/playbooks', '/admin/consultoria']);
    expect(hrefs).not.toContain('/dashboard');
    expect(hrefs).not.toContain('/conexoes');
  });

  it('analista vê só a Carteira', () => {
    expect(navItems('analista')).toEqual([{ href: '/analista', label: 'Carteira' }]);
  });
});

describe('logoHref', () => {
  it('leva cada papel para a sua home', () => {
    expect(logoHref('client')).toBe('/dashboard');
    expect(logoHref('admin')).toBe('/admin');
    expect(logoHref('analista')).toBe('/analista');
  });
});

describe('hrefAtivo — prefixo mais longo', () => {
  const hrefs = ['/dashboard', '/conexoes', '/dashboard/plano-de-acao'];

  it('rota exata', () => {
    expect(hrefAtivo('/dashboard', hrefs)).toBe('/dashboard');
  });

  it('sub-rota ativa o item mais específico (não o Dashboard)', () => {
    expect(hrefAtivo('/dashboard/plano-de-acao/task-1', hrefs)).toBe('/dashboard/plano-de-acao');
  });

  it('sub-rota sem item próprio ativa o pai', () => {
    expect(hrefAtivo('/dashboard/relatorios/abc', hrefs)).toBe('/dashboard');
  });

  it('rota fora da nav → null (nada aceso); prefixo respeita fronteira de segmento', () => {
    expect(hrefAtivo('/aguardando', hrefs)).toBeNull();
    expect(hrefAtivo('/dashboards-fake', hrefs)).toBeNull();
  });
});

describe('atalhoPaletaLabel', () => {
  it('mac/iOS → ⌘ K; resto → Ctrl K', () => {
    expect(atalhoPaletaLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('⌘ K');
    expect(atalhoPaletaLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('⌘ K');
    expect(atalhoPaletaLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('Ctrl K');
    expect(atalhoPaletaLabel('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Ctrl K');
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/labels.test.ts tests/unit/nav-model.test.ts` (FALHA: módulos não existem).
- [ ] **Step 3 — implementar os modelos.** Criar `src/lib/labels.ts`:

```ts
import type { OrgStatus, Plano } from '@/modules/auth/user.types';

/** Labels pt-BR de negócio — fonte única (admin, e-mails, telas). */
export const STATUS_ORG_LABEL: Record<OrgStatus, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  suspended: 'Suspenso',
};

export const PLANO_LABEL: Record<Plano, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};
```

Criar `src/components/nav-model.ts`:

```ts
/** Regras puras da navegação do AppShell — testáveis em node. */

export type NavItem = { href: string; label: string; badge?: boolean };

export function navItems(variant: 'client' | 'admin' | 'analista'): NavItem[] {
  if (variant === 'admin') {
    return [
      { href: '/admin', label: 'Clientes' },
      { href: '/admin/playbooks', label: 'Playbooks' },
      { href: '/admin/consultoria', label: 'Consultoria' },
    ];
  }
  if (variant === 'analista') {
    return [{ href: '/analista', label: 'Carteira' }];
  }
  return [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/conexoes', label: 'Conexões' },
    { href: '/dashboard/plano-de-acao', label: 'Plano de Ação', badge: true },
  ];
}

export function logoHref(variant: 'client' | 'admin' | 'analista'): string {
  if (variant === 'admin') return '/admin';
  if (variant === 'analista') return '/analista';
  return '/dashboard';
}

/**
 * Item ativo da nav: o href que é o prefixo MAIS LONGO do pathname
 * (com fronteira de segmento — '/dashboard' não ativa '/dashboards-fake').
 */
export function hrefAtivo(pathname: string, hrefs: string[]): string | null {
  const matches = hrefs.filter((h) => pathname === h || pathname.startsWith(`${h}/`));
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.length > a.length ? b : a));
}

export function atalhoPaletaLabel(userAgent: string): 'Ctrl K' | '⌘ K' {
  return /Mac|iPhone|iPad|iPod/i.test(userAgent) ? '⌘ K' : 'Ctrl K';
}
```

Rodar: `npm run test -- tests/unit/labels.test.ts tests/unit/nav-model.test.ts` (PASSA).

- [ ] **Step 4 — DRY nos templates de e-mail.** Em `src/modules/notifications/templates.ts`: remover o `const PLANO_LABELS: Record<Plano, string> = { … }` local, adicionar `import { PLANO_LABEL } from '@/lib/labels';` e trocar o uso em `accountActivatedTemplate` para `const planoLabel = PLANO_LABEL[plano] ?? plano;`. Rodar `npm run test -- tests/unit/notification-templates.test.ts` (PASSA — labels idênticos).

- [ ] **Step 5 — ClientRow com TR/TD do DS + labels pt-BR + Link.** Em `src/app/admin/client-row.tsx` (REVALIDAR: G0/T7 mudou a badge Expirada p/ `danger`), adicionar imports:

```tsx
import Link from 'next/link';

import { PLANO_LABEL, STATUS_ORG_LABEL } from '@/lib/labels';
import { TD, TR } from '@/components/ui/Table';
import type { Plano } from '@/modules/auth/user.types';
```

e aplicar estas trocas no JSX (o resto do arquivo fica):
  1. `<tr className="border-b border-line/50 last:border-0" data-testid={...}>` → `<TR data-testid={...}>` (e `</tr>` → `</TR>`).
  2. Cada `<td className="px-4 py-3 ...">` → `<TD>`/`<TD data-testid={...}>` SEM classes de padding próprias — o TD do DS usa `py-2 px-3`, o MESMO do TH: header e células passam a alinhar (era esse o desalinhamento da auditoria). O nome vira `<TD><Link href={'/admin/' + orgId} className="text-white/90 hover:text-brand hover:underline">{name}</Link></TD>`; a célula do plano mantém `font-mono text-muted` via `className`.
  3. Badge de status: `{status}` → `{STATUS_ORG_LABEL[status]}`.
  4. Célula do plano: `{plano ?? '—'}` → `{plano ? (PLANO_LABEL[plano as Plano] ?? plano) : '—'}`.
  5. Erro inline: `text-red-400` → `text-danger-fg`.

Em `src/app/admin/[orgId]/page.tsx` (header da Task 3): `{org.status}` → `{STATUS_ORG_LABEL[org.status]}` e `{org.plano ?? 'sem plano'}` → `{org.plano ? PLANO_LABEL[org.plano] : 'sem plano'}` (com import de `@/lib/labels`).

- [ ] **Step 6 — fix JUSTIFICADO do spec E2E.** Em `tests/e2e/admin.spec.ts` (linha ~46), trocar:

```ts
    await expect(row.getByText('active')).toBeVisible();
```

por

```ts
    await expect(row.getByText('Ativo')).toBeVisible();
```

**Justificativa (exigida pelas Global Constraints):** o spec assertava o label EN cru — exatamente o bug P2 "labels em inglês no admin" que esta task corrige. A semântica (org ativada aparece como ativa na linha) é preservada; só a copy exibida muda, por decisão de produto (pt-BR).

- [ ] **Step 7 — AppShell: reescrita única.** Reescrever `src/components/app-shell.tsx` (REVALIDAR contra o master: G2/T8 removeu o `px-4` do wrapper de conteúdo — manter as classes do master no wrapper e só ADICIONAR `id`/`tabIndex`; G3/T12 passa `verTodasHref` ao Bell — PRESERVAR). Pontos obrigatórios: skip-link como PRIMEIRO elemento focável; logo por variant; nav por papel via `navItems`; `aria-current="page"` + destaque no ativo; badge `nav-plano-badge` preservada; atalho por plataforma; `Link` em tudo; menu mobile espelha a nav:

```tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { signOutAction } from '@/actions/auth.actions';
import { CommandPalette } from '@/components/command-palette';
import { atalhoPaletaLabel, hrefAtivo, logoHref, navItems } from '@/components/nav-model';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from '@/components/ui/Logo';

interface AppShellProps {
  children: React.ReactNode;
  variant?: 'client' | 'admin' | 'analista';
  planoDeAcaoCount?: number;
}

export function AppShell({ children, variant = 'client', planoDeAcaoCount = 0 }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [atalho, setAtalho] = useState('Ctrl K');
  const pathname = usePathname();

  const itens = navItems(variant);
  const ativo = hrefAtivo(pathname ?? '', itens.map((i) => i.href));
  const verTodasHref = variant === 'client' ? '/dashboard/notificacoes' : undefined;

  useEffect(() => setAtalho(atalhoPaletaLabel(navigator.userAgent)), []);

  function navLinkCls(href: string, mobile = false) {
    return `rounded-lg px-3 ${mobile ? 'py-2' : 'py-1.5'} text-sm outline-none transition-colors duration-200 ease-truth focus-visible:ring-2 focus-visible:ring-brand/60 ${
      ativo === href ? 'bg-brand-glow text-white' : 'text-muted hover:bg-white/5 hover:text-white'
    }`;
  }

  function badgePlano(item: { badge?: boolean }) {
    if (!item.badge || planoDeAcaoCount <= 0) return null;
    return (
      <span
        data-testid="nav-plano-badge"
        className="inline-flex items-center justify-center rounded-full bg-brand px-1.5 py-0.5 font-mono text-[10px] text-[#04150a]"
      >
        {planoDeAcaoCount}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Skip-link: primeiro elemento focável de qualquer página logada */}
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-bg-elevated focus:px-4 focus:py-2 focus:text-sm focus:text-white focus:ring-2 focus:ring-brand/60"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bg-surface/80 backdrop-blur-sm">
        <nav aria-label="Principal" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href={logoHref(variant)}
            aria-label="Truth Analytics — ir ao início"
            className="flex-shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <Logo size="sm" />
          </Link>

          <div className="hidden items-center gap-1 sm:flex">
            {itens.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo === item.href ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 ${navLinkCls(item.href)}`}
              >
                {item.label}
                {badgePlano(item)}
              </Link>
            ))}
          </div>

          <button
            type="button"
            aria-label={`Abrir comandos (${atalho})`}
            onClick={() =>
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
            }
            className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[10px] text-dim outline-none transition-colors duration-200 ease-truth hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60 sm:flex"
          >
            {atalho}
          </button>

          <div className="hidden sm:block">
            <NotificationBell verTodasHref={verTodasHref} />
          </div>

          <form action={signOutAction} className="hidden sm:block">
            <button
              type="submit"
              className="rounded-full px-4 py-1.5 text-sm text-muted outline-none transition-colors duration-200 ease-truth hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              Sair
            </button>
          </form>

          <button
            type="button"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex sm:hidden flex-col items-center justify-center gap-1.5 rounded-lg p-2 text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <span className={`block h-0.5 w-5 bg-current transition-transform duration-200 ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition-transform duration-200 ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
          </button>
        </nav>

        {menuOpen && (
          <div id="mobile-nav" className="border-t border-line bg-bg-surface/95 px-4 py-3 sm:hidden">
            <div className="mb-2 flex justify-end">
              <NotificationBell verTodasHref={verTodasHref} />
            </div>
            <div className="flex flex-col gap-1">
              {itens.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={ativo === item.href ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`inline-flex items-center gap-1.5 ${navLinkCls(item.href, true)}`}
                >
                  {item.label}
                  {badgePlano(item)}
                </Link>
              ))}
              <div className="mt-1 border-t border-line pt-2">
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60"
                  >
                    Sair
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Alvo do skip-link — cada página fornece o <main> landmark */}
      <div id="conteudo" tabIndex={-1} className="py-8 outline-none">
        {children}
      </div>

      <CommandPalette variant={variant} />
    </div>
  );
}
```

- [ ] **Step 8 — comandos do palette por papel (teste primeiro).** SUBSTITUIR o conteúdo de `tests/unit/command-model.test.ts` por:

```ts
import { describe, expect, it } from 'vitest';

import { buildCommands } from '@/components/command-model';

describe('buildCommands', () => {
  it('client: navegação completa (Plano de Ação incluso) + ações (comparar incluso)', () => {
    const cmds = buildCommands('client');
    expect(cmds.map((c) => c.id)).toEqual([
      'nav-dashboard',
      'nav-conexoes',
      'nav-plano-de-acao',
      'acao-gerar-relatorio',
      'acao-adicionar-produto',
      'acao-comparar-periodos',
    ]);
    expect(cmds.find((c) => c.id === 'nav-plano-de-acao')).toMatchObject({
      label: 'Ir para o Plano de Ação',
      href: '/dashboard/plano-de-acao',
      group: 'Navegação',
    });
    expect(cmds.find((c) => c.id === 'acao-comparar-periodos')).toMatchObject({
      label: 'Comparar períodos',
      href: '/dashboard/relatorios/comparar',
      group: 'Ações',
    });
  });

  it('admin: só navegação do papel admin (sem rotas nem ações de cliente)', () => {
    const cmds = buildCommands('admin');
    expect(cmds.map((c) => c.id)).toEqual(['nav-admin', 'nav-playbooks', 'nav-consultoria']);
    expect(cmds.every((c) => c.group === 'Navegação')).toBe(true);
  });

  it('analista: só a navegação da carteira', () => {
    const cmds = buildCommands('analista');
    expect(cmds).toEqual([
      { id: 'nav-analista', label: 'Ir para a Carteira', group: 'Navegação', href: '/analista', keywords: 'clientes tasks kanban revisão' },
    ]);
  });
});
```

Rodar `npm run test -- tests/unit/command-model.test.ts` (FALHA). Implementar — SUBSTITUIR `buildCommands` em `src/components/command-model.ts` (tipo `CommandItem` fica):

```ts
/**
 * Comandos do ⌘K por papel (pura). Coerente com a nav por papel do shell:
 * admin/analista não recebem rotas nem ações de cliente.
 */
export function buildCommands(variant: 'client' | 'admin' | 'analista'): CommandItem[] {
  if (variant === 'analista') {
    return [{ id: 'nav-analista', label: 'Ir para a Carteira', group: 'Navegação', href: '/analista', keywords: 'clientes tasks kanban revisão' }];
  }

  if (variant === 'admin') {
    return [
      { id: 'nav-admin', label: 'Ir para Clientes', group: 'Navegação', href: '/admin', keywords: 'clientes orgs' },
      { id: 'nav-playbooks', label: 'Ir para Playbooks', group: 'Navegação', href: '/admin/playbooks', keywords: 'templates tasks' },
      { id: 'nav-consultoria', label: 'Ir para Consultoria', group: 'Navegação', href: '/admin/consultoria', keywords: 'métricas analistas' },
    ];
  }

  return [
    { id: 'nav-dashboard', label: 'Ir para o Dashboard', group: 'Navegação', href: '/dashboard' },
    { id: 'nav-conexoes', label: 'Ir para Conexões', group: 'Navegação', href: '/conexoes', keywords: 'bling produtos' },
    { id: 'nav-plano-de-acao', label: 'Ir para o Plano de Ação', group: 'Navegação', href: '/dashboard/plano-de-acao', keywords: 'tasks tarefas kanban consultoria' },
    { id: 'acao-gerar-relatorio', label: 'Gerar relatório', group: 'Ações', href: '/dashboard#gerar-relatorio', keywords: 'análise ia relatório novo' },
    { id: 'acao-adicionar-produto', label: 'Adicionar produto monitorado', group: 'Ações', href: '/conexoes#produtos-monitorados', keywords: 'sku keywords monitorar' },
    { id: 'acao-comparar-periodos', label: 'Comparar períodos', group: 'Ações', href: '/dashboard/relatorios/comparar', keywords: 'relatórios comparação evolução' },
  ];
}
```

Rodar de novo (PASSA).

- [ ] **Step 9 — verificação.** `npm run test` + `npm run typecheck` verdes. `npx playwright test` → **verde** (incluindo o admin.spec com 'Ativo'). Smoke: logado como analista, a nav mostra SÓ Carteira e o logo leva a /analista; como cliente, o item da rota atual fica aceso com `aria-current`; no Windows o botão mostra "Ctrl K"; ⌘K do cliente tem "Ir para o Plano de Ação" e "Comparar períodos"; Tab na página → 1º stop é "Pular para o conteúdo".
- [ ] **Step 10 — Commits (dois, escopos distintos):**

```bash
git add src/lib/labels.ts src/modules/notifications/templates.ts src/app/admin/client-row.tsx "src/app/admin/[orgId]/page.tsx" tests/unit/labels.test.ts tests/e2e/admin.spec.ts
git commit -m "feat(g4): labels pt-BR de status/plano no admin + tabela alinhada com TR/TD do DS (spec admin ajustado: active -> Ativo)"
git add src/components/nav-model.ts src/components/app-shell.tsx src/components/command-model.ts tests/unit/nav-model.test.ts tests/unit/command-model.test.ts
git commit -m "feat(g4): nav por papel com aria-current + skip-link + atalho por plataforma + comandos do palette por papel"
```

---

### Task 7: Identidade em movimento — ease-truth nos primitivos, hover-lift no Card, ScoreGauge animado

**Files:**
- Modify: `src/components/ui/Button.tsx` (linha de transição)
- Modify: `src/components/ui/Card.tsx` (hover-lift + prop `lift`)
- Modify: `src/components/ui/Tabs.tsx` (ease-truth)
- Modify: `src/components/ui/charts/chart-theme.ts` (+ `corDoScore` com tokens)
- Modify: `src/components/ui/charts/ScoreGauge.tsx` (arco/número animados 0→score)
- Test: `tests/unit/cor-do-score.test.ts` (novo)

**Interfaces:**
- Consumes: `useCountUp(target, durationS)` (`src/lib/motion.ts` — já devolve o alvo direto sob reduced-motion); token `ease-truth` do tailwind (definido e nunca usado — passa a ser usado); tokens `warning`/`danger`.
- Produces:

```ts
// chart-theme.ts
/** Cor do arco por faixa de score — brand ≥70, warning ≥40, danger <40 (tokens). */
export function corDoScore(score: number): string;
```

- [ ] **Step 1 — teste puro falhando.** Criar `tests/unit/cor-do-score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { corDoScore } from '@/components/ui/charts/chart-theme';

describe('corDoScore — faixas e tokens', () => {
  it('≥70 → brand', () => {
    expect(corDoScore(70)).toBe('#07dd2b');
    expect(corDoScore(100)).toBe('#07dd2b');
  });

  it('40–69 → warning.DEFAULT (não mais #eab308 fora do token)', () => {
    expect(corDoScore(40)).toBe('#f59e0b');
    expect(corDoScore(69)).toBe('#f59e0b');
  });

  it('<40 → danger.DEFAULT', () => {
    expect(corDoScore(39)).toBe('#ef4444');
    expect(corDoScore(0)).toBe('#ef4444');
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/cor-do-score.test.ts` (FALHA: `corDoScore` não existe).
- [ ] **Step 3 — implementar em `chart-theme.ts`** (adicionar ao final do arquivo):

```ts
/**
 * Cor do arco do Truth Score por faixa — alinhada aos tokens do tailwind
 * (brand / warning.DEFAULT / danger.DEFAULT). O #eab308 fora de token morreu aqui.
 */
export function corDoScore(score: number): string {
  if (score >= 70) return '#07dd2b';
  if (score >= 40) return '#f59e0b';
  return '#ef4444';
}
```

Rodar: `npm run test -- tests/unit/cor-do-score.test.ts` (PASSA).

- [ ] **Step 4 — ScoreGauge animado.** Reescrever `src/components/ui/charts/ScoreGauge.tsx` — número e arco sobem juntos 0→score via `useCountUp` (recharts com `isAnimationActive={false}`: quem anima é o nosso valor; reduced-motion → valor cheio instantâneo):

```tsx
'use client';

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

import { useCountUp } from '@/lib/motion';

import { corDoScore } from './chart-theme';

export function ScoreGauge({ score, size = 180 }: { score: number; size?: number }) {
  const valor = Math.round(useCountUp(score, 1.1));
  const cor = corDoScore(score);
  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      data-testid="score-gauge"
      role="img"
      aria-label={`Truth Score ${score} de 100`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="78%"
          outerRadius="100%"
          data={[{ value: valor }]}
          startAngle={225}
          endAngle={-45}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar
            dataKey="value"
            angleAxisId={0}
            fill={cor}
            background={{ fill: '#ffffff0f' }}
            cornerRadius={8}
            isAnimationActive={false}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-mono text-4xl font-bold text-white" style={{ textShadow: `0 0 24px ${cor}66` }}>
          {valor}
        </span>
        <span className="text-xs text-muted">/ 100</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5 — ease-truth nos primitivos.**
  - `Button.tsx`: na string `base`, trocar `transition-all duration-150` por `transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 ease-truth`.
  - `Card.tsx`: adicionar hover-lift com opt-out (prop `lift`, default `true`; usar `lift={false}` onde o lift atrapalhar — ex.: cards-tabela `!p-0` podem manter, o translate é sutil):

```tsx
interface CardProps {
  className?: string;
  children?: React.ReactNode;
  id?: string;
  'data-testid'?: string;
}

export function Card({ className = '', children, lift = true, ...rest }: CardProps & { lift?: boolean }) {
  return (
    <div
      className={`bg-bg-surface border border-line rounded-2xl p-5 transition-[transform,border-color,box-shadow] duration-200 ease-truth ${
        lift ? 'hover:-translate-y-0.5 hover:border-white/20' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
```

  *(CardHeader/CardTitle/CardContent ficam como estão.)*
  - `Tabs.tsx`: no className dos botões de tab, trocar `transition-colors` por `transition-colors duration-200 ease-truth`.

- [ ] **Step 6 — verificação.** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/dashboard.spec.ts` → verde (`score-gauge` preservado). Smoke: abrir um relatório com score — o arco e o número sobem juntos até o valor com o easing da casa; com reduced-motion, aparecem cheios; hover em qualquer Card dá o lift sutil; foco/hover de botões e tabs com a curva `ease-truth`.
- [ ] **Step 7 — Commit:**

```bash
git add src/components/ui/Button.tsx src/components/ui/Card.tsx src/components/ui/Tabs.tsx src/components/ui/charts/chart-theme.ts src/components/ui/charts/ScoreGauge.tsx tests/unit/cor-do-score.test.ts
git commit -m "feat(g4): ease-truth nos primitivos + hover-lift no Card + ScoreGauge com arco animado 0-score (tokens de cor)"
```

---

### Task 8: Landing cinematográfica + metadata por página

**Files:**
- Create: `src/app/landing-stats.tsx`, `src/app/landing-marquee.tsx`, `src/app/landing-mock.tsx`
- Modify: `src/app/page.tsx` (landing v2)
- Modify: `src/app/layout.tsx` (title template)
- Create: `src/app/(auth)/sign-in/sign-in-form.tsx`, `src/app/(auth)/sign-up/sign-up-form.tsx`, `src/app/(auth)/esqueci-senha/esqueci-senha-form.tsx` (split client p/ metadata)
- Modify: `src/app/(auth)/sign-in/page.tsx`, `sign-up/page.tsx`, `esqueci-senha/page.tsx` (viram server + metadata), `redefinir-senha/[token]/page.tsx` (+ metadata)
- Modify (só `export const metadata` / `generateMetadata`): `src/app/(client)/dashboard/page.tsx`, `conexoes/page.tsx`, `dashboard/plano-de-acao/page.tsx`, `dashboard/relatorios/comparar/page.tsx`, `dashboard/notificacoes/page.tsx`, `dashboard/relatorios/[id]/page.tsx`, `(client)/aguardando/page.tsx`, `admin/page.tsx`, `admin/[orgId]/page.tsx`, `admin/playbooks/page.tsx`, `admin/consultoria/page.tsx`, `analista/page.tsx`, `analista/[orgId]/page.tsx`

**Interfaces:**
- Consumes: `useCountUp` (`src/lib/motion.ts`); `animate-marquee` + `shadow-glow-3` (tailwind — existentes e sem uso); `Reveal` (Task 3); `getReportById`/`requireActiveOrg`/`formatPeriodo`; `getOrganizationById` (admin.repository).
- Produces: `LandingStats`, `LandingMarquee`, `LandingMock` (componentes locais da landing); títulos por rota via template `%s — Truth Analytics`.

**Copy travada da landing (honesta — números verificáveis no produto):** count-up de `100` ("Truth Score — sua loja avaliada de 0 a 100"), `3` ("passos até a primeira análise"), `1` ("minuto para conectar o Bling"). Marquee: canais que chegam pelo Bling — "Mercado Livre · Shopee · Amazon · Magalu · Americanas · Casas Bahia · Shein · Loja própria" com a legenda "Vendas de todos os canais do seu Bling, num só relatório". NENHUMA métrica inventada de clientes/receita.

- [ ] **Step 1 — title template no root.** Em `src/app/layout.tsx`:

```ts
export const metadata: Metadata = {
  title: {
    default: 'Truth Analytics',
    template: '%s — Truth Analytics',
  },
  description: 'Inteligência de marketplace por IA para o seu e-commerce.',
};
```

- [ ] **Step 2 — split das páginas de auth (client → server + form).** Para cada uma das 3 páginas `'use client'`:
  1. Criar `src/app/(auth)/sign-in/sign-in-form.tsx` com o CONTEÚDO ATUAL INTEIRO de `sign-in/page.tsx`, trocando apenas `export default function SignInPage()` por `export function SignInForm()`.
  2. Substituir `sign-in/page.tsx` por:

```tsx
import type { Metadata } from 'next';

import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Entrar' };

export default function SignInPage() {
  return <SignInForm />;
}
```

  3. Repetir para `sign-up` (`SignUpForm`, title `'Criar conta'`) e `esqueci-senha` (`EsqueciSenhaForm`, title `'Esqueci minha senha'`). Em `redefinir-senha/[token]/page.tsx` (já server), adicionar `export const metadata: Metadata = { title: 'Redefinir senha' };`.

  `npm run typecheck` + `npx playwright test tests/e2e/auth.spec.ts` (verde — mesmos testids, mesma árvore).

- [ ] **Step 3 — metadata nas rotas server.** Adicionar em cada página (com `import type { Metadata } from 'next';`):
  - `dashboard/page.tsx`: `export const metadata: Metadata = { title: 'Dashboard' };`
  - `conexoes/page.tsx`: `{ title: 'Conexões' }` · `plano-de-acao/page.tsx`: `{ title: 'Plano de Ação' }` · `comparar/page.tsx`: `{ title: 'Comparar períodos' }` · `notificacoes/page.tsx` (G3): `{ title: 'Notificações' }` · `aguardando/page.tsx`: `{ title: 'Conta em análise' }` · `admin/page.tsx`: `{ title: 'Admin · Clientes' }` · `playbooks/page.tsx`: `{ title: 'Playbooks' }` · `consultoria/page.tsx`: `{ title: 'Consultoria' }` · `analista/page.tsx`: `{ title: 'Carteira' }`
  - `dashboard/relatorios/[id]/page.tsx` (dinâmico):

```tsx
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const access = await requireActiveOrg();
  const rel = await getReportById(params.id, access.orgId);
  if (!rel) return { title: 'Relatório' };
  return { title: `Relatório ${formatPeriodo(rel.periodoInicio, rel.periodoFim)}` };
}
```

  *(imports já existem na página; o report é buscado 2× — page + metadata — custo aceito: query por PK, e o Next roda ambos na mesma renderização.)*
  - `admin/[orgId]/page.tsx` e `analista/[orgId]/page.tsx` (dinâmicos, mesmo padrão):

```tsx
export async function generateMetadata({ params }: { params: { orgId: string } }): Promise<Metadata> {
  const org = await getOrganizationById(params.orgId);
  return { title: org ? `${org.name} · Cliente` : 'Cliente' };
}
```

  *(no analista, `getOrganizationById` já é importado pela página? REVALIDAR — se a página usa outro repositório para carregar a org, usar o MESMO helper dela no generateMetadata; nunca criar query nova sem escopo. Como `generateMetadata` roda após o middleware de auth e a page em si já valida acesso/carteira antes de renderizar, expor apenas o NOME no `<title>` de uma rota protegida é aceitável.)*
  - Landing `src/app/page.tsx`: título absoluto (não usa o template):

```tsx
export const metadata: Metadata = {
  title: { absolute: 'Truth Analytics — Inteligência de marketplace por IA' },
  description:
    'Relatórios periódicos gerados por IA a partir do seu Bling: métricas de vendas, benchmark de mercado e recomendações de preço.',
};
```

- [ ] **Step 4 — blocos da landing.** Criar `src/app/landing-stats.tsx`:

```tsx
'use client';

import { useCountUp } from '@/lib/motion';

const METRICAS = [
  { alvo: 100, label: 'Truth Score — sua loja avaliada de 0 a 100' },
  { alvo: 3, label: 'passos até a primeira análise' },
  { alvo: 1, label: 'minuto para conectar o Bling' },
] as const;

function StatCountUp({ alvo, label }: { alvo: number; label: string }) {
  const valor = Math.round(useCountUp(alvo, 1.2));
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="font-mono text-4xl font-bold text-brand">{valor}</span>
      <span className="max-w-[16rem] text-sm text-muted">{label}</span>
    </div>
  );
}

/** Faixa de números do produto (count-up real — nada inventado). */
export function LandingStats() {
  return (
    <div className="grid gap-8 sm:grid-cols-3">
      {METRICAS.map((m) => (
        <StatCountUp key={m.label} alvo={m.alvo} label={m.label} />
      ))}
    </div>
  );
}
```

Criar `src/app/landing-marquee.tsx` (usa o keyframe `marquee` existente; conteúdo duplicado para o loop de -50%; pausa no hover; estático sob reduced-motion — WCAG 2.2.2):

```tsx
const CANAIS = [
  'Mercado Livre',
  'Shopee',
  'Amazon',
  'Magalu',
  'Americanas',
  'Casas Bahia',
  'Shein',
  'Loja própria',
];

function Faixa({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <ul
      aria-hidden={ariaHidden || undefined}
      className="flex flex-none items-center gap-10 pr-10"
    >
      {CANAIS.map((c) => (
        <li key={c} className="whitespace-nowrap font-mono text-sm uppercase tracking-widest text-dim">
          {c}
        </li>
      ))}
    </ul>
  );
}

/** Marquee dos canais (via Bling). Pausa no hover; reduced-motion = estático. */
export function LandingMarquee() {
  return (
    <section aria-label="Canais de venda compatíveis via Bling" className="space-y-3">
      <p className="text-center text-xs text-dim">
        Vendas de todos os canais do seu Bling, num só relatório
      </p>
      <div className="group relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div className="flex w-max motion-safe:animate-marquee motion-safe:group-hover:[animation-play-state:paused] motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center">
          <Faixa />
          <div className="motion-reduce:hidden flex">
            <Faixa ariaHidden />
          </div>
        </div>
      </div>
    </section>
  );
}
```

Criar `src/app/landing-mock.tsx` (mock 100% CSS/SVG do dashboard — decorativo, em moldura com `shadow-glow-3`):

```tsx
/** Composição CSS que evoca o dashboard (decorativa — sem screenshot). */
export function LandingMock() {
  const barras = [42, 68, 55, 80, 62, 90, 74];
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none mx-auto w-full max-w-3xl select-none rounded-2xl border border-strong bg-bg-surface p-4 shadow-glow-3 sm:p-6"
    >
      <div className="mb-4 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand/60" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-bg-elevated p-4 sm:col-span-2">
          <div className="mb-2 h-2 w-24 rounded bg-white/10" />
          <div className="flex h-28 items-end gap-2">
            {barras.map((h, i) => (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className={`flex-1 rounded-t ${i === barras.length - 2 ? 'bg-brand' : 'bg-brand/30'}`}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-line bg-bg-elevated p-4">
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full"
            style={{ background: 'conic-gradient(#07dd2b 0% 76%, rgba(255,255,255,0.06) 76% 100%)' }}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-bg-elevated font-mono text-xl font-bold text-white">
              76
            </div>
          </div>
          <div className="h-2 w-16 rounded bg-white/10" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <div className="h-6 w-28 rounded-full bg-brand-glow" />
        <div className="h-6 w-20 rounded-full bg-white/5" />
        <div className="h-6 w-24 rounded-full bg-white/5" />
      </div>
    </div>
  );
}
```

- [ ] **Step 5 — montar a landing v2.** Em `src/app/page.tsx`, manter header/hero/steps/footer atuais e: (a) adicionar `className="shadow-glow-3"` ao Button primário "Começar gratuitamente" do hero; (b) inserir APÓS a section do hero:

```tsx
      {/* ── Números do produto ── */}
      <section className="relative z-10 mx-auto max-w-4xl px-4 pb-16 sm:px-6">
        <LandingStats />
      </section>

      {/* ── Mock do dashboard ── */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <LandingMock />
      </section>

      {/* ── Canais ── */}
      <section className="relative z-10 mx-auto max-w-5xl px-4 pb-20 sm:px-6">
        <LandingMarquee />
      </section>
```

com os imports `import { LandingStats } from './landing-stats';` etc. (c) O bloco "Como funciona" fica após os canais.

- [ ] **Step 6 — verificação.** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/auth.spec.ts` → verde. Smoke: aba do navegador mostra "Entrar — Truth Analytics", "Dashboard — Truth Analytics", "Relatório 06/07/2026 – 12/07/2026 — Truth Analytics"; na landing os números sobem, o marquee desliza e PAUSA no hover; com reduced-motion o marquee vira lista estática e os números aparecem cheios; CTA com glow em 3 camadas.
- [ ] **Step 7 — Commit:**

```bash
git add -A
git commit -m "feat(g4): landing cinematografica (count-up honesto, mock CSS com glow-3, marquee com pausa) + metadata por pagina"
```

---

### Task 9: Higiene de tokens — dim rebaixado, vermelhos unificados, Tooltip/Dropdown removidos

**Files:**
- Modify: `tailwind.config.ts` (`dim: '#8b8b94'`)
- Modify: arquivos apontados pela varredura de vermelhos (conhecidos hoje: `src/app/admin/[orgId]/atribuir-analista.tsx`, `src/app/admin/playbooks/playbooks-manager.tsx`; re-grep no master pós-G1/G2/G3 para `truth-score-card`/`comparar`)
- Delete: `src/components/ui/Tooltip.tsx`, `src/components/ui/Dropdown.tsx`

**Interfaces:**
- Consumes: tokens `danger-*`; `LineChart` pós-G2 (`srSummary` — só verificação).
- Produces: hierarquia `muted` (#a1a1aa) > `dim` (#8b8b94) restaurada; zero `red-400/red-500` fora de token no `src/`.

- [ ] **Step 1 — rebaixar o dim (com prova de contraste).** Em `tailwind.config.ts`:

```ts
        muted: '#a1a1aa',
        // Hierarquia tipográfica de 2 níveis: muted (corpo secundário) > dim
        // (metadados). Contraste do #8b8b94 verificado (WCAG AA ≥ 4.5:1):
        // 6.0:1 sobre bg-base #040507 · 5.8:1 sobre bg-surface #0a0c10 ·
        // 5.7:1 sobre bg-elevated #0d0d10.
        dim: '#8b8b94',
```

- [ ] **Step 2 — auditar os usos reais do dim.** Rodar:

```bash
grep -rn --include="*.tsx" "text-dim\|placeholder:text-dim" src | awk -F: '{print $1}' | sort -u
```

Conferir que TODOS os arquivos listados usam `dim` sobre `bg-base`/`bg-surface`/`bg-elevated`/overlays escuros (verificado no branch atual: kbd do palette, timestamps do sino/dashboard, keywords do admin, footer da landing, gaps da paginação — todos escuros). Uso sobre fundo claro (não deve existir) = trocar para `text-muted` e anotar no commit.

- [ ] **Step 3 — varredura dos vermelhos fora de token.** Rodar:

```bash
grep -rn --include="*.tsx" --include="*.ts" "red-400\|red-500\|#eab308" src
```

Para cada hit (excluindo os já resolvidos nas Tasks 5/6/7), aplicar o mapa: `text-red-400` → `text-danger-fg` · `bg-red-500/10` → `bg-danger-tint` · `border-red-500/30`/`40` → `border-danger-border` · `ring-red-500/50` → `ring-danger/60`. Hits conhecidos no branch base: `atribuir-analista.tsx:43` e `playbooks-manager.tsx:119` (spans de erro → `text-danger-fg`); re-grep pega o que G1 (comparar `DeltaBadge`) e G2 (`truth-score-card`) tiverem deixado. Ao final o grep deve devolver ZERO hits em `src/`.

- [ ] **Step 4 — verificação do contrato da G2 no LineChart.** Abrir `src/components/ui/charts/LineChart.tsx` e CONFIRMAR as props `srSummary?: string` e `formatTooltip?` (contrato G2/T8). Se existirem: nada a fazer (item da auditoria já coberto — ver divergência 1). Se NÃO existirem (drift do plano G2): adicionar `srSummary?: string` à interface e, antes do fechamento do wrapper, `{srSummary ? <p className="sr-only">{srSummary}</p> : null}` (molde do DonutChart linhas 51–53), anotando o drift no commit.

- [ ] **Step 5 — remover Tooltip e Dropdown (decisão 11).** Provar que são órfãos e deletar:

```bash
grep -rn --include="*.tsx" --include="*.ts" "ui/Tooltip\|ui/Dropdown" src tests
git rm src/components/ui/Tooltip.tsx src/components/ui/Dropdown.tsx
```

(o grep deve devolver ZERO antes do `git rm`; se a G1–G3 tiver adotado algum deles — improvável, nenhum plano os referencia — PARAR e reavaliar a decisão com o hit encontrado). Justificativa no commit: zero consumidores; o sino evoluiu popover próprio (G3/T12 + G4/T1); Tooltip CSS-only viola WCAG 1.4.13.

- [ ] **Step 6 — verificação.** `npm run test` + `npm run typecheck` verdes. `npx playwright test` → verde. Smoke: metadados (timestamps, kbd, keywords) ainda legíveis porém visivelmente mais quietos que o texto `muted`.
- [ ] **Step 7 — Commit:**

```bash
git add -A
git commit -m "fix(g4): dim rebaixado p/ #8b8b94 (AA verificado) + vermelhos unificados nos tokens danger + remocao de Tooltip/Dropdown orfaos"
```

---

### Task 10: Micro-fixes de engenharia + LazyMotion + charts dinâmicos

**Files:**
- Modify: `src/modules/alerts/alert-detectors.ts` (brl com milhar via formatBRL + data pt-BR)
- Modify: `src/modules/notifications/templates.ts` (escapeHtml no pipelineFailedTemplate)
- Modify: `src/modules/admin/admin.repository.ts` + `src/actions/admin.actions.ts` (23505 amigável)
- Modify: `src/modules/tasks/task.repository.ts` + `src/actions/tasks.actions.ts` (toggle atômico)
- Modify: `src/app/(client)/aguardando/page.tsx` (redirects + copy suspensa)
- Modify: `src/app/api/reports/[id]/pdf/route.ts` (content-type explícito no 404)
- Modify: `src/components/motion-provider.tsx` (LazyMotion strict) + varredura `motion.` → `m.`
- Modify: `src/app/(client)/dashboard/dashboard-charts.tsx` (next/dynamic ssr:false)
- Test: `tests/unit/alert-detectors.test.ts` (mod), `tests/unit/notification-templates.test.ts` (mod), `tests/integration/requeue-conflito.test.ts` (novo), `tests/integration/checklist-toggle-tx.test.ts` (novo)

**Interfaces:**
- Consumes: `formatBRL`/`formatData` (`src/lib/format.ts`); `escapeHtml` (templates.ts); `toggleChecklistLine` (`checklist-line.ts`); `recordTaskActivity`; padrão de detecção 23505 da casa (`'code' in e`, ver `report.repository.ts:176`); `LazyMotion`/`m`/`domAnimation` (framer 11).
- Produces:

```ts
// admin.repository.ts — MESMA assinatura; agora lança 'relatorio_em_andamento' no 23505
export async function requeueFailedReport(input: { reportId: string; actorUserId: string }): Promise<{ orgId: string } | null>;

// task.repository.ts
/** Toggle atômico do item de checklist: transação + SELECT ... FOR UPDATE serializa
 *  toggles concorrentes (o read-modify-write antigo perdia updates). true = mudou. */
export async function toggleChecklistItemTx(input: {
  taskId: string;
  orgId: string;
  index: number;
  actorUserId: string | null;
}): Promise<boolean>;
```

- [ ] **Step 1 — testes unit falhando (brl + escapeHtml).** Em `tests/unit/alert-detectors.test.ts`, ADICIONAR:

```ts
import { formatBRL } from '@/lib/format';

describe('formatação pt-BR dos corpos de alerta (G4)', () => {
  it('queda de vendas usa separador de milhar', () => {
    const a = detectarQuedaVendas({
      total7dias: 1234.5,
      totaisSemanasAnteriores: [10000, 10000, 10000, 10000],
    });
    expect(a).not.toBeNull();
    expect(a!.corpo).toContain(formatBRL(1234.5)); // "R$ 1.234,50" (com NBSP do Intl)
    expect(a!.corpo).toContain(formatBRL(10000));
  });

  it('produto parado exibe a última venda em dd/mm/aaaa (não ISO)', () => {
    const ultima = new Date('2026-06-20T12:00:00Z');
    const [a] = detectarProdutoParado(
      [{ sku: 'SKU1', nome: 'Caneca' }],
      new Map([['SKU1', ultima]]),
      new Date('2026-07-14T12:00:00Z'),
    );
    expect(a!.corpo).not.toContain('2026-06-20');
    expect(a!.corpo).toContain('20/06/2026');
  });
});
```

Em `tests/unit/notification-templates.test.ts`, ADICIONAR:

```ts
describe('pipelineFailedTemplate escapa HTML (G4)', () => {
  it('erro com markup não injeta tag no html', () => {
    const { html } = pipelineFailedTemplate('org-1', 'rep-1', '<script>alert(1)</script> & "x"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp; &quot;x&quot;');
  });
});
```

Rodar: `npm run test -- tests/unit/alert-detectors.test.ts tests/unit/notification-templates.test.ts` (FALHA).

- [ ] **Step 2 — implementar brl/data + escapeHtml.** Em `src/modules/alerts/alert-detectors.ts`: adicionar `import { formatBRL, formatData } from '@/lib/format';`, trocar o helper local por

```ts
function brl(n: number): string {
  return formatBRL(n);
}
```

e em `detectarProdutoParado` trocar `desde ${ultima.toISOString().slice(0, 10)}` por `desde ${formatData(ultima)}`. Em `src/modules/notifications/templates.ts`, no `pipelineFailedTemplate`, trocar as interpolações do html por `${escapeHtml(orgId)}`, `${escapeHtml(reportId)}`, `${escapeHtml(erro)}`. Rodar os dois testes (PASSAM). Se algum teste ANTIGO de alert-detectors asserir o formato sem milhar (`R$ 1234,50`), atualizar a expectativa para `formatBRL(...)` — regra determinística, anotar no commit.

- [ ] **Step 3 — teste de integração do requeue falhando.** Criar `tests/integration/requeue-conflito.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { audit_log, organizations, reports } from '@/db/schema';
import { requeueFailedReport } from '@/modules/admin/admin.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-requeue-';
const DIA = 86_400_000;

describe.skipIf(!url)('requeueFailedReport — corrida com o índice reports_org_ativo_uq', () => {
  let orgId = '';
  let failedId = '';

  beforeAll(async () => {
    const agora = new Date();
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const base = {
      org_id: orgId,
      periodo_inicio: new Date(agora.getTime() - 8 * DIA),
      periodo_fim: new Date(agora.getTime() - DIA),
    };
    // 1 report ATIVO (queued) + 1 failed na MESMA org
    await db.insert(reports).values({ ...base, status: 'queued' });
    const [failed] = await db
      .insert(reports)
      .values({ ...base, status: 'failed', erro: 'coleta_falhou' })
      .returning({ id: reports.id });
    failedId = failed!.id;
  });

  afterAll(async () => {
    await db.delete(audit_log).where(eq(audit_log.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('com outro report ativo na org, lança relatorio_em_andamento (não 23505 cru)', async () => {
    await expect(
      requeueFailedReport({ reportId: failedId, actorUserId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow('relatorio_em_andamento');
  });
});
```

*(REVALIDAR o nome do export do schema de auditoria — `audit_log` vs `auditLog` — em `src/db/schema/audit-log.ts` e o nome da coluna; ajustar o cleanup conforme. `actorUserId` só é usado no audit APÓS o update, que aqui falha antes — UUID zero não fere FK.)* Rodar: `npx vitest run tests/integration/requeue-conflito.test.ts` (FALHA: rejeita com o erro cru do postgres, não com `relatorio_em_andamento`).

- [ ] **Step 4 — implementar o mapeamento do 23505.** Em `src/modules/admin/admin.repository.ts`, envolver o UPDATE de `requeueFailedReport`:

```ts
export async function requeueFailedReport(input: {
  reportId: string;
  actorUserId: string;
}): Promise<{ orgId: string } | null> {
  let updated: { org_id: string }[];
  try {
    updated = await db
      .update(reports)
      .set({ status: 'queued', etapa: null, erro: null })
      .where(and(eq(reports.id, input.reportId), eq(reports.status, 'failed')))
      .returning({ org_id: reports.org_id });
  } catch (e) {
    // 23505 = unique_violation no índice parcial reports_org_ativo_uq:
    // já existe report queued/running nesta org.
    if (e instanceof Error && 'code' in e && (e as { code: string }).code === '23505') {
      throw new Error('relatorio_em_andamento');
    }
    throw e;
  }
  if (updated.length === 0) return null;
  await recordAudit({
    orgId: updated[0].org_id,
    userId: input.actorUserId,
    acao: 'report.reprocessado',
    detalhes: { reportId: input.reportId },
  });
  return { orgId: updated[0].org_id };
}
```

Em `src/actions/admin.actions.ts` (`adminReprocessReportAction`), envolver a chamada:

```ts
  let res: { orgId: string } | null;
  try {
    res = await requeueFailedReport({ reportId, actorUserId: admin.id });
  } catch (e) {
    if (e instanceof Error && e.message === 'relatorio_em_andamento') {
      return { error: 'Já existe um relatório em andamento para este cliente. Aguarde ele terminar.' };
    }
    throw e;
  }
  if (!res) return { error: 'Só relatórios com falha podem ser reprocessados.' };
```

Rodar o teste de integração (PASSA).

- [ ] **Step 5 — teste de integração do toggle atômico falhando.** Criar `tests/integration/checklist-toggle-tx.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, taskActivities, tasks } from '@/db/schema';
import { toggleChecklistItemTx } from '@/modules/tasks/task.repository';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-toggle-';

const DESCRICAO = ['Contexto livre', '- [ ] Conferir frete', '- [ ] Ajustar preço'].join('\n');

describe.skipIf(!url)('toggleChecklistItemTx — atômico sob concorrência', () => {
  let orgId = '';
  let taskId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [t] = await db
      .insert(tasks)
      .values({
        org_id: orgId,
        titulo: `${PREFIX}task-${RUN}`,
        descricao: DESCRICAO,
        tipo: 'logistica',
        prioridade: 'media',
        status: 'em_andamento',
        criado_por: 'analista',
        ordem: 1,
      })
      .returning({ id: tasks.id });
    taskId = t!.id;
  });

  afterAll(async () => {
    await db.delete(taskActivities).where(eq(taskActivities.task_id, taskId));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('marca e desmarca a linha certa (índice CRU da descrição)', async () => {
    expect(await toggleChecklistItemTx({ taskId, orgId, index: 1, actorUserId: null })).toBe(true);
    let [row] = await db.select({ d: tasks.descricao }).from(tasks).where(eq(tasks.id, taskId));
    expect(row!.d.split('\n')[1]).toBe('- [x] Conferir frete');
    expect(await toggleChecklistItemTx({ taskId, orgId, index: 1, actorUserId: null })).toBe(true);
    [row] = await db.select({ d: tasks.descricao }).from(tasks).where(eq(tasks.id, taskId));
    expect(row!.d).toBe(DESCRICAO);
  });

  it('linha não-checklist e índice fora do range são no-op (false)', async () => {
    expect(await toggleChecklistItemTx({ taskId, orgId, index: 0, actorUserId: null })).toBe(false);
    expect(await toggleChecklistItemTx({ taskId, orgId, index: 99, actorUserId: null })).toBe(false);
  });

  it('dois toggles CONCORRENTES do mesmo item serializam (estado volta ao original, nunca update perdido)', async () => {
    await Promise.all([
      toggleChecklistItemTx({ taskId, orgId, index: 2, actorUserId: null }),
      toggleChecklistItemTx({ taskId, orgId, index: 2, actorUserId: null }),
    ]);
    const [row] = await db.select({ d: tasks.descricao }).from(tasks).where(eq(tasks.id, taskId));
    // Com FOR UPDATE os dois serializam: toggle + toggle = original.
    // O read-modify-write antigo podia aplicar os dois sobre a MESMA base (update perdido → '- [x]').
    expect(row!.d.split('\n')[2]).toBe('- [ ] Ajustar preço');
  });

  it('task de outra org → task_nao_encontrada', async () => {
    await expect(
      toggleChecklistItemTx({ taskId, orgId: '00000000-0000-0000-0000-000000000000', index: 1, actorUserId: null }),
    ).rejects.toThrow('task_nao_encontrada');
  });
});
```

*(`recordTaskActivity` já aceita `userId: string | null` — verificado em `task-activity.repository.ts` via `createTask`, que passa `input.actorUserId ?? null`; por isso `toggleChecklistItemTx` recebe `actorUserId: string | null` e o teste pode passar `null` direto.)* Rodar: `npx vitest run tests/integration/checklist-toggle-tx.test.ts` (FALHA: função não existe).

- [ ] **Step 6 — implementar o toggle atômico.** Em `src/modules/tasks/task.repository.ts` (import adicional: `import { toggleChecklistLine } from './checklist-line';`):

```ts
/**
 * Toggle atômico de item de checklist: transação + SELECT ... FOR UPDATE
 * serializa toggles concorrentes — o read-modify-write via updateTask podia
 * perder um update quando dois cliques chegavam juntos. Devolve true se a
 * descrição mudou (índice válido de linha checklist).
 */
export async function toggleChecklistItemTx(input: {
  taskId: string;
  orgId: string;
  index: number;
  actorUserId: string | null;
}): Promise<boolean> {
  const mudou = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ descricao: tasks.descricao })
      .from(tasks)
      .where(and(eq(tasks.id, input.taskId), eq(tasks.org_id, input.orgId)))
      .for('update')
      .limit(1);
    if (!row) throw new Error('task_nao_encontrada');
    const nova = toggleChecklistLine(row.descricao, input.index);
    if (nova === row.descricao) return false;
    await tx
      .update(tasks)
      .set({ descricao: nova })
      .where(and(eq(tasks.id, input.taskId), eq(tasks.org_id, input.orgId)));
    return true;
  });
  if (mudou) {
    // Paridade com o fluxo antigo (updateTask registrava 'editada').
    await recordTaskActivity({ taskId: input.taskId, userId: input.actorUserId, evento: 'editada' });
  }
  return mudou;
}
```

Em `src/actions/tasks.actions.ts` (`toggleChecklistItemFormAction`), substituir o bloco `getTaskById` + `toggleChecklistLine` + `updateTask` por:

```ts
  try {
    await toggleChecklistItemTx({ taskId, orgId, index, actorUserId: access.id });
  } catch (e) {
    logger.warn('toggleChecklistItemFormAction falhou', { orgId, taskId }, e);
    return;
  }

  revalidateTaskRoutes(orgId);
```

(com o import `toggleChecklistItemTx` vindo de `task.repository`; os imports de `toggleChecklistLine`/`CHECKLIST_UNCHECKED` na action permanecem só se ainda usados pelo `createTaskAction` — conferir antes de remover). Rodar: `npx vitest run tests/integration/checklist-toggle-tx.test.ts` (PASSA) + `npx vitest run tests/integration/tasks-actions.test.ts` (regressão da action — PASSA).

- [ ] **Step 7 — /aguardando honesto.** Reescrever o início de `src/app/(client)/aguardando/page.tsx` (imports adicionais: `redirect` de `next/navigation`):

```tsx
export default async function AguardandoPage() {
  const access = await requireSession();
  if (access.role === 'admin_truth') redirect('/admin');
  if (access.role === 'analista') redirect('/analista');
  if (access.orgStatus === 'active') redirect('/dashboard');
  const suspensa = access.orgStatus === 'suspended';
```

e no JSX: título/subtítulo condicionais e o card de passos só para pendente:

```tsx
      <div className="max-w-md space-y-2 text-center">
        <h1 className="font-heading text-xl font-semibold text-white">
          {suspensa ? 'Conta suspensa' : 'Conta aguardando ativação'}
        </h1>
        <p className="text-sm text-muted">
          {suspensa
            ? 'Sua conta está suspensa no momento. Fale com o suporte para entender o motivo e reativar o acesso.'
            : 'Sua conta foi criada e será ativada pela equipe Truth em breve.'}
        </p>
      </div>

      {!suspensa ? (
        <Card className="w-full max-w-md">
          <CardContent>
            <h2 className="mb-4 font-heading text-sm font-semibold text-white">O que acontece agora</h2>
            <ol className="flex flex-col gap-4">
              {passos.map((p, i) => (
                <li key={p.titulo} className="flex gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-brand/30 bg-brand-glow font-mono text-[10px] text-brand">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-white">{p.titulo}</p>
                    <p className="text-sm text-muted">{p.texto}</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
```

*(botões "Falar com o suporte"/"Sair" ficam para ambos os casos. O redirect fecha o buraco "analista/admin caem numa tela de cliente quebrada" apontado no QA da auditoria.)*

- [ ] **Step 8 — content-type explícito no 404 do PDF.** Em `src/app/api/reports/[id]/pdf/route.ts`:

```ts
    return new Response('Relatório não disponível para exportação.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
```

- [ ] **Step 9 — LazyMotion global + varredura `m.`.** Em `src/components/motion-provider.tsx`:

```tsx
'use client';

import { LazyMotion, MotionConfig, domAnimation } from 'framer-motion';

/**
 * LazyMotion strict: só os features DOM entram no bundle (componente `m.` em
 * vez de `motion.` — strict LANÇA se algum `motion.` sobrar, garantindo a
 * dieta). MotionConfig respeita prefers-reduced-motion em toda a árvore.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
```

Varredura (obrigatória por causa do `strict`):

```bash
grep -rln "motion\." src --include="*.tsx"
```

Em CADA arquivo listado (esperados no pós-G3: `Stepper.tsx`, `Toast.tsx`, `Dialog.tsx`, `reveal.tsx`, os 3 `template.tsx`, `dashboard-charts.tsx`, `stat-cards.tsx` e o que G1–G3 tiverem adicionado): trocar `import { motion } from 'framer-motion'` → `import { m } from 'framer-motion'` (mantendo os demais imports, ex.: `AnimatePresence`) e TODOS os `motion.` → `m.` (ex.: `motion.div` → `m.div`, `motion.section` → `m.section`). Repetir o grep até devolver ZERO. *(`useCountUp` usa `animate()` standalone — não depende de features e fica como está.)*

- [ ] **Step 10 — charts do dashboard sob a dobra em dynamic.** Em `src/app/(client)/dashboard/dashboard-charts.tsx` (client component — REVALIDAR a estrutura pós-G2/T8, que adicionou `srSummary`/tooltip; manter as props que a G2 passa), trocar os imports estáticos dos charts por:

```tsx
import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/Skeleton';
import type { XY } from '@/components/ui/charts/LineChart';

const LineChart = dynamic(
  () => import('@/components/ui/charts/LineChart').then((mod) => mod.LineChart),
  { ssr: false, loading: () => <Skeleton className="h-[260px] rounded-2xl" /> },
);
const DonutChart = dynamic(
  () => import('@/components/ui/charts/DonutChart').then((mod) => mod.DonutChart),
  { ssr: false, loading: () => <Skeleton className="h-[240px] rounded-2xl" /> },
);
```

(o resto do componente fica; recharts sai do bundle inicial da rota — ver decisão 16 para o porquê de NÃO fazer o mesmo nos charts do relatório).

- [ ] **Step 11 — verificação.** `npm run test` + `npm run typecheck` verdes (unit + integração). `npx playwright test` → **verde** (strict do LazyMotion quebraria QUALQUER página com `motion.` esquecido — o E2E cobre as 3 áreas). Smoke: dashboard carrega com skeleton breve nos charts; reprocessar relatório com outro em andamento mostra a mensagem amigável; /aguardando redireciona cliente ativo ao dashboard.
- [ ] **Step 12 — Commits (dois):**

```bash
git add src/modules/alerts/alert-detectors.ts src/modules/notifications/templates.ts src/modules/admin/admin.repository.ts src/actions/admin.actions.ts src/modules/tasks/task.repository.ts src/actions/tasks.actions.ts "src/app/(client)/aguardando/page.tsx" "src/app/api/reports/[id]/pdf/route.ts" tests/unit/alert-detectors.test.ts tests/unit/notification-templates.test.ts tests/integration/requeue-conflito.test.ts tests/integration/checklist-toggle-tx.test.ts
git commit -m "fix(g4): brl com milhar e data pt-BR nos alertas + escapeHtml no template de falha + requeue 23505 amigavel + toggle de checklist atomico + aguardando honesto + content-type do 404"
git add -A
git commit -m "feat(g4): LazyMotion strict (m.) em toda a arvore + charts do dashboard via next/dynamic ssr:false"
```

---

### Task 11: Revisão ampla final da fase

**Files:** nenhum novo — verificação e correções pontuais.

- [ ] **Step 1 — suíte completa.** `npm run test` (unit + integração com `DATABASE_URL_TEST`) e `npm run typecheck` → ZERO falhas.
- [ ] **Step 2 — E2E completo.** `npx playwright test` → todos os specs verdes (`auth`, `dashboard`, `conexoes`, `admin`, `plano-de-acao`, `relatorio-task`). Única divergência esperada vs. o master: `admin.spec.ts` com `'Ativo'` (Task 6, justificada).
- [ ] **Step 3 — smoke a11y/motion guiado** (dev server + banco test, roteiro mínimo):
  1. Teclado puro no fluxo cliente: skip-link → nav (`aria-current` audível) → ⌘K (trap, Escape, restore) → ConfirmDialog de desconectar Bling (trap + restore) → sino (foco entra/volta).
  2. `prefers-reduced-motion: reduce` (DevTools → Rendering): templates sem lift, gauge sem animação, marquee da landing estático, count-up instantâneo.
  3. Mobile 375px: menu hamburguer com nav por papel; toasts com fechar de 40px.
  4. Windows: botão "Ctrl K"; macOS (ou spoof de UA): "⌘ K".
- [ ] **Step 4 — self-review de escopo.** Conferir item a item da auditoria seção 4/G4 (1–10) contra os commits da fase; conferir a tabela "Divergências" deste plano (nenhum item excluído foi implementado em duplicidade; nenhum item mantido ficou de fora). Grep final de higiene:

```bash
grep -rn --include="*.tsx" -E '<a$|<a ' src | grep -v 'mailto\|http\|/api/\|#'
grep -rn --include="*.tsx" --include="*.ts" "red-400\|red-500\|#eab308" src
grep -rln "motion\." src --include="*.tsx"
```

Todos devem devolver ZERO (ou só falsos positivos documentados no commit).
- [ ] **Step 5 — Commit final (se houver correções) e fechamento:**

```bash
git add -A
git commit -m "fix(g4): ajustes da revisao ampla final"
```

Fase pronta para merge `--no-ff` em `master` (decisão do dono, com as fases G0–G3 já integradas).

---

## Self-review do plano (feito na escrita — não requer ação)

1. **Cobertura vs. auditoria 4/G4:** item 1 → Task 1; item 2 → Tasks 2 e 6 (shell); item 3 → Task 3; item 4 → Task 4; item 5 → Tasks 5, 4 (fechar do toast) e 6 (skip-link — redistribuição documentada na divergência 17); item 6 → Task 6; item 7 → Task 7 (+CTA glow na 8); item 8 → Task 8; item 9 → Task 9 (sr-only do LineChart excluído — G2; Tooltip/Dropdown decidido: deletar); item 10 → Task 10 (stat de vaidade, query dupla, SUM SQL e N+1 excluídos — G2/G3; PDF 404 confirmado e explicitado). Nenhum item sem dono.
2. **Placeholders:** varrido — todo step de código tem o código; os pontos dependentes de drift pós-G1–G3 têm REGRA determinística (grep + mapa de conversão) em vez de "ajustar depois".
3. **Consistência de tipos/nomes:** `proximoIndiceFoco(total, atual, shiftKey)` (T1) = uso no Dialog (T1); `isInternalHref` (T2) = uso no Button (T2); `duracaoDoToast`/`ToastAction` (T4) = uso no provider (T4); `STATUS_ORG_LABEL`/`PLANO_LABEL` (T6) = usos em client-row/[orgId]/templates (T6); `navItems`/`logoHref`/`hrefAtivo`/`atalhoPaletaLabel` (T6) = shell (T6); `corDoScore` (T7) = ScoreGauge (T7); `toggleChecklistItemTx` e `relatorio_em_andamento` (T10) = action/testes (T10). `Dialog` usa `data-autofocus` — ConfirmDialog e palette o fornecem.
4. **Guard-rails E2E:** todos os testids citados nas Global Constraints aparecem preservados nas tasks que tocam seus arquivos; a única edição de spec (admin `'Ativo'`) tem step próprio com justificativa.
