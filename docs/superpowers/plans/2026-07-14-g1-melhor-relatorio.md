# G1 — O Melhor Relatório Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

> **Pré-requisito: G0 mergeada; revalidar contratos citados.** Este plano assume que a fase G0 (plano `2026-07-14-g0-verdade-dos-dados.md`) já está no `master`: cron de sync incremental de pedidos, fix do `benchmarkParcial` (providers filtrados por config), robustez `stop_reason`/`.stream()` na chamada Claude, janela BRT via `src/lib/timezone.ts` e usage de IA persistido em `reports.ia_usage`. **No início de CADA task, revalide os trechos citados contra o `master` real** — a G0 mexeu em `analyze-ia.ts`, `collect-market.ts`, `enqueue.ts` e formatters. Divergência pequena (assinatura levemente diferente, arquivo renomeado) = adaptar inline e anotar no commit; divergência estrutural = parar e revisar o plano.

**Goal:** Transformar o relatório no coração do produto — "o melhor relatório possível para o CLIENTE" (auditoria 2026-07-14, seções 3-P1 e 4/G1). Cinco entregas: (1) **Métricas v2** — séries por dia/canal/dia-da-semana, curva ABC/Pareto, piores produtos, frete (coluna `orders.frete` existe e nunca foi lida), ticket por canal, faixas de mercado min/p25/mediana/p75 — tudo em campos **opcionais** do jsonb (retrocompat total com relatórios antigos); (2) **IA v2** — `achados[]` estruturados (tipo, prioridade, impacto R$/mês, passos, SKUs) + prompt de consultor com memória (relatório anterior), meta, calendário comercial BR e audiência leiga; (3) **Página v2** — hero com 4 KPIs + deltas, gráficos avançados Recharts (evolução com média móvel + sombra do período anterior, área empilhada canal×dia, Pareto ABC, dia-da-semana, barras divergentes preço vs mercado), achados como cards acionáveis com "Virar tarefa"; (4) **PDF v2** — capa branded, resumo em 3 números, score gauge SVG, miolo claro imprimível, filename com slug; (5) **E-mail v2 + Comparar v2** — assunto com resultado, corpo branded; comparação default vs anterior com Δ em R$ e leitura automática.

**Architecture:** Segue o padrão do repo (pipeline steps → contratos Zod nas fronteiras → repositories → páginas server + client components finos; funções de negócio **puras** separadas do I/O):

- **Métricas v2** (`src/modules/pipeline/steps/compute-metrics.ts`): novas funções puras de agregação (mesmo estilo de `vendasPorCanal`/`evolucao` — recebem `OrderRow[]`/`SnapshotRow[]`, zero I/O) compostas dentro do `computeMetrics` existente. Todos os campos novos são `.optional()` no `MetricasSchema` — o padrão da casa é o `truth_score` optional. Agrupamento por dia mantém a convenção ATUAL de `evolucao` (`data.toISOString().slice(0, 10)`).
- **IA v2** (`src/modules/pipeline/contracts.ts` + `steps/analyze-ia.ts`): `AchadoSchema` + `destaques` opcionais no `AnaliseIaSchema`; os arrays legados (`gargalos`/`sugestoesMelhoria`/`ideiasVenda`) continuam **obrigatórios** e a IA preenche ambos (legados = títulos dos achados por prioridade) — assim TODA UI existente continua funcionando antes das tasks de UI. Prompt reescrito via função pura `buildAnalysisMessages(metricas, contexto)` (unit-testável); contexto rico montado por `buildAnalysisContext` (novo step de I/O fino) e injetado pelo orquestrador. Calendário comercial BR = `src/lib/calendario-comercial.ts` puro (computus de Páscoa + regras de domingo/sexta).
- **Apresentação** (`src/components/ui/charts/*` + página do relatório): 4 charts novos themados (grid `#ffffff0f`, verde `#07dd2b`, `GlassTooltip`) com modelos puros em `chart-models.ts` (testáveis em node — vitest não renderiza componentes neste repo); página do relatório ganha `hero-kpis.tsx` + `metricas-section.tsx` (server components) + wrappers client finos (padrão `evolucao-chart.tsx`). Deltas vs anterior via `getDoneAnterior` (query nova) + `compararMetricas`/`deltaNumero` já existentes em `compare.ts`.
- **Saídas** (PDF/e-mail/comparar): PDF v2 com helpers puros (`pdf-gauge.ts`, `barrasEvolucao`); e-mail v2 com `ReportReadyEmailData` calculado no `finalize` (best-effort, nunca quebra pipeline); comparar v2 reusa `getDoneAnterior` + funções puras novas em `compare.ts`.

**Tech Stack:** Next.js 14 (App Router), Drizzle/Neon (`postgres.js`), Zod, Recharts (instalado na F1), `@react-pdf/renderer` (F1, fontes Sora/Inter/Space Mono em `public/fonts/` — `registerPdfFonts` já resolve), Resend (best-effort), Anthropic SDK (mecânica de chamada da G0 intocada), Vitest (unit + integration no branch Neon `test` via `DATABASE_URL_TEST`), Playwright E2E existente **intocado**.

## Global Constraints

- **Regra de ouro:** antes de cada task, re-validar os trechos citados contra o `master` atual (G0 mudou o terreno). Ler o arquivo REAL antes de editar — os snippets deste plano foram extraídos do HEAD `5c07999` (merge F3a) e podem ter drift pós-G0.
- Next 14 App Router + Drizzle + Neon — **testes SÓ no branch `test` via `DATABASE_URL_TEST`** (`describe.skipIf(!process.env.DATABASE_URL_TEST)`, cleanup em `finally`, prefixo `ta-test-` nos dados).
- TDD com vitest (`npm run test`): failing test primeiro → rodar e VER falhar → implementar → rodar e VER passar → commit.
- **Copy pt-BR SEMPRE** (UI, e-mails, prompts, mensagens de erro); commits em português no padrão `feat(g1): ...`.
- **Multi-tenancy inegociável:** todo repository filtra por `org_id`; `orgId` sempre da sessão (`requireActiveOrg`) ou do loop server-side — nunca de input do cliente.
- **E-mail best-effort:** nunca lança, nunca quebra pipeline (padrão `sendEmail` em `src/modules/notifications/email.ts`).
- **Preservar 100% os testids/fluxos E2E existentes.** Testids que os specs usam e NÃO podem sumir nem mudar de semântica: `metricas`, `resumo-executivo`, `virar-task-gargalos-{i}` (e o padrão `virar-task-{fonte}-{i}` do fallback), `report-status`, `comparar-link`, `export-pdf`, `score-breakdown`, `score-gauge`, `comparacao`, `comparar-form`, `latest-report`, `ver-relatorio`. Os E2E semeiam relatórios SEM os campos v2 (`tests/e2e/relatorio-task.spec.ts` linhas 11–41) — logo o caminho de fallback (relatório antigo) é exercitado pelos E2E e deve renderizar como hoje. **Nenhuma task deste plano precisa editar spec E2E**; se um E2E quebrar, é bug da implementação — corrigir o código, não o spec.
- **Campos novos de jsonb SEMPRE `.optional()` no Zod** (retrocompat com relatórios antigos — padrão `truth_score` no `MetricasSchema`). Todo consumidor de campo v2 trata `undefined` (UI condicional, PDF condicional).
- **Charts com Recharts já instalado + tema da casa:** grid `#ffffff0f`, verde `#07dd2b`, `GlassTooltip` glass — ver `src/components/ui/charts/chart-theme.ts`. Lógica de chart em `.ts` puro (vitest é node); componentes finos.
- **Datas:** NUNCA `new Date()` cru em client component com formatação divergente servidor/cliente — datas de séries são strings ISO `yyyy-mm-dd` formatadas por slicing puro (`formatDataCurta`); `Date` reais são formatados no SERVIDOR (`formatData`/`formatDiaMes`) e passados como string aos client components.
- **Sem libs novas.** Sem migrations de schema SQL nesta fase (tudo vive nos jsonb `metricas`/`analise_ia` — exceção: NENHUMA; `reports.ia_usage` veio da G0).
- **Branch:** `feat/g1-melhor-relatorio` a partir de `master` (pós-G0). Merge `--no-ff` só após a Task 13 (revisão ampla).

## Constantes de negócio (decididas AQUI — não rediscutir)

| Constante | Valor | Significado |
|---|---|---|
| Curva ABC | A ≤ 80% · B ≤ 95% · C resto | classe por % de receita acumulada (1º produto sempre A) |
| `PIORES_LIMITE` | `5` | bottom 5 produtos com venda > 0 (receita asc — pior primeiro) |
| `CONCENTRACAO_TOP_N` | `3` | "3 produtos = X% da receita" |
| `MEDIA_MOVEL_JANELA` | `7` | média móvel da evolução (janela cheia à esquerda quando possível) |
| `CALENDARIO_JANELA_DIAS` | `60` | só datas comerciais a ≤60 dias do fim do período entram no prompt |
| Limites da IA | máx 4 gargalos · 4 sugestões · 3 ideias · 8 achados | instruídos no prompt |
| Ordem dia-da-semana | seg→dom (`[1,2,3,4,5,6,0]`) | `diaSemana` = `getUTCDay()` (0=dom); labels `['dom','seg','ter','qua','qui','sex','sáb']` |
| Percentil | interpolação linear `pos=(n-1)*p` | consistente com `medianaPreco` existente para p=0.5 |
| `FONTE_LABEL` | `{ ml_publico: 'Mercado Livre', serpapi: 'Google Shopping' }` | rótulo pt-BR de fonte; fallback = valor cru; `''` → `'—'` |
| `formatBRLCompacto` | `950→"R$ 950"` · `2000→"R$ 2k"` · `2500→"R$ 2,5k"` · `1200000→"R$ 1,2M"` | eixos de chart (conserta o "R$" cortado) |
| Ordenação de achados | impacto R$ desc (null por último) → prioridade alta>média>baixa → título asc | usada em cards, PDF e "gargalo nº 1" do e-mail |
| Filename do PDF | `truth-analytics-{slug}-{yyyy-mm-dd}-{yyyy-mm-dd}.pdf` | slug do nome da org; datas = período início/fim (UTC slice) |

## Contratos assumidos da G0 (revalidar na Task que os toca)

| Contrato | Onde | Task que consome |
|---|---|---|
| `analyze-ia.ts` chama Claude via `.stream()` com checagem de `stop_reason` e captura de `usage` | `src/modules/pipeline/steps/analyze-ia.ts` | Task 4 (NÃO mexer na mecânica — só na construção de mensagens) |
| `benchmarkParcial` = true só quando provider ATIVO falha | `collect-market.ts` | Task 4 (aviso no prompt mantém a semântica) |
| Janela do relatório em dias fechados BRT + helpers em `src/lib/timezone.ts` | `enqueue.ts`, `periodo-plano.ts` | Tasks 1/4 (convenção de agrupamento por dia NÃO muda aqui — é UTC como `evolucao`; se a G0 tiver mudado o agrupamento, seguir a convenção dela) |
| `formatData`/`formatPeriodo` com `timeZone: 'America/Sao_Paulo'` | `src/lib/format.ts` | Tasks 6/11 |
| `reports.ia_usage` persistido | `src/db/schema/reports.ts` | nenhuma (só não conflitar) |

## File Structure

| Caminho | Ação | Task | Responsabilidade |
|---|---|---|---|
| `src/modules/pipeline/contracts.ts` | mod | 1, 2, 3 | campos v2 opcionais em `MetricasSchema`; `AchadoSchema` + `destaques` + `precoAtual` |
| `src/modules/pipeline/steps/compute-metrics.ts` | mod | 1, 2 | funções puras v2 + composição |
| `src/modules/reports/report-view-model.ts` | mod | 3, 7, 8 | `ordenarAchados`, `primeiroGargalo`, `heroKpis`, `posicaoPrecoView`, `fonteLabel` |
| `src/lib/calendario-comercial.ts` | criar | 4 | ~15 datas comerciais BR + `proximasDatas` pura |
| `src/modules/pipeline/steps/analyze-ia.ts` | mod | 4 | `buildAnalysisMessages` pura + assinatura `analyzeWithIA(metricas, contexto)` |
| `src/modules/pipeline/steps/analysis-context.ts` | criar | 4 | `buildAnalysisContext` (I/O fino) |
| `src/modules/pipeline/orchestrator.ts` | mod | 4, 5 | passa contexto v2 + periodo ao finalize |
| `src/modules/pipeline/steps/finalize.ts` | mod | 5 | `dadosEmailRelatorio` puro + e-mail rico |
| `src/modules/notifications/templates.ts` | mod | 5, 11 | `reportReadyTemplate(dados, appUrl)` (5: assinatura; 11: copy v2) |
| `src/modules/notifications/email.ts` | mod | 5 | `sendReportReadyEmail(to, dados)` |
| `src/modules/tasks/report-to-task.ts` | mod | 5 | fonte `'achados'` + `achadoToTaskInput` |
| `src/modules/tasks/report-to-task.repository.ts` | mod | 5 | ramo achados no `createTasksFromReport` |
| `src/lib/format.ts` | mod | 6, 10 | `formatBRLCompacto`, `formatDataCurta`, `formatDiaMes`, `slugify` |
| `src/components/ui/charts/chart-models.ts` | criar | 6 | modelos puros (média móvel, stacked, pareto, diverging) |
| `src/components/ui/charts/StackedAreaChart.tsx` | criar | 6 | área empilhada canal×dia |
| `src/components/ui/charts/ParetoChart.tsx` | criar | 6 | barras + linha acumulada |
| `src/components/ui/charts/DivergingBarChart.tsx` | criar | 6 | Δ% preço vs mercado |
| `src/components/ui/charts/WeekdayBarChart.tsx` | criar | 6 | wrapper do BarChart existente + srSummary |
| `src/components/ui/charts/EvolucaoComparadaChart.tsx` | criar | 6 | evolução + média móvel + sombra anterior |
| `src/modules/reports/report.repository.ts` | mod | 7 | `getDoneAnterior` |
| `src/app/(client)/dashboard/relatorios/[id]/hero-kpis.tsx` | criar | 7 | faixa de 4 KPIs + destaques |
| `src/app/(client)/dashboard/relatorios/[id]/page.tsx` | mod | 7, 8, 9 | hero, TOC fix, seções v2, achados cards |
| `src/app/(client)/dashboard/relatorios/[id]/metricas-section.tsx` | criar | 8 | seção Métricas v2 (server) |
| `src/app/(client)/dashboard/relatorios/[id]/graficos-cliente.tsx` | criar | 8 | wrappers client dos charts (formatters) |
| `src/components/tasks/AchadosCards.tsx` | criar | 9 | cards acionáveis de achados |
| `src/modules/pdf/pdf-gauge.ts` | criar | 10 | `arcoPath`/`polarToXY`/`barrasEvolucao` puros |
| `src/modules/pdf/report-pdf.tsx` | mod | 10 | PDF v2 (capa dark + miolo claro) |
| `src/app/api/reports/[id]/pdf/route.ts` | mod | 10 | filename slug + analista + 404 charset |
| `src/modules/reports/compare.ts` | mod | 12 | `compararTopProdutos`, `leituraComparacao` |
| `src/app/(client)/dashboard/relatorios/comparar/page.tsx` | mod | 12 | default b = anterior, Δ R$, top produtos, leitura |
| `src/app/(client)/dashboard/relatorios/comparar/comparar-form.tsx` | mod | 12 | primitivos DS |
| `tests/unit/*`, `tests/integration/*` | criar/mod | todas | ver tasks |

**Dependências entre tasks:** 1→2 (agregador de produtos), 3→{4,5,9,10,11} (`AchadoSchema`/`ordenarAchados`), 4→5 (contexto no orquestrador), 6→{7,8,12} (formatters/charts), 7→{8,12} (`getDoneAnterior`/hero). Ordem de execução = ordem numérica.

---
### Task 1: Métricas v2 parte 1 — séries (evolução detalhada, canal×dia, dia-da-semana, ticket por canal)

**Files:** Modify `src/modules/pipeline/contracts.ts`, `src/modules/pipeline/steps/compute-metrics.ts`; Create `tests/unit/compute-metrics-series.test.ts`, `tests/integration/compute-metrics-series.test.ts`.

**Interfaces (Consumes):** `OrderRow` (compute-metrics.ts, linhas 18–25), `Periodo` (`@/modules/providers/types` — `{ inicio: Date; fim: Date }`), `round2` (helper privado existente no fim do arquivo).

**Interfaces (Produces):**

Em `contracts.ts`, dentro de `MetricasSchema`, logo ANTES de `benchmarkParcial` (todos opcionais — retrocompat):

```ts
    evolucaoDetalhada: z
      .array(z.object({ data: z.string().min(1), total: z.number(), pedidos: z.number() }).strict())
      .optional(),
    canalPorDia: z
      .array(z.object({ data: z.string().min(1), canais: z.record(z.number()) }).strict())
      .optional(),
    porDiaSemana: z
      .array(
        z
          .object({
            diaSemana: z.number().int().min(0).max(6),
            label: z.string(),
            mediaVendas: z.number(),
            totalVendas: z.number(),
          })
          .strict(),
      )
      .optional(),
    ticketPorCanal: z.array(z.object({ canal: z.string(), ticket: z.number() }).strict()).optional(),
```

Em `compute-metrics.ts`, funções puras exportadas (assinaturas EXATAS):

```ts
export const DIA_SEMANA_LABEL = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

export function evolucaoDetalhada(orders: OrderRow[]): { data: string; total: number; pedidos: number }[];
export function canalPorDia(orders: OrderRow[]): { data: string; canais: Record<string, number> }[];
export function porDiaSemana(
  orders: OrderRow[],
  periodo: Periodo,
): { diaSemana: number; label: string; mediaVendas: number; totalVendas: number }[];
export function ticketPorCanal(orders: OrderRow[]): { canal: string; ticket: number }[];
```

Semântica: agrupamento por dia = MESMA convenção de `evolucao` (`o.data.toISOString().slice(0, 10)`, sort asc pela string). `porDiaSemana`: ocorrências de cada dia-da-semana contadas iterando os dias UTC do período (data UTC de `inicio` até data UTC de `fim`, INCLUSIVE); `mediaVendas = round2(totalVendas / ocorrencias)`; só dias-da-semana com ocorrência > 0; ordem comercial seg→dom. `ticketPorCanal`: `round2(total/pedidos)` por canal, sort ticket desc → canal asc.

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/compute-metrics-series.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  canalPorDia,
  evolucaoDetalhada,
  porDiaSemana,
  ticketPorCanal,
  type OrderRow,
} from '@/modules/pipeline/steps/compute-metrics';

function pedido(iso: string, canal: string, valor: number): OrderRow {
  return { canal, data: new Date(iso), valor_total: valor, itens: [] };
}

// Período de teste: seg 2026-06-01 .. dom 2026-06-14 (14 dias, 2 de cada dia-da-semana)
const PERIODO = { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-14T23:59:59Z') };

const ORDERS: OrderRow[] = [
  pedido('2026-06-01T10:00:00Z', 'shopee', 100), // seg
  pedido('2026-06-01T15:00:00Z', 'mercadolivre', 200), // seg
  pedido('2026-06-02T10:00:00Z', 'shopee', 50), // ter
  pedido('2026-06-08T10:00:00Z', 'shopee', 300), // seg (2ª ocorrência)
];

describe('evolucaoDetalhada', () => {
  it('agrupa por dia UTC com total e nº de pedidos, ordenado asc', () => {
    expect(evolucaoDetalhada(ORDERS)).toEqual([
      { data: '2026-06-01', total: 300, pedidos: 2 },
      { data: '2026-06-02', total: 50, pedidos: 1 },
      { data: '2026-06-08', total: 300, pedidos: 1 },
    ]);
  });

  it('lista vazia → []', () => {
    expect(evolucaoDetalhada([])).toEqual([]);
  });
});

describe('canalPorDia', () => {
  it('agrupa por dia com um Record canal→total', () => {
    expect(canalPorDia(ORDERS)).toEqual([
      { data: '2026-06-01', canais: { mercadolivre: 200, shopee: 100 } },
      { data: '2026-06-02', canais: { shopee: 50 } },
      { data: '2026-06-08', canais: { shopee: 300 } },
    ]);
  });
});

describe('porDiaSemana', () => {
  it('média = total do dia-da-semana / ocorrências no período (2 segundas → média 300)', () => {
    const r = porDiaSemana(ORDERS, PERIODO);
    const seg = r.find((d) => d.diaSemana === 1);
    expect(seg).toEqual({ diaSemana: 1, label: 'seg', mediaVendas: 300, totalVendas: 600 });
    const ter = r.find((d) => d.diaSemana === 2);
    expect(ter).toEqual({ diaSemana: 2, label: 'ter', mediaVendas: 25, totalVendas: 50 });
  });

  it('ordem comercial seg→dom e inclui dias sem venda (total 0) que ocorrem no período', () => {
    const r = porDiaSemana(ORDERS, PERIODO);
    expect(r.map((d) => d.diaSemana)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    const dom = r.find((d) => d.diaSemana === 0);
    expect(dom).toEqual({ diaSemana: 0, label: 'dom', mediaVendas: 0, totalVendas: 0 });
  });
});

describe('ticketPorCanal', () => {
  it('ticket = total/pedidos por canal, ordenado por ticket desc', () => {
    expect(ticketPorCanal(ORDERS)).toEqual([
      { canal: 'mercadolivre', ticket: 200 },
      { canal: 'shopee', ticket: 150 },
    ]);
  });

  it('lista vazia → []', () => {
    expect(ticketPorCanal([])).toEqual([]);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/compute-metrics-series.test.ts` → **FALHA** (funções não existem).

- [ ] **Step 3:** Adicionar os campos ao `MetricasSchema` em `contracts.ts` (bloco do Produces acima) e implementar em `compute-metrics.ts` (na seção de funções puras, após `topProdutos`):

```ts
/** Como `evolucao`, mas com contagem de pedidos por dia (v2, campo opcional). */
export function evolucaoDetalhada(orders: OrderRow[]): { data: string; total: number; pedidos: number }[] {
  const map = new Map<string, { total: number; pedidos: number }>();
  for (const o of orders) {
    const day = o.data.toISOString().slice(0, 10);
    const cur = map.get(day) ?? { total: 0, pedidos: 0 };
    map.set(day, { total: cur.total + o.valor_total, pedidos: cur.pedidos + 1 });
  }
  return Array.from(map.entries())
    .map(([data, v]) => ({ data, total: round2(v.total), pedidos: v.pedidos }))
    .sort((a, b) => a.data.localeCompare(b.data, 'pt-BR'));
}

/** Total por canal em cada dia UTC (base da área empilhada). Canais em ordem alfabética dentro do dia. */
export function canalPorDia(orders: OrderRow[]): { data: string; canais: Record<string, number> }[] {
  const map = new Map<string, Map<string, number>>();
  for (const o of orders) {
    const day = o.data.toISOString().slice(0, 10);
    const canais = map.get(day) ?? new Map<string, number>();
    canais.set(o.canal, (canais.get(o.canal) ?? 0) + o.valor_total);
    map.set(day, canais);
  }
  return Array.from(map.entries())
    .map(([data, canais]) => ({
      data,
      canais: Object.fromEntries(
        Array.from(canais.entries())
          .map(([c, t]) => [c, round2(t)] as const)
          .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')),
      ),
    }))
    .sort((a, b) => a.data.localeCompare(b.data, 'pt-BR'));
}

export const DIA_SEMANA_LABEL = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const ORDEM_COMERCIAL = [1, 2, 3, 4, 5, 6, 0] as const;
const DIA_MS = 86_400_000;

/**
 * Média e total de vendas por dia-da-semana (0=dom..6=sáb, ordem seg→dom).
 * Ocorrências contadas nos dias UTC do período (inclusive) — média honesta
 * mesmo quando um dia-da-semana ocorre mais vezes que outro na janela.
 */
export function porDiaSemana(
  orders: OrderRow[],
  periodo: Periodo,
): { diaSemana: number; label: string; mediaVendas: number; totalVendas: number }[] {
  const inicio = Date.UTC(
    periodo.inicio.getUTCFullYear(),
    periodo.inicio.getUTCMonth(),
    periodo.inicio.getUTCDate(),
  );
  const fim = Date.UTC(periodo.fim.getUTCFullYear(), periodo.fim.getUTCMonth(), periodo.fim.getUTCDate());
  const ocorrencias = new Map<number, number>();
  for (let t = inicio; t <= fim; t += DIA_MS) {
    const dia = new Date(t).getUTCDay();
    ocorrencias.set(dia, (ocorrencias.get(dia) ?? 0) + 1);
  }
  const totais = new Map<number, number>();
  for (const o of orders) {
    const dia = o.data.getUTCDay();
    totais.set(dia, (totais.get(dia) ?? 0) + o.valor_total);
  }
  return ORDEM_COMERCIAL.filter((dia) => (ocorrencias.get(dia) ?? 0) > 0).map((dia) => {
    const totalVendas = round2(totais.get(dia) ?? 0);
    const n = ocorrencias.get(dia) ?? 1;
    return { diaSemana: dia, label: DIA_SEMANA_LABEL[dia], mediaVendas: round2(totalVendas / n), totalVendas };
  });
}

/** Ticket médio por canal (total/pedidos), ordenado por ticket desc. */
export function ticketPorCanal(orders: OrderRow[]): { canal: string; ticket: number }[] {
  const map = new Map<string, { total: number; pedidos: number }>();
  for (const o of orders) {
    const cur = map.get(o.canal) ?? { total: 0, pedidos: 0 };
    map.set(o.canal, { total: cur.total + o.valor_total, pedidos: cur.pedidos + 1 });
  }
  return Array.from(map.entries())
    .map(([canal, v]) => ({ canal, ticket: v.pedidos === 0 ? 0 : round2(v.total / v.pedidos) }))
    .sort((a, b) => b.ticket - a.ticket || a.canal.localeCompare(b.canal, 'pt-BR'));
}
```

E compor no objeto `metricas` dentro de `computeMetrics` (após `posicaoPreco: posicao,`):

```ts
    evolucaoDetalhada: evolucaoDetalhada(orderRows),
    canalPorDia: canalPorDia(orderRows),
    porDiaSemana: porDiaSemana(orderRows, periodo),
    ticketPorCanal: ticketPorCanal(orderRows),
```

- [ ] **Step 4:** `npx vitest run tests/unit/compute-metrics-series.test.ts` → **PASSA**. `npx vitest run tests/unit/compute-metrics.test.ts tests/unit/contracts.test.ts` → suíte antiga verde (mudança aditiva).

- [ ] **Step 5 (integração — falha primeiro):** Criar `tests/integration/compute-metrics-series.test.ts` no padrão EXATO de `tests/integration/compute-metrics-score.test.ts` (mesmo boilerplate `postgres`/`drizzle`/`RUN`/`skipIf`/cleanup em `finally`):

```ts
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { orders, organizations, reports } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();

const PERIODO = {
  inicio: new Date('2026-06-01T00:00:00Z'),
  fim: new Date('2026-06-14T23:59:59Z'),
};

describe.skipIf(!url)('compute-metrics — séries v2 (integração)', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('computeMetrics devolve evolucaoDetalhada, canalPorDia, porDiaSemana e ticketPorCanal', async () => {
    let orgId = '';
    try {
      const [o] = await tdb
        .insert(organizations)
        .values({ name: `ta-test-series-${RUN}`, status: 'active' })
        .returning({ id: organizations.id });
      orgId = o.id;

      const [r] = await tdb
        .insert(reports)
        .values({ org_id: orgId, periodo_inicio: PERIODO.inicio, periodo_fim: PERIODO.fim })
        .returning({ id: reports.id });

      await tdb.insert(orders).values([
        {
          org_id: orgId,
          bling_order_id: `ta-test-series-${RUN}-1`,
          canal: 'shopee',
          data: new Date('2026-06-01T10:00:00Z'),
          valor_total: '100.00',
          frete: '10.00',
          itens: [],
        },
        {
          org_id: orgId,
          bling_order_id: `ta-test-series-${RUN}-2`,
          canal: 'mercadolivre',
          data: new Date('2026-06-01T15:00:00Z'),
          valor_total: '200.00',
          frete: '20.00',
          itens: [],
        },
      ]);

      const { computeMetrics } = await import('@/modules/pipeline/steps/compute-metrics');
      const m = await computeMetrics(orgId, r.id, PERIODO, true);

      expect(m.evolucaoDetalhada).toEqual([{ data: '2026-06-01', total: 300, pedidos: 2 }]);
      expect(m.canalPorDia).toEqual([
        { data: '2026-06-01', canais: { mercadolivre: 200, shopee: 100 } },
      ]);
      expect(m.porDiaSemana?.find((d) => d.diaSemana === 1)).toEqual({
        diaSemana: 1,
        label: 'seg',
        mediaVendas: 150,
        totalVendas: 300,
      });
      expect(m.ticketPorCanal).toEqual([
        { canal: 'mercadolivre', ticket: 200 },
        { canal: 'shopee', ticket: 150 },
      ]);
    } finally {
      await tdb.delete(orders).where(eq(orders.org_id, orgId));
      await tdb.delete(reports).where(eq(reports.org_id, orgId));
      await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
  });
});
```

Rodar → deve **PASSAR** já (implementação do Step 3 cobre); se falhar, é bug — corrigir antes de seguir.

- [ ] **Step 6:** `npm run typecheck` e `npx vitest run` (suíte inteira) verdes. **Commit:** `feat(g1): metricas v2 — series por dia, canal x dia, dia da semana e ticket por canal`.

---
### Task 2: Métricas v2 parte 2 — curva ABC, piores produtos, frete, unidades e faixas de mercado

**Files:** Modify `src/modules/pipeline/contracts.ts`, `src/modules/pipeline/steps/compute-metrics.ts`; Create `tests/unit/compute-metrics-produtos.test.ts`, `tests/integration/compute-metrics-produtos.test.ts`.

**Interfaces (Consumes):** `OrderRow`/`SnapshotRow`/`ProductRow` (compute-metrics.ts), `topProdutos` existente (será refatorado sobre um agregador comum — comportamento EXATO preservado, há testes em `tests/unit/compute-metrics.test.ts`), `medianaPreco` existente, coluna `orders.frete` (`numeric(12,2) notNull default '0'` — confirmada em `src/db/schema/orders.ts:25`).

**Interfaces (Produces):**

Em `contracts.ts` (antes de `benchmarkParcial`, todos opcionais):

```ts
export const ProdutoAbcSchema = z
  .object({ sku: z.string(), nome: z.string(), receita: z.number(), pctAcumulado: z.number() })
  .strict();
export type ProdutoAbc = z.infer<typeof ProdutoAbcSchema>;
```

```ts
    curvaAbc: z
      .object({
        a: z.array(ProdutoAbcSchema),
        b: z.array(ProdutoAbcSchema),
        c: z.array(ProdutoAbcSchema),
        concentracaoTop3Pct: z.number(),
      })
      .strict()
      .optional(),
    piores: z
      .array(z.object({ sku: z.string(), nome: z.string(), receita: z.number(), quantidade: z.number() }).strict())
      .optional(),
    frete: z
      .object({
        freteMedio: z.number(),
        pctFreteSobreReceita: z.number(),
        fretePorCanal: z
          .array(z.object({ canal: z.string(), freteMedio: z.number(), freteTotal: z.number() }).strict()),
      })
      .strict()
      .optional(),
    unidadesTotais: z.number().optional(),
    itensPorPedido: z.number().optional(),
    faixaMercado: z
      .array(
        z
          .object({
            sku: z.string(),
            nome: z.string(),
            min: z.number(),
            p25: z.number(),
            mediana: z.number(),
            p75: z.number(),
            fonte: z.string(),
          })
          .strict(),
      )
      .optional(),
```

Em `compute-metrics.ts`:

```ts
export type OrderRow = {
  canal: string;
  data: Date;
  valor_total: number;
  /** Frete do pedido (0 quando ausente — retrocompat com fixtures antigas). */
  frete?: number;
  itens: RawOrderItem[];
};

export type ProdutoAgregado = { nome: string; sku: string; quantidade: number; receita: number };
export function agregarProdutos(orders: OrderRow[]): ProdutoAgregado[]; // corpo atual de topProdutos SEM o slice(0,10)
export function curvaAbc(orders: OrderRow[]):
  | { a: ProdutoAbc[]; b: ProdutoAbc[]; c: ProdutoAbc[]; concentracaoTop3Pct: number }
  | undefined; // undefined quando nenhum produto com receita > 0
export function pioresProdutos(orders: OrderRow[]): { sku: string; nome: string; receita: number; quantidade: number }[]; // bottom 5, receita asc
export function freteStats(orders: OrderRow[]):
  | { freteMedio: number; pctFreteSobreReceita: number; fretePorCanal: { canal: string; freteMedio: number; freteTotal: number }[] }
  | undefined; // undefined quando 0 pedidos
export function unidadesTotais(orders: OrderRow[]): number;
export function itensPorPedido(orders: OrderRow[]): number;
export function percentil(precosOrdenadosAsc: number[], p: number): number; // interpolação linear, [] → 0
export function faixaMercado(
  products: ProductRow[],
  snapshots: SnapshotRow[],
): { sku: string; nome: string; min: number; p25: number; mediana: number; p75: number; fonte: string }[];
```

`faixaMercado` usa o MESMO matching keyword→snapshots e a MESMA regra de fonte predominante de `posicaoPreco` (linhas 132–189); produto sem preços de mercado é OMITIDO (diferente de `posicaoPreco`, que o emite zerado); sort por sku asc.

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/compute-metrics-produtos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  agregarProdutos,
  curvaAbc,
  faixaMercado,
  freteStats,
  itensPorPedido,
  percentil,
  pioresProdutos,
  unidadesTotais,
  type OrderRow,
  type ProductRow,
  type SnapshotRow,
} from '@/modules/pipeline/steps/compute-metrics';

function pedidoComItens(itens: { sku: string; valor: number; quantidade: number }[], frete = 0): OrderRow {
  return {
    canal: 'shopee',
    data: new Date('2026-06-01T10:00:00Z'),
    valor_total: itens.reduce((a, i) => a + i.valor * i.quantidade, 0),
    frete,
    itens: itens.map((i) => ({ sku: i.sku, nome: `Produto ${i.sku}`, quantidade: i.quantidade, valor: i.valor })),
  };
}

// Receitas: A1=800, B1=150, C1=30, C2=20 → total 1000
const ORDERS: OrderRow[] = [
  pedidoComItens([{ sku: 'A1', valor: 80, quantidade: 10 }], 30),
  pedidoComItens(
    [
      { sku: 'B1', valor: 50, quantidade: 3 },
      { sku: 'C1', valor: 30, quantidade: 1 },
      { sku: 'C2', valor: 20, quantidade: 1 },
    ],
    20,
  ),
];

describe('curvaAbc', () => {
  it('classifica A≤80, B≤95, C resto e calcula concentração top 3', () => {
    const r = curvaAbc(ORDERS);
    expect(r?.a.map((p) => p.sku)).toEqual(['A1']); // 80% acumulado
    expect(r?.b.map((p) => p.sku)).toEqual(['B1']); // 95%
    expect(r?.c.map((p) => p.sku)).toEqual(['C1', 'C2']);
    expect(r?.a[0]).toEqual({ sku: 'A1', nome: 'Produto A1', receita: 800, pctAcumulado: 80 });
    expect(r?.concentracaoTop3Pct).toBe(98); // (800+150+30)/1000
  });

  it('primeiro produto sempre classe A mesmo acima de 80%', () => {
    const r = curvaAbc([pedidoComItens([{ sku: 'X', valor: 100, quantidade: 1 }])]);
    expect(r?.a).toHaveLength(1);
    expect(r?.a[0].pctAcumulado).toBe(100);
  });

  it('sem produtos com receita → undefined', () => {
    expect(curvaAbc([])).toBeUndefined();
  });
});

describe('pioresProdutos', () => {
  it('bottom 5 com venda > 0, pior primeiro (receita asc)', () => {
    expect(pioresProdutos(ORDERS).map((p) => p.sku)).toEqual(['C2', 'C1', 'B1', 'A1']);
    expect(pioresProdutos(ORDERS)[0]).toEqual({ sku: 'C2', nome: 'Produto C2', receita: 20, quantidade: 1 });
  });
});

describe('freteStats', () => {
  it('médio, % sobre receita e por canal', () => {
    const r = freteStats(ORDERS);
    expect(r?.freteMedio).toBe(25); // (30+20)/2
    expect(r?.pctFreteSobreReceita).toBe(5); // 50/1000
    expect(r?.fretePorCanal).toEqual([{ canal: 'shopee', freteMedio: 25, freteTotal: 50 }]);
  });

  it('0 pedidos → undefined', () => {
    expect(freteStats([])).toBeUndefined();
  });
});

describe('unidades e itens por pedido', () => {
  it('soma quantidades e divide por pedidos', () => {
    expect(unidadesTotais(ORDERS)).toBe(15); // 10 + 3 + 1 + 1
    expect(itensPorPedido(ORDERS)).toBe(7.5);
    expect(itensPorPedido([])).toBe(0);
  });
});

describe('percentil (interpolação linear)', () => {
  it('valores de tabela', () => {
    expect(percentil([10, 20, 30, 40], 0)).toBe(10);
    expect(percentil([10, 20, 30, 40], 0.25)).toBe(17.5);
    expect(percentil([10, 20, 30, 40], 0.5)).toBe(25); // = medianaPreco de lista par
    expect(percentil([10, 20, 30, 40], 1)).toBe(40);
    expect(percentil([], 0.5)).toBe(0);
  });
});

describe('faixaMercado', () => {
  const products: ProductRow[] = [
    { nome: 'Caneca', sku: 'CAN-1', keywords: ['caneca'], ativo: true },
    { nome: 'Sem mercado', sku: 'SEM-1', keywords: ['nada'], ativo: true },
  ];
  const snapshots: SnapshotRow[] = [
    { fonte: 'ml_publico', keyword: 'caneca', dados: { precos: [10, 20, 30, 40] } },
  ];

  it('min/p25/mediana/p75 + fonte predominante; produto sem snapshot é omitido', () => {
    expect(faixaMercado(products, snapshots)).toEqual([
      { sku: 'CAN-1', nome: 'Caneca', min: 10, p25: 17.5, mediana: 25, p75: 32.5, fonte: 'ml_publico' },
    ]);
  });
});

describe('agregarProdutos (compat com topProdutos)', () => {
  it('ordena receita desc sem cap', () => {
    expect(agregarProdutos(ORDERS).map((p) => p.sku)).toEqual(['A1', 'B1', 'C1', 'C2']);
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/compute-metrics-produtos.test.ts` → **FALHA**.

- [ ] **Step 3:** Implementar em `compute-metrics.ts`:

1. Adicionar `frete?: number` ao `OrderRow` (JSDoc do Produces) e, no mapeamento de `computeMetrics`, `frete: Number(o.frete)` junto de `valor_total`.
2. Refatorar `topProdutos`: extrair `agregarProdutos` com o corpo atual MENOS o `.slice(0, 10)`, e reescrever `topProdutos` como `return agregarProdutos(orders).slice(0, 10);` (comportamento idêntico — testes antigos provam).
3. Novas funções:

```ts
const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Curva ABC por receita acumulada: A ≤ 80%, B ≤ 95%, C resto (1º produto sempre A). */
export function curvaAbc(orders: OrderRow[]):
  | { a: ProdutoAbc[]; b: ProdutoAbc[]; c: ProdutoAbc[]; concentracaoTop3Pct: number }
  | undefined {
  const todos = agregarProdutos(orders).filter((p) => p.receita > 0);
  if (todos.length === 0) return undefined;
  const total = todos.reduce((acc, p) => acc + p.receita, 0);
  let acumulado = 0;
  const a: ProdutoAbc[] = [];
  const b: ProdutoAbc[] = [];
  const c: ProdutoAbc[] = [];
  for (const p of todos) {
    acumulado += p.receita;
    const pctAcumulado = round1((acumulado / total) * 100);
    const item: ProdutoAbc = { sku: p.sku, nome: p.nome, receita: p.receita, pctAcumulado };
    if (pctAcumulado <= 80 || a.length === 0) a.push(item);
    else if (pctAcumulado <= 95) b.push(item);
    else c.push(item);
  }
  const top3 = todos.slice(0, 3).reduce((acc, p) => acc + p.receita, 0);
  return { a, b, c, concentracaoTop3Pct: round1((top3 / total) * 100) };
}

const PIORES_LIMITE = 5;

/** Bottom 5 produtos COM venda no período (receita asc — pior primeiro). */
export function pioresProdutos(
  orders: OrderRow[],
): { sku: string; nome: string; receita: number; quantidade: number }[] {
  return agregarProdutos(orders)
    .filter((p) => p.quantidade > 0 && p.receita > 0)
    .slice(-PIORES_LIMITE)
    .reverse()
    .map((p) => ({ sku: p.sku, nome: p.nome, receita: p.receita, quantidade: p.quantidade }));
}

/** Estatísticas de frete (orders.frete — coluna existente, lida pela 1ª vez aqui). */
export function freteStats(orders: OrderRow[]):
  | {
      freteMedio: number;
      pctFreteSobreReceita: number;
      fretePorCanal: { canal: string; freteMedio: number; freteTotal: number }[];
    }
  | undefined {
  if (orders.length === 0) return undefined;
  const totalFrete = orders.reduce((acc, o) => acc + (o.frete ?? 0), 0);
  const receita = orders.reduce((acc, o) => acc + o.valor_total, 0);
  const porCanal = new Map<string, { frete: number; pedidos: number }>();
  for (const o of orders) {
    const cur = porCanal.get(o.canal) ?? { frete: 0, pedidos: 0 };
    porCanal.set(o.canal, { frete: cur.frete + (o.frete ?? 0), pedidos: cur.pedidos + 1 });
  }
  return {
    freteMedio: round2(totalFrete / orders.length),
    pctFreteSobreReceita: receita <= 0 ? 0 : round1((totalFrete / receita) * 100),
    fretePorCanal: Array.from(porCanal.entries())
      .map(([canal, v]) => ({ canal, freteMedio: round2(v.frete / v.pedidos), freteTotal: round2(v.frete) }))
      .sort((x, y) => y.freteTotal - x.freteTotal || x.canal.localeCompare(y.canal, 'pt-BR')),
  };
}

export function unidadesTotais(orders: OrderRow[]): number {
  return orders.reduce((acc, o) => acc + o.itens.reduce((s, i) => s + i.quantidade, 0), 0);
}

export function itensPorPedido(orders: OrderRow[]): number {
  if (orders.length === 0) return 0;
  return round2(unidadesTotais(orders) / orders.length);
}

/** Percentil com interpolação linear (pos = (n-1)*p). Lista deve vir ordenada asc. */
export function percentil(precosOrdenadosAsc: number[], p: number): number {
  if (precosOrdenadosAsc.length === 0) return 0;
  const pos = (precosOrdenadosAsc.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.min(lo + 1, precosOrdenadosAsc.length - 1);
  const frac = pos - lo;
  return round2(precosOrdenadosAsc[lo] + frac * (precosOrdenadosAsc[hi] - precosOrdenadosAsc[lo]));
}

/**
 * Faixa de preços de mercado por produto monitorado (min/p25/mediana/p75 + fonte
 * predominante). Mesmo matching keyword→snapshots de `posicaoPreco`; produto sem
 * nenhum preço de mercado é OMITIDO.
 */
export function faixaMercado(
  products: ProductRow[],
  snapshots: SnapshotRow[],
): { sku: string; nome: string; min: number; p25: number; mediana: number; p75: number; fonte: string }[] {
  const snapshotsByKeyword = new Map<string, SnapshotRow[]>();
  for (const snap of snapshots) {
    const list = snapshotsByKeyword.get(snap.keyword) ?? [];
    list.push(snap);
    snapshotsByKeyword.set(snap.keyword, list);
  }

  const result: { sku: string; nome: string; min: number; p25: number; mediana: number; p75: number; fonte: string }[] = [];
  for (const p of products) {
    if (!p.ativo || !p.sku) continue;
    const allPrecos: number[] = [];
    const fonteCount = new Map<string, number>();
    for (const keyword of p.keywords) {
      for (const snap of snapshotsByKeyword.get(keyword) ?? []) {
        const precos = Array.isArray(snap.dados?.precos) ? snap.dados.precos : [];
        allPrecos.push(...precos);
        fonteCount.set(snap.fonte, (fonteCount.get(snap.fonte) ?? 0) + 1);
      }
    }
    if (allPrecos.length === 0) continue;
    const sorted = [...allPrecos].sort((x, y) => x - y);
    const fonte = Array.from(fonteCount.entries()).sort(
      (x, y) => y[1] - x[1] || x[0].localeCompare(y[0], 'pt-BR'),
    )[0][0];
    result.push({
      sku: p.sku,
      nome: p.nome,
      min: round2(sorted[0]),
      p25: percentil(sorted, 0.25),
      mediana: percentil(sorted, 0.5),
      p75: percentil(sorted, 0.75),
      fonte,
    });
  }
  return result.sort((a, b) => a.sku.localeCompare(b.sku, 'pt-BR'));
}
```

Import: `import { MetricasSchema, type Metricas, type ProdutoAbc } from '@/modules/pipeline/contracts';`. Compor em `computeMetrics` (junto dos campos da Task 1):

```ts
    curvaAbc: curvaAbc(orderRows),
    piores: pioresProdutos(orderRows),
    frete: freteStats(orderRows),
    unidadesTotais: unidadesTotais(orderRows),
    itensPorPedido: itensPorPedido(orderRows),
    faixaMercado: faixaMercado(productRows, snapshotRows),
```

- [ ] **Step 4:** `npx vitest run tests/unit/compute-metrics-produtos.test.ts tests/unit/compute-metrics.test.ts` → **PASSA** (incl. suíte antiga de `topProdutos`).

- [ ] **Step 5 (integração):** Criar `tests/integration/compute-metrics-produtos.test.ts` (mesmo boilerplate da Task 1 Step 5, RUN próprio): semear 1 org + 1 report + 2 orders com `frete: '15.00'`/`'5.00'` e `itens` jsonb (`[{ sku: 'A1', nome: 'Produto A1', quantidade: 2, valor: 100 }]` e `[{ sku: 'B1', nome: 'Produto B1', quantidade: 1, valor: 50 }]`), 1 `trackedProducts` (`nome: 'Produto A1', sku: 'A1', keywords: ['produto a1'], ativo: true`) e 1 `marketSnapshots` (`report_id` do report, `fonte: 'ml_publico'`, `keyword: 'produto a1'`, `dados: { precos: [90, 110], quantidadeResultados: 2 }`). Assertar: `m.curvaAbc?.a[0].sku === 'A1'`, `m.frete?.freteMedio === 10`, `m.unidadesTotais === 3`, `m.itensPorPedido === 1.5`, `m.faixaMercado` contém `{ sku: 'A1', min: 90, p25: 95, mediana: 100, p75: 105, fonte: 'ml_publico' }`. Cleanup em `finally`: deletar `marketSnapshots` (por org), `trackedProducts`, `orders`, `reports`, `organizations` — NESTA ordem (FKs). Rodar → **PASSA**.

- [ ] **Step 6:** `npm run typecheck` + `npx vitest run` verdes. **Commit:** `feat(g1): metricas v2 — curva abc, piores produtos, frete, unidades e faixas de mercado`.

---
### Task 3: Schema IA v2 — achados estruturados, destaques e precoAtual (+ helpers de ordenação)

**Files:** Modify `src/modules/pipeline/contracts.ts`, `src/modules/reports/report-view-model.ts`; Create `tests/unit/contracts-ia-v2.test.ts`, `tests/unit/achados-view-model.test.ts`.

**Interfaces (Consumes):** `AnaliseIaSchema` atual (contracts.ts linhas 84–102 — `.strict()`, arrays de string obrigatórios), `recomendacaoCards` existente em report-view-model.ts (NÃO remover — PDF e fallbacks usam).

**Interfaces (Produces):**

Em `contracts.ts`:

```ts
export const ACHADO_TIPOS = ['preco', 'anuncio', 'logistica', 'catalogo', 'conta', 'outro'] as const;
// mesmos valores de TASK_TIPOS (src/modules/tasks/task.types.ts) — conversão achado→task é direta

export const AchadoSchema = z
  .object({
    titulo: z.string().min(1).max(80),
    descricao: z.string(),
    tipo: z.enum(ACHADO_TIPOS),
    prioridade: z.enum(['alta', 'media', 'baixa']),
    impactoEstimadoMensalBRL: z.number().nullable(),
    comoFazer: z.array(z.string()),
    skus: z.array(z.string()),
  })
  .strict();

export type Achado = z.infer<typeof AchadoSchema>;

export const DestaqueSchema = z
  .object({ label: z.string(), valor: z.string(), direcao: z.enum(['up', 'down', 'flat']) })
  .strict();
export type Destaque = z.infer<typeof DestaqueSchema>;
```

`AnaliseIaSchema` ganha (mantendo TODOS os campos atuais obrigatórios como estão):

```ts
    achados: z.array(AchadoSchema).optional(),
    destaques: z.array(DestaqueSchema).optional(),
```

e o item de `recomendacoesPreco` ganha `precoAtual: z.number().optional(),` (antes de `precoSugerido`).

Em `report-view-model.ts`:

```ts
import type { Achado, AnaliseIa } from '@/modules/pipeline/contracts';

export type AchadoOrdenado = { achado: Achado; indice: number }; // indice = posição ORIGINAL no array (o form de virar-task precisa dele)
export function ordenarAchados(achados: Achado[]): AchadoOrdenado[];
export function primeiroGargalo(analise: AnaliseIa): string | null;
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/contracts-ia-v2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { AchadoSchema, AnaliseIaSchema } from '@/modules/pipeline/contracts';

const ANALISE_ANTIGA = {
  resumoExecutivo: 'Resumo.',
  gargalos: ['Frete caro'],
  sugestoesMelhoria: ['Negociar tarifa'],
  ideiasVenda: ['Kit'],
  recomendacoesPreco: [{ sku: 'S1', nome: 'P1', precoSugerido: 98, justificativa: 'Mediana.' }],
};

const ACHADO = {
  titulo: 'Frete come 12% da receita no Mercado Livre',
  descricao: 'O frete médio de R$ 25 representa 12% da receita do canal.',
  tipo: 'logistica',
  prioridade: 'alta',
  impactoEstimadoMensalBRL: 1200,
  comoFazer: ['Ativar o Mercado Envios Full', 'Renegociar tabela com a transportadora'],
  skus: ['SKU-001'],
};

describe('AnaliseIaSchema v2 — retrocompat total', () => {
  it('análise ANTIGA (sem achados/destaques/precoAtual) continua válida', () => {
    expect(AnaliseIaSchema.safeParse(ANALISE_ANTIGA).success).toBe(true);
  });

  it('análise v2 com achados, destaques e precoAtual é válida', () => {
    const v2 = {
      ...ANALISE_ANTIGA,
      achados: [ACHADO],
      destaques: [{ label: 'Total do período', valor: 'R$ 10.880', direcao: 'up' }],
      recomendacoesPreco: [
        { sku: 'S1', nome: 'P1', precoAtual: 105, precoSugerido: 98, justificativa: 'Mediana.' },
      ],
    };
    expect(AnaliseIaSchema.safeParse(v2).success).toBe(true);
  });

  it('titulo de achado com mais de 80 chars é rejeitado', () => {
    expect(AchadoSchema.safeParse({ ...ACHADO, titulo: 'x'.repeat(81) }).success).toBe(false);
  });

  it('tipo fora do enum é rejeitado', () => {
    expect(AchadoSchema.safeParse({ ...ACHADO, tipo: 'financeiro' }).success).toBe(false);
  });

  it('impactoEstimadoMensalBRL aceita null (impacto não quantificável)', () => {
    expect(AchadoSchema.safeParse({ ...ACHADO, impactoEstimadoMensalBRL: null }).success).toBe(true);
  });
});
```

- [ ] **Step 2:** Criar `tests/unit/achados-view-model.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Achado, AnaliseIa } from '@/modules/pipeline/contracts';
import { ordenarAchados, primeiroGargalo } from '@/modules/reports/report-view-model';

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

describe('ordenarAchados', () => {
  it('impacto desc → null por último → prioridade → título; preserva índice original', () => {
    const lista = [
      achado({ titulo: 'B sem impacto alta', prioridade: 'alta' }), // 0
      achado({ titulo: 'C impacto 500', impactoEstimadoMensalBRL: 500 }), // 1
      achado({ titulo: 'A impacto 2000', impactoEstimadoMensalBRL: 2000 }), // 2
      achado({ titulo: 'A sem impacto alta', prioridade: 'alta' }), // 3
    ];
    const r = ordenarAchados(lista);
    expect(r.map((x) => x.achado.titulo)).toEqual([
      'A impacto 2000',
      'C impacto 500',
      'A sem impacto alta',
      'B sem impacto alta',
    ]);
    expect(r.map((x) => x.indice)).toEqual([2, 1, 3, 0]);
  });
});

describe('primeiroGargalo', () => {
  const base: AnaliseIa = {
    resumoExecutivo: 'R.',
    gargalos: ['Gargalo legado'],
    sugestoesMelhoria: [],
    ideiasVenda: [],
    recomendacoesPreco: [],
  };

  it('prefere o achado de maior impacto quando presente', () => {
    const a: AnaliseIa = { ...base, achados: [achado({ titulo: 'Top', impactoEstimadoMensalBRL: 900 })] };
    expect(primeiroGargalo(a)).toBe('Top');
  });

  it('fallback para gargalos[0] em relatório antigo', () => {
    expect(primeiroGargalo(base)).toBe('Gargalo legado');
  });

  it('null quando não há nada', () => {
    expect(primeiroGargalo({ ...base, gargalos: [] })).toBeNull();
  });
});
```

- [ ] **Step 3:** `npx vitest run tests/unit/contracts-ia-v2.test.ts tests/unit/achados-view-model.test.ts` → **FALHA**.

- [ ] **Step 4:** Implementar o bloco do Produces em `contracts.ts` e, em `report-view-model.ts`, adicionar (mantendo `recomendacaoCards` intacto):

```ts
const PRIORIDADE_PESO: Record<'alta' | 'media' | 'baixa', number> = { alta: 0, media: 1, baixa: 2 };

export type AchadoOrdenado = { achado: Achado; indice: number };

/**
 * Ordenação canônica de achados (cards, PDF, "gargalo nº 1" do e-mail):
 * impacto R$ desc (null por último) → prioridade alta>média>baixa → título asc.
 * `indice` preserva a posição ORIGINAL (o form achado→task referencia por índice).
 */
export function ordenarAchados(achados: Achado[]): AchadoOrdenado[] {
  return achados
    .map((achado, indice) => ({ achado, indice }))
    .sort((a, b) => {
      const ia = a.achado.impactoEstimadoMensalBRL ?? -1;
      const ib = b.achado.impactoEstimadoMensalBRL ?? -1;
      if (ib !== ia) return ib - ia;
      const pa = PRIORIDADE_PESO[a.achado.prioridade];
      const pb = PRIORIDADE_PESO[b.achado.prioridade];
      if (pa !== pb) return pa - pb;
      return a.achado.titulo.localeCompare(b.achado.titulo, 'pt-BR');
    });
}

/** Gargalo nº 1: melhor achado (ordem canônica) ou gargalos[0] em relatório antigo. */
export function primeiroGargalo(analise: AnaliseIa): string | null {
  if (analise.achados && analise.achados.length > 0) {
    return ordenarAchados(analise.achados)[0].achado.titulo;
  }
  return analise.gargalos[0] ?? null;
}
```

(ajustar o import do topo para `import type { Achado, AnaliseIa } from '@/modules/pipeline/contracts';`)

- [ ] **Step 5:** `npx vitest run tests/unit/contracts-ia-v2.test.ts tests/unit/achados-view-model.test.ts tests/unit/contracts.test.ts tests/unit/report-view-model.test.ts` → **PASSA** (as suítes antigas provam a retrocompat).

- [ ] **Step 6:** `npm run typecheck` + `npx vitest run` verdes. **Commit:** `feat(g1): schema ia v2 — achados estruturados, destaques e precoAtual + ordenacao canonica`.

---

### Task 4: Prompt v2 — "consultor Truth com memória e calendário"

**Files:** Create `src/lib/calendario-comercial.ts`, `src/modules/pipeline/steps/analysis-context.ts`, `tests/unit/calendario-comercial.test.ts`, `tests/unit/analysis-prompt.test.ts`; Modify `src/modules/pipeline/steps/analyze-ia.ts`, `src/modules/pipeline/orchestrator.ts`, `tests/unit/analyze-ia.test.ts` (chamadas com a nova assinatura).

**⚠️ Fronteira com a G0:** a G0 alterou a MECÂNICA da chamada (`.stream()`, `stop_reason`, usage, retry). Esta task altera SOMENTE a construção de `system`/`user` (extraída para `buildAnalysisMessages` pura) e a assinatura pública. Leia o `analyze-ia.ts` real antes; se o retry da G0 reusar `userBlock`/`system`, ele passa a reusar os textos novos — sem mudança estrutural.

**Interfaces (Consumes):** `getOrgSettings`/`getTotalVendasMesCorrente` (`src/modules/organizations/organization-settings.repository.ts` — `getOrgSettings(orgId): Promise<{ geracaoAutomatica: boolean; metaMensal: number | null } | null>`; `getTotalVendasMesCorrente(orgId, agora?): Promise<number>`), `getUltimosDoneDetalhados(orgId, limite = 2): Promise<ReportDetail[]>` (`report.repository.ts` — no momento do `analisando_ia` o report corrente ainda é `running`, logo `limite: 1` devolve o done ANTERIOR), `totalVendas(m: Metricas)` (`compare.ts`), `formatBRL`/`formatData` (`@/lib/format`), `Plano` (`@/modules/auth/user.types`), `getOrganizationById` já chamado no orquestrador (fornece `org.name`, `plano`, `nicho`).

**Interfaces (Produces):**

`src/lib/calendario-comercial.ts`:

```ts
export type DataComercial = { nome: string; data: Date; dica: string };
export function datasComerciaisDoAno(ano: number): DataComercial[]; // ~15 datas, datas em UTC-midnight
export function proximasDatas(aPartirDe: Date, dias: number): DataComercial[]; // [aPartirDe, aPartirDe+dias], sort asc
```

`analyze-ia.ts`:

```ts
export type AnalysisContext = {
  orgName: string;
  nicho: string | null;
  plano: Plano;
  periodo: Periodo;
  metaMensal: number | null;
  totalMesCorrente: number;
  relatorioAnterior: {
    periodo: Periodo;
    resumoExecutivo: string;
    recomendacoes: string[];
    totalPeriodo: number | null;
  } | null;
  datasComerciais: DataComercial[];
};

export function buildAnalysisMessages(metricas: Metricas, contexto: AnalysisContext): { system: string; user: string };
export async function analyzeWithIA(metricas: Metricas, contexto: AnalysisContext): Promise<AnaliseIa>; // assinatura MUDA (antes: nicho: string | null)
```

`analysis-context.ts`:

```ts
export async function buildAnalysisContext(input: {
  orgId: string;
  orgName: string;
  nicho: string | null;
  plano: Plano;
  periodo: Periodo;
}): Promise<AnalysisContext>;
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/calendario-comercial.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { datasComerciaisDoAno, proximasDatas } from '@/lib/calendario-comercial';

function achar(ano: number, nome: string) {
  return datasComerciaisDoAno(ano).find((d) => d.nome === nome);
}

describe('datasComerciaisDoAno — regras móveis (valores verificados)', () => {
  it('Dia das Mães 2026 = 2º domingo de maio = 10/05', () => {
    expect(achar(2026, 'Dia das Mães')?.data.toISOString().slice(0, 10)).toBe('2026-05-10');
  });

  it('Dia dos Pais 2026 = 2º domingo de agosto = 09/08', () => {
    expect(achar(2026, 'Dia dos Pais')?.data.toISOString().slice(0, 10)).toBe('2026-08-09');
  });

  it('Black Friday 2026 = última sexta de novembro = 27/11', () => {
    expect(achar(2026, 'Black Friday')?.data.toISOString().slice(0, 10)).toBe('2026-11-27');
  });

  it('Páscoa 2026 = 05/04 (computus) e Carnaval = 17/02', () => {
    expect(achar(2026, 'Páscoa')?.data.toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(achar(2026, 'Carnaval')?.data.toISOString().slice(0, 10)).toBe('2026-02-17');
  });

  it('tem ~15 datas, todas com dica não-vazia', () => {
    const datas = datasComerciaisDoAno(2026);
    expect(datas.length).toBeGreaterThanOrEqual(14);
    for (const d of datas) expect(d.dica.length).toBeGreaterThan(0);
  });
});

describe('proximasDatas', () => {
  it('janela de 60 dias a partir de 01/10/2026 → Crianças, Black Friday e Cyber Monday', () => {
    const r = proximasDatas(new Date('2026-10-01T00:00:00Z'), 60);
    expect(r.map((d) => d.nome)).toEqual(['Dia das Crianças', 'Black Friday', 'Cyber Monday']);
  });

  it('cruza a virada do ano (dez → jan/fev do ano seguinte)', () => {
    const r = proximasDatas(new Date('2026-12-20T00:00:00Z'), 60);
    expect(r.map((d) => d.nome)).toContain('Natal');
    expect(r.map((d) => d.nome)).toContain('Ano Novo');
    expect(r.map((d) => d.nome)).toContain('Volta às aulas');
  });

  it('ordenado asc e sem datas fora da janela', () => {
    const r = proximasDatas(new Date('2026-10-01T00:00:00Z'), 60);
    for (let i = 1; i < r.length; i++) expect(r[i].data.getTime()).toBeGreaterThanOrEqual(r[i - 1].data.getTime());
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/calendario-comercial.test.ts` → **FALHA**. Implementar `src/lib/calendario-comercial.ts`:

```ts
/**
 * Calendário comercial brasileiro — datas fixas + regras móveis, tudo puro
 * (datas em UTC-midnight, sem I/O). Usado para injetar contexto sazonal no
 * prompt da análise IA (só datas a ≤N dias do fim do período).
 */

export type DataComercial = { nome: string; data: Date; dica: string };

const DIA_MS = 86_400_000;

function utc(ano: number, mesIdx: number, dia: number): Date {
  return new Date(Date.UTC(ano, mesIdx, dia));
}

/** Computus (algoritmo gregoriano anônimo/Meeus) — domingo de Páscoa. */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = março, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(ano, mes - 1, dia);
}

function nEsimoDomingo(ano: number, mesIdx: number, n: number): Date {
  const primeiro = utc(ano, mesIdx, 1);
  const offset = (7 - primeiro.getUTCDay()) % 7;
  return utc(ano, mesIdx, 1 + offset + (n - 1) * 7);
}

function ultimaSexta(ano: number, mesIdx: number): Date {
  const ultimo = new Date(Date.UTC(ano, mesIdx + 1, 0));
  const offset = (ultimo.getUTCDay() - 5 + 7) % 7;
  return utc(ano, mesIdx, ultimo.getUTCDate() - offset);
}

export function datasComerciaisDoAno(ano: number): DataComercial[] {
  const pascoaData = pascoa(ano);
  const carnaval = new Date(pascoaData.getTime() - 47 * DIA_MS);
  const blackFriday = ultimaSexta(ano, 10);
  const cyberMonday = new Date(blackFriday.getTime() + 3 * DIA_MS);
  return [
    { nome: 'Ano Novo', data: utc(ano, 0, 1), dica: 'Queima de estoque e listas de "recomeço" (organização, fitness, papelaria).' },
    { nome: 'Volta às aulas', data: utc(ano, 0, 15), dica: 'Pico de material escolar, mochilas, eletrônicos de estudo.' },
    { nome: 'Carnaval', data: carnaval, dica: 'Fantasias, glitter, caixas térmicas; logística mais lenta na semana.' },
    { nome: 'Dia da Mulher', data: utc(ano, 2, 8), dica: 'Presentes de ticket baixo/médio: beleza, acessórios, canecas.' },
    { nome: 'Dia do Consumidor', data: utc(ano, 2, 15), dica: '"Black Friday do 1º semestre" — cupons e frete grátis convertem bem.' },
    { nome: 'Páscoa', data: pascoaData, dica: 'Chocolates, cestas e utilidades de cozinha; anuncie 3 semanas antes.' },
    { nome: 'Dia das Mães', data: nEsimoDomingo(ano, 4, 2), dica: 'Segunda maior data do e-commerce BR — kits presenteáveis e embalagem.' },
    { nome: 'Dia dos Namorados', data: utc(ano, 5, 12), dica: 'Presentes até R$ 150 dominam; combos "para o casal".' },
    { nome: 'Volta às aulas (2º semestre)', data: utc(ano, 6, 15), dica: 'Reposição de material escolar e informática.' },
    { nome: 'Dia dos Pais', data: nEsimoDomingo(ano, 7, 2), dica: 'Ferramentas, churrasco, eletrônicos; kits com cartão.' },
    { nome: 'Dia do Cliente', data: utc(ano, 8, 15), dica: 'Data de recompra: cupom para quem já comprou.' },
    { nome: 'Dia das Crianças', data: utc(ano, 9, 12), dica: 'Brinquedos e games; frete rápido decide a compra na última semana.' },
    { nome: 'Black Friday', data: blackFriday, dica: 'Maior data do ano — prepare estoque e preço 30 dias antes; evite "metade do dobro".' },
    { nome: 'Cyber Monday', data: cyberMonday, dica: 'Extensão da Black Friday para eletrônicos e itens parados.' },
    { nome: 'Natal', data: utc(ano, 11, 25), dica: 'Corte de frete: últimos pedidos ~10 dias antes; kits presente.' },
  ];
}

/** Datas comerciais dentro de [aPartirDe, aPartirDe + dias], ordenadas asc. */
export function proximasDatas(aPartirDe: Date, dias: number): DataComercial[] {
  const fimJanela = aPartirDe.getTime() + dias * DIA_MS;
  const ano = aPartirDe.getUTCFullYear();
  return [...datasComerciaisDoAno(ano), ...datasComerciaisDoAno(ano + 1)]
    .filter((d) => d.data.getTime() >= aPartirDe.getTime() && d.data.getTime() <= fimJanela)
    .sort((a, b) => a.data.getTime() - b.data.getTime());
}
```

`npx vitest run tests/unit/calendario-comercial.test.ts` → **PASSA**. *(Se algum valor de tabela divergir, confira o computus — os valores 2026 do teste foram verificados manualmente.)*

- [ ] **Step 3 (teste falha primeiro):** Criar `tests/unit/analysis-prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Metricas } from '@/modules/pipeline/contracts';
import { buildAnalysisMessages, type AnalysisContext } from '@/modules/pipeline/steps/analyze-ia';

const METRICAS: Metricas = {
  vendasPorCanal: [{ canal: 'shopee', total: 1000, pedidos: 10 }],
  evolucao: [{ data: '2026-06-01', total: 1000 }],
  ticketMedio: 100,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
};

const CONTEXTO: AnalysisContext = {
  orgName: 'Bazar Estrela do Mar',
  nicho: 'utilidades domésticas',
  plano: 'monthly',
  periodo: { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-30T23:59:59Z') },
  metaMensal: 45000,
  totalMesCorrente: 23400,
  relatorioAnterior: {
    periodo: { inicio: new Date('2026-05-01T00:00:00Z'), fim: new Date('2026-05-31T23:59:59Z') },
    resumoExecutivo: 'Mês anterior estável.',
    recomendacoes: ['Reduzir frete no ML'],
    totalPeriodo: 9800,
  },
  datasComerciais: [
    { nome: 'Dia dos Pais', data: new Date('2026-08-09T00:00:00Z'), dica: 'Kits presenteáveis.' },
  ],
};

describe('buildAnalysisMessages — system', () => {
  it('define a persona consultor Truth para lojista leigo, com limites e regras de qualidade', () => {
    const { system } = buildAnalysisMessages(METRICAS, CONTEXTO);
    expect(system).toContain('consultor sênior');
    expect(system).toContain('LEIGO');
    expect(system).toContain('máximo 4');
    expect(system).toContain('achados');
    expect(system).toContain('JSON');
  });

  it('inclui o aviso de benchmark parcial só quando benchmarkParcial=true', () => {
    const sem = buildAnalysisMessages(METRICAS, CONTEXTO).system;
    const com = buildAnalysisMessages({ ...METRICAS, benchmarkParcial: true }, CONTEXTO).system;
    expect(sem).not.toContain('INCOMPLETO');
    expect(com).toContain('INCOMPLETO');
  });
});

describe('buildAnalysisMessages — user', () => {
  it('injeta loja, nicho, período, meta com progresso, relatório anterior e calendário', () => {
    const { user } = buildAnalysisMessages(METRICAS, CONTEXTO);
    expect(user).toContain('Bazar Estrela do Mar');
    expect(user).toContain('utilidades domésticas');
    expect(user).toContain('Mensal');
    expect(user).toContain('01/06/2026');
    expect(user).toContain('45.000');
    expect(user).toContain('52%'); // 23400/45000
    expect(user).toContain('Mês anterior estável.');
    expect(user).toContain('Reduzir frete no ML');
    expect(user).toContain('surtiram efeito');
    expect(user).toContain('Dia dos Pais');
    expect(user).toContain('"ticketMedio": 100'); // métricas em JSON
  });

  it('sem meta e sem anterior → seções honestas', () => {
    const { user } = buildAnalysisMessages(METRICAS, {
      ...CONTEXTO,
      metaMensal: null,
      relatorioAnterior: null,
      datasComerciais: [],
    });
    expect(user).toContain('Sem meta mensal definida');
    expect(user).toContain('primeiro relatório');
    expect(user).toContain('Nenhuma data comercial relevante');
  });
});
```

- [ ] **Step 4:** `npx vitest run tests/unit/analysis-prompt.test.ts` → **FALHA**. Implementar em `analyze-ia.ts` — substituir `buildSystemPrompt`/`buildUserMessage` por:

```ts
import { formatBRL, formatData } from '@/lib/format';
import type { DataComercial } from '@/lib/calendario-comercial';
import type { Plano } from '@/modules/auth/user.types';
import type { Periodo } from '@/modules/providers/types';

const PLANO_LABEL: Record<Plano, string> = {
  weekly: 'Semanal (análise a cada 7 dias)',
  biweekly: 'Quinzenal (análise a cada 14 dias)',
  monthly: 'Mensal (análise a cada 30 dias)',
};

export type AnalysisContext = {
  orgName: string;
  nicho: string | null;
  plano: Plano;
  periodo: Periodo;
  metaMensal: number | null;
  totalMesCorrente: number;
  relatorioAnterior: {
    periodo: Periodo;
    resumoExecutivo: string;
    recomendacoes: string[];
    totalPeriodo: number | null;
  } | null;
  datasComerciais: DataComercial[];
};

/** Pura — monta system + user do prompt v2 (testável sem tocar a API). */
export function buildAnalysisMessages(
  metricas: Metricas,
  contexto: AnalysisContext,
): { system: string; user: string } {
  const avisoBenchmark = metricas.benchmarkParcial
    ? `\n\nATENÇÃO: O benchmark de mercado está INCOMPLETO (benchmarkParcial=true). NÃO invente conclusões sobre concorrentes a partir de dados ausentes. Em recomendações de preço, deixe explícito que a base comparativa é limitada.`
    : '';

  const scoreTexto = metricas.truth_score
    ? `\n\nAs métricas incluem um "truth_score" (${metricas.truth_score.score}/100) — saúde da operação (crescimento, posição de preço, diversificação, regularidade, cobertura de benchmark). No resumoExecutivo, comente o score e conecte os achados aos fatores mais fracos.`
    : '';

  const system = `Você é um consultor sênior de marketplaces da Truth Commerce escrevendo para um LOJISTA LEIGO — dono de e-commerce brasileiro sem formação técnica.

TOM E LINGUAGEM:
- Português do Brasil, frases curtas, zero jargão (nada de "KPI", "MoM", "benchmark" sem explicar).
- Valores em reais SEMPRE com separador de milhar (ex.: R$ 10.880,00).
- Fale COM o lojista ("suas vendas", "seu frete"), nunca sobre ele.

REGRAS DE QUALIDADE (obrigatórias):
1. Todo achado cita pelo menos UM número das métricas e, quando fizer sentido, o SKU envolvido.
2. Toda recomendação é uma AÇÃO executável: passos concretos em "comoFazer" (2 a 5 passos) + impacto estimado em R$/mês em "impactoEstimadoMensalBRL" COM a conta mostrada na descrição (ex.: "R$ 25 de frete × 48 pedidos = R$ 1.200/mês"). Se não der para estimar com os dados, use null — nunca invente.
3. Priorize por dinheiro: "prioridade" e "impactoEstimadoMensalBRL" vêm nos achados estruturados.
4. Limites: máximo 4 gargalos, máximo 4 sugestões de melhoria, máximo 3 ideias de venda, máximo 8 achados.
5. Use o calendário comercial fornecido para ideias de venda com data (se houver datas próximas).
6. Se houver relatório anterior, comece o resumoExecutivo comparando com ele.

FORMATO DA RESPOSTA:
- Preencha "achados" (estruturado, o principal) E TAMBÉM os campos legados: "gargalos" = títulos dos achados de prioridade alta; "sugestoesMelhoria" = títulos dos achados de prioridade média; "ideiasVenda" = títulos dos achados de prioridade baixa/oportunidades sazonais.
- Preencha "destaques" com 3 KPIs curtos do período (label, valor formatado, direção up/down/flat).
- Em "recomendacoesPreco", inclua "precoAtual" (o nosso preço atual das métricas) além do sugerido.${avisoBenchmark}${scoreTexto}

Responda EXCLUSIVAMENTE com um objeto JSON válido conforme o schema fornecido. Não inclua texto fora do JSON.`;

  const metaTexto =
    contexto.metaMensal !== null && contexto.metaMensal > 0
      ? `Meta mensal: ${formatBRL(contexto.metaMensal)} — vendido no mês corrente até agora: ${formatBRL(contexto.totalMesCorrente)} (${Math.round((contexto.totalMesCorrente / contexto.metaMensal) * 100)}% da meta).`
      : 'Sem meta mensal definida.';

  const ant = contexto.relatorioAnterior;
  const anteriorTexto = ant
    ? [
        `Período anterior: ${formatData(ant.periodo.inicio)} a ${formatData(ant.periodo.fim)}`,
        ant.totalPeriodo !== null ? `Total vendido no período anterior: ${formatBRL(ant.totalPeriodo)}` : null,
        `Resumo do relatório anterior: ${ant.resumoExecutivo}`,
        ant.recomendacoes.length > 0
          ? `Recomendações dadas no relatório anterior:\n${ant.recomendacoes.map((r) => `- ${r}`).join('\n')}`
          : null,
        'Avalie se as recomendações anteriores surtiram efeito e comente a evolução.',
      ]
        .filter((l): l is string => l !== null)
        .join('\n')
    : 'Este é o primeiro relatório desta loja — não há período anterior para comparar.';

  const calendarioTexto =
    contexto.datasComerciais.length > 0
      ? contexto.datasComerciais
          .map((d) => `- ${formatData(d.data)} — ${d.nome}: ${d.dica}`)
          .join('\n')
      : 'Nenhuma data comercial relevante nos próximos 60 dias.';

  const user = `### Sobre a loja
Loja: ${contexto.orgName}
Nicho: ${contexto.nicho ?? 'não informado'}
Plano de análise: ${PLANO_LABEL[contexto.plano]}
Período analisado: ${formatData(contexto.periodo.inicio)} a ${formatData(contexto.periodo.fim)}

### Meta do mês
${metaTexto}

### Relatório anterior
${anteriorTexto}

### Datas comerciais nos próximos 60 dias
${calendarioTexto}

### Métricas do período (JSON)
${JSON.stringify(metricas, null, 2)}`;

  return { system, user };
}
```

E em `analyzeWithIA`: trocar a assinatura para `(metricas: Metricas, contexto: AnalysisContext)`, substituir as duas primeiras linhas por `const { system, user } = buildAnalysisMessages(metricas, contexto);` e usar `user` onde hoje se usa `userText`. **NÃO tocar** no resto (cache_control, output_config, retry, mecânica G0). Remover `buildSystemPrompt`/`buildUserMessage` antigos.

- [ ] **Step 5:** Criar `src/modules/pipeline/steps/analysis-context.ts`:

```ts
import { proximasDatas } from '@/lib/calendario-comercial';
import type { Plano } from '@/modules/auth/user.types';
import { getOrgSettings, getTotalVendasMesCorrente } from '@/modules/organizations/organization-settings.repository';
import type { AnalysisContext } from '@/modules/pipeline/steps/analyze-ia';
import type { Periodo } from '@/modules/providers/types';
import { totalVendas } from '@/modules/reports/compare';
import { getUltimosDoneDetalhados } from '@/modules/reports/report.repository';

export const CALENDARIO_JANELA_DIAS = 60;

/**
 * Monta o contexto rico do prompt v2. Chamado pelo orquestrador DURANTE a
 * etapa 'analisando_ia' — o report corrente ainda está 'running', então
 * getUltimosDoneDetalhados(orgId, 1) devolve o done ANTERIOR.
 */
export async function buildAnalysisContext(input: {
  orgId: string;
  orgName: string;
  nicho: string | null;
  plano: Plano;
  periodo: Periodo;
}): Promise<AnalysisContext> {
  const [settings, totalMesCorrente, anteriores] = await Promise.all([
    getOrgSettings(input.orgId),
    getTotalVendasMesCorrente(input.orgId),
    getUltimosDoneDetalhados(input.orgId, 1),
  ]);
  const anterior = anteriores[0];
  return {
    orgName: input.orgName,
    nicho: input.nicho,
    plano: input.plano,
    periodo: input.periodo,
    metaMensal: settings?.metaMensal ?? null,
    totalMesCorrente,
    relatorioAnterior: anterior?.metricas
      ? {
          periodo: { inicio: anterior.periodoInicio, fim: anterior.periodoFim },
          resumoExecutivo: anterior.analiseIa?.resumoExecutivo ?? '',
          recomendacoes: anterior.analiseIa
            ? [...anterior.analiseIa.gargalos, ...anterior.analiseIa.sugestoesMelhoria].slice(0, 8)
            : [],
          totalPeriodo: anterior.metricas.truth_score?.totalPeriodo ?? totalVendas(anterior.metricas),
        }
      : null,
    datasComerciais: proximasDatas(input.periodo.fim, CALENDARIO_JANELA_DIAS),
  };
}
```

No `orchestrator.ts`, trocar:

```ts
    await setEtapa(reportId, 'analisando_ia');
    const analise = await analyzeWithIA(metricas, nicho);
```

por:

```ts
    await setEtapa(reportId, 'analisando_ia');
    const contexto = await buildAnalysisContext({ orgId, orgName: org.name, nicho, plano, periodo });
    const analise = await analyzeWithIA(metricas, contexto);
```

(import `buildAnalysisContext` de `./steps/analysis-context`).

- [ ] **Step 6:** Atualizar `tests/unit/analyze-ia.test.ts`: onde as chamadas passam `nicho` (string/null) como 2º argumento, passar um `CONTEXTO` fixture mínimo (mesmo shape do teste do Step 3 — pode ser copiado). NÃO alterar as asserções de mecânica (retry, parse, erro). Rodar `npx vitest run tests/unit/analyze-ia.test.ts tests/unit/analysis-prompt.test.ts` → **PASSA**.

- [ ] **Step 7:** `npx vitest run tests/integration/orchestrator.test.ts` — o teste de integração do orquestrador provavelmente mocka `analyzeWithIA` via `vi.mock` (aceita qualquer args) e agora passa por `buildAnalysisContext` real (só SELECTs — funciona no branch test). Se falhar por org sem settings, o `?? null` cobre. Ajustar mocks SE necessário (documentar no commit). `npm run typecheck` + `npx vitest run` verdes. **Commit:** `feat(g1): prompt v2 — consultor truth com memoria, meta e calendario comercial br`.

---
### Task 5: Pipeline liga tudo — e-mail rico do finalize + conversão achado→task

**Files:** Modify `src/modules/pipeline/steps/finalize.ts`, `src/modules/pipeline/orchestrator.ts`, `src/modules/notifications/templates.ts`, `src/modules/notifications/email.ts`, `src/modules/tasks/report-to-task.ts`, `src/modules/tasks/report-to-task.repository.ts`, `tests/unit/notification-templates.test.ts` (só o bloco `reportReadyTemplate` — nova assinatura); Create `tests/unit/finalize-email-dados.test.ts`, `tests/unit/report-to-task-achados.test.ts`.

**Interfaces (Consumes):** `FinalizeInput` (finalize.ts linhas 10–18 — ganha `periodo`), `sendReportReadyEmail(to, reportId)` atual (email.ts:63), `reportReadyTemplate(reportId, appUrl)` atual (templates.ts:59), `totalVendas`/`deltaNumero` (compare.ts), `ordenarAchados`/`primeiroGargalo` (Task 3), `CHECKLIST_UNCHECKED = '- [ ] '` (`src/modules/tasks/checklist-line.ts:13`), `createTasksFromReport` (report-to-task.repository.ts — o zod da action `createTasksFromReportAction` usa `z.enum(FONTES_ANALISE)`, então estender o array já libera a action), `TaskTipo`/`TaskPrioridade` (task.types.ts — `ACHADO_TIPOS` da Task 3 tem os MESMOS valores de `TASK_TIPOS`).

**Interfaces (Produces):**

```ts
// templates.ts
export type ReportReadyEmailData = {
  reportId: string;
  periodoInicio: Date;
  periodoFim: Date;
  totalPeriodo: number;
  deltaPct: number | null;
  score: number | null;
  primeiroGargalo: string | null;
};
export function reportReadyTemplate(dados: ReportReadyEmailData, appUrl: string): EmailContent; // assinatura MUDA

// email.ts
export async function sendReportReadyEmail(to: string, dados: ReportReadyEmailData): Promise<void>; // assinatura MUDA

// finalize.ts
export type FinalizeInput = { /* campos atuais */ periodo: Periodo; /* novo, obrigatório */ };
export function dadosEmailRelatorio(input: {
  reportId: string;
  periodo: Periodo;
  metricas: Metricas;
  analise: AnaliseIa;
}): ReportReadyEmailData; // PURA — exportada para teste

// report-to-task.ts
export const FONTES_ANALISE = ['gargalos', 'sugestoesMelhoria', 'ideiasVenda', 'achados'] as const; // + 'achados'
export function achadoToTaskInput(achado: Achado, reportId: string): {
  titulo: string; descricao: string; tipo: TaskTipo; prioridade: TaskPrioridade; criadoPor: 'ia'; reportId: string;
};
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/finalize-email-dados.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { dadosEmailRelatorio } from '@/modules/pipeline/steps/finalize';

const PERIODO = { inicio: new Date('2026-06-01T00:00:00Z'), fim: new Date('2026-06-30T23:59:59Z') };

const METRICAS: Metricas = {
  vendasPorCanal: [{ canal: 'shopee', total: 10880, pedidos: 48 }],
  evolucao: [{ data: '2026-06-01', total: 10880 }],
  ticketMedio: 226.67,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
  truth_score: {
    score: 76,
    totalPeriodo: 10880,
    totalPeriodoAnterior: 9700,
    fatores: {
      crescimento: { pontos: 20, max: 25, variacaoPercentual: 12.16 },
      posicaoPreco: { pontos: 15, max: 25, itensAvaliados: 0 },
      diversificacao: { pontos: 8, max: 20, canaisComVenda: 1 },
      regularidade: { pontos: 20, max: 20, diasComVenda: 30, diasPeriodo: 30 },
      cobertura: { pontos: 5, max: 10, produtosComBenchmark: 0, produtosAvaliados: 0 },
    },
  },
};

const ANALISE: AnaliseIa = {
  resumoExecutivo: 'R.',
  gargalos: ['Gargalo legado'],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe('dadosEmailRelatorio (puro)', () => {
  it('monta totalPeriodo, deltaPct (via truth_score), score e primeiro gargalo', () => {
    const d = dadosEmailRelatorio({ reportId: 'r1', periodo: PERIODO, metricas: METRICAS, analise: ANALISE });
    expect(d).toEqual({
      reportId: 'r1',
      periodoInicio: PERIODO.inicio,
      periodoFim: PERIODO.fim,
      totalPeriodo: 10880,
      deltaPct: 12.2, // deltaNumero(10880, 9700) — 1 casa
      score: 76,
      primeiroGargalo: 'Gargalo legado',
    });
  });

  it('relatório sem score/anterior → deltaPct e score null; sem gargalos → null', () => {
    const semScore: Metricas = { ...METRICAS, truth_score: undefined };
    const d = dadosEmailRelatorio({
      reportId: 'r1',
      periodo: PERIODO,
      metricas: semScore,
      analise: { ...ANALISE, gargalos: [] },
    });
    expect(d.deltaPct).toBeNull();
    expect(d.score).toBeNull();
    expect(d.primeiroGargalo).toBeNull();
  });

  it('prefere o titulo do melhor achado quando presente', () => {
    const comAchados: AnaliseIa = {
      ...ANALISE,
      achados: [
        {
          titulo: 'Frete come 12% da receita',
          descricao: 'd',
          tipo: 'logistica',
          prioridade: 'alta',
          impactoEstimadoMensalBRL: 1200,
          comoFazer: [],
          skus: [],
        },
      ],
    };
    const d = dadosEmailRelatorio({ reportId: 'r1', periodo: PERIODO, metricas: METRICAS, analise: comAchados });
    expect(d.primeiroGargalo).toBe('Frete come 12% da receita');
  });
});
```

- [ ] **Step 2:** Criar `tests/unit/report-to-task-achados.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Achado } from '@/modules/pipeline/contracts';
import { achadoToTaskInput, FONTES_ANALISE } from '@/modules/tasks/report-to-task';

const ACHADO: Achado = {
  titulo: 'Frete come 12% da receita no Mercado Livre',
  descricao: 'O frete médio de R$ 25 representa 12% da receita do canal.',
  tipo: 'logistica',
  prioridade: 'alta',
  impactoEstimadoMensalBRL: 1200,
  comoFazer: ['Ativar o Mercado Envios Full', 'Renegociar tabela'],
  skus: ['SKU-001'],
};

describe('achadoToTaskInput', () => {
  it('usa titulo direto (sem slice), tipo e prioridade da IA', () => {
    const t = achadoToTaskInput(ACHADO, 'r1');
    expect(t.titulo).toBe('Frete come 12% da receita no Mercado Livre');
    expect(t.tipo).toBe('logistica');
    expect(t.prioridade).toBe('alta');
    expect(t.criadoPor).toBe('ia');
    expect(t.reportId).toBe('r1');
  });

  it('descricao carrega impacto, SKUs, origem e passos como checklist', () => {
    const t = achadoToTaskInput(ACHADO, 'r1');
    expect(t.descricao).toContain('R$');
    expect(t.descricao).toContain('1.200');
    expect(t.descricao).toContain('SKUs: SKU-001');
    expect(t.descricao).toContain('_Origem: análise IA do relatório._');
    expect(t.descricao).toContain('- [ ] Ativar o Mercado Envios Full');
    expect(t.descricao).toContain('- [ ] Renegociar tabela');
  });

  it('sem impacto/skus/passos → descricao sem essas linhas', () => {
    const t = achadoToTaskInput(
      { ...ACHADO, impactoEstimadoMensalBRL: null, skus: [], comoFazer: [] },
      'r1',
    );
    expect(t.descricao).not.toContain('Impacto estimado');
    expect(t.descricao).not.toContain('SKUs:');
    expect(t.descricao).not.toContain('- [ ]');
  });
});

describe('FONTES_ANALISE', () => {
  it("inclui 'achados' (a action valida fonte contra este array)", () => {
    expect(FONTES_ANALISE).toContain('achados');
  });
});
```

- [ ] **Step 3:** `npx vitest run tests/unit/finalize-email-dados.test.ts tests/unit/report-to-task-achados.test.ts` → **FALHA**.

- [ ] **Step 4:** Implementar:

**`templates.ts`** — trocar `reportReadyTemplate` por (copy v2 completa vem na Task 11; aqui só a assinatura + dados básicos):

```ts
export type ReportReadyEmailData = {
  reportId: string;
  periodoInicio: Date;
  periodoFim: Date;
  totalPeriodo: number;
  deltaPct: number | null;
  score: number | null;
  primeiroGargalo: string | null;
};

/** Template: relatório pronto (copy v2 na fase seguinte — aqui a estrutura de dados). */
export function reportReadyTemplate(dados: ReportReadyEmailData, appUrl: string): EmailContent {
  const url = `${appUrl}/dashboard/relatorios/${dados.reportId}`;
  const subject = 'Seu relatório está pronto — Truth Analytics';
  const text = [
    'Seu relatório de análise foi gerado com sucesso.',
    '',
    `Acesse em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Seu relatório de análise foi gerado com sucesso.</p>
<p><a href="${escapeHtml(url)}">Clique aqui para visualizar o relatório</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;
  return { subject, html, text };
}
```

**`email.ts`:**

```ts
import type { ReportReadyEmailData } from './templates';

export async function sendReportReadyEmail(to: string, dados: ReportReadyEmailData): Promise<void> {
  const content = reportReadyTemplate(dados, serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}
```

**`finalize.ts`** — `FinalizeInput` ganha `periodo: Periodo;` (import de `@/modules/providers/types`); nova função pura + uso:

```ts
import { totalVendas, deltaNumero } from '@/modules/reports/compare';
import { primeiroGargalo } from '@/modules/reports/report-view-model';
import type { ReportReadyEmailData } from '@/modules/notifications/templates';

/** Pura — monta os dados ricos do e-mail "relatório pronto" a partir do resultado do pipeline. */
export function dadosEmailRelatorio(input: {
  reportId: string;
  periodo: Periodo;
  metricas: Metricas;
  analise: AnaliseIa;
}): ReportReadyEmailData {
  const ts = input.metricas.truth_score;
  const totalPeriodo = ts?.totalPeriodo ?? totalVendas(input.metricas);
  const deltaPct =
    ts && ts.totalPeriodoAnterior !== null && ts.totalPeriodoAnterior !== 0
      ? deltaNumero(ts.totalPeriodo, ts.totalPeriodoAnterior).deltaPct
      : null;
  return {
    reportId: input.reportId,
    periodoInicio: input.periodo.inicio,
    periodoFim: input.periodo.fim,
    totalPeriodo,
    deltaPct,
    score: ts?.score ?? null,
    primeiroGargalo: primeiroGargalo(input.analise),
  };
}
```

e no corpo do `finalize`, trocar `await sendReportReadyEmail(clientEmail, reportId);` por:

```ts
      await sendReportReadyEmail(
        clientEmail,
        dadosEmailRelatorio({ reportId, periodo: input.periodo, metricas, analise }),
      );
```

**`orchestrator.ts`:** na chamada do finalize, adicionar `periodo`: `await finalize({ reportId, orgId, metricas, analise, plano, clientEmail, periodo });`.

**`report-to-task.ts`:**

```ts
export const FONTES_ANALISE = ['gargalos', 'sugestoesMelhoria', 'ideiasVenda', 'achados'] as const;

export const PRIORIDADE_POR_FONTE: Record<FonteAnalise, TaskPrioridade> = {
  gargalos: 'alta',
  sugestoesMelhoria: 'media',
  ideiasVenda: 'baixa',
  achados: 'media', // fallback formal — a prioridade REAL vem do próprio achado
};
```

e no fim do arquivo:

```ts
import { formatBRL } from '@/lib/format';
import { CHECKLIST_UNCHECKED } from './checklist-line';
import type { Achado } from '@/modules/pipeline/contracts';

/** Conversão achado estruturado → task: título direto, tipo/prioridade da IA, passos como checklist. */
export function achadoToTaskInput(
  achado: Achado,
  reportId: string,
): { titulo: string; descricao: string; tipo: TaskTipo; prioridade: TaskPrioridade; criadoPor: 'ia'; reportId: string } {
  const linhas: string[] = [achado.descricao.trim()];
  if (achado.impactoEstimadoMensalBRL !== null) {
    linhas.push(`Impacto estimado: ${formatBRL(achado.impactoEstimadoMensalBRL)}/mês`);
  }
  if (achado.skus.length > 0) linhas.push(`SKUs: ${achado.skus.join(', ')}`);
  linhas.push('', '_Origem: análise IA do relatório._');
  if (achado.comoFazer.length > 0) {
    linhas.push(...achado.comoFazer.map((p) => `${CHECKLIST_UNCHECKED}${p}`));
  }
  return {
    titulo: tituloFromItem(achado.titulo),
    descricao: linhas.join('\n'),
    tipo: achado.tipo,
    prioridade: achado.prioridade,
    criadoPor: 'ia',
    reportId,
  };
}
```

*(nota: `Achado['tipo']` e `TaskTipo` têm os mesmos literais — o typecheck prova; se divergirem, PARE e ajuste `ACHADO_TIPOS`.)*

**`report-to-task.repository.ts`** — dentro do loop `for (const { fonte, indice } of input.itens)`, ANTES do bloco atual:

```ts
    if (fonte === 'achados') {
      const achado = parsed.data.achados?.[indice];
      if (!achado) continue;
      const titulo = tituloFromItem(achado.titulo);
      if (existentes.has(titulo)) continue;
      const t = achadoToTaskInput(achado, input.reportId);
      await createTask({ orgId: input.orgId, ...t, actorUserId: input.actorUserId });
      existentes.add(titulo);
      criadas += 1;
      continue;
    }
    const texto = parsed.data[fonte]?.[indice];
```

(o acesso `parsed.data[fonte]` para as 3 fontes legadas fica como está — com o union estreitado pelo `continue`, tipar `fonte` como `Exclude<FonteAnalise, 'achados'>` se o TS reclamar; import `achadoToTaskInput`.)

- [ ] **Step 5:** Atualizar `tests/unit/notification-templates.test.ts` — SOMENTE o describe `reportReadyTemplate`: trocar as chamadas `reportReadyTemplate('rep-123', 'http://x')` por:

```ts
const DADOS = {
  reportId: 'rep-123',
  periodoInicio: new Date('2026-06-01T00:00:00Z'),
  periodoFim: new Date('2026-06-30T00:00:00Z'),
  totalPeriodo: 10880,
  deltaPct: 12.2,
  score: 76,
  primeiroGargalo: 'Frete caro',
};
// ... reportReadyTemplate(DADOS, 'http://x')
```

Manter as asserções de subject/html/text não-vazios e do link `http://x/dashboard/relatorios/rep-123`; REMOVER a asserção "text contém o reportId" solto se ela depender do formato antigo (o link já contém o id). Anotar a mudança no commit.

- [ ] **Step 6:** `npx vitest run tests/unit/finalize-email-dados.test.ts tests/unit/report-to-task-achados.test.ts tests/unit/notification-templates.test.ts tests/unit/report-to-task.test.ts tests/integration/report-to-task-action.test.ts` → **PASSA** (as suítes antigas de report-to-task são aditivas — nada nelas muda).

- [ ] **Step 7:** `npm run typecheck` + `npx vitest run` verdes. **Commit:** `feat(g1): pipeline liga tudo — email rico no finalize e conversao achado->task estruturada`.

---

### Task 6: Charts novos themados + formatters compactos

**Files:** Modify `src/lib/format.ts`; Create `src/components/ui/charts/chart-models.ts`, `src/components/ui/charts/StackedAreaChart.tsx`, `src/components/ui/charts/ParetoChart.tsx`, `src/components/ui/charts/DivergingBarChart.tsx`, `src/components/ui/charts/WeekdayBarChart.tsx`, `src/components/ui/charts/EvolucaoComparadaChart.tsx`, `tests/unit/format-compacto.test.ts`, `tests/unit/chart-models.test.ts`.

**Interfaces (Consumes):** `chartTheme`/`seriesColor` (`chart-theme.ts`), `GlassTooltip` (props `{ active?, label?, payload?, formatValue? }`), `BarChart` existente (`{ data: { label; value }[]; height?; formatValue? }` — está sem consumidor; o WeekdayBarChart o adota), padrão sr-only do `DonutChart` (linhas 51–53), `formatData` pós-G0 (não usar em séries — séries usam strings ISO + slicing).

**Interfaces (Produces):**

`src/lib/format.ts`:

```ts
export function formatBRLCompacto(n: number): string; // 950→"R$ 950" · 2000→"R$ 2k" · 2500→"R$ 2,5k" · 1200000→"R$ 1,2M"
export function formatDataCurta(isoDia: string): string; // '2026-06-01' → '01/06' (slicing puro — seguro em client)
export function formatDiaMes(d: Date): string; // Date → 'dd/mm' em America/Sao_Paulo (SERVER-side)
```

`chart-models.ts` (100% puro, sem imports de React/Recharts):

```ts
export function mediaMovel(valores: number[], janela?: number): number[]; // janela default 7, parcial no início
export type EvolucaoComparadaRow = { x: string; atual: number; media: number; anterior: number | null };
export function evolucaoComparadaModel(
  atual: { data: string; total: number }[],
  anterior: { data: string; total: number }[] | null,
): EvolucaoComparadaRow[]; // alinha o anterior por ÍNDICE (dia 1 com dia 1)
export type StackedAreaModel = { keys: string[]; rows: Array<Record<string, number | string>> };
export function stackedAreaModel(canalPorDia: { data: string; canais: Record<string, number> }[]): StackedAreaModel;
export type ParetoRow = { label: string; receita: number; acumulado: number };
export function paretoModel(
  abc: { a: ParetoInputItem[]; b: ParetoInputItem[]; c: ParetoInputItem[] },
  max?: number, // default 15
): ParetoRow[];
export type ParetoInputItem = { sku: string; nome: string; receita: number; pctAcumulado: number };
export type DivergingRow = { label: string; deltaPct: number };
export function divergingPrecoModel(
  posicao: { sku: string; nome: string; nossoPreco: number; precoMercadoMediano: number }[],
): DivergingRow[]; // só itens com nosso>0 e mercado>0; deltaPct 1 casa; sort desc
```

Componentes (todos `'use client'`, prop `srSummary: string` obrigatória renderizada como `<p className="sr-only">`):

```ts
export function StackedAreaChart(props: { keys: string[]; rows: Array<Record<string, number | string>>; height?: number; formatY?: (v: number) => string; srSummary: string }): JSX.Element;
export function ParetoChart(props: { data: ParetoRow[]; height?: number; formatReceita?: (v: number) => string; srSummary: string }): JSX.Element;
export function DivergingBarChart(props: { data: DivergingRow[]; height?: number; srSummary: string }): JSX.Element;
export function WeekdayBarChart(props: { data: { label: string; value: number }[]; height?: number; formatValue?: (v: number) => string; srSummary: string }): JSX.Element;
export function EvolucaoComparadaChart(props: { data: EvolucaoComparadaRow[]; height?: number; formatY?: (v: number) => string; temAnterior: boolean; srSummary: string }): JSX.Element;
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/format-compacto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { formatBRLCompacto, formatDataCurta } from '@/lib/format';

describe('formatBRLCompacto', () => {
  it.each([
    [0, 'R$ 0'],
    [950, 'R$ 950'],
    [2000, 'R$ 2k'],
    [2500, 'R$ 2,5k'],
    [45000, 'R$ 45k'],
    [1_200_000, 'R$ 1,2M'],
    [-2500, '-R$ 2,5k'],
  ])('%d → %s', (n, esperado) => {
    expect(formatBRLCompacto(n)).toBe(esperado);
  });
});

describe('formatDataCurta', () => {
  it("'2026-06-01' → '01/06' (slicing puro, imune a timezone)", () => {
    expect(formatDataCurta('2026-06-01')).toBe('01/06');
    expect(formatDataCurta('2026-12-25')).toBe('25/12');
  });
});
```

E `tests/unit/chart-models.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  divergingPrecoModel,
  evolucaoComparadaModel,
  mediaMovel,
  paretoModel,
  stackedAreaModel,
} from '@/components/ui/charts/chart-models';

describe('mediaMovel', () => {
  it('janela 7 com preenchimento parcial no início', () => {
    expect(mediaMovel([10, 20, 30], 7)).toEqual([10, 15, 20]);
  });
  it('janela cheia desliza', () => {
    expect(mediaMovel([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
  });
});

describe('evolucaoComparadaModel', () => {
  it('formata x como dd/MM e alinha o anterior por índice', () => {
    const r = evolucaoComparadaModel(
      [
        { data: '2026-06-01', total: 100 },
        { data: '2026-06-02', total: 200 },
      ],
      [{ data: '2026-05-01', total: 80 }],
    );
    expect(r).toEqual([
      { x: '01/06', atual: 100, media: 100, anterior: 80 },
      { x: '02/06', atual: 200, media: 150, anterior: null },
    ]);
  });
  it('sem anterior → anterior null em todas as linhas', () => {
    expect(evolucaoComparadaModel([{ data: '2026-06-01', total: 100 }], null)[0].anterior).toBeNull();
  });
});

describe('stackedAreaModel', () => {
  it('keys por receita total desc, linhas com 0 para canal ausente no dia', () => {
    const r = stackedAreaModel([
      { data: '2026-06-01', canais: { shopee: 100 } },
      { data: '2026-06-02', canais: { mercadolivre: 500, shopee: 50 } },
    ]);
    expect(r.keys).toEqual(['mercadolivre', 'shopee']);
    expect(r.rows).toEqual([
      { x: '01/06', mercadolivre: 0, shopee: 100 },
      { x: '02/06', mercadolivre: 500, shopee: 50 },
    ]);
  });
});

describe('paretoModel', () => {
  it('concatena A+B+C com label = sku (fallback nome) e respeita o cap', () => {
    const item = (sku: string, receita: number, pct: number) => ({ sku, nome: `N${sku}`, receita, pctAcumulado: pct });
    const r = paretoModel({ a: [item('A1', 800, 80)], b: [item('B1', 150, 95)], c: [item('', 50, 100)] }, 2);
    expect(r).toEqual([
      { label: 'A1', receita: 800, acumulado: 80 },
      { label: 'B1', receita: 150, acumulado: 95 },
    ]);
  });
});

describe('divergingPrecoModel', () => {
  it('Δ% = (nosso-mercado)/mercado, 1 casa, só comparáveis, desc', () => {
    const r = divergingPrecoModel([
      { sku: 'A', nome: 'A', nossoPreco: 110, precoMercadoMediano: 100 },
      { sku: 'B', nome: 'B', nossoPreco: 90, precoMercadoMediano: 100 },
      { sku: 'C', nome: 'C', nossoPreco: 0, precoMercadoMediano: 100 }, // sem venda — fora
      { sku: 'D', nome: 'D', nossoPreco: 50, precoMercadoMediano: 0 }, // sem mercado — fora
    ]);
    expect(r).toEqual([
      { label: 'A', deltaPct: 10 },
      { label: 'B', deltaPct: -10 },
    ]);
  });
});
```

- [ ] **Step 2:** Rodar os dois arquivos → **FALHA**. Implementar em `src/lib/format.ts` (mantendo os formatters existentes):

```ts
function compacto(v: number): string {
  const s = (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
  return s.endsWith(',0') ? s.slice(0, -2) : s;
}

/** Moeda compacta pt-BR para eixos de gráfico: "R$ 2k", "R$ 2,5k", "R$ 1,2M". */
export function formatBRLCompacto(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}R$ ${compacto(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}R$ ${compacto(abs / 1_000)}k`;
  return `${sign}R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(abs)}`;
}

/** 'yyyy-mm-dd' → 'dd/MM' por slicing puro — determinístico em server e client. */
export function formatDataCurta(isoDia: string): string {
  return `${isoDia.slice(8, 10)}/${isoDia.slice(5, 7)}`;
}

/** Date → 'dd/mm' em horário de Brasília (usar no SERVIDOR: e-mails, subject). */
export function formatDiaMes(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }).format(d);
}
```

E `src/components/ui/charts/chart-models.ts`:

```ts
/** Modelos puros dos charts v2 — sem React/Recharts (testáveis em node). */
import { formatDataCurta } from '@/lib/format';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const MEDIA_MOVEL_JANELA = 7;

export function mediaMovel(valores: number[], janela = MEDIA_MOVEL_JANELA): number[] {
  return valores.map((_, i) => {
    const ini = Math.max(0, i - janela + 1);
    const fatia = valores.slice(ini, i + 1);
    return round2(fatia.reduce((a, v) => a + v, 0) / fatia.length);
  });
}

export type EvolucaoComparadaRow = { x: string; atual: number; media: number; anterior: number | null };

export function evolucaoComparadaModel(
  atual: { data: string; total: number }[],
  anterior: { data: string; total: number }[] | null,
): EvolucaoComparadaRow[] {
  const medias = mediaMovel(atual.map((e) => e.total));
  return atual.map((e, i) => ({
    x: formatDataCurta(e.data),
    atual: e.total,
    media: medias[i],
    anterior: anterior?.[i]?.total ?? null,
  }));
}

export type StackedAreaModel = { keys: string[]; rows: Array<Record<string, number | string>> };

export function stackedAreaModel(
  canalPorDia: { data: string; canais: Record<string, number> }[],
): StackedAreaModel {
  const totais = new Map<string, number>();
  for (const dia of canalPorDia) {
    for (const [canal, total] of Object.entries(dia.canais)) totais.set(canal, (totais.get(canal) ?? 0) + total);
  }
  const keys = Array.from(totais.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([c]) => c);
  const rows = canalPorDia.map((dia) => {
    const row: Record<string, number | string> = { x: formatDataCurta(dia.data) };
    for (const k of keys) row[k] = dia.canais[k] ?? 0;
    return row;
  });
  return { keys, rows };
}

export type ParetoInputItem = { sku: string; nome: string; receita: number; pctAcumulado: number };
export type ParetoRow = { label: string; receita: number; acumulado: number };

export function paretoModel(
  abc: { a: ParetoInputItem[]; b: ParetoInputItem[]; c: ParetoInputItem[] },
  max = 15,
): ParetoRow[] {
  return [...abc.a, ...abc.b, ...abc.c]
    .slice(0, max)
    .map((p) => ({ label: p.sku || p.nome, receita: p.receita, acumulado: p.pctAcumulado }));
}

export type DivergingRow = { label: string; deltaPct: number };

export function divergingPrecoModel(
  posicao: { sku: string; nome: string; nossoPreco: number; precoMercadoMediano: number }[],
): DivergingRow[] {
  return posicao
    .filter((p) => p.nossoPreco > 0 && p.precoMercadoMediano > 0)
    .map((p) => ({
      label: p.sku || p.nome,
      deltaPct: Math.round(((p.nossoPreco - p.precoMercadoMediano) / p.precoMercadoMediano) * 1000) / 10,
    }))
    .sort((a, b) => b.deltaPct - a.deltaPct || a.label.localeCompare(b.label, 'pt-BR'));
}
```

- [ ] **Step 3:** `npx vitest run tests/unit/format-compacto.test.ts tests/unit/chart-models.test.ts tests/unit/format.test.ts` → **PASSA**.

- [ ] **Step 4:** Criar os 5 componentes (thin — sem lógica além de render). `StackedAreaChart.tsx`:

```tsx
'use client';

import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { chartTheme, seriesColor } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';

interface StackedAreaChartProps {
  keys: string[];
  rows: Array<Record<string, number | string>>;
  height?: number;
  formatY?: (v: number) => string;
  srSummary: string;
}

/** Área empilhada canal×dia com legenda e resumo acessível. */
export function StackedAreaChart({ keys, rows, height = 280, formatY, srSummary }: StackedAreaChartProps) {
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
            <XAxis dataKey="x" stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} />
            <YAxis width={56} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => (formatY ? formatY(v) : String(v))} />
            <Tooltip cursor={{ stroke: chartTheme.brand, strokeOpacity: 0.3 }} content={<GlassTooltip formatValue={formatY} />} />
            {keys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stackId="canais" stroke={seriesColor(i)} fill={seriesColor(i)} fillOpacity={0.25} strokeWidth={1.5} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {keys.map((k, i) => (
          <li key={k} className="flex items-center gap-1.5 text-xs text-muted">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: seriesColor(i) }} />
            {k}
          </li>
        ))}
      </ul>
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
```

`ParetoChart.tsx`:

```tsx
'use client';

import React from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';
import type { ParetoRow } from './chart-models';

interface ParetoChartProps {
  data: ParetoRow[];
  height?: number;
  formatReceita?: (v: number) => string;
  srSummary: string;
}

/** Pareto ABC: barras de receita + linha do % acumulado (eixo direito 0–100). */
export function ParetoChart({ data, height = 280, formatReceita, srSummary }: ParetoChartProps) {
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
            <XAxis dataKey="label" stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 10, fontFamily: 'var(--font-mono)' }} tickLine={false} interval={0} angle={-30} textAnchor="end" height={54} />
            <YAxis yAxisId="receita" width={56} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => (formatReceita ? formatReceita(v) : String(v))} />
            <YAxis yAxisId="pct" orientation="right" width={40} domain={[0, 100]} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<GlassTooltip />} />
            <Bar yAxisId="receita" dataKey="receita" name="Receita" fill={chartTheme.brand} radius={[6, 6, 0, 0]} maxBarSize={32} />
            <Line yAxisId="pct" dataKey="acumulado" name="% acumulado" type="monotone" stroke="#fbbf24" strokeWidth={2} dot={{ r: 2.5, fill: '#fbbf24' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
```

`DivergingBarChart.tsx`:

```tsx
'use client';

import React from 'react';
import { Bar, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart as RBarChart } from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';
import type { DivergingRow } from './chart-models';

interface DivergingBarChartProps {
  data: DivergingRow[];
  height?: number;
  srSummary: string;
}

/** Δ% do nosso preço vs mediana de mercado: verde abaixo (competitivo), vermelho acima. */
export function DivergingBarChart({ data, height = 240, srSummary }: DivergingBarChartProps) {
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <RBarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
            <XAxis type="number" stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
            <YAxis type="category" dataKey="label" width={110} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<GlassTooltip formatValue={(v) => `${v}%`} />} />
            <ReferenceLine x={0} stroke={chartTheme.axis} />
            <Bar dataKey="deltaPct" name="Δ vs mercado" radius={[0, 6, 6, 0]} maxBarSize={18}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.deltaPct > 0 ? '#f87171' : chartTheme.brand} />
              ))}
            </Bar>
          </RBarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
```

`WeekdayBarChart.tsx` (adota o `BarChart` existente):

```tsx
'use client';

import React from 'react';

import { BarChart } from './BarChart';

interface WeekdayBarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
  srSummary: string;
}

/** Média de vendas por dia-da-semana — BarChart da casa + resumo acessível. */
export function WeekdayBarChart({ data, height = 240, formatValue, srSummary }: WeekdayBarChartProps) {
  return (
    <div>
      <BarChart data={data} height={height} formatValue={formatValue} />
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
```

`EvolucaoComparadaChart.tsx`:

```tsx
'use client';

import React, { useId } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';
import type { EvolucaoComparadaRow } from './chart-models';

interface EvolucaoComparadaChartProps {
  data: EvolucaoComparadaRow[];
  height?: number;
  formatY?: (v: number) => string;
  temAnterior: boolean;
  srSummary: string;
}

/** Evolução do período: área (atual) + média móvel 7d (tracejada) + sombra do período anterior. */
export function EvolucaoComparadaChart({ data, height = 280, formatY, temAnterior, srSummary }: EvolucaoComparadaChartProps) {
  const gradId = useId().replace(/:/g, '');
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartTheme.areaFrom} />
                <stop offset="100%" stopColor={chartTheme.areaTo} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
            <XAxis dataKey="x" stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} />
            <YAxis width={56} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => (formatY ? formatY(v) : String(v))} />
            <Tooltip cursor={{ stroke: chartTheme.brand, strokeOpacity: 0.3 }} content={<GlassTooltip formatValue={formatY} />} />
            {temAnterior ? (
              <Line dataKey="anterior" name="Período anterior" type="monotone" stroke="#94a3b8" strokeWidth={1.5} strokeOpacity={0.6} dot={false} connectNulls />
            ) : null}
            <Area dataKey="atual" name="Vendas" type="monotone" stroke={chartTheme.brand} strokeWidth={2} fill={`url(#${gradId})`} dot={false} activeDot={{ r: 4, fill: chartTheme.brand, stroke: '#04150a' }} />
            <Line dataKey="media" name="Média móvel 7d" type="monotone" stroke="#38bdf8" strokeWidth={1.5} strokeDasharray="5 4" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: chartTheme.brand }} />Vendas</li>
        <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: '#38bdf8' }} />Média móvel 7d</li>
        {temAnterior ? (
          <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: '#94a3b8' }} />Período anterior</li>
        ) : null}
      </ul>
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
```

- [ ] **Step 5:** `npm run typecheck` + `npx vitest run` verdes (componentes não têm teste próprio — modelos e formatters cobrem a lógica; padrão do repo). **Commit:** `feat(g1): charts v2 themados (stacked, pareto, diverging, weekday, evolucao comparada) + formatters compactos`.

---
### Task 7: Página do relatório v2 — hero com KPIs + destaques + TOC honesto

**Files:** Modify `src/modules/reports/report.repository.ts`, `src/modules/reports/report-view-model.ts`, `src/app/(client)/dashboard/relatorios/[id]/page.tsx`; Create `src/app/(client)/dashboard/relatorios/[id]/hero-kpis.tsx`, `tests/unit/hero-kpis.test.ts`, `tests/integration/report-done-anterior.test.ts`.

**Interfaces (Consumes):** `rowToDetail`/`summaryColumns` (report.repository.ts), `compararMetricas`/`deltaNumero`/`totalVendas`/`totalPedidos` (compare.ts), `Stat` (`src/components/ui/Stat.tsx` — `{ label, value, hint?, className?, 'data-testid'? }`), `formatBRL` (`@/lib/format`), estrutura atual da página (hero nas linhas 38–86; TOC nas 89–104). **Testids preservados:** `report-status`, `comparar-link`, `export-pdf`, `metricas`, `resumo-executivo`.

**Interfaces (Produces):**

```ts
// report.repository.ts
export async function getDoneAnterior(orgId: string, beforeCreatedAt: Date, excludeId: string): Promise<ReportDetail | null>;
// done mais recente com created_at < beforeCreatedAt (id ≠ excludeId), escopado por org

// report-view-model.ts
export type HeroKpis = {
  total: { valor: number; deltaPct: number | null };
  pedidos: { valor: number; deltaPct: number | null };
  ticket: { valor: number; deltaPct: number | null };
  score: { valor: number; deltaAbs: number | null } | null;
};
export function heroKpis(atual: Metricas, anterior: Metricas | null): HeroKpis;

// hero-kpis.tsx (server component)
export function HeroKpisFaixa(props: { kpis: HeroKpis; destaques?: Destaque[] }): JSX.Element;
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/hero-kpis.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Metricas } from '@/modules/pipeline/contracts';
import { heroKpis } from '@/modules/reports/report-view-model';

function metricas(over: Partial<Metricas>): Metricas {
  return {
    vendasPorCanal: [{ canal: 'shopee', total: 1000, pedidos: 10 }],
    evolucao: [{ data: '2026-06-01', total: 1000 }],
    ticketMedio: 100,
    topProdutos: [],
    posicaoPreco: [],
    benchmarkParcial: false,
    ...over,
  };
}

const SCORE = {
  score: 76,
  totalPeriodo: 1000,
  totalPeriodoAnterior: 800,
  fatores: {
    crescimento: { pontos: 25, max: 25, variacaoPercentual: 25 },
    posicaoPreco: { pontos: 15, max: 25, itensAvaliados: 0 },
    diversificacao: { pontos: 8, max: 20, canaisComVenda: 1 },
    regularidade: { pontos: 20, max: 20, diasComVenda: 30, diasPeriodo: 30 },
    cobertura: { pontos: 8, max: 10, produtosComBenchmark: 0, produtosAvaliados: 0 },
  },
};

describe('heroKpis', () => {
  it('com relatório anterior → deltas de total, pedidos, ticket e score', () => {
    const anterior = metricas({
      vendasPorCanal: [{ canal: 'shopee', total: 800, pedidos: 8 }],
      evolucao: [{ data: '2026-05-01', total: 800 }],
      ticketMedio: 100,
      truth_score: { ...SCORE, score: 64, totalPeriodo: 800, totalPeriodoAnterior: null },
    });
    const r = heroKpis(metricas({ truth_score: SCORE }), anterior);
    expect(r.total).toEqual({ valor: 1000, deltaPct: 25 });
    expect(r.pedidos).toEqual({ valor: 10, deltaPct: 25 });
    expect(r.ticket).toEqual({ valor: 100, deltaPct: 0 });
    expect(r.score).toEqual({ valor: 76, deltaAbs: 12 });
  });

  it('sem relatório anterior → fallback do delta de total via truth_score', () => {
    const r = heroKpis(metricas({ truth_score: SCORE }), null);
    expect(r.total).toEqual({ valor: 1000, deltaPct: 25 });
    expect(r.pedidos.deltaPct).toBeNull();
    expect(r.ticket.deltaPct).toBeNull();
    expect(r.score).toEqual({ valor: 76, deltaAbs: null });
  });

  it('relatório antigo sem truth_score → total via evolucao, score null', () => {
    const r = heroKpis(metricas({}), null);
    expect(r.total).toEqual({ valor: 1000, deltaPct: null });
    expect(r.score).toBeNull();
  });
});
```

- [ ] **Step 2:** `npx vitest run tests/unit/hero-kpis.test.ts` → **FALHA**. Implementar em `report-view-model.ts`:

```ts
import { deltaNumero, totalPedidos, totalVendas } from '@/modules/reports/compare';
import type { Destaque, Metricas } from '@/modules/pipeline/contracts';

export type HeroKpis = {
  total: { valor: number; deltaPct: number | null };
  pedidos: { valor: number; deltaPct: number | null };
  ticket: { valor: number; deltaPct: number | null };
  score: { valor: number; deltaAbs: number | null } | null;
};

/**
 * KPIs do hero do relatório. Delta preferencial = comparação com o done
 * ANTERIOR; fallback do total = truth_score.totalPeriodoAnterior (mesma
 * duração, computado no pipeline) quando não há relatório anterior.
 */
export function heroKpis(atual: Metricas, anterior: Metricas | null): HeroKpis {
  const ts = atual.truth_score;
  const totalAtual = ts?.totalPeriodo ?? totalVendas(atual);
  let totalDelta: number | null = null;
  if (anterior) {
    totalDelta = deltaNumero(totalAtual, anterior.truth_score?.totalPeriodo ?? totalVendas(anterior)).deltaPct;
  } else if (ts && ts.totalPeriodoAnterior !== null && ts.totalPeriodoAnterior !== 0) {
    totalDelta = deltaNumero(ts.totalPeriodo, ts.totalPeriodoAnterior).deltaPct;
  }
  return {
    total: { valor: totalAtual, deltaPct: totalDelta },
    pedidos: {
      valor: totalPedidos(atual),
      deltaPct: anterior ? deltaNumero(totalPedidos(atual), totalPedidos(anterior)).deltaPct : null,
    },
    ticket: {
      valor: atual.ticketMedio,
      deltaPct: anterior ? deltaNumero(atual.ticketMedio, anterior.ticketMedio).deltaPct : null,
    },
    score: ts
      ? { valor: ts.score, deltaAbs: anterior?.truth_score ? ts.score - anterior.truth_score.score : null }
      : null,
  };
}
```

*(atenção a import circular: `compare.ts` NÃO importa `report-view-model.ts` — sentido único ok.)* Rodar → **PASSA**.

- [ ] **Step 3 (integração — falha primeiro):** Criar `tests/integration/report-done-anterior.test.ts` (boilerplate padrão): semear org + 3 reports `done` com `created_at` implícito crescente (inserir em sequência) e métricas jsonb mínimas válidas (usar o shape de `SAMPLE_METRICAS` do e2e: `vendasPorCanal/evolucao/ticketMedio/topProdutos/posicaoPreco/benchmarkParcial`) + 1 report `failed`. Assertar:

```ts
const { getDoneAnterior } = await import('@/modules/reports/report.repository');
const anterior = await getDoneAnterior(orgId, terceiroCreatedAt, terceiroId);
expect(anterior?.id).toBe(segundoId); // pula o failed, respeita created_at <
const nenhum = await getDoneAnterior(orgId, primeiroCreatedAt, primeiroId);
expect(nenhum).toBeNull();
// isolamento multi-tenant: outra org não enxerga
const outraOrg = await getDoneAnterior(outraOrgId, terceiroCreatedAt, terceiroId);
expect(outraOrg).toBeNull();
```

(obter `created_at` reais via select após o insert — não confiar em relógio). Rodar → **FALHA**. Implementar em `report.repository.ts` (import `lt` de drizzle-orm):

```ts
/**
 * Done imediatamente ANTERIOR a um relatório (por created_at), escopado por
 * org. Base do hero de KPIs e do default do comparativo.
 */
export async function getDoneAnterior(
  orgId: string,
  beforeCreatedAt: Date,
  excludeId: string,
): Promise<ReportDetail | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.org_id, orgId),
        eq(reports.status, 'done'),
        lt(reports.created_at, beforeCreatedAt),
        ne(reports.id, excludeId),
      ),
    )
    .orderBy(desc(reports.created_at))
    .limit(1);
  return row ? rowToDetail(row) : null;
}
```

Rodar → **PASSA**.

- [ ] **Step 4:** Criar `src/app/(client)/dashboard/relatorios/[id]/hero-kpis.tsx` (server component):

```tsx
import React from 'react';

import { formatBRL } from '@/lib/format';
import type { Destaque } from '@/modules/pipeline/contracts';
import type { HeroKpis } from '@/modules/reports/report-view-model';
import { Stat } from '@/components/ui/Stat';

function DeltaTag({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return null;
  const positivo = deltaPct >= 0;
  return (
    <span className={`font-mono text-xs ${positivo ? 'text-brand' : 'text-red-400'}`}>
      {positivo ? '▲' : '▼'} {positivo ? '+' : ''}
      {deltaPct.toLocaleString('pt-BR')}% vs anterior
    </span>
  );
}

const DIRECAO_ICONE: Record<Destaque['direcao'], string> = { up: '▲', down: '▼', flat: '→' };
const DIRECAO_COR: Record<Destaque['direcao'], string> = {
  up: 'text-brand',
  down: 'text-red-400',
  flat: 'text-muted',
};

/** Faixa de 4 KPIs do hero + destaques da IA (quando presentes). */
export function HeroKpisFaixa({ kpis, destaques }: { kpis: HeroKpis; destaques?: Destaque[] }) {
  return (
    <div data-testid="hero-kpis" className="relative mt-6 grid grid-cols-2 gap-6 border-t border-line pt-6 md:grid-cols-4">
      <Stat label="Total do período" value={formatBRL(kpis.total.valor)} data-testid="hero-total" />
      <Stat label="Pedidos" value={kpis.pedidos.valor} />
      <Stat label="Ticket médio" value={formatBRL(kpis.ticket.valor)} />
      {kpis.score ? (
        <Stat
          label="Truth Score"
          value={`${kpis.score.valor}/100`}
          hint={
            kpis.score.deltaAbs === null
              ? undefined
              : `${kpis.score.deltaAbs >= 0 ? '+' : ''}${kpis.score.deltaAbs} pts vs anterior`
          }
        />
      ) : (
        <Stat label="Truth Score" value="—" hint="disponível a partir deste ciclo" />
      )}
      <div className="col-span-2 -mt-4 flex gap-6 md:col-span-4">
        <DeltaTag deltaPct={kpis.total.deltaPct} />
        <DeltaTag deltaPct={kpis.ticket.deltaPct} />
      </div>
      {destaques && destaques.length > 0 ? (
        <ul className="col-span-2 flex flex-wrap gap-2 md:col-span-4">
          {destaques.map((d) => (
            <li key={d.label} className="flex items-center gap-1.5 rounded-full border border-line bg-bg-elevated px-3 py-1 text-xs">
              <span aria-hidden="true" className={DIRECAO_COR[d.direcao]}>{DIRECAO_ICONE[d.direcao]}</span>
              <span className="text-muted">{d.label}:</span>
              <span className="font-mono text-white">{d.valor}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5:** Integrar na página `[id]/page.tsx`:

1. Imports: `getDoneAnterior`, `heroKpis`, `HeroKpisFaixa`.
2. Após `const rel = ...` (e o `notFound()`), carregar o anterior só quando fizer sentido: `const anterior = rel.status === 'done' && rel.metricas ? await getDoneAnterior(access.orgId, rel.createdAt, rel.id) : null;`
3. Dentro do `<header>` (hero), após o bloco `div.relative.flex` existente, renderizar (só quando done+metricas): `{rel.status === 'done' && rel.metricas ? (<HeroKpisFaixa kpis={heroKpis(rel.metricas, anterior?.metricas ?? null)} destaques={rel.analiseIa?.destaques} />) : null}`.
4. **TOC honesto** — substituir o array de `items` do `<Toc>` por condições IDÊNTICAS às das seções:

```tsx
<Toc
  items={[
    { href: '#metricas', label: 'Métricas' },
    ...(rel.metricas.truth_score ? [{ href: '#score-breakdown', label: 'Truth Score' }] : []),
    ...(rel.analiseIa ? [{ href: '#resumo', label: 'Resumo executivo' }] : []),
    ...(rel.analiseIa &&
    ((rel.analiseIa.achados?.length ?? 0) > 0 ||
      rel.analiseIa.gargalos.length > 0 ||
      rel.analiseIa.sugestoesMelhoria.length > 0 ||
      rel.analiseIa.ideiasVenda.length > 0)
      ? [{ href: '#recomendacoes', label: 'Recomendações' }]
      : []),
    ...(rel.analiseIa && rel.analiseIa.recomendacoesPreco.length > 0
      ? [{ href: '#precos', label: 'Preços sugeridos' }]
      : []),
  ]}
/>
```

NÃO tocar em nada mais da página nesta task (as seções são da Task 8/9). Manter `data-testid="metricas"`, `report-status`, `comparar-link`, `export-pdf` exatamente onde estão.

- [ ] **Step 6:** `npm run typecheck` + `npx vitest run` verdes. Smoke manual opcional: `npm run dev` + abrir um relatório done. **Commit:** `feat(g1): relatorio v2 — hero com kpis e deltas, destaques da ia e toc honesto`.

---

### Task 8: Página do relatório v2 — seções de gráficos, tabelas com Δ e posição de preço v2

**Files:** Modify `src/modules/reports/report-view-model.ts`, `src/app/(client)/dashboard/relatorios/[id]/page.tsx`; Create `src/app/(client)/dashboard/relatorios/[id]/graficos-cliente.tsx`, `src/app/(client)/dashboard/relatorios/[id]/metricas-section.tsx`, `tests/unit/posicao-preco-view.test.ts`; Delete `src/app/(client)/dashboard/relatorios/[id]/evolucao-chart.tsx` (substituído — confirmar com grep que só a página o importa).

**Interfaces (Consumes):** métricas v2 (Tasks 1–2), charts + modelos (Task 6), `compararMetricas` (compare.ts — `porCanal` dá o Δ por canal), `formatBRL`/`formatBRLCompacto`/`formatDataCurta` (`@/lib/format`), `anterior` já carregado na página (Task 7), primitivos `Card`/`Table`/`Stat`/`Badge`/`EmptyState`. **Testid preservado:** `data-testid="metricas"` continua no wrapper `<Reveal id="metricas" ...>` (o E2E `dashboard.spec.ts:79` só checa visibilidade).

**Interfaces (Produces):**

```ts
// report-view-model.ts
export const FONTE_LABEL: Record<string, string> = { ml_publico: 'Mercado Livre', serpapi: 'Google Shopping' };
export function fonteLabel(fonte: string): string; // mapa → cru → '—' para ''
export type PosicaoPrecoView = {
  sku: string;
  nome: string;
  nossoPreco: number;
  precoMercadoMediano: number;
  deltaPct: number | null; // null quando não comparável
  semVendas: boolean; // nossoPreco === 0
  fonte: string; // já em pt-BR
  faixa: { min: number; p25: number; mediana: number; p75: number; pctP25: number; pctMediana: number; pctP75: number; pctNosso: number | null } | null;
};
export function posicaoPrecoView(
  posicao: Metricas['posicaoPreco'],
  faixas: NonNullable<Metricas['faixaMercado']> | undefined,
): PosicaoPrecoView[];
export function deltaReceitaPorSku(
  atual: Metricas['topProdutos'],
  anterior: Metricas['topProdutos'] | undefined,
): Map<string, number | null>; // sku → deltaPct (null p/ produto novo/anterior ausente)

// metricas-section.tsx (server component)
export function MetricasSection(props: { metricas: Metricas; anterior: Metricas | null }): JSX.Element;

// graficos-cliente.tsx ('use client' — wrappers que injetam formatters, padrão evolucao-chart.tsx)
export function EvolucaoV2(props: { atual: { data: string; total: number }[]; anterior: { data: string; total: number }[] | null }): JSX.Element;
export function CanalPorDiaV2(props: { canalPorDia: { data: string; canais: Record<string, number> }[] }): JSX.Element;
export function ParetoV2(props: { curvaAbc: NonNullable<Metricas['curvaAbc']> }): JSX.Element;
export function DiaSemanaV2(props: { porDiaSemana: NonNullable<Metricas['porDiaSemana']> }): JSX.Element;
export function PrecoVsMercadoV2(props: { posicao: Metricas['posicaoPreco'] }): JSX.Element;
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/posicao-preco-view.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { deltaReceitaPorSku, fonteLabel, posicaoPrecoView } from '@/modules/reports/report-view-model';

describe('fonteLabel', () => {
  it('mapeia fontes conhecidas, passa cruas as demais e — para vazio', () => {
    expect(fonteLabel('ml_publico')).toBe('Mercado Livre');
    expect(fonteLabel('serpapi')).toBe('Google Shopping');
    expect(fonteLabel('outra')).toBe('outra');
    expect(fonteLabel('')).toBe('—');
  });
});

describe('posicaoPrecoView', () => {
  const posicao = [
    { sku: 'A', nome: 'Prod A', nossoPreco: 110, precoMercadoMediano: 100, fonte: 'ml_publico' },
    { sku: 'B', nome: 'Prod B', nossoPreco: 0, precoMercadoMediano: 50, fonte: 'serpapi' },
    { sku: 'C', nome: 'Prod C', nossoPreco: 30, precoMercadoMediano: 0, fonte: '' },
  ];
  const faixas = [{ sku: 'A', nome: 'Prod A', min: 80, p25: 90, mediana: 100, p75: 120, fonte: 'ml_publico' }];

  it('deltaPct só quando comparável; semVendas quando nossoPreco=0; fonte pt-BR', () => {
    const r = posicaoPrecoView(posicao, faixas);
    expect(r[0].deltaPct).toBe(10);
    expect(r[0].fonte).toBe('Mercado Livre');
    expect(r[1]).toMatchObject({ semVendas: true, deltaPct: null });
    expect(r[2]).toMatchObject({ semVendas: false, deltaPct: null, fonte: '—' });
  });

  it('faixa com posições % na escala min..max(p75, nosso)', () => {
    const f = posicaoPrecoView(posicao, faixas)[0].faixa;
    // escala 80..120 (nosso=110 < p75=120)
    expect(f).toEqual({ min: 80, p25: 90, mediana: 100, p75: 120, pctP25: 25, pctMediana: 50, pctP75: 100, pctNosso: 75 });
  });

  it('sem faixaMercado (relatório antigo) → faixa null', () => {
    expect(posicaoPrecoView(posicao, undefined)[0].faixa).toBeNull();
  });
});

describe('deltaReceitaPorSku', () => {
  it('deltaPct por sku; null quando não existia antes ou sem anterior', () => {
    const atual = [{ nome: 'A', sku: 'A', quantidade: 1, receita: 120 }, { nome: 'N', sku: 'N', quantidade: 1, receita: 50 }];
    const anterior = [{ nome: 'A', sku: 'A', quantidade: 1, receita: 100 }];
    const m = deltaReceitaPorSku(atual, anterior);
    expect(m.get('A')).toBe(20);
    expect(m.get('N')).toBeNull();
    expect(deltaReceitaPorSku(atual, undefined).get('A')).toBeNull();
  });
});
```

- [ ] **Step 2:** Rodar → **FALHA**. Implementar em `report-view-model.ts`:

```ts
export const FONTE_LABEL: Record<string, string> = { ml_publico: 'Mercado Livre', serpapi: 'Google Shopping' };

export function fonteLabel(fonte: string): string {
  if (fonte === '') return '—';
  return FONTE_LABEL[fonte] ?? fonte;
}

export type PosicaoPrecoView = {
  sku: string;
  nome: string;
  nossoPreco: number;
  precoMercadoMediano: number;
  deltaPct: number | null;
  semVendas: boolean;
  fonte: string;
  faixa: {
    min: number;
    p25: number;
    mediana: number;
    p75: number;
    pctP25: number;
    pctMediana: number;
    pctP75: number;
    pctNosso: number | null;
  } | null;
};

/** View da posição de preço: Δ%, leitura de "sem vendas", fonte pt-BR e faixa de mercado posicionada. */
export function posicaoPrecoView(
  posicao: Metricas['posicaoPreco'],
  faixas: NonNullable<Metricas['faixaMercado']> | undefined,
): PosicaoPrecoView[] {
  const faixaPorSku = new Map((faixas ?? []).map((f) => [f.sku, f]));
  return posicao.map((p) => {
    const comparavel = p.nossoPreco > 0 && p.precoMercadoMediano > 0;
    const f = faixaPorSku.get(p.sku) ?? null;
    let faixa: PosicaoPrecoView['faixa'] = null;
    if (f) {
      const lo = f.min;
      const hi = Math.max(f.p75, p.nossoPreco > 0 ? p.nossoPreco : f.p75);
      const pct = (v: number): number =>
        hi === lo ? 50 : Math.min(100, Math.max(0, Math.round(((v - lo) / (hi - lo)) * 100)));
      faixa = {
        min: f.min,
        p25: f.p25,
        mediana: f.mediana,
        p75: f.p75,
        pctP25: pct(f.p25),
        pctMediana: pct(f.mediana),
        pctP75: pct(f.p75),
        pctNosso: p.nossoPreco > 0 ? pct(p.nossoPreco) : null,
      };
    }
    return {
      sku: p.sku,
      nome: p.nome,
      nossoPreco: p.nossoPreco,
      precoMercadoMediano: p.precoMercadoMediano,
      deltaPct: comparavel
        ? Math.round(((p.nossoPreco - p.precoMercadoMediano) / p.precoMercadoMediano) * 1000) / 10
        : null,
      semVendas: p.nossoPreco === 0,
      fonte: fonteLabel(p.fonte),
      faixa,
    };
  });
}

/** Δ% de receita por sku entre topProdutos atual e anterior (null = sem base). */
export function deltaReceitaPorSku(
  atual: Metricas['topProdutos'],
  anterior: Metricas['topProdutos'] | undefined,
): Map<string, number | null> {
  const ant = new Map((anterior ?? []).map((p) => [p.sku, p.receita]));
  const out = new Map<string, number | null>();
  for (const p of atual) {
    const receitaAnterior = ant.get(p.sku);
    out.set(
      p.sku,
      receitaAnterior === undefined || receitaAnterior === 0
        ? null
        : Math.round(((p.receita - receitaAnterior) / receitaAnterior) * 1000) / 10,
    );
  }
  return out;
}
```

Rodar → **PASSA**.

- [ ] **Step 3:** Criar `graficos-cliente.tsx` (wrappers client — todo dado chega serializável; formatters importados AQUI, nunca passados por props de server component):

```tsx
'use client';

import React from 'react';

import { formatBRL, formatBRLCompacto } from '@/lib/format';
import {
  divergingPrecoModel,
  evolucaoComparadaModel,
  paretoModel,
  stackedAreaModel,
} from '@/components/ui/charts/chart-models';
import { DivergingBarChart } from '@/components/ui/charts/DivergingBarChart';
import { EvolucaoComparadaChart } from '@/components/ui/charts/EvolucaoComparadaChart';
import { ParetoChart } from '@/components/ui/charts/ParetoChart';
import { StackedAreaChart } from '@/components/ui/charts/StackedAreaChart';
import { WeekdayBarChart } from '@/components/ui/charts/WeekdayBarChart';

type Dia = { data: string; total: number };

export function EvolucaoV2({ atual, anterior }: { atual: Dia[]; anterior: Dia[] | null }) {
  const data = evolucaoComparadaModel(atual, anterior);
  return (
    <EvolucaoComparadaChart
      data={data}
      formatY={formatBRLCompacto}
      temAnterior={anterior !== null && anterior.length > 0}
      srSummary={`Evolução diária de vendas com média móvel de 7 dias${anterior ? ' e comparação com o período anterior' : ''}: ${data.map((d) => `${d.x}: ${formatBRL(d.atual)}`).join('; ')}`}
    />
  );
}

export function CanalPorDiaV2({ canalPorDia }: { canalPorDia: { data: string; canais: Record<string, number> }[] }) {
  const { keys, rows } = stackedAreaModel(canalPorDia);
  return (
    <StackedAreaChart
      keys={keys}
      rows={rows}
      formatY={formatBRLCompacto}
      srSummary={`Vendas por canal ao longo dos dias. Canais: ${keys.join(', ')}.`}
    />
  );
}

type AbcItem = { sku: string; nome: string; receita: number; pctAcumulado: number };

export function ParetoV2({ curvaAbc }: { curvaAbc: { a: AbcItem[]; b: AbcItem[]; c: AbcItem[]; concentracaoTop3Pct: number } }) {
  const data = paretoModel(curvaAbc);
  return (
    <ParetoChart
      data={data}
      formatReceita={formatBRLCompacto}
      srSummary={`Curva ABC de produtos por receita: ${data.map((d) => `${d.label} ${formatBRL(d.receita)} (${d.acumulado}% acumulado)`).join('; ')}`}
    />
  );
}

export function DiaSemanaV2({ porDiaSemana }: { porDiaSemana: { label: string; mediaVendas: number }[] }) {
  const data = porDiaSemana.map((d) => ({ label: d.label, value: d.mediaVendas }));
  return (
    <WeekdayBarChart
      data={data}
      formatValue={formatBRLCompacto}
      srSummary={`Média de vendas por dia da semana: ${data.map((d) => `${d.label}: ${formatBRL(d.value)}`).join('; ')}`}
    />
  );
}

export function PrecoVsMercadoV2({ posicao }: { posicao: { sku: string; nome: string; nossoPreco: number; precoMercadoMediano: number }[] }) {
  const data = divergingPrecoModel(posicao);
  if (data.length === 0) return null;
  return (
    <DivergingBarChart
      data={data}
      srSummary={`Diferença percentual do nosso preço em relação à mediana de mercado por produto: ${data.map((d) => `${d.label}: ${d.deltaPct}%`).join('; ')}`}
    />
  );
}
```

- [ ] **Step 4:** Criar `metricas-section.tsx` (server) — substitui TODO o conteúdo interno do `<Reveal id="metricas">` atual (linhas 107–235 da página). Estrutura completa (empty-states honestos; TODO campo v2 condicionado — relatório antigo renderiza chart de evolução simples + tabelas de hoje):

```tsx
import React from 'react';

import { formatBRL, formatDataCurta } from '@/lib/format';
import type { Metricas } from '@/modules/pipeline/contracts';
import { compararMetricas } from '@/modules/reports/compare';
import { deltaReceitaPorSku, posicaoPrecoView } from '@/modules/reports/report-view-model';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { CanalPorDiaV2, DiaSemanaV2, EvolucaoV2, ParetoV2, PrecoVsMercadoV2 } from './graficos-cliente';

function DeltaPct({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-dim">—</span>;
  const positivo = valor >= 0;
  return (
    <span className={`font-mono text-xs ${positivo ? 'text-brand' : 'text-red-400'}`}>
      {positivo ? '▲' : '▼'} {positivo ? '+' : ''}
      {valor.toLocaleString('pt-BR')}%
    </span>
  );
}

/** Barra da faixa de mercado min→p75 com marcadores de mediana e do nosso preço. */
function FaixaBar({ faixa }: { faixa: NonNullable<ReturnType<typeof posicaoPrecoView>[number]['faixa']> }) {
  return (
    <div className="relative h-2 w-36 rounded bg-white/5" aria-hidden="true">
      <div
        className="absolute h-2 rounded bg-white/15"
        style={{ left: `${faixa.pctP25}%`, width: `${Math.max(2, faixa.pctP75 - faixa.pctP25)}%` }}
      />
      <div className="absolute top-[-2px] h-3 w-0.5 bg-white/60" style={{ left: `${faixa.pctMediana}%` }} />
      {faixa.pctNosso !== null ? (
        <div className="absolute top-[-3px] h-3.5 w-1 rounded bg-brand" style={{ left: `${faixa.pctNosso}%` }} />
      ) : null}
    </div>
  );
}

export function MetricasSection({ metricas, anterior }: { metricas: Metricas; anterior: Metricas | null }) {
  const comp = anterior ? compararMetricas(metricas, anterior) : null;
  const deltaCanal = new Map((comp?.porCanal ?? []).map((c) => [c.canal, c.delta.deltaPct]));
  const deltaSku = deltaReceitaPorSku(metricas.topProdutos, anterior?.topProdutos);
  const ticketCanal = new Map((metricas.ticketPorCanal ?? []).map((t) => [t.canal, t.ticket]));
  const posicao = posicaoPrecoView(metricas.posicaoPreco, metricas.faixaMercado);

  return (
    <>
      <h2 className="font-heading text-xl font-semibold text-white">Métricas</h2>

      <div className="flex flex-wrap gap-6">
        <Card className="inline-flex">
          <Stat label="Ticket médio" value={formatBRL(metricas.ticketMedio)} />
        </Card>
        {metricas.unidadesTotais !== undefined ? (
          <Card className="inline-flex">
            <Stat label="Unidades vendidas" value={metricas.unidadesTotais} />
          </Card>
        ) : null}
        {metricas.itensPorPedido !== undefined ? (
          <Card className="inline-flex">
            <Stat label="Itens por pedido" value={metricas.itensPorPedido.toLocaleString('pt-BR')} />
          </Card>
        ) : null}
      </div>

      {metricas.benchmarkParcial && (
        <Badge variant="warn" className="flex w-fit gap-1.5">
          Benchmark de mercado parcial — dados de concorrência incompletos.
        </Badge>
      )}

      {/* Evolução: chart v2 + tabela dd/MM */}
      <Card>
        <CardHeader>
          <CardTitle as="h3" className="text-sm">Evolução das vendas</CardTitle>
        </CardHeader>
        <CardContent>
          {metricas.evolucao.length > 0 ? (
            <>
              <EvolucaoV2 atual={metricas.evolucao} anterior={anterior?.evolucao ?? null} />
              <Table>
                <THead>
                  <TR>
                    <TH>Data</TH>
                    <TH className="text-right">Total</TH>
                    {metricas.evolucaoDetalhada ? <TH className="text-right">Pedidos</TH> : null}
                  </TR>
                </THead>
                <TBody>
                  {(metricas.evolucaoDetalhada ?? metricas.evolucao).map((e, i) => (
                    <TR key={i}>
                      <TD className="font-mono text-sm">{formatDataCurta(e.data)}</TD>
                      <TD numeric>{formatBRL(e.total)}</TD>
                      {metricas.evolucaoDetalhada ? <TD numeric>{'pedidos' in e ? e.pedidos : ''}</TD> : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </>
          ) : (
            <p className="text-sm text-muted">Nenhuma venda registrada no período.</p>
          )}
        </CardContent>
      </Card>

      {/* Canal × dia (v2) */}
      {metricas.canalPorDia && metricas.canalPorDia.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm">Vendas por canal ao longo dos dias</CardTitle>
          </CardHeader>
          <CardContent>
            <CanalPorDiaV2 canalPorDia={metricas.canalPorDia} />
          </CardContent>
        </Card>
      ) : null}

      {/* Vendas por canal + Δ + ticket por canal */}
      <Card>
        <CardHeader>
          <CardTitle as="h3" className="text-sm">Vendas por canal</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Canal</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Pedidos</TH>
                {metricas.ticketPorCanal ? <TH className="text-right">Ticket</TH> : null}
                {comp ? <TH className="text-right">Δ vs anterior</TH> : null}
              </TR>
            </THead>
            <TBody>
              {metricas.vendasPorCanal.map((v, i) => (
                <TR key={i}>
                  <TD>{v.canal}</TD>
                  <TD numeric>{formatBRL(v.total)}</TD>
                  <TD numeric>{v.pedidos}</TD>
                  {metricas.ticketPorCanal ? (
                    <TD numeric>{ticketCanal.has(v.canal) ? formatBRL(ticketCanal.get(v.canal)!) : '—'}</TD>
                  ) : null}
                  {comp ? (
                    <TD className="text-right"><DeltaPct valor={deltaCanal.get(v.canal) ?? null} /></TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dia da semana (v2) */}
      {metricas.porDiaSemana && metricas.porDiaSemana.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm">Média de vendas por dia da semana</CardTitle>
          </CardHeader>
          <CardContent>
            <DiaSemanaV2 porDiaSemana={metricas.porDiaSemana} />
          </CardContent>
        </Card>
      ) : null}

      {/* Curva ABC (v2) + piores */}
      {metricas.curvaAbc ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm">Concentração de receita (curva ABC)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-white/90">
              <span className="font-mono font-bold text-brand">
                {Math.min(3, metricas.curvaAbc.a.length + metricas.curvaAbc.b.length + metricas.curvaAbc.c.length)} produtos
              </span>{' '}
              concentram{' '}
              <span className="font-mono font-bold text-brand">
                {metricas.curvaAbc.concentracaoTop3Pct.toLocaleString('pt-BR')}%
              </span>{' '}
              da sua receita.
            </p>
            <ParetoV2 curvaAbc={metricas.curvaAbc} />
            {metricas.piores && metricas.piores.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs uppercase tracking-wide text-muted">Menores receitas (com venda no período)</h4>
                <Table>
                  <THead>
                    <TR>
                      <TH>Produto</TH>
                      <TH>SKU</TH>
                      <TH className="text-right">Qtd.</TH>
                      <TH className="text-right">Receita</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {metricas.piores.map((p, i) => (
                      <TR key={i}>
                        <TD>{p.nome}</TD>
                        <TD className="font-mono text-sm">{p.sku}</TD>
                        <TD numeric>{p.quantidade}</TD>
                        <TD numeric>{formatBRL(p.receita)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Top produtos + Δ */}
      <Card>
        <CardHeader>
          <CardTitle as="h3" className="text-sm">Top produtos</CardTitle>
        </CardHeader>
        <CardContent>
          {metricas.topProdutos.length > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH>Nome</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Qtd.</TH>
                  <TH className="text-right">Receita</TH>
                  {anterior ? <TH className="text-right">Δ vs anterior</TH> : null}
                </TR>
              </THead>
              <TBody>
                {metricas.topProdutos.map((p, i) => (
                  <TR key={i}>
                    <TD>{p.nome}</TD>
                    <TD className="font-mono text-sm">{p.sku}</TD>
                    <TD numeric>{p.quantidade}</TD>
                    <TD numeric>{formatBRL(p.receita)}</TD>
                    {anterior ? (
                      <TD className="text-right"><DeltaPct valor={deltaSku.get(p.sku) ?? null} /></TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="text-sm text-muted">Nenhum produto vendido no período.</p>
          )}
        </CardContent>
      </Card>

      {/* Frete (v2) */}
      {metricas.frete ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm">Frete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-8">
              <Stat label="Frete médio por pedido" value={formatBRL(metricas.frete.freteMedio)} />
              <Stat label="Frete sobre a receita" value={`${metricas.frete.pctFreteSobreReceita.toLocaleString('pt-BR')}%`} />
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Canal</TH>
                  <TH className="text-right">Frete médio</TH>
                  <TH className="text-right">Frete total</TH>
                </TR>
              </THead>
              <TBody>
                {metricas.frete.fretePorCanal.map((f, i) => (
                  <TR key={i}>
                    <TD>{f.canal}</TD>
                    <TD numeric>{formatBRL(f.freteMedio)}</TD>
                    <TD numeric>{formatBRL(f.freteTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {/* Posição de preço v2 */}
      <Card>
        <CardHeader>
          <CardTitle as="h3" className="text-sm">Posição de preço vs mercado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {posicao.length > 0 ? (
            <>
              <PrecoVsMercadoV2 posicao={metricas.posicaoPreco} />
              <Table>
                <THead>
                  <TR>
                    <TH>Produto</TH>
                    <TH className="text-right">Nosso preço</TH>
                    <TH className="text-right">Mercado (mediana)</TH>
                    <TH className="text-right">Δ</TH>
                    <TH>Faixa de mercado</TH>
                    <TH>Fonte</TH>
                  </TR>
                </THead>
                <TBody>
                  {posicao.map((pp, i) => (
                    <TR key={i}>
                      <TD>
                        {pp.nome} <span className="font-mono text-xs text-dim">{pp.sku}</span>
                      </TD>
                      <TD numeric>
                        {pp.semVendas ? (
                          <span className="text-dim">sem vendas no período</span>
                        ) : (
                          formatBRL(pp.nossoPreco)
                        )}
                      </TD>
                      <TD numeric>{pp.precoMercadoMediano > 0 ? formatBRL(pp.precoMercadoMediano) : '—'}</TD>
                      <TD className="text-right"><DeltaPct valor={pp.deltaPct} /></TD>
                      <TD>
                        {pp.faixa ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-dim">{formatBRL(pp.faixa.min)}</span>
                            <FaixaBar faixa={pp.faixa} />
                            <span className="font-mono text-[10px] text-dim">{formatBRL(pp.faixa.p75)}</span>
                          </div>
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </TD>
                      <TD className="text-sm text-muted">{pp.fonte}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </>
          ) : (
            <p className="text-sm text-muted">
              Nenhum produto monitorado com SKU — cadastre produtos em Conexões para acompanhar preços de mercado.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
```

- [ ] **Step 5:** Na página `[id]/page.tsx`: substituir o conteúdo do `<Reveal id="metricas" data-testid="metricas" className="space-y-6 scroll-mt-24">...</Reveal>` (linhas 107–235) por `<MetricasSection metricas={rel.metricas} anterior={anterior?.metricas ?? null} />` (o `Reveal` externo com o testid FICA). Remover o import de `EvolucaoChart` e apagar `evolucao-chart.tsx` (grep antes: `EvolucaoChart` só é usado nesta página; se aparecer em outro lugar, manter o arquivo). Remover imports que ficarem órfãos (`Stat`, `Table` etc. — só os que a página não usa mais; `formatBRL` continua em uso nas seções de IA).

- [ ] **Step 6:** `npm run typecheck` + `npx vitest run` verdes. Smoke manual: relatório done ANTIGO (seed E2E) renderiza sem os cards v2 e sem erro; relatório com métricas v2 mostra os 4 charts. `npx playwright test tests/e2e/dashboard.spec.ts tests/e2e/relatorio-task.spec.ts` (com `DATABASE_URL_TEST` configurada) → verdes. **Commit:** `feat(g1): relatorio v2 — secoes de graficos, tabelas com delta e posicao de preco com faixas`.

---
### Task 9: Achados da IA como cards acionáveis

**Files:** Create `src/components/tasks/AchadosCards.tsx`; Modify `src/app/(client)/dashboard/relatorios/[id]/page.tsx` (só a seção `#recomendacoes`).

**Interfaces (Consumes):** `createTasksFromReportAction` (`src/actions/tasks.actions.ts:566` — `useFormState`, form com `reportId` + `itens` JSON `[{ fonte, indice }]`; a fonte `'achados'` foi liberada na Task 5), `AchadosParaTasks` (padrão de referência: hidden input + `definirItens` + `useFormStatus` + toast — `src/components/tasks/AchadosParaTasks.tsx`), `ordenarAchados` (Task 3 — devolve `{ achado, indice }` com índice ORIGINAL), `tituloFromItem` (report-to-task.ts — dedup por título), `listTaskTitulosByReport` já chamado na página, `formatBRL`, `Badge`/`Card`/`Button`/`useToast`, `TIPO_TASK_LABEL`/`PRIORIDADE_TASK_LABEL` (task.types.ts).

**Invariante E2E:** `tests/e2e/relatorio-task.spec.ts` semeia análise SEM `achados` e clica `virar-task-gargalos-0` — o caminho de fallback (3 listas antigas com `AchadosParaTasks`) deve permanecer BYTE A BYTE como hoje. Os cards novos só aparecem quando `analiseIa.achados` existe e tem itens.

**Interfaces (Produces):**

```tsx
// AchadosCards.tsx ('use client')
export function AchadosCards(props: {
  reportId: string;
  achados: Achado[]; // array ORIGINAL (ordenação interna via ordenarAchados)
  titulosExistentes: string[];
}): JSX.Element;
// testids: virar-task-achados-{indiceOriginal} (novo padrão, não colide com os antigos)
```

- [ ] **Step 1:** Criar `src/components/tasks/AchadosCards.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { createTasksFromReportAction, type TaskActionState } from '@/actions/tasks.actions';
import { formatBRL } from '@/lib/format';
import type { Achado } from '@/modules/pipeline/contracts';
import { ordenarAchados } from '@/modules/reports/report-view-model';
import { tituloFromItem } from '@/modules/tasks/report-to-task';
import { PRIORIDADE_TASK_LABEL, TIPO_TASK_LABEL } from '@/modules/tasks/task.types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

type State = TaskActionState & { criadas?: number };
const initial: State = {};

const PRIORIDADE_VARIANT = { alta: 'danger', media: 'warn', baixa: 'neutral' } as const;

function VirarTarefaButton({ indice, jaExiste, onClick }: { indice: number; jaExiste: boolean; onClick: () => void }) {
  const { pending } = useFormStatus();
  if (jaExiste) {
    return (
      <Button type="button" variant="secondary" size="sm" disabled data-testid={`virar-task-achados-${indice}`}>
        Tarefa criada
      </Button>
    );
  }
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending} onClick={onClick} data-testid={`virar-task-achados-${indice}`}>
      Virar tarefa
    </Button>
  );
}

/** Achados estruturados da IA como cards acionáveis, ordenados por impacto R$ desc. */
export function AchadosCards({
  reportId,
  achados,
  titulosExistentes,
}: {
  reportId: string;
  achados: Achado[];
  titulosExistentes: string[];
}) {
  const [state, action] = useFormState(createTasksFromReportAction, initial);
  const { toast } = useToast();
  const itensInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok && typeof state.criadas === 'number') {
      toast({ variant: 'success', title: `${state.criadas} tarefa(s) criada(s) no Plano de Ação` });
    }
  }, [state, toast]);

  if (achados.length === 0) return null;

  const existentes = new Set(titulosExistentes);
  const ordenados = ordenarAchados(achados);

  function definirItens(alvo: Array<{ fonte: 'achados'; indice: number }>) {
    if (itensInputRef.current) itensInputRef.current.value = JSON.stringify(alvo);
  }

  return (
    <form action={action}>
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="itens" ref={itensInputRef} defaultValue="[]" />

      {state.error ? (
        <p role="alert" className="mb-2 text-sm text-danger-fg">{state.error}</p>
      ) : null}

      <div className="space-y-4" data-testid="achados-cards">
        {ordenados.map(({ achado, indice }) => {
          const jaExiste = existentes.has(tituloFromItem(achado.titulo));
          return (
            <Card key={indice} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={PRIORIDADE_VARIANT[achado.prioridade]}>
                  Prioridade {PRIORIDADE_TASK_LABEL[achado.prioridade]}
                </Badge>
                <Badge variant="neutral">{TIPO_TASK_LABEL[achado.tipo]}</Badge>
                {achado.impactoEstimadoMensalBRL !== null ? (
                  <span className="font-mono text-sm font-bold text-brand">
                    {formatBRL(achado.impactoEstimadoMensalBRL)}/mês
                  </span>
                ) : null}
              </div>
              <h3 className="font-heading text-base font-semibold text-white">{achado.titulo}</h3>
              <p className="text-sm leading-relaxed text-white/80">{achado.descricao}</p>
              {achado.comoFazer.length > 0 ? (
                <ol className="list-decimal space-y-1 pl-5 text-sm text-white/70">
                  {achado.comoFazer.map((passo, i) => (
                    <li key={i}>{passo}</li>
                  ))}
                </ol>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {achado.skus.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {achado.skus.map((sku) => (
                      <span key={sku} className="rounded border border-line bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-muted">
                        {sku}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span />
                )}
                <VirarTarefaButton
                  indice={indice}
                  jaExiste={jaExiste}
                  onClick={() => definirItens([{ fonte: 'achados', indice }])}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </form>
  );
}
```

*(nota: `Badge` — confirmar as variants existentes em `src/components/ui/Badge.tsx`; a página atual usa `danger`/`warn`/`neutral`, então o mapa acima é consistente. `text-danger-fg` copiado do `AchadosParaTasks`.)*

- [ ] **Step 2:** Na página `[id]/page.tsx`, seção Recomendações — envolver as 3 listas atuais num fallback:

```tsx
{(rel.analiseIa.achados?.length ?? 0) > 0 ||
rel.analiseIa.gargalos.length > 0 ||
rel.analiseIa.sugestoesMelhoria.length > 0 ||
rel.analiseIa.ideiasVenda.length > 0 ? (
  <Reveal id="recomendacoes" className="space-y-4 scroll-mt-24">
    <h2 className="font-heading text-xl font-semibold text-white">Recomendações</h2>
    {rel.analiseIa.achados && rel.analiseIa.achados.length > 0 ? (
      <AchadosCards
        reportId={rel.id}
        achados={rel.analiseIa.achados}
        titulosExistentes={titulosExistentes}
      />
    ) : (
      <div className="space-y-4">
        {/* ...os 3 blocos ATUAIS (gargalos / sugestoesMelhoria / ideiasVenda) EXATAMENTE como estão hoje,
            incluindo AchadosParaTasks e testids virar-task-{fonte}-{i} — NÃO alterar uma linha... */}
      </div>
    )}
  </Reveal>
) : null}
```

Import `AchadosCards` de `@/components/tasks/AchadosCards`. A condição do TOC da Task 7 já cobre `achados`.

- [ ] **Step 3:** `npm run typecheck` + `npx vitest run` verdes. `npx playwright test tests/e2e/relatorio-task.spec.ts` → **verde** (seed sem achados → fallback intacto). Smoke manual: com um relatório v2 semeado (jsonb com `achados`), clicar "Virar tarefa" cria task com título completo, tipo/prioridade do achado e checklist dos passos. **Commit:** `feat(g1): achados da ia como cards acionaveis com virar tarefa`.

---

### Task 10: PDF v2 — capa branded, resumo em 3 números, score gauge SVG e miolo claro

**Files:** Create `src/modules/pdf/pdf-gauge.ts`, `tests/unit/pdf-gauge.test.ts`; Modify `src/modules/pdf/report-pdf.tsx`, `src/app/api/reports/[id]/pdf/route.ts`, `src/lib/format.ts` (`slugify`), `tests/unit/report-pdf.test.ts`, `tests/unit/format-compacto.test.ts` (casos de `slugify`).

**Interfaces (Consumes):** `ReportPdfInput` atual (report-pdf.tsx:9–15), `registerPdfFonts` (fonts.ts — fallback Helvetica quando TTFs ausentes; NÃO tocar), `recomendacaoCards`/`ordenarAchados` (report-view-model), `totalVendas`/`totalPedidos`/`deltaNumero` (compare.ts), `getOrgAnalistaUser(orgId): Promise<{ id: string; email: string } | null>` (**JÁ EXISTE** em `src/modules/notifications/recipients.ts:50` — reusar, não criar query nova), `@react-pdf/renderer` exporta `Svg`/`Path`/`Circle` (confirmar no `node_modules` — versão instalada na F1 suporta primitivas SVG).

**Interfaces (Produces):**

```ts
// pdf-gauge.ts (puro)
export function polarToXY(cx: number, cy: number, r: number, anguloGraus: number): { x: number; y: number };
export function arcoPath(cx: number, cy: number, r: number, inicioGraus: number, fimGraus: number): string; // path SVG "M ... A ..."
export const GAUGE_INICIO = -135; // gauge de 270°, como o ScoreGauge da UI (225°→-45°)
export function anguloDoScore(score: number): number; // -135 + 270 * score/100
export function barrasEvolucao(evolucao: { data: string; total: number }[], maxBarras?: number): { label: string; pct: number }[];

// format.ts
export function slugify(s: string): string; // 'Comercial Mattos & Cia' → 'comercial-mattos-cia'; vazio → 'cliente'

// report-pdf.tsx
export type ReportPdfInput = {
  orgName: string;
  periodo: string;
  geradoEm: string;
  metricas: Metricas;
  analise: AnaliseIa | null;
  analistaEmail: string | null; // NOVO
};
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/pdf-gauge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { anguloDoScore, arcoPath, barrasEvolucao, polarToXY } from '@/modules/pdf/pdf-gauge';

describe('polarToXY', () => {
  it('0° = topo, 90° = direita (convenção do gauge)', () => {
    const topo = polarToXY(50, 50, 40, 0);
    expect(topo.x).toBeCloseTo(50);
    expect(topo.y).toBeCloseTo(10);
    const direita = polarToXY(50, 50, 40, 90);
    expect(direita.x).toBeCloseTo(90);
    expect(direita.y).toBeCloseTo(50);
  });
});

describe('anguloDoScore', () => {
  it('0 → -135°, 50 → 0°, 100 → 135°', () => {
    expect(anguloDoScore(0)).toBe(-135);
    expect(anguloDoScore(50)).toBe(0);
    expect(anguloDoScore(100)).toBe(135);
  });
});

describe('arcoPath', () => {
  it('gera um path M..A.. com large-arc quando o arco excede 180°', () => {
    const p = arcoPath(50, 50, 40, -135, 135);
    expect(p.startsWith('M ')).toBe(true);
    expect(p).toContain(' A 40 40 0 1 1 ');
  });
  it('sem large-arc para arcos curtos', () => {
    expect(arcoPath(50, 50, 40, -135, 0)).toContain(' A 40 40 0 0 1 ');
  });
});

describe('barrasEvolucao', () => {
  it('normaliza para % do maior dia e limita a maxBarras (fatia final)', () => {
    const r = barrasEvolucao(
      [
        { data: '2026-06-01', total: 50 },
        { data: '2026-06-02', total: 100 },
        { data: '2026-06-03', total: 25 },
      ],
      2,
    );
    expect(r).toEqual([
      { label: '02/06', pct: 100 },
      { label: '03/06', pct: 25 },
    ]);
  });
  it('tudo zero → pct 0 (sem divisão por zero)', () => {
    expect(barrasEvolucao([{ data: '2026-06-01', total: 0 }])[0].pct).toBe(0);
  });
});
```

E em `tests/unit/format-compacto.test.ts`, acrescentar:

```ts
import { slugify } from '@/lib/format';

describe('slugify', () => {
  it.each([
    ['Comercial Mattos & Cia', 'comercial-mattos-cia'],
    ['Bazar Estrela do Mar', 'bazar-estrela-do-mar'],
    ['Ação & Emoção Ltda.', 'acao-emocao-ltda'],
    ['', 'cliente'],
  ])('%s → %s', (entrada, esperado) => {
    expect(slugify(entrada)).toBe(esperado);
  });
});
```

- [ ] **Step 2:** Rodar → **FALHA**. Implementar `src/modules/pdf/pdf-gauge.ts`:

```ts
/** Helpers puros do gauge/mini-chart do PDF (sem dependência de react-pdf). */
import { formatDataCurta } from '@/lib/format';

export const GAUGE_INICIO = -135;
const GAUGE_VARREDURA = 270;

/** Ângulo em graus com 0° no TOPO, sentido horário (convenção de gauge). */
export function polarToXY(cx: number, cy: number, r: number, anguloGraus: number): { x: number; y: number } {
  const rad = ((anguloGraus - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function anguloDoScore(score: number): number {
  return GAUGE_INICIO + (GAUGE_VARREDURA * Math.min(100, Math.max(0, score))) / 100;
}

export function arcoPath(cx: number, cy: number, r: number, inicioGraus: number, fimGraus: number): string {
  const ini = polarToXY(cx, cy, r, inicioGraus);
  const fim = polarToXY(cx, cy, r, fimGraus);
  const largeArc = fimGraus - inicioGraus > 180 ? 1 : 0;
  return `M ${ini.x.toFixed(2)} ${ini.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${fim.x.toFixed(2)} ${fim.y.toFixed(2)}`;
}

/** Barras normalizadas (0–100%) da evolução para o mini-chart do PDF. */
export function barrasEvolucao(
  evolucao: { data: string; total: number }[],
  maxBarras = 31,
): { label: string; pct: number }[] {
  const fatia = evolucao.slice(-maxBarras);
  const max = Math.max(0, ...fatia.map((e) => e.total));
  return fatia.map((e) => ({
    label: formatDataCurta(e.data),
    pct: max <= 0 ? 0 : Math.round((e.total / max) * 100),
  }));
}
```

E em `src/lib/format.ts`:

```ts
/** Slug de nome para filenames: minúsculo, sem acentos, hífens. Vazio → 'cliente'. */
export function slugify(s: string): string {
  const slug = s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return slug || 'cliente';
}
```

Rodar → **PASSA**.

- [ ] **Step 3:** Reescrever `report-pdf.tsx` (v2). Diretrizes obrigatórias + estrutura:

1. Imports: `import { Document, Page, StyleSheet, Text, View, Svg, Path, renderToBuffer } from '@react-pdf/renderer';` + `anguloDoScore, arcoPath, barrasEvolucao, GAUGE_INICIO` de `./pdf-gauge` + `ordenarAchados, recomendacaoCards, PRIORIDADE_LABEL` de report-view-model + `deltaNumero, totalPedidos, totalVendas` de compare.
2. `ReportPdfInput` ganha `analistaEmail: string | null`.
3. **Dois conjuntos de estilos**: `capa` (dark como hoje: fundo `#0a0c10`, wordmark verde/branco) e `miolo` (CLARO: `backgroundColor: '#ffffff'`, texto `#111318`, muted `#5b5b66`, verde Truth `#0aa626` como acento — verde escurecido p/ contraste em fundo branco, bordas `#e4e4e9`).
4. **Página 1 — capa (dark):** kicker + wordmark (como hoje), `orgName` em 28pt, período, gerado em, e o **ScoreGauge SVG** quando `metricas.truth_score` existir:

```tsx
function GaugePdf({ score }: { score: number }) {
  const cor = score >= 70 ? '#07dd2b' : score >= 40 ? '#eab308' : '#ef4444';
  return (
    <View style={{ width: 140, height: 140, position: 'relative', marginTop: 24 }}>
      <Svg width={140} height={140} viewBox="0 0 140 140">
        <Path d={arcoPath(70, 70, 58, GAUGE_INICIO, 135)} stroke="#ffffff18" strokeWidth={10} fill="none" strokeLinecap="round" />
        <Path d={arcoPath(70, 70, 58, GAUGE_INICIO, anguloDoScore(score))} stroke={cor} strokeWidth={10} fill="none" strokeLinecap="round" />
      </Svg>
      <View style={{ position: 'absolute', top: 0, left: 0, width: 140, height: 140, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 30, color: '#ffffff' }}>{score}</Text>
        <Text style={{ fontSize: 8, color: '#a1a1aa' }}>/ 100 · Truth Score</Text>
      </View>
    </View>
  );
}
```

5. **Página 2 — "Resumo em 3 números" (miolo claro):** três blocos: Total do período (`totalVendas(metricas)` + delta via `truth_score.totalPeriodoAnterior` quando disponível: `deltaNumero(...).deltaPct` formatado `▲ +12,2% vs período anterior`), Pedidos (`totalPedidos`), Ticket médio. Abaixo, **mini-evolução**: linha de `View`s lado a lado (`flexDirection: 'row', alignItems: 'flex-end', height: 60`), cada barra `{ width: proporcional, height: `${pct}%`, backgroundColor: '#0aa626' }` a partir de `barrasEvolucao(metricas.evolucao)`; rótulos do 1º e último dia. Depois, **breakdown do score** quando presente (5 fatores como hoje na UI: label + `pontos/max` + barra `View` com width %).
6. **Página 3 — análise (miolo claro):** resumo executivo; **top-3 achados** quando `analise?.achados?.length` (via `ordenarAchados(...).slice(0, 3)`: título, badge textual `Prioridade Alta · Logística`, impacto `+ R$ 1.200/mês` quando não-null, passos numerados); fallback = `recomendacaoCards(analise).slice(0, 6)` como hoje; preços sugeridos como hoje (com `precoAtual → precoSugerido` quando presente).
7. Métricas tabulares (canais/top produtos/posição) mantidas no miolo claro (adaptar estilos de linha).
8. **Rodapé fixo em todas as páginas:** à esquerda `truthcommerce.com.br`; centro `Analista responsável: {analistaEmail ?? '—'}`; direita paginação.

- [ ] **Step 4:** Atualizar `tests/unit/report-pdf.test.ts`: adicionar `analistaEmail: 'analista@truthcommerce.com.br'` (e um caso `null`) aos inputs; adicionar caso com `metricas.truth_score` + `analise.achados` preenchidos (reusar shapes dos testes das Tasks 3/5) assertando `%PDF-` e `length > 1000`. Rodar `npx vitest run tests/unit/report-pdf.test.ts` → **PASSA** (se `Svg`/`Path` não existirem na versão instalada de `@react-pdf/renderer`, PARE: substituir o gauge por barras `View` e anotar a divergência).

- [ ] **Step 5:** Atualizar `route.ts`:

```ts
import { getOrgAnalistaUser } from '@/modules/notifications/recipients';
import { slugify } from '@/lib/format';
// ...
  if (!rel || rel.status !== 'done' || !rel.metricas) {
    return new Response('Relatório não disponível para exportação.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const [org, analista] = await Promise.all([
    getOrganizationById(access.orgId),
    getOrgAnalistaUser(access.orgId),
  ]);
  const buffer = await renderReportPdf({
    orgName: org?.name ?? 'Cliente Truth',
    periodo: formatPeriodo(rel.periodoInicio, rel.periodoFim),
    geradoEm: formatData(rel.createdAt),
    metricas: rel.metricas,
    analise: rel.analiseIa,
    analistaEmail: analista?.email ?? null,
  });

  const inicio = rel.periodoInicio.toISOString().slice(0, 10);
  const fim = rel.periodoFim.toISOString().slice(0, 10);
  const filename = `truth-analytics-${slugify(org?.name ?? 'cliente')}-${inicio}-${fim}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
```

- [ ] **Step 6:** `npm run typecheck` + `npx vitest run` verdes. Smoke manual: baixar o PDF de um relatório done (antigo E v2) — capa dark, miolo branco imprimível, gauge presente quando há score, rodapé com analista/'—'. **Commit:** `feat(g1): pdf v2 — capa branded com score gauge, resumo em 3 numeros e miolo claro`.

---
### Task 11: E-mail v2 "relatório pronto" — assunto com resultado, corpo branded

**Files:** Modify `src/modules/notifications/templates.ts` (só `reportReadyTemplate` — assinatura já é a da Task 5); Create `tests/unit/report-ready-template.test.ts`.

**Interfaces (Consumes):** `ReportReadyEmailData` (Task 5), `escapeHtml` (templates.ts:23 — TODO input dinâmico interpolado em HTML passa por ele), `formatBRL`/`formatDiaMes` (`@/lib/format` — `formatDiaMes` é da Task 6, BRT), `EmailContent`.

**Interfaces (Produces):** `reportReadyTemplate(dados: ReportReadyEmailData, appUrl: string): EmailContent` com: subject `Suas vendas de {dd/mm}–{dd/mm}: {R$ total} (▲ +x%) — relatório Truth pronto` (parênteses omitidos quando `deltaPct === null`); HTML branded mínimo (wordmark texto `Truth` verde `#07dd2b` + `Analytics`, tudo inline styles — e-mail não tem CSS externo), score, gargalo nº 1, botão CTA "Ver relatório completo", parágrafo fixo do Plano de Ação; texto plano equivalente.

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/report-ready-template.test.ts` (padrão de `tests/unit/notification-templates.test.ts`):

```ts
import { describe, expect, it } from 'vitest';

import { reportReadyTemplate, type ReportReadyEmailData } from '@/modules/notifications/templates';

const DADOS: ReportReadyEmailData = {
  reportId: 'rep-123',
  periodoInicio: new Date('2026-06-01T12:00:00Z'),
  periodoFim: new Date('2026-06-30T12:00:00Z'),
  totalPeriodo: 10880,
  deltaPct: 12.2,
  score: 76,
  primeiroGargalo: 'Frete <caro> no ML & Shopee',
};

describe('reportReadyTemplate v2', () => {
  it('assunto tem período dd/mm, total formatado e direção do delta', () => {
    const { subject } = reportReadyTemplate(DADOS, 'http://x');
    expect(subject).toContain('01/06');
    expect(subject).toContain('30/06');
    expect(subject).toContain('10.880');
    expect(subject).toContain('▲');
    expect(subject).toContain('12,2%');
    expect(subject).toContain('relatório Truth pronto');
  });

  it('delta negativo → ▼; delta null → sem parênteses de variação', () => {
    expect(reportReadyTemplate({ ...DADOS, deltaPct: -8.4 }, 'http://x').subject).toContain('▼');
    const semDelta = reportReadyTemplate({ ...DADOS, deltaPct: null }, 'http://x').subject;
    expect(semDelta).not.toContain('▲');
    expect(semDelta).not.toContain('▼');
  });

  it('html tem CTA para o relatório, score, gargalo ESCAPADO e parágrafo do Plano de Ação', () => {
    const { html } = reportReadyTemplate(DADOS, 'http://x');
    expect(html).toContain('http://x/dashboard/relatorios/rep-123');
    expect(html).toContain('Ver relatório completo');
    expect(html).toContain('76');
    expect(html).toContain('Frete &lt;caro&gt; no ML &amp; Shopee');
    expect(html).not.toContain('Frete <caro>');
    expect(html).toContain('Plano de Ação');
    expect(html).toContain('#07dd2b'); // wordmark/CTA na cor da marca
  });

  it('score/gargalo nulos → seções omitidas sem quebrar', () => {
    const { html, text } = reportReadyTemplate({ ...DADOS, score: null, primeiroGargalo: null }, 'http://x');
    expect(html).not.toContain('Truth Score');
    expect(html).not.toContain('Principal gargalo');
    expect(text.length).toBeGreaterThan(0);
  });

  it('texto plano equivalente (total, link e gargalo)', () => {
    const { text } = reportReadyTemplate(DADOS, 'http://x');
    expect(text).toContain('10.880');
    expect(text).toContain('http://x/dashboard/relatorios/rep-123');
    expect(text).toContain('Frete <caro> no ML & Shopee'); // texto plano NÃO escapa
  });
});
```

- [ ] **Step 2:** Rodar → **FALHA**. Substituir o corpo do `reportReadyTemplate` (mantendo a assinatura da Task 5):

```ts
import { formatBRL, formatDiaMes } from '@/lib/format';

/**
 * Template v2: relatório pronto — assunto com o RESULTADO do período e corpo
 * branded mínimo (inline styles; e-mail não carrega CSS externo).
 */
export function reportReadyTemplate(dados: ReportReadyEmailData, appUrl: string): EmailContent {
  const url = `${appUrl}/dashboard/relatorios/${dados.reportId}`;
  const periodo = `${formatDiaMes(dados.periodoInicio)}–${formatDiaMes(dados.periodoFim)}`;
  const total = formatBRL(dados.totalPeriodo);
  const deltaTexto =
    dados.deltaPct === null
      ? ''
      : ` (${dados.deltaPct >= 0 ? '▲' : '▼'} ${dados.deltaPct >= 0 ? '+' : ''}${dados.deltaPct.toLocaleString('pt-BR')}%)`;

  const subject = `Suas vendas de ${periodo}: ${total}${deltaTexto} — relatório Truth pronto`;

  const planoDeAcao =
    'Cada recomendação do relatório pode virar uma tarefa no seu Plano de Ação com um clique — é lá que a análise vira resultado.';

  const text = [
    `Suas vendas de ${periodo}: ${total}${deltaTexto}.`,
    '',
    ...(dados.score !== null ? [`Truth Score da operação: ${dados.score}/100.`] : []),
    ...(dados.primeiroGargalo !== null ? [`Principal gargalo identificado: ${dados.primeiroGargalo}`] : []),
    '',
    `Veja o relatório completo: ${url}`,
    '',
    planoDeAcao,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111318;max-width:560px">
<p style="font-size:20px;font-weight:bold;margin:0 0 16px"><span style="color:#07dd2b">Truth</span>Analytics</p>
<p style="font-size:16px">Suas vendas de <strong>${periodo}</strong>: <strong>${escapeHtml(total)}</strong>${escapeHtml(deltaTexto)}.</p>
${dados.score !== null ? `<p>Truth Score da operação: <strong>${dados.score}/100</strong>.</p>` : ''}
${dados.primeiroGargalo !== null ? `<p>Principal gargalo identificado: <strong>${escapeHtml(dados.primeiroGargalo)}</strong></p>` : ''}
<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#07dd2b;color:#04150a;font-weight:bold;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Ver relatório completo</a></p>
<p style="color:#5b5b66;font-size:13px">${planoDeAcao}</p>
<p style="color:#5b5b66;font-size:13px">Atenciosamente,<br>Equipe Truth Analytics</p>
</div>`;

  return { subject, html, text };
}
```

*(nota: `formatBRL` gera espaço não separável entre "R$" e o número — os testes usam `toContain('10.880')` de propósito; não asserte a string inteira com espaço comum.)*

- [ ] **Step 3:** `npx vitest run tests/unit/report-ready-template.test.ts tests/unit/notification-templates.test.ts tests/unit/email.test.ts` → **PASSA** (o describe de `reportReadyTemplate` atualizado na Task 5 continua compatível — se alguma asserção de copy antiga sobrar, atualizá-la AQUI citando este step).

- [ ] **Step 4:** `npm run typecheck` + `npx vitest run` verdes. **Commit:** `feat(g1): email v2 de relatorio pronto — assunto com resultado e corpo branded`.

---

### Task 12: Comparar v2 — default vs anterior, Δ em R$, top produtos e leitura automática

**Files:** Modify `src/modules/reports/compare.ts`, `src/app/(client)/dashboard/relatorios/comparar/page.tsx`, `src/app/(client)/dashboard/relatorios/comparar/comparar-form.tsx`; Create `tests/unit/compare-v2.test.ts`.

**Interfaces (Consumes):** `getDoneAnterior` (Task 7), `compararMetricas`/`ComparacaoRelatorios`/`DeltaNumero` (compare.ts — `deltaAbs` já existe no `DeltaNumero`), `Select`/`Button` (`src/components/ui/Select.tsx`, `src/components/ui/Button.tsx` — DS), página atual (`DeltaBadge` local, tabela, `data-testid="comparacao"`/`"comparar-form"`), `formatBRL`/`formatPeriodo`.

**Interfaces (Produces):**

```ts
// compare.ts
export type ProdutoComparado = {
  sku: string;
  nome: string;
  receitaAtual: number;
  receitaAnterior: number;
  situacao: 'subiu' | 'caiu' | 'estavel' | 'entrou' | 'saiu';
};
export function compararTopProdutos(atual: Metricas, anterior: Metricas): ProdutoComparado[]; // interseção por sku (fallback nome), sort receitaAtual desc
export function leituraComparacao(comp: ComparacaoRelatorios): string; // 1 frase determinística pt-BR
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/compare-v2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Metricas } from '@/modules/pipeline/contracts';
import { compararMetricas, compararTopProdutos, leituraComparacao } from '@/modules/reports/compare';

function metricas(canais: { canal: string; total: number; pedidos: number }[], produtos: { sku: string; receita: number }[]): Metricas {
  return {
    vendasPorCanal: canais,
    evolucao: [{ data: '2026-06-01', total: canais.reduce((a, c) => a + c.total, 0) }],
    ticketMedio: 100,
    topProdutos: produtos.map((p) => ({ nome: `Prod ${p.sku}`, sku: p.sku, quantidade: 1, receita: p.receita })),
    posicaoPreco: [],
    benchmarkParcial: false,
  };
}

describe('compararTopProdutos', () => {
  it('classifica subiu/caiu/estavel/entrou/saiu por sku, ordenado por receita atual desc', () => {
    const atual = metricas([{ canal: 'shopee', total: 1000, pedidos: 10 }], [
      { sku: 'A', receita: 500 },
      { sku: 'B', receita: 300 },
      { sku: 'N', receita: 100 },
      { sku: 'E', receita: 50 },
    ]);
    const anterior = metricas([{ canal: 'shopee', total: 900, pedidos: 9 }], [
      { sku: 'A', receita: 400 },
      { sku: 'B', receita: 350 },
      { sku: 'E', receita: 50 },
      { sku: 'S', receita: 200 },
    ]);
    const r = compararTopProdutos(atual, anterior);
    expect(r.map((p) => [p.sku, p.situacao])).toEqual([
      ['A', 'subiu'],
      ['B', 'caiu'],
      ['N', 'entrou'],
      ['E', 'estavel'],
      ['S', 'saiu'],
    ]);
    expect(r[0]).toMatchObject({ receitaAtual: 500, receitaAnterior: 400 });
  });
});

describe('leituraComparacao', () => {
  it('crescimento → cita % e o canal que mais cresceu em R$', () => {
    const comp = compararMetricas(
      metricas([{ canal: 'mercadolivre', total: 800, pedidos: 8 }, { canal: 'shopee', total: 400, pedidos: 4 }], []),
      metricas([{ canal: 'mercadolivre', total: 500, pedidos: 5 }, { canal: 'shopee', total: 500, pedidos: 5 }], []),
    );
    expect(leituraComparacao(comp)).toBe('Crescimento de 20% nas vendas, puxado por mercadolivre.');
  });

  it('queda → cita % e o canal que mais caiu', () => {
    const comp = compararMetricas(
      metricas([{ canal: 'shopee', total: 500, pedidos: 5 }], []),
      metricas([{ canal: 'shopee', total: 1000, pedidos: 10 }], []),
    );
    expect(leituraComparacao(comp)).toBe('Queda de 50% nas vendas, com maior recuo em shopee.');
  });

  it('estável e sem base → frases honestas', () => {
    const iguais = compararMetricas(
      metricas([{ canal: 'shopee', total: 500, pedidos: 5 }], []),
      metricas([{ canal: 'shopee', total: 500, pedidos: 5 }], []),
    );
    expect(leituraComparacao(iguais)).toBe('Vendas estáveis em relação ao período anterior.');
    const semBase = compararMetricas(
      metricas([{ canal: 'shopee', total: 500, pedidos: 5 }], []),
      metricas([], []),
    );
    expect(leituraComparacao(semBase)).toBe('Sem base de comparação no período anterior.');
  });
});
```

- [ ] **Step 2:** Rodar → **FALHA**. Implementar em `compare.ts`:

```ts
export type ProdutoComparado = {
  sku: string;
  nome: string;
  receitaAtual: number;
  receitaAnterior: number;
  situacao: 'subiu' | 'caiu' | 'estavel' | 'entrou' | 'saiu';
};

/** Interseção dos top produtos por sku (fallback: nome). Ordenado por receita atual desc. */
export function compararTopProdutos(atual: Metricas, anterior: Metricas): ProdutoComparado[] {
  const chave = (p: Metricas['topProdutos'][number]): string => p.sku || p.nome;
  const mapA = new Map(atual.topProdutos.map((p) => [chave(p), p]));
  const mapB = new Map(anterior.topProdutos.map((p) => [chave(p), p]));
  const out: ProdutoComparado[] = [];
  for (const k of new Set([...mapA.keys(), ...mapB.keys()])) {
    const a = mapA.get(k);
    const b = mapB.get(k);
    const receitaAtual = a?.receita ?? 0;
    const receitaAnterior = b?.receita ?? 0;
    const situacao: ProdutoComparado['situacao'] = !a
      ? 'saiu'
      : !b
        ? 'entrou'
        : receitaAtual > receitaAnterior
          ? 'subiu'
          : receitaAtual < receitaAnterior
            ? 'caiu'
            : 'estavel';
    const ref = (a ?? b)!;
    out.push({ sku: ref.sku, nome: ref.nome, receitaAtual, receitaAnterior, situacao });
  }
  return out.sort((x, y) => y.receitaAtual - x.receitaAtual || x.nome.localeCompare(y.nome, 'pt-BR'));
}

/** Uma frase determinística de leitura da comparação (sem IA — puro). */
export function leituraComparacao(comp: ComparacaoRelatorios): string {
  const pct = comp.totalVendas.deltaPct;
  if (pct === null) return 'Sem base de comparação no período anterior.';
  const fmt = (v: number): string => Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (pct > 0) {
    const top = [...comp.porCanal].sort((a, b) => b.delta.deltaAbs - a.delta.deltaAbs)[0];
    const sufixo = top && top.delta.deltaAbs > 0 ? `, puxado por ${top.canal}` : '';
    return `Crescimento de ${fmt(pct)}% nas vendas${sufixo}.`;
  }
  if (pct < 0) {
    const pior = [...comp.porCanal].sort((a, b) => a.delta.deltaAbs - b.delta.deltaAbs)[0];
    const sufixo = pior && pior.delta.deltaAbs < 0 ? `, com maior recuo em ${pior.canal}` : '';
    return `Queda de ${fmt(pct)}% nas vendas${sufixo}.`;
  }
  return 'Vendas estáveis em relação ao período anterior.';
}
```

Rodar → **PASSA**.

- [ ] **Step 3:** Atualizar `comparar/page.tsx`:

1. **Default b = done imediatamente anterior a a:**

```tsx
  let relA = null as Awaited<ReturnType<typeof getReportById>>;
  let relB = null as Awaited<ReturnType<typeof getReportById>>;
  if (searchParams.a) {
    relA = await getReportById(searchParams.a, access.orgId);
    if (relA) {
      relB =
        searchParams.b && searchParams.b !== searchParams.a
          ? await getReportById(searchParams.b, access.orgId)
          : await getDoneAnterior(access.orgId, relA.createdAt, relA.id);
    }
  }
```

(import `getDoneAnterior`; o link `comparar?a={id}` do relatório passa a funcionar sem escolher b na mão.) Passar `b={relB?.id ?? searchParams.b}` ao `CompararForm` para o select refletir o default.

2. **Leitura automática** acima da tabela, quando `comp`:

```tsx
<p className="text-sm text-white/90" data-testid="leitura-comparacao">
  {leituraComparacao(comp)}
</p>
```

3. **Δ em R$**: na tabela, coluna `Δ` passa a mostrar o badge de % E o valor absoluto para linhas monetárias: dentro do `<TD>` do Δ de Total/Ticket/Canais, acrescentar `<span className="ml-2 font-mono text-xs text-muted">{comp.totalVendas.deltaAbs >= 0 ? '+' : ''}{formatBRL(comp.totalVendas.deltaAbs)}</span>` (idem `ticketMedio` e `c.delta`).

4. **Seção top produtos**, após a tabela principal (quando `comp && relA?.metricas && relB?.metricas`):

```tsx
{(() => {
  const produtos = compararTopProdutos(relA.metricas, relB.metricas);
  if (produtos.length === 0) return null;
  const SITUACAO_LABEL = { subiu: '▲ subiu', caiu: '▼ caiu', estavel: '→ estável', entrou: '★ entrou', saiu: '— saiu' } as const;
  const SITUACAO_COR = { subiu: 'text-brand', caiu: 'text-red-400', estavel: 'text-muted', entrou: 'text-brand', saiu: 'text-dim' } as const;
  return (
    <Card className="!p-0" data-testid="comparacao-produtos">
      <Table>
        <THead>
          <TR>
            <TH>Produto</TH>
            <TH className="text-right">Receita (A)</TH>
            <TH className="text-right">Receita (B)</TH>
            <TH>Situação</TH>
          </TR>
        </THead>
        <TBody>
          {produtos.map((p) => (
            <TR key={p.sku || p.nome}>
              <TD>
                {p.nome} <span className="font-mono text-xs text-dim">{p.sku}</span>
              </TD>
              <TD numeric>{formatBRL(p.receitaAtual)}</TD>
              <TD numeric className="text-muted">{formatBRL(p.receitaAnterior)}</TD>
              <TD className={SITUACAO_COR[p.situacao]}>{SITUACAO_LABEL[p.situacao]}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
})()}
```

5. Ajustar a mensagem vazia: quando `searchParams.a` existe mas não há anterior → `'Este é o primeiro relatório concluído — não há período anterior para comparar.'` (manter as mensagens atuais para os outros casos).

- [ ] **Step 4:** Migrar `comparar-form.tsx` para os primitivos do DS mantendo `method="get"` e `data-testid="comparar-form"`:

```tsx
'use client';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';

type RelatorioOption = { id: string; label: string };

/** Form GET puro — a submissão recarrega a página com ?a=&b= (busca escopada por org no server). */
export function CompararForm({ relatorios, a, b }: { relatorios: RelatorioOption[]; a?: string; b?: string }) {
  return (
    <form method="get" data-testid="comparar-form" className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm text-muted">
        Período A
        <Select name="a" defaultValue={a ?? ''} className="min-w-[220px]">
          <option value="" disabled>
            Selecione…
          </option>
          {relatorios.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-muted">
        Período B <span className="text-dim">(vazio = anterior)</span>
        <Select name="b" defaultValue={b ?? ''} className="min-w-[220px]">
          <option value="">Automático (anterior)</option>
          {relatorios.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </Select>
      </label>
      <Button type="submit" variant="primary">
        Comparar
      </Button>
    </form>
  );
}
```

*(confirmar a prop de variant do `Button` do DS — a página do relatório usa `variant="secondary"`, logo `primary` deve existir; se o default já for primário, omitir a prop.)*

- [ ] **Step 5:** `npm run typecheck` + `npx vitest run` verdes. Smoke manual: `/dashboard/relatorios/comparar?a={id}` sem `b` compara com o anterior automaticamente; com 1 relatório só, mensagem honesta. **Commit:** `feat(g1): comparar v2 — default vs anterior, delta em reais, top produtos e leitura automatica`.

---

### Task 13: Revisão ampla final — retrocompat, E2E e self-review

**Files:** nenhum novo (correções pontuais permitidas em arquivos das tasks 1–12).

- [ ] **Step 1:** `npm run typecheck` + `npx vitest run` (suíte COMPLETA, com `DATABASE_URL_TEST`) → zero falhas.
- [ ] **Step 2:** E2E completo: `npx playwright test` → todos os specs verdes SEM nenhuma edição de spec. Se algum falhar, tratar como bug de implementação (systematic-debugging), nunca editar o spec.
- [ ] **Step 3:** Auditoria de retrocompat (checklist manual sobre um banco com um relatório PRÉ-G1 semeado — usar o shape `SAMPLE_METRICAS`/`SAMPLE_ANALISE` de `tests/e2e/relatorio-task.spec.ts`):
  - página do relatório antigo renderiza (hero com fallbacks, sem charts v2, 3 listas de recomendações com `virar-task-*`);
  - PDF do relatório antigo baixa sem erro (sem gauge, sem achados);
  - comparar antigo × antigo funciona;
  - `report-to-task` com fontes legadas continua criando tasks.
- [ ] **Step 4:** Auditoria de consistência de NOMES entre tasks (grep): `evolucaoDetalhada`, `canalPorDia`, `porDiaSemana`, `ticketPorCanal`, `curvaAbc`, `piores`, `frete`, `unidadesTotais`, `itensPorPedido`, `faixaMercado`, `achados`, `destaques`, `precoAtual`, `impactoEstimadoMensalBRL`, `comoFazer` — os MESMOS identificadores em contracts, compute-metrics, view-models, UI, PDF e prompt (o prompt envia `JSON.stringify(metricas)` — o nome do campo É a interface com a IA).
- [ ] **Step 5:** Grep de sobras: nenhum `TODO`/`FIXME`/placeholder introduzido; nenhum import órfão; `evolucao-chart.tsx` removido sem referência pendurada; nenhum `new Date()` cru formatado em client component novo.
- [ ] **Step 6:** Smoke de pipeline ponta a ponta em dev (org de teste com Bling mock ou dados semeados): gerar relatório → conferir `metricas` v2 no jsonb, `analise_ia.achados`, e-mail logado (modo no-op) com subject v2, PDF, comparar. Anotar custo/usage do relatório (visível via `reports.ia_usage` da G0) — esperado ~US$0,15–0,35.
- [ ] **Step 7:** Rodar a skill superpowers:requesting-code-review (revisão ampla da branch inteira vs master). Resolver críticos; documentar não-críticos como dívida.
- [ ] **Step 8:** **Commit final:** `chore(g1): revisao ampla — retrocompat, e2e e consistencia` e preparar merge `--no-ff` (decisão do dono).

## Self-review do plano (feito na escrita — não requer ação)

- **Cobertura:** as 12 tasks do escopo travado da auditoria (§4/G1) estão presentes (Tasks 1–12) + revisão final (13).
- **Retrocompat:** todo campo novo de jsonb é `.optional()`; arrays legados da IA continuam obrigatórios; UI/PDF/e-mail degradam com relatório antigo; E2E seeds (sem campos v2) exercitam o fallback.
- **Divergências deliberadas do escopo bruto (anotadas):** (a) o wiring do contexto no orquestrador ficou na Task 4 (junto da assinatura nova) para cada task terminar verde — a Task 5 ficou com finalize/e-mail/report-to-task; (b) `sendReportReadyEmail`/`reportReadyTemplate` mudam de assinatura na Task 5 com copy provisória e ganham a copy v2 na Task 11 (evita task não-atômica); (c) `piores`/`curvaAbc`/`frete` retornam `undefined` (campo omitido) em vez de estruturas vazias — empty-state honesto na UI.
- **Riscos apontados aos implementers:** drift da G0 em `analyze-ia.ts` (Task 4 tem instrução explícita); suporte a `Svg/Path` na versão instalada do `@react-pdf/renderer` (Task 10 Step 4 tem plano B); variants do `Badge`/`Button` (confirmar no DS antes de usar).

