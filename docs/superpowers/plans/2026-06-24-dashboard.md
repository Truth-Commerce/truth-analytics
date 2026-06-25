# Dashboard (visualização de relatórios + trigger) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Dar ao cliente uma área logada (`/dashboard`) que **lê** os relatórios gerados pelo pipeline (Plano 4): vê o último relatório, o histórico, dispara a geração de um novo (`generateReportAction`), e abre o relatório completo (métricas + análise da IA) em `/dashboard/relatorios/[id]`.

**Architecture:** Princípio do spec — **o pipeline só ESCREVE relatórios; o dashboard só LÊ.** Toda leitura passa por uma camada nova `src/modules/reports/report.repository.ts` (multi-tenant: toda query filtra por `org_id`). As páginas são Server Components (RSC) que consultam o repositório e os helpers de gating já existentes; a única escrita é via a Server Action `generateReportAction` (já implementada no Plano 4), exposta por um client component com estado de carregamento. Reusa os padrões dos Planos 1–3: RSC busca dados → client component `'use client'` com `useFormState` → `{error?}` state → `data-testid` para E2E.

**Tech Stack:** Next.js 14 App Router, Drizzle/Neon, Tailwind, Vitest (unit/integração), Playwright (E2E). Sem libs novas (sem charts — tabelas/listas simples no MVP; gráficos são fast-follow).

## Global Constraints

- **Padrões dos Planos 1–4** (em `master`): `src/modules/<domínio>/`, RSC + Server Actions, gating reconsultando o DB (`requireActiveOrg` → redireciona se não-ativo), testes de integração contra o branch Neon `test` (`tests/setup.ts` redireciona; `describe.skipIf(!process.env.DATABASE_URL_TEST)`), E2E com `tests/e2e/helpers/db.ts` (`E2E_PREFIX`, `seedE2EActiveClient`, `seedBlingConnection`, `cleanupE2E`).
- **Multi-tenancy (crítico):** toda leitura de `reports` filtra por `org_id` vindo da sessão (`requireActiveOrg().orgId`). NUNCA aceitar `orgId` de input do cliente. O detalhe `/dashboard/relatorios/[id]` busca por `(id, org_id)` — relatório de outra org → `notFound()`.
- **Dashboard só lê:** nenhuma página deste plano escreve em `reports`/`orders`/`market_snapshots`/`organizations` além de disparar `generateReportAction` (que é a fronteira de escrita do Plano 4). A action já valida `podeGerar` + Bling conectado.
- **jsonb confiável:** `reports.metricas`/`analise_ia` foram escritos pelo pipeline já validados por `MetricasSchema`/`AnaliseIaSchema`. Na leitura, tipar como `Metricas | null`/`AnaliseIa | null` (cast). Validação defensiva com `.safeParse` é opcional (fast-follow).
- **Trigger síncrono (MVP):** `generateReportAction` awaita o pipeline inteiro (pode demorar — chamada Claude). O botão usa estado `pending` (`useFormStatus`). Em produção mover para background — nota, fora do escopo (igual Plano 4). Sem chaves reais (ANTHROPIC/SERPAPI), a geração falha graciosamente (`{error:'falha_geracao'}`); o E2E NÃO exercita geração real — semeia um `report` direto no DB.
- **Idioma:** UI e mensagens em pt-BR. Commits conventional pt-BR.
- **Branch `feat/dashboard`** a partir de `master`. Nunca push/merge sem revisão.

## File Structure

| Caminho | Responsabilidade |
|---|---|
| `src/modules/reports/report.repository.ts` (criar) | Leitura multi-tenant de `reports`: `listReports`, `getReportById`, `getLatestReport` |
| `src/modules/reports/report.types.ts` (criar) | `ReportSummary`, `ReportDetail`, mapeamento de status pt-BR |
| `src/actions/reports.actions.ts` (mod) | `generateReportAction` += `revalidatePath('/dashboard')` no sucesso; tipo de retorno mantém `{error?, reportId?}` |
| `src/app/(client)/dashboard/page.tsx` (mod) | RSC: último relatório + histórico + gating + trigger |
| `src/app/(client)/dashboard/generate-report.tsx` (criar) | `'use client'` — botão "Gerar análise" (useFormState + useFormStatus pending) |
| `src/app/(client)/dashboard/relatorios/[id]/page.tsx` (criar) | RSC: relatório completo (métricas + análise IA) |
| `src/lib/format.ts` (criar) | helpers puros pt-BR: `formatBRL`, `formatData` (reusados nas views e testáveis) |
| `tests/unit/format.test.ts`, `tests/integration/report-repository.test.ts` (criar) | testes |
| `tests/e2e/dashboard.spec.ts` (criar) | E2E: login → dashboard → ver relatório semeado → abrir detalhe; gating do botão |

---

### Task 1: Camada de leitura de relatórios + formatadores

**Files:** Create `src/modules/reports/report.repository.ts`, `src/modules/reports/report.types.ts`, `src/lib/format.ts`; Test `tests/unit/format.test.ts`, `tests/integration/report-repository.test.ts`.

**Interfaces (Produces):**
- `report.types.ts`:
  - `type ReportStatus = 'queued' | 'running' | 'done' | 'failed'`.
  - `type ReportSummary = { id: string; status: ReportStatus; periodoInicio: Date; periodoFim: Date; createdAt: Date }`.
  - `type ReportDetail = ReportSummary & { metricas: Metricas | null; analiseIa: AnaliseIa | null; erro: string | null }` (importa `Metricas`/`AnaliseIa` de `@/modules/pipeline/contracts`).
  - `const STATUS_LABEL: Record<ReportStatus, string>` = { queued:'Na fila', running:'Em andamento', done:'Concluído', failed:'Falhou' }.
- `report.repository.ts` (todas filtram por `org_id`; `db` de `@/db/client`, `reports` de `@/db/schema`):
  - `listReports(orgId: string): Promise<ReportSummary[]>` — ordena por `created_at desc`.
  - `getLatestReport(orgId: string): Promise<ReportSummary | null>` — o mais recente (ou null).
  - `getReportById(reportId: string, orgId: string): Promise<ReportDetail | null>` — busca por `and(eq(id), eq(org_id))`; mapeia jsonb→tipos (cast); null se não achar (inclui relatório de outra org).
- `format.ts` (puro): `formatBRL(n: number): string` (ex.: `R$ 1.234,56`, via `Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})`); `formatData(d: Date | string): string` (ex.: `24/06/2026`, via `Intl.DateTimeFormat('pt-BR')`); `formatPeriodo(inicio, fim): string`.

- [ ] **Step 1 (unit, puro):** `format.test.ts` — `formatBRL(1234.56)` contém `1.234,56`; `formatBRL(0)`; `formatData` de uma data fixa → `dd/mm/aaaa`. (Use valores estáveis; tolere o caractere de espaço do Intl se necessário — asserir via `.includes`.)
- [ ] **Step 2:** implementar `format.ts`, `report.types.ts`, `report.repository.ts`.
- [ ] **Step 3 (integração):** `report-repository.test.ts` (`describe.skipIf(!DATABASE_URL_TEST)`, espelhar `tests/integration/compute-metrics.test.ts` setup): semeia 1 org `active` + 2 `reports` (um `done` com `metricas`/`analise_ia`, um `failed` com `erro`); assere `listReports` retorna 2 ordenados por created_at desc; `getLatestReport` retorna o mais novo; `getReportById` do `done` traz `metricas`/`analiseIa` não-nulos; **isolamento:** `getReportById(reportIdDaOrgA, orgB)` → null; cleanup completo (reports, orgs) em `finally`.
- [ ] **Step 4:** `npm run test` + `npm run typecheck`. **Verificar MAIN limpo** (reports=0) com o one-liner padrão. **Commit:** `feat(dashboard): camada de leitura de relatórios + formatadores pt-BR`.

---

### Task 2: Página /dashboard (último relatório + histórico + trigger)

**Files:** Modify `src/app/(client)/dashboard/page.tsx`, `src/actions/reports.actions.ts`; Create `src/app/(client)/dashboard/generate-report.tsx`.

**Interfaces:**
- `reports.actions.ts`: em `generateReportAction`, no caminho de sucesso adicionar `revalidatePath('/dashboard')` (para o novo relatório aparecer). Manter o retorno `{ error?, reportId? }` e toda a lógica de gating do Plano 4.
- `generate-report.tsx` (`'use client'`): usa `useFormState(generateReportAction, initial)` + um subcomponente com `useFormStatus()` para desabilitar o botão e mostrar "Gerando…" enquanto `pending`. Renderiza `state.error` em pt-BR (mapear motivos conhecidos: `org_inativa`,`sem_plano`,`ciclo_em_andamento`,`bling_nao_conectado`,`falha_geracao` → frases amigáveis; fallback genérico). Props opcionais: `disabled?: boolean` + `motivo?: string` para refletir o gating já calculado no servidor (não desabilita só no cliente — o gating real é a action).
- `dashboard/page.tsx` (RSC): `requireActiveOrg()`; busca `getLatestReport(orgId)`, `listReports(orgId)`, `getConnection(orgId)`, `getOrganizationById(orgId)` → `podeGerar(org)`. Renderiza:
  - **Cabeçalho** "Dashboard".
  - **Card do trigger:** o `<GenerateReport>` com `disabled` quando `!conn.connected || !podeGerar.ok`, passando o `motivo` (ex.: Bling não conectado → "Conecte o Bling em /conexões"; ciclo_em_andamento → "Próximo relatório liberado em {data}").
  - **Último relatório:** se houver, um resumo (status label, período, data, ticket médio se `done`) com link `data-testid="ver-relatorio"` para `/dashboard/relatorios/{id}`. Se status `failed`, mostra `erro` resumido. Empty state se nenhum.
  - **Histórico:** lista de `listReports` (status + período + link), `data-testid="reports-list"`. Empty state "Nenhum relatório ainda."
  - `data-testid`: `latest-report`, `reports-list`, `generate-report-button`.

- [ ] **Step 1:** modificar a action (revalidatePath) + criar `generate-report.tsx`.
- [ ] **Step 2:** reescrever `dashboard/page.tsx` (RSC) compondo repo + gating + trigger + histórico.
- [ ] **Step 3:** `npm run test` + `npm run typecheck` + `npm run build` (a página compila). **Commit:** `feat(dashboard): página com último relatório, histórico e gatilho de geração`.

---

### Task 3: Detalhe do relatório /dashboard/relatorios/[id] + E2E

**Files:** Create `src/app/(client)/dashboard/relatorios/[id]/page.tsx`; Test `tests/e2e/dashboard.spec.ts`; (opcional) helper de seed de report em `tests/e2e/helpers/db.ts`.

**Interfaces:**
- `relatorios/[id]/page.tsx` (RSC): `const access = await requireActiveOrg()`; `const rel = await getReportById(params.id, access.orgId)`; se `!rel` → `notFound()`. Renderiza por status:
  - `done`: **Métricas** — ticket médio (`formatBRL`), vendas por canal (tabela canal/total/pedidos), evolução (lista data→total), top produtos (tabela nome/sku/qtd/receita), posição de preço (tabela sku/nome/nossoPreco/precoMercadoMediano/fonte), e um aviso se `metricas.benchmarkParcial` ("Benchmark de mercado parcial — dados de concorrência incompletos"). **Análise IA** — resumo executivo, gargalos (lista), sugestões de melhoria (lista), ideias de venda (lista), recomendações de preço (tabela sku/nome/precoSugerido/justificativa).
  - `failed`: status + `erro`.
  - `queued`/`running`: status + "Relatório em processamento."
  - `data-testid`: `report-status`, `resumo-executivo` (quando done), `metricas` section.
- (opcional) `tests/e2e/helpers/db.ts`: `seedReport(orgId, { status, metricas?, analiseIa? }): Promise<string>` — insere um `reports` com período fixo; retorna id. Limpeza: estender `cleanupE2E` para deletar `reports` das orgs `E2E_PREFIX` ANTES das orgs (FK). **IMPORTANTE:** atualizar `cleanupE2E` para apagar `reports` (e, por segurança, `orders`/`market_snapshots`) das orgs do prefixo, senão o delete da org falha por FK.

- [ ] **Step 1:** criar a página de detalhe (RSC) com render por status + seções de métricas/IA usando `format.ts`.
- [ ] **Step 2:** estender `tests/e2e/helpers/db.ts` (`seedReport` + `cleanupE2E` apaga reports/orders/market_snapshots das orgs do prefixo).
- [ ] **Step 3 (E2E):** `dashboard.spec.ts` (espelhar `conexoes.spec.ts`): seed cliente ativo (`seedE2EActiveClient`) + `seedReport(orgId, {status:'done', metricas, analiseIa})`. Teste A: login → `/dashboard` → vê `latest-report` e clica `ver-relatorio` → `/dashboard/relatorios/[id]` mostra `resumo-executivo` e o ticket médio formatado. Teste B (gating): cliente SEM Bling conectado → botão `generate-report-button` desabilitado/mostra motivo. Cleanup via `cleanupE2E`.
- [ ] **Step 4:** `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:e2e` (ou o script E2E do projeto). **Verificar MAIN limpo** (reports/orders/market_snapshots=0). **Commit:** `feat(dashboard): detalhe do relatório (métricas + análise IA) + E2E`.

---

## Self-Review

**Cobertura:** leitura multi-tenant de relatórios (Task 1) ✅; dashboard com último + histórico + trigger com pending/gating (Task 2) ✅; detalhe completo métricas+IA por status (Task 3) ✅; E2E login→ver→detalhe + gating (Task 3) ✅; "dashboard só lê" respeitado (única escrita = `generateReportAction` do Plano 4) ✅.

**Lacunas/deferidas (fast-follow):** gráficos/charts (hoje tabelas/listas); polling/streaming do status enquanto `running` (hoje precisa refresh; trigger é síncrono no MVP); paginação do histórico; validação defensiva `.safeParse` do jsonb na leitura; PDF/export; i18n. Backgrounding do orquestrador (herdado do Plano 4).

**Consistência:** `Metricas`/`AnaliseIa` (Plano 4 contracts) consumidos nas views; `generateReportAction`/`podeGerar`/`getConnection`/`getOrganizationById` (Planos 3–4) reusados; padrão RSC+useFormState+data-testid dos Planos 1–3; `cleanupE2E` estendido para as novas tabelas (corrige FK).

---

## Execução
Subagent-driven (implementer + review por task; revisão ampla ao final). Externos não envolvidos (dashboard lê DB). Testes de integração/E2E contra o branch Neon `test`.
