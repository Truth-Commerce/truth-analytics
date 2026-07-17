# H3 — Calendário Sazonal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/dashboard/calendario` com as datas comerciais dos próximos 90 dias e recomendações IA por nicho usando os produtos reais do cliente, com "virar tarefa" cujo prazo é a própria data comercial; nicho inferido por IA quando ausente e editável pelo admin.

**Architecture:** `calendario-comercial.ts` (existente — `proximasDatas`) vira fonte da UI. Recomendações seguem a mecânica consagrada dos kits (H2): tabela `calendar_suggestions` 1 linha por sugestão (status/task_id), geração 1 chamada Claude por ciclo persistida com usage em `reports.calendar_ia_usage`. Os extras pós-finalize (nicho→kits→calendário) são consolidados num módulo único `pos-finalize-extras.ts` — o orquestrador chama UMA função best-effort; cada passo tem try/catch próprio (falha de um não impede o outro). Inferência de nicho: chamada mínima quando `organizations.nicho IS NULL` (once-per-org), update com guard `nicho IS NULL` (não sobrescreve edição concorrente). Ações da página usam **reserve-first** desde o início (lição H2).

**Tech Stack:** os mesmos de H2 (Next.js 14 RSC + actions, Drizzle+Neon, @anthropic-ai/sdk, Vitest). Sem lib/env nova.

**Branch:** `feat/h3-calendario` (base: `master`).

**Decisões de plano:**
- FATO revalidado: `organizations.nicho` existe desde a migration 0000 e NADA escreve nele — sem migration para nicho; inferência+edição são o gap real.
- `calendar_suggestions` espelha `kit_suggestions` (1 linha/sugestão, status `sugerido|virou_task|descartado`, task_id) — mesma mecânica de ações.
- Usage: `reports.calendar_ia_usage` (jsonb, migration 0014); usage SEMPRE registrado quando `tentativas > 0`, mesmo em falha (lição H2 F2, desde o início). Usage da inferência de nicho: só logger (once-per-org, ~centavos).
- Janela do calendário: `proximasDatas(new Date(), 90)` — datas são FUTURAS, âncora é o agora real (não `agoraEfetivo`, que serve para janelas de VENDAS).
- Task criada pelo "virar tarefa": tipo inferido pelo `inferTipoTask` existente (texto da sugestão), prioridade `media`, `criado_por 'cliente'`, **prazo = dataISO da data comercial** (coluna `tasks.prazo` já existe, date string).
- LIÇÃO INSTITUCIONALIZADA: purge-org entra NA MESMA task do schema (T1), com seed+assert no teste.

## Global Constraints

- **Migration 0014 ADITIVA e OBRIGATÓRIA antes do deploy:** `calendar_suggestions` + `reports.calendar_ia_usage`.
- **Pipeline NUNCA quebra pelos extras:** `executarExtrasPosFinalize` nunca lança (try/catch por passo + externo); o refactor do hook H2 NÃO pode alterar o resultado do pipeline nem o caminho de erro do orquestrador.
- **Multi-tenancy:** toda query nova filtra `org_id`; updates de `reports`/`organizations` com guard de org; actions via `requireActiveOrg` (cliente) / `requireAdmin` (admin).
- **Testids/textos existentes preservados**; novos com prefixo `calendario-`.
- **Sem lib/env nova.** IA: structured output padrão (zodToJsonSchema `$refStrategy:'none'` + delete `$schema`, `output_config`), usage no shape `IaUsage`.
- Testes: unit puros + integração `describe.skipIf(!url)` PREFIX+RUN cleanup escopado.
- NOTA conhecida: `purge-org.test.ts` / `cron-gerar-relatorios.test.ts` / `cron-verificar-alertas.test.ts` podem falhar na suíte paralela por lixo pré-existente no DB test (standalone passam, exceto purge-org) — se forem as ÚNICAS falhas, reportar como pré-existentes.
- Comandos: `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run test:e2e` · `npm run db:generate` · `npm run db:migrate:test`.

---

### Task 1: Schema `calendar_suggestions` + `reports.calendar_ia_usage` + purge (migration 0014)

**Files:**
- Create: `src/db/schema/calendar-suggestions.ts`
- Modify: `src/db/schema/index.ts`, `src/db/schema/reports.ts` (coluna após `kits_ia_usage`), `scripts/purge-org.ts` (import + contagem + delete na transação, ANTES de tasks/reports), `tests/integration/purge-org.test.ts` (seed 1 sugestão + assert `calendar_suggestions: 1`)
- Create: `src/db/migrations/0014_*.sql` (drizzle-kit)
- Test: `tests/integration/schema-h3.test.ts`

**Interfaces:**
- Produces (T4/T6): `calendarSuggestions` com colunas idênticas em forma a `kit_suggestions` (`id, org_id FK, report_id FK, titulo varchar(200), payload jsonb default {}, status varchar(16) default 'sugerido' CHECK sugerido|virou_task|descartado, task_id uuid null FK tasks, created_at`) + índices `(org_id, report_id)` e `(org_id, status)`; `reports.calendar_ia_usage` jsonb nullable.

- [ ] **Step 1: Schema** — criar `calendar-suggestions.ts` COPIANDO a estrutura de `src/db/schema/kit-suggestions.ts` (mesmos tipos/índices/CHECK), trocando nomes: tabela `calendar_suggestions`, índices `calendar_suggestions_org_report_idx`/`calendar_suggestions_org_status_idx`, CHECK `calendar_suggestions_status_check`, exports `calendarSuggestions`/`CalendarSuggestionRecord`/`NewCalendarSuggestionRecord`, docblock "Sugestão sazonal do calendário comercial (1 linha por sugestão)". Export no `index.ts`; `calendar_ia_usage: jsonb('calendar_ia_usage'),` no reports após `kits_ia_usage`.
- [ ] **Step 2: Purge (lição H1/H2)** — em `scripts/purge-org.ts`: import `calendarSuggestions`, contagem `calendar_suggestions` no dry-run (helper `n()` existente), `await tx.delete(calendarSuggestions).where(eq(calendarSuggestions.org_id, input.orgId));` na transação junto do delete de `kitSuggestions` (antes de tasks/reports). No teste de purge: inserir 1 linha de calendar_suggestions no org sintético (org_id + report_id do report semeado + titulo/payload mínimos) e adicionar `calendar_suggestions: 1` ao assert do dry-run.
- [ ] **Step 3: Migration** — `npm run db:generate`; INSPECIONAR: CREATE TABLE + ALTER reports ADD COLUMN + CHECK (se faltar, apêndice manual padrão 0012). `npm run db:migrate:test` (NUNCA MAIN).
- [ ] **Step 4: TDD** — criar `tests/integration/schema-h3.test.ts` espelhando `tests/integration/schema-h2.test.ts` (PREFIX `ta-test-schemah3-`): (a) insert com default 'sugerido' + roundtrip `calendar_ia_usage` no report; (b) CHECK rejeita status inválido. RED antes da migration aplicada não se aplica (migration já foi no Step 3) — rodar e exigir PASS 2/2.
- [ ] **Step 5: Verificar + commit** — `npx vitest run tests/integration/schema-h3.test.ts && npm run typecheck && npm run lint`. Purge test: rodar 1x e reportar (falha ambiental pré-existente OK; as adições devem estar corretas).

```bash
git add src/db/schema/calendar-suggestions.ts src/db/schema/index.ts src/db/schema/reports.ts src/db/migrations/ scripts/purge-org.ts tests/integration/schema-h3.test.ts tests/integration/purge-org.test.ts
git commit -m "feat(h3): tabela calendar_suggestions + reports.calendar_ia_usage (migration 0014) + purge coberto"
```

---

### Task 2: Inferência de nicho + módulo `pos-finalize-extras` (refactor do hook H2)

**Files:**
- Create: `src/modules/pipeline/steps/nicho-ia.ts`
- Create: `src/modules/pipeline/steps/pos-finalize-extras.ts`
- Modify: `src/modules/pipeline/orchestrator.ts` (bloco H2 vira UMA chamada)
- Test: `tests/unit/nicho-ia.test.ts` + `tests/unit/pos-finalize-extras.test.ts`

**Interfaces:**
- Consumes: `gerarKitsDoCiclo` (H2), `getAnthropic`/`IaUsage`, `organizations`.
- Produces (T4 pluga o passo 3):
  - `inferirNichoComIA(input: { orgName: string; topProdutos: string[] }): Promise<{ nicho: string | null; usage: IaUsage }>` — graceful (`nicho: null` em falha); `buildNichoMessages(input)` pura exportada p/ teste.
  - `gravarNichoSeVazio(orgId: string, nicho: string): Promise<boolean>` — `UPDATE organizations SET nicho WHERE id AND nicho IS NULL` (guard concorrência), retorna se gravou.
  - `executarExtrasPosFinalize(input: { orgId: string; reportId: string; orgName: string; nicho: string | null; ticketMedio: number | null; topProdutos: string[] }): Promise<void>` — NUNCA lança; passos sequenciais com try/catch individual: (1) nicho se `input.nicho === null` (re-consulta o nicho gravado p/ os passos seguintes usarem); (2) kits (código MOVIDO do orchestrator, comportamento idêntico); (3) calendário (nesta task: chamada a uma função injetável opcional `gerarCalendario?: (ctx) => Promise<unknown>` DEFAULT undefined — a T4 pluga a real; sem função = passo pulado silenciosamente. NÃO é placeholder: é ponto de extensão tipado e testado).

- [ ] **Step 1: TDD nicho** — `tests/unit/nicho-ia.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildNichoMessages, NichoIaSchema } from '@/modules/pipeline/steps/nicho-ia';

describe('buildNichoMessages', () => {
  it('inclui loja e produtos e pede UMA palavra/expressão curta', () => {
    const { system, user } = buildNichoMessages({
      orgName: 'Loja X',
      topProdutos: ['Caneca Inox', 'Filtro de Café'],
    });
    expect(system).toContain('nicho');
    expect(system).toContain('JSON');
    expect(user).toContain('Loja X');
    expect(user).toContain('Caneca Inox');
  });
});

describe('NichoIaSchema', () => {
  it('aceita nicho curto e rejeita vazio/longo', () => {
    expect(NichoIaSchema.safeParse({ nicho: 'cozinha e utilidades' }).success).toBe(true);
    expect(NichoIaSchema.safeParse({ nicho: '' }).success).toBe(false);
    expect(NichoIaSchema.safeParse({ nicho: 'x'.repeat(61) }).success).toBe(false);
  });
});
```

RED → implementar `nicho-ia.ts`: `NichoIaSchema = z.object({ nicho: z.string().min(1).max(60) }).strict()`; `buildNichoMessages` pura (system: consultor definindo o nicho da loja em 1 expressão curta pt-BR minúscula, ex. "papelaria", "moda fitness"; responder SÓ o JSON; user: nome da loja + lista topProdutos); `inferirNichoComIA` espelhando `gerarKitsComIA` PÓS-fix H2 (retorno `{ nicho: string | null; usage }`, max_tokens 300, 1 retentativa parse, nunca lança); `gravarNichoSeVazio` com o UPDATE guarded (usar `isNull(organizations.nicho)` do drizzle) → GREEN.

- [ ] **Step 2: TDD extras** — `tests/unit/pos-finalize-extras.test.ts` com `vi.mock` de `@/modules/kits/gerar-kits` e `@/modules/pipeline/steps/nicho-ia`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/kits/gerar-kits', () => ({ gerarKitsDoCiclo: vi.fn() }));
vi.mock('@/modules/pipeline/steps/nicho-ia', () => ({
  inferirNichoComIA: vi.fn(),
  gravarNichoSeVazio: vi.fn(),
}));

import { gerarKitsDoCiclo } from '@/modules/kits/gerar-kits';
import { gravarNichoSeVazio, inferirNichoComIA } from '@/modules/pipeline/steps/nicho-ia';
import { executarExtrasPosFinalize } from '@/modules/pipeline/steps/pos-finalize-extras';

const BASE = {
  orgId: 'o1',
  reportId: 'r1',
  orgName: 'Loja',
  nicho: 'cozinha' as string | null,
  ticketMedio: 80,
  topProdutos: ['A'],
};

beforeEach(() => vi.clearAllMocks());

describe('executarExtrasPosFinalize', () => {
  it('com nicho preenchido NAO infere e roda kits', async () => {
    vi.mocked(gerarKitsDoCiclo).mockResolvedValue({ kits: 2 });
    await executarExtrasPosFinalize(BASE);
    expect(inferirNichoComIA).not.toHaveBeenCalled();
    expect(gerarKitsDoCiclo).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'o1', nicho: 'cozinha' }),
    );
  });

  it('sem nicho infere, grava e passa o nicho novo adiante', async () => {
    vi.mocked(inferirNichoComIA).mockResolvedValue({
      nicho: 'papelaria',
      usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, tentativas: 1 },
    });
    vi.mocked(gravarNichoSeVazio).mockResolvedValue(true);
    vi.mocked(gerarKitsDoCiclo).mockResolvedValue(null);
    await executarExtrasPosFinalize({ ...BASE, nicho: null });
    expect(gravarNichoSeVazio).toHaveBeenCalledWith('o1', 'papelaria');
    expect(gerarKitsDoCiclo).toHaveBeenCalledWith(expect.objectContaining({ nicho: 'papelaria' }));
  });

  it('falha em um passo NAO impede o seguinte e NUNCA lança', async () => {
    vi.mocked(inferirNichoComIA).mockRejectedValue(new Error('boom'));
    vi.mocked(gerarKitsDoCiclo).mockRejectedValue(new Error('boom2'));
    await expect(executarExtrasPosFinalize({ ...BASE, nicho: null })).resolves.toBeUndefined();
    expect(gerarKitsDoCiclo).toHaveBeenCalled(); // rodou mesmo com o passo 1 explodindo
  });

  it('gerarCalendario injetado roda apos kits e falha dele tambem nao lança', async () => {
    vi.mocked(gerarKitsDoCiclo).mockResolvedValue(null);
    const gerarCalendario = vi.fn().mockRejectedValue(new Error('boom3'));
    await expect(
      executarExtrasPosFinalize({ ...BASE, gerarCalendario }),
    ).resolves.toBeUndefined();
    expect(gerarCalendario).toHaveBeenCalled();
  });
});
```

RED → implementar `pos-finalize-extras.ts` (cada passo em try/catch com `logger.warn('extras.<passo>_falhou', ...)`; passo 1 só quando `nicho === null`; nicho efetivo repassado; passo 3 só quando `gerarCalendario` fornecido) → GREEN.

- [ ] **Step 3: Rewire no orchestrator** — substituir o bloco H2 inteiro (try/catch dos kits) por:

```ts
    // H2/H3: extras pós-finalize (nicho → kits → calendário) — best-effort,
    // NUNCA afetam o resultado do pipeline (módulo nunca lança).
    await executarExtrasPosFinalize({
      orgId,
      reportId,
      orgName,
      nicho,
      ticketMedio: metricas.ticketMedio,
      topProdutos: metricas.topProdutos.map((p) => p.nome),
    });
```

(import de `executarExtrasPosFinalize`; remover o import agora órfão de `gerarKitsDoCiclo` do orchestrator; `topProdutos`: conferir o shape real de `metricas.topProdutos` em contracts.ts — tem `nome`.) O passo calendário fica dormente até a T4 (sem `gerarCalendario` injetado, o default interno da função no app é o do módulo — ver T4 que troca o default para a implementação real via import direto no próprio pos-finalize-extras, eliminando a injeção externa no orchestrator).

- [ ] **Step 4: Suíte + commit** — `npm run typecheck && npm run lint && npm test` (orchestrator.test 4/4 é o guard do refactor).

```bash
git add src/modules/pipeline/steps/nicho-ia.ts src/modules/pipeline/steps/pos-finalize-extras.ts src/modules/pipeline/orchestrator.ts tests/unit/nicho-ia.test.ts tests/unit/pos-finalize-extras.test.ts
git commit -m "feat(h3): inferencia de nicho por IA + modulo unico de extras pos-finalize (refactor do hook)"
```

---

### Task 3: IA do calendário (`calendario-ia.ts`)

**Files:**
- Create: `src/modules/calendario/calendario-ia.ts`
- Test: `tests/unit/calendario-ia.test.ts`

**Interfaces:**
- Produces (T4): `CalendarioIaSchema` (Zod): `{ sugestoes: Array<{ dataISO: string (regex ^\d{4}-\d{2}-\d{2}$); nomeData: string; titulo: string(1..200); sugestao: string; skus: string[] }> }` com `.max(8)` e `.strict()`; `type SugestaoCalendario`; `buildCalendarioMessages(input: { orgName: string; nicho: string | null; datas: { nome: string; dataISO: string; dica: string }[]; topProdutos: { sku: string; nome: string }[] }): { system, user }` pura; `gerarCalendarioComIA(input mesmo shape): Promise<{ sugestoes: SugestaoCalendario[] | null; usage: IaUsage }>` — padrão pós-fix H2: usage SEMPRE devolvido, nunca lança, max_tokens 4000, 1 retentativa parse, refusal/max_tokens sem retry.

- [ ] **Step 1: TDD** — `tests/unit/calendario-ia.test.ts` (moldar em `tests/unit/kit-ia.test.ts`): (a) buildCalendarioMessages inclui loja/nicho/datas com dicas/produtos com skus e exige JSON; (b) fallback "não informado" sem nicho; (c) schema aceita sugestão válida, rejeita dataISO malformada ('2026-13-1'), rejeita >8 sugestões. Regras do prompt (system): consultor Truth p/ lojista leigo; para CADA data relevante (nem toda data precisa de sugestão) propor ação concreta citando produtos REAIS da lista (skus verbatim); antecedência (anunciar 2-3 semanas antes); titulo curto acionável; máx 8; responder SÓ o JSON.
- [ ] **Step 2: RED → implementar** espelhando `kit-ia.ts` PÓS-fix (contrato `{ sugestoes|null, usage }`) → GREEN.
- [ ] **Step 3: Verificar + commit** — `npx vitest run tests/unit/calendario-ia.test.ts && npm run typecheck && npm run lint`.

```bash
git add src/modules/calendario/calendario-ia.ts tests/unit/calendario-ia.test.ts
git commit -m "feat(h3): geracao IA de sugestoes sazonais (prompt puro + chamada estruturada graceful)"
```

---

### Task 4: Repositório + serviço + plug no pos-finalize-extras

**Files:**
- Create: `src/modules/calendario/calendario.repository.ts`
- Create: `src/modules/calendario/gerar-calendario.ts`
- Modify: `src/modules/pipeline/steps/pos-finalize-extras.ts` (passo 3 usa a implementação real como default)
- Test: `tests/integration/calendario-repository.test.ts`

**Interfaces:**
- Consumes: `calendarSuggestions` (T1), `gerarCalendarioComIA` (T3), `proximasDatas` de `@/lib/calendario-comercial`, `getVendas30dPorSku`+`getStockRows`? NÃO — top produtos: reusar `orders` 90d como o H2 (nomes+skus vendidos); `formatDataUtc`.
- Produces (T6):
  - `insertSugestoes(orgId, reportId, sugestoes: SugestaoCalendario[]): Promise<number>` — titulo = `s.titulo.slice(0,200)`, payload `{ dataISO, nomeData, sugestao, skus }`.
  - `listSugestoesUltimoCiclo(orgId): Promise<CalendarSuggestionRecord[]>` (espelho listKitsUltimoCiclo).
  - `marcarSugestaoStatus(orgId, id, status: 'virou_task'|'descartado'): Promise<boolean>` (espelho pós-fix: sem taskId).
  - `setSugestaoTaskId(orgId, id, taskId)` + `reverterSugestaoParaSugerida(orgId, id)` (espelhos, guards idem).
  - `setCalendarIaUsage(orgId, reportId, usage)` — org-guarded (lição H2 F4).
  - `gerarCalendarioDoCiclo(input: { orgId; reportId; orgName; nicho }): Promise<{ sugestoes: number } | null>` — datas = `proximasDatas(new Date(), 90)` mapeadas p/ `{nome, dataISO: formatISO yyyy-mm-dd via toISOString().slice(0,10), dica}`; topProdutos = dos `orders` 90d (mapa sku→{nome, unidades}, top 15 por unidades; âncora `getUltimaDataPedido`); sem datas OU sem produtos → null sem IA; IA → usage sempre gravado se tentativas>0; sugestoes null/vazio → null; senão insert + retorno.
- [ ] **Step 1: TDD integração** — moldar em `tests/integration/kit-repository.test.ts` (PREFIX `ta-test-cal-`): insert+list escopado por org (2 orgs), marcar status idempotente/escopado, e o ciclo do usage org-guarded (update com org errada não grava).
- [ ] **Step 2: RED → implementar** repositório+serviço (copiar mecânica de `kit.repository.ts`/`gerar-kits.ts` pós-fixes) → GREEN.
- [ ] **Step 3: Plug no extras** — em `pos-finalize-extras.ts`, importar `gerarCalendarioDoCiclo` e usá-lo como default do passo 3 (parâmetro de injeção vira só teste-seam: `gerarCalendario ?? gerarCalendarioDoCiclo`); atualizar o unit test do módulo se o default mudar o caso "sem função injetada" (agora chama a real — nos testes, mockar `@/modules/calendario/gerar-calendario`).
- [ ] **Step 4: Suíte + commit** — `npm run typecheck && npm run lint && npm test`.

```bash
git add src/modules/calendario/ src/modules/pipeline/steps/pos-finalize-extras.ts tests/integration/calendario-repository.test.ts tests/unit/pos-finalize-extras.test.ts
git commit -m "feat(h3): repositorio+servico do calendario plugados nos extras pos-finalize"
```

---

### Task 5: Nicho editável no admin

**Files:**
- Modify: `src/app/admin/[orgId]/page.tsx` (+ componente form pequeno se o padrão da página usar client components para forms — seguir o padrão dos forms existentes NESTA página, ex. o de atribuir analista/definir meta)
- Create/Modify: action `updateOrgNichoAction` no arquivo de actions que a página já usa (conferir onde vivem as actions do admin/[orgId] — ex. `src/app/admin/[orgId]/actions.ts` ou módulo admin — usar o MESMO lugar dos existentes)
- Test: `tests/integration/admin-nicho.test.ts`

**Interfaces:**
- Produces: `updateOrgNicho(orgId, nicho: string | null)` no repositório admin (trim, vazio→null, cap 60) + action com `requireAdmin`, audit (`audit_log` no padrão das mutações admin existentes — copiar a chamada de audit de uma action vizinha), `revalidatePath('/admin/' + orgId)`.

- [ ] **Step 1: Explorar o padrão** — ler `src/app/admin/[orgId]/page.tsx` e as actions/forms vizinhos (meta mensal da F3a T10 é o molde perfeito: input + action + audit). Implementar espelhando EXATAMENTE esse fluxo: campo "Nicho" com o valor atual, submit, action valida (cap 60, trim, vazio→null), grava, audita, revalida.
- [ ] **Step 2: TDD integração** — teste do repositório: update grava/normaliza (trim, ''→null, >60 rejeita ou trunca conforme implementado — fixar comportamento: `.slice(0,60)` após trim; ''→null) escopado por org.
- [ ] **Step 3: Suíte + commit** — bateria padrão.

```bash
git add src/app/admin/ src/modules/admin/ tests/integration/admin-nicho.test.ts
git commit -m "feat(h3): nicho da organizacao editavel no admin (auditado)"
```

(Se os arquivos reais divergirem dos caminhos acima, usar os reais e anotar no report.)

---

### Task 6: Página `/dashboard/calendario` + ações + nav

**Files:**
- Create: `src/app/(client)/dashboard/calendario/page.tsx`, `calendario-actions.tsx` (client), `actions.ts` (server actions)
- Create: `src/modules/calendario/calendario-view-model.ts` + `src/modules/calendario/sugestao-to-task.ts`
- Modify: `src/components/nav-model.ts` + `src/components/command-model.ts` (+ testes de lista)
- Test: `tests/unit/calendario-view-model.test.ts` + `tests/integration/calendario-actions.test.ts`

**Interfaces:**
- View-model puro: `sugestaoView(r: CalendarSuggestionRecord)` (defaults seguros como `kitView`); `agruparPorData(sugestoes: SugestaoView[], datas: DataComercial[], hoje: Date)` → timeline: TODAS as datas de `proximasDatas(hoje, 90)` com `{ nome, dataISO, dica, faltamDias, sugestoes: SugestaoView[] }` (sugestões casadas por dataISO; datas sem sugestão aparecem só com a dica geral); `labelContagem(faltamDias)` → 'é hoje!' | 'amanhã' | 'faltam N dias'.
- `sugestaoParaTask(orgId, sugestaoId)` — **reserve-first desde o início** (copiar `kit-to-task.ts` pós-fix: reservar → createTask → compensar/patch): task com titulo `s.titulo` (cap 200), descricao com data/nome da data/sugestão/skus, `tipo: inferTipoTask(sugestao)` (import de `@/modules/tasks/report-to-task`), prioridade 'media', criadoPor 'cliente', reportId da sugestão, **`prazo: dataISO`** (conferir o shape real do createTask p/ prazo — coluna `tasks.prazo` date string; se createTask não aceitar prazo, usar o caminho que as actions da F2/G3 usam p/ setar prazo e anotar).
- Server actions `virarTarefaSugestaoAction`/`descartarSugestaoAction` (requireActiveOrg, revalidate `/dashboard/calendario` + `/dashboard/plano-de-acao` no virar) + botões com toasts pt-BR (mapa de erros — lição H2).
- Nav: `{ href: '/dashboard/calendario', label: 'Calendário' }` entre Kits e Plano de Ação; ⌘K `nav-calendario` após `nav-kits` (keywords 'datas sazonal black friday natal').
- Página RSC: PageHeader (eyebrow "Oportunidade", title "Calendário comercial", description curta) + timeline `data-testid="calendario-timeline"`, cada data um Card `data-testid="calendario-data"` com contagem regressiva, dica geral (texto muted) e as sugestões (titulo, texto, skus em `font-mono`, ações). EmptyState só se `proximasDatas` vazio (praticamente impossível) — sugestões ausentes NÃO são empty state (a timeline com dicas gerais já tem valor).

- [ ] **Step 1: TDD view-model** (casos: agrupamento casa por dataISO; data sem sugestão vem com lista vazia; faltamDias calculado por diferença UTC-midnight; labels hoje/amanhã/N; payload malformado → defaults).
- [ ] **Step 2: TDD integração sugestao-to-task** (moldar em `tests/integration/kit-actions.test.ts` pós-fix: cria task com prazo=dataISO + tipo inferido, marca sugestão, idempotente, race-state test).
- [ ] **Step 3: Implementar** view-model → sugestao-to-task → actions → página → nav/⌘K (+ testes de lista atualizados).
- [ ] **Step 4: Suíte + commit**.

```bash
git add "src/app/(client)/dashboard/calendario/" src/modules/calendario/ src/components/nav-model.ts src/components/command-model.ts tests/unit/calendario-view-model.test.ts tests/integration/calendario-actions.test.ts tests/unit/nav-model.test.ts tests/unit/command-model.test.ts
git commit -m "feat(h3): pagina /dashboard/calendario (timeline 90d + sugestoes IA + virar tarefa com prazo)"
```

---

### Task 7: Bateria final do bloco

- [ ] `npm run typecheck && npm run lint && npm test && npm run build` → verde (falhas ambientais conhecidas à parte).
- [ ] `npm run test:e2e` → 14/14.
- [ ] Commit só se ajustes forem necessários.

---

## Verificação final do bloco (fora das tasks)

1. Revisão ampla (Opus): refactor do orchestrator preservou o pipeline byte-a-byte no caminho de erro; extras isolados; multi-tenancy; purge coberto (T1 já cobre — revisor confirma); custo IA registrado (calendar + nicho log-only).
2. QA visual (dev 3200): página calendário (sugestões precisam de seed fake ou ciclo real).
3. **CUTOVER (dono): migration 0014 no Neon MAIN antes do deploy.**
4. Merge `--no-ff` mediante autorização.
5. Smoke pós-deploy: ciclo real → nicho inferido + sugestões + prazo correto na task.
