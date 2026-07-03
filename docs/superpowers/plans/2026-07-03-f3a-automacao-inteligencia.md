# F3a — Automação & Inteligência Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Transformar o Truth Analytics de ferramenta manual em plataforma de inteligência contínua: (1) **cron diário** que gera relatórios sozinho quando o ciclo do plano vence (org pode desligar); (2) **Truth Score 0–100** (saúde da operação) calculado no pipeline, persistido no jsonb `metricas`, exibido como gauge hero no dashboard com delta e breakdown, e comentado pela IA; (3) **alertas proativos** (queda de vendas, concorrente abaixo do preço, produto parado) com cron de verificação diário, dedup, notificação in-app (F2 `notify`) + e-mail best-effort e UI de resolução; (4) **metas mensais** (`organizations.meta_mensal`) com barra de progresso no dashboard + **comparativo de 2 relatórios** lado a lado com deltas.

**Architecture:** Segue o padrão do repo (actions → repositories → steps/providers, contratos Zod nas fronteiras, funções puras testáveis separadas do I/O):

- **Scheduler** (`src/modules/scheduler/`): função pura `deveGerarAutomaticamente(org, agora)` + repository que lista orgs elegíveis (active + plano + Bling `status='ok'` + `geracao_automatica` + ciclo vencido). A rota `GET /api/cron/gerar-relatorios` (auth `Bearer CRON_SECRET`, padrão do watchdog F0) itera as orgs com espaçamento fixo e enfileira cada uma via helper `enqueueReport(orgId)` — que insere o `report` `queued` (o índice único parcial da F0 "1 queued/running por org" faz o lock; conflito = pula) e dispara `POST /api/pipeline/run` com `x-pipeline-secret`, aguardando só o `202`. O e-mail "relatório pronto" já sai do `finalize` existente — nada a fazer.
- **Truth Score** (`src/modules/pipeline/steps/truth-score.ts`): função pura `computeTruthScore(input)` com 5 fatores e pesos documentados; `computeMetrics` passa a carregar também o total do **período anterior** (mesma duração, imediatamente antes) e compõe `metricas.truth_score` — **sem migration de coluna** (vive no jsonb `metricas`; `MetricasSchema.truth_score` é `optional()` para retrocompat com relatórios antigos). O prompt da IA ganha instrução para comentar o score.
- **Alertas** (`src/modules/alerts/`): detectores **puros** (`detectarQuedaVendas`, `detectarConcorrenteAbaixo`, `detectarProdutoParado`) + `filtrarNaoDuplicados` puro (dedup por `chaveDedup` contra alertas abertos) + repositories de dados/persistência + rota `GET /api/cron/verificar-alertas`. Fontes de dados: `orders` (queda/parado) e `metricas.posicaoPreco` do último relatório done (concorrente) — sem nenhuma chamada externa nova. Notificação: F2 `notify(userId, {tipo,titulo,corpo,href})` + e-mail best-effort (padrão never-throw do módulo notifications).
- **Metas & comparativo**: `organizations.meta_mensal` (numeric, admin define no `/admin/[orgId]` da F1); dashboard soma `orders` do mês corrente (UTC, consistente com `evolucao`) e mostra barra com glow. Comparativo = funções puras em `src/modules/reports/compare.ts` + página `/dashboard/relatorios/comparar?a=&b=` (2 selects de relatórios done → métricas lado a lado com deltas %).

**Tech Stack:** Next.js 14 (App Router), Drizzle/Neon (`postgres.js`), Zod, Vercel Cron (`vercel.json` — **adicionar** entradas ao array `crons` criado pela F0, nunca sobrescrever), `recharts` (instalado pela F1) para o gauge, módulo notifications existente (Resend) + `notify` da F2, Vitest (unit + integration no branch Neon `test` via `DATABASE_URL_TEST`), Playwright E2E existente intocado.

## Global Constraints

- **Regra de ouro do roadmap:** antes de cada task, re-validar os trechos citados contra o `master` atual (F0/F1/F2 mudaram o terreno). Divergência pequena (nome de arquivo, assinatura levemente diferente) = ajustar inline; estrutural = parar e revisar. Em especial: a assinatura real de `generateReport`/rota `/api/pipeline/run` da F0 (este plano assume `POST {reportId}` → `202`), o componente de charts da F1 e o `notify` da F2.
- **Multi-tenancy inegociável:** todo repository filtra por `org_id`; `orgId` sempre vem da sessão (ou do loop do cron server-side), nunca de input do cliente. `resolverAlertaAction` valida `alertId` + `orgId` juntos.
- **Crons idempotentes e resilientes:** falha em UMA org não aborta o lote (try/catch por org + `logger` da F0); resposta JSON com resumo. Auth: `Authorization: Bearer ${CRON_SECRET}` (mesmo padrão do watchdog F0); sem o header → 401 sem detalhe.
- **E-mail/notify best-effort:** nunca lançam, nunca quebram cron/pipeline (padrão já estabelecido em `src/modules/notifications/email.ts`).
- **Funções de negócio = puras:** Truth Score, detectores de alerta, dedup, elegibilidade do scheduler, progresso de meta e comparadores não fazem I/O — testes de tabela com números concretos.
- **Retrocompat do jsonb:** relatórios antigos não têm `truth_score` — todo consumidor trata `undefined` (schema `optional()`, UI condicional).
- **Sem libs novas.** `sleep` local (não importar p-limit externo; F0 já criou `src/lib/p-limit.ts` se precisar).
- **Convenções:** copy pt-BR, commits pt (`feat:`/`fix:`/`chore:`), `tests/setup.ts` intocável, `describe.skipIf(!process.env.DATABASE_URL_TEST)` nos testes de integração com cleanup em `finally`.
- **Branch:** `feat/f3a-automacao-inteligencia` a partir de `master`. Merge `--no-ff` só após revisão ampla (Task 12).

## Constantes de negócio (decididas AQUI — não rediscutir)

| Constante | Valor | Significado |
|---|---|---|
| Pesos do Truth Score | 25/25/20/20/10 | crescimento / posição de preço / diversificação / regularidade / cobertura |
| `QUEDA_VENDAS_LIMIAR` | `0.5` | alerta se total 7d < 50% da média semanal das 4 semanas anteriores |
| `QUEDA_VENDAS_CRITICO` | `0.3` | severidade `critico` se < 30% |
| `QUEDA_BASE_MINIMA_SEMANAL` | `100` | média semanal < R$ 100 = base ruidosa, não alerta |
| `CONCORRENTE_MARGEM_MINIMA` | `0.05` | alerta se mediana de mercado ≥ 5% abaixo do nosso preço |
| `CONCORRENTE_CRITICO_PCT` | `15` | diferença ≥ 15% = severidade `critico` |
| `PRODUTO_PARADO_DIAS` | `14` | produto monitorado sem venda há 14+ dias |
| `PRODUTO_HISTORICO_DIAS` | `90` | só alerta produto que vendeu ao menos 1x nos últimos 90 dias |
| `JANELA_RELATORIO_RECENTE_DIAS` | `45` | alertas só p/ orgs com relatório done nos últimos 45 dias |
| `LOTE_MAXIMO_POR_EXECUCAO` | `20` | máx. de orgs enfileiradas por execução do cron diário |
| `ESPACAMENTO_ENTRE_ORGS_MS` | `2000` | espaçamento entre disparos (rate limits Bling/SerpAPI/Claude) |

## File Structure

| Caminho | Ação | Responsabilidade |
|---|---|---|
| `src/db/schema/organizations.ts` | mod | + `geracao_automatica` bool default true, + `meta_mensal` numeric(12,2) null |
| `src/db/schema/alerts.ts` | criar | tabela `alerts` + CHECKs + índice |
| `src/db/schema/index.ts` | mod | export alerts |
| `src/db/migrations/*` | gerar | `npm run db:generate` |
| `src/modules/pipeline/contracts.ts` | mod | `TruthScoreSchema` + `Metricas.truth_score` optional |
| `src/modules/pipeline/steps/truth-score.ts` | criar | `computeTruthScore` puro |
| `src/modules/pipeline/steps/compute-metrics.ts` | mod | período anterior + compõe `truth_score` |
| `src/modules/pipeline/steps/analyze-ia.ts` | mod | prompt comenta o score |
| `src/modules/pipeline/enqueue.ts` | criar | `enqueueReport(orgId)` (insert queued + POST pipeline/run) |
| `src/modules/scheduler/scheduler.service.ts` | criar | `deveGerarAutomaticamente` puro + constantes |
| `src/modules/scheduler/scheduler.repository.ts` | criar | `listOrgsElegiveisParaGeracao` |
| `src/app/api/cron/gerar-relatorios/route.ts` | criar | cron diário de geração |
| `src/app/api/cron/verificar-alertas/route.ts` | criar | cron diário de alertas |
| `vercel.json` | mod | + 2 crons (preservar watchdog F0) |
| `src/modules/alerts/alerts.constants.ts` | criar | thresholds documentados |
| `src/modules/alerts/alert-detectors.ts` | criar | detectores puros + dedup puro |
| `src/modules/alerts/alert.repository.ts` | criar | criar/listar/resolver alertas |
| `src/modules/alerts/alert-data.repository.ts` | criar | totais semanais, última venda por sku, posição de preço do último done, orgs com relatório recente |
| `src/modules/notifications/templates.ts` | mod | + `alertaTemplate` |
| `src/modules/notifications/email.ts` | mod | + `sendAlertaEmail` |
| `src/modules/notifications/recipients.ts` | mod | + `getOrgPrimaryUser` |
| `src/modules/organizations/organization-settings.repository.ts` | criar | `setGeracaoAutomatica`, `setMetaMensal`, `getTotalVendasMesCorrente` |
| `src/modules/reports/report.repository.ts` | mod | + `listDoneReports`, `getUltimosDoneDetalhados` |
| `src/modules/reports/compare.ts` | criar | `deltaNumero`, `compararMetricas`, `progressoMeta` puros |
| `src/actions/connections.actions.ts` | mod | + `toggleGeracaoAutomaticaAction` |
| `src/actions/alerts.actions.ts` | criar | `resolverAlertaAction` |
| `src/actions/admin.actions.ts` | mod | + `setMetaMensalAction` |
| `src/components/ui/charts/ScoreGauge.tsx` | criar | gauge radial do score (recharts) |
| `src/app/(client)/dashboard/page.tsx` | mod | score hero + alertas + meta + link comparar |
| `src/app/(client)/dashboard/truth-score-card.tsx` | criar | card do score (gauge + delta) |
| `src/app/(client)/dashboard/alertas-section.tsx` | criar | lista de alertas + resolver |
| `src/app/(client)/dashboard/meta-progress.tsx` | criar | barra de meta com glow |
| `src/app/(client)/dashboard/relatorios/[id]/page.tsx` | mod | breakdown do score + link comparar |
| `src/app/(client)/dashboard/relatorios/comparar/page.tsx` | criar | comparativo lado a lado |
| `src/app/(client)/conexoes/page.tsx` | mod | card Preferências (toggle) |
| `src/app/(client)/conexoes/geracao-automatica-toggle.tsx` | criar | toggle client |
| `src/app/admin/[orgId]/*` (F1) | mod | campo meta mensal |
| `src/lib/env.ts` | mod | garantir `CRON_SECRET`/`PIPELINE_SECRET` (F0 já deve ter) |
| `tests/unit/*`, `tests/integration/*` | criar | ver tasks |

---

### Task 1: Schema — `geracao_automatica`, `meta_mensal`, tabela `alerts` + migration

**Files:** Modify `src/db/schema/organizations.ts`, `src/db/schema/index.ts`; Create `src/db/schema/alerts.ts`; Generate migration em `src/db/migrations/`.

**Interfaces (Produces):**
- `organizations`: + `geracao_automatica: boolean('geracao_automatica').notNull().default(true)`; + `meta_mensal: numeric('meta_mensal', { precision: 12, scale: 2 })` (nullable).
- `alerts`: colunas `id uuid pk`, `org_id uuid fk`, `tipo varchar(32) CHECK IN ('queda_vendas','concorrente_preco','produto_parado')`, `severidade varchar(16) default 'atencao' CHECK IN ('atencao','critico')`, `titulo varchar(255)`, `corpo text`, `dados jsonb default {}`, `resolvido boolean default false`, `resolvido_em timestamptz null`, `created_at timestamptz default now()`; índice `alerts_org_abertos_idx (org_id, resolvido, created_at)`.
- Tipos: `AlertRecord`, `NewAlertRecord`.

- [ ] **Step 1:** Editar `src/db/schema/organizations.ts` — adicionar após `proximo_relatorio_liberado_em`:

```ts
  geracao_automatica: boolean('geracao_automatica').notNull().default(true),
  meta_mensal: numeric('meta_mensal', { precision: 12, scale: 2 }),
```

(adicionar `boolean, numeric` ao import de `drizzle-orm/pg-core`).

- [ ] **Step 2:** Criar `src/db/schema/alerts.ts`:

```ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    org_id: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    tipo: varchar('tipo', { length: 32 }).notNull(),
    severidade: varchar('severidade', { length: 16 }).notNull().default('atencao'),
    titulo: varchar('titulo', { length: 255 }).notNull(),
    corpo: text('corpo').notNull(),
    dados: jsonb('dados').notNull().default({}),
    resolvido: boolean('resolvido').notNull().default(false),
    resolvido_em: timestamp('resolvido_em', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    org_abertos_idx: index('alerts_org_abertos_idx').on(t.org_id, t.resolvido, t.created_at),
    tipo_check: check(
      'alerts_tipo_check',
      sql`${t.tipo} IN ('queda_vendas', 'concorrente_preco', 'produto_parado')`,
    ),
    severidade_check: check(
      'alerts_severidade_check',
      sql`${t.severidade} IN ('atencao', 'critico')`,
    ),
  }),
);

export type AlertRecord = typeof alerts.$inferSelect;
export type NewAlertRecord = typeof alerts.$inferInsert;
```

Nota: a F0 já converteu enums para CHECK — usar o MESMO mecanismo que ela adotou; se a versão do drizzle no repo não expor `check()`, declarar a tabela sem os checks e acrescentar `ALTER TABLE "alerts" ADD CONSTRAINT ...` manualmente no SQL da migration gerada.

- [ ] **Step 3:** `src/db/schema/index.ts` — adicionar `export * from './alerts';`.
- [ ] **Step 4:** `npm run db:generate` → nova migration em `src/db/migrations/` com `ALTER TABLE organizations ADD COLUMN ...` + `CREATE TABLE alerts ...`. Revisar o SQL gerado (sem DROP inesperado). `npm run db:migrate` (dev) e aplicar também no branch `test` conforme o fluxo existente do repo.
- [ ] **Step 5:** `npm run typecheck` e `npx vitest run` → suíte existente verde (nenhum teste novo nesta task; mudança é aditiva). **Commit:** `feat(f3a): schema geracao_automatica + meta_mensal + tabela alerts`.

---

### Task 2: Truth Score — contrato Zod + função pura com testes de tabela

**Files:** Modify `src/modules/pipeline/contracts.ts`; Create `src/modules/pipeline/steps/truth-score.ts`; Test `tests/unit/truth-score.test.ts`.

**Interfaces (Produces):**

- `contracts.ts`:

```ts
export const TruthScoreSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    totalPeriodo: z.number(),
    totalPeriodoAnterior: z.number().nullable(),
    fatores: z
      .object({
        crescimento: z
          .object({ pontos: z.number(), max: z.number(), variacaoPercentual: z.number().nullable() })
          .strict(),
        posicaoPreco: z
          .object({ pontos: z.number(), max: z.number(), itensAvaliados: z.number() })
          .strict(),
        diversificacao: z
          .object({ pontos: z.number(), max: z.number(), canaisComVenda: z.number() })
          .strict(),
        regularidade: z
          .object({ pontos: z.number(), max: z.number(), diasComVenda: z.number(), diasPeriodo: z.number() })
          .strict(),
        cobertura: z
          .object({ pontos: z.number(), max: z.number(), produtosComBenchmark: z.number(), produtosAvaliados: z.number() })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type TruthScore = z.infer<typeof TruthScoreSchema>;
```

e dentro de `MetricasSchema` (antes de `benchmarkParcial`): `truth_score: TruthScoreSchema.optional(),` — **optional = retrocompat** com jsonb de relatórios antigos.

- `truth-score.ts`:

```ts
export type TruthScoreInput = {
  totalPeriodo: number;
  /** null = sem base de comparação (primeiro relatório da org) */
  totalPeriodoAnterior: number | null;
  vendasPorCanal: Metricas['vendasPorCanal'];
  evolucao: Metricas['evolucao'];
  posicaoPreco: Metricas['posicaoPreco'];
  diasPeriodo: number;
};

export function computeTruthScore(input: TruthScoreInput): TruthScore;
```

**Pesos e regras (documentar no JSDoc da função, exatamente assim):**
1. **Crescimento (25 pts):** `variacao = (totalPeriodo − totalPeriodoAnterior) / totalPeriodoAnterior`. Escala linear: −20% → 0 pts, 0% → ~13, +20% ou mais → 25. Fórmula: `clamp(round(((variacao + 0.2) / 0.4) * 25), 0, 25)`. Sem base (`null` ou anterior ≤ 0) → **15 pts neutros**, `variacaoPercentual: null`.
2. **Posição de preço (25 pts):** itens avaliáveis = `nossoPreco > 0 && precoMercadoMediano > 0`. Peso por item: `ratio = nossoPreco/mediano`; `ratio ≤ 1.05` → 1.0 (competitivo); `≤ 1.20` → 0.6; `> 1.20` → 0.2. Pontos = `round(média * 25)`. 0 itens avaliáveis → **15 neutros**.
3. **Diversificação de canais (20 pts):** canais com `total > 0`: 0 → 0; 1 → 8; 2 → 14; 3+ → 20.
4. **Regularidade (20 pts):** `diasComVenda` = entradas de `evolucao` com `total > 0`; pontos = `clamp(round((diasComVenda/diasPeriodo) * 20), 0, 20)`; `diasPeriodo ≤ 0` → 0.
5. **Cobertura de benchmark (10 pts):** `produtosComBenchmark` = itens de `posicaoPreco` com `precoMercadoMediano > 0`; pontos = `round((comBenchmark/avaliados) * 10)`; 0 produtos monitorados → **5 neutros**.

`score` = soma dos 5 (inteiro 0–100 por construção). `variacaoPercentual` = `round(variacao * 10000) / 100` (2 casas).

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/truth-score.test.ts` com testes de tabela:

```ts
import { describe, expect, it } from 'vitest';

import { computeTruthScore, type TruthScoreInput } from '@/modules/pipeline/steps/truth-score';

function base(overrides: Partial<TruthScoreInput>): TruthScoreInput {
  return {
    totalPeriodo: 0,
    totalPeriodoAnterior: null,
    vendasPorCanal: [],
    evolucao: [],
    posicaoPreco: [],
    diasPeriodo: 30,
    ...overrides,
  };
}

describe('computeTruthScore — tabela de cenários', () => {
  it('operação saudável → 91', () => {
    const r = computeTruthScore(base({
      totalPeriodo: 12000,
      totalPeriodoAnterior: 10000, // +20% → 25
      posicaoPreco: [
        { sku: 'A', nome: 'A', nossoPreco: 100, precoMercadoMediano: 105, fonte: 'ml_publico' }, // 0.952 → 1.0
        { sku: 'B', nome: 'B', nossoPreco: 110, precoMercadoMediano: 100, fonte: 'ml_publico' }, // 1.10 → 0.6
      ], // média 0.8 → 20; cobertura 2/2 → 10
      vendasPorCanal: [
        { canal: 'mercado_livre', total: 8000, pedidos: 80 },
        { canal: 'shopee', total: 3000, pedidos: 40 },
        { canal: 'site', total: 1000, pedidos: 10 },
      ], // 3 canais → 20
      evolucao: Array.from({ length: 24 }, (_, i) => ({
        data: `2026-06-${String(i + 1).padStart(2, '0')}`,
        total: 500,
      })), // 24/30 → 16
    }));
    expect(r.score).toBe(91); // 25+20+20+16+10
    expect(r.fatores.crescimento).toEqual({ pontos: 25, max: 25, variacaoPercentual: 20 });
    expect(r.fatores.posicaoPreco).toEqual({ pontos: 20, max: 25, itensAvaliados: 2 });
    expect(r.fatores.diversificacao).toEqual({ pontos: 20, max: 20, canaisComVenda: 3 });
    expect(r.fatores.regularidade).toEqual({ pontos: 16, max: 20, diasComVenda: 24, diasPeriodo: 30 });
    expect(r.fatores.cobertura).toEqual({ pontos: 10, max: 10, produtosComBenchmark: 2, produtosAvaliados: 2 });
  });

  it('primeiro relatório (sem base, sem benchmark, 1 canal) → 50 neutro', () => {
    const r = computeTruthScore(base({
      totalPeriodo: 5000,
      totalPeriodoAnterior: null, // neutro 15
      vendasPorCanal: [{ canal: 'mercado_livre', total: 5000, pedidos: 30 }], // 8
      evolucao: Array.from({ length: 10 }, (_, i) => ({ data: `2026-06-1${i}`, total: 500 })), // round(10/30*20)=7
      posicaoPreco: [], // preço neutro 15; cobertura neutra 5
    }));
    expect(r.score).toBe(50); // 15+15+8+7+5
    expect(r.fatores.crescimento.variacaoPercentual).toBeNull();
  });

  it('operação em queda forte → 26', () => {
    const r = computeTruthScore(base({
      totalPeriodo: 4000,
      totalPeriodoAnterior: 10000, // -60% → clamp 0
      posicaoPreco: [{ sku: 'A', nome: 'A', nossoPreco: 150, precoMercadoMediano: 100, fonte: 'serpapi' }], // 1.5 → 0.2 → 5; cobertura 1/1 → 10
      vendasPorCanal: [{ canal: 'mercado_livre', total: 4000, pedidos: 20 }], // 8
      evolucao: Array.from({ length: 5 }, (_, i) => ({ data: `2026-06-0${i + 1}`, total: 800 })), // round(5/30*20)=3
    }));
    expect(r.score).toBe(26); // 0+5+8+3+10
  });

  it('zero vendas no período (com benchmark coletado) → 25', () => {
    const r = computeTruthScore(base({
      totalPeriodo: 0,
      totalPeriodoAnterior: 5000, // -100% → 0
      posicaoPreco: [{ sku: 'A', nome: 'A', nossoPreco: 0, precoMercadoMediano: 90, fonte: 'ml_publico' }],
      // nossoPreco=0 → 0 itens avaliáveis → preço neutro 15; cobertura 1/1 → 10
    }));
    expect(r.score).toBe(25); // 0+15+0+0+10
    expect(r.fatores.posicaoPreco.itensAvaliados).toBe(0);
  });

  it('anterior = 0 → crescimento neutro (não divide por zero)', () => {
    const r = computeTruthScore(base({ totalPeriodo: 1000, totalPeriodoAnterior: 0 }));
    expect(r.fatores.crescimento).toEqual({ pontos: 15, max: 25, variacaoPercentual: null });
  });

  it('crescimento 0% → 13 pts (round de 12.5)', () => {
    const r = computeTruthScore(base({ totalPeriodo: 10000, totalPeriodoAnterior: 10000 }));
    expect(r.fatores.crescimento.pontos).toBe(13);
    expect(r.fatores.crescimento.variacaoPercentual).toBe(0);
  });
});
```

Rodar `npx vitest run tests/unit/truth-score.test.ts` → **FALHA** com `Cannot find module '@/modules/pipeline/steps/truth-score'` (ou equivalente). Saída esperada: `Test Files  1 failed (1)`.

- [ ] **Step 2:** Adicionar `TruthScoreSchema`/`TruthScore` em `contracts.ts` (declarar ACIMA de `MetricasSchema`) e o campo `truth_score: TruthScoreSchema.optional()` dentro de `MetricasSchema`.
- [ ] **Step 3:** Implementar `src/modules/pipeline/steps/truth-score.ts`:

```ts
import type { Metricas, TruthScore } from '@/modules/pipeline/contracts';

export type TruthScoreInput = {
  totalPeriodo: number;
  /** null = sem base de comparação (primeiro relatório da org) */
  totalPeriodoAnterior: number | null;
  vendasPorCanal: Metricas['vendasPorCanal'];
  evolucao: Metricas['evolucao'];
  posicaoPreco: Metricas['posicaoPreco'];
  diasPeriodo: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Truth Score 0–100 — saúde da operação. Pesos:
 *  - crescimento vs período anterior ....... 25 (−20%→0, 0%→13, +20%→25; sem base → 15 neutros)
 *  - posição de preço vs mercado ........... 25 (ratio ≤1.05→1.0, ≤1.20→0.6, >1.20→0.2; sem itens → 15)
 *  - diversificação de canais .............. 20 (0→0, 1→8, 2→14, 3+→20)
 *  - regularidade de vendas ................ 20 (dias com venda / dias do período)
 *  - cobertura de benchmark ................ 10 (produtos com mediana de mercado / monitorados; sem produtos → 5)
 * Função pura — sem I/O.
 */
export function computeTruthScore(input: TruthScoreInput): TruthScore {
  // 1. Crescimento (25)
  let variacaoPercentual: number | null = null;
  let crescimentoPts = 15;
  if (input.totalPeriodoAnterior !== null && input.totalPeriodoAnterior > 0) {
    const variacao = (input.totalPeriodo - input.totalPeriodoAnterior) / input.totalPeriodoAnterior;
    variacaoPercentual = Math.round(variacao * 10000) / 100;
    crescimentoPts = clamp(Math.round(((variacao + 0.2) / 0.4) * 25), 0, 25);
  }

  // 2. Posição de preço (25)
  const avaliaveis = input.posicaoPreco.filter((p) => p.nossoPreco > 0 && p.precoMercadoMediano > 0);
  let precoPts = 15;
  if (avaliaveis.length > 0) {
    const soma = avaliaveis.reduce((acc, p) => {
      const ratio = p.nossoPreco / p.precoMercadoMediano;
      return acc + (ratio <= 1.05 ? 1 : ratio <= 1.2 ? 0.6 : 0.2);
    }, 0);
    precoPts = clamp(Math.round((soma / avaliaveis.length) * 25), 0, 25);
  }

  // 3. Diversificação de canais (20)
  const canaisComVenda = input.vendasPorCanal.filter((c) => c.total > 0).length;
  const diversificacaoPts =
    canaisComVenda === 0 ? 0 : canaisComVenda === 1 ? 8 : canaisComVenda === 2 ? 14 : 20;

  // 4. Regularidade (20)
  const diasComVenda = input.evolucao.filter((e) => e.total > 0).length;
  const regularidadePts =
    input.diasPeriodo <= 0 ? 0 : clamp(Math.round((diasComVenda / input.diasPeriodo) * 20), 0, 20);

  // 5. Cobertura de benchmark (10)
  const produtosAvaliados = input.posicaoPreco.length;
  const produtosComBenchmark = input.posicaoPreco.filter((p) => p.precoMercadoMediano > 0).length;
  const coberturaPts =
    produtosAvaliados === 0
      ? 5
      : clamp(Math.round((produtosComBenchmark / produtosAvaliados) * 10), 0, 10);

  return {
    score: crescimentoPts + precoPts + diversificacaoPts + regularidadePts + coberturaPts,
    totalPeriodo: input.totalPeriodo,
    totalPeriodoAnterior: input.totalPeriodoAnterior,
    fatores: {
      crescimento: { pontos: crescimentoPts, max: 25, variacaoPercentual },
      posicaoPreco: { pontos: precoPts, max: 25, itensAvaliados: avaliaveis.length },
      diversificacao: { pontos: diversificacaoPts, max: 20, canaisComVenda },
      regularidade: { pontos: regularidadePts, max: 20, diasComVenda, diasPeriodo: input.diasPeriodo },
      cobertura: { pontos: coberturaPts, max: 10, produtosComBenchmark, produtosAvaliados },
    },
  };
}
```

- [ ] **Step 4:** `npx vitest run tests/unit/truth-score.test.ts` → **6 passed**. Depois `npx vitest run` (suíte inteira) + `npm run typecheck` verdes (o `optional()` não quebra `MetricasSchema.parse` existente).
- [ ] **Step 5:** **Commit:** `feat(f3a): truth score 0-100 como função pura (pesos 25/25/20/20/10) + contrato`.

---

### Task 3: Truth Score no pipeline — período anterior em `computeMetrics` + prompt da IA

**Files:** Modify `src/modules/pipeline/steps/compute-metrics.ts`, `src/modules/pipeline/steps/analyze-ia.ts`; Test `tests/integration/compute-metrics-score.test.ts`.

**Interfaces:**
- `computeMetrics(orgId, reportId, periodo, benchmarkParcialOverride?)` — assinatura pública **inalterada**; internamente calcula `totalPeriodo`, `totalPeriodoAnterior` (null quando a org não tem nenhum report `done` anterior — primeiro relatório não é punido por falta de base) e `diasPeriodo`, e compõe `metricas.truth_score` antes do `MetricasSchema.parse`.
- `analyze-ia.ts` — `buildSystemPrompt(benchmarkParcial: boolean, truthScore?: number)`.

- [ ] **Step 1 (teste falha):** Criar `tests/integration/compute-metrics-score.test.ts` (`describe.skipIf(!process.env.DATABASE_URL_TEST)`), seguindo o padrão de seed/cleanup dos testes de integração existentes de `computeMetrics`:
  - **Cenário A (sem report done anterior):** seed org + 3 orders no período (100 + 200 + 300) → `computeMetrics` retorna `metricas.truth_score` definido com `totalPeriodo: 600`, `totalPeriodoAnterior: null`, `fatores.crescimento.pontos: 15`.
  - **Cenário B (com report done anterior):** seed adicional de 1 report `status: 'done'` antigo + orders no período anterior somando 500 → novo `computeMetrics` retorna `totalPeriodoAnterior: 500` e `fatores.crescimento.variacaoPercentual: 20` (600 vs 500).
  - Cleanup (`reports`, `orders`, `organizations`) em `finally`.

  `npx vitest run tests/integration/compute-metrics-score.test.ts` → **FALHA** (`truth_score` é `undefined`).
- [ ] **Step 2:** Implementar em `compute-metrics.ts` — adicionar `ne` ao import do drizzle, `reports` ao import do schema e `computeTruthScore` de `./truth-score`; após carregar `rawOrders/rawSnapshots/rawProducts`:

```ts
  // Truth Score — total do período anterior (mesma duração, imediatamente antes)
  const duracaoMs = periodo.fim.getTime() - periodo.inicio.getTime();
  const inicioAnterior = new Date(periodo.inicio.getTime() - duracaoMs);
  const [temDoneAnterior] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done'), ne(reports.id, reportId)))
    .limit(1);

  let totalPeriodoAnterior: number | null = null;
  if (temDoneAnterior) {
    const anteriores = await db
      .select({ valor_total: orders.valor_total })
      .from(orders)
      .where(
        and(eq(orders.org_id, orgId), between(orders.data, inicioAnterior, periodo.inicio)),
      );
    totalPeriodoAnterior =
      Math.round(anteriores.reduce((acc, o) => acc + Number(o.valor_total), 0) * 100) / 100;
  }
  const diasPeriodo = Math.max(1, Math.round(duracaoMs / 86_400_000));
```

e trocar a composição final por:

```ts
  const vendas = vendasPorCanal(orderRows);
  const evolucaoDias = evolucao(orderRows);
  const posicao = posicaoPreco(productRows, snapshotRows, orderRows);
  const totalPeriodo = Math.round(orderRows.reduce((acc, o) => acc + o.valor_total, 0) * 100) / 100;

  const metricas: Metricas = {
    vendasPorCanal: vendas,
    evolucao: evolucaoDias,
    ticketMedio: ticketMedio(orderRows),
    topProdutos: topProdutos(orderRows),
    posicaoPreco: posicao,
    truth_score: computeTruthScore({
      totalPeriodo,
      totalPeriodoAnterior,
      vendasPorCanal: vendas,
      evolucao: evolucaoDias,
      posicaoPreco: posicao,
      diasPeriodo,
    }),
    benchmarkParcial,
  };
```

- [ ] **Step 3:** `analyze-ia.ts` — estender `buildSystemPrompt`:

```ts
function buildSystemPrompt(benchmarkParcial: boolean, truthScore?: number): string {
  const aviso = benchmarkParcial
    ? // ... texto existente INALTERADO ...
    : '';

  const scoreTexto =
    truthScore === undefined
      ? ''
      : `\n\nAs métricas incluem um "truth_score" (${truthScore}/100) — índice de saúde da operação composto por: crescimento vs período anterior, posição de preço vs mercado, diversificação de canais, regularidade de vendas e cobertura de benchmark (detalhes no campo "fatores"). No resumoExecutivo, comente o score e cite os fatores mais fracos; conecte gargalos e sugestoesMelhoria aos fatores que mais penalizaram o score.`;

  return `Você é um analista sênior ... ${'/* template existente */'} ...${aviso}${scoreTexto}

Responda EXCLUSIVAMENTE com um objeto JSON válido conforme o schema fornecido. Não inclua texto fora do JSON.`;
}
```

(concretamente: só inserir `${scoreTexto}` logo após `${aviso}` no template já existente e declarar `scoreTexto`; nada mais muda). No `analyzeWithIA`: `const system = buildSystemPrompt(metricas.benchmarkParcial, metricas.truth_score?.score);`.
- [ ] **Step 4:** `npx vitest run tests/integration/compute-metrics-score.test.ts` → **2 passed**. `npx vitest run` inteira verde — se algum teste existente de `computeMetrics` usar `toEqual` no objeto `Metricas` completo, atualizar o esperado incluindo o novo `truth_score` (com os valores concretos do cenário do teste).
- [ ] **Step 5:** `npm run typecheck`. **Commit:** `feat(f3a): truth_score computado no pipeline (período anterior) e comentado pela IA`.

---

### Task 4: Truth Score na UI — gauge hero no dashboard + breakdown no relatório

**Files:** Create `src/components/ui/charts/ScoreGauge.tsx`, `src/app/(client)/dashboard/truth-score-card.tsx`; Modify `src/modules/reports/report.repository.ts`, `src/app/(client)/dashboard/page.tsx`, `src/app/(client)/dashboard/relatorios/[id]/page.tsx`. Test: `tests/integration/report-repository-done.test.ts`.

**Interfaces (Produces):**
- `report.repository.ts`:

```ts
/** Últimos relatórios done COM métricas (mais recente primeiro). Para score hero + delta. */
export async function getUltimosDoneDetalhados(orgId: string, limite = 2): Promise<ReportDetail[]>;

/** Summaries só de relatórios done (p/ selects do comparativo). Limit 50. */
export async function listDoneReports(orgId: string): Promise<ReportSummary[]>;
```

Implementação: mesma forma dos métodos existentes, acrescentando `eq(reports.status, 'done')` no `and()` e `.limit(...)`. (Pós-F0 `listReports` seleciona só colunas de summary — seguir o padrão que estiver no master; `getUltimosDoneDetalhados` precisa de `metricas`.)
- `ScoreGauge.tsx` (client component, recharts da F1):

```tsx
'use client';

import { PolarAngleAxis, RadialBar, RadialBarChart, ResponsiveContainer } from 'recharts';

export function ScoreGauge({ score, size = 180 }: { score: number; size?: number }) {
  const cor = score >= 70 ? '#07dd2b' : score >= 40 ? '#eab308' : '#ef4444';
  return (
    <div className="relative" style={{ width: size, height: size }} data-testid="score-gauge">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="78%"
          outerRadius="100%"
          data={[{ value: score }]}
          startAngle={225}
          endAngle={-45}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
          <RadialBar dataKey="value" angleAxisId={0} fill={cor} background={{ fill: '#ffffff0f' }} cornerRadius={8} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-bold text-white" style={{ textShadow: `0 0 24px ${cor}66` }}>
          {score}
        </span>
        <span className="text-xs text-muted">/ 100</span>
      </div>
    </div>
  );
}
```

- `truth-score-card.tsx` (server component; recebe os 2 últimos done):

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { ScoreGauge } from '@/components/ui/charts/ScoreGauge';
import type { ReportDetail } from '@/modules/reports/report.types';

export function TruthScoreCard({ atual, anterior }: { atual: ReportDetail | null; anterior: ReportDetail | null }) {
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
        <div className="space-y-1">
          <p className="text-sm text-muted">Saúde da operação no último relatório.</p>
          {delta !== null && (
            <p className={`text-sm font-medium ${delta >= 0 ? 'text-brand' : 'text-red-400'}`} data-testid="score-delta">
              {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{delta} vs relatório anterior
            </p>
          )}
          <a href={atual ? `/dashboard/relatorios/${atual.id}` : '#'} className="text-sm text-brand hover:underline">
            Ver breakdown →
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
```

- **Dashboard** (`page.tsx`): adicionar `getUltimosDoneDetalhados(access.orgId, 2)` ao `Promise.all` e renderizar `<TruthScoreCard atual={dones[0] ?? null} anterior={dones[1] ?? null} />` como PRIMEIRO card (hero), antes de "Gerar relatório". (Pós-F1 o dashboard é bento grid — inserir o card no slot hero conforme o layout que estiver no master, mantendo testids existentes.)
- **Detalhe do relatório** (`relatorios/[id]/page.tsx`): seção "Truth Score" quando `metricas?.truth_score` existir — gauge + tabela/barras dos 5 fatores:

```tsx
{detail.metricas?.truth_score && (
  <section data-testid="score-breakdown" className="space-y-3">
    <h2 className="font-heading text-base font-semibold text-white">Truth Score</h2>
    <Card>
      <CardContent className="flex flex-wrap items-center gap-8">
        <ScoreGauge score={detail.metricas.truth_score.score} />
        <div className="min-w-[260px] flex-1 space-y-2">
          {([
            ['Crescimento', detail.metricas.truth_score.fatores.crescimento],
            ['Posição de preço', detail.metricas.truth_score.fatores.posicaoPreco],
            ['Diversificação de canais', detail.metricas.truth_score.fatores.diversificacao],
            ['Regularidade de vendas', detail.metricas.truth_score.fatores.regularidade],
            ['Cobertura de benchmark', detail.metricas.truth_score.fatores.cobertura],
          ] as const).map(([label, fator]) => (
            <div key={label}>
              <div className="flex justify-between text-sm">
                <span className="text-muted">{label}</span>
                <span className="font-mono text-white">{fator.pontos}/{fator.max}</span>
              </div>
              <div className="h-1.5 rounded bg-white/5">
                <div
                  className="h-1.5 rounded bg-brand"
                  style={{ width: `${(fator.pontos / fator.max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  </section>
)}
```

- [ ] **Step 1 (teste falha):** `tests/integration/report-repository-done.test.ts` (`describe.skipIf`): seed org + 3 reports (2 `done` com `metricas` mínimas válidas incluindo `truth_score`, 1 `failed`) → `listDoneReports` retorna 2 summaries (mais recente primeiro); `getUltimosDoneDetalhados(orgId, 2)` retorna 2 detalhes com `metricas.truth_score.score` preenchido; org alheia → `[]` (isolamento). Cleanup em `finally`. `npx vitest run tests/integration/report-repository-done.test.ts` → **FALHA** (funções não existem).
- [ ] **Step 2:** Implementar as 2 funções no `report.repository.ts`; rodar o teste → **passa**.
- [ ] **Step 3:** Criar `ScoreGauge.tsx` e `truth-score-card.tsx`; integrar no dashboard e no detalhe do relatório (código acima, adaptando nomes reais pós-F1 — ex.: `detail` é a variável da página existente).
- [ ] **Step 4:** `npm run typecheck` + `npm run build` + `npx vitest run` verdes; smoke manual (`npm run dev`): dashboard sem relatório done não quebra (card some); relatório antigo sem `truth_score` não quebra (seções condicionais).
- [ ] **Step 5:** **Commit:** `feat(f3a): gauge do truth score no dashboard + breakdown por fator no relatório`.

---

### Task 5: Cron de geração automática — `enqueueReport` + scheduler + rota + `vercel.json`

**Files:** Create `src/modules/pipeline/enqueue.ts`, `src/modules/scheduler/scheduler.service.ts`, `src/modules/scheduler/scheduler.repository.ts`, `src/app/api/cron/gerar-relatorios/route.ts`; Modify `vercel.json`, `src/lib/env.ts` (se necessário); Test `tests/unit/scheduler-service.test.ts`, `tests/integration/cron-gerar-relatorios.test.ts`.

**Interfaces (Produces):**

- `scheduler.service.ts`:

```ts
export const LOTE_MAXIMO_POR_EXECUCAO = 20;
export const ESPACAMENTO_ENTRE_ORGS_MS = 2000;

export type OrgElegibilidade = {
  status: string;
  plano: string | null;
  geracao_automatica: boolean;
  proximo_relatorio_liberado_em: Date | null;
  blingConectado: boolean;
};

/** Pura. Elegível = active + plano + geração automática ligada + Bling ok + ciclo vencido (ou nunca liberado). */
export function deveGerarAutomaticamente(org: OrgElegibilidade, agora: Date): boolean {
  if (org.status !== 'active') return false;
  if (!org.plano) return false;
  if (!org.geracao_automatica) return false;
  if (!org.blingConectado) return false;
  if (org.proximo_relatorio_liberado_em !== null && org.proximo_relatorio_liberado_em > agora) {
    return false;
  }
  return true;
}
```

- `scheduler.repository.ts`:

```ts
import { and, eq, isNull, lte, or } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';

/**
 * Orgs elegíveis para geração automática: active + plano + geracao_automatica
 * + conexão Bling status 'ok' + ciclo vencido (proximo_relatorio_liberado_em <= agora OU null).
 * Ordena por proximo_relatorio_liberado_em asc (nulls first) — mais atrasadas primeiro.
 */
export async function listOrgsElegiveisParaGeracao(
  agora: Date,
): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .innerJoin(
      connections,
      and(eq(connections.org_id, organizations.id), eq(connections.provider, 'bling')),
    )
    .where(
      and(
        eq(organizations.status, 'active'),
        eq(organizations.geracao_automatica, true),
        eq(connections.status, 'ok'),
        or(
          isNull(organizations.proximo_relatorio_liberado_em),
          lte(organizations.proximo_relatorio_liberado_em, agora),
        ),
      ),
    )
    .orderBy(organizations.proximo_relatorio_liberado_em);
  return rows.filter((r) => r.name !== null);
}
```

(guardas de `plano` não-nulo ficam no `enqueueReport`, que já rejeita `sem_plano`.)

- `enqueue.ts` — **helper canônico de enfileiramento** (cron E action usam o mesmo caminho):

```ts
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { reports } from '@/db/schema';
import { serverEnv } from '@/lib/env';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { diasDoPlano } from '@/modules/pipeline/plan-lock';

export type EnqueueResult =
  | { ok: true; reportId: string }
  | { ok: false; motivo: 'sem_plano' | 'org_nao_encontrada' | 'relatorio_em_andamento' | 'falha_disparo_pipeline' };

/**
 * Insere um report 'queued' (o índice único parcial da F0 — 1 queued/running por org —
 * é o lock: conflito = relatorio_em_andamento) e dispara POST /api/pipeline/run,
 * aguardando apenas o 202. NÃO valida gating de plano/ciclo — caller decide
 * (a action valida podeGerar; o cron filtra elegibilidade antes).
 */
export async function enqueueReport(orgId: string): Promise<EnqueueResult> {
  const org = await getOrganizationById(orgId);
  if (!org) return { ok: false, motivo: 'org_nao_encontrada' };
  if (!org.plano) return { ok: false, motivo: 'sem_plano' };

  const agora = new Date();
  const inicio = new Date(agora.getTime() - diasDoPlano(org.plano) * 86_400_000);

  let reportId: string;
  try {
    const [row] = await db
      .insert(reports)
      .values({ org_id: orgId, status: 'queued', periodo_inicio: inicio, periodo_fim: agora })
      .returning({ id: reports.id });
    reportId = row.id;
  } catch {
    // violação do índice único parcial da F0 (já existe queued/running p/ a org)
    return { ok: false, motivo: 'relatorio_em_andamento' };
  }

  const res = await fetch(`${serverEnv.APP_URL}/api/pipeline/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pipeline-secret': serverEnv.PIPELINE_SECRET ?? '' },
    body: JSON.stringify({ reportId }),
  }).catch(() => null);

  if (!res || res.status !== 202) {
    await db
      .update(reports)
      .set({ status: 'failed', erro: `pipeline_run_http_${res ? res.status : 'fetch_failed'}` })
      .where(eq(reports.id, reportId));
    return { ok: false, motivo: 'falha_disparo_pipeline' };
  }
  return { ok: true, reportId };
}
```

**Re-validação F0 (obrigatória):** a F0 implementou esse fluxo dentro de `generateReportAction`. Se a lógica estiver inline na action, EXTRAIR para `enqueueReport` e fazer a action chamá-lo (mesmo comportamento, zero duplicação). Se a F0 já criou um helper equivalente, usar o dela e NÃO criar este arquivo. Conferir também o shape do body aceito por `/api/pipeline/run` (`{ reportId }`) e o nome real de `PIPELINE_SECRET` no `env.ts`.

- Rota `src/app/api/cron/gerar-relatorios/route.ts`:

```ts
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { enqueueReport } from '@/modules/pipeline/enqueue';
import { listOrgsElegiveisParaGeracao } from '@/modules/scheduler/scheduler.repository';
import {
  ESPACAMENTO_ENTRE_ORGS_MS,
  LOTE_MAXIMO_POR_EXECUCAO,
} from '@/modules/scheduler/scheduler.service';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Cron diário (Vercel manda Authorization: Bearer CRON_SECRET). */
export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!serverEnv.CRON_SECRET || auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const agora = new Date();
  const elegiveis = (await listOrgsElegiveisParaGeracao(agora)).slice(0, LOTE_MAXIMO_POR_EXECUCAO);
  const resultados: { orgId: string; ok: boolean; detalhe: string }[] = [];

  for (const [i, org] of elegiveis.entries()) {
    if (i > 0) await sleep(ESPACAMENTO_ENTRE_ORGS_MS); // espaçamento p/ rate limits
    try {
      const r = await enqueueReport(org.id);
      resultados.push({ orgId: org.id, ok: r.ok, detalhe: r.ok ? r.reportId : r.motivo });
      logger.info('cron.gerar_relatorios.org', { orgId: org.id, ok: r.ok });
    } catch (err) {
      // falha em UMA org não aborta o lote
      resultados.push({ orgId: org.id, ok: false, detalhe: 'erro_inesperado' });
      logger.error('cron.gerar_relatorios.erro', {
        orgId: org.id,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ elegiveis: elegiveis.length, resultados });
}
```

(A API exata do `logger` vem da F0 — ajustar chamadas ao contrato real de `src/lib/logger.ts`.)

- `vercel.json` — **ADICIONAR** ao array `crons` existente (criado pela F0 com o watchdog), preservando as entradas atuais. Resultado esperado:

```json
{
  "crons": [
    { "path": "/api/cron/watchdog", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/gerar-relatorios", "schedule": "0 9 * * *" },
    { "path": "/api/cron/verificar-alertas", "schedule": "30 9 * * *" }
  ]
}
```

(9h/9h30 UTC = 6h/6h30 BRT — antes do horário comercial. Se o `vercel.json` do master tiver outras chaves, só o array `crons` ganha as 2 entradas novas.)

- `src/lib/env.ts` — garantir `CRON_SECRET: z.string().min(1).optional()` e `PIPELINE_SECRET: z.string().min(1).optional()` (a F0 deve tê-los criado; adicionar apenas se faltarem, + `.env.example`).

- [ ] **Step 1 (teste falha):** `tests/unit/scheduler-service.test.ts` — tabela para `deveGerarAutomaticamente` (agora = `new Date('2026-07-03T12:00:00Z')`):

```ts
const casos: { nome: string; org: OrgElegibilidade; esperado: boolean }[] = [
  { nome: 'elegível com ciclo vencido', org: { status: 'active', plano: 'monthly', geracao_automatica: true, proximo_relatorio_liberado_em: new Date('2026-07-01T00:00:00Z'), blingConectado: true }, esperado: true },
  { nome: 'elegível nunca liberado (null)', org: { status: 'active', plano: 'weekly', geracao_automatica: true, proximo_relatorio_liberado_em: null, blingConectado: true }, esperado: true },
  { nome: 'ciclo ainda não venceu', org: { status: 'active', plano: 'monthly', geracao_automatica: true, proximo_relatorio_liberado_em: new Date('2026-07-10T00:00:00Z'), blingConectado: true }, esperado: false },
  { nome: 'geração automática desligada', org: { status: 'active', plano: 'monthly', geracao_automatica: false, proximo_relatorio_liberado_em: null, blingConectado: true }, esperado: false },
  { nome: 'org suspensa', org: { status: 'suspended', plano: 'monthly', geracao_automatica: true, proximo_relatorio_liberado_em: null, blingConectado: true }, esperado: false },
  { nome: 'sem plano', org: { status: 'active', plano: null, geracao_automatica: true, proximo_relatorio_liberado_em: null, blingConectado: true }, esperado: false },
  { nome: 'Bling desconectado', org: { status: 'active', plano: 'monthly', geracao_automatica: true, proximo_relatorio_liberado_em: null, blingConectado: false }, esperado: false },
];
it.each(casos)('$nome → $esperado', ({ org, esperado }) => {
  expect(deveGerarAutomaticamente(org, agora)).toBe(esperado);
});
```

`npx vitest run tests/unit/scheduler-service.test.ts` → **FALHA** (módulo não existe).
- [ ] **Step 2:** Implementar `scheduler.service.ts` → teste **7 passed**.
- [ ] **Step 3:** Implementar `scheduler.repository.ts` + `enqueue.ts` (após re-validação F0) + env se faltar.
- [ ] **Step 4 (integração, teste falha → passa):** `tests/integration/cron-gerar-relatorios.test.ts` (`describe.skipIf`): importar `{ GET }` da rota e chamar com `new Request('http://test/api/cron/gerar-relatorios', { headers: { authorization: 'Bearer ' + process.env.CRON_SECRET } })` (setar `CRON_SECRET` de teste via `vi.stubEnv`/mock do `serverEnv` conforme padrão do repo). Mockar `global.fetch` (`vi.spyOn(global, 'fetch')` → `new Response(null, { status: 202 })`) para NÃO chamar o pipeline real. Cenários:
  1. Sem header → 401.
  2. Org elegível semeada (active, plano, `geracao_automatica: true`, connection bling `status: 'ok'`, ciclo vencido) → 200, `resultados[0].ok === true`, existe report `queued` da org, e `fetch` foi chamado com `x-pipeline-secret`.
  3. Org com `geracao_automatica: false` → não aparece em `resultados`.
  4. Org com report `running` pré-existente → `ok: false`, `detalhe: 'relatorio_em_andamento'`, nenhum report novo (exige o índice parcial da F0 no branch test).
  Cleanup (reports, connections, orgs) em `finally`.
- [ ] **Step 5:** Atualizar `vercel.json` (merge, não sobrescrever). `npx vitest run` + `npm run typecheck` + `npm run build` verdes. **Commit:** `feat(f3a): cron diário de geração automática de relatórios (lock + espaçamento + lote)`.

---

### Task 6: Toggle "geração automática" (UI conexões + action)

**Files:** Create `src/modules/organizations/organization-settings.repository.ts`, `src/app/(client)/conexoes/geracao-automatica-toggle.tsx`; Modify `src/actions/connections.actions.ts`, `src/app/(client)/conexoes/page.tsx`; Test `tests/integration/organization-settings.test.ts`.

**Interfaces (Produces):**

- `organization-settings.repository.ts`:

```ts
import { eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations } from '@/db/schema';

export async function setGeracaoAutomatica(orgId: string, ativa: boolean): Promise<void> {
  await db.update(organizations).set({ geracao_automatica: ativa }).where(eq(organizations.id, orgId));
}

export async function getOrgSettings(
  orgId: string,
): Promise<{ geracaoAutomatica: boolean; metaMensal: number | null } | null> {
  const [row] = await db
    .select({ geracao_automatica: organizations.geracao_automatica, meta_mensal: organizations.meta_mensal })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!row) return null;
  return {
    geracaoAutomatica: row.geracao_automatica,
    metaMensal: row.meta_mensal === null ? null : Number(row.meta_mensal),
  };
}
```

- `connections.actions.ts` (padrão das actions existentes):

```ts
export async function toggleGeracaoAutomaticaAction(
  _prev: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const access = await requireActiveOrg();
  const ativa = formData.get('ativa') === 'true';
  await setGeracaoAutomatica(access.orgId, ativa);
  revalidatePath('/conexoes');
  return { ok: true };
}
```

- `geracao-automatica-toggle.tsx` — client component com `useActionState` (ou `useFormState`, conforme a versão usada no repo) + checkbox estilizado; `data-testid="geracao-automatica-toggle"`; submete `ativa = !atual`.
- `conexoes/page.tsx` — novo card "Preferências" (após "Produtos monitorados"):

```tsx
<Card>
  <CardHeader>
    <CardTitle as="h2" className="text-base">Preferências</CardTitle>
  </CardHeader>
  <CardContent>
    <GeracaoAutomaticaToggle ativa={settings?.geracaoAutomatica ?? true} />
    <p className="mt-2 text-xs text-dim">
      Com a geração automática ligada, seu relatório é gerado sozinho quando o ciclo do plano vence
      e você recebe um e-mail quando ele fica pronto.
    </p>
  </CardContent>
</Card>
```

(carregar `settings` via `getOrgSettings(access.orgId)` no `Promise.all` da página).

- [ ] **Step 1 (teste falha):** `tests/integration/organization-settings.test.ts` (`describe.skipIf`): seed org → `getOrgSettings` retorna `{ geracaoAutomatica: true, metaMensal: null }` (defaults); `setGeracaoAutomatica(orgId, false)` → re-consulta retorna `false`; org inexistente → `null`. Cleanup em `finally`. `npx vitest run tests/integration/organization-settings.test.ts` → **FALHA**.
- [ ] **Step 2:** Implementar repository → teste **passa**.
- [ ] **Step 3:** Action + toggle + card na página (código acima).
- [ ] **Step 4:** `npm run typecheck` + `npm run build` + smoke manual (ligar/desligar persiste após reload). E2E existentes de conexões continuam verdes (`npm run test:e2e` se configurado localmente; senão validar seletores intactos).
- [ ] **Step 5:** **Commit:** `feat(f3a): toggle de geração automática de relatórios na página de conexões`.

---

### Task 7: Alertas — constantes + detectores puros + dedup (testes de tabela)

**Files:** Create `src/modules/alerts/alerts.constants.ts`, `src/modules/alerts/alert-detectors.ts`; Test `tests/unit/alert-detectors.test.ts`.

**Interfaces (Produces):**

- `alerts.constants.ts`:

```ts
/** Alerta de queda: total 7d < 50% da média semanal das 4 semanas anteriores. */
export const QUEDA_VENDAS_LIMIAR = 0.5;
/** Severidade crítica: total 7d < 30% da média. */
export const QUEDA_VENDAS_CRITICO = 0.3;
/** Média semanal mínima (R$) para a base ser confiável — abaixo disso não alerta (ruído). */
export const QUEDA_BASE_MINIMA_SEMANAL = 100;
/** Mercado ≥ 5% abaixo do nosso preço → alerta. */
export const CONCORRENTE_MARGEM_MINIMA = 0.05;
/** Diferença ≥ 15% → severidade crítica. */
export const CONCORRENTE_CRITICO_PCT = 15;
/** Produto monitorado sem venda há 14+ dias → alerta. */
export const PRODUTO_PARADO_DIAS = 14;
/** Só alerta produto que vendeu ao menos 1x nos últimos 90 dias (senão nunca vendeu — não é "parado"). */
export const PRODUTO_HISTORICO_DIAS = 90;
/** Verificação roda só p/ orgs com relatório done nos últimos 45 dias. */
export const JANELA_RELATORIO_RECENTE_DIAS = 45;
```

- `alert-detectors.ts`:

```ts
import type { Metricas } from '@/modules/pipeline/contracts';
import {
  CONCORRENTE_CRITICO_PCT,
  CONCORRENTE_MARGEM_MINIMA,
  PRODUTO_PARADO_DIAS,
  QUEDA_BASE_MINIMA_SEMANAL,
  QUEDA_VENDAS_CRITICO,
  QUEDA_VENDAS_LIMIAR,
} from './alerts.constants';

export type TipoAlerta = 'queda_vendas' | 'concorrente_preco' | 'produto_parado';
export type SeveridadeAlerta = 'atencao' | 'critico';

export type AlertaCandidato = {
  tipo: TipoAlerta;
  severidade: SeveridadeAlerta;
  titulo: string;
  corpo: string;
  dados: Record<string, unknown>;
  /** Identidade p/ dedup contra alertas abertos (fica em dados.chave_dedup). */
  chaveDedup: string;
};

function brl(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

/** (a) Queda de vendas: total 7d vs média das 4 semanas anteriores. Pura. */
export function detectarQuedaVendas(input: {
  total7dias: number;
  totaisSemanasAnteriores: number[]; // 4 entradas (semana -2, -3, -4, -5)
}): AlertaCandidato | null {
  if (input.totaisSemanasAnteriores.length < 4) return null;
  const media =
    input.totaisSemanasAnteriores.reduce((a, b) => a + b, 0) / input.totaisSemanasAnteriores.length;
  if (media < QUEDA_BASE_MINIMA_SEMANAL) return null;
  const razao = input.total7dias / media;
  if (razao >= QUEDA_VENDAS_LIMIAR) return null;
  const quedaPct = Math.round((1 - razao) * 100);
  return {
    tipo: 'queda_vendas',
    severidade: razao < QUEDA_VENDAS_CRITICO ? 'critico' : 'atencao',
    titulo: `Queda de vendas de ${quedaPct}% na última semana`,
    corpo: `Os últimos 7 dias somaram ${brl(input.total7dias)} — ${quedaPct}% abaixo da média semanal das 4 semanas anteriores (${brl(media)}).`,
    dados: {
      total7dias: input.total7dias,
      mediaSemanal: Math.round(media * 100) / 100,
      quedaPercentual: quedaPct,
    },
    chaveDedup: 'queda_vendas',
  };
}

/** (b) Concorrente abaixo do preço: mediana do mercado ≥5% abaixo do nosso. Pura. */
export function detectarConcorrenteAbaixo(
  posicaoPreco: Metricas['posicaoPreco'],
): AlertaCandidato[] {
  return posicaoPreco
    .filter(
      (p) =>
        p.nossoPreco > 0 &&
        p.precoMercadoMediano > 0 &&
        p.precoMercadoMediano < p.nossoPreco * (1 - CONCORRENTE_MARGEM_MINIMA),
    )
    .map((p) => {
      const diffPct = Math.round((1 - p.precoMercadoMediano / p.nossoPreco) * 100);
      return {
        tipo: 'concorrente_preco' as const,
        severidade: (diffPct >= CONCORRENTE_CRITICO_PCT ? 'critico' : 'atencao') as SeveridadeAlerta,
        titulo: `Mercado ${diffPct}% abaixo do seu preço em ${p.nome}`,
        corpo: `A mediana de mercado de ${p.nome} (${p.sku}) está em ${brl(p.precoMercadoMediano)}, ${diffPct}% abaixo do seu preço médio (${brl(p.nossoPreco)}). Fonte: ${p.fonte}.`,
        dados: {
          sku: p.sku,
          nossoPreco: p.nossoPreco,
          precoMercadoMediano: p.precoMercadoMediano,
          diferencaPercentual: diffPct,
          fonte: p.fonte,
        },
        chaveDedup: `concorrente_preco:${p.sku}`,
      };
    });
}

/** (c) Produto monitorado sem venda há 14+ dias (mas que já vendeu na janela histórica). Pura. */
export function detectarProdutoParado(
  produtos: { sku: string; nome: string }[],
  ultimaVendaPorSku: Map<string, Date>,
  agora: Date,
): AlertaCandidato[] {
  const out: AlertaCandidato[] = [];
  for (const p of produtos) {
    const ultima = ultimaVendaPorSku.get(p.sku);
    if (!ultima) continue; // nunca vendeu na janela histórica → não é "parado"
    const dias = Math.floor((agora.getTime() - ultima.getTime()) / 86_400_000);
    if (dias < PRODUTO_PARADO_DIAS) continue;
    out.push({
      tipo: 'produto_parado',
      severidade: 'atencao',
      titulo: `${p.nome} está há ${dias} dias sem vender`,
      corpo: `O produto monitorado ${p.nome} (${p.sku}) não registra vendas desde ${ultima.toISOString().slice(0, 10)} (${dias} dias).`,
      dados: { sku: p.sku, diasSemVenda: dias, ultimaVenda: ultima.toISOString() },
      chaveDedup: `produto_parado:${p.sku}`,
    });
  }
  return out;
}

/** Dedup puro: descarta candidato cujo tipo+chaveDedup já tem alerta ABERTO. */
export function filtrarNaoDuplicados(
  candidatos: AlertaCandidato[],
  abertos: { tipo: string; chaveDedup: string }[],
): AlertaCandidato[] {
  const chaves = new Set(abertos.map((a) => `${a.tipo}|${a.chaveDedup}`));
  return candidatos.filter((c) => !chaves.has(`${c.tipo}|${c.chaveDedup}`));
}
```

- [ ] **Step 1 (teste falha):** `tests/unit/alert-detectors.test.ts` — tabela com números concretos:

```ts
describe('detectarQuedaVendas', () => {
  it('queda para 40% da média → atencao', () => {
    const r = detectarQuedaVendas({ total7dias: 400, totaisSemanasAnteriores: [1000, 1000, 1000, 1000] });
    expect(r).not.toBeNull();
    expect(r?.severidade).toBe('atencao'); // razao 0.4 (≥0.3, <0.5)
    expect(r?.dados.quedaPercentual).toBe(60);
    expect(r?.chaveDedup).toBe('queda_vendas');
  });
  it('queda para 20% da média → critico', () => {
    const r = detectarQuedaVendas({ total7dias: 200, totaisSemanasAnteriores: [1000, 1000, 1000, 1000] });
    expect(r?.severidade).toBe('critico'); // razao 0.2 < 0.3
  });
  it('50% exato NÃO alerta (limiar é estrito)', () => {
    expect(detectarQuedaVendas({ total7dias: 500, totaisSemanasAnteriores: [1000, 1000, 1000, 1000] })).toBeNull();
  });
  it('base ruidosa (média < R$100) NÃO alerta', () => {
    expect(detectarQuedaVendas({ total7dias: 10, totaisSemanasAnteriores: [80, 90, 70, 60] })).toBeNull();
  });
  it('menos de 4 semanas de histórico NÃO alerta', () => {
    expect(detectarQuedaVendas({ total7dias: 0, totaisSemanasAnteriores: [1000, 1000] })).toBeNull();
  });
});

describe('detectarConcorrenteAbaixo', () => {
  const item = (sku: string, nosso: number, mercado: number) =>
    ({ sku, nome: `Produto ${sku}`, nossoPreco: nosso, precoMercadoMediano: mercado, fonte: 'ml_publico' });
  it('mercado 10% abaixo → atencao; 20% abaixo → critico; 4% abaixo → nada', () => {
    const r = detectarConcorrenteAbaixo([item('A', 100, 90), item('B', 100, 80), item('C', 100, 96)]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ severidade: 'atencao', chaveDedup: 'concorrente_preco:A', dados: { diferencaPercentual: 10 } });
    expect(r[1]).toMatchObject({ severidade: 'critico', chaveDedup: 'concorrente_preco:B' });
  });
  it('sem preço próprio ou sem benchmark → nada', () => {
    expect(detectarConcorrenteAbaixo([item('A', 0, 90), item('B', 100, 0)])).toHaveLength(0);
  });
});

describe('detectarProdutoParado', () => {
  const agora = new Date('2026-07-03T12:00:00Z');
  it('parado há 20 dias → alerta; 5 dias → nada; nunca vendeu → nada', () => {
    const ultimaVenda = new Map<string, Date>([
      ['A', new Date('2026-06-13T12:00:00Z')], // 20 dias
      ['B', new Date('2026-06-28T12:00:00Z')], // 5 dias
    ]);
    const r = detectarProdutoParado(
      [{ sku: 'A', nome: 'Alfa' }, { sku: 'B', nome: 'Beta' }, { sku: 'C', nome: 'Gama' }],
      ultimaVenda,
      agora,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ chaveDedup: 'produto_parado:A', dados: { diasSemVenda: 20 } });
  });
  it('exatamente 14 dias → alerta (limiar inclusivo)', () => {
    const r = detectarProdutoParado(
      [{ sku: 'A', nome: 'Alfa' }],
      new Map([['A', new Date('2026-06-19T12:00:00Z')]]),
      agora,
    );
    expect(r).toHaveLength(1);
  });
});

describe('filtrarNaoDuplicados', () => {
  it('remove candidato com alerta aberto do mesmo tipo+chave; mantém os demais', () => {
    const candidatos = [
      detectarQuedaVendas({ total7dias: 200, totaisSemanasAnteriores: [1000, 1000, 1000, 1000] })!,
      ...detectarConcorrenteAbaixo([{ sku: 'A', nome: 'Alfa', nossoPreco: 100, precoMercadoMediano: 80, fonte: 'serpapi' }]),
    ];
    const r = filtrarNaoDuplicados(candidatos, [{ tipo: 'queda_vendas', chaveDedup: 'queda_vendas' }]);
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe('concorrente_preco');
  });
});
```

`npx vitest run tests/unit/alert-detectors.test.ts` → **FALHA** (módulo não existe).
- [ ] **Step 2:** Implementar `alerts.constants.ts` + `alert-detectors.ts` (código acima) → **10 passed**.
- [ ] **Step 3:** `npm run typecheck`. **Commit:** `feat(f3a): detectores puros de alertas (queda, concorrente, produto parado) + dedup`.

---

### Task 8: Alertas — repositórios (persistência + dados) e cron `verificar-alertas`

**Files:** Create `src/modules/alerts/alert.repository.ts`, `src/modules/alerts/alert-data.repository.ts`, `src/app/api/cron/verificar-alertas/route.ts`; Modify `src/modules/notifications/templates.ts`, `src/modules/notifications/email.ts`, `src/modules/notifications/recipients.ts`; Test `tests/integration/alert-repository.test.ts`, `tests/integration/cron-verificar-alertas.test.ts`.

**Interfaces (Produces):**

- `alert.repository.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm';

import { db } from '@/db/client';
import { alerts } from '@/db/schema';
import type { AlertaCandidato } from './alert-detectors';

export type AlertaAberto = {
  id: string;
  tipo: string;
  severidade: string;
  titulo: string;
  corpo: string;
  chaveDedup: string;
  createdAt: Date;
};

export async function listAlertasAbertos(orgId: string): Promise<AlertaAberto[]> {
  const rows = await db
    .select()
    .from(alerts)
    .where(and(eq(alerts.org_id, orgId), eq(alerts.resolvido, false)))
    .orderBy(desc(alerts.created_at));
  return rows.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    severidade: r.severidade,
    titulo: r.titulo,
    corpo: r.corpo,
    chaveDedup: String((r.dados as Record<string, unknown>)?.chave_dedup ?? ''),
    createdAt: r.created_at,
  }));
}

/** Insere candidatos (chaveDedup vai para dados.chave_dedup). Retorna os ids criados na mesma ordem. */
export async function criarAlertas(orgId: string, candidatos: AlertaCandidato[]): Promise<string[]> {
  if (candidatos.length === 0) return [];
  const rows = await db
    .insert(alerts)
    .values(
      candidatos.map((c) => ({
        org_id: orgId,
        tipo: c.tipo,
        severidade: c.severidade,
        titulo: c.titulo,
        corpo: c.corpo,
        dados: { ...c.dados, chave_dedup: c.chaveDedup },
      })),
    )
    .returning({ id: alerts.id });
  return rows.map((r) => r.id);
}

/** Marca resolvido — escopado por org (multi-tenancy). Retorna false se não achou. */
export async function resolverAlerta(alertId: string, orgId: string): Promise<boolean> {
  const updated = await db
    .update(alerts)
    .set({ resolvido: true, resolvido_em: new Date() })
    .where(and(eq(alerts.id, alertId), eq(alerts.org_id, orgId), eq(alerts.resolvido, false)))
    .returning({ id: alerts.id });
  return updated.length > 0;
}
```

- `alert-data.repository.ts`:

```ts
import { and, between, desc, eq, gte } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders, organizations, reports, trackedProducts } from '@/db/schema';
import type { Metricas } from '@/modules/pipeline/contracts';
import type { RawOrderItem } from '@/modules/providers/types';

/** Orgs active com relatório done criado nos últimos `dias` dias. */
export async function listOrgsComRelatorioRecente(dias: number, agora: Date): Promise<string[]> {
  const corte = new Date(agora.getTime() - dias * 86_400_000);
  const rows = await db
    .selectDistinct({ orgId: reports.org_id })
    .from(reports)
    .innerJoin(organizations, eq(organizations.id, reports.org_id))
    .where(
      and(eq(reports.status, 'done'), gte(reports.created_at, corte), eq(organizations.status, 'active')),
    );
  return rows.map((r) => r.orgId);
}

/** Total dos últimos 7 dias + totais das 4 semanas anteriores (buckets de 7d, mais recente primeiro). */
export async function getTotaisSemanais(
  orgId: string,
  agora: Date,
): Promise<{ total7dias: number; totaisSemanasAnteriores: number[] }> {
  const inicio = new Date(agora.getTime() - 35 * 86_400_000);
  const rows = await db
    .select({ data: orders.data, valor_total: orders.valor_total })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), between(orders.data, inicio, agora)));

  const buckets = [0, 0, 0, 0, 0]; // 0 = últimos 7d; 1..4 = semanas anteriores
  for (const o of rows) {
    const idade = Math.floor((agora.getTime() - o.data.getTime()) / (7 * 86_400_000));
    if (idade >= 0 && idade < 5) buckets[idade] += Number(o.valor_total);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { total7dias: r2(buckets[0]), totaisSemanasAnteriores: buckets.slice(1).map(r2) };
}

/** posicaoPreco do último relatório done ([] se não houver). */
export async function getPosicaoPrecoUltimoDone(orgId: string): Promise<Metricas['posicaoPreco']> {
  const [row] = await db
    .select({ metricas: reports.metricas })
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done')))
    .orderBy(desc(reports.created_at))
    .limit(1);
  const m = row?.metricas as Metricas | null | undefined;
  return m?.posicaoPreco ?? [];
}

/** Última data de venda por sku dos produtos monitorados ativos, na janela [agora-diasHistorico, agora]. */
export async function getUltimaVendaPorSku(
  orgId: string,
  diasHistorico: number,
  agora: Date,
): Promise<{ produtos: { sku: string; nome: string }[]; ultimaVendaPorSku: Map<string, Date> }> {
  const produtosRows = await db
    .select({ sku: trackedProducts.sku, nome: trackedProducts.nome })
    .from(trackedProducts)
    .where(and(eq(trackedProducts.org_id, orgId), eq(trackedProducts.ativo, true)));
  const produtos = produtosRows.filter((p): p is { sku: string; nome: string } => p.sku !== null);
  if (produtos.length === 0) return { produtos: [], ultimaVendaPorSku: new Map() };

  const desde = new Date(agora.getTime() - diasHistorico * 86_400_000);
  const orderRows = await db
    .select({ data: orders.data, itens: orders.itens })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), gte(orders.data, desde)));

  const skus = new Set(produtos.map((p) => p.sku));
  const ultimaVendaPorSku = new Map<string, Date>();
  for (const o of orderRows) {
    for (const item of (o.itens as RawOrderItem[]) ?? []) {
      if (!item.sku || !skus.has(item.sku)) continue;
      const atual = ultimaVendaPorSku.get(item.sku);
      if (!atual || o.data > atual) ultimaVendaPorSku.set(item.sku, o.data);
    }
  }
  return { produtos, ultimaVendaPorSku };
}
```

- `templates.ts`: + `alertaTemplate(titulo: string, corpo: string, appUrl: string): { subject; html; text }` (subject = `⚠ ${titulo}`; corpo + link `${appUrl}/dashboard`; pt-BR, mesmo estilo dos templates existentes).
- `email.ts`: + `export async function sendAlertaEmail(to: string, titulo: string, corpo: string): Promise<void>` (wrapper never-throw padrão, usa `alertaTemplate(titulo, corpo, serverEnv.APP_URL)`).
- `recipients.ts`: + `export async function getOrgPrimaryUser(orgId: string): Promise<{ id: string; email: string } | null>` (mesma query de `getOrgPrimaryEmail`, retornando também `users.id` — refatorar `getOrgPrimaryEmail` para delegar a ela).
- Rota `verificar-alertas`:

```ts
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import {
  detectarConcorrenteAbaixo,
  detectarProdutoParado,
  detectarQuedaVendas,
  filtrarNaoDuplicados,
  type AlertaCandidato,
} from '@/modules/alerts/alert-detectors';
import {
  JANELA_RELATORIO_RECENTE_DIAS,
  PRODUTO_HISTORICO_DIAS,
} from '@/modules/alerts/alerts.constants';
import { criarAlertas, listAlertasAbertos } from '@/modules/alerts/alert.repository';
import {
  getPosicaoPrecoUltimoDone,
  getTotaisSemanais,
  getUltimaVendaPorSku,
  listOrgsComRelatorioRecente,
} from '@/modules/alerts/alert-data.repository';
import { sendAlertaEmail } from '@/modules/notifications/email';
import { notify } from '@/modules/notifications/notify'; // contrato F2
import { getOrgPrimaryUser } from '@/modules/notifications/recipients';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (!serverEnv.CRON_SECRET || auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 });
  }

  const agora = new Date();
  const orgIds = await listOrgsComRelatorioRecente(JANELA_RELATORIO_RECENTE_DIAS, agora);
  let criadosTotal = 0;

  for (const orgId of orgIds) {
    try {
      const [semanais, posicao, parado, abertos] = await Promise.all([
        getTotaisSemanais(orgId, agora),
        getPosicaoPrecoUltimoDone(orgId),
        getUltimaVendaPorSku(orgId, PRODUTO_HISTORICO_DIAS, agora),
        listAlertasAbertos(orgId),
      ]);

      const queda = detectarQuedaVendas(semanais);
      const candidatos: AlertaCandidato[] = [
        ...(queda ? [queda] : []),
        ...detectarConcorrenteAbaixo(posicao),
        ...detectarProdutoParado(parado.produtos, parado.ultimaVendaPorSku, agora),
      ];
      const novos = filtrarNaoDuplicados(
        candidatos,
        abertos.map((a) => ({ tipo: a.tipo, chaveDedup: a.chaveDedup })),
      );
      if (novos.length === 0) continue;

      await criarAlertas(orgId, novos);
      criadosTotal += novos.length;

      // Notificação in-app + e-mail — best-effort, nunca aborta o cron
      try {
        const user = await getOrgPrimaryUser(orgId);
        if (user) {
          for (const n of novos) {
            await notify(user.id, { tipo: `alerta_${n.tipo}`, titulo: n.titulo, corpo: n.corpo, href: '/dashboard' });
            await sendAlertaEmail(user.email, n.titulo, n.corpo);
          }
        }
      } catch {
        logger.warn('cron.verificar_alertas.notificacao_falhou', { orgId });
      }
      logger.info('cron.verificar_alertas.org', { orgId, criados: novos.length });
    } catch (err) {
      logger.error('cron.verificar_alertas.erro', {
        orgId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ orgs: orgIds.length, alertasCriados: criadosTotal });
}
```

**Re-validação F2:** confirmar o caminho/assinatura reais de `notify` (contrato do roadmap: `notify(userId, { tipo, titulo, corpo, href })` + tabela `notifications`). Se a F2 ainda não estiver no master no momento da execução, implementar tudo MENOS a chamada `notify` (deixar só o e-mail) e registrar follow-up no ledger — o resto do plano não depende disso.

- [ ] **Step 1 (teste falha):** `tests/integration/alert-repository.test.ts` (`describe.skipIf`): seed org → `criarAlertas` com 2 candidatos → `listAlertasAbertos` retorna 2 com `chaveDedup` correto; `resolverAlerta(id, orgId)` → true e some da lista; `resolverAlerta(id, outraOrg)` → false (isolamento); resolver 2x → segunda vez false. Cleanup em `finally`. → **FALHA** antes de implementar, **passa** depois.
- [ ] **Step 2:** Implementar `alert.repository.ts` + `alert-data.repository.ts`.
- [ ] **Step 3:** Notifications: `alertaTemplate` + `sendAlertaEmail` + `getOrgPrimaryUser` (estender testes unit de templates existentes com 1 caso: subject contém o título; text contém o corpo).
- [ ] **Step 4 (teste falha → passa):** `tests/integration/cron-verificar-alertas.test.ts` (`describe.skipIf`): spies em `notify` e `sendAlertaEmail` (`vi.mock`/`vi.spyOn`); seed org active + report done recente com `metricas.posicaoPreco` = `[{ sku:'A', nome:'Alfa', nossoPreco:100, precoMercadoMediano:80, fonte:'ml_publico' }]` + orders: semana atual R$ 200, 4 semanas anteriores R$ 1000 cada (datas espaçadas). Chamar `GET` com Bearer correto:
  1. → 200; alertas criados: `queda_vendas` (critico) + `concorrente_preco:A`; spies chamados.
  2. Rodar `GET` de novo → dedup: nenhum alerta novo (`alertasCriados: 0`).
  3. Sem header → 401.
  Cleanup em `finally`.
- [ ] **Step 5:** `npx vitest run` + `npm run typecheck` + `npm run build` verdes. **Commit:** `feat(f3a): cron de verificação de alertas com dedup + notificação in-app e e-mail`.

---

### Task 9: Alertas — UI no dashboard + marcar resolvido

**Files:** Create `src/actions/alerts.actions.ts`, `src/app/(client)/dashboard/alertas-section.tsx`; Modify `src/app/(client)/dashboard/page.tsx`.

**Interfaces (Produces):**

- `alerts.actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { resolverAlerta } from '@/modules/alerts/alert.repository';

export async function resolverAlertaAction(formData: FormData): Promise<void> {
  const access = await requireActiveOrg();
  const alertId = String(formData.get('alertId') ?? '');
  if (!alertId) return;
  await resolverAlerta(alertId, access.orgId); // escopado por org — id alheio é no-op
  revalidatePath('/dashboard');
}
```

- `alertas-section.tsx` (server component; recebe `alertas: AlertaAberto[]`):

```tsx
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { AlertaAberto } from '@/modules/alerts/alert.repository';
import { resolverAlertaAction } from '@/actions/alerts.actions';

export function AlertasSection({ alertas }: { alertas: AlertaAberto[] }) {
  if (alertas.length === 0) return null;
  return (
    <Card data-testid="alertas-section">
      <CardHeader>
        <CardTitle as="h2" className="text-base">Alertas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alertas.map((a) => (
          <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded border border-white/10 p-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={a.severidade === 'critico' ? 'danger' : 'warning'}>
                  {a.severidade === 'critico' ? 'Crítico' : 'Atenção'}
                </Badge>
                <p className="text-sm font-medium text-white">{a.titulo}</p>
              </div>
              <p className="text-sm text-muted">{a.corpo}</p>
            </div>
            <form action={resolverAlertaAction}>
              <input type="hidden" name="alertId" value={a.id} />
              <button type="submit" className="text-sm text-brand hover:underline" data-testid={`resolver-alerta-${a.id}`}>
                Marcar resolvido
              </button>
            </form>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

(usar as variantes reais do `Badge` do master — se `danger`/`warning` não existirem pós-F1, usar as equivalentes tokenizadas da F1.)
- `dashboard/page.tsx`: adicionar `listAlertasAbertos(access.orgId)` ao `Promise.all` e renderizar `<AlertasSection alertas={alertas} />` logo abaixo do Truth Score hero.

- [ ] **Step 1:** Implementar action + componente + integração no dashboard (código acima).
- [ ] **Step 2:** Smoke manual: semear alerta via SQL/console no dev, ver seção, marcar resolvido → some; org sem alertas → seção ausente.
- [ ] **Step 3:** `npm run typecheck` + `npm run build` + `npx vitest run` verdes; E2E existentes do dashboard intactos (seção nova é aditiva e some sem dados).
- [ ] **Step 4:** **Commit:** `feat(f3a): seção de alertas no dashboard com marcar resolvido`.

---

### Task 10: Metas mensais — admin define, cliente acompanha (barra com glow)

**Files:** Modify `src/modules/organizations/organization-settings.repository.ts`, `src/actions/admin.actions.ts`, `src/app/admin/[orgId]/*` (página de detalhe da F1), `src/app/(client)/dashboard/page.tsx`; Create `src/app/(client)/dashboard/meta-progress.tsx` e `src/modules/reports/compare.ts` (a função pura `progressoMeta` nasce AQUI; a Task 11 estende o mesmo arquivo com os comparadores — não recriar). Test `tests/unit/progresso-meta.test.ts`, estender `tests/integration/organization-settings.test.ts`.

**Interfaces (Produces):**

- `organization-settings.repository.ts` (adições):

```ts
import { and, between, eq } from 'drizzle-orm';
import { orders } from '@/db/schema';

export async function setMetaMensal(orgId: string, meta: number | null): Promise<void> {
  await db
    .update(organizations)
    .set({ meta_mensal: meta === null ? null : meta.toFixed(2) })
    .where(eq(organizations.id, orgId));
}

/** Soma de orders.valor_total do mês corrente (UTC — consistente com `evolucao`). */
export async function getTotalVendasMesCorrente(orgId: string, agora: Date = new Date()): Promise<number> {
  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const rows = await db
    .select({ valor_total: orders.valor_total })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), between(orders.data, inicioMes, agora)));
  return Math.round(rows.reduce((acc, o) => acc + Number(o.valor_total), 0) * 100) / 100;
}
```

- `src/modules/reports/compare.ts` (criado nesta task com a primeira função pura):

```ts
export type ProgressoMeta = { percentual: number; restante: number; atingida: boolean };

/** Pura. meta null/≤0 → null (sem meta definida). percentual inteiro, cap 999. */
export function progressoMeta(totalMes: number, meta: number | null): ProgressoMeta | null {
  if (meta === null || meta <= 0) return null;
  return {
    percentual: Math.min(999, Math.round((totalMes / meta) * 100)),
    restante: Math.max(0, Math.round((meta - totalMes) * 100) / 100),
    atingida: totalMes >= meta,
  };
}
```

- `admin.actions.ts` (padrão das actions admin existentes — `requireAdmin` + audit):

```ts
export async function setMetaMensalAction(
  _prev: { error?: string; ok?: boolean },
  formData: FormData,
): Promise<{ error?: string; ok?: boolean }> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  const raw = String(formData.get('meta') ?? '').trim().replace(',', '.');
  const meta = raw === '' ? null : Number(raw);
  if (meta !== null && (!Number.isFinite(meta) || meta <= 0)) return { error: 'meta_invalida' };
  if (!orgId) return { error: 'org_invalida' };
  await setMetaMensal(orgId, meta);
  await recordAudit({ orgId, userId: admin.userId, acao: 'org.meta_alterada', detalhes: { meta } });
  revalidatePath(`/admin/${orgId}`);
  return { ok: true };
}
```

(nomes exatos de `requireAdmin`/`admin.userId`/`recordAudit` = os já usados pelas actions admin do master; nota F2: quando a role `analista` existir, liberar também para analista da carteira — follow-up F2/F3c, não bloqueia.)
- UI admin: no `/admin/[orgId]` (F1), card "Meta mensal" com form (input numérico + salvar) usando `setMetaMensalAction`; exibir meta atual.
- `meta-progress.tsx` (server component):

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { ProgressoMeta } from '@/modules/reports/compare';

export function MetaProgress({ progresso, meta, totalMes }: { progresso: ProgressoMeta | null; meta: number | null; totalMes: number }) {
  if (!progresso || meta === null) return null;
  const largura = Math.min(100, progresso.percentual);
  return (
    <Card data-testid="meta-progress">
      <CardHeader>
        <CardTitle as="h2" className="text-base">Meta do mês</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="font-mono text-white">R$ {totalMes.toFixed(2).replace('.', ',')}</span>
          <span className="text-muted">de R$ {meta.toFixed(2).replace('.', ',')} ({progresso.percentual}%)</span>
        </div>
        <div className="h-2.5 rounded-full bg-white/5">
          <div
            className="h-2.5 rounded-full bg-brand shadow-[0_0_12px_#07dd2b66,0_0_24px_#07dd2b33]"
            style={{ width: `${largura}%` }}
          />
        </div>
        <p className="text-xs text-dim">
          {progresso.atingida
            ? 'Meta do mês atingida! 🎯'
            : `Faltam R$ ${progresso.restante.toFixed(2).replace('.', ',')} para a meta.`}
        </p>
      </CardContent>
    </Card>
  );
}
```

- Dashboard: carregar `getOrgSettings` + `getTotalVendasMesCorrente` no `Promise.all`; renderizar `<MetaProgress progresso={progressoMeta(totalMes, settings?.metaMensal ?? null)} meta={settings?.metaMensal ?? null} totalMes={totalMes} />` entre o score hero e "Gerar relatório". Sem meta definida → componente some (cliente só vê quando o admin definir).

- [ ] **Step 1 (teste falha):** `tests/unit/progresso-meta.test.ts` — tabela:

```ts
it.each([
  { totalMes: 5000, meta: 10000, esperado: { percentual: 50, restante: 5000, atingida: false } },
  { totalMes: 12000, meta: 10000, esperado: { percentual: 120, restante: 0, atingida: true } },
  { totalMes: 10000, meta: 10000, esperado: { percentual: 100, restante: 0, atingida: true } },
  { totalMes: 3333.33, meta: 10000, esperado: { percentual: 33, restante: 6666.67, atingida: false } },
  { totalMes: 999999, meta: 10, esperado: { percentual: 999, restante: 0, atingida: true } }, // cap
])('R$ $totalMes de R$ $meta → $esperado.percentual%', ({ totalMes, meta, esperado }) => {
  expect(progressoMeta(totalMes, meta)).toEqual(esperado);
});
it('meta null ou ≤ 0 → null', () => {
  expect(progressoMeta(5000, null)).toBeNull();
  expect(progressoMeta(5000, 0)).toBeNull();
});
```

→ **FALHA**; implementar `compare.ts` com `progressoMeta` → **6 passed**.
- [ ] **Step 2 (integração):** estender `tests/integration/organization-settings.test.ts`: `setMetaMensal(orgId, 15000)` → `getOrgSettings` retorna `metaMensal: 15000`; `setMetaMensal(orgId, null)` → volta a `null`; `getTotalVendasMesCorrente` com 2 orders no mês (100.50 + 200) e 1 no mês anterior → `300.50`. → **passa**.
- [ ] **Step 3:** Action admin + card no `/admin/[orgId]` + `MetaProgress` no dashboard.
- [ ] **Step 4:** `npx vitest run` + `npm run typecheck` + `npm run build`; smoke: definir meta no admin → aparece no dashboard do cliente; limpar meta → some.
- [ ] **Step 5:** **Commit:** `feat(f3a): meta mensal (admin define) + barra de progresso com glow no dashboard`.

---

### Task 11: Comparativo de períodos — funções puras + página "Comparar"

**Files:** Modify `src/modules/reports/compare.ts`; Create `src/app/(client)/dashboard/relatorios/comparar/page.tsx`, `src/app/(client)/dashboard/relatorios/comparar/comparar-form.tsx`; Modify `src/app/(client)/dashboard/relatorios/[id]/page.tsx` (link "Comparar") e `src/app/(client)/dashboard/page.tsx` (link no histórico). Test `tests/unit/compare-reports.test.ts`.

**Interfaces (Produces):** adições em `compare.ts`:

```ts
import type { Metricas } from '@/modules/pipeline/contracts';

export type DeltaNumero = {
  atual: number;
  anterior: number;
  deltaAbs: number;
  /** % com 1 casa; null quando anterior = 0 (divisão indefinida). */
  deltaPct: number | null;
};

export function deltaNumero(atual: number, anterior: number): DeltaNumero {
  return {
    atual,
    anterior,
    deltaAbs: Math.round((atual - anterior) * 100) / 100,
    deltaPct: anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 1000) / 10,
  };
}

export function totalVendas(m: Metricas): number {
  return Math.round(m.evolucao.reduce((acc, e) => acc + e.total, 0) * 100) / 100;
}

export function totalPedidos(m: Metricas): number {
  return m.vendasPorCanal.reduce((acc, c) => acc + c.pedidos, 0);
}

export type ComparacaoRelatorios = {
  totalVendas: DeltaNumero;
  pedidos: DeltaNumero;
  ticketMedio: DeltaNumero;
  truthScore: DeltaNumero | null; // null se algum lado não tiver score
  porCanal: { canal: string; delta: DeltaNumero }[];
};

/** Pura. `atual` = relatório mais recente (A); `anterior` = base de comparação (B). */
export function compararMetricas(atual: Metricas, anterior: Metricas): ComparacaoRelatorios {
  const canais = new Map<string, { a: number; b: number }>();
  for (const c of atual.vendasPorCanal) canais.set(c.canal, { a: c.total, b: 0 });
  for (const c of anterior.vendasPorCanal) {
    const cur = canais.get(c.canal) ?? { a: 0, b: 0 };
    canais.set(c.canal, { ...cur, b: c.total });
  }
  const scoreA = atual.truth_score?.score;
  const scoreB = anterior.truth_score?.score;
  return {
    totalVendas: deltaNumero(totalVendas(atual), totalVendas(anterior)),
    pedidos: deltaNumero(totalPedidos(atual), totalPedidos(anterior)),
    ticketMedio: deltaNumero(atual.ticketMedio, anterior.ticketMedio),
    truthScore: scoreA !== undefined && scoreB !== undefined ? deltaNumero(scoreA, scoreB) : null,
    porCanal: Array.from(canais.entries())
      .map(([canal, v]) => ({ canal, delta: deltaNumero(v.a, v.b) }))
      .sort((x, y) => y.delta.atual - x.delta.atual || x.canal.localeCompare(y.canal, 'pt-BR')),
  };
}
```

- Página `comparar/page.tsx` (server):

```tsx
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getReportById, listDoneReports } from '@/modules/reports/report.repository';
import { compararMetricas } from '@/modules/reports/compare';
import { formatPeriodo } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/Card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { CompararForm } from './comparar-form';

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return <span className="text-dim">—</span>;
  const positivo = deltaPct >= 0;
  return (
    <span className={positivo ? 'text-brand' : 'text-red-400'}>
      {positivo ? '▲' : '▼'} {positivo ? '+' : ''}{deltaPct}%
    </span>
  );
}

export default async function CompararPage({
  searchParams,
}: {
  searchParams: { a?: string; b?: string };
}) {
  const access = await requireActiveOrg();
  const dones = await listDoneReports(access.orgId);

  const [relA, relB] =
    searchParams.a && searchParams.b && searchParams.a !== searchParams.b
      ? await Promise.all([
          getReportById(searchParams.a, access.orgId),
          getReportById(searchParams.b, access.orgId),
        ])
      : [null, null];

  const comp =
    relA?.metricas && relB?.metricas ? compararMetricas(relA.metricas, relB.metricas) : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Comparar períodos</h1>
      <CompararForm
        relatorios={dones.map((r) => ({
          id: r.id,
          label: formatPeriodo(r.periodoInicio, r.periodoFim),
        }))}
        a={searchParams.a}
        b={searchParams.b}
      />
      {comp && relA && relB ? (
        <Card className="!p-0" data-testid="comparacao">
          <Table>
            <THead>
              <TR>
                <TH>Métrica</TH>
                <TH>{formatPeriodo(relA.periodoInicio, relA.periodoFim)}</TH>
                <TH>{formatPeriodo(relB.periodoInicio, relB.periodoFim)}</TH>
                <TH>Δ</TH>
              </TR>
            </THead>
            <TBody>
              <TR>
                <TD>Total de vendas</TD>
                <TD className="font-mono">R$ {comp.totalVendas.atual.toFixed(2)}</TD>
                <TD className="font-mono text-muted">R$ {comp.totalVendas.anterior.toFixed(2)}</TD>
                <TD><DeltaBadge deltaPct={comp.totalVendas.deltaPct} /></TD>
              </TR>
              <TR>
                <TD>Pedidos</TD>
                <TD className="font-mono">{comp.pedidos.atual}</TD>
                <TD className="font-mono text-muted">{comp.pedidos.anterior}</TD>
                <TD><DeltaBadge deltaPct={comp.pedidos.deltaPct} /></TD>
              </TR>
              <TR>
                <TD>Ticket médio</TD>
                <TD className="font-mono">R$ {comp.ticketMedio.atual.toFixed(2)}</TD>
                <TD className="font-mono text-muted">R$ {comp.ticketMedio.anterior.toFixed(2)}</TD>
                <TD><DeltaBadge deltaPct={comp.ticketMedio.deltaPct} /></TD>
              </TR>
              {comp.truthScore && (
                <TR>
                  <TD>Truth Score</TD>
                  <TD className="font-mono">{comp.truthScore.atual}</TD>
                  <TD className="font-mono text-muted">{comp.truthScore.anterior}</TD>
                  <TD><DeltaBadge deltaPct={comp.truthScore.deltaPct} /></TD>
                </TR>
              )}
              {comp.porCanal.map((c) => (
                <TR key={c.canal}>
                  <TD className="text-muted">Canal: {c.canal}</TD>
                  <TD className="font-mono">R$ {c.delta.atual.toFixed(2)}</TD>
                  <TD className="font-mono text-muted">R$ {c.delta.anterior.toFixed(2)}</TD>
                  <TD><DeltaBadge deltaPct={c.delta.deltaPct} /></TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <p className="text-muted">
          {dones.length < 2
            ? 'Você precisa de pelo menos 2 relatórios concluídos para comparar.'
            : 'Selecione dois relatórios diferentes acima.'}
        </p>
      )}
    </main>
  );
}
```

- `comparar-form.tsx` (client): form `method="get"` com 2 `<select name="a|b">` (options = relatorios, defaults = props `a`/`b`) + botão "Comparar"; `data-testid="comparar-form"`. Sem estado — GET recarrega a página server-side.
- Links: no detalhe do relatório (`[id]/page.tsx`) e no cabeçalho do Histórico do dashboard: `<a href="/dashboard/relatorios/comparar">Comparar períodos →</a>` (no detalhe, pré-selecionar: `/dashboard/relatorios/comparar?a=${detail.id}`).

- [ ] **Step 1 (teste falha):** `tests/unit/compare-reports.test.ts` — tabela com métricas concretas:

```ts
const mA: Metricas = {
  vendasPorCanal: [
    { canal: 'mercado_livre', total: 8000, pedidos: 80 },
    { canal: 'site', total: 2000, pedidos: 20 },
  ],
  evolucao: [{ data: '2026-06-01', total: 6000 }, { data: '2026-06-02', total: 4000 }],
  ticketMedio: 100,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
};
const mB: Metricas = {
  vendasPorCanal: [
    { canal: 'mercado_livre', total: 5000, pedidos: 50 },
    { canal: 'shopee', total: 3000, pedidos: 30 },
  ],
  evolucao: [{ data: '2026-05-01', total: 8000 }],
  ticketMedio: 100,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
};

it('compara totais, pedidos, ticket e canais (união, incluindo canal só de um lado)', () => {
  const c = compararMetricas(mA, mB);
  expect(c.totalVendas).toEqual({ atual: 10000, anterior: 8000, deltaAbs: 2000, deltaPct: 25 });
  expect(c.pedidos).toEqual({ atual: 100, anterior: 80, deltaAbs: 20, deltaPct: 25 });
  expect(c.ticketMedio.deltaPct).toBe(0);
  expect(c.truthScore).toBeNull(); // nenhum lado tem score
  expect(c.porCanal).toEqual([
    { canal: 'mercado_livre', delta: { atual: 8000, anterior: 5000, deltaAbs: 3000, deltaPct: 60 } },
    { canal: 'site', delta: { atual: 2000, anterior: 0, deltaAbs: 2000, deltaPct: null } },
    { canal: 'shopee', delta: { atual: 0, anterior: 3000, deltaAbs: -3000, deltaPct: -100 } },
  ]);
});

it('deltaNumero: anterior 0 → deltaPct null; queda → negativo com 1 casa', () => {
  expect(deltaNumero(500, 0)).toEqual({ atual: 500, anterior: 0, deltaAbs: 500, deltaPct: null });
  expect(deltaNumero(667, 1000)).toEqual({ atual: 667, anterior: 1000, deltaAbs: -333, deltaPct: -33.3 });
});

it('truthScore comparado quando ambos têm score', () => {
  const a = { ...mA, truth_score: { ...scoreStub, score: 80 } };
  const b = { ...mB, truth_score: { ...scoreStub, score: 60 } };
  expect(compararMetricas(a, b).truthScore).toEqual({ atual: 80, anterior: 60, deltaAbs: 20, deltaPct: 33.3 });
});
```

(`scoreStub` = objeto `TruthScore` válido mínimo construído no teste com `computeTruthScore(base())` ou literal completo.) `npx vitest run tests/unit/compare-reports.test.ts` → **FALHA**.
- [ ] **Step 2:** Implementar as adições em `compare.ts` → **3 passed**.
- [ ] **Step 3:** Página + form + links (código acima); `npm run build` verde.
- [ ] **Step 4:** Smoke manual: 2 relatórios done → seleção → tabela com deltas; ids de org alheia na URL → `getReportById` escopado retorna null → mensagem neutra (sem vazamento).
- [ ] **Step 5:** `npx vitest run` + `npm run typecheck`. **Commit:** `feat(f3a): comparativo de períodos com deltas + página comparar`.

---

### Task 12: Revisão final, guard E2E e fechamento

**Files:** nenhum novo (ajustes de revisão).

- [ ] **Step 1:** Rodar TUDO: `npx vitest run` (unit + integration) + `npm run typecheck` + `npm run lint` + `npm run build` → zero falhas.
- [ ] **Step 2:** Guard E2E (invariante F1): `npm run test:e2e` com os specs existentes — fluxos de login/dashboard/conexões/relatório intactos (as adições são condicionais e aditivas; nenhum testid removido).
- [ ] **Step 3:** Verificação manual de produção-config: `vercel.json` com 3 crons (watchdog preservado); `CRON_SECRET`/`PIPELINE_SECRET` documentados no `.env.example`; envs setadas no Vercel (ação do dono — registrar no resumo do PR).
- [ ] **Step 4:** Revisão ampla do branch (code-review Opus): multi-tenancy dos novos repositories (todo where com `org_id`), crons idempotentes, best-effort de notificações, retrocompat `truth_score` opcional.
- [ ] **Step 5:** Atualizar ledger `.superpowers/sdd/progress.md`. Merge `--no-ff` em `master` após aprovação. **Commit final:** `feat(f3a): automação e inteligência — cron, truth score, alertas, metas e comparativo`.

---

## Self-Review (auto-revisão do plano)

**Cobertura do escopo:**
1. **Cron de geração automática** ✅ Tasks 5–6: rota `GET /api/cron/gerar-relatorios` (Bearer `CRON_SECRET`), varre orgs active+Bling ok+ciclo vencido/null via `listOrgsElegiveisParaGeracao`, enfileira via `enqueueReport` → `POST /api/pipeline/run` (`x-pipeline-secret`), lock da F0 respeitado (conflito = `relatorio_em_andamento`, pula), espaçamento 2s + lote máx 20, `organizations.geracao_automatica` + toggle na página Conexões, e-mail de pronto já existente no `finalize` (nada duplicado), `vercel.json` ADITIVO.
2. **Truth Score** ✅ Tasks 2–4: `computeTruthScore` pura (pesos 25/25/20/20/10 documentados), persistido em `metricas.truth_score` (jsonb, sem migration de coluna, `optional()` retrocompat), período anterior + primeiro-relatório-neutro em `computeMetrics`, gauge hero (recharts F1) + delta vs anterior + breakdown por fator no detalhe, score no prompt da IA.
3. **Alertas proativos** ✅ Tasks 1, 7–9: tabela `alerts` com CHECKs (tipo/severidade) + jsonb `dados` + `resolvido`; cron diário com janela de 45 dias (orgs com done recente); queda 7d vs média 4 semanas (orders), concorrente via `posicaoPreco` do último done (market_snapshots já agregados — sem chamada externa), produto parado 14+ dias com histórico 90d; dedup por tipo+chave contra abertos; `notify` (F2) + `sendAlertaEmail` best-effort; seção no dashboard + marcar resolvido escopado por org; thresholds em `alerts.constants.ts` documentados.
4. **Comparativo + metas** ✅ Tasks 10–11: `organizations.meta_mensal` (admin define com audit; cliente vê), progresso do mês corrente (UTC) com barra glow, página Comparar com 2 selects de relatórios done e deltas % (funções puras `deltaNumero`/`compararMetricas`/`progressoMeta` com testes de tabela).

**Consistência de nomes verificada:** `geracao_automatica`/`meta_mensal` (snake_case como o schema todo); `truth_score` dentro de `Metricas` (snake_case igual jsonb persistido); `enqueueReport` único ponto de enfileiramento (action F0 + cron); `AlertaCandidato.chaveDedup` ⇄ `dados.chave_dedup` (persistência) ⇄ `AlertaAberto.chaveDedup` (leitura); `listDoneReports`/`getUltimosDoneDetalhados` no report.repository; `compare.ts` criado na Task 10 (progressoMeta) e estendido na 11 (declarado explicitamente para não duplicar).

**Placeholders:** nenhum TBD/TODO; os únicos pontos deliberadamente condicionais são as re-validações contra F0/F1/F2 exigidas pelo roadmap (assinatura real de `/api/pipeline/run`, API do `logger`, variantes do `Badge`, caminho do `notify`), cada uma com instrução concreta do que fazer em caso de divergência.

**Riscos conhecidos (aceitos):**
- `check()` do drizzle pode não existir na versão instalada → fallback explícito na Task 1 (SQL custom na migration, mesmo mecanismo da F0).
- F2 não mergeada ao executar → Task 8 instrui a ligar só o e-mail e registrar follow-up do `notify`.
- Fuso: janelas de queda/mês corrente em UTC (consistente com `evolucao` atual); refinamento para America/Sao_Paulo é dívida documentada da auditoria (item 5 "timezone"), fora do escopo F3a.
- Vercel Cron exige plano com crons diários múltiplos — mesmo requisito já assumido pela F0 (watchdog 10min).

## Execução

Subagent-driven (implementer Opus 4.8 → spec-review → code-review → fix por task; revisão ampla ao final — Task 12). Testes de integração contra o branch Neon `test` (`DATABASE_URL_TEST`); crons testados via handler `GET` importado com `fetch`/e-mail/notify mockados — nenhuma chamada externa real nos testes.
