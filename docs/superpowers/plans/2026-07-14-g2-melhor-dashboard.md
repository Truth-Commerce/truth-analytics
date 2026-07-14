# G2 — O Melhor Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

> **Pré-requisitos: G0 e G1 mergeadas; revalidar contratos citados.** Este plano assume no `master`: da **G0** — cron de sync incremental (`connections.last_sync_at` gravado), `src/lib/timezone.ts` (`hojeBrt`, `ontemBrt`, `inicioDeDiaUtc`, `fimDeDiaUtc`), `formatData` (BRT) / `formatDataUtc` / `formatPeriodo` (UTC), `getUltimaDataPedido(orgId)` em `alert-data.repository.ts`, banner de conexão expirada e **stepper retomável** no dashboard (prop `emAndamentoReportId` em `generate-report.tsx` — G0/Task 9); da **G1** — campos v2 de `Metricas`/`AnaliseIa` (`achados[]`, `destaques[]`, `topProdutos` etc.), `ordenarAchados`/`primeiroGargalo` em `report-view-model.ts`, `formatBRLCompacto`/`formatDataCurta`/`formatDiaMes` em `src/lib/format.ts`, fonte `'achados'` em `FONTES_ANALISE` + `achadoToTaskInput`, e os ids de seção da página do relatório (`#metricas`, `#resumo`, `#recomendacoes`). **No início de CADA task, revalide os trechos citados contra o `master` real** — os snippets deste plano foram extraídos do HEAD `5c07999` (pré-G0/G1) e adaptados aos CONTRATOS dos planos G0/G1; drift pequeno = adaptar inline e anotar no commit; drift estrutural = parar e revisar.

**Goal:** Transformar o dashboard em "decisão em 5 segundos" (auditoria 2026-07-14, seções 2, 3-P1/P2 e 4/G2). Oito entregas: (1) **view-model único** `getDashboardData(orgId)` que elimina as queries duplicadas da page (getLatestReport≡listReports[0], getLatestDoneReport≡getUltimosDoneDetalhados[0]) e move o total do mês para `SUM()` no SQL com mês corrente em BRT; o stat de vaidade "Relatórios gerados" vira "Variação vs análise anterior"; (2) **reordenação por decisão** (banner G0 → alertas → "Como está minha loja" com Ação nº 1 da IA → meta → checklist → stats+charts → gerar/último → histórico) + marquee substituído por **chips estáticos** com link para as seções do relatório; (3) **Truth Score com linha do tempo** (sparkline + "De 58 para 76 em 4 relatórios"); (4) **meta viva com pace** (% esperado vs real, projeção de fechamento, empty state, "dados até {frescor}"); (5) **cards novos do bento** (top 5 produtos, posição de preço, resumo executivo); (6) **countdown positivo** da próxima análise + stats ancorados no período; (7) **histórico que conta história** (colunas Faturamento e Score com ▲▼); (8) **charts legíveis + mobile** (datas dd/MM, eixo Y compacto — conserta o "R$" cortado —, sr-only no LineChart, fix do overflow dos stats no 375px, gutter único, kanban `md:grid-cols-3 xl:grid-cols-5`).

**Architecture:** Segue o padrão do repo — **lógica de UI em modelos `.ts` puros testáveis** (vitest roda em node, não renderiza componentes) com componentes finos, exatamente como `src/modules/reports/dashboard-model.ts` já faz:

- **Dados** (`src/modules/reports/dashboard-data.ts` novo + `report.repository.ts`): `getDashboardData(orgId)` concentra o `Promise.all` (preservado) da page. Query nova `listHistoricoDashboard` devolve os summaries + `score`/`totalPeriodo` extraídos do jsonb **no SQL** (`metricas->'truth_score'->>'score'`) — UMA query leve serve o histórico (Task 7), o `latest` (primeira linha) e a linha do tempo do score (Task 3), sem puxar os jsonb pesados. `getTotalVendasMesCorrente` vira `SUM()` no banco com mês corrente decidido pelo calendário BRT (`hojeBrt` da G0; fronteiras codificadas em UTC — mesma convenção da janela do relatório da G0).
- **Modelos puros** (`dashboard-model.ts` + `compare.ts`): `statCardsModel`, `chipsDoRelatorio`, `acaoNumeroUm` (usa `ordenarAchados` da G1 com fallback `gargalos[0]`), `linhaDoTempoScore`, `paceMeta`, `proximaAnaliseInfo`/`copyProximaAnalise`, `historicoComDeltas`, `topProdutosDashboard`, `posicaoPrecoResumo`, `srSummaryEvolucao` — todos sem I/O, testados com números concretos.
- **Componentes finos**: `insight-chips.tsx` (server, substitui o marquee — resolve WCAG 2.2.2 por não haver mais animação), `acao-principal.tsx` (client, reusa `createTasksFromReportAction` da F2 com `itens=[{fonte,indice}]` — fonte `'achados'` da G1 ou `'gargalos'` legado), `bento-cards.tsx` (server), `meta-progress.tsx`/`truth-score-card.tsx` evoluídos. `page.tsx` só orquestra.
- **Ação → task**: o botão "Virar tarefa" da Ação nº 1 posta no MESMO fluxo do relatório (F2/G1): `createTasksFromReportAction` valida fonte contra `FONTES_ANALISE` e o índice é a posição ORIGINAL no array (contrato de `ordenarAchados` da G1). `jaExiste` vem de `listTaskTitulosByReport` (mesma checagem da página do relatório).

**Tech Stack:** Next.js 14 (App Router), Drizzle/Neon (`postgres.js`), Zod (nenhum schema novo — G2 não muda jsonb), Recharts já instalado (`LineChart`/`DonutChart`/`Sparkline` existentes — nenhum chart novo), framer-motion existente, Vitest (unit em `tests/unit`, integração em `tests/integration` no branch Neon `test` via `DATABASE_URL_TEST`), Playwright E2E existente **intocado**. **Sem libs novas. Sem migrations** (nenhuma coluna nova).

## Global Constraints

- **Regra de ouro:** antes de cada task, re-validar os trechos citados contra o `master` atual (G0 e G1 mudaram `page.tsx`, `format.ts`, `contracts.ts`, `report-view-model.ts`). Ler o arquivo REAL antes de editar.
- Next 14 App Router + Drizzle + Neon — **testes de integração SEMPRE no branch `test` via `DATABASE_URL_TEST`** (`describe.skipIf(!process.env.DATABASE_URL_TEST)`, cleanup em `afterAll`/`finally`, prefixo `ta-test-` nos dados). `tests/setup.ts` é **intocável**. NUNCA rodar teste contra produção.
- **TDD com vitest** (`npm run test`): failing test primeiro → rodar e VER falhar → implementar → rodar e VER passar → commit. Rodar sempre via `npm run test` (o script usa `vitest run`).
- **Copy pt-BR SEMPRE**; commits em português no padrão `feat(g2): ...` / `test(g2): ...` / `fix(g2): ...`.
- **Multi-tenancy inegociável:** toda query escopada por `org_id`; `orgId` vem da sessão (`requireActiveOrg`) — nunca de input do cliente. `getDashboardData(orgId)` recebe o orgId JÁ resolvido pela page.
- **E-mail/notify best-effort** (nenhum novo nesta fase — só não quebrar os existentes).
- **Campos jsonb novos `.optional()`** — G2 não adiciona nenhum; todo consumidor de campo v2 da G1 (`achados`, `truth_score`) trata `undefined` (relatórios antigos).
- **Lógica de UI em modelos `.ts` puros** testáveis + componentes finos (padrão `dashboard-model.ts`). CSS/layout não é testável em vitest — steps de CSS são verificados por typecheck + suíte + E2E.
- **PRESERVAR 100% os testids/fluxos E2E.** `tests/e2e/dashboard.spec.ts` é o guard desta fase — ele usa: **`latest-report`**, **`ver-relatorio`**, **`generate-report-button`**, o texto exato **"Conecte o Bling em Conexões."** e (na página do relatório, que a G2 NÃO toca) **`resumo-executivo`** e **`metricas`**. Os demais specs tocam arquivos que a G2 edita: `plano-de-acao.spec.ts`/`relatorio-task.spec.ts` usam **`kanban-col-backlog`**, **`kanban-col-em_andamento`**, **`kanban-col-em_revisao`**, **`task-card`**, **`task-concluir`**, **`virar-task-gargalos-0`** (o KanbanBoard muda SÓ classes CSS na Task 8). Todos INTOCÁVEIS em nome e semântica. Testids do dashboard não usados por E2E (`truth-score-card`, `score-delta`, `meta-progress`, `alertas-section`, `onboarding-checklist`, `comparar-periodos-link`, `reports-list`, `resolver-alerta-*`) também são preservados (princípio aditivo). **Nenhuma task deste plano edita spec E2E** — se um E2E quebrar, é bug da implementação; corrigir o código, não o spec. Testes unit/integration PODEM ser atualizados (listados por task).
- **Branch:** `feat/g2-melhor-dashboard` a partir de `master` (pós-G0+G1). Merge `--no-ff` só após a Task 9 (revisão ampla).

## Divergências do escopo auditado → adaptações (verificadas no código real)

1. **Checklist já se esconde quando completo** (`onboarding-checklist.tsx:12` — `if (onboardingCompleto(props)) return null;`). A auditoria dizia "sempre visível" — na verdade só aparece enquanto incompleto. G2 apenas **reposiciona** (depois da faixa/meta) — zero mudança de comportamento no componente.
2. **Stepper retomável é da G0 (Task 9)** — a page pós-G0 já monta `GenerationProgress` via prop `emAndamentoReportId`. G2 NÃO duplica: a reescrita da page (Task 2) **porta** o que estiver no master. ATENÇÃO: o arquivo do plano G0 termina num marcador `<!-- CONTINUA-TASK-9 -->` — o contrato (`emAndamentoReportId` em `generate-report.tsx`, page derivando de `latest.status ∈ {queued,running}`) vem do File Structure do G0; revalidar o nome real da prop no master antes da Task 2.
3. **Banner de conexão expirada é da G0 (Task 7)** — inserido após o `<h1>`. G2 só o mantém como item nº 1 da nova ordem.
4. **`dashboardStats` e `insightsFromAnalise` são substituídos** (por `statCardsModel` e `chipsDoRelatorio`); únicos consumidores eram `page.tsx` e `tests/unit/dashboard-model.test.ts` (verificado por grep) — teste reescrito nas Tasks 1/2. **Decisão do marquee: REMOVER `insights-marquee.tsx`** e criar `insight-chips.tsx` (nenhum E2E/teste referencia o marquee — verificado).
5. **Faturamento do stat muda de fonte**: hoje soma `vendasPorCanal`; `statCardsModel` usa `totalVendas(m)` (soma de `evolucao`) — a MESMA fonte de verdade do `compare.ts` e do `heroKpis` da G1 (consistência entre dashboard e relatório).
6. **`getTotalVendasMesCorrente` vive em `src/modules/organizations/organization-settings.repository.ts`** (a auditoria citou o arquivo sem o caminho). O teste de integração existente (`tests/integration/organization-settings.test.ts:67-100`) semeia o mês corrente em UTC — a Task 1 o adapta para o mês BRT (helpers da G0), expectativa `300.5` preservada.
7. **Gutter duplo: decisão = remover o `px-4` do app-shell** (`app-shell.tsx:230`) — TODAS as páginas roteadas sob o shell têm `p-6 md:p-8` próprio (verificado por grep em `src/app/**`); o `px-4` do `<nav>` (linha 22) fica (é o header, não o conteúdo).
8. **Overflow dos stats no 375px — causa real**: grid children com `min-width: auto` + linha flex `justify-between` com valor `text-2xl` mono (~170px) + `Sparkline` de width fixa 120px não cabem em ~255px úteis. Fix na Task 8: `min-w-0` no card + `flex-wrap` na linha (o sparkline quebra para baixo em telas estreitas) — sem esconder conteúdo.
9. **`metricas.topProdutos` já vem ordenado por receita desc (cap 10)** — o card usa `slice(0, 5)` sem reordenar.
10. **Deltas do histórico** comparam com o **done anterior mais próximo** (linhas `failed`/sem score são puladas na base de comparação) — mais honesto que "linha imediatamente abaixo".
11. **Posição de preço**: itens com `nossoPreco <= 0` ou `precoMercadoMediano <= 0` são EXCLUÍDOS da contagem (P1 da auditoria: "R$ 0,00" exibido como preço real).
12. **`Table` já tem wrapper `overflow-x-auto`** (`Table.tsx:11`) — as 2 colunas novas do histórico não quebram o mobile.

## Constantes de negócio (decididas AQUI — não rediscutir)

| Constante | Valor | Onde | Significado |
|---|---|---|---|
| `TOP_PRODUTOS_DASHBOARD` | `5` | dashboard-model.ts | top produtos por receita no card do bento |
| `TOLERANCIA_NA_MEDIA_PCT` | `2` | dashboard-model.ts | \|Δ%\| ≤ 2% da mediana de mercado conta como "na média" |
| `PACE_TOLERANCIA_PP` | `5` | compare.ts | ±5 pontos percentuais entre % real e % esperado = "no ritmo" |
| `MAX_CHIPS` | `3` | dashboard-model.ts | máx. de chips de atalho do último relatório |
| Limite do histórico | `50` | report.repository.ts | reusa `LIST_LIMIT` existente |
| Linha do tempo do score | mínimo `2` pontos | dashboard-model.ts | sparkline/texto só com ≥ 2 scores persistidos |
| Projeção da meta | linear `totalMes / diaDoMes × diasNoMes` | compare.ts | projeção simples de fechamento do mês |

## Contratos assumidos de G0/G1 (revalidar na task que os toca)

| Contrato | Onde | Task |
|---|---|---|
| `hojeBrt(agora?)`, `inicioDeDiaUtc(iso)`, `fimDeDiaUtc(iso)` | `src/lib/timezone.ts` (G0) | 1, 4, 6 |
| `formatData` (BRT), `formatDataUtc`/`formatPeriodo` (UTC) | `src/lib/format.ts` (G0) | 2, 4, 6 |
| `getUltimaDataPedido(orgId): Promise<Date \| null>` | `alert-data.repository.ts` (G0) | 1, 4 |
| `connections.last_sync_at` gravado pelo sync/pipeline; `getConnection` devolve `last_sync_at` | `connection.repository.ts` (G0) | 1, 4 |
| Banner conexão expirada + prop `emAndamentoReportId` no `GenerateReport` | `dashboard/page.tsx`, `generate-report.tsx` (G0 T7/T9) | 2 |
| `AnaliseIa.achados?: Achado[]` (`titulo ≤80`, `tipo`, `prioridade`, `impactoEstimadoMensalBRL`, `comoFazer[]`, `skus[]`), `destaques?` | `contracts.ts` (G1 T3) | 2 |
| `ordenarAchados(achados): { achado, indice }[]` (indice = posição ORIGINAL) | `report-view-model.ts` (G1 T3) | 2 |
| `FONTES_ANALISE` inclui `'achados'`; action valida fonte contra ele | `report-to-task.ts` (G1 T5) | 2 |
| `formatBRLCompacto`, `formatDataCurta`, `formatDiaMes` | `src/lib/format.ts` (G1 T6) | 6, 8 |
| Ids de seção do relatório: `#metricas`, `#resumo`, `#recomendacoes` | `relatorios/[id]/page.tsx` (G1 T7/T9 preserva) | 2 |
| `TruthScoreSchema`: `score`, `totalPeriodo`, `totalPeriodoAnterior` | `contracts.ts` (F3a) | 1, 3, 7 |

## File Structure

| Caminho | Ação | Task | Responsabilidade |
|---|---|---|---|
| `src/modules/reports/report.repository.ts` | mod | 1 | + `listHistoricoDashboard` (score/total extraídos no SQL) |
| `src/modules/organizations/organization-settings.repository.ts` | mod | 1 | `getTotalVendasMesCorrente` → `SUM()` no SQL + mês corrente BRT |
| `src/modules/reports/dashboard-data.ts` | criar | 1 | `getDashboardData(orgId)` — view-model único (I/O) |
| `src/modules/reports/dashboard-model.ts` | mod | 1, 2, 3, 5, 6, 7, 8 | modelos puros novos; remove `dashboardStats` (T1) e `insightsFromAnalise` (T2) |
| `src/modules/reports/compare.ts` | mod | 4 | + `paceMeta` + `PACE_TOLERANCIA_PP` |
| `src/app/(client)/dashboard/page.tsx` | mod | 1, 2, 3, 4, 5, 6, 7, 8 | consome o view-model; nova ordem por decisão |
| `src/app/(client)/dashboard/stat-cards.tsx` | mod | 1, 8 | formato `'pct'`; fix overflow mobile |
| `src/app/(client)/dashboard/insights-marquee.tsx` | **remover** | 2 | substituído pelos chips estáticos |
| `src/app/(client)/dashboard/insight-chips.tsx` | criar | 2 | chips com link p/ seções do relatório |
| `src/app/(client)/dashboard/acao-principal.tsx` | criar | 2 | card "Ação nº 1" com Virar tarefa |
| `src/app/(client)/dashboard/truth-score-card.tsx` | mod | 3 | sparkline + texto da linha do tempo + "Ver histórico" |
| `src/app/(client)/dashboard/meta-progress.tsx` | mod | 4 | pace + projeção + empty state + "dados até" |
| `src/app/(client)/dashboard/bento-cards.tsx` | criar | 5 | top produtos, posição de preço, resumo executivo |
| `src/app/(client)/dashboard/dashboard-charts.tsx` | mod | 8 | eixo compacto + tooltip BRL cheio + srSummary |
| `src/components/ui/charts/LineChart.tsx` | mod | 8 | + props opcionais `srSummary`/`formatTooltip` (aditivo) |
| `src/components/app-shell.tsx` | mod | 8 | gutter único (remove `px-4` do wrapper de conteúdo) |
| `src/components/tasks/KanbanBoard.tsx` | mod | 8 | `md:grid-cols-3 xl:grid-cols-5` (só classes) |
| `tests/unit/dashboard-model.test.ts` | mod | 1, 2, 3, 5, 6, 7, 8 | modelos novos |
| `tests/unit/pace-meta.test.ts` | criar | 4 | `paceMeta` |
| `tests/integration/dashboard-data.test.ts` | criar | 1 | view-model + query do histórico |
| `tests/integration/organization-settings.test.ts` | mod | 1 | seeds do mês em BRT |

**Dependências entre tasks:** 1→{2,3,4,5,6,7} (view-model/dados), 2→{3,4,5,6,7} (page reordenada é a base dos edits pontuais). Ordem de execução = ordem numérica. Task 8 só depende da 2 (page). Task 9 fecha.

---

### Task 1: View-model único do dashboard + dedupe de queries + SUM no SQL + stat "Variação vs análise anterior"

**Files:**
- Modify: `src/modules/reports/report.repository.ts` (+ `listHistoricoDashboard`)
- Modify: `src/modules/organizations/organization-settings.repository.ts` (`getTotalVendasMesCorrente` v2)
- Create: `src/modules/reports/dashboard-data.ts`
- Modify: `src/modules/reports/dashboard-model.ts` (+ `statCardsModel`; − `dashboardStats`)
- Modify: `src/app/(client)/dashboard/stat-cards.tsx` (formato `'pct'`)
- Modify: `src/app/(client)/dashboard/page.tsx` (troca da camada de dados — edits pontuais)
- Test: `tests/unit/dashboard-model.test.ts` (mod), `tests/integration/dashboard-data.test.ts` (novo), `tests/integration/organization-settings.test.ts` (mod)

**Interfaces:**
- Consumes: `summaryColumns`/`summaryRowToSummary`/`LIST_LIMIT` (privados de `report.repository.ts` — reusar, não duplicar); `getUltimosDoneDetalhados(orgId, 2)`; `getConnection(orgId)`; `getOrganizationById(orgId)` (`ClientOrganization`); `getOrgSettings(orgId)`; `listTrackedProducts(orgId)`; `listAlertasAbertos(orgId)` (`AlertaAberto`); `getUltimaDataPedido(orgId)` (G0); `listTaskTitulosByReport(reportId, orgId)` de `task.repository.ts`; `hojeBrt`/`inicioDeDiaUtc`/`fimDeDiaUtc` (G0); `deltaNumero`/`totalVendas`/`totalPedidos` de `compare.ts`.
- Produces:

```ts
// report.repository.ts
export type HistoricoDashboardRow = ReportSummary & {
  score: number | null;        // metricas->'truth_score'->>'score' (SQL)
  totalPeriodo: number | null; // metricas->'truth_score'->>'totalPeriodo' (SQL)
};
export async function listHistoricoDashboard(orgId: string, limite?: number): Promise<HistoricoDashboardRow[]>;

// organization-settings.repository.ts — MESMA assinatura, SUM no SQL + mês BRT
export async function getTotalVendasMesCorrente(orgId: string, agora?: Date): Promise<number>;

// dashboard-data.ts
export type DashboardData = {
  conn: { status: string; connected: boolean; expira_em: Date | null; last_sync_at: Date | null } | null;
  org: ClientOrganization | null;
  settings: { geracaoAutomatica: boolean; metaMensal: number | null } | null;
  historico: HistoricoDashboardRow[];
  latest: ReportSummary | null;      // = historico[0] (dedupe de getLatestReport)
  latestDone: ReportDetail | null;   // = donesRecentes[0] (dedupe de getLatestDoneReport)
  doneAnterior: ReportDetail | null; // = donesRecentes[1]
  temProdutos: boolean;
  alertas: AlertaAberto[];
  totalMes: number;
  titulosTasksUltimoDone: string[];
  ultimaDataPedido: Date | null;
};
export async function getDashboardData(orgId: string): Promise<DashboardData>;

// dashboard-model.ts (dashboardStats REMOVIDO — substituído por este)
export type StatItemModel = { label: string; value: number; format: 'brl' | 'int' | 'pct'; spark?: number[] };
export function statCardsModel(atual: Metricas, anterior: Metricas | null): StatItemModel[];
```

- [ ] **Step 1 — teste unit do model falhando.** Em `tests/unit/dashboard-model.test.ts`, SUBSTITUIR o teste de `dashboardStats` (mantendo o de `insightsFromAnalise` — ele só sai na Task 2) por:

```ts
import { describe, expect, it } from 'vitest';

import { insightsFromAnalise, statCardsModel } from '@/modules/reports/dashboard-model';
import type { AnaliseIa, Metricas, TruthScore } from '@/modules/pipeline/contracts';

const SCORE: TruthScore = {
  score: 76,
  totalPeriodo: 1000,
  totalPeriodoAnterior: 800,
  fatores: {
    crescimento: { pontos: 20, max: 25, variacaoPercentual: 25 },
    posicaoPreco: { pontos: 20, max: 25, itensAvaliados: 2 },
    diversificacao: { pontos: 15, max: 20, canaisComVenda: 2 },
    regularidade: { pontos: 15, max: 20, diasComVenda: 6, diasPeriodo: 7 },
    cobertura: { pontos: 6, max: 10, produtosComBenchmark: 1, produtosAvaliados: 2 },
  },
};

function metricas(over: Partial<Metricas>): Metricas {
  return {
    vendasPorCanal: [
      { canal: 'Mercado Livre', total: 600, pedidos: 6 },
      { canal: 'Shopee', total: 400, pedidos: 4 },
    ],
    evolucao: [
      { data: '2026-06-01', total: 700 },
      { data: '2026-06-15', total: 300 },
    ],
    ticketMedio: 100,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
    ...over,
  };
}

describe('statCardsModel', () => {
  it('com relatório anterior → 4 cards e o 4º é a variação % vs anterior', () => {
    const anterior = metricas({ evolucao: [{ data: '2026-05-01', total: 800 }] });
    const itens = statCardsModel(metricas({}), anterior);
    expect(itens.map((i) => i.label)).toEqual([
      'Faturamento do período',
      'Pedidos',
      'Ticket médio',
      'Variação vs análise anterior',
    ]);
    expect(itens[0]).toEqual({
      label: 'Faturamento do período',
      value: 1000, // totalVendas = soma de evolucao (fonte de verdade do compare.ts)
      format: 'brl',
      spark: [700, 300],
    });
    expect(itens[1]).toEqual({ label: 'Pedidos', value: 10, format: 'int' });
    expect(itens[3]).toEqual({ label: 'Variação vs análise anterior', value: 25, format: 'pct' });
  });

  it('sem anterior mas com truth_score → fallback via totalPeriodoAnterior', () => {
    const itens = statCardsModel(metricas({ truth_score: SCORE }), null);
    expect(itens[3]).toEqual({ label: 'Variação vs análise anterior', value: 25, format: 'pct' });
  });

  it('relatório antigo sem anterior nem score → só 3 cards (nunca métrica de vaidade)', () => {
    expect(statCardsModel(metricas({}), null)).toHaveLength(3);
  });

  it('anterior com total 0 → deltaPct null → card de variação omitido', () => {
    const anterior = metricas({ evolucao: [] });
    expect(statCardsModel(metricas({}), anterior)).toHaveLength(3);
  });
});

describe('insightsFromAnalise (removido na Task 2 — mantido até lá)', () => {
  const ANALISE: AnaliseIa = {
    resumoExecutivo: 'ok',
    gargalos: ['Frete caro'],
    sugestoesMelhoria: ['Negociar tarifa'],
    ideiasVenda: ['Kit promocional'],
    recomendacoesPreco: [],
  };

  it('prefixa por origem', () => {
    expect(insightsFromAnalise(ANALISE)[0]).toBe('Gargalo: Frete caro');
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/dashboard-model.test.ts` (FALHA: `statCardsModel` não existe).
- [ ] **Step 3 — implementar o model.** Em `src/modules/reports/dashboard-model.ts`, REMOVER `dashboardStats` + `DashboardStats` e adicionar:

```ts
import { deltaNumero, totalPedidos, totalVendas } from '@/modules/reports/compare';

export type StatItemModel = {
  label: string;
  value: number;
  format: 'brl' | 'int' | 'pct';
  spark?: number[];
};

/**
 * Cards de stats do bento (pura). Substitui o antigo "Relatórios gerados"
 * (métrica de vaidade que congelava em 50 — LIST_LIMIT) por "Variação vs
 * análise anterior": deltaPct do total vs o done anterior, com fallback via
 * truth_score.totalPeriodoAnterior (mesma lógica do heroKpis da G1).
 * Sem base de comparação → devolve só 3 cards (nunca um número enganoso).
 */
export function statCardsModel(atual: Metricas, anterior: Metricas | null): StatItemModel[] {
  const itens: StatItemModel[] = [
    {
      label: 'Faturamento do período',
      value: totalVendas(atual),
      format: 'brl',
      spark: atual.evolucao.map((e) => e.total),
    },
    { label: 'Pedidos', value: totalPedidos(atual), format: 'int' },
    { label: 'Ticket médio', value: atual.ticketMedio, format: 'brl' },
  ];

  const ts = atual.truth_score;
  let deltaPct: number | null = null;
  if (anterior) {
    deltaPct = deltaNumero(totalVendas(atual), totalVendas(anterior)).deltaPct;
  } else if (ts && ts.totalPeriodoAnterior !== null && ts.totalPeriodoAnterior !== 0) {
    deltaPct = deltaNumero(ts.totalPeriodo, ts.totalPeriodoAnterior).deltaPct;
  }
  if (deltaPct !== null) {
    itens.push({ label: 'Variação vs análise anterior', value: deltaPct, format: 'pct' });
  }
  return itens;
}
```

Rodar de novo: `npm run test -- tests/unit/dashboard-model.test.ts` (PASSA).

- [ ] **Step 4 — teste de integração falhando.** Criar `tests/integration/dashboard-data.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { connections, orders, organizations, reports } from '@/db/schema';
import { hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-dash-vm-';
const DIA = 86_400_000;

function metricasComScore(total: number, score: number, totalAnterior: number | null) {
  return {
    vendasPorCanal: [{ canal: 'shopee', total, pedidos: 10 }],
    evolucao: [{ data: '2026-06-01', total }],
    ticketMedio: total / 10,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
    truth_score: {
      score,
      totalPeriodo: total,
      totalPeriodoAnterior: totalAnterior,
      fatores: {
        crescimento: { pontos: 10, max: 25, variacaoPercentual: 10 },
        posicaoPreco: { pontos: 10, max: 25, itensAvaliados: 1 },
        diversificacao: { pontos: 10, max: 20, canaisComVenda: 1 },
        regularidade: { pontos: 10, max: 20, diasComVenda: 5, diasPeriodo: 7 },
        cobertura: { pontos: 5, max: 10, produtosComBenchmark: 1, produtosAvaliados: 1 },
      },
    },
  };
}

describe.skipIf(!url)('getDashboardData — view-model único do dashboard', () => {
  let orgId = '';
  let outraOrgId = '';
  let doneRecenteId = '';
  let failedId = '';

  beforeAll(async () => {
    const agora = new Date();
    const [org] = await db
      .insert(organizations)
      .values({
        name: `${PREFIX}org-${RUN}`,
        status: 'active',
        plano: 'weekly',
        meta_mensal: '45000.00',
      })
      .returning({ id: organizations.id });
    orgId = org!.id;

    await db.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: 'tok-fake',
      refresh_token: 'rt-fake',
      status: 'ok',
      expira_em: new Date(agora.getTime() + 30 * DIA),
      last_sync_at: agora,
    });

    // 3 relatórios: done antigo (58/800) → done recente (76/1000) → failed (mais novo)
    const base = { org_id: orgId, periodo_inicio: new Date(agora.getTime() - 8 * DIA), periodo_fim: new Date(agora.getTime() - DIA) };
    const [antigo] = await db
      .insert(reports)
      .values({ ...base, status: 'done', metricas: metricasComScore(800, 58, null), created_at: new Date(agora.getTime() - 3 * DIA) })
      .returning({ id: reports.id });
    const [recente] = await db
      .insert(reports)
      .values({ ...base, status: 'done', metricas: metricasComScore(1000, 76, 800), created_at: new Date(agora.getTime() - 2 * DIA) })
      .returning({ id: reports.id });
    doneRecenteId = recente!.id;
    const [failed] = await db
      .insert(reports)
      .values({ ...base, status: 'failed', erro: 'coleta_falhou', created_at: new Date(agora.getTime() - DIA) })
      .returning({ id: reports.id });
    failedId = failed!.id;
    void antigo;

    // Pedidos: 2 no mês corrente BRT (100.50 + 200) e 1 no mês anterior (999 — fora da soma)
    const hoje = hojeBrt(agora);
    const inicioMes = inicioDeDiaUtc(`${hoje.slice(0, 7)}-01`);
    const mesAnterior = new Date(inicioMes.getTime() - 15 * DIA);
    await db.insert(orders).values([
      { org_id: orgId, bling_order_id: `${PREFIX}${RUN}-1`, canal: 'shopee', data: inicioMes, valor_total: '100.50', itens: [] },
      { org_id: orgId, bling_order_id: `${PREFIX}${RUN}-2`, canal: 'shopee', data: inicioMes, valor_total: '200.00', itens: [] },
      { org_id: orgId, bling_order_id: `${PREFIX}${RUN}-3`, canal: 'shopee', data: mesAnterior, valor_total: '999.00', itens: [] },
    ]);

    // Outra org (isolamento multi-tenant)
    const [org2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}outra-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    outraOrgId = org2!.id;
    await db.insert(reports).values({
      org_id: outraOrgId,
      status: 'done',
      periodo_inicio: base.periodo_inicio,
      periodo_fim: base.periodo_fim,
      metricas: metricasComScore(5000, 90, null),
    });
  });

  afterAll(async () => {
    await db.delete(orders).where(eq(orders.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, outraOrgId));
    await db.delete(connections).where(eq(connections.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(organizations).where(eq(organizations.id, outraOrgId));
  });

  it('listHistoricoDashboard: desc, score/totalPeriodo extraídos no SQL, sem vazar outra org', async () => {
    const { listHistoricoDashboard } = await import('@/modules/reports/report.repository');
    const rows = await listHistoricoDashboard(orgId);
    expect(rows).toHaveLength(3);
    expect(rows[0].id).toBe(failedId);
    expect(rows[0].score).toBeNull(); // failed sem metricas
    expect(rows[1]).toMatchObject({ id: doneRecenteId, score: 76, totalPeriodo: 1000 });
    expect(rows[2]).toMatchObject({ score: 58, totalPeriodo: 800 });
  });

  it('getDashboardData: dedupe (latest=historico[0], latestDone/doneAnterior), SUM do mês BRT e settings', async () => {
    const { getDashboardData } = await import('@/modules/reports/dashboard-data');
    const data = await getDashboardData(orgId);

    expect(data.latest?.id).toBe(failedId); // mais recente de QUALQUER status
    expect(data.latestDone?.id).toBe(doneRecenteId); // done mais recente COM jsonb
    expect(data.latestDone?.metricas?.truth_score?.score).toBe(76);
    expect(data.doneAnterior?.metricas?.truth_score?.score).toBe(58);
    expect(data.totalMes).toBe(300.5); // SUM() no SQL, só o mês corrente BRT
    expect(data.settings).toEqual({ geracaoAutomatica: true, metaMensal: 45000 });
    expect(data.conn?.connected).toBe(true);
    expect(data.conn?.last_sync_at).not.toBeNull();
    expect(data.temProdutos).toBe(false);
    expect(data.alertas).toEqual([]);
    expect(data.titulosTasksUltimoDone).toEqual([]); // sem analiseIa no seed → sem consulta de tasks
    expect(data.historico.every((r) => [failedId, doneRecenteId].includes(r.id) || r.score === 58)).toBe(true);
  });
});
```

- [ ] **Step 5 — rodar e ver falhar:** `npm run test -- tests/integration/dashboard-data.test.ts` (FALHA: módulos não existem).
- [ ] **Step 6 — implementar `listHistoricoDashboard`.** Em `src/modules/reports/report.repository.ts`, adicionar `sql` ao import da linha 1 (`import { and, desc, eq, gt, ne, sql } from 'drizzle-orm';`) e acrescentar após `getLatestReport`:

```ts
export type HistoricoDashboardRow = ReportSummary & {
  /** Extraído no SQL de metricas->'truth_score'->>'score' (null p/ failed/antigo). */
  score: number | null;
  /** Extraído no SQL de metricas->'truth_score'->>'totalPeriodo'. */
  totalPeriodo: number | null;
};

/**
 * Histórico do dashboard em UMA query leve: summaries + score/faturamento do
 * Truth Score extraídos do jsonb NO BANCO (sem puxar metricas/analise_ia
 * inteiros). Serve o histórico, o `latest` (primeira linha) e a linha do
 * tempo do score. Desc por created_at; escopado por org_id.
 */
export async function listHistoricoDashboard(
  orgId: string,
  limite = LIST_LIMIT,
): Promise<HistoricoDashboardRow[]> {
  const rows = await db
    .select({
      ...summaryColumns,
      score: sql<string | null>`(${reports.metricas}->'truth_score'->>'score')`,
      total_periodo: sql<string | null>`(${reports.metricas}->'truth_score'->>'totalPeriodo')`,
    })
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at))
    .limit(limite);
  return rows.map((row) => ({
    ...summaryRowToSummary(row),
    score: row.score === null ? null : Number(row.score),
    totalPeriodo: row.total_periodo === null ? null : Number(row.total_periodo),
  }));
}
```

- [ ] **Step 7 — `getTotalVendasMesCorrente` v2.** Substituir a função em `src/modules/organizations/organization-settings.repository.ts` (trocar a linha 1 por `import { and, eq, gte, lte, sql } from 'drizzle-orm';` e adicionar `import { fimDeDiaUtc, hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';`):

```ts
/**
 * Soma de orders.valor_total do mês corrente — SUM() NO BANCO (antes puxava
 * todas as linhas e somava em JS). Mês corrente decidido pelo calendário
 * America/Sao_Paulo (G0): fronteiras dos dias codificadas em UTC, mesma
 * convenção de orders.data (data pura do Bling = meia-noite UTC).
 */
export async function getTotalVendasMesCorrente(orgId: string, agora: Date = new Date()): Promise<number> {
  const hoje = hojeBrt(agora);
  const inicioMes = inicioDeDiaUtc(`${hoje.slice(0, 7)}-01`);
  const fimHoje = fimDeDiaUtc(hoje);
  const [row] = await db
    .select({ total: sql<string | null>`coalesce(sum(${orders.valor_total}), '0')` })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), gte(orders.data, inicioMes), lte(orders.data, fimHoje)));
  return Math.round(Number(row?.total ?? 0) * 100) / 100;
}
```

Atualizar `tests/integration/organization-settings.test.ts` (o seed usava o mês UTC — flake nas 3 primeiras horas do dia 1º): adicionar `import { hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';` no topo e substituir as linhas 71-73:

```ts
    const agora = new Date();
    const inicioMesCorrente = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
    const mesAnterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 15));
```

por:

```ts
    const agora = new Date();
    const inicioMesCorrente = inicioDeDiaUtc(`${hojeBrt(agora).slice(0, 7)}-01`);
    const mesAnterior = new Date(inicioMesCorrente.getTime() - 15 * 86_400_000);
```

(expectativa `300.5` inalterada).

- [ ] **Step 8 — view-model.** Criar `src/modules/reports/dashboard-data.ts`:

```ts
import { getOrganizationById, type ClientOrganization } from '@/modules/admin/admin.repository';
import { getUltimaDataPedido } from '@/modules/alerts/alert-data.repository';
import { listAlertasAbertos, type AlertaAberto } from '@/modules/alerts/alert.repository';
import { getConnection } from '@/modules/connections/connection.repository';
import {
  getOrgSettings,
  getTotalVendasMesCorrente,
} from '@/modules/organizations/organization-settings.repository';
import { listTaskTitulosByReport } from '@/modules/tasks/task.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';

import {
  getUltimosDoneDetalhados,
  listHistoricoDashboard,
  type HistoricoDashboardRow,
} from './report.repository';
import type { ReportDetail, ReportSummary } from './report.types';

export type DashboardData = {
  conn: Awaited<ReturnType<typeof getConnection>>;
  org: ClientOrganization | null;
  settings: { geracaoAutomatica: boolean; metaMensal: number | null } | null;
  historico: HistoricoDashboardRow[];
  latest: ReportSummary | null;
  latestDone: ReportDetail | null;
  doneAnterior: ReportDetail | null;
  temProdutos: boolean;
  alertas: AlertaAberto[];
  totalMes: number;
  titulosTasksUltimoDone: string[];
  ultimaDataPedido: Date | null;
};

/**
 * View-model único do dashboard (Promise.all preservado). Dedupe das queries
 * da page antiga: getLatestReport ≡ historico[0] e getLatestDoneReport ≡
 * getUltimosDoneDetalhados[0] (evidência: page.tsx:38-50 pré-G2). Os jsonb
 * pesados só são puxados para os 2 últimos done (score card, stats, charts,
 * ação nº 1); o histórico usa extração no SQL.
 */
export async function getDashboardData(orgId: string): Promise<DashboardData> {
  const [historico, conn, org, donesRecentes, produtos, alertas, settings, totalMes, ultimaDataPedido] =
    await Promise.all([
      listHistoricoDashboard(orgId),
      getConnection(orgId),
      getOrganizationById(orgId),
      getUltimosDoneDetalhados(orgId, 2),
      listTrackedProducts(orgId),
      listAlertasAbertos(orgId),
      getOrgSettings(orgId),
      getTotalVendasMesCorrente(orgId),
      getUltimaDataPedido(orgId),
    ]);

  const latestDone = donesRecentes[0] ?? null;
  // Dependente do latestDone — fora do Promise.all de propósito.
  const titulosTasksUltimoDone = latestDone?.analiseIa
    ? await listTaskTitulosByReport(latestDone.id, orgId)
    : [];

  const primeiro = historico[0] ?? null;
  const latest: ReportSummary | null = primeiro
    ? {
        id: primeiro.id,
        status: primeiro.status,
        periodoInicio: primeiro.periodoInicio,
        periodoFim: primeiro.periodoFim,
        createdAt: primeiro.createdAt,
      }
    : null;

  return {
    conn,
    org,
    settings,
    historico,
    latest,
    latestDone,
    doneAnterior: donesRecentes[1] ?? null,
    temProdutos: produtos.length > 0,
    alertas,
    totalMes,
    titulosTasksUltimoDone,
    ultimaDataPedido,
  };
}
```

- [ ] **Step 9 — rodar e ver passar:** `npm run test -- tests/integration/dashboard-data.test.ts tests/integration/organization-settings.test.ts` (PASSA).
- [ ] **Step 10 — stat-cards com formato `'pct'`.** Em `src/app/(client)/dashboard/stat-cards.tsx`, trocar o tipo e o `StatValue`:

```tsx
export type StatItem = {
  label: string;
  value: number;
  format: 'brl' | 'int' | 'pct';
  spark?: number[];
};

function StatValue({ value, format }: { value: number; format: 'brl' | 'int' | 'pct' }) {
  const v = useCountUp(value);
  if (format === 'pct') {
    const positivo = value >= 0;
    return (
      <span
        className={`font-mono text-2xl font-bold ${positivo ? 'text-brand' : 'text-danger-fg'}`}
      >
        {positivo ? '▲ +' : '▼ '}
        {Math.abs(value).toFixed(1).replace('.', ',')}%
      </span>
    );
  }
  return (
    <span className="font-mono text-2xl font-bold text-white">
      {format === 'brl' ? formatBRL(v) : String(Math.round(v))}
    </span>
  );
}
```

(o `useCountUp` continua chamado incondicionalmente — regra dos hooks; o pct renderiza o valor final direto, sem count-up, para não animar um delta negativo de forma confusa).

- [ ] **Step 11 — page consome o view-model (edits pontuais; a reordenação é a Task 2).** Em `src/app/(client)/dashboard/page.tsx`:
  1. Trocar os imports de dados: remover `getLatestDoneReport, getLatestReport, getUltimosDoneDetalhados, listReports` (de `report.repository`), `dashboardStats` (de `dashboard-model`), `getConnection`, `getOrganizationById`, `getOrgSettings, getTotalVendasMesCorrente`, `listTrackedProducts`, `listAlertasAbertos`; adicionar `import { getDashboardData } from '@/modules/reports/dashboard-data';` e `import { statCardsModel } from '@/modules/reports/dashboard-model';`.
  2. Substituir o bloco `const [latest, reports, conn, org, latestDone, produtos, donesRecentes, alertas, settings, totalMes] = await Promise.all([...]);` (linhas 38-50 pré-G2 — revalidar pós-G0) por:

```ts
  const data = await getDashboardData(access.orgId);
  const { alertas, conn, doneAnterior, historico, latest, latestDone, org, settings, totalMes } = data;
```

  3. Renomear os usos: `reports.length` → `historico.length` (checklist e histórico), `reports.map` → `historico.map`, `donesRecentes[0]` → `latestDone`, `donesRecentes[1]` → `doneAnterior`, `produtos.length > 0` → `data.temProdutos`.
  4. Substituir o bloco de stats (`const stats = ...` some; o `<StatCards items={[...]} />` vira):

```tsx
      {latestDone?.metricas ? (
        <StatCards items={statCardsModel(latestDone.metricas, doneAnterior?.metricas ?? null)} />
      ) : null}
```

  5. **Preservar intocados** o banner da G0, a prop `emAndamentoReportId` do `GenerateReport` (G0/T9) e todos os testids.
- [ ] **Step 12 — regressão:** `npm run test` completo + `npm run typecheck` (zero regressões; o unit antigo de `dashboardStats` já foi substituído no Step 1).
- [ ] **Step 13 — commit:** `feat(g2): view-model unico do dashboard + historico com score no sql + sum do mes em brt + stat de variacao vs anterior`

---

### Task 2: Reordenação por decisão + chips estáticos (fim do marquee) + card "Ação nº 1"

**Files:**
- Modify: `src/modules/reports/dashboard-model.ts` (+ `chipsDoRelatorio`, `acaoNumeroUm`; − `insightsFromAnalise`)
- Create: `src/app/(client)/dashboard/insight-chips.tsx`
- Create: `src/app/(client)/dashboard/acao-principal.tsx`
- Delete: `src/app/(client)/dashboard/insights-marquee.tsx`
- Modify: `src/app/(client)/dashboard/page.tsx` (reescrita — nova ordem)
- Test: `tests/unit/dashboard-model.test.ts` (mod)

**Interfaces:**
- Consumes: `ordenarAchados(achados)` de `report-view-model.ts` (G1 — `indice` = posição ORIGINAL, exigido pelo form da action); `tituloFromItem(texto)` de `report-to-task.ts`; `createTasksFromReportAction` (F2/G1 — `formData: reportId + itens` JSON `{fonte, indice}[]`, fonte validada contra `FONTES_ANALISE` que inclui `'achados'` pós-G1); `useToast` de `@/components/ui/Toast`; `ReportDetail`; ids `#metricas`/`#resumo`/`#recomendacoes` da página do relatório (G1 preserva); banner G0 + prop `emAndamentoReportId` (G0 T7/T9 — **revalidar nomes reais no master antes de reescrever a page**).
- Produces:

```ts
// dashboard-model.ts
export type ChipRelatorio = { label: string; href: string };
export function chipsDoRelatorio(latestDone: ReportDetail | null): ChipRelatorio[]; // máx 3; [] sem done

export type AcaoPrincipal = {
  titulo: string;          // achado.titulo (v2) ou tituloFromItem(gargalos[0]) (legado)
  descricao: string | null;
  impactoBRL: number | null;
  fonte: 'achados' | 'gargalos';
  indice: number;          // posição ORIGINAL no array (contrato da action)
};
export function acaoNumeroUm(analise: AnaliseIa | null): AcaoPrincipal | null;
```

```tsx
// insight-chips.tsx (server)
export function InsightChips(props: { chips: ChipRelatorio[] }): JSX.Element | null; // testid insight-chips

// acao-principal.tsx ('use client')
export function AcaoPrincipalCard(props: {
  reportId: string;
  acao: AcaoPrincipal;
  jaExiste: boolean;
}): JSX.Element; // testids: acao-principal, acao-principal-virar-task
```

- [ ] **Step 1 — testes unit falhando.** Em `tests/unit/dashboard-model.test.ts`: REMOVER o describe de `insightsFromAnalise` (e o import) e ADICIONAR:

```ts
import { acaoNumeroUm, chipsDoRelatorio } from '@/modules/reports/dashboard-model';
import type { Achado, AnaliseIa } from '@/modules/pipeline/contracts';
import type { ReportDetail } from '@/modules/reports/report.types';

function detail(over: Partial<ReportDetail>): ReportDetail {
  return {
    id: 'r-1',
    status: 'done',
    periodoInicio: new Date('2026-06-01T00:00:00Z'),
    periodoFim: new Date('2026-06-30T23:59:59Z'),
    createdAt: new Date('2026-07-01T12:00:00Z'),
    metricas: metricas({}),
    analiseIa: null,
    erro: null,
    ...over,
  };
}

function achado(over: Partial<Achado>): Achado {
  return {
    titulo: 'Achado',
    descricao: 'Descrição.',
    tipo: 'outro',
    prioridade: 'media',
    impactoEstimadoMensalBRL: null,
    comoFazer: [],
    skus: [],
    ...over,
  };
}

const ANALISE_BASE: AnaliseIa = {
  resumoExecutivo: 'ok',
  gargalos: ['Frete caro no Mercado Livre'],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe('chipsDoRelatorio', () => {
  it('done com análise → 3 chips apontando para as seções do relatório', () => {
    const chips = chipsDoRelatorio(detail({ analiseIa: ANALISE_BASE }));
    expect(chips).toEqual([
      { label: 'Métricas do período', href: '/dashboard/relatorios/r-1#metricas' },
      { label: 'Análise da IA', href: '/dashboard/relatorios/r-1#resumo' },
      { label: 'Recomendações', href: '/dashboard/relatorios/r-1#recomendacoes' },
    ]);
  });

  it('done sem análise → só o chip de métricas; sem done → []', () => {
    expect(chipsDoRelatorio(detail({}))).toEqual([
      { label: 'Métricas do período', href: '/dashboard/relatorios/r-1#metricas' },
    ]);
    expect(chipsDoRelatorio(null)).toEqual([]);
    expect(chipsDoRelatorio(detail({ metricas: null }))).toEqual([]);
  });
});

describe('acaoNumeroUm', () => {
  it('com achados v2 → melhor achado por impacto, com índice ORIGINAL', () => {
    const analise: AnaliseIa = {
      ...ANALISE_BASE,
      achados: [
        achado({ titulo: 'Menor', impactoEstimadoMensalBRL: 100 }),
        achado({ titulo: 'Maior', impactoEstimadoMensalBRL: 2000, descricao: 'Vale muito.' }),
      ],
    };
    expect(acaoNumeroUm(analise)).toEqual({
      titulo: 'Maior',
      descricao: 'Vale muito.',
      impactoBRL: 2000,
      fonte: 'achados',
      indice: 1,
    });
  });

  it('relatório antigo → fallback gargalos[0] com fonte/indice do fluxo legado', () => {
    expect(acaoNumeroUm(ANALISE_BASE)).toEqual({
      titulo: 'Frete caro no Mercado Livre',
      descricao: null,
      impactoBRL: null,
      fonte: 'gargalos',
      indice: 0,
    });
  });

  it('sem análise ou sem itens → null', () => {
    expect(acaoNumeroUm(null)).toBeNull();
    expect(acaoNumeroUm({ ...ANALISE_BASE, gargalos: [] })).toBeNull();
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/dashboard-model.test.ts` (FALHA).
- [ ] **Step 3 — implementar os modelos.** Em `src/modules/reports/dashboard-model.ts`: REMOVER `insightsFromAnalise` + `MAX_INSIGHTS` e adicionar:

```ts
import { ordenarAchados } from '@/modules/reports/report-view-model';
import type { ReportDetail } from '@/modules/reports/report.types';
import { tituloFromItem } from '@/modules/tasks/report-to-task';

export type ChipRelatorio = { label: string; href: string };

const MAX_CHIPS = 3;

/**
 * Chips estáticos de atalho para as seções do último relatório done.
 * Substitui o marquee (WCAG 2.2.2 resolvido por não haver mais animação).
 * Âncoras estáveis da página do relatório: #metricas, #resumo, #recomendacoes.
 */
export function chipsDoRelatorio(latestDone: ReportDetail | null): ChipRelatorio[] {
  if (!latestDone || latestDone.status !== 'done' || !latestDone.metricas) return [];
  const base = `/dashboard/relatorios/${latestDone.id}`;
  const chips: ChipRelatorio[] = [{ label: 'Métricas do período', href: `${base}#metricas` }];
  const a = latestDone.analiseIa;
  if (a) {
    chips.push({ label: 'Análise da IA', href: `${base}#resumo` });
    const temRecomendacoes =
      (a.achados?.length ?? 0) > 0 ||
      a.gargalos.length > 0 ||
      a.sugestoesMelhoria.length > 0 ||
      a.ideiasVenda.length > 0;
    if (temRecomendacoes) chips.push({ label: 'Recomendações', href: `${base}#recomendacoes` });
  }
  return chips.slice(0, MAX_CHIPS);
}

export type AcaoPrincipal = {
  titulo: string;
  descricao: string | null;
  impactoBRL: number | null;
  fonte: 'achados' | 'gargalos';
  indice: number;
};

/**
 * "Ação nº 1": o achado da IA de maior impacto (ordem canônica da G1) ou,
 * em relatório antigo, gargalos[0]. `indice` é a posição ORIGINAL no array —
 * contrato do createTasksFromReportAction (itens: [{fonte, indice}]).
 * `titulo` já normalizado igual ao da task criada (checagem de jaExiste).
 */
export function acaoNumeroUm(analise: AnaliseIa | null): AcaoPrincipal | null {
  if (!analise) return null;
  if (analise.achados && analise.achados.length > 0) {
    const { achado, indice } = ordenarAchados(analise.achados)[0];
    return {
      titulo: achado.titulo,
      descricao: achado.descricao,
      impactoBRL: achado.impactoEstimadoMensalBRL,
      fonte: 'achados',
      indice,
    };
  }
  if (analise.gargalos.length > 0) {
    return {
      titulo: tituloFromItem(analise.gargalos[0]),
      descricao: null,
      impactoBRL: null,
      fonte: 'gargalos',
      indice: 0,
    };
  }
  return null;
}
```

Rodar de novo (PASSA).

- [ ] **Step 4 — componente dos chips.** Criar `src/app/(client)/dashboard/insight-chips.tsx`:

```tsx
import React from 'react';

import type { ChipRelatorio } from '@/modules/reports/dashboard-model';

/** Atalhos estáticos p/ o último relatório (substitui o marquee — sem animação). */
export function InsightChips({ chips }: { chips: ChipRelatorio[] }) {
  if (chips.length === 0) return null;
  return (
    <nav
      aria-label="Atalhos do último relatório"
      data-testid="insight-chips"
      className="flex flex-wrap gap-2"
    >
      {chips.map((c) => (
        <a
          key={c.href}
          href={c.href}
          className="rounded-full border border-line bg-glass px-4 py-1.5 text-xs text-muted transition-colors hover:border-brand/40 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          {c.label} →
        </a>
      ))}
    </nav>
  );
}
```

- [ ] **Step 5 — card Ação nº 1.** Criar `src/app/(client)/dashboard/acao-principal.tsx` (mesmo fluxo do `AchadosParaTasks` da F2 — `useFormState` + toast; NÃO duplicar validação, a action já valida):

```tsx
'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { createTasksFromReportAction, type TaskActionState } from '@/actions/tasks.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/format';
import type { AcaoPrincipal } from '@/modules/reports/dashboard-model';

type State = TaskActionState & { criadas?: number };
const initial: State = {};

function VirarTarefaButton({ jaExiste }: { jaExiste: boolean }) {
  const { pending } = useFormStatus();
  if (jaExiste) {
    return (
      <Button type="button" variant="secondary" size="sm" disabled data-testid="acao-principal-virar-task">
        Task criada ✓
      </Button>
    );
  }
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending} data-testid="acao-principal-virar-task">
      {pending ? 'Criando…' : 'Virar tarefa'}
    </Button>
  );
}

/** "Ação nº 1" da IA no topo do dashboard, com conversão em task no fluxo F2/G1. */
export function AcaoPrincipalCard({
  reportId,
  acao,
  jaExiste,
}: {
  reportId: string;
  acao: AcaoPrincipal;
  jaExiste: boolean;
}) {
  const [state, action] = useFormState(createTasksFromReportAction, initial);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && typeof state.criadas === 'number') {
      toast({ variant: 'success', title: 'Tarefa criada no Plano de Ação' });
    }
  }, [state, toast]);

  return (
    <Card data-testid="acao-principal" className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-brand">Ação nº 1</p>
        {acao.impactoBRL !== null ? (
          <Badge variant="success">até {formatBRL(acao.impactoBRL)}/mês</Badge>
        ) : null}
      </div>
      <p className="text-sm font-medium leading-relaxed text-white">{acao.titulo}</p>
      {acao.descricao ? <p className="text-sm text-muted">{acao.descricao}</p> : null}
      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}
      <form action={action} className="mt-auto">
        <input type="hidden" name="reportId" value={reportId} />
        <input
          type="hidden"
          name="itens"
          value={JSON.stringify([{ fonte: acao.fonte, indice: acao.indice }])}
        />
        <VirarTarefaButton jaExiste={jaExiste} />
      </form>
    </Card>
  );
}
```

- [ ] **Step 6 — reescrever a page na ordem por decisão.** ANTES: reler `src/app/(client)/dashboard/page.tsx` no master e anotar EXATAMENTE o bloco do banner G0 e a derivação/prop do stepper (G0 T9) — a reescrita abaixo assume `emAndamentoReportId`; se o nome/mecânica divergirem, portar o que estiver no master. Substituir o conteúdo por:

```tsx
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { STATUS_LABEL, reportStatusVariant } from '@/modules/reports/report.types';
import { getDashboardData } from '@/modules/reports/dashboard-data';
import { acaoNumeroUm, chipsDoRelatorio, statCardsModel } from '@/modules/reports/dashboard-model';
import { podeGerar } from '@/modules/pipeline/plan-lock';
import { progressoMeta } from '@/modules/reports/compare';
import { formatData, formatPeriodo } from '@/lib/format';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { GenerateReport } from './generate-report';
import { StatCards } from './stat-cards';
import { InsightChips } from './insight-chips';
import { DashboardCharts } from './dashboard-charts';
import { OnboardingChecklist } from './onboarding-checklist';
import { TruthScoreCard } from './truth-score-card';
import { AlertasSection } from './alertas-section';
import { MetaProgress } from './meta-progress';
import { AcaoPrincipalCard } from './acao-principal';

export default async function DashboardPage() {
  const access = await requireActiveOrg();
  const data = await getDashboardData(access.orgId);
  const { alertas, conn, doneAnterior, historico, latest, latestDone, org, settings, totalMes } = data;

  const metaAtual = settings?.metaMensal ?? null;
  const progresso = progressoMeta(totalMes, metaAtual);

  const blingOk = !!conn?.connected;
  const gate = org ? podeGerar(org) : { ok: false as const, motivo: 'org_nao_encontrada' };
  const canGenerate = blingOk && gate.ok;

  let motivo: string | undefined;
  if (!canGenerate) {
    if (!org) {
      motivo = 'Organização não encontrada. Recarregue a página.';
    } else if (!blingOk) {
      motivo = 'Conecte o Bling em Conexões.';
    } else if (!gate.ok) {
      if (gate.motivo === 'ciclo_em_andamento') {
        const proxData = org.proximo_relatorio_liberado_em;
        motivo = proxData
          ? `Próximo relatório liberado em ${formatData(proxData)}.`
          : 'O próximo relatório ainda não foi liberado.';
      } else if (gate.motivo === 'sem_plano') {
        motivo = 'Nenhum plano definido.';
      } else {
        motivo = 'Organização inativa.';
      }
    }
  }

  const chips = chipsDoRelatorio(latestDone);
  const acao = latestDone ? acaoNumeroUm(latestDone.analiseIa) : null;
  // Stepper retomável (G0/Task 9) — relatório em andamento remonta o progresso.
  const emAndamentoReportId =
    latest && (latest.status === 'queued' || latest.status === 'running') ? latest.id : null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Dashboard</h1>

      {/* 1. Conexão expirada — persistente até reconectar (G0/Task 7) */}
      {conn && conn.status === 'expirado' ? (
        <Alert variant="danger" title="Sua conexão com o Bling expirou">
          Seus dados de vendas pararam de atualizar e os relatórios automáticos foram pausados.{' '}
          <a href="/conexoes" className="font-medium underline underline-offset-2">
            Reconectar em Conexões →
          </a>
        </Alert>
      ) : null}

      {/* 2. Alertas abertos — a decisão mais urgente primeiro */}
      <AlertasSection alertas={alertas} />

      {/* 3. Como está minha loja: Truth Score + Ação nº 1 da IA */}
      {latestDone?.metricas?.truth_score || acao ? (
        <section data-testid="como-esta-minha-loja" className="grid gap-4 lg:grid-cols-2">
          <TruthScoreCard atual={latestDone} anterior={doneAnterior} />
          {acao && latestDone ? (
            <AcaoPrincipalCard
              reportId={latestDone.id}
              acao={acao}
              jaExiste={data.titulosTasksUltimoDone.includes(acao.titulo)}
            />
          ) : null}
        </section>
      ) : null}

      {/* 4. Meta do mês — só depois da primeira análise (org nova = onboarding) */}
      {historico.length > 0 ? (
        <MetaProgress progresso={progresso} meta={metaAtual} totalMes={totalMes} />
      ) : null}

      {/* 5. Primeiros passos — o componente se esconde sozinho quando completo */}
      <OnboardingChecklist
        blingOk={blingOk}
        temProdutos={data.temProdutos}
        temRelatorio={historico.length > 0}
      />

      {/* 6. Números do último período + atalhos para o relatório */}
      <InsightChips chips={chips} />
      {latestDone?.metricas ? (
        <StatCards items={statCardsModel(latestDone.metricas, doneAnterior?.metricas ?? null)} />
      ) : null}
      {latestDone?.metricas ? (
        <DashboardCharts
          evolucao={latestDone.metricas.evolucao.map((e) => ({ x: e.data, y: e.total }))}
          canais={latestDone.metricas.vendasPorCanal.map((v) => ({ label: v.canal, value: v.total }))}
        />
      ) : null}

      {/* 7. Gerar relatório + último relatório */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card id="gerar-relatorio">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Gerar relatório</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateReport
              disabled={!canGenerate}
              motivo={motivo}
              emAndamentoReportId={emAndamentoReportId}
            />
          </CardContent>
        </Card>

        <Card data-testid="latest-report">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Último relatório</CardTitle>
          </CardHeader>
          <CardContent>
            {latest ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <Badge variant={reportStatusVariant(latest.status)}>
                    {STATUS_LABEL[latest.status]}
                  </Badge>
                  <p className="text-sm text-muted">{formatPeriodo(latest.periodoInicio, latest.periodoFim)}</p>
                  <p className="text-xs text-dim">{formatData(latest.createdAt)}</p>
                </div>
                <a
                  data-testid="ver-relatorio"
                  href={`/dashboard/relatorios/${latest.id}`}
                  className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                >
                  Ver relatório →
                </a>
              </div>
            ) : (
              <p className="text-muted">Nenhum relatório ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 8. Histórico */}
      <section id="historico" data-testid="reports-list">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-semibold text-white">Histórico</h2>
          <a
            data-testid="comparar-periodos-link"
            href="/dashboard/relatorios/comparar"
            className="text-sm text-brand hover:underline"
          >
            Comparar períodos →
          </a>
        </div>
        {historico.length > 0 ? (
          <Card className="!p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Status</TH>
                  <TH>Período</TH>
                  <TH><span className="sr-only">Ações</span></TH>
                </TR>
              </THead>
              <TBody>
                {historico.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Badge variant={reportStatusVariant(r.status)}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </TD>
                    <TD className="text-muted">{formatPeriodo(r.periodoInicio, r.periodoFim)}</TD>
                    <TD>
                      <a
                        href={`/dashboard/relatorios/${r.id}`}
                        className="text-sm text-brand hover:underline"
                      >
                        Ver
                      </a>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        ) : (
          <EmptyState
            title="Nenhum relatório ainda."
            description="Conecte o Bling, adicione produtos e gere sua primeira análise por IA."
            action={
              <Button as="a" href="#gerar-relatorio" variant="primary" size="sm">
                Gerar primeira análise
              </Button>
            }
          />
        )}
      </section>
    </main>
  );
}
```

> NOTA: se a page pós-G0 derivar o stepper de outra forma (ou o `GenerateReport` não aceitar `emAndamentoReportId`), portar a mecânica REAL do master — o invariante é: relatório `queued/running` remonta o progresso e NENHUM testid muda.

- [ ] **Step 7 — remover o marquee.** Deletar `src/app/(client)/dashboard/insights-marquee.tsx`. Verificar zero referências: `grep -rn "insights-marquee\|InsightsMarquee\|insightsFromAnalise" src tests` → nenhum resultado.
- [ ] **Step 8 — regressão:** `npm run test` completo + `npm run typecheck`. Rodar também `npx playwright test tests/e2e/dashboard.spec.ts` (os 4 testids + texto do gating continuam — a reordenação não remove nada).
- [ ] **Step 9 — commit:** `feat(g2): dashboard reordenado por decisao + chips estaticos no lugar do marquee + card acao numero 1 com virar tarefa`

---

### Task 3: Truth Score com linha do tempo (sparkline + "De 58 para 76 em 4 relatórios")

**Files:**
- Modify: `src/modules/reports/dashboard-model.ts` (+ `linhaDoTempoScore`)
- Modify: `src/app/(client)/dashboard/truth-score-card.tsx` (sparkline + texto + "Ver histórico")
- Modify: `src/app/(client)/dashboard/page.tsx` (passa a linha do tempo)
- Test: `tests/unit/dashboard-model.test.ts` (mod)

**Interfaces:**
- Consumes: `HistoricoDashboardRow` (Task 1 — score já extraído no SQL, TODOS os scores persistidos desde a F3a); `Sparkline` de `@/components/ui/charts/Sparkline` (`{ data: number[]; width?; height? }` — decorativa, `aria-hidden`); âncora `#historico` da page (Task 2); testids existentes `truth-score-card`/`score-delta` (preservados).
- Produces:

```ts
// dashboard-model.ts
export type LinhaDoTempoScore = { serie: number[]; texto: string | null };
export function linhaDoTempoScore(historico: HistoricoDashboardRow[]): LinhaDoTempoScore;
// serie em ordem CRONOLÓGICA (asc); texto null com < 2 pontos

// truth-score-card.tsx — props novas OPCIONAIS (retrocompat com qualquer outro uso)
export function TruthScoreCard(props: {
  atual: ReportDetail | null;
  anterior: ReportDetail | null;
  serie?: number[];
  timelineTexto?: string | null;
}): JSX.Element | null; // testid novo: score-timeline
```

- [ ] **Step 1 — teste unit falhando.** Em `tests/unit/dashboard-model.test.ts`, adicionar:

```ts
import { linhaDoTempoScore } from '@/modules/reports/dashboard-model';
import type { HistoricoDashboardRow } from '@/modules/reports/report.repository';

function linha(over: Partial<HistoricoDashboardRow>): HistoricoDashboardRow {
  return {
    id: `r-${Math.random()}`,
    status: 'done',
    periodoInicio: new Date('2026-06-01T00:00:00Z'),
    periodoFim: new Date('2026-06-07T23:59:59Z'),
    createdAt: new Date('2026-06-08T12:00:00Z'),
    score: null,
    totalPeriodo: null,
    ...over,
  };
}

describe('linhaDoTempoScore', () => {
  it('ordena cronologicamente (input é desc), ignora failed/sem score e narra a evolução', () => {
    const historico = [
      linha({ status: 'failed' }), // mais recente, sem score
      linha({ score: 76, totalPeriodo: 1000 }),
      linha({ score: 71, totalPeriodo: 900 }),
      linha({ score: 64, totalPeriodo: 850 }),
      linha({ score: 58, totalPeriodo: 800 }), // mais antigo
    ];
    expect(linhaDoTempoScore(historico)).toEqual({
      serie: [58, 64, 71, 76],
      texto: 'De 58 para 76 em 4 relatórios',
    });
  });

  it('1 score só → serie de 1 SEM texto; nenhum score → vazio', () => {
    expect(linhaDoTempoScore([linha({ score: 70 })])).toEqual({ serie: [70], texto: null });
    expect(linhaDoTempoScore([linha({})])).toEqual({ serie: [], texto: null });
    expect(linhaDoTempoScore([])).toEqual({ serie: [], texto: null });
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/dashboard-model.test.ts` (FALHA).
- [ ] **Step 3 — implementar o model.** Em `dashboard-model.ts` (import `type { HistoricoDashboardRow } from '@/modules/reports/report.repository';`):

```ts
export type LinhaDoTempoScore = { serie: number[]; texto: string | null };

/**
 * Linha do tempo do Truth Score: todos os scores persistidos (F3a), em ordem
 * cronológica. O histórico chega DESC (query do dashboard) → reverte.
 * Texto só com ≥ 2 pontos ("De 58 para 76 em 4 relatórios").
 */
export function linhaDoTempoScore(historico: HistoricoDashboardRow[]): LinhaDoTempoScore {
  const serie = historico
    .filter((r) => r.status === 'done' && r.score !== null)
    .map((r) => r.score as number)
    .reverse();
  const texto =
    serie.length >= 2
      ? `De ${serie[0]} para ${serie[serie.length - 1]} em ${serie.length} relatórios`
      : null;
  return { serie, texto };
}
```

Rodar de novo (PASSA).

- [ ] **Step 4 — card com sparkline.** Substituir `src/app/(client)/dashboard/truth-score-card.tsx` por:

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ScoreGauge } from '@/components/ui/charts/ScoreGauge';
import { Sparkline } from '@/components/ui/charts/Sparkline';
import type { ReportDetail } from '@/modules/reports/report.types';

export function TruthScoreCard({
  atual,
  anterior,
  serie = [],
  timelineTexto = null,
}: {
  atual: ReportDetail | null;
  anterior: ReportDetail | null;
  serie?: number[];
  timelineTexto?: string | null;
}) {
  const score = atual?.metricas?.truth_score;
  if (!score) return null; // relatório antigo sem score, ou nenhum done ainda
  const scoreAnterior = anterior?.metricas?.truth_score?.score ?? null;
  const delta = scoreAnterior === null ? null : score.score - scoreAnterior;
  return (
    <Card data-testid="truth-score-card">
      <CardHeader>
        <CardTitle as="h2" className="text-base">Truth Score</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-6">
        <ScoreGauge score={score.score} />
        <div className="min-w-0 space-y-2">
          <p className="text-sm text-muted">Saúde da operação no último relatório.</p>
          {delta !== null && (
            <p className={`text-sm font-medium ${delta >= 0 ? 'text-brand' : 'text-red-400'}`} data-testid="score-delta">
              {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{delta} vs relatório anterior
            </p>
          )}
          {serie.length >= 2 ? (
            <div data-testid="score-timeline" className="flex items-center gap-3">
              <Sparkline data={serie} width={140} height={40} />
              {timelineTexto ? <p className="text-xs text-dim">{timelineTexto}</p> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-4">
            <a href={atual ? `/dashboard/relatorios/${atual.id}` : '#'} className="text-sm text-brand hover:underline">
              Ver breakdown →
            </a>
            <a href="#historico" className="text-sm text-brand hover:underline">
              Ver histórico →
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5 — page passa a linha do tempo.** Em `page.tsx`: adicionar `linhaDoTempoScore` ao import de `dashboard-model`, inserir `const timeline = linhaDoTempoScore(historico);` logo após `const chips = ...` e trocar:

```tsx
          <TruthScoreCard atual={latestDone} anterior={doneAnterior} />
```

por:

```tsx
          <TruthScoreCard
            atual={latestDone}
            anterior={doneAnterior}
            serie={timeline.serie}
            timelineTexto={timeline.texto}
          />
```

- [ ] **Step 6 — regressão:** `npm run test` completo + `npm run typecheck`.
- [ ] **Step 7 — commit:** `feat(g2): truth score com linha do tempo (sparkline + narrativa) e link para o historico`

---

### Task 4: Meta viva com pace, projeção, empty state e "dados até"

**Files:**
- Modify: `src/modules/reports/compare.ts` (+ `paceMeta`, `PACE_TOLERANCIA_PP`)
- Modify: `src/app/(client)/dashboard/meta-progress.tsx` (pace + marcador + empty state + subtítulo)
- Modify: `src/app/(client)/dashboard/page.tsx` (calcula pace/dadosAte e passa props)
- Test: `tests/unit/pace-meta.test.ts` (novo)

**Interfaces:**
- Consumes: `progressoMeta(totalMes, meta)` existente (`ProgressoMeta = { percentual, restante, atingida }` — percentual inteiro, cap 999); `hojeBrt(agora?)` (G0 — `'yyyy-mm-dd'` no calendário BRT); `formatData` (BRT, p/ `last_sync_at` = instante real) e `formatDataUtc` (UTC, p/ `MAX(orders.data)` = data pura) da G0; `conn.last_sync_at` (vivo pós-G0 — o cron de sync grava diariamente) e `data.ultimaDataPedido` do view-model (Task 1). Dados do mês JÁ vivos: `totalMes` vem do SUM + sync incremental da G0.
- Produces:

```ts
// compare.ts
export const PACE_TOLERANCIA_PP = 5; // ±5 p.p. = "no ritmo"
export type PaceMeta = {
  pctEsperado: number; // dia do mês / dias do mês (calendário BRT), inteiro
  pctReal: number;     // = ProgressoMeta.percentual
  ritmo: 'adiantado' | 'no_ritmo' | 'atrasado';
  projecao: number;    // fechamento linear: totalMes / diaDoMes * diasNoMes (2 casas)
  mensagem: string;    // pt-BR pronta pra UI
};
export function paceMeta(totalMes: number, meta: number | null, hojeIso: string): PaceMeta | null;
// null quando meta null/<=0 (mesma regra de progressoMeta)

// meta-progress.tsx — assinatura nova
export function MetaProgress(props: {
  progresso: ProgressoMeta | null;
  meta: number | null;
  totalMes: number;
  pace: PaceMeta | null;
  dadosAte: string | null; // string JÁ formatada no servidor (ancoragem temporal)
}): JSX.Element; // meta definida → testid meta-progress (+ meta-pace); sem meta → testid meta-progress-empty
```

- [ ] **Step 1 — teste unit falhando.** Criar `tests/unit/pace-meta.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { paceMeta } from '@/modules/reports/compare';

describe('paceMeta — % esperado vs real no calendário BRT', () => {
  it('dia 14 de julho (31 dias): esperado 45%; 52% real → adiantado + projeção linear', () => {
    const r = paceMeta(23400, 45000, '2026-07-14');
    expect(r).toEqual({
      pctEsperado: 45, // round(14/31*100)
      pctReal: 52,     // round(23400/45000*100)
      ritmo: 'adiantado',
      projecao: 51814.29, // 23400/14*31
      mensagem: 'Você está adiantado: até hoje o esperado era ~45% da meta — você está em 52%.',
    });
  });

  it('atrasado quando fica ≥5 p.p. abaixo do esperado', () => {
    const r = paceMeta(9000, 45000, '2026-07-14'); // 20% vs 45%
    expect(r?.ritmo).toBe('atrasado');
    expect(r?.mensagem).toContain('atrasado');
  });

  it('no ritmo dentro da tolerância de ±5 p.p.', () => {
    const r = paceMeta(19800, 45000, '2026-07-14'); // 44% vs 45%
    expect(r?.ritmo).toBe('no_ritmo');
    expect(r?.mensagem).toContain('no ritmo');
  });

  it('fevereiro não bissexto: 28 dias no denominador', () => {
    const r = paceMeta(1000, 2800, '2026-02-07'); // dia 7/28 = 25%
    expect(r?.pctEsperado).toBe(25);
  });

  it('sem meta (null ou <= 0) → null', () => {
    expect(paceMeta(5000, null, '2026-07-14')).toBeNull();
    expect(paceMeta(5000, 0, '2026-07-14')).toBeNull();
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/pace-meta.test.ts` (FALHA).
- [ ] **Step 3 — implementar em `compare.ts`** (após `progressoMeta`):

```ts
/** ±5 pontos percentuais entre % real e % esperado = "no ritmo". */
export const PACE_TOLERANCIA_PP = 5;

export type PaceMeta = {
  pctEsperado: number;
  pctReal: number;
  ritmo: 'adiantado' | 'no_ritmo' | 'atrasado';
  projecao: number;
  mensagem: string;
};

/**
 * Pace da meta mensal (pura): % esperado até hoje = dia do mês / dias do mês
 * (hojeIso vem de hojeBrt — calendário America/Sao_Paulo) vs % real, com
 * projeção LINEAR de fechamento. Null sem meta (mesma regra de progressoMeta).
 */
export function paceMeta(totalMes: number, meta: number | null, hojeIso: string): PaceMeta | null {
  const progresso = progressoMeta(totalMes, meta);
  if (progresso === null) return null;
  const ano = Number(hojeIso.slice(0, 4));
  const mes = Number(hojeIso.slice(5, 7));
  const dia = Number(hojeIso.slice(8, 10));
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const pctEsperado = Math.round((dia / diasNoMes) * 100);
  const pctReal = progresso.percentual;
  const diff = pctReal - pctEsperado;
  const ritmo: PaceMeta['ritmo'] =
    diff >= PACE_TOLERANCIA_PP ? 'adiantado' : diff <= -PACE_TOLERANCIA_PP ? 'atrasado' : 'no_ritmo';
  const projecao = Math.round((totalMes / dia) * diasNoMes * 100) / 100;
  const rotulo =
    ritmo === 'adiantado'
      ? 'Você está adiantado'
      : ritmo === 'atrasado'
        ? 'Você está atrasado'
        : 'Você está no ritmo';
  return {
    pctEsperado,
    pctReal,
    ritmo,
    projecao,
    mensagem: `${rotulo}: até hoje o esperado era ~${pctEsperado}% da meta — você está em ${pctReal}%.`,
  };
}
```

Rodar de novo (PASSA).

- [ ] **Step 4 — componente.** Substituir `src/app/(client)/dashboard/meta-progress.tsx` por:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatBRL } from '@/lib/format';
import type { PaceMeta, ProgressoMeta } from '@/modules/reports/compare';

type Props = {
  progresso: ProgressoMeta | null;
  meta: number | null;
  totalMes: number;
  pace: PaceMeta | null;
  dadosAte: string | null;
};

export function MetaProgress({ progresso, meta, totalMes, pace, dadosAte }: Props) {
  if (!progresso || meta === null) {
    // Empty state honesto: a conta é madura mas o admin não definiu meta.
    return (
      <Card data-testid="meta-progress-empty">
        <CardHeader>
          <CardTitle as="h2" className="text-base">Meta do mês</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted">
            Sua meta ainda não foi definida — fale com seu analista.
          </p>
        </CardContent>
      </Card>
    );
  }
  const largura = Math.min(100, progresso.percentual);
  const marcador = pace ? Math.min(100, pace.pctEsperado) : null;
  return (
    <Card data-testid="meta-progress">
      <CardHeader>
        <CardTitle as="h2" className="text-base">Meta do mês</CardTitle>
        {dadosAte ? <span className="text-xs text-dim">dados até {dadosAte}</span> : null}
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-mono text-white">{formatBRL(totalMes)}</span>
          <span className="text-muted">
            de {formatBRL(meta)} ({progresso.percentual}%)
          </span>
        </div>
        <div className="relative h-2.5 rounded-full bg-white/5">
          <div
            className="h-2.5 rounded-full bg-brand shadow-[0_0_12px_#07dd2b66,0_0_24px_#07dd2b33]"
            style={{ width: `${largura}%` }}
          />
          {marcador !== null ? (
            <div
              aria-hidden="true"
              title={`Esperado até hoje: ~${pace!.pctEsperado}%`}
              className="absolute -top-[3px] h-4 w-0.5 rounded bg-white/40"
              style={{ left: `${marcador}%` }}
            />
          ) : null}
        </div>
        {pace ? (
          <p className="text-xs text-muted" data-testid="meta-pace">
            {pace.mensagem}
          </p>
        ) : null}
        <p className="text-xs text-dim">
          {progresso.atingida
            ? 'Meta do mês atingida! 🎯'
            : pace
              ? `Faltam ${formatBRL(progresso.restante)} — no ritmo atual, o mês fecha em ~${formatBRL(pace.projecao)}.`
              : `Faltam ${formatBRL(progresso.restante)} para a meta.`}
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5 — page.** Em `page.tsx`: adicionar `paceMeta` ao import de `compare` (`import { paceMeta, progressoMeta } from '@/modules/reports/compare';`), `formatDataUtc` ao import de `format` e `import { hojeBrt } from '@/lib/timezone';`. Após `const progresso = ...`, inserir:

```ts
  const pace = paceMeta(totalMes, metaAtual, hojeBrt());
  // Ancoragem temporal: last_sync_at (instante real → BRT) ou MAX(orders.data)
  // (data pura → UTC) — disponíveis via G0.
  const dadosAte = conn?.last_sync_at
    ? formatData(conn.last_sync_at)
    : data.ultimaDataPedido
      ? formatDataUtc(data.ultimaDataPedido)
      : null;
```

e trocar a chamada por:

```tsx
        <MetaProgress
          progresso={progresso}
          meta={metaAtual}
          totalMes={totalMes}
          pace={pace}
          dadosAte={dadosAte}
        />
```

- [ ] **Step 6 — regressão:** `npm run test` completo + `npm run typecheck` (o unit existente `tests/unit/progresso-meta.test.ts` segue verde — `progressoMeta` intocado).
- [ ] **Step 7 — commit:** `feat(g2): meta viva com pace, projecao de fechamento, empty state e ancoragem dados ate`

---

### Task 5: Cards novos do bento — top 5 produtos, posição de preço e resumo executivo

**Files:**
- Modify: `src/modules/reports/dashboard-model.ts` (+ `topProdutosDashboard`, `posicaoPrecoResumo`)
- Create: `src/app/(client)/dashboard/bento-cards.tsx`
- Modify: `src/app/(client)/dashboard/page.tsx` (insere `<BentoCards />` após os charts)
- Test: `tests/unit/dashboard-model.test.ts` (mod)

**Interfaces:**
- Consumes: `Metricas.topProdutos` (`{ nome, sku, quantidade, receita }[]` — JÁ ordenado por receita desc, cap 10, desde a F0); `Metricas.posicaoPreco` (`{ sku, nome, nossoPreco, precoMercadoMediano, fonte }[]`); `analiseIa.resumoExecutivo`; ids `#metricas`/`#resumo` do relatório.
- Produces:

```ts
// dashboard-model.ts
export const TOP_PRODUTOS_DASHBOARD = 5;
export type TopProdutoDashboard = { nome: string; sku: string; receita: number };
export function topProdutosDashboard(m: Metricas | null): TopProdutoDashboard[];

export const TOLERANCIA_NA_MEDIA_PCT = 2; // |Δ%| ≤ 2% = "na média"
export type ResumoPosicaoPreco = {
  acima: number;
  abaixo: number;
  naMedia: number;
  total: number;
  leitura: string; // "2 acima / 3 abaixo do mercado" (+ " · 1 na média")
};
export function posicaoPrecoResumo(m: Metricas | null): ResumoPosicaoPreco | null;
// null quando nenhum item com nossoPreco > 0 E precoMercadoMediano > 0 (P1: nunca exibir R$ 0,00)

// bento-cards.tsx (server)
export function BentoCards(props: { latestDone: ReportDetail | null }): JSX.Element | null;
// testids: card-top-produtos, card-posicao-preco, card-resumo; graceful → null sem dados
```

- [ ] **Step 1 — testes unit falhando.** Em `tests/unit/dashboard-model.test.ts`, adicionar:

```ts
import { posicaoPrecoResumo, topProdutosDashboard } from '@/modules/reports/dashboard-model';

describe('topProdutosDashboard', () => {
  it('corta em 5 preservando a ordem por receita (já vem ordenado do pipeline)', () => {
    const top = Array.from({ length: 8 }, (_, i) => ({
      nome: `P${i}`,
      sku: `S${i}`,
      quantidade: 1,
      receita: 800 - i * 100,
    }));
    const r = topProdutosDashboard(metricas({ topProdutos: top }));
    expect(r).toHaveLength(5);
    expect(r[0]).toEqual({ nome: 'P0', sku: 'S0', receita: 800 });
    expect(r[4].sku).toBe('S4');
  });

  it('sem métricas ou sem produtos → []', () => {
    expect(topProdutosDashboard(null)).toEqual([]);
    expect(topProdutosDashboard(metricas({}))).toEqual([]);
  });
});

describe('posicaoPrecoResumo', () => {
  const item = (sku: string, nosso: number, mercado: number) => ({
    sku,
    nome: `Produto ${sku}`,
    nossoPreco: nosso,
    precoMercadoMediano: mercado,
    fonte: 'ml_publico',
  });

  it('conta acima/abaixo/na média (tolerância ±2%) e monta a leitura', () => {
    const m = metricas({
      posicaoPreco: [
        item('A', 110, 100), // +10% → acima
        item('B', 120, 100), // +20% → acima
        item('C', 90, 100),  // -10% → abaixo
        item('D', 80, 100),  // -20% → abaixo
        item('E', 70, 100),  // -30% → abaixo
        item('F', 101, 100), // +1% → na média
      ],
    });
    expect(posicaoPrecoResumo(m)).toEqual({
      acima: 2,
      abaixo: 3,
      naMedia: 1,
      total: 6,
      leitura: '2 acima / 3 abaixo do mercado · 1 na média',
    });
  });

  it('exclui itens com nossoPreco 0 ou mercado 0 (nunca conta "R$ 0,00" como preço)', () => {
    const m = metricas({ posicaoPreco: [item('A', 0, 100), item('B', 100, 0)] });
    expect(posicaoPrecoResumo(m)).toBeNull();
  });

  it('sem métricas / lista vazia → null; sem "na média" a leitura fica curta', () => {
    expect(posicaoPrecoResumo(null)).toBeNull();
    expect(posicaoPrecoResumo(metricas({}))).toBeNull();
    const m = metricas({ posicaoPreco: [item('A', 110, 100), item('B', 90, 100)] });
    expect(posicaoPrecoResumo(m)?.leitura).toBe('1 acima / 1 abaixo do mercado');
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/dashboard-model.test.ts` (FALHA).
- [ ] **Step 3 — implementar os modelos** em `dashboard-model.ts`:

```ts
export const TOP_PRODUTOS_DASHBOARD = 5;

export type TopProdutoDashboard = { nome: string; sku: string; receita: number };

/** Top 5 por receita — metricas.topProdutos JÁ vem ordenado desc do pipeline. */
export function topProdutosDashboard(m: Metricas | null): TopProdutoDashboard[] {
  if (!m) return [];
  return m.topProdutos
    .slice(0, TOP_PRODUTOS_DASHBOARD)
    .map((p) => ({ nome: p.nome, sku: p.sku, receita: p.receita }));
}

/** |Δ%| ≤ 2% da mediana de mercado conta como "na média". */
export const TOLERANCIA_NA_MEDIA_PCT = 2;

export type ResumoPosicaoPreco = {
  acima: number;
  abaixo: number;
  naMedia: number;
  total: number;
  leitura: string;
};

/**
 * Leitura leiga da posição de preço ("2 acima / 3 abaixo do mercado").
 * Itens com nossoPreco <= 0 ou mercado <= 0 são EXCLUÍDOS (P1 da auditoria:
 * "R$ 0,00" não é preço). Null sem nenhum item comparável.
 */
export function posicaoPrecoResumo(m: Metricas | null): ResumoPosicaoPreco | null {
  const itens = (m?.posicaoPreco ?? []).filter(
    (p) => p.nossoPreco > 0 && p.precoMercadoMediano > 0,
  );
  if (itens.length === 0) return null;
  let acima = 0;
  let abaixo = 0;
  let naMedia = 0;
  for (const p of itens) {
    const deltaPct = ((p.nossoPreco - p.precoMercadoMediano) / p.precoMercadoMediano) * 100;
    if (Math.abs(deltaPct) <= TOLERANCIA_NA_MEDIA_PCT) naMedia++;
    else if (deltaPct > 0) acima++;
    else abaixo++;
  }
  const basica = `${acima} acima / ${abaixo} abaixo do mercado`;
  return {
    acima,
    abaixo,
    naMedia,
    total: itens.length,
    leitura: naMedia > 0 ? `${basica} · ${naMedia} na média` : basica,
  };
}
```

Rodar de novo (PASSA).

- [ ] **Step 4 — componente.** Criar `src/app/(client)/dashboard/bento-cards.tsx`:

```tsx
import React from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatBRL } from '@/lib/format';
import { posicaoPrecoResumo, topProdutosDashboard } from '@/modules/reports/dashboard-model';
import type { ReportDetail } from '@/modules/reports/report.types';

/** Bento do último relatório: top produtos, posição de preço e resumo em 2 linhas. */
export function BentoCards({ latestDone }: { latestDone: ReportDetail | null }) {
  if (!latestDone?.metricas) return null;
  const top = topProdutosDashboard(latestDone.metricas);
  const posicao = posicaoPrecoResumo(latestDone.metricas);
  const resumo = latestDone.analiseIa?.resumoExecutivo ?? null;
  if (top.length === 0 && !posicao && !resumo) return null;
  const base = `/dashboard/relatorios/${latestDone.id}`;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {top.length > 0 ? (
        <Card data-testid="card-top-produtos">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Top produtos por receita</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {top.map((p, i) => (
                <li
                  key={p.sku || `${p.nome}-${i}`}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-white/90">
                    <span className="font-mono text-xs text-dim">{i + 1}.</span> {p.nome}
                  </span>
                  <span className="shrink-0 font-mono text-muted">{formatBRL(p.receita)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {posicao ? (
        <Card data-testid="card-posicao-preco">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Posição de preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-mono text-lg font-bold text-white">{posicao.leitura}</p>
            <p className="text-xs text-dim">{posicao.total} produto(s) comparados com o mercado.</p>
            <a href={`${base}#metricas`} className="text-sm text-brand hover:underline">
              Ver comparação →
            </a>
          </CardContent>
        </Card>
      ) : null}

      {resumo ? (
        <Card data-testid="card-resumo">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Resumo executivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p
              className="text-sm leading-relaxed text-muted"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {resumo}
            </p>
            <a href={`${base}#resumo`} className="text-sm text-brand hover:underline">
              Ler análise →
            </a>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
```

(clamp de 2 linhas via inline style `-webkit-box` — determinístico, sem depender de plugin/versão do Tailwind).

- [ ] **Step 5 — page.** Em `page.tsx`: `import { BentoCards } from './bento-cards';` e inserir logo APÓS o bloco `<DashboardCharts ... />`:

```tsx
      <BentoCards latestDone={latestDone} />
```

- [ ] **Step 6 — regressão:** `npm run test` completo + `npm run typecheck`.
- [ ] **Step 7 — commit:** `feat(g2): bento com top 5 produtos, posicao de preco em leitura leiga e resumo executivo em 2 linhas`

---

### Task 6: Countdown positivo da próxima análise + stats ancorados no período

**Files:**
- Modify: `src/modules/reports/dashboard-model.ts` (+ `proximaAnaliseInfo`, `copyProximaAnalise`)
- Modify: `src/app/(client)/dashboard/page.tsx` (motivo positivo + subtítulo do bloco de stats)
- Test: `tests/unit/dashboard-model.test.ts` (mod)

**Interfaces:**
- Consumes: `org.proximo_relatorio_liberado_em` (`ClientOrganization` — instante real); `settings.geracaoAutomatica` (`getOrgSettings`); `hojeBrt`/`inicioDeDiaUtc` (G0); `formatDiaMes(d)` (G1 — `'dd/mm'` em BRT, server-side); `formatPeriodo` (G0 — UTC p/ fronteiras de período); `gate.motivo === 'ciclo_em_andamento'` de `podeGerar` (intocado). Texto E2E intocável: **"Conecte o Bling em Conexões."** fica em OUTRO ramo do `motivo` — não é afetado.
- Produces:

```ts
// dashboard-model.ts
export function proximaAnaliseInfo(
  geracaoAutomatica: boolean,
  proximoEm: Date | null,
  agora?: Date,
): { dias: number; data: string } | null;
// null quando: automática desligada, sem data, ou data no passado (aí o gate nem bloqueia)
// dias = diferença de DIAS-CALENDÁRIO BRT (0 = sai hoje); data = 'dd/mm' BRT

export function copyProximaAnalise(info: { dias: number; data: string }): string;
// 0 → "Sua próxima análise sai hoje (dd/mm)."
// 1 → "... em 1 dia (dd/mm)." | N → "... em N dias (dd/mm)."
```

- [ ] **Step 1 — testes unit falhando.** Em `tests/unit/dashboard-model.test.ts`, adicionar:

```ts
import { copyProximaAnalise, proximaAnaliseInfo } from '@/modules/reports/dashboard-model';

describe('proximaAnaliseInfo', () => {
  const agora = new Date('2026-07-14T12:00:00Z');

  it('conta dias-calendário BRT e formata dd/mm', () => {
    expect(proximaAnaliseInfo(true, new Date('2026-07-19T12:00:00Z'), agora)).toEqual({
      dias: 5,
      data: '19/07',
    });
  });

  it('15/07 01:00Z = ainda 14/07 no BRT → 0 dias ("sai hoje")', () => {
    expect(proximaAnaliseInfo(true, new Date('2026-07-15T01:00:00Z'), agora)).toEqual({
      dias: 0,
      data: '14/07',
    });
  });

  it('null quando automática desligada, sem data ou data no passado', () => {
    expect(proximaAnaliseInfo(false, new Date('2026-07-19T12:00:00Z'), agora)).toBeNull();
    expect(proximaAnaliseInfo(true, null, agora)).toBeNull();
    expect(proximaAnaliseInfo(true, new Date('2026-07-10T12:00:00Z'), agora)).toBeNull();
  });
});

describe('copyProximaAnalise', () => {
  it('hoje / singular / plural', () => {
    expect(copyProximaAnalise({ dias: 0, data: '14/07' })).toBe('Sua próxima análise sai hoje (14/07).');
    expect(copyProximaAnalise({ dias: 1, data: '15/07' })).toBe(
      'Sua próxima análise sai automaticamente em 1 dia (15/07).',
    );
    expect(copyProximaAnalise({ dias: 5, data: '19/07' })).toBe(
      'Sua próxima análise sai automaticamente em 5 dias (19/07).',
    );
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/dashboard-model.test.ts` (FALHA).
- [ ] **Step 3 — implementar.** Em `dashboard-model.ts` (imports: `import { formatDiaMes } from '@/lib/format';` e `import { hojeBrt, inicioDeDiaUtc } from '@/lib/timezone';`):

```ts
const DIA_MS = 86_400_000;

/**
 * Countdown POSITIVO da próxima análise automática (reframe do bloqueio do
 * ciclo como serviço). Dias contados no calendário BRT — 22h de hoje até 1h
 * de amanhã (BRT) ainda é "hoje".
 */
export function proximaAnaliseInfo(
  geracaoAutomatica: boolean,
  proximoEm: Date | null,
  agora: Date = new Date(),
): { dias: number; data: string } | null {
  if (!geracaoAutomatica || !proximoEm || proximoEm.getTime() <= agora.getTime()) return null;
  const dias = Math.round(
    (inicioDeDiaUtc(hojeBrt(proximoEm)).getTime() - inicioDeDiaUtc(hojeBrt(agora)).getTime()) / DIA_MS,
  );
  return { dias, data: formatDiaMes(proximoEm) };
}

/** Copy pt-BR do countdown (0 = hoje; singular/plural). */
export function copyProximaAnalise(info: { dias: number; data: string }): string {
  if (info.dias <= 0) return `Sua próxima análise sai hoje (${info.data}).`;
  const unidade = info.dias === 1 ? 'dia' : 'dias';
  return `Sua próxima análise sai automaticamente em ${info.dias} ${unidade} (${info.data}).`;
}
```

Rodar de novo (PASSA).

- [ ] **Step 4 — motivo positivo na page.** Em `page.tsx`, adicionar `copyProximaAnalise, proximaAnaliseInfo` ao import de `dashboard-model` e substituir o ramo `ciclo_em_andamento` do `motivo`:

```ts
      if (gate.motivo === 'ciclo_em_andamento') {
        const proxData = org.proximo_relatorio_liberado_em;
        motivo = proxData
          ? `Próximo relatório liberado em ${formatData(proxData)}.`
          : 'O próximo relatório ainda não foi liberado.';
      } else if (gate.motivo === 'sem_plano') {
```

por:

```ts
      if (gate.motivo === 'ciclo_em_andamento') {
        const proxData = org.proximo_relatorio_liberado_em;
        const info = proximaAnaliseInfo(settings?.geracaoAutomatica ?? false, proxData);
        // Countdown POSITIVO quando a geração automática cuida do ciclo;
        // fallback neutro quando o cliente desligou a automática.
        motivo = info
          ? copyProximaAnalise(info)
          : proxData
            ? `Próximo relatório liberado em ${formatData(proxData)}.`
            : 'O próximo relatório ainda não foi liberado.';
      } else if (gate.motivo === 'sem_plano') {
```

- [ ] **Step 5 — stats ancorados.** Em `page.tsx`, envolver o bloco de stats com o subtítulo do período (resolve "número sem ancoragem temporal"). Substituir:

```tsx
      {latestDone?.metricas ? (
        <StatCards items={statCardsModel(latestDone.metricas, doneAnterior?.metricas ?? null)} />
      ) : null}
```

por:

```tsx
      {latestDone?.metricas ? (
        <section aria-label="Números do último período" className="space-y-2">
          <p className="text-xs text-dim" data-testid="stats-periodo">
            Período analisado: {formatPeriodo(latestDone.periodoInicio, latestDone.periodoFim)}
          </p>
          <StatCards items={statCardsModel(latestDone.metricas, doneAnterior?.metricas ?? null)} />
        </section>
      ) : null}
```

- [ ] **Step 6 — regressão:** `npm run test` completo + `npm run typecheck` + `npx playwright test tests/e2e/dashboard.spec.ts` (o teste de gating usa o ramo `bling_nao_conectado` — intocado).
- [ ] **Step 7 — commit:** `feat(g2): countdown positivo da proxima analise e stats ancorados no periodo analisado`

---

### Task 7: Histórico que conta história — colunas Faturamento e Score com ▲▼

**Files:**
- Modify: `src/modules/reports/dashboard-model.ts` (+ `historicoComDeltas`)
- Modify: `src/app/(client)/dashboard/page.tsx` (tabela do histórico + helper `DeltaSeta`)
- Test: `tests/unit/dashboard-model.test.ts` (mod)

**Interfaces:**
- Consumes: `HistoricoDashboardRow` (Task 1 — `score`/`totalPeriodo` já extraídos); `formatBRL`; `Table` (já tem wrapper `overflow-x-auto` — Table.tsx:11); testids `reports-list`/`comparar-periodos-link` e coluna de ações preservados; cores dos tokens: `text-brand` (sobe) / `text-danger-fg` (cai) — mesmos usados em `generate-report.tsx`/`truth-score-card.tsx`.
- Produces:

```ts
// dashboard-model.ts
export type HistoricoLinha = HistoricoDashboardRow & {
  deltaScore: number | null;        // vs o done ANTERIOR mais próximo com score
  deltaFaturamento: number | null;  // idem com totalPeriodo (2 casas)
};
export function historicoComDeltas(historico: HistoricoDashboardRow[]): HistoricoLinha[];
// input desc (como vem da query); failed/sem valor são PULADOS na base de comparação
```

- [ ] **Step 1 — teste unit falhando.** Em `tests/unit/dashboard-model.test.ts`, adicionar (reusa o helper `linha` da Task 3):

```ts
import { historicoComDeltas } from '@/modules/reports/dashboard-model';

describe('historicoComDeltas', () => {
  it('delta vs o done anterior mais próximo, pulando failed', () => {
    const historico = [
      linha({ id: 'd', score: 76, totalPeriodo: 1000 }), // mais recente
      linha({ id: 'c', status: 'failed' }),              // pulado como base
      linha({ id: 'b', score: 64, totalPeriodo: 850 }),
      linha({ id: 'a', score: 58, totalPeriodo: 800 }),  // mais antigo
    ];
    const r = historicoComDeltas(historico);
    expect(r[0]).toMatchObject({ id: 'd', deltaScore: 12, deltaFaturamento: 150 }); // vs 'b' (pula 'c')
    expect(r[1]).toMatchObject({ id: 'c', deltaScore: null, deltaFaturamento: null }); // failed sem valores
    expect(r[2]).toMatchObject({ id: 'b', deltaScore: 6, deltaFaturamento: 50 });
    expect(r[3]).toMatchObject({ id: 'a', deltaScore: null, deltaFaturamento: null }); // primeiro
  });

  it('done antigo sem truth_score não serve de base (procura o próximo que tem)', () => {
    const historico = [
      linha({ id: 'c', score: 70, totalPeriodo: 900 }),
      linha({ id: 'b', status: 'done' }), // done PRÉ-F3a: sem score/total
      linha({ id: 'a', score: 60, totalPeriodo: 700 }),
    ];
    const r = historicoComDeltas(historico);
    expect(r[0]).toMatchObject({ deltaScore: 10, deltaFaturamento: 200 }); // 'c' vs 'a'
  });

  it('lista vazia → []', () => {
    expect(historicoComDeltas([])).toEqual([]);
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/dashboard-model.test.ts` (FALHA).
- [ ] **Step 3 — implementar o model** em `dashboard-model.ts`:

```ts
export type HistoricoLinha = HistoricoDashboardRow & {
  deltaScore: number | null;
  deltaFaturamento: number | null;
};

/**
 * Setas do histórico (pura): cada linha comparada ao done ANTERIOR mais
 * próximo que tenha o valor (failed e done sem truth_score são pulados na
 * base — a comparação é sempre relatório vs relatório, nunca vs buraco).
 * Input em ordem desc (como vem de listHistoricoDashboard).
 */
export function historicoComDeltas(historico: HistoricoDashboardRow[]): HistoricoLinha[] {
  return historico.map((row, i) => {
    let deltaScore: number | null = null;
    let deltaFaturamento: number | null = null;
    for (let j = i + 1; j < historico.length; j++) {
      const prev = historico[j];
      if (prev.status !== 'done') continue;
      if (deltaScore === null && row.score !== null && prev.score !== null) {
        deltaScore = row.score - prev.score;
      }
      if (deltaFaturamento === null && row.totalPeriodo !== null && prev.totalPeriodo !== null) {
        deltaFaturamento = Math.round((row.totalPeriodo - prev.totalPeriodo) * 100) / 100;
      }
      if (deltaScore !== null && deltaFaturamento !== null) break;
    }
    return { ...row, deltaScore, deltaFaturamento };
  });
}
```

Rodar de novo (PASSA).

- [ ] **Step 4 — tabela na page.** Em `page.tsx`: adicionar `historicoComDeltas` ao import do model e `formatBRL` ao import de `format`; inserir `const linhas = historicoComDeltas(historico);` junto às demais derivações; adicionar no FIM do arquivo (fora do componente default):

```tsx
function DeltaSeta({ delta }: { delta: number | null }) {
  if (delta === null || delta === 0) return null;
  const subiu = delta > 0;
  return (
    <span
      aria-label={subiu ? 'subiu vs relatório anterior' : 'caiu vs relatório anterior'}
      className={`text-xs ${subiu ? 'text-brand' : 'text-danger-fg'}`}
    >
      {subiu ? '▲' : '▼'}
    </span>
  );
}
```

e substituir o `<THead>`/`<TBody>` do histórico por:

```tsx
              <THead>
                <TR>
                  <TH>Status</TH>
                  <TH>Período</TH>
                  <TH>Faturamento</TH>
                  <TH>Score</TH>
                  <TH><span className="sr-only">Ações</span></TH>
                </TR>
              </THead>
              <TBody>
                {linhas.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Badge variant={reportStatusVariant(r.status)}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </TD>
                    <TD className="text-muted">{formatPeriodo(r.periodoInicio, r.periodoFim)}</TD>
                    <TD className="font-mono">
                      {r.totalPeriodo !== null ? (
                        <span className="inline-flex items-center gap-1.5">
                          {formatBRL(r.totalPeriodo)}
                          <DeltaSeta delta={r.deltaFaturamento} />
                        </span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </TD>
                    <TD className="font-mono">
                      {r.score !== null ? (
                        <span className="inline-flex items-center gap-1.5">
                          {r.score}
                          <DeltaSeta delta={r.deltaScore} />
                        </span>
                      ) : (
                        <span className="text-dim">—</span>
                      )}
                    </TD>
                    <TD>
                      <a
                        href={`/dashboard/relatorios/${r.id}`}
                        className="text-sm text-brand hover:underline"
                      >
                        Ver
                      </a>
                    </TD>
                  </TR>
                ))}
              </TBody>
```

(coluna de status/ações e testids do bloco preservados; relatórios antigos sem `truth_score` mostram "—").

- [ ] **Step 5 — regressão:** `npm run test` completo + `npm run typecheck`.
- [ ] **Step 6 — commit:** `feat(g2): historico com colunas de faturamento e score com setas vs relatorio anterior`

---

### Task 8: Charts legíveis + mobile (eixos, sr-only, overflow dos stats, gutter único, kanban)

**Files:**
- Modify: `src/modules/reports/dashboard-model.ts` (+ `srSummaryEvolucao`)
- Modify: `src/components/ui/charts/LineChart.tsx` (+ props opcionais `srSummary`/`formatTooltip` — ADITIVO)
- Modify: `src/app/(client)/dashboard/dashboard-charts.tsx` (eixo compacto + tooltip cheio + srSummary)
- Modify: `src/app/(client)/dashboard/page.tsx` (datas dd/MM no eixo X + srSummary)
- Modify: `src/app/(client)/dashboard/stat-cards.tsx` (fix overflow 375px)
- Modify: `src/components/app-shell.tsx` (gutter único)
- Modify: `src/components/tasks/KanbanBoard.tsx` (colunas responsivas)
- Test: `tests/unit/dashboard-model.test.ts` (mod)

**Interfaces:**
- Consumes: `formatBRLCompacto` (G1 — `2000→"R$ 2k"`, conserta o "R$" cortado no eixo Y) e `formatDataCurta` (G1 — `'2026-06-01'→'01/06'`, slicing puro, seguro em client) de `src/lib/format.ts`; `formatBRL`; `LineChart` (`XY = { x: string; y: number }`); todas as páginas roteadas têm `p-6 md:p-8` próprio (verificado — pré-condição do gutter único).
- Produces:

```ts
// dashboard-model.ts
export function srSummaryEvolucao(evolucao: { data: string; total: number }[]): string;
// resumo pt-BR p/ leitores de tela (fallback do gráfico)

// LineChart.tsx — assinatura estendida (retrocompat: consumidores atuais não mudam)
export function LineChart(props: {
  data: XY[];
  height?: number;
  formatY?: (v: number) => string;        // eixo Y
  formatTooltip?: (v: number) => string;  // tooltip (default = formatY)
  srSummary?: string;                     // <p class="sr-only"> após o gráfico
}): JSX.Element;
```

- [ ] **Step 1 — teste unit falhando.** Em `tests/unit/dashboard-model.test.ts`, adicionar:

```ts
import { srSummaryEvolucao } from '@/modules/reports/dashboard-model';

describe('srSummaryEvolucao', () => {
  it('resume período, total e melhor dia em pt-BR', () => {
    const s = srSummaryEvolucao([
      { data: '2026-06-01', total: 500 },
      { data: '2026-06-15', total: 1500 },
      { data: '2026-06-30', total: 1000 },
    ]);
    expect(s).toContain('01/06 a 30/06');
    expect(s).toContain('R$ 3.000,00');
    expect(s).toContain('melhor dia 15/06');
    expect(s).toContain('R$ 1.500,00');
  });

  it('sem dados → mensagem honesta', () => {
    expect(srSummaryEvolucao([])).toBe('Sem dados de evolução de vendas no período.');
  });
});
```

> NOTA: o espaço do `Intl.NumberFormat` pt-BR entre "R$" e o número é NBSP ( ) — usar `toContain` com o trecho numérico se a asserção completa falhar por causa do espaço; a implementação usa `formatBRL` (mesma formatação nos dois lados).

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/dashboard-model.test.ts` (FALHA).
- [ ] **Step 3 — implementar o model.** Em `dashboard-model.ts` (adicionar `import { formatBRL, formatDataCurta, formatDiaMes } from '@/lib/format';` — consolidando o import da Task 6):

```ts
/**
 * Fallback acessível do gráfico de evolução (sr-only): período, total e
 * melhor dia — o essencial que o gráfico comunica visualmente.
 */
export function srSummaryEvolucao(evolucao: { data: string; total: number }[]): string {
  if (evolucao.length === 0) return 'Sem dados de evolução de vendas no período.';
  const primeiro = evolucao[0];
  const ultimo = evolucao[evolucao.length - 1];
  const total = Math.round(evolucao.reduce((acc, e) => acc + e.total, 0) * 100) / 100;
  const melhor = evolucao.reduce((a, b) => (b.total > a.total ? b : a));
  return `Evolução diária de vendas de ${formatDataCurta(primeiro.data)} a ${formatDataCurta(ultimo.data)}: total de ${formatBRL(total)}; melhor dia ${formatDataCurta(melhor.data)} com ${formatBRL(melhor.total)}.`;
}
```

Rodar de novo (PASSA).

- [ ] **Step 4 — LineChart aditivo.** Em `src/components/ui/charts/LineChart.tsx`, estender props e envolver o gráfico:

```tsx
interface LineChartProps {
  data: XY[];
  height?: number;
  formatY?: (v: number) => string;
  /** Formatação do tooltip (default = formatY) — permite eixo compacto + tooltip completo. */
  formatTooltip?: (v: number) => string;
  /** Resumo acessível renderizado como <p class="sr-only"> (fallback do gráfico). */
  srSummary?: string;
}

/** Linha/área com gradiente verde neon → transparente (evolução temporal). */
export function LineChart({ data, height = 260, formatY, formatTooltip, srSummary }: LineChartProps) {
  const gradId = useId().replace(/:/g, '');
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          {/* ...AreaChart EXATAMENTE como hoje, com UMA mudança no Tooltip: */}
          {/* content={<GlassTooltip formatValue={formatTooltip ?? formatY} />} */}
        </ResponsiveContainer>
      </div>
      {srSummary ? <p className="sr-only">{srSummary}</p> : null}
    </div>
  );
}
```

(mudanças reais: (a) wrapper `<div>` externo; (b) `formatTooltip ?? formatY` no `GlassTooltip`; (c) `<p className="sr-only">` condicional. TODO o resto — defs/grid/eixos/Area — byte a byte como está. Consumidores existentes sem as props novas ficam idênticos.)

- [ ] **Step 5 — dashboard-charts.** Substituir `src/app/(client)/dashboard/dashboard-charts.tsx` por:

```tsx
'use client';

import React from 'react';
import { motion } from 'framer-motion';

import { fadeLift } from '@/lib/motion';
import { formatBRL, formatBRLCompacto } from '@/lib/format';
import { LineChart, type XY } from '@/components/ui/charts/LineChart';
import { DonutChart } from '@/components/ui/charts/DonutChart';

interface DashboardChartsProps {
  evolucao: XY[];
  canais: { label: string; value: number }[];
  srSummary: string;
}

/** Bento: evolução (linha com gradiente) + canais (donut). */
export function DashboardCharts({ evolucao, canais, srSummary }: DashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <motion.div
        variants={fadeLift}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-line bg-bg-surface p-5 lg:col-span-2"
      >
        <h2 className="mb-3 font-heading text-base font-semibold text-white">Evolução de vendas</h2>
        {/* Eixo Y compacto ("R$ 2k") conserta o corte do "R$" visto no QA;
            tooltip continua com o valor completo. */}
        <LineChart
          data={evolucao}
          formatY={formatBRLCompacto}
          formatTooltip={formatBRL}
          srSummary={srSummary}
        />
      </motion.div>
      <motion.div
        variants={fadeLift}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-line bg-bg-surface p-5"
      >
        <h2 className="mb-3 font-heading text-base font-semibold text-white">Vendas por canal</h2>
        <DonutChart data={canais} formatValue={formatBRL} />
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 6 — page: datas dd/MM no eixo X + srSummary.** Em `page.tsx`: adicionar `formatDataCurta` ao import de `format` e `srSummaryEvolucao` ao import do model; substituir o bloco do `<DashboardCharts ... />` por:

```tsx
      {latestDone?.metricas ? (
        <DashboardCharts
          evolucao={latestDone.metricas.evolucao.map((e) => ({
            x: formatDataCurta(e.data), // '2026-07-06' → '06/07' (fim das datas ISO no eixo)
            y: e.total,
          }))}
          canais={latestDone.metricas.vendasPorCanal.map((v) => ({ label: v.canal, value: v.total }))}
          srSummary={srSummaryEvolucao(latestDone.metricas.evolucao)}
        />
      ) : null}
```

- [ ] **Step 7 — fix do overflow dos StatCards no 375px.** Em `src/app/(client)/dashboard/stat-cards.tsx` (causa real: grid child com `min-width:auto` + valor `text-2xl` mono + Sparkline de 120px fixos não cabem — o card vaza a tela). Trocar as DUAS classes:

```tsx
        <motion.div
          key={item.label}
          variants={fadeLift}
          className="flex min-w-0 flex-col gap-1 rounded-2xl border border-line bg-bg-surface p-5"
        >
          <span className="text-xs uppercase tracking-wide text-muted">{item.label}</span>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <StatValue value={item.value} format={item.format} />
            {item.spark && item.spark.length > 1 ? <Sparkline data={item.spark} /> : null}
          </div>
        </motion.div>
```

(`min-w-0` deixa o card encolher dentro do grid; `flex-wrap` quebra o sparkline para baixo do valor quando não couber — nada é escondido).

- [ ] **Step 8 — gutter único.** Em `src/components/app-shell.tsx`, trocar a linha 230:

```tsx
      <div className="px-4 py-8">{children}</div>
```

por:

```tsx
      {/* Gutter único: TODA página roteada tem p-6 md:p-8 próprio (verificado) —
          o px-4 daqui dobrava a margem no mobile (40px por lado no QA). */}
      <div className="py-8">{children}</div>
```

(o `px-4` do `<nav>` do header — linha 22 — FICA; ele é o padding do próprio header).

- [ ] **Step 9 — kanban responsivo.** Em `src/components/tasks/KanbanBoard.tsx` (linha 40), trocar:

```tsx
    <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
```

por:

```tsx
    <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 xl:grid-cols-5">
```

(768px deixava ~130px/coluna; agora 3 colunas no md e 5 só a partir do xl. Nenhum testid muda — `kanban-col-*`/`task-card` intactos).

- [ ] **Step 10 — regressão:** `npm run test` completo + `npm run typecheck` + `npx playwright test tests/e2e/plano-de-acao.spec.ts tests/e2e/relatorio-task.spec.ts tests/e2e/dashboard.spec.ts` (kanban/dashboard só mudaram classes/props aditivas). Smoke manual opcional (se houver ambiente): viewport 375 sem overflow horizontal no dashboard.
- [ ] **Step 11 — commit:** `fix(g2): eixo compacto e datas dd/mm nos charts, sr-only na evolucao, overflow dos stats no mobile, gutter unico e kanban md 3 colunas`

---

### Task 9: Regressão ampla, E2E completo e revisão final

**Files:**
- Nenhum arquivo novo — verificação e correções pontuais se algo falhar.

**Interfaces:**
- Consumes: toda a fase.
- Produces: branch pronto para merge `--no-ff`.

- [ ] **Step 1 — suíte completa:** `npm run test` (unit + integration com `DATABASE_URL_TEST`) e `npm run typecheck` — ZERO falhas.
- [ ] **Step 2 — E2E completo:** `npx playwright test` (todos os specs: auth, admin, dashboard, conexoes, plano-de-acao, relatorio-task). Se algum falhar, é bug da implementação — corrigir o código (NUNCA o spec) e reportar no commit de fix.
- [ ] **Step 3 — checklist de invariantes (grep):**

```bash
# testids do guard continuam existindo no código
grep -rn "latest-report\|ver-relatorio\|generate-report-button\|reports-list\|comparar-periodos-link" src/app | wc -l   # >= 5
grep -rn "kanban-col-\|task-card" src/components/tasks | wc -l                                                          # > 0
grep -rn "Conecte o Bling em Conexões." src | wc -l                                                                     # >= 2 (page + generate-report)
# marquee morto de verdade
grep -rn "insights-marquee\|InsightsMarquee\|insightsFromAnalise\|dashboardStats" src tests | wc -l                     # == 0
# nenhuma query de dashboard fora do view-model
grep -n "getLatestReport\|getLatestDoneReport" src/app | wc -l                                                          # == 0
```

- [ ] **Step 4 — revisão do diff completo** (`git diff master...HEAD`): conferir (a) toda query nova escopada por `org_id`; (b) nenhum spec E2E alterado; (c) copy 100% pt-BR; (d) campos v2 sempre com guarda de `undefined`; (e) nenhum arquivo fora do File Structure.
- [ ] **Step 5 — smoke visual (se houver ambiente local):** `npm run dev` com o banco test semeado (QA da auditoria): ordem nova visível, chips no lugar do marquee, sparkline do score, pace da meta, bento, countdown, colunas do histórico, 375px sem overflow.
- [ ] **Step 6 — commit final (se houve fixes):** `fix(g2): ajustes da revisao ampla`. Depois seguir o fluxo da casa (superpowers:finishing-a-development-branch) para o merge `--no-ff` em master.

## Operacional (dono, fora do código)

Nenhum passo operacional novo: a G2 não cria migrations, crons nem variáveis de ambiente. (Os pré-requisitos operacionais são os das fases G0/G1 já mergeadas.)
