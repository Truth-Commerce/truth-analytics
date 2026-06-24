# Pipeline de Relatório + Análise IA (Claude) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar o relatório periódico completo de um cliente: coletar pedidos do Bling, coletar benchmark de mercado, calcular métricas (SQL puro), produzir a análise por IA (Claude, saída estruturada validada com Zod) e finalizar (persistir, travar o ciclo do plano, e-mail) — orquestrado por um orquestrador próprio com estado no Postgres.

**Architecture:** Cada step é uma **função pura testável** (`src/modules/pipeline/steps/*`). Um **orquestrador próprio** (`generateReport(orgId)`) cria o `report` (queued→running), roda Step 1 ∥ Step 2, depois 3→4→5, persistindo estado/erros no `reports` (status `queued|running|done|failed`). É a mitigação do spec §9 — trocar para Vercel Workflow depois é trocar o orquestrador, não reescrever steps. Princípio do spec: **o pipeline só escreve relatórios; o dashboard (Plano 5) só lê.** Dados de cliente são sagrados (Bling = falha dura); dados de mercado são desejáveis (ML/SerpAPI = degradação graciosa). Chamadas externas (Bling/SerpAPI/Claude/Resend) são MOCKADAS nos testes; chaves vêm do ambiente (deferidas).

**Tech Stack:** Next.js 14, Drizzle/Neon, `@anthropic-ai/sdk` (Claude Opus 4.8, structured outputs), Zod + `zod-to-json-schema`, `resend`, Vitest. Reaproveita Planos 1–3 (auth, admin, conexões/Bling OAuth, crypto).

## Global Constraints

- **Stack/padrões dos Planos 1–3** (em `master`): `src/db/schema/*`, `src/modules/<domínio>/`, Server Actions, gating reconsultando o DB, testes contra o branch Neon `test` (`tests/setup.ts` redireciona; `describe.skipIf(!process.env.DATABASE_URL_TEST)`).
- **Orquestrador próprio (decisão do dono):** steps são funções puras; `generateReport` orquestra com estado no `reports`. NÃO usar Vercel Workflow neste plano. Manter steps desacoplados do orquestrador (swappable).
- **IA = Claude** via `@anthropic-ai/sdk`, modelo `claude-opus-4-8` (configurável por `ANALYSIS_MODEL`), **structured outputs** (`output_config.format` = json_schema derivado do schema Zod via `zod-to-json-schema`), `thinking: { type: 'adaptive' }`, `output_config.effort: 'high'`. Resposta validada com Zod; **1 re-tentativa** com o erro no prompt; persistindo, o step falha. NUNCA logar a chave.
- **Idempotência:** `orders` upsert por `bling_order_id` (unique) — re-rodar o pipeline nunca duplica.
- **Multi-tenancy:** `orders`/`market_snapshots`/`reports` têm `org_id`; toda query filtra por `org_id`. O `org_id` vem do contexto do pipeline (passado a `generateReport`), nunca de input do cliente na action além do dele próprio (sessão).
- **Tratamento de erro (spec §5):** Bling indisponível/sem conexão → falha dura (report `failed`, **ciclo NÃO consumido** — `proximo_relatorio_liberado_em` só é setado no sucesso do Step 5). ML/SerpAPI falham → degradação graciosa (`metricas.benchmarkParcial = true`; IA instruída a não inferir sobre dados ausentes). Claude JSON inválido → 1 retry com erro no prompt → senão step falha. Falha definitiva → `report.status='failed'` + e-mail ao admin.
- **Trava do plano:** `generateReportAction` só dispara se org `active`, Bling conectado, e `proximo_relatorio_liberado_em ≤ agora`. No sucesso, `proximo_relatorio_liberado_em = agora + {7|15|30} dias` conforme `plano`.
- **E-mail do Step 5** é mínimo aqui (`sendReportReadyEmail` via Resend se configurado, senão no-op/log) — Notificações completas são o Plano 6.
- **Chaves deferidas (env opcionais):** `ANTHROPIC_API_KEY`, `SERPAPI_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`. App sobe sem elas; steps que dependem delas falham/ degradam graciosamente conforme as regras de erro.
- **Idioma:** prompts da IA e UI em pt-BR; commits conventional pt-BR.
- **Branch `feat/pipeline`** a partir de `master`. Nunca push/merge sem revisão.

## Pré-requisitos
- [ ] Branch `feat/pipeline` a partir de `master`.
- [ ] Instalar deps: `@anthropic-ai/sdk`, `zod-to-json-schema`, `resend` (Task 1).
- [ ] (Deferido, ação do Matheus p/ smoke real) `ANTHROPIC_API_KEY`, `SERPAPI_KEY`, `RESEND_API_KEY`/`EMAIL_FROM` no `.env.local`. NÃO bloqueia (tudo mockado).

---

## File Structure

| Caminho | Responsabilidade |
|---|---|
| `src/lib/env.ts` (mod) | + `ANTHROPIC_API_KEY?`, `ANALYSIS_MODEL` (default `claude-opus-4-8`), `SERPAPI_KEY?`, `SERPAPI_BASE` (default), `RESEND_API_KEY?`, `EMAIL_FROM?` |
| `src/db/schema/orders.ts`, `market-snapshots.ts`, `reports.ts` (criar) | 3 tabelas |
| `src/db/schema/index.ts` (mod) | exportar |
| `src/modules/pipeline/contracts.ts` (criar) | Zod schemas `MetricasSchema`, `AnaliseIaSchema` + tipos |
| `src/modules/providers/types.ts` (mod) | + `fetchOrders` na interface (Bling) |
| `src/modules/providers/bling/orders.ts` (criar) | client paginado de pedidos Bling (usa `getValidAccessToken`) |
| `src/modules/pipeline/steps/collect-bling.ts` (criar) | Step 1: coletar + upsert idempotente em `orders` |
| `src/modules/market/serpapi.ts`, `ml-publico.ts`, `market.types.ts` (criar) | provedores de mercado |
| `src/modules/pipeline/steps/collect-market.ts` (criar) | Step 2: → `market_snapshots` (degradação graciosa) |
| `src/modules/pipeline/steps/compute-metrics.ts` (criar) | Step 3: SQL/puro → `MetricasSchema` |
| `src/modules/pipeline/steps/analyze-ia.ts` (criar) | Step 4: Claude structured output → `AnaliseIaSchema` |
| `src/modules/pipeline/steps/finalize.ts` (criar) | Step 5: salvar, travar plano, e-mail |
| `src/modules/notifications/email.ts` (criar) | `sendReportReadyEmail`/`sendPipelineFailedEmail` (Resend, mínimo) |
| `src/modules/pipeline/orchestrator.ts` (criar) | `generateReport(orgId)` |
| `src/modules/pipeline/plan-lock.ts` (criar) | `proximoRelatorioEm(plano)`, `podeGerar(org)` |
| `src/actions/reports.actions.ts` (criar) | `generateReportAction` (valida + dispara) |
| `tests/unit/*`, `tests/integration/*` | métricas (crítico), idempotência, IA mockada, orquestrador fim-a-fim |

---

### Task 1: Schema (orders/market_snapshots/reports) + contratos Zod + env + deps

**Files:** Modify `src/lib/env.ts`, `.env.example`, `package.json`, `src/db/schema/index.ts`; Create `src/db/schema/{orders,market-snapshots,reports}.ts`, `src/modules/pipeline/contracts.ts`; Generate migration `0003_*`; Test `tests/unit/schema-pipeline.test.ts`, `tests/unit/contracts.test.ts`.

**Interfaces (Produces):**
- `orders`: id uuid pk; org_id uuid notNull FK; bling_order_id varchar(64) notNull; canal varchar(32) notNull; data timestamptz notNull; valor_total numeric(12,2) notNull; frete numeric(12,2) notNull default '0'; itens jsonb notNull default '[]'; created_at. **UNIQUE(org_id, bling_order_id)** (idempotência por org).
- `market_snapshots`: id uuid pk; org_id uuid notNull FK; report_id uuid notNull FK→reports.id; fonte varchar(32) notNull (`ml_publico|serpapi`); keyword varchar(160) notNull; dados jsonb notNull; created_at. index (report_id).
- `reports`: id uuid pk; org_id uuid notNull FK; periodo_inicio timestamptz notNull; periodo_fim timestamptz notNull; status varchar(16) notNull default `'queued'` (`queued|running|done|failed`); metricas jsonb; analise_ia jsonb; erro text; created_at/updated_at ($onUpdateFn). index (org_id, created_at).
- `contracts.ts`: `MetricasSchema` (zod), `AnaliseIaSchema` (zod), e tipos `Metricas`/`AnaliseIa`. `MetricasSchema` = `{ vendasPorCanal: {canal,total,pedidos}[]; evolucao: {data,total}[]; ticketMedio: number; topProdutos: {nome,sku,quantidade,receita}[]; posicaoPreco: {sku,nome,nossoPreco,precoMercadoMediano,fonte}[]; benchmarkParcial: boolean }`. `AnaliseIaSchema` = `{ resumoExecutivo: string; gargalos: string[]; sugestoesMelhoria: string[]; ideiasVenda: string[]; recomendacoesPreco: {sku,nome,precoSugerido,justificativa}[] }` (todos os objetos com `additionalProperties:false` no JSON Schema → usar `.strict()` nos objetos Zod).

- [ ] **Step 1: deps + env**

`npm install @anthropic-ai/sdk zod-to-json-schema resend`

Em `src/lib/env.ts`, adicionar ao schema: `ANTHROPIC_API_KEY: z.string().min(1).optional()`, `ANALYSIS_MODEL: z.string().default('claude-opus-4-8')`, `SERPAPI_KEY: z.string().min(1).optional()`, `SERPAPI_BASE: z.string().url().default('https://serpapi.com')`, `RESEND_API_KEY: z.string().min(1).optional()`, `EMAIL_FROM: z.string().optional()`. Atualizar `.env.example`.

- [ ] **Step 2: schemas das 3 tabelas + barrel** (transcrever conforme Interfaces; seguir o padrão dos schemas existentes — `numeric` de `drizzle-orm/pg-core`, `jsonb`, FKs `.references(() => ...)`, `$onUpdateFn` em reports.updated_at). Exportar em `index.ts`.

- [ ] **Step 3: `contracts.ts`** — definir `MetricasSchema`/`AnaliseIaSchema` com `z.object({...}).strict()` em cada objeto (para gerar `additionalProperties:false`), exportar tipos via `z.infer`.

- [ ] **Step 4: testes (falham primeiro)** — `schema-pipeline.test.ts` (colunas-chave: orders unique org+bling_order_id, reports status default queued); `contracts.test.ts` (um objeto válido passa em `MetricasSchema.parse`/`AnaliseIaSchema.parse`; um inválido lança). Rodar → implementar → passar.

- [ ] **Step 5: migration** `npm run db:generate` (`0003_*`), `npm run db:migrate` (main), e aplicar no test (`TEST_DIRECT=...; POSTGRES_URL_DIRECT="$TEST_DIRECT" node node_modules/drizzle-kit/bin.cjs migrate`).

- [ ] **Step 6:** `npm run test` + `npm run typecheck` verdes. **Commit:** `feat(pipeline): schema orders/market_snapshots/reports + contratos Zod + env`.

---

### Task 2: Step 1 — Coletar Bling (fetchOrders + upsert idempotente)

**Files:** Modify `src/modules/providers/types.ts`; Create `src/modules/providers/bling/orders.ts`, `src/modules/pipeline/steps/collect-bling.ts`; Test `tests/integration/collect-bling.test.ts`.

**Interfaces:**
- `ConnectionProvider` += `fetchOrders(orgId: string, periodo: { inicio: Date; fim: Date }): Promise<RawOrder[]>` onde `RawOrder = { blingOrderId: string; canal: string; data: Date; valorTotal: number; frete: number; itens: {sku?:string; nome:string; quantidade:number; valor:number}[] }`.
- `bling/orders.ts`: implementa `fetchOrders` — usa `getValidAccessToken(orgId)`, pagina `GET {BLING_API_BASE}/pedidos/vendas?...` (dataInicial/dataFinal/pagina), mapeia o payload Bling → `RawOrder[]`. Lança `bling_indisponivel` em erro de rede/4xx/5xx (falha dura). **Confirmar o caminho/params reais de pedidos contra a doc Bling v3 ao fiar.**
- `collect-bling.ts`: `collectBlingOrders(orgId, periodo): Promise<{ inseridos: number; total: number }>` — chama `blingProvider.fetchOrders`, faz **upsert por (org_id, bling_order_id)** em `orders` (onConflictDoUpdate). Sem conexão → propaga `sem_conexao_bling`.

- [ ] **Step 1:** estender a interface + implementar `bling/orders.ts` (paginação; mapping; erro duro). Ligar em `blingProvider`.
- [ ] **Step 2:** `collect-bling.ts` com upsert idempotente.
- [ ] **Step 3 (teste de integração, mock do fetch Bling):** mocka `blingProvider.fetchOrders` (vi.spyOn) retornando 2 pedidos; roda `collectBlingOrders` 2x e assere que **não duplica** (mesma `bling_order_id` → 1 linha por org, valores atualizados); assere isolamento por org. Semeia org `active` + conexão; cleanup. (Não há rede real.)
- [ ] **Step 4:** `npm run test` + `typecheck`. **Commit:** `feat(pipeline): step coletar Bling com upsert idempotente`.

---

### Task 3: Step 2 — Coletar mercado (SerpAPI + ML público, degradação graciosa)

**Files:** Create `src/modules/market/{market.types.ts,serpapi.ts,ml-publico.ts}`, `src/modules/pipeline/steps/collect-market.ts`; Test `tests/integration/collect-market.test.ts`.

**Interfaces:**
- `market.types.ts`: `interface MarketProvider { readonly fonte: 'serpapi' | 'ml_publico'; search(keyword: string): Promise<MarketResult> }`; `MarketResult = { precos: number[]; bruto: unknown }`.
- `serpapi.ts`/`ml-publico.ts`: implementam `MarketProvider` (SerpAPI usa `SERPAPI_KEY`/`SERPAPI_BASE`; ML público via API pública). Erro/sem-chave → lança/retorna vazio conforme contrato.
- `collect-market.ts`: `collectMarket(orgId, reportId): Promise<{ benchmarkParcial: boolean }>` — para cada `tracked_product` ativo, para cada keyword, chama os provedores disponíveis; grava `market_snapshots` (fonte, keyword, dados jsonb). **Degradação graciosa:** se um provedor falhar/sem chave, captura, segue, e marca `benchmarkParcial = true` (não derruba o pipeline).

- [ ] **Step 1:** providers + interface (mock-friendly).
- [ ] **Step 2:** `collect-market.ts` com captura de erro por-provedor → `benchmarkParcial`.
- [ ] **Step 3 (integração, mock dos providers):** com providers mockados (1 ok, 1 lançando) assere que `market_snapshots` recebe os do provider ok e `benchmarkParcial === true`; com todos ok → `false`; isolamento por org; cleanup.
- [ ] **Step 4:** testes + typecheck. **Commit:** `feat(pipeline): step coletar mercado com degradação graciosa`.

---

### Task 4: Step 3 — Calcular métricas (SQL puro) — determinístico crítico

**Files:** Create `src/modules/pipeline/steps/compute-metrics.ts`; Test `tests/unit/compute-metrics.test.ts`, `tests/integration/compute-metrics.test.ts`.

**Interfaces:**
- `computeMetrics(orgId, reportId, periodo): Promise<Metricas>` — lê `orders` (do período) e `market_snapshots` (do report) por `org_id`; calcula **vendas por canal**, **evolução** (por dia), **ticket médio**, **top produtos** (dos `itens`), **posição de preço** (nosso preço por sku vs mediana de `market_snapshots.dados.precos`). Sem IA. Retorna objeto validável por `MetricasSchema`. `benchmarkParcial` é passado de fora (Step 2) ou derivado (sem snapshots → true).

- [ ] **Step 1 (unit, puro):** extrair as funções puras de agregação (ex.: `ticketMedio(orders)`, `topProdutos(orders)`, `medianaPreco(snapshots)`) e testá-las com fixtures determinísticas (a "parte determinística crítica" do spec §7). Casos: ticket médio com N pedidos; top produtos somando itens; mediana com lista par/ímpar/vazia.
- [ ] **Step 2:** `computeMetrics` (DB) compõe as funções puras; valida a saída com `MetricasSchema.parse`.
- [ ] **Step 3 (integração):** semeia orders + market_snapshots numa org `active`; roda `computeMetrics`; assere os números calculados batem; cleanup.
- [ ] **Step 4:** testes + typecheck. **Commit:** `feat(pipeline): step calcular métricas (SQL puro) + testes determinísticos`.

---

### Task 5: Step 4 — Análise IA (Claude, structured outputs) — núcleo

**Files:** Create `src/modules/pipeline/steps/analyze-ia.ts`, `src/modules/ai/claude.ts`; Test `tests/unit/analyze-ia.test.ts`.

**Interfaces:**
- `claude.ts`: `getAnthropic(): Anthropic` (lazy, usa `serverEnv.ANTHROPIC_API_KEY`; lança `ia_nao_configurada` se ausente). Exportado para permitir mock.
- `analyze-ia.ts`: `analyzeWithIA(metricas: Metricas, nicho: string | null): Promise<AnaliseIa>` — monta o prompt (system pt-BR com metodologia + instrução de NÃO inferir sobre dados ausentes quando `metricas.benchmarkParcial`), chama Claude **`serverEnv.ANALYSIS_MODEL`** com `output_config: { effort: 'high', format: { type: 'json_schema', schema: zodToJsonSchema(AnaliseIaSchema) } }`, `thinking: { type: 'adaptive' }`, `max_tokens: 16000`; faz `AnaliseIaSchema.parse` no texto retornado; em erro de validação, **1 re-tentativa** acrescentando o erro ao prompt; persistindo, lança `analise_ia_invalida`.

- [ ] **Step 1 (unit, Anthropic mockado):** `vi.mock('@anthropic-ai/sdk')` (ou mockar `getAnthropic`) para retornar um JSON válido conforme `AnaliseIaSchema` → assere que `analyzeWithIA` devolve o objeto validado e que o request enviado usa `output_config.format` (json_schema) e o modelo de `ANALYSIS_MODEL`. Segundo caso: 1ª resposta inválida + 2ª válida → assere que houve retry e o resultado final é válido. Terceiro: 2 inválidas → lança `analise_ia_invalida`. NUNCA faz rede real.
- [ ] **Step 2:** implementar conforme o contrato; **não logar** a chave nem o conteúdo bruto sensível.
- [ ] **Step 3:** testes + typecheck. **Commit:** `feat(pipeline): step análise IA Claude com saída estruturada (Zod)`.

> Referência de API Claude: `@anthropic-ai/sdk`, `client.messages.create({ model, max_tokens, thinking:{type:'adaptive'}, output_config:{ effort:'high', format:{ type:'json_schema', schema } }, system, messages })`; ler o texto do primeiro bloco e `JSON.parse` → `AnaliseIaSchema.parse`. Confirme a forma de `output_config.format` para o SDK instalado ao fiar.

---

### Task 6: Step 5 Finalizar + orquestrador + trigger + e-mail + teste fim-a-fim

**Files:** Create `src/modules/notifications/email.ts`, `src/modules/pipeline/plan-lock.ts`, `src/modules/pipeline/steps/finalize.ts`, `src/modules/pipeline/orchestrator.ts`, `src/actions/reports.actions.ts`; Test `tests/unit/plan-lock.test.ts`, `tests/integration/orchestrator.test.ts`.

**Interfaces:**
- `plan-lock.ts`: `proximoRelatorioEm(plano: Plano, base?: Date): Date` (+7/+15/+30 dias); `podeGerar(org: {status; plano; proximo_relatorio_liberado_em}): { ok: boolean; motivo?: string }` (active + plano definido + (proximo ≤ agora ou null)).
- `email.ts`: `sendReportReadyEmail(to, reportId)` e `sendPipelineFailedEmail(orgId, reportId, erro)` — usam Resend se `RESEND_API_KEY`/`EMAIL_FROM` setados, senão no-op + log (mínimo; Plano 6 expande).
- `finalize.ts`: `finalize(reportId, orgId, metricas, analise, plano)` — `update reports set status='done', metricas, analise_ia`; `update organizations set proximo_relatorio_liberado_em = proximoRelatorioEm(plano)`; `sendReportReadyEmail`. (A trava só é setada AQUI — no sucesso.)
- `orchestrator.ts`: `generateReport(orgId): Promise<{ reportId: string; status: 'done'|'failed' }>` — busca org (plano/nicho), cria `report` (status `running`, periodo), roda `collectBlingOrders` ∥ `collectMarket` (Promise.all; Bling erro → falha dura), `computeMetrics`, `analyzeWithIA`, `finalize`. Em qualquer erro: `update reports set status='failed', erro=...`; `sendPipelineFailedEmail` ao admin; **não** seta a trava. Retorna status.
- `reports.actions.ts`: `generateReportAction(): Promise<{ error?: string; reportId?: string }>` — `requireActiveOrg`; checa `podeGerar` + Bling conectado (`getConnection`); se ok, chama `generateReport(access.orgId)` e retorna. (MVP: aguarda o orquestrador; nota: produção move para background/Vercel Workflow p/ durabilidade — fora do escopo.)

- [ ] **Step 1 (unit):** `plan-lock.test.ts` — `proximoRelatorioEm('weekly')` = +7d, biweekly +15, monthly +30; `podeGerar` cobre: pending→não, sem plano→não, proximo no futuro→não, proximo passado/null + active→sim.
- [ ] **Step 2:** implementar email (mínimo), plan-lock, finalize.
- [ ] **Step 3:** implementar `orchestrator` (Bling falha dura; mercado graciosa; erro→failed sem travar) e `generateReportAction`.
- [ ] **Step 4 (integração fim-a-fim, tudo mockado):** com `blingProvider.fetchOrders`, market providers e `getAnthropic`/`analyzeWithIA` mockados, semeia org `active` + Bling conectado + tracked_products; roda `generateReport(orgId)`; assere: `reports` 1 linha `done` com `metricas` e `analise_ia` preenchidos; `organizations.proximo_relatorio_liberado_em` setado conforme o plano. Segundo caso: Bling falha (mock lança) → report `failed`, **trava NÃO setada** (proximo permanece). Cleanup completo.
- [ ] **Step 5:** `npm run test` (todas), `typecheck`, `lint`, `build`. **Verificar MAIN limpo** (orders/market_snapshots/reports = 0):
  ```
  node -e 'const p=require("postgres");const fs=require("fs");const u=fs.readFileSync(".env.local","utf8").match(/^POSTGRES_URL=(.*)$/m)[1];const sql=p(u,{prepare:false});(async()=>{try{for(const t of ["orders","market_snapshots","reports"]){const r=await sql.unsafe(`select count(*)::int n from ${t}`);console.log("MAIN",t,r[0].n);}}finally{await sql.end();}})()'
  ```
  Esperado tudo 0. Se não, PARAR.
- [ ] **Step 6:** **Commit:** `feat(pipeline): finalizar + orquestrador + trigger generateReport + e-mail mínimo`.

---

## Self-Review

**Cobertura (§3.4 + §4 + §5):** 5 steps (Tasks 2–6) ✅; schema orders/market_snapshots/reports (Task 1) ✅; idempotência de orders (Task 2) ✅; métricas SQL determinísticas (Task 4) ✅; IA Claude structured outputs + Zod + 1 retry (Task 5) ✅; finalizar/trava/e-mail (Task 6) ✅; erros: Bling falha dura + ciclo não consumido, mercado graciosa, IA inválida retry, falha→failed+email (Task 6) ✅.

**Lacunas/deferidas:** Vercel Workflow (decisão: orquestrador próprio swappable); smoke real Bling/SerpAPI/Claude/Resend (chaves env, deferido — tudo mockado); UI de "Gerar análise" + visualização do relatório (Plano 5 Dashboard); notificações completas (Plano 6); `last_sync_at` (pode ser setado no Step 1 — incluir se trivial). Backgrounding do orquestrador na action (produção) — nota no contrato; MVP aguarda.

**Consistência:** `MetricasSchema`/`AnaliseIaSchema` (Task 1) consumidos por Tasks 4/5; `RawOrder`/`fetchOrders` (Task 2) por orchestrator; `Plano` reusado; `generateReport` (Task 6) compõe todos os steps.

---

## Execução
Subagent-driven (implementer + review por task; revisão ampla ao final). Externos mockados; chaves deferidas. Testes contra o branch Neon `test`.
