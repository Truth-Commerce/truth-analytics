# G0 — Verdade dos Dados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Fazer o produto contar a verdade: (1) **sync incremental diário de pedidos** (cron) para que meta mensal, alertas e "vendas de ontem" leiam dados vivos — não a foto congelada do último relatório; (2) **alertas honestos**: guarda de frescor (janelas ancoradas no dado mais recente, não no relógio), cooldown pós-resolução, digest de 1 e-mail por org e índice único anti-corrida; (3) **janela do relatório em dias fechados no calendário America/Sao_Paulo** (fim = ontem, dia completo; início = ontem − (N−1) dias) — some o "1º dia fora / último dia parcial"; (4) **benchmarkParcial verdadeiro** (só quando um provider ATIVO falha ou zero snapshots); (5) **backoff da auto-geração** + custo de IA persistido por relatório; (6) **chamada Claude robusta** (checa `stop_reason`, retenta truncamento via streaming com orçamento maior); (7) **tokens Bling renovados proativamente** + aviso de conexão expirada (in-app, banner, admin); (8) notificação in-app "relatório pronto" + feedback visível do OAuth callback; (9) **stepper retomável** após reload; (10) card **"Status do sistema"** no /admin.

**Architecture:** Segue o padrão do repo (rotas de cron finas → helpers/repositories testáveis, funções puras separadas do I/O, contratos explícitos nas fronteiras):

- **Sync de pedidos** (`src/modules/pipeline/sync-pedidos.ts` + `GET /api/cron/sincronizar-pedidos`): a rota autenticada por `CRON_SECRET` (comparação timing-safe via `secretsMatch`, padrão de `verificar-alertas`) lista orgs `active` com conexão Bling `status='ok'` e chama `sincronizarPedidosDaOrg(orgId, agora)` — que **reusa `collectBlingOrders`** (upsert idempotente por `(org_id, bling_order_id)`) com janela dos últimos 2 dias. `collectBlingOrders` passa a gravar `connections.last_sync_at` (coluna **já existe**) ao final — pipeline e sync registram frescor pelo mesmo caminho. Try/catch por org; lote máx. 50.
- **Alertas** (`src/modules/alerts/*`): detectores puros ficam intocados; o cron passa a usar `MAX(orders.data)` como **"agora efetivo"** das janelas (sem dado → pula queda/parado; concorrente continua, pois lê `posicaoPreco` do último done). Dedup amplia para abertos **+ resolvidos há ≤7 dias** (`listAlertasParaDedup`). Persistência ganha índice único parcial `(org_id, tipo, dados->>'chave_dedup') WHERE resolvido = false` + `ON CONFLICT DO NOTHING`. E-mail vira **digest** (1 por org/execução); in-app continua 1 por alerta.
- **Janela BRT** (`src/lib/timezone.ts` + `periodoDoPlano`): helpers puros com `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })` decidem **qual dia-calendário** é "ontem"; as fronteiras são codificadas em UTC (00:00:00.000Z / 23:59:59.999Z) porque `orders.data` vem do Bling como data pura (meia-noite UTC). `enqueueReport` e o disparo manual do admin passam a usar o MESMO `periodoDoPlano`.
- **IA** (`src/modules/pipeline/steps/analyze-ia.ts`): `analyzeWithIA` devolve `{ analise, usage }`; o orquestrador repassa `usage` ao `finalize`, que persiste em `reports.ia_usage` (jsonb, migration aditiva). `stop_reason` é checado antes do parse: `refusal` → `analise_ia_recusada`; `max_tokens` → retentativa via `messages.stream(...).finalMessage()` com `max_tokens: 32000` (a retentativa de parse também migra p/ stream). Erros continuam mapeados p/ `report.erro` pelo orquestrador (contrato preservado).
- **Scheduler**: `listOrgsElegiveisParaGeracao` exclui org cujo relatório MAIS RECENTE é `failed` com menos de 2 dias (subquery `NOT EXISTS`); passo novo no cron `gerar-relatorios` desliga `geracao_automatica` após 3 failed consecutivos e avisa o admin por e-mail (best-effort).
- **Tokens Bling** (`src/modules/connections/token-renewal.ts`): no MESMO cron de sync (roda ANTES do sync), conexões `ok` com `expira_em` ≤ 24h são renovadas via `getValidAccessToken(orgId, margemMs)` (assinatura ganha margem opcional; default preserva os 60s atuais). Falha → repositório já marca `expirado` + e-mail; o helper adiciona notify() in-app p/ cliente e analista (uma vez só — a conexão sai de `ok` e não é re-selecionada). Dashboard ganha banner `Alert danger` quando `connection.status === 'expirado'`; badge "Expirada" da lista admin muda de `warn` → `danger`.
- **UX de confiança**: `finalize` dispara notify() in-app "relatório pronto" (best-effort); `/conexoes` lê `?ok=1`/`?erro=` do callback OAuth via helper puro `feedbackDeCallback`; dashboard remonta o `GenerationProgress` (polling existente) quando `latest.status ∈ {queued, running}`; `/admin` ganha `SystemStatusCard` (server component lendo `serverEnv` — só presença/ausência, NUNCA valores).

**Tech Stack:** Next.js 14 (App Router), Drizzle/Neon (`postgres.js`), Zod, Vercel Cron (**adicionar** entrada ao array `crons` de `vercel.json`, nunca sobrescrever), `@anthropic-ai/sdk` ^0.106 (`messages.create` + `messages.stream().finalMessage()`), módulo notifications existente (Resend no-op sem chave + `notify` in-app), Vitest (unit em `tests/unit`, integração em `tests/integration` no branch Neon `test` via `DATABASE_URL_TEST`), Playwright E2E existente **intocado**.

## Global Constraints

- **Banco:** Next 14 App Router + Drizzle + Neon. Testes de integração SEMPRE no branch `test` via `DATABASE_URL_TEST` (redirect em `tests/setup.ts`); **NUNCA** rodar teste contra produção. `tests/setup.ts` é **intocável**. Todo teste de integração usa `describe.skipIf(!process.env.DATABASE_URL_TEST)` com cleanup em `afterAll`/`finally`.
- **TDD por task:** escrever teste falhando → rodar (`npm run test -- <arquivo>`, esperar FALHA) → implementar → rodar (esperar PASSA) → commit. Rodar SEMPRE `npm run test` (nunca `vitest` direto — o script usa `vitest run` com o setup correto).
- **Copy de UI SEMPRE pt-BR.** Commits em português no padrão `feat(g0): ...` / `fix(g0): ...` / `test(g0): ...`.
- **Multi-tenancy inegociável:** TODA query escopada por `org_id`; `orgId` vem da sessão (ou do loop server-side do cron), nunca de input do cliente.
- **E-mail/notificação são best-effort:** try/catch, NUNCA quebram o fluxo principal (padrão já estabelecido em `src/modules/notifications/email.ts` e `notify`).
- **Preservar 100% os testids/fluxos dos E2E existentes** (`tests/e2e/*.spec.ts`): `bling-status`, `generate-report-button`, `latest-report`, `ver-relatorio`, `generation-progress`, texto "Conecte o Bling em Conexões.", `admin-org-reports`, etc. Mudanças de UI são ADITIVAS.
- **Migrations SEMPRE aditivas** (ADD COLUMN nullable, CREATE INDEX; nunca DROP/ALTER destrutivo). Aplicar no branch `test` com `npm run db:migrate:test` antes dos testes de integração. Aplicação no Neon MAIN é passo operacional do dono (ver "Operacional" no fim).
- **Crons idempotentes e resilientes:** falha em UMA org não aborta o lote (try/catch por org + `logger`); auth `Authorization: Bearer ${CRON_SECRET}` com `secretsMatch` (timing-safe); sem header → 401 sem detalhe.
- **Regra de ouro:** antes de cada task, re-validar os trechos citados contra o `master` atual (HEAD `5c07999`, pós-merge F3a). Divergência pequena = ajustar inline; estrutural = parar e revisar.
- **Sem libs novas.**
- **Branch:** `feat/g0-verdade-dos-dados` a partir de `master`.

## Divergências do escopo auditado → adaptações (verificadas no código real em 5c07999)

1. **`connections.last_sync_at` JÁ EXISTE** (`src/db/schema/connections.ts:24`) e já é lida por `getConnection`/`getOrgConnectionHealth` — a Task 1 **não cria coluna**, só passa a gravá-la (no `collectBlingOrders`, cobrindo pipeline E sync).
2. **`periodoDoPlano` vive em `src/modules/admin/periodo-plano.ts`** (não em `src/modules/reports/`). A Task 3 o reescreve lá e faz `enqueue.ts` importá-lo (fonte única de janela p/ action do cliente, cron e disparo manual do admin — `admin.actions.ts:145` já o usa).
3. **Fronteiras da janela em UTC, não em BRT literal:** `orders.data` vem do Bling como data pura (`"YYYY-MM-DD"` → `new Date(...)` = meia-noite **UTC**; ver `src/modules/providers/bling/orders.ts:49` e `evolucao()` em `compute-metrics.ts:60`). Fim de ontem "23:59:59.999 BRT" (= 02:59Z de hoje) INCLUIRIA os pedidos de hoje e EXCLUIRIA os do 1º dia. Adaptação: o fuso America/Sao_Paulo decide **qual dia-calendário é ontem** (`hojeBrt`/`ontemBrt`); as fronteiras são `00:00:00.000Z`/`23:59:59.999Z` desses dias. Consequência: `formatPeriodo` formata em `timeZone: 'UTC'` (fronteiras são dias-calendário codificados em UTC) e `formatData` (instantes reais: created_at, expira_em) ganha `timeZone: 'America/Sao_Paulo'`.
4. **Fix adicional na janela do período anterior** (`compute-metrics.ts:258-276`): com dias fechados, um pedido exatamente em `periodo.inicio` era contado nos DOIS períodos (`between` inclusivo). Task 3 corrige para `gte/lt` e duração `fim − inicio + 1ms` (N dias exatos).
5. **Duas migrations geradas por drizzle-kit** (padrão das 0006/0007): `0008` (índice único parcial de alerts, Task 2 — com UPDATE de limpeza de duplicatas prependado à mão) e `0009` (`reports.ia_usage`, Task 5). Decisão documentada: separadas, cada uma na task que a consome.
6. **Badge "Expirada" na lista admin JÁ existe** (`client-row.tsx:41`, variant `warn`) — Task 7 só muda para `danger` (vermelho).
7. **`analyzeWithIA` muda o contrato de retorno na Task 5** (`AnaliseIa` → `{ analise, usage }`) — orquestrador, finalize e os mocks de `tests/integration/orchestrator.test.ts` + `tests/unit/analyze-ia.test.ts` são atualizados na MESMA task. A Task 6 preserva esse contrato.
8. **Retentativa da IA passa a usar `messages.stream()` SEMPRE** (tanto p/ truncamento quanto p/ correção de parse) com `max_tokens: 32000` — um único caminho de retry, coberto pelo skill claude-api (streaming p/ max_tokens alto evita timeout HTTP).
9. **Renovação de tokens no MESMO cron de sync** (decisão pela simplicidade, prevista no escopo): passo de refresh roda ANTES do sync, para que conexões renovadas sincronizem e conexões que viraram `expirado` saiam da lista.
10. **Helpers de cron ficam FORA de `route.ts`** (Next só permite exportar handlers/config de route files): `sync-pedidos.ts` e `token-renewal.ts` — também isola os testes de integração (testar o helper com a PRÓPRIA org, sem varrer orgs de outras suítes no branco `test` compartilhado).

## Constantes de negócio (decididas AQUI — não rediscutir)

| Constante | Valor | Onde | Significado |
|---|---|---|---|
| `JANELA_SYNC_DIAS` | `2` | sync-pedidos.ts | sync incremental cobre os últimos 2 dias (pedidos atrasados de ontem + hoje parcial) |
| `LOTE_MAXIMO_SYNC` | `50` | sync-pedidos.ts | máx. de orgs sincronizadas por execução do cron |
| Cron sincronizar-pedidos | `0 7 * * *` | vercel.json | 7h UTC = 4h BRT — antes de gerar-relatorios (9h) e verificar-alertas (9h30), que passam a ler dado fresco |
| `ALERTA_COOLDOWN_DIAS` | `7` | alerts.constants.ts | alerta resolvido não renasce por 7 dias (dedup por tipo+chave_dedup) |
| `BACKOFF_FALHA_DIAS` | `2` | scheduler.service.ts | org cujo último report é failed há <2 dias sai da elegibilidade automática |
| `FALHAS_CONSECUTIVAS_PAUSA` | `3` | scheduler.service.ts | 3 failed consecutivos → `geracao_automatica = false` + e-mail admin |
| `MARGEM_RENOVACAO_MS` | `24h` | token-renewal.ts | tokens Bling expirando em ≤24h são renovados proativamente |
| `MAX_TOKENS_RETENTATIVA` | `32000` | analyze-ia.ts | orçamento da 2ª tentativa (via stream) quando a 1ª truncou ou falhou parse |

## File Structure

| Caminho | Ação | Task | Responsabilidade |
|---|---|---|---|
| `src/modules/connections/connection.repository.ts` | mod | 1, 7 | + `listOrgsComBlingOk`, `touchLastSyncAt`; `getValidAccessToken(orgId, margemMs?)`; + `listConnectionsExpirando` |
| `src/modules/pipeline/sync-pedidos.ts` | criar | 1 | `sincronizarPedidosDaOrg` (reusa `collectBlingOrders`) + constantes |
| `src/modules/pipeline/steps/collect-bling.ts` | mod | 1 | grava `last_sync_at` ao final (best-effort) |
| `src/app/api/cron/sincronizar-pedidos/route.ts` | criar | 1, 7 | cron diário: renovação de tokens (T7) + sync (T1) |
| `vercel.json` | mod | 1 | + cron 7h UTC (preservar os 3 existentes) |
| `src/modules/alerts/alerts.constants.ts` | mod | 2 | + `ALERTA_COOLDOWN_DIAS` |
| `src/modules/alerts/alert-data.repository.ts` | mod | 2 | + `getUltimaDataPedido` |
| `src/modules/alerts/alert.repository.ts` | mod | 2 | + `listAlertasParaDedup`; `criarAlertas` com `onConflictDoNothing` |
| `src/db/schema/alerts.ts` | mod | 2 | + índice único parcial (expressão `dados->>'chave_dedup'`) |
| `src/db/migrations/0008_*.sql` | gerar+editar | 2 | limpeza de duplicatas abertas + CREATE UNIQUE INDEX |
| `src/modules/notifications/templates.ts` | mod | 2, 5 | + `alertasDigestTemplate`, `autoGeracaoPausadaTemplate` |
| `src/modules/notifications/email.ts` | mod | 2, 5 | + `sendAlertasDigestEmail`, `sendAutoGeracaoPausadaEmail` |
| `src/app/api/cron/verificar-alertas/route.ts` | mod | 2 | agora efetivo + dedup c/ cooldown + digest |
| `src/lib/timezone.ts` | criar | 3 | `hojeBrt`, `ontemBrt`, `inicioDeDiaUtc`, `fimDeDiaUtc`, `janelaDiasFechados` (puros) |
| `src/modules/admin/periodo-plano.ts` | mod | 3 | `periodoDoPlano` → dias fechados BRT |
| `src/modules/pipeline/enqueue.ts` | mod | 3 | usa `periodoDoPlano` (remove cálculo inline) |
| `src/lib/format.ts` | mod | 3 | `formatData` BRT (instantes); `formatPeriodo` UTC (dias-calendário) |
| `src/modules/pipeline/steps/compute-metrics.ts` | mod | 3 | período anterior sem double-count na fronteira |
| `src/modules/pipeline/steps/collect-market.ts` | mod | 4 | `providersAtivos()` filtra SERPAPI pela config |
| `src/modules/pipeline/steps/analyze-ia.ts` | mod | 4, 5, 6 | aviso benchmark em 3 casos; `{analise, usage}`; stop_reason + stream retry |
| `src/modules/scheduler/scheduler.service.ts` | mod | 5 | + `BACKOFF_FALHA_DIAS`, `FALHAS_CONSECUTIVAS_PAUSA` |
| `src/modules/scheduler/scheduler.repository.ts` | mod | 5 | backoff NOT EXISTS + `listOrgsComFalhasConsecutivas` |
| `src/app/api/cron/gerar-relatorios/route.ts` | mod | 5 | passo de pausa por falhas consecutivas |
| `src/db/schema/reports.ts` | mod | 5 | + `ia_usage: jsonb` (nullable) |
| `src/db/migrations/0009_*.sql` | gerar | 5 | ALTER TABLE reports ADD COLUMN ia_usage jsonb |
| `src/modules/pipeline/orchestrator.ts` | mod | 5 | destructura `{analise, usage}` e repassa ao finalize |
| `src/modules/pipeline/steps/finalize.ts` | mod | 5, 8 | persiste `ia_usage`; notify in-app "relatório pronto" |
| `src/modules/admin/admin.repository.ts` | mod | 5 | `listOrgReports` devolve `iaUsage` |
| `src/app/admin/[orgId]/page.tsx` | mod | 5 | coluna "IA (tokens)" na tabela de relatórios |
| `src/modules/connections/token-renewal.ts` | criar | 7 | `renovarConexaoDaOrg` + notify expiração + `MARGEM_RENOVACAO_MS` |
| `src/app/(client)/dashboard/page.tsx` | mod | 7, 9 | banner conexão expirada; stepper retomável |
| `src/app/admin/client-row.tsx` | mod | 7 | badge Expirada `warn` → `danger` |
| `src/app/(client)/conexoes/callback-feedback.ts` | criar | 8 | `feedbackDeCallback` puro (ok/erro → copy pt-BR) |
| `src/app/(client)/conexoes/page.tsx` | mod | 8 | Alert de sucesso/erro do callback OAuth |
| `src/app/(client)/dashboard/generate-report.tsx` | mod | 9 | prop `emAndamentoReportId` → `GenerationProgress` montado do server |
| `src/modules/admin/system-status.ts` | criar | 10 | `statusDoSistema(env)` puro |
| `src/app/admin/system-status-card.tsx` | criar | 10 | card server-only (presença/ausência, nunca valores) |
| `src/app/admin/page.tsx` | mod | 10 | renderiza `SystemStatusCard` |
| `tests/unit/*`, `tests/integration/*` | criar/mod | todas | ver tasks |

---

### Task 1: Cron de sync incremental diário de pedidos

**Files:**
- Modify: `src/modules/connections/connection.repository.ts` (+ `listOrgsComBlingOk`, `touchLastSyncAt`)
- Create: `src/modules/pipeline/sync-pedidos.ts`
- Modify: `src/modules/pipeline/steps/collect-bling.ts` (grava `last_sync_at` ao final)
- Create: `src/app/api/cron/sincronizar-pedidos/route.ts`
- Modify: `vercel.json` (+ 1 cron)
- Test: `tests/integration/sync-pedidos.test.ts` (novo)

**Interfaces:**
- Consumes: `collectBlingOrders(orgId: string, periodo: Periodo): Promise<CollectResult>` (`src/modules/pipeline/steps/collect-bling.ts` — upsert idempotente por `(org_id, bling_order_id)`; **NÃO duplicar essa lógica**); `secretsMatch(recebido, esperado)` de `src/lib/secret-compare.ts`; `serverEnv.CRON_SECRET`; `logger` de `src/lib/logger.ts`; schema `connections` (coluna `last_sync_at` já existe).
- Produces (contrato para a Task 7, que estende esta rota):
  - `listOrgsComBlingOk(): Promise<string[]>` — org_ids `active` com conexão bling `status='ok'` e `access_token` não nulo.
  - `touchLastSyncAt(orgId: string, quando?: Date): Promise<void>`.
  - `sincronizarPedidosDaOrg(orgId: string, agora: Date): Promise<CollectResult>` + `JANELA_SYNC_DIAS = 2`, `LOTE_MAXIMO_SYNC = 50` em `src/modules/pipeline/sync-pedidos.ts`.
  - Rota `GET /api/cron/sincronizar-pedidos` → 500 `{error:'cron_nao_configurado'}` sem secret; 401 sem/erro de Bearer; 200 `{ orgs, sincronizadas, falhas }`.

- [ ] **Step 1 — teste de integração falhando.** Criar `tests/integration/sync-pedidos.test.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// vi.mock é hoisted — literal repetido em CRON_SECRET_TEST abaixo.
vi.mock('@/lib/env', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/env')>();
  return {
    ...mod,
    serverEnv: { ...mod.serverEnv, CRON_SECRET: 'cron-sincronizar-teste-16+++' },
  };
});

const CRON_SECRET_TEST = 'cron-sincronizar-teste-16+++';

import { db } from '@/db/client';
import { connections, orders, organizations } from '@/db/schema';
import { blingProvider } from '@/modules/providers/bling/provider';
import type { RawOrder } from '@/modules/providers/types';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-sync-';

function req(auth?: string): Request {
  return new Request('http://localhost:3000/api/cron/sincronizar-pedidos', {
    headers: auth ? { authorization: auth } : {},
  });
}

describe.skipIf(!url)('sync incremental de pedidos — integração', () => {
  let orgId = '';
  let orgErroId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    await db.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: 'tok-fake',
      refresh_token: 'rt-fake',
      status: 'ok',
      expira_em: new Date(Date.now() + 30 * 86_400_000),
    });

    // Org com conexão 'erro' — NÃO deve entrar na lista de sync.
    const [org2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-erro-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgErroId = org2!.id;
    await db.insert(connections).values({
      org_id: orgErroId,
      provider: 'bling',
      access_token: null,
      refresh_token: null,
      status: 'erro',
    });
  });

  afterAll(async () => {
    try {
      await db.delete(orders).where(eq(orders.org_id, orgId));
      await db.delete(connections).where(eq(connections.org_id, orgId));
      await db.delete(connections).where(eq(connections.org_id, orgErroId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgErroId));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('listOrgsComBlingOk inclui org ok e exclui org com status erro', async () => {
    const { listOrgsComBlingOk } = await import('@/modules/connections/connection.repository');
    const ids = await listOrgsComBlingOk();
    expect(ids).toContain(orgId);
    expect(ids).not.toContain(orgErroId);
  });

  it('sincronizarPedidosDaOrg upserta pedidos da janela de 2 dias e grava last_sync_at', async () => {
    const agora = new Date();
    const pedidoFake: RawOrder = {
      blingOrderId: `${PREFIX}${RUN}-1`,
      canal: 'bling',
      data: new Date(agora.getTime() - 86_400_000),
      valorTotal: 150.5,
      frete: 10,
      itens: [],
    };
    const fetchSpy = vi
      .spyOn(blingProvider, 'fetchOrders')
      .mockImplementation(async (oid, _periodo, onPage) => {
        if (oid === orgId && onPage) await onPage([pedidoFake]);
        return [];
      });

    try {
      const { sincronizarPedidosDaOrg, JANELA_SYNC_DIAS } = await import(
        '@/modules/pipeline/sync-pedidos'
      );
      const result = await sincronizarPedidosDaOrg(orgId, agora);
      expect(result.processados).toBe(1);

      // Janela: inicio = agora - 2 dias, fim = agora
      const periodo = fetchSpy.mock.calls[0][1];
      expect(periodo.fim.getTime()).toBe(agora.getTime());
      expect(periodo.inicio.getTime()).toBe(agora.getTime() - JANELA_SYNC_DIAS * 86_400_000);

      // Pedido upsertado (escopado à MINHA org)
      const [row] = await db
        .select({ valor: orders.valor_total })
        .from(orders)
        .where(and(eq(orders.org_id, orgId), eq(orders.bling_order_id, pedidoFake.blingOrderId)));
      expect(row).toBeDefined();
      expect(Number(row!.valor)).toBe(150.5);

      // last_sync_at gravado
      const [conn] = await db
        .select({ last: connections.last_sync_at })
        .from(connections)
        .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));
      expect(conn!.last).not.toBeNull();

      // Idempotência: rodar de novo NÃO duplica
      await sincronizarPedidosDaOrg(orgId, agora);
      const todas = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.org_id, orgId), eq(orders.bling_order_id, pedidoFake.blingOrderId)));
      expect(todas.length).toBe(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('rota: sem header de autorização → 401', async () => {
    const { GET } = await import('@/app/api/cron/sincronizar-pedidos/route');
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it('rota: Bearer errado → 401', async () => {
    const { GET } = await import('@/app/api/cron/sincronizar-pedidos/route');
    const res = await GET(req('Bearer errado-mas-16-chars+'));
    expect(res.status).toBe(401);
  });
});
```

> NOTA: o caminho autorizado da rota NÃO é exercido aqui de propósito — ele varreria orgs de OUTRAS suítes no branch `test` compartilhado. O corpo do sync é coberto via `sincronizarPedidosDaOrg` com a própria org.

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/integration/sync-pedidos.test.ts` (FALHA: módulos não existem).
- [ ] **Step 3 — implementar.** Em `src/modules/connections/connection.repository.ts`, adicionar `isNotNull` ao import de `drizzle-orm` (linha 1: `import { and, eq, isNotNull } from 'drizzle-orm';`), adicionar `organizations` ao import de schema (linha 4: `import { connections, organizations } from '@/db/schema';`) e acrescentar ao FINAL do arquivo:

```ts
/**
 * Orgs `active` com conexão Bling saudável (status 'ok' e access_token
 * presente) — universo do cron de sync incremental de pedidos.
 */
export async function listOrgsComBlingOk(): Promise<string[]> {
  const rows = await db
    .select({ orgId: connections.org_id })
    .from(connections)
    .innerJoin(organizations, eq(organizations.id, connections.org_id))
    .where(
      and(
        eq(connections.provider, PROVIDER),
        eq(connections.status, 'ok'),
        isNotNull(connections.access_token),
        eq(organizations.status, 'active'),
      ),
    );
  return rows.map((r) => r.orgId);
}

/**
 * Registra o instante da última sincronização de pedidos da org (frescor dos
 * dados). Chamado por collectBlingOrders — pipeline e cron de sync passam
 * pelo mesmo caminho.
 */
export async function touchLastSyncAt(orgId: string, quando: Date = new Date()): Promise<void> {
  await db
    .update(connections)
    .set({ last_sync_at: quando })
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, PROVIDER)));
}
```

- [ ] **Step 4 — collect-bling grava frescor.** Em `src/modules/pipeline/steps/collect-bling.ts`, adicionar o import (após a linha 5 `import { blingProvider } ...`):

```ts
import { touchLastSyncAt } from '@/modules/connections/connection.repository';
```

e no corpo de `collectBlingOrders`, entre o `await blingProvider.fetchOrders(...)` e o `return { processados, total };` (linhas 56-61 atuais), inserir:

```ts
  // Frescor: registra a última sincronização bem-sucedida (best-effort — um
  // update de metadado nunca derruba uma coleta que já persistiu os pedidos).
  try {
    await touchLastSyncAt(orgId);
  } catch {
    // nunca quebra a coleta
  }
```

- [ ] **Step 5 — helper de sync.** Criar `src/modules/pipeline/sync-pedidos.ts`:

```ts
import { collectBlingOrders, type CollectResult } from '@/modules/pipeline/steps/collect-bling';

/** Sync incremental cobre os últimos 2 dias (pedidos atrasados de ontem + hoje parcial). */
export const JANELA_SYNC_DIAS = 2;
/** Máx. de orgs sincronizadas por execução do cron (protege maxDuration=300s). */
export const LOTE_MAXIMO_SYNC = 50;

const DIA_MS = 86_400_000;

/**
 * Sincroniza os pedidos recentes de UMA org reutilizando a coleta idempotente
 * do pipeline (`collectBlingOrders` — upsert por (org_id, bling_order_id)).
 * Erros do Bling propagam — o chamador (cron) faz try/catch por org.
 */
export async function sincronizarPedidosDaOrg(orgId: string, agora: Date): Promise<CollectResult> {
  const periodo = { inicio: new Date(agora.getTime() - JANELA_SYNC_DIAS * DIA_MS), fim: agora };
  return collectBlingOrders(orgId, periodo);
}
```

- [ ] **Step 6 — rota do cron.** Criar `src/app/api/cron/sincronizar-pedidos/route.ts` (mesmo padrão de auth de `src/app/api/cron/verificar-alertas/route.ts:42-48`):

```ts
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import { listOrgsComBlingOk } from '@/modules/connections/connection.repository';
import {
  LOTE_MAXIMO_SYNC,
  sincronizarPedidosDaOrg,
} from '@/modules/pipeline/sync-pedidos';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron diário (7h UTC — Vercel manda `Authorization: Bearer CRON_SECRET`):
 * sincroniza os pedidos dos últimos 2 dias de cada org com conexão Bling ok,
 * mantendo `orders` vivo entre relatórios (meta mensal, alertas e "vendas de
 * ontem" deixam de ler uma foto congelada).
 *
 * Falha em UMA org (try/catch por org) não aborta o lote. Lote máx. 50 orgs.
 */
export async function GET(req: Request): Promise<Response> {
  if (!serverEnv.CRON_SECRET) {
    return Response.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }

  const agora = new Date();
  const orgIds = (await listOrgsComBlingOk()).slice(0, LOTE_MAXIMO_SYNC);
  let sincronizadas = 0;
  let falhas = 0;

  for (const orgId of orgIds) {
    try {
      const r = await sincronizarPedidosDaOrg(orgId, agora);
      sincronizadas++;
      logger.info('cron.sincronizar_pedidos.org', {
        orgId,
        processados: r.processados,
        total: r.total,
      });
    } catch (err) {
      falhas++;
      logger.error('cron.sincronizar_pedidos.erro', {
        orgId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return Response.json({ orgs: orgIds.length, sincronizadas, falhas });
}
```

- [ ] **Step 7 — vercel.json.** Substituir o conteúdo por (ADIÇÃO do cron novo, preservando os 3 existentes; 7h UTC não conflita com 9h/9h30 e alimenta os dois com dado fresco):

```json
{
  "crons": [
    { "path": "/api/cron/watchdog", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/sincronizar-pedidos", "schedule": "0 7 * * *" },
    { "path": "/api/cron/gerar-relatorios", "schedule": "0 9 * * *" },
    { "path": "/api/cron/verificar-alertas", "schedule": "30 9 * * *" }
  ]
}
```

- [ ] **Step 8 — rodar e ver passar:** `npm run test -- tests/integration/sync-pedidos.test.ts` (PASSA). Depois `npm run test` completo + `npm run typecheck` (zero regressões).
- [ ] **Step 9 — commit:** `feat(g0): cron diario de sync incremental de pedidos (reusa coleta idempotente) + last_sync_at`

---

### Task 2: Frescor + cooldown + digest de alertas + índice único anti-corrida

**Files:**
- Modify: `src/modules/alerts/alerts.constants.ts` (+ `ALERTA_COOLDOWN_DIAS`)
- Modify: `src/modules/alerts/alert-data.repository.ts` (+ `getUltimaDataPedido`)
- Modify: `src/modules/alerts/alert.repository.ts` (+ `listAlertasParaDedup`; `criarAlertas` com `onConflictDoNothing`)
- Modify: `src/db/schema/alerts.ts` (+ índice único parcial) → gerar `src/db/migrations/0008_*.sql` e editá-lo
- Modify: `src/modules/notifications/templates.ts` (+ `alertasDigestTemplate`)
- Modify: `src/modules/notifications/email.ts` (+ `sendAlertasDigestEmail`)
- Modify: `src/app/api/cron/verificar-alertas/route.ts` (agora efetivo + dedup ampliado + digest)
- Test: `tests/integration/alert-dedup-uq.test.ts` (novo), `tests/integration/cron-verificar-alertas.test.ts` (mod), `tests/unit/notification-templates.test.ts` (mod)

**Interfaces:**
- Consumes: `detectarQuedaVendas`, `detectarConcorrenteAbaixo`, `detectarProdutoParado`, `filtrarNaoDuplicados`, `AlertaCandidato` de `src/modules/alerts/alert-detectors.ts` (**puros — NÃO alterar**); `getTotaisSemanais(orgId, agora)`, `getUltimaVendaPorSku(orgId, dias, agora)`, `getPosicaoPrecoUltimoDone(orgId)`, `listOrgsComRelatorioRecente` de `alert-data.repository.ts`; `notify(userId, input)` de `notification.repository.ts`; `getOrgPrimaryUser(orgId)` de `recipients.ts`; `escapeHtml`, `EmailContent` de `templates.ts`; `sendEmail` de `email.ts`.
- Produces:
  - `ALERTA_COOLDOWN_DIAS = 7` (alerts.constants.ts).
  - `getUltimaDataPedido(orgId: string): Promise<Date | null>` — `MAX(orders.data)` da org ("agora efetivo").
  - `listAlertasParaDedup(orgId: string, agora: Date, cooldownDias?: number): Promise<{ tipo: string; chaveDedup: string }[]>` — abertos + resolvidos com `resolvido_em >= agora − cooldown`.
  - `criarAlertas(orgId, candidatos): Promise<string[]>` — **assinatura preservada**; agora com `.onConflictDoNothing()` (retorna só os ids realmente inseridos).
  - `alertasDigestTemplate(alertas: { titulo: string; corpo: string }[], appUrl: string): EmailContent` e `sendAlertasDigestEmail(to: string, alertas: { titulo: string; corpo: string }[]): Promise<void>` (nunca lança).
  - Índice `alerts_org_tipo_dedup_aberto_uq` em `(org_id, tipo, (dados->>'chave_dedup')) WHERE resolvido = false`.
  - `sendAlertaEmail`/`alertaTemplate` **permanecem** exportados (compat) mas o cron deixa de usá-los.

- [ ] **Step 1 — migration.** Editar `src/db/schema/alerts.ts`: no bloco `(t) => ({ ... })` do `pgTable`, adicionar `uniqueIndex` ao import de `drizzle-orm/pg-core` e acrescentar após `org_abertos_idx`:

```ts
    // Anti-corrida: no máx. 1 alerta ABERTO por (org, tipo, chave de dedup).
    // A chave vive em dados->>'chave_dedup' (gravada por criarAlertas).
    org_tipo_dedup_aberto_uq: uniqueIndex('alerts_org_tipo_dedup_aberto_uq')
      .on(t.org_id, t.tipo, sql`(${t.dados}->>'chave_dedup')`)
      .where(sql`${t.resolvido} = false`),
```

Rodar `npm run db:generate`. Abrir o `src/db/migrations/0008_*.sql` gerado e conferir que contém um `CREATE UNIQUE INDEX "alerts_org_tipo_dedup_aberto_uq" ...` com a expressão e o `WHERE`. **Prepender** ao arquivo (antes do CREATE INDEX, com `--> statement-breakpoint` entre eles) a limpeza de duplicatas abertas pré-existentes (mantém a mais recente aberta, resolve as demais — sem isso o índice pode falhar em produção):

```sql
UPDATE alerts a
SET resolvido = true, resolvido_em = now()
WHERE a.resolvido = false
  AND EXISTS (
    SELECT 1 FROM alerts b
    WHERE b.org_id = a.org_id
      AND b.tipo = a.tipo
      AND b.dados->>'chave_dedup' = a.dados->>'chave_dedup'
      AND b.resolvido = false
      AND (b.created_at > a.created_at OR (b.created_at = a.created_at AND b.id > a.id))
  );
--> statement-breakpoint
```

Se o drizzle-kit gerar a expressão errada, substituir o CREATE por:

```sql
CREATE UNIQUE INDEX "alerts_org_tipo_dedup_aberto_uq" ON "alerts" USING btree ("org_id","tipo",(("dados"->>'chave_dedup'))) WHERE "alerts"."resolvido" = false;
```

Aplicar no branch test: `npm run db:migrate:test`.

- [ ] **Step 2 — teste de integração do índice/cooldown falhando.** Criar `tests/integration/alert-dedup-uq.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { alerts, organizations } from '@/db/schema';
import type { AlertaCandidato } from '@/modules/alerts/alert-detectors';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-alerta-uq-';

const candidato: AlertaCandidato = {
  tipo: 'queda_vendas',
  severidade: 'atencao',
  titulo: 'Queda de vendas de 60% na última semana',
  corpo: 'Teste de dedup.',
  dados: { quedaPercentual: 60 },
  chaveDedup: 'queda_vendas',
};

describe.skipIf(!url)('dedup de alertas — índice único + cooldown', () => {
  let orgId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
  });

  afterAll(async () => {
    await db.delete(alerts).where(eq(alerts.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('criarAlertas com candidato duplicado ABERTO → ON CONFLICT DO NOTHING (retorna [])', async () => {
    const { criarAlertas } = await import('@/modules/alerts/alert.repository');
    const primeira = await criarAlertas(orgId, [candidato]);
    expect(primeira.length).toBe(1);

    const segunda = await criarAlertas(orgId, [candidato]);
    expect(segunda.length).toBe(0); // conflito engolido — nada inserido

    const abertos = await db.select({ id: alerts.id }).from(alerts).where(eq(alerts.org_id, orgId));
    expect(abertos.length).toBe(1);
  });

  it('listAlertasParaDedup inclui resolvido recente (cooldown) e exclui resolvido antigo', async () => {
    const { listAlertasParaDedup, resolverAlerta } = await import(
      '@/modules/alerts/alert.repository'
    );
    const agora = new Date();

    // Resolve o alerta aberto do teste anterior → entra no cooldown de 7 dias.
    const [aberto] = await db
      .select({ id: alerts.id })
      .from(alerts)
      .where(eq(alerts.org_id, orgId));
    await resolverAlerta(aberto!.id, orgId);

    let base = await listAlertasParaDedup(orgId, agora);
    expect(base.some((a) => a.tipo === 'queda_vendas' && a.chaveDedup === 'queda_vendas')).toBe(true);

    // Envelhece a resolução para 8 dias atrás → sai do cooldown.
    await db
      .update(alerts)
      .set({ resolvido_em: new Date(agora.getTime() - 8 * 86_400_000) })
      .where(eq(alerts.id, aberto!.id));
    base = await listAlertasParaDedup(orgId, agora);
    expect(base.some((a) => a.chaveDedup === 'queda_vendas')).toBe(false);
  });

  it('getUltimaDataPedido devolve null para org sem pedidos', async () => {
    const { getUltimaDataPedido } = await import('@/modules/alerts/alert-data.repository');
    expect(await getUltimaDataPedido(orgId)).toBeNull();
  });
});
```

- [ ] **Step 3 — rodar e ver falhar:** `npm run test -- tests/integration/alert-dedup-uq.test.ts` (FALHA: funções não existem / sem onConflict).
- [ ] **Step 4 — implementar repositórios.** Em `src/modules/alerts/alerts.constants.ts`, adicionar ao final:

```ts
/** Cooldown pós-resolução: alerta resolvido não renasce por 7 dias (dedup por tipo+chave). */
export const ALERTA_COOLDOWN_DIAS = 7;
```

Em `src/modules/alerts/alert-data.repository.ts`, adicionar `sql` ao import de `drizzle-orm` (linha 1) e acrescentar ao final:

```ts
/**
 * Data do pedido mais recente da org (MAX(orders.data)) — o "agora efetivo"
 * das janelas dos detectores. Null = org sem nenhum pedido.
 */
export async function getUltimaDataPedido(orgId: string): Promise<Date | null> {
  const [row] = await db
    .select({ ultima: sql<Date | string | null>`max(${orders.data})` })
    .from(orders)
    .where(eq(orders.org_id, orgId));
  return row?.ultima ? new Date(row.ultima) : null;
}
```

Em `src/modules/alerts/alert.repository.ts`: (a) trocar a linha 1 por `import { and, desc, eq, gte, or } from 'drizzle-orm';` e importar a constante (`import { ALERTA_COOLDOWN_DIAS } from './alerts.constants';`); (b) em `criarAlertas`, inserir `.onConflictDoNothing()` entre `.values(...)` e `.returning(...)` e atualizar o JSDoc ("Corrida entre execuções: o índice único parcial alerts_org_tipo_dedup_aberto_uq faz o segundo insert ser ignorado — retorna só os ids realmente inseridos."); (c) acrescentar ao final:

```ts
/**
 * Base de dedup dos detectores: alertas ABERTOS + alertas RESOLVIDOS dentro do
 * cooldown (resolvido_em >= agora − cooldownDias). Escopado por org_id.
 */
export async function listAlertasParaDedup(
  orgId: string,
  agora: Date,
  cooldownDias: number = ALERTA_COOLDOWN_DIAS,
): Promise<{ tipo: string; chaveDedup: string }[]> {
  const corte = new Date(agora.getTime() - cooldownDias * 86_400_000);
  const rows = await db
    .select({ tipo: alerts.tipo, dados: alerts.dados })
    .from(alerts)
    .where(
      and(
        eq(alerts.org_id, orgId),
        or(eq(alerts.resolvido, false), gte(alerts.resolvido_em, corte)),
      ),
    );
  return rows.map((r) => ({
    tipo: r.tipo,
    chaveDedup: String((r.dados as Record<string, unknown>)?.chave_dedup ?? ''),
  }));
}
```

- [ ] **Step 5 — rodar e ver passar:** `npm run test -- tests/integration/alert-dedup-uq.test.ts` (PASSA).
- [ ] **Step 6 — template digest (teste unit primeiro).** Em `tests/unit/notification-templates.test.ts`, adicionar:

```ts
describe('alertasDigestTemplate', () => {
  it('1 alerta → assunto com o título; N alertas → assunto com a contagem; escapa HTML', async () => {
    const { alertasDigestTemplate } = await import('@/modules/notifications/templates');
    const um = alertasDigestTemplate(
      [{ titulo: 'Queda de vendas de 60%', corpo: 'Últimos 7 dias <fracos>' }],
      'https://app.exemplo.com',
    );
    expect(um.subject).toContain('Queda de vendas de 60%');
    expect(um.html).toContain('&lt;fracos&gt;');
    expect(um.html).not.toContain('<fracos>');
    expect(um.text).toContain('https://app.exemplo.com/dashboard');

    const tres = alertasDigestTemplate(
      [
        { titulo: 'A', corpo: 'a' },
        { titulo: 'B', corpo: 'b' },
        { titulo: 'C', corpo: 'c' },
      ],
      'https://app.exemplo.com',
    );
    expect(tres.subject).toContain('3');
    expect(tres.html).toContain('<li>');
  });
});
```

Rodar `npm run test -- tests/unit/notification-templates.test.ts` (FALHA). Implementar em `src/modules/notifications/templates.ts` (após `alertaTemplate`, seguindo o padrão escapeHtml da casa):

```ts
/**
 * Template: digest de alertas — UM e-mail por org por execução do cron com
 * TODOS os alertas novos (anti-spam; a notificação in-app continua 1 por
 * alerta). `titulo`/`corpo` vêm dos detectores (pt-BR), mas são escapados.
 */
export function alertasDigestTemplate(
  alertas: { titulo: string; corpo: string }[],
  appUrl: string,
): EmailContent {
  const url = `${appUrl}/dashboard`;
  const subject =
    alertas.length === 1
      ? `⚠ ${alertas[0].titulo} — Truth Analytics`
      : `⚠ ${alertas.length} novos alertas na sua loja — Truth Analytics`;
  const text = [
    'Detectamos os seguintes alertas na sua operação:',
    '',
    ...alertas.flatMap((a) => [`• ${a.titulo}`, `  ${a.corpo}`, '']),
    `Acesse seu painel em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Detectamos os seguintes alertas na sua operação:</p>
<ul>
${alertas.map((a) => `<li><strong>${escapeHtml(a.titulo)}</strong><br>${escapeHtml(a.corpo)}</li>`).join('\n')}
</ul>
<p><a href="${escapeHtml(url)}">Acesse seu painel</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;

  return { subject, html, text };
}
```

E em `src/modules/notifications/email.ts` (após `sendAlertaEmail`; adicionar `alertasDigestTemplate` ao import de `./templates`):

```ts
/**
 * Digest: notifica o cliente sobre TODOS os alertas novos da execução em um
 * único e-mail. Nunca lança.
 */
export async function sendAlertasDigestEmail(
  to: string,
  alertas: { titulo: string; corpo: string }[],
): Promise<void> {
  if (alertas.length === 0) return;
  const content = alertasDigestTemplate(alertas, serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}
```

Rodar de novo (PASSA).

- [ ] **Step 7 — atualizar o teste do cron (falhando).** Em `tests/integration/cron-verificar-alertas.test.ts`: (a) trocar os DOIS spies `vi.spyOn(emailModule, 'sendAlertaEmail')` por `vi.spyOn(emailModule, 'sendAlertasDigestEmail')`; (b) no teste "Bearer correto...", trocar a asserção de e-mail por:

```ts
      // Digest: exatamente UMA chamada de e-mail para o meu usuário, com >= 2 alertas
      const chamadasMinhas = emailSpy.mock.calls.filter(([to]) => to === userEmail);
      expect(chamadasMinhas.length).toBe(1);
      expect(chamadasMinhas[0][1].length).toBeGreaterThanOrEqual(2);
```

(c) adicionar, ANTES do teste de dedup ("segunda execução..."), um teste novo de frescor:

```ts
  it('frescor: org com pedidos ANTIGOS não gera falso "queda de 100%" (agora efetivo = MAX(orders.data))', async () => {
    // Org com vendas regulares que PARARAM de sincronizar há 31 dias: com o
    // relógio de parede seria queda de 100%; com o agora efetivo, razão = 1.0.
    const [org2] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-velha-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    const org2Id = org2!.id;
    await db.insert(reports).values({
      org_id: org2Id,
      status: 'done',
      periodo_inicio: new Date(agora.getTime() - 40 * DIA),
      periodo_fim: new Date(agora.getTime() - 31 * DIA),
      metricas: { posicaoPreco: [] },
    });
    const vendaVelha = (offsetDias: number) => ({
      org_id: org2Id,
      bling_order_id: `${PREFIX}velha-${RUN}-${offsetDias}`,
      canal: 'bling',
      data: new Date(agora.getTime() - offsetDias * DIA),
      valor_total: '1000.00',
      itens: [],
    });
    await db.insert(orders).values([31, 38, 45, 52, 59].map(vendaVelha));

    const notifySpy = vi.spyOn(notificationRepo, 'notify').mockResolvedValue();
    const emailSpy = vi.spyOn(emailModule, 'sendAlertasDigestEmail').mockResolvedValue();
    try {
      const res = await GET(req(`Bearer ${CRON_SECRET_TEST}`));
      expect(res.status).toBe(200);
      const criados = await db
        .select({ tipo: alerts.tipo })
        .from(alerts)
        .where(eq(alerts.org_id, org2Id));
      expect(criados.some((a) => a.tipo === 'queda_vendas')).toBe(false);
    } finally {
      notifySpy.mockRestore();
      emailSpy.mockRestore();
      await db.delete(alerts).where(eq(alerts.org_id, org2Id));
      await db.delete(orders).where(eq(orders.org_id, org2Id));
      await db.delete(reports).where(eq(reports.org_id, org2Id));
      await db.delete(organizations).where(eq(organizations.id, org2Id));
    }
  });
```

Rodar `npm run test -- tests/integration/cron-verificar-alertas.test.ts` (FALHA — rota ainda usa e-mail por alerta e relógio de parede).

- [ ] **Step 8 — reescrever a rota.** Substituir o conteúdo de `src/app/api/cron/verificar-alertas/route.ts` por:

```ts
import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { secretsMatch } from '@/lib/secret-compare';
import {
  detectarConcorrenteAbaixo,
  detectarProdutoParado,
  detectarQuedaVendas,
  filtrarNaoDuplicados,
  type AlertaCandidato,
} from '@/modules/alerts/alert-detectors';
import {
  getPosicaoPrecoUltimoDone,
  getTotaisSemanais,
  getUltimaDataPedido,
  getUltimaVendaPorSku,
  listOrgsComRelatorioRecente,
} from '@/modules/alerts/alert-data.repository';
import {
  criarAlertas,
  listAlertasParaDedup,
} from '@/modules/alerts/alert.repository';
import {
  JANELA_RELATORIO_RECENTE_DIAS,
  PRODUTO_HISTORICO_DIAS,
} from '@/modules/alerts/alerts.constants';
import { sendAlertasDigestEmail } from '@/modules/notifications/email';
import { notify } from '@/modules/notifications/notification.repository';
import { getOrgPrimaryUser } from '@/modules/notifications/recipients';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Cron diário (Vercel manda `Authorization: Bearer CRON_SECRET`): roda os
 * detectores de alertas para cada org com relatório recente e persiste os
 * novos com dedup + notificação.
 *
 * Verdade dos dados (G0):
 * - FRESCOR: as janelas de queda/produto parado são ancoradas no "agora
 *   efetivo" = MAX(orders.data) da org — se o dado parou de sincronizar, as
 *   janelas param junto (zero falso "queda de 100%"). Org sem pedido algum
 *   pula esses detectores; concorrente_preco continua (lê posicaoPreco do
 *   último relatório done, não a tabela orders).
 * - COOLDOWN: dedup contra abertos + resolvidos nos últimos 7 dias.
 * - DIGEST: 1 e-mail por org por execução com TODOS os alertas novos;
 *   in-app continua 1 notificação por alerta.
 * - CORRIDA: criarAlertas usa ON CONFLICT DO NOTHING (índice único parcial).
 *
 * Falha em UMA org (try/catch por org) não aborta o lote; notificação é
 * best-effort aninhada.
 */
export async function GET(req: Request): Promise<Response> {
  if (!serverEnv.CRON_SECRET) {
    return Response.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }

  const agora = new Date();
  const orgIds = await listOrgsComRelatorioRecente(JANELA_RELATORIO_RECENTE_DIAS, agora);
  let criadosTotal = 0;

  for (const orgId of orgIds) {
    try {
      const agoraEfetivo = await getUltimaDataPedido(orgId);

      const [semanais, posicao, parado, dedupBase] = await Promise.all([
        agoraEfetivo ? getTotaisSemanais(orgId, agoraEfetivo) : Promise.resolve(null),
        getPosicaoPrecoUltimoDone(orgId),
        agoraEfetivo
          ? getUltimaVendaPorSku(orgId, PRODUTO_HISTORICO_DIAS, agoraEfetivo)
          : Promise.resolve(null),
        listAlertasParaDedup(orgId, agora),
      ]);

      const queda = semanais ? detectarQuedaVendas(semanais) : null;
      const candidatos: AlertaCandidato[] = [
        ...(queda ? [queda] : []),
        ...detectarConcorrenteAbaixo(posicao),
        ...(parado && agoraEfetivo
          ? detectarProdutoParado(parado.produtos, parado.ultimaVendaPorSku, agoraEfetivo)
          : []),
      ];
      const novos = filtrarNaoDuplicados(candidatos, dedupBase);
      if (novos.length === 0) continue;

      const idsCriados = await criarAlertas(orgId, novos);
      if (idsCriados.length === 0) continue; // corrida: outra execução criou antes
      criadosTotal += idsCriados.length;

      // Notificação — best-effort, nunca aborta o cron.
      // In-app: 1 por alerta. E-mail: DIGEST único com todos os novos.
      try {
        const user = await getOrgPrimaryUser(orgId);
        if (user) {
          for (const n of novos) {
            await notify(user.id, {
              tipo: `alerta_${n.tipo}`,
              titulo: n.titulo,
              corpo: n.corpo,
              href: '/dashboard',
            });
          }
          await sendAlertasDigestEmail(
            user.email,
            novos.map((n) => ({ titulo: n.titulo, corpo: n.corpo })),
          );
        }
      } catch (err) {
        logger.warn('cron.verificar_alertas.notificacao_falhou', {
          orgId,
          erro: err instanceof Error ? err.message : String(err),
        });
      }
      logger.info('cron.verificar_alertas.org', { orgId, criados: idsCriados.length });
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

> NOTA: o teste existente de queda/dedup continua válido — os buckets semanais ficam idênticos quando ancorados no pedido mais recente (1 dia atrás), pois as vendas semeadas caem nos mesmos buckets relativos.

- [ ] **Step 9 — rodar e ver passar:** `npm run test -- tests/integration/cron-verificar-alertas.test.ts tests/integration/alert-dedup-uq.test.ts tests/unit/notification-templates.test.ts` (PASSA). `npm run test` completo + `npm run typecheck`.
- [ ] **Step 10 — commit:** `feat(g0): alertas honestos — frescor por MAX(orders.data), cooldown 7d, digest por org e indice unico anti-corrida`

---

### Task 3: Janela do relatório em dias fechados (calendário America/Sao_Paulo)

**Files:**
- Create: `src/lib/timezone.ts`
- Modify: `src/modules/admin/periodo-plano.ts`
- Modify: `src/modules/pipeline/enqueue.ts` (linhas 38-43 atuais: cálculo inline `agora − N dias`)
- Modify: `src/lib/format.ts`
- Modify: `src/modules/pipeline/steps/compute-metrics.ts` (linhas 257-277: janela do período anterior)
- Test: `tests/unit/timezone.test.ts` (novo), `tests/unit/periodo-plano.test.ts` (reescrever expectativas), `tests/unit/format.test.ts` (mod)

**Interfaces:**
- Consumes: `diasDoPlano(plano)` de `src/modules/pipeline/plan-lock.ts` (weekly=7, biweekly=15, monthly=30 — fonte única, intocada); `createQueuedReport(orgId, { inicio, fim })`.
- Produces:
  - `src/lib/timezone.ts` (puro, sem libs): `hojeBrt(agora?: Date): string`; `ontemBrt(agora?: Date): string`; `inicioDeDiaUtc(data: string): Date`; `fimDeDiaUtc(data: string): Date`; `janelaDiasFechados(dias: number, agora?: Date): { inicio: Date; fim: Date }`.
  - `periodoDoPlano(plano: Plano, agora: Date): { inicio: Date; fim: Date }` — MESMA assinatura, semântica nova: N dias FECHADOS terminando ontem (calendário BRT). Consumido por `enqueue.ts` (cliente + cron) e `admin.actions.ts:145` (disparo manual — **sem mudança lá**, já chama `periodoDoPlano(org.plano, new Date())`).
  - `formatData(d)` — instantes em `America/Sao_Paulo`; `formatDataUtc(d)` e `formatPeriodo(inicio, fim)` — dias-calendário em `UTC`.

**Por que fronteiras UTC (não 23:59 BRT literal):** `orders.data` chega do Bling como data pura → `new Date('YYYY-MM-DD')` = meia-noite **UTC** (`orders.ts:49`). O fuso BRT decide QUAL dia-calendário é "ontem"; as fronteiras `00:00:00.000Z`/`23:59:59.999Z` desses dias capturam exatamente os pedidos dos dias fechados (1º dia INCLUÍDO, hoje EXCLUÍDO) e o `formatDate` do fetch Bling (`orders.ts:30-35`) produz `dataInicial`/`dataFinal` corretos em produção (Vercel = UTC). Brasil não tem horário de verão desde 2019 — aritmética de dias em ms é segura.

- [ ] **Step 1 — teste unit falhando.** Criar `tests/unit/timezone.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  fimDeDiaUtc,
  hojeBrt,
  inicioDeDiaUtc,
  janelaDiasFechados,
  ontemBrt,
} from '@/lib/timezone';

describe('timezone — calendário America/Sao_Paulo', () => {
  it('hojeBrt/ontemBrt viram o dia às 03:00Z (meia-noite BRT)', () => {
    expect(hojeBrt(new Date('2026-07-14T02:59:00Z'))).toBe('2026-07-13');
    expect(hojeBrt(new Date('2026-07-14T03:00:00Z'))).toBe('2026-07-14');
    expect(ontemBrt(new Date('2026-07-14T12:00:00Z'))).toBe('2026-07-13');
    expect(ontemBrt(new Date('2026-07-14T01:00:00Z'))).toBe('2026-07-12');
  });

  it('viradas de mês e ano', () => {
    expect(ontemBrt(new Date('2026-07-01T12:00:00Z'))).toBe('2026-06-30');
    // 01/01 01:00Z = 31/12 22:00 BRT → hoje=31/12, ontem=30/12
    expect(ontemBrt(new Date('2026-01-01T01:00:00Z'))).toBe('2025-12-30');
  });

  it('inicioDeDiaUtc/fimDeDiaUtc codificam o dia-calendário em UTC', () => {
    expect(inicioDeDiaUtc('2026-07-13').toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(fimDeDiaUtc('2026-07-13').toISOString()).toBe('2026-07-13T23:59:59.999Z');
  });

  it('janelaDiasFechados(7) = 7 dias fechados terminando ontem', () => {
    const j = janelaDiasFechados(7, new Date('2026-07-14T12:00:00Z'));
    expect(j.fim.toISOString()).toBe('2026-07-13T23:59:59.999Z');
    expect(j.inicio.toISOString()).toBe('2026-07-07T00:00:00.000Z');
  });

  it('janelaDiasFechados na madrugada UTC recua o "ontem" junto', () => {
    const j = janelaDiasFechados(7, new Date('2026-07-14T01:00:00Z')); // 22:00 BRT de 13/07
    expect(j.fim.toISOString()).toBe('2026-07-12T23:59:59.999Z');
    expect(j.inicio.toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/timezone.test.ts`.
- [ ] **Step 3 — implementar** `src/lib/timezone.ts`:

```ts
/**
 * Calendário America/Sao_Paulo — helpers PUROS, sem libs novas.
 *
 * Regra da casa (G0): o fuso BRT decide QUAL dia-calendário é "hoje/ontem";
 * as FRONTEIRAS são codificadas em UTC (00:00:00.000Z / 23:59:59.999Z) porque
 * `orders.data` vem do Bling como data pura (meia-noite UTC). Brasil não tem
 * horário de verão desde 2019 — aritmética de dias em ms é segura.
 */

const DIA_MS = 86_400_000;

// en-CA formata como YYYY-MM-DD — exatamente o formato de chave que usamos.
const fmtBrt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia-calendário (YYYY-MM-DD) de um instante no fuso America/Sao_Paulo. */
export function hojeBrt(agora: Date = new Date()): string {
  return fmtBrt.format(agora);
}

/** Dia-calendário de ontem no fuso America/Sao_Paulo. */
export function ontemBrt(agora: Date = new Date()): string {
  const hoje = hojeBrt(agora);
  return new Date(new Date(`${hoje}T00:00:00.000Z`).getTime() - DIA_MS)
    .toISOString()
    .slice(0, 10);
}

/** 00:00:00.000Z do dia-calendário (fronteira inferior de um dia fechado). */
export function inicioDeDiaUtc(data: string): Date {
  return new Date(`${data}T00:00:00.000Z`);
}

/** 23:59:59.999Z do dia-calendário (fronteira superior de um dia fechado). */
export function fimDeDiaUtc(data: string): Date {
  return new Date(`${data}T23:59:59.999Z`);
}

/**
 * Janela de `dias` dias FECHADOS terminando ontem (calendário BRT):
 * fim = ontem 23:59:59.999Z; inicio = (ontem − (dias−1)) 00:00:00.000Z.
 * O 1º dia entra inteiro; hoje (parcial) fica fora.
 */
export function janelaDiasFechados(
  dias: number,
  agora: Date = new Date(),
): { inicio: Date; fim: Date } {
  const ontem = ontemBrt(agora);
  const fim = fimDeDiaUtc(ontem);
  const inicio = new Date(inicioDeDiaUtc(ontem).getTime() - (dias - 1) * DIA_MS);
  return { inicio, fim };
}
```

Rodar de novo (PASSA).

- [ ] **Step 4 — reescrever `tests/unit/periodo-plano.test.ts`** (as expectativas MUDAM porque a semântica mudou — dias fechados em vez de "agora − N dias"; documentado aqui: o `inicio` dos casos antigos coincide por construção, o `fim` recua para ontem 23:59:59.999Z):

```ts
import { describe, expect, it } from 'vitest';

import { periodoDoPlano } from '@/modules/admin/periodo-plano';

describe('periodoDoPlano — dias fechados no calendário America/Sao_Paulo', () => {
  const agora = new Date('2026-07-03T12:00:00Z'); // 09:00 BRT → ontem = 2026-07-02

  it('weekly = 7 dias fechados terminando ontem', () => {
    const p = periodoDoPlano('weekly', agora);
    expect(p.fim.toISOString()).toBe('2026-07-02T23:59:59.999Z');
    expect(p.inicio.toISOString()).toBe('2026-06-26T00:00:00.000Z');
  });

  it('biweekly = 15 dias fechados', () => {
    const p = periodoDoPlano('biweekly', agora);
    expect(p.inicio.toISOString()).toBe('2026-06-18T00:00:00.000Z');
    expect(p.fim.toISOString()).toBe('2026-07-02T23:59:59.999Z');
  });

  it('monthly = 30 dias fechados', () => {
    expect(periodoDoPlano('monthly', agora).inicio.toISOString()).toBe(
      '2026-06-03T00:00:00.000Z',
    );
  });

  it('madrugada UTC (ainda é o dia anterior em BRT) → ontem recua junto', () => {
    const p = periodoDoPlano('weekly', new Date('2026-07-03T01:00:00Z')); // 22:00 BRT de 02/07
    expect(p.fim.toISOString()).toBe('2026-07-01T23:59:59.999Z');
    expect(p.inicio.toISOString()).toBe('2026-06-25T00:00:00.000Z');
  });
});
```

Rodar `npm run test -- tests/unit/periodo-plano.test.ts` (FALHA). Substituir `src/modules/admin/periodo-plano.ts` por:

```ts
import type { Plano } from '@/modules/auth/user.types';
import { janelaDiasFechados } from '@/lib/timezone';
import { diasDoPlano } from '@/modules/pipeline/plan-lock';

/**
 * Janela de análise do relatório (pura) — FONTE ÚNICA usada pela action do
 * cliente, pelo cron de geração automática (via enqueueReport) e pelo disparo
 * manual do admin.
 *
 * G0: N dias FECHADOS no calendário America/Sao_Paulo, terminando ontem
 * (fim = ontem 23:59:59.999Z; inicio = ontem − (N−1) dias, 00:00:00.000Z).
 * Nada de "1º dia fora / último dia parcial": hoje nunca entra na janela.
 * Reusa `diasDoPlano` (weekly=7, biweekly=15, monthly=30).
 */
export function periodoDoPlano(plano: Plano, agora: Date): { inicio: Date; fim: Date } {
  return janelaDiasFechados(diasDoPlano(plano), agora);
}
```

Rodar de novo (PASSA).

- [ ] **Step 5 — enqueue usa a fonte única.** Em `src/modules/pipeline/enqueue.ts`: remover `import { diasDoPlano } from '@/modules/pipeline/plan-lock';` (linha 4) e adicionar `import { periodoDoPlano } from '@/modules/admin/periodo-plano';`. Substituir as linhas 38-43 atuais:

```ts
  const agora = new Date();
  const inicio = new Date(agora.getTime() - diasDoPlano(org.plano) * 24 * 60 * 60 * 1000);

  let reportId: string;
  try {
    reportId = await createQueuedReport(orgId, { inicio, fim: agora });
```

por:

```ts
  // G0: janela em dias FECHADOS no calendário America/Sao_Paulo (fonte única
  // compartilhada com o disparo manual do admin — periodoDoPlano).
  const periodo = periodoDoPlano(org.plano, new Date());

  let reportId: string;
  try {
    reportId = await createQueuedReport(orgId, periodo);
```

- [ ] **Step 6 — format com fuso (teste primeiro).** Em `tests/unit/format.test.ts`, adicionar ao final:

```ts
describe('fusos (G0)', () => {
  it('formatData usa America/Sao_Paulo: 01:00Z cai no dia anterior BRT', async () => {
    const { formatData } = await import('@/lib/format');
    expect(formatData(new Date('2026-06-25T01:00:00Z'))).toBe('24/06/2026');
  });

  it('formatPeriodo formata fronteiras (dias-calendário em UTC) sem deslocar o dia', async () => {
    const { formatPeriodo } = await import('@/lib/format');
    expect(
      formatPeriodo(new Date('2026-06-01T00:00:00.000Z'), new Date('2026-06-30T23:59:59.999Z')),
    ).toBe('01/06/2026 – 30/06/2026');
  });
});
```

Rodar `npm run test -- tests/unit/format.test.ts` (FALHA — o caso 01:00Z mostra 25/06 em runner UTC). Substituir `src/lib/format.ts` por:

```ts
/**
 * Formatadores puros pt-BR — sem I/O, sem dependências externas.
 *
 * Fusos (G0): instantes REAIS (created_at, expira_em, last_sync_at) são
 * exibidos em America/Sao_Paulo. Fronteiras de PERÍODO de relatório são
 * dias-calendário codificados em UTC (ver src/lib/timezone.ts) — formatar em
 * UTC para não deslocar o dia.
 */

export function formatBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function formatData(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(date);
}

/** Dias-calendário codificados em UTC (fronteiras de período). */
export function formatDataUtc(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

export function formatPeriodo(inicio: Date | string, fim: Date | string): string {
  return `${formatDataUtc(inicio)} – ${formatDataUtc(fim)}`;
}
```

Rodar de novo (PASSA — os testes antigos usam 12:00Z, mesmo dia nos dois fusos).

- [ ] **Step 7 — período anterior sem double-count.** Em `src/modules/pipeline/steps/compute-metrics.ts`: trocar a linha 1 para incluir `gte` e `lt` (`import { and, between, eq, gte, lt, ne } from 'drizzle-orm';`) e substituir o bloco das linhas 257-276:

```ts
  // Truth Score — total do período anterior (mesma duração, imediatamente antes)
  const duracaoMs = periodo.fim.getTime() - periodo.inicio.getTime();
  const inicioAnterior = new Date(periodo.inicio.getTime() - duracaoMs);
```

por:

```ts
  // Truth Score — total do período anterior (mesma duração, imediatamente antes).
  // G0: fim é 23:59:59.999 → +1ms fecha o dia (duração = N dias exatos) e a
  // janela anterior vira [inicio − N dias, inicio) SEM incluir a fronteira —
  // um pedido exatamente em periodo.inicio pertence só ao período atual.
  const duracaoMs = periodo.fim.getTime() - periodo.inicio.getTime() + 1;
  const inicioAnterior = new Date(periodo.inicio.getTime() - duracaoMs);
```

e, dentro do `if (temDoneAnterior)`, substituir:

```ts
      .where(
        and(eq(orders.org_id, orgId), between(orders.data, inicioAnterior, periodo.inicio)),
      );
```

por:

```ts
      .where(
        and(
          eq(orders.org_id, orgId),
          gte(orders.data, inicioAnterior),
          lt(orders.data, periodo.inicio),
        ),
      );
```

- [ ] **Step 8 — regressões.** `npm run test` completo + `npm run typecheck`. Atenção especial a `tests/integration/compute-metrics.test.ts`, `compute-metrics-score.test.ts` e `cron-gerar-relatorios.test.ts`: se alguma asserção do período anterior contar pedido semeado EXATAMENTE em `periodo.inicio`, ajustar o seed para 1ms antes (o comportamento novo é o correto — fronteira pertence só ao período atual). Se `cron-gerar-relatorios` assertar o período do report criado relativo a `agora`, atualizar para `periodoDoPlano(plano, agora)`.
- [ ] **Step 9 — commit:** `feat(g0): janela do relatorio em dias fechados America/Sao_Paulo + formatadores com fuso`

---

### Task 4: benchmarkParcial verdadeiro + aviso de benchmark em 3 casos no prompt

**Files:**
- Modify: `src/modules/pipeline/steps/collect-market.ts` (linha 31: default `[serpapiProvider, mlPublicoProvider]`)
- Modify: `src/modules/pipeline/steps/analyze-ia.ts` (linhas 22-43: `buildSystemPrompt`)
- Test: `tests/unit/providers-ativos.test.ts` (novo), `tests/unit/analyze-ia.test.ts` (mod — casos novos 4b/4c)

**Interfaces:**
- Consumes: `serverEnv.SERPAPI_KEY` (opcional — `src/lib/env.ts:57`); `serpapiProvider` (lança `serpapi_nao_configurada` sem chave — `serpapi.ts:8-10`); `mlPublicoProvider`; `Metricas` de `contracts.ts`.
- Produces:
  - `providersAtivos(): MarketProvider[]` exportado de `collect-market.ts` — `[serpapiProvider, mlPublicoProvider]` com chave, `[mlPublicoProvider]` sem. Vira o DEFAULT de `collectMarket` (assinatura preservada — testes existentes passam providers explícitos, verificado).
  - `buildSystemPrompt` (privado) passa a receber `Metricas` e derivar o aviso: (a) **sem benchmark nenhum** (nenhum `posicaoPreco` com `precoMercadoMediano > 0`) → instrução positiva: focar mix/canais/regularidade, `recomendacoesPreco` vazio; (b) **parcial** (`benchmarkParcial=true` com algum preço de mercado) → aviso atual mantido byte a byte (Case 4 do teste existente continua verde); (c) **fonte única completa** → analisar preço normalmente citando a fonte.
  - Semântica nova de `benchmarkParcial`: `true` só quando um provider ATIVO falha ou zero snapshots no total — SERPAPI ausente deixa de punir para sempre.

- [ ] **Step 1 — teste unit de providersAtivos falhando.** Criar `tests/unit/providers-ativos.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

describe('providersAtivos — filtra pela configuração', () => {
  it('sem SERPAPI_KEY → só ml_publico (SERPAPI ausente não é falha)', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', async (importOriginal) => {
      const mod = await importOriginal<typeof import('@/lib/env')>();
      return { ...mod, serverEnv: { ...mod.serverEnv, SERPAPI_KEY: undefined } };
    });
    const { providersAtivos } = await import('@/modules/pipeline/steps/collect-market');
    expect(providersAtivos().map((p) => p.fonte)).toEqual(['ml_publico']);
    vi.doUnmock('@/lib/env');
  });

  it('com SERPAPI_KEY → serpapi + ml_publico', async () => {
    vi.resetModules();
    vi.doMock('@/lib/env', async (importOriginal) => {
      const mod = await importOriginal<typeof import('@/lib/env')>();
      return { ...mod, serverEnv: { ...mod.serverEnv, SERPAPI_KEY: 'chave-teste' } };
    });
    const { providersAtivos } = await import('@/modules/pipeline/steps/collect-market');
    expect(providersAtivos().map((p) => p.fonte)).toEqual(['serpapi', 'ml_publico']);
    vi.doUnmock('@/lib/env');
  });
});
```

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/unit/providers-ativos.test.ts`.
- [ ] **Step 3 — implementar em `collect-market.ts`.** Adicionar `import { serverEnv } from '@/lib/env';` no topo e, antes de `collectMarket`, a função + troca do default (linha 31):

```ts
/**
 * Providers ATIVOS pela configuração: SERPAPI só entra se SERPAPI_KEY estiver
 * presente (sem chave, o provider lança 'serpapi_nao_configurada' em toda
 * keyword e benchmarkParcial ficava eternamente true — P0-7). Avaliado por
 * chamada (não em module-load) p/ testes conseguirem mockar o env.
 */
export function providersAtivos(): MarketProvider[] {
  return serverEnv.SERPAPI_KEY ? [serpapiProvider, mlPublicoProvider] : [mlPublicoProvider];
}
```

e na assinatura: `providers: MarketProvider[] = providersAtivos(),`. Atualizar o comentário do step: "benchmarkParcial=true só quando um provider ATIVO falha (ou zero snapshots no total)". Rodar de novo (PASSA).

- [ ] **Step 4 — casos novos do prompt (falhando).** Em `tests/unit/analyze-ia.test.ts`, adicionar após o Case 4 existente:

```ts
  it('Case 4b — sem benchmark NENHUM: instrução positiva (mix/canais/regularidade, sem recomendacoesPreco)', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));
    const semMercado: Metricas = {
      ...validMetricas,
      benchmarkParcial: true,
      posicaoPreco: [
        { sku: 'SKU-001', nome: 'Produto A', nossoPreco: 99.9, precoMercadoMediano: 0, fonte: '' },
      ],
    };
    await analyzeWithIA(semMercado, null);
    const sys = mockCreate.mock.calls[0][0].system[0].text;
    expect(sys).toMatch(/NENHUM benchmark/);
    expect(sys).toMatch(/recomendacoesPreco/);
    expect(sys).toMatch(/canais/);
    expect(sys).not.toMatch(/benchmarkParcial=true/); // não é o aviso de parcial
  });

  it('Case 4c — fonte única com benchmark completo: cita a fonte, sem hedging', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage(JSON.stringify(validAnalise)));
    await analyzeWithIA(validMetricas, null); // benchmarkParcial=false, fonte única ml_publico
    const sys = mockCreate.mock.calls[0][0].system[0].text;
    expect(sys).toMatch(/única fonte \(ml_publico\)/);
    expect(sys).not.toMatch(/INCOMPLETO/);
  });
```

- [ ] **Step 5 — rodar e ver falhar**, depois implementar em `analyze-ia.ts`: substituir `buildSystemPrompt(benchmarkParcial: boolean, truthScore?: number)` (linhas 22-43) por:

```ts
/**
 * Aviso de benchmark em 3 casos (G0):
 * (a) sem benchmark NENHUM → instrução positiva (mix/canais/regularidade,
 *     recomendacoesPreco vazio) — nada de hedging fantasma;
 * (b) parcial (provider ATIVO falhou) → cautela explícita (texto preservado);
 * (c) fonte única completa → analisar preço normalmente citando a fonte.
 */
function avisoBenchmark(metricas: Metricas): string {
  const comMercado = metricas.posicaoPreco.filter((p) => p.precoMercadoMediano > 0);
  if (comMercado.length === 0) {
    return `\n\nATENÇÃO: NENHUM benchmark de mercado está disponível neste período. NÃO invente preços de concorrentes nem posição competitiva. Deixe "recomendacoesPreco" como lista vazia e concentre a análise no mix de produtos, nos canais de venda e na regularidade das vendas — há muito valor nesses dados.`;
  }
  if (metricas.benchmarkParcial) {
    return `\n\nATENÇÃO: O benchmark de mercado está INCOMPLETO (benchmarkParcial=true). NÃO infira nem invente conclusões sobre concorrentes, participação de mercado ou posição relativa a partir de dados ausentes. Em recomendações de preço, deixe claro explicitamente que a base comparativa é limitada e evite afirmações categóricas sobre competitividade.`;
  }
  const fontes = [...new Set(comMercado.map((p) => p.fonte).filter((f) => f !== ''))];
  if (fontes.length === 1) {
    return `\n\nO benchmark de mercado vem de uma única fonte (${fontes[0]}). Analise preços normalmente e cite essa fonte nas recomendações de preço.`;
  }
  return '';
}

function buildSystemPrompt(metricas: Metricas): string {
  const aviso = avisoBenchmark(metricas);
  const truthScore = metricas.truth_score?.score;

  const scoreTexto =
    truthScore === undefined
      ? ''
      : `\n\nAs métricas incluem um "truth_score" (${truthScore}/100) — índice de saúde da operação composto por: crescimento vs período anterior, posição de preço vs mercado, diversificação de canais, regularidade de vendas e cobertura de benchmark (detalhes no campo "fatores"). No resumoExecutivo, comente o score e cite os fatores mais fracos; conecte gargalos e sugestoesMelhoria aos fatores que mais penalizaram o score.`;

  return `Você é um analista sênior de e-commerce e marketplaces brasileiro. A partir das métricas fornecidas pelo usuário, produza uma análise estratégica completa em português do Brasil com os seguintes componentes:

1. **resumoExecutivo**: síntese dos resultados do período (pontos fortes e fracos).
2. **gargalos**: lista dos principais obstáculos ao crescimento identificados nas métricas.
3. **sugestoesMelhoria**: ações concretas e priorizadas para melhorar os resultados.
4. **ideiasVenda**: ideias de campanhas, bundles, estratégias de cross-sell ou up-sell adequadas ao perfil dos produtos.
5. **recomendacoesPreco**: para cada produto com posição de preço disponível, sugira um preço otimizado com justificativa clara baseada nos dados.

Use o nicho informado para contextualizar suas recomendações. Seja direto, prático e orientado a dados.${aviso}${scoreTexto}

Responda EXCLUSIVAMENTE com um objeto JSON válido conforme o schema fornecido. Não inclua texto fora do JSON.`;
}
```

e trocar a chamada (linha 66) `const system = buildSystemPrompt(metricas.benchmarkParcial, metricas.truth_score?.score);` por `const system = buildSystemPrompt(metricas);`.

- [ ] **Step 6 — rodar:** `npm run test -- tests/unit/analyze-ia.test.ts tests/unit/providers-ativos.test.ts` (PASSA — Case 4 antigo continua verde: o texto do caso parcial foi preservado). Depois `npm run test` completo (os testes de integração de collect-market passam providers explícitos — sem impacto) + `npm run typecheck`.
- [ ] **Step 7 — commit:** `fix(g0): benchmarkParcial so quando provider ATIVO falha + aviso de benchmark em 3 casos no prompt`

---

### Task 5: Backoff da auto-geração + custo IA persistido (`reports.ia_usage`)

**Files:**
- Modify: `src/modules/scheduler/scheduler.service.ts` (+ constantes)
- Modify: `src/modules/scheduler/scheduler.repository.ts` (backoff + falhas consecutivas)
- Modify: `src/app/api/cron/gerar-relatorios/route.ts` (passo de pausa)
- Modify: `src/modules/notifications/templates.ts` (+ `autoGeracaoPausadaTemplate`), `src/modules/notifications/email.ts` (+ `sendAutoGeracaoPausadaEmail`)
- Modify: `src/db/schema/reports.ts` (+ `ia_usage`) → gerar `src/db/migrations/0009_*.sql`
- Modify: `src/modules/pipeline/steps/analyze-ia.ts` (retorno `{ analise, usage }`)
- Modify: `src/modules/pipeline/orchestrator.ts` (linha 92 + chamada do finalize)
- Modify: `src/modules/pipeline/steps/finalize.ts` (persiste `ia_usage`)
- Modify: `src/modules/admin/admin.repository.ts` (`listOrgReports` + `OrgReportRow.iaUsage`), `src/app/admin/[orgId]/page.tsx` (coluna "IA (tokens)")
- Test: `tests/integration/scheduler-backoff.test.ts` (novo), `tests/unit/analyze-ia.test.ts` (mod), `tests/integration/orchestrator.test.ts` (mod mocks), `tests/unit/notification-templates.test.ts` (mod)

**Interfaces:**
- Consumes: `setGeracaoAutomatica(orgId, ativa)` de `organization-settings.repository.ts`; `getAdminAlertEmail()` de `recipients.ts`; `listOrgsElegiveisParaGeracao(agora)` (assinatura preservada); `FinalizeInput` de `finalize.ts`.
- Produces (contrato para a Task 6 — NÃO quebrar):
  - `BACKOFF_FALHA_DIAS = 2`, `FALHAS_CONSECUTIVAS_PAUSA = 3` em `scheduler.service.ts`.
  - `listOrgsElegiveisParaGeracao(agora)` — exclui org cujo relatório MAIS RECENTE é `failed` com `created_at > agora − 2 dias`.
  - `listOrgsComFalhasConsecutivas(minFalhas: number): Promise<{ id: string; name: string }[]>` — orgs `active` + `geracao_automatica=true` cujos `minFalhas` relatórios mais recentes são TODOS `failed` (exige ≥ `minFalhas` relatórios).
  - `export type IaUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number; tentativas: number }` e `analyzeWithIA(metricas, nicho): Promise<{ analise: AnaliseIa; usage: IaUsage }>` (analyze-ia.ts).
  - `FinalizeInput.iaUsage?: IaUsage | null` — persistido em `reports.ia_usage` (jsonb, nullable — relatórios antigos ficam null; UI trata).
  - `OrgReportRow.iaUsage: { input_tokens: number; output_tokens: number } | null`.
  - `autoGeracaoPausadaTemplate(orgName: string, orgId: string): EmailContent`; `sendAutoGeracaoPausadaEmail(to, orgName, orgId)` (nunca lança).

- [ ] **Step 1 — migration 0009.** Em `src/db/schema/reports.ts`, adicionar após `analise_ia` (linha 27):

```ts
    /** Usage da chamada Claude { input_tokens, output_tokens, cache_*, tentativas } — governança de custo. */
    ia_usage: jsonb('ia_usage'),
```

Rodar `npm run db:generate` → conferir que `src/db/migrations/0009_*.sql` contém exatamente `ALTER TABLE "reports" ADD COLUMN "ia_usage" jsonb;` (aditiva). Aplicar: `npm run db:migrate:test`.

- [ ] **Step 2 — teste de integração do backoff falhando.** Criar `tests/integration/scheduler-backoff.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { connections, organizations, reports } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-backoff-';
const DIA = 86_400_000;

async function seedOrgElegivel(nome: string): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({
      name: nome,
      status: 'active',
      plano: 'weekly',
      geracao_automatica: true,
      proximo_relatorio_liberado_em: new Date(Date.now() - DIA), // ciclo vencido
    })
    .returning({ id: organizations.id });
  await db.insert(connections).values({
    org_id: org!.id,
    provider: 'bling',
    access_token: 'tok',
    refresh_token: 'rt',
    status: 'ok',
    expira_em: new Date(Date.now() + 30 * DIA),
  });
  return org!.id;
}

function reportRow(orgId: string, status: string, criadoHaMs: number) {
  const created = new Date(Date.now() - criadoHaMs);
  return {
    org_id: orgId,
    status,
    periodo_inicio: new Date(created.getTime() - 7 * DIA),
    periodo_fim: created,
    created_at: created,
  };
}

describe.skipIf(!url)('scheduler — backoff e falhas consecutivas', () => {
  let orgFalhaRecente = '';
  let orgFalhaAntiga = '';
  let orgTresFalhas = '';

  beforeAll(async () => {
    orgFalhaRecente = await seedOrgElegivel(`${PREFIX}recente-${RUN}`);
    orgFalhaAntiga = await seedOrgElegivel(`${PREFIX}antiga-${RUN}`);
    orgTresFalhas = await seedOrgElegivel(`${PREFIX}tres-${RUN}`);

    // último report failed HÁ 1 HORA → excluída por 2 dias
    await db.insert(reports).values(reportRow(orgFalhaRecente, 'failed', 3_600_000));
    // último report failed HÁ 3 DIAS → backoff venceu, volta a ser elegível
    await db.insert(reports).values(reportRow(orgFalhaAntiga, 'failed', 3 * DIA));
    // 3 failed consecutivos (o mais recente há 3 dias — fora do backoff, mas pausável)
    await db
      .insert(reports)
      .values([
        reportRow(orgTresFalhas, 'failed', 5 * DIA),
        reportRow(orgTresFalhas, 'failed', 4 * DIA),
        reportRow(orgTresFalhas, 'failed', 3 * DIA),
      ]);
  });

  afterAll(async () => {
    for (const id of [orgFalhaRecente, orgFalhaAntiga, orgTresFalhas]) {
      await db.delete(reports).where(eq(reports.org_id, id));
      await db.delete(connections).where(eq(connections.org_id, id));
      await db.delete(organizations).where(eq(organizations.id, id));
    }
  });

  it('exclui org cujo ÚLTIMO report é failed há <2 dias; inclui quando o backoff venceu', async () => {
    const { listOrgsElegiveisParaGeracao } = await import(
      '@/modules/scheduler/scheduler.repository'
    );
    const ids = (await listOrgsElegiveisParaGeracao(new Date())).map((o) => o.id);
    expect(ids).not.toContain(orgFalhaRecente);
    expect(ids).toContain(orgFalhaAntiga);
  });

  it('done mais recente que o failed reabilita a org imediatamente', async () => {
    const { listOrgsElegiveisParaGeracao } = await import(
      '@/modules/scheduler/scheduler.repository'
    );
    await db.insert(reports).values(reportRow(orgFalhaRecente, 'done', 60_000));
    const ids = (await listOrgsElegiveisParaGeracao(new Date())).map((o) => o.id);
    expect(ids).toContain(orgFalhaRecente); // o MAIS RECENTE não é failed
  });

  it('listOrgsComFalhasConsecutivas: 3 failed seguidos entra; 1 failed só não entra', async () => {
    const { listOrgsComFalhasConsecutivas } = await import(
      '@/modules/scheduler/scheduler.repository'
    );
    const ids = (await listOrgsComFalhasConsecutivas(3)).map((o) => o.id);
    expect(ids).toContain(orgTresFalhas);
    expect(ids).not.toContain(orgFalhaAntiga); // só 1 failed
  });
});
```

- [ ] **Step 3 — rodar e ver falhar**, depois implementar. Em `src/modules/scheduler/scheduler.service.ts` adicionar:

```ts
/** Backoff: org cujo ÚLTIMO report é failed há menos de N dias sai da elegibilidade automática. */
export const BACKOFF_FALHA_DIAS = 2;
/** Após N relatórios failed consecutivos, geracao_automatica é desligada e o admin avisado. */
export const FALHAS_CONSECUTIVAS_PAUSA = 3;
```

Em `src/modules/scheduler/scheduler.repository.ts`, substituir o conteúdo por:

```ts
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { connections, organizations } from '@/db/schema';
import { BACKOFF_FALHA_DIAS } from './scheduler.service';

/**
 * Orgs elegíveis para geração automática: active + plano + geracao_automatica
 * + conexão Bling status 'ok' + ciclo vencido (proximo_relatorio_liberado_em
 * <= agora OU null). Ordena por proximo_relatorio_liberado_em asc nulls first.
 *
 * G0 (backoff): exclui org cujo relatório MAIS RECENTE é 'failed' criado há
 * menos de BACKOFF_FALHA_DIAS — sem isso o cron re-tentava org quebrada TODO
 * dia (até 2 chamadas Opus/dia/org). Um 'done' (ou requeue que virou done)
 * mais novo reabilita na hora.
 *
 * (a guarda de `plano` não-nulo fica em `enqueueReport`, que já rejeita `sem_plano`.)
 */
export async function listOrgsElegiveisParaGeracao(
  agora: Date,
): Promise<{ id: string; name: string }[]> {
  const corteFalha = new Date(agora.getTime() - BACKOFF_FALHA_DIAS * 86_400_000);
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
        sql`NOT EXISTS (
          SELECT 1 FROM reports ult
          WHERE ult.org_id = ${organizations.id}
            AND ult.status = 'failed'
            AND ult.created_at > ${corteFalha}
            AND ult.created_at = (
              SELECT MAX(r2.created_at) FROM reports r2 WHERE r2.org_id = ult.org_id
            )
        )`,
      ),
    )
    .orderBy(sql`${organizations.proximo_relatorio_liberado_em} asc nulls first`);
  return rows.filter((r) => r.name !== null);
}

/**
 * Orgs active com geração automática ligada cujos `minFalhas` relatórios mais
 * recentes são TODOS 'failed' (exige pelo menos `minFalhas` relatórios) —
 * candidatas a pausa da auto-geração. Window function evita N+1.
 */
export async function listOrgsComFalhasConsecutivas(
  minFalhas: number,
): Promise<{ id: string; name: string }[]> {
  const rows = await db.execute(sql`
    SELECT o.id, o.name
    FROM organizations o
    JOIN (
      SELECT org_id
      FROM (
        SELECT r.org_id, r.status,
               row_number() OVER (PARTITION BY r.org_id ORDER BY r.created_at DESC) AS rn
        FROM reports r
      ) ult
      WHERE ult.rn <= ${minFalhas}
      GROUP BY org_id
      HAVING count(*) = ${minFalhas}
         AND count(*) FILTER (WHERE status = 'failed') = ${minFalhas}
    ) f ON f.org_id = o.id
    WHERE o.status = 'active' AND o.geracao_automatica = true
  `);
  return (rows as unknown as { id: string; name: string }[]).map((r) => ({
    id: r.id,
    name: r.name,
  }));
}
```

Rodar `npm run test -- tests/integration/scheduler-backoff.test.ts` (PASSA).

- [ ] **Step 4 — template + e-mail (teste primeiro).** Em `tests/unit/notification-templates.test.ts` adicionar:

```ts
describe('autoGeracaoPausadaTemplate', () => {
  it('inclui nome e id da org, escapando HTML', async () => {
    const { autoGeracaoPausadaTemplate } = await import('@/modules/notifications/templates');
    const t = autoGeracaoPausadaTemplate('Loja <X>', 'org-123');
    expect(t.subject).toContain('Geração automática pausada');
    expect(t.html).toContain('&lt;X&gt;');
    expect(t.text).toContain('org-123');
  });
});
```

Rodar (FALHA). Implementar em `templates.ts`:

```ts
/**
 * Template: geração automática pausada após falhas consecutivas (admin interno).
 */
export function autoGeracaoPausadaTemplate(orgName: string, orgId: string): EmailContent {
  const subject = '[Truth Analytics] Geração automática pausada após falhas consecutivas';
  const text = [
    'A geração automática de relatórios de um cliente foi pausada após 3 falhas consecutivas.',
    '',
    `Cliente: ${orgName}`,
    `Org ID: ${orgId}`,
    '',
    'Investigue os erros no painel admin. Após corrigir a causa, o cliente pode religar em Conexões → Preferências (ou reprocessar o último relatório).',
    '',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>A geração automática de relatórios de <strong>${escapeHtml(orgName)}</strong> foi pausada após 3 falhas consecutivas.</p>
<p><strong>Org ID:</strong> ${escapeHtml(orgId)}</p>
<p>Investigue os erros no painel admin. Após corrigir a causa, o cliente pode religar em Conexões → Preferências (ou reprocessar o último relatório).</p>`;

  return { subject, html, text };
}
```

E em `email.ts` (import + função):

```ts
/**
 * Avisa o admin interno que a auto-geração de uma org foi pausada. Nunca lança.
 */
export async function sendAutoGeracaoPausadaEmail(
  to: string,
  orgName: string,
  orgId: string,
): Promise<void> {
  const content = autoGeracaoPausadaTemplate(orgName, orgId);
  await sendEmail({ to, ...content });
}
```

- [ ] **Step 5 — passo de pausa no cron.** Em `src/app/api/cron/gerar-relatorios/route.ts`, adicionar imports:

```ts
import { setGeracaoAutomatica } from '@/modules/organizations/organization-settings.repository';
import { listOrgsComFalhasConsecutivas } from '@/modules/scheduler/scheduler.repository';
import { FALHAS_CONSECUTIVAS_PAUSA } from '@/modules/scheduler/scheduler.service';
import { sendAutoGeracaoPausadaEmail } from '@/modules/notifications/email';
import { getAdminAlertEmail } from '@/modules/notifications/recipients';
```

(unificar com os imports existentes de `scheduler.repository`/`scheduler.service`) e inserir logo APÓS o bloco de autenticação, antes de `const agora = new Date();` (o passo é independente de `agora`):

```ts
  // G0 (backoff): 3 relatórios failed consecutivos → desliga a auto-geração e
  // avisa o admin (best-effort). Roda ANTES da listagem — a org pausada some
  // da elegibilidade nesta mesma execução.
  let pausadas = 0;
  try {
    const quebradas = await listOrgsComFalhasConsecutivas(FALHAS_CONSECUTIVAS_PAUSA);
    for (const org of quebradas) {
      await setGeracaoAutomatica(org.id, false);
      pausadas++;
      logger.warn('cron.gerar_relatorios.auto_pausada', { orgId: org.id });
      const adminEmail = getAdminAlertEmail();
      if (adminEmail) await sendAutoGeracaoPausadaEmail(adminEmail, org.name, org.id);
    }
  } catch (err) {
    logger.error('cron.gerar_relatorios.pausa_falhou', {
      erro: err instanceof Error ? err.message : String(err),
    });
  }
```

e incluir `pausadas` no JSON final: `return NextResponse.json({ elegiveis: elegiveis.length, pausadas, resultados });`.

- [ ] **Step 6 — usage no analyze-ia (teste primeiro).** Em `tests/unit/analyze-ia.test.ts`: (a) em TODOS os pontos que fazem `const result = await analyzeWithIA(...)` e comparam com `validAnalise`, trocar `expect(result).toEqual(validAnalise)` → `expect(result.analise).toEqual(validAnalise)`; no Case 5, `result.resumoExecutivo` → `result.analise.resumoExecutivo`; (b) no Case 1, adicionar:

```ts
    // usage da 1ª tentativa persistível (fakeMessage: input 100 / output 200)
    expect(result.usage).toEqual({
      input_tokens: 100,
      output_tokens: 200,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      tentativas: 1,
    });
```

(c) no Case 2 (retry), adicionar `expect(result.usage.input_tokens).toBe(200); expect(result.usage.tentativas).toBe(2);`. Rodar (FALHA). Implementar em `analyze-ia.ts`: adicionar antes de `analyzeWithIA`:

```ts
/** Usage somado das tentativas da chamada Claude — persistido em reports.ia_usage. */
export type IaUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  tentativas: number;
};

type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

function acumularUsage(acc: IaUsage, usage: UsageLike | undefined | null): void {
  acc.input_tokens += usage?.input_tokens ?? 0;
  acc.output_tokens += usage?.output_tokens ?? 0;
  acc.cache_read_input_tokens += usage?.cache_read_input_tokens ?? 0;
  acc.cache_creation_input_tokens += usage?.cache_creation_input_tokens ?? 0;
  acc.tentativas += 1;
}
```

Mudar a assinatura para `export async function analyzeWithIA(metricas: Metricas, nicho: string | null): Promise<{ analise: AnaliseIa; usage: IaUsage }>`, criar `const usage: IaUsage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, tentativas: 0 };` no início, chamar `acumularUsage(usage, response.usage as UsageLike)` logo após CADA `messages.create(...)` (as duas tentativas) e trocar os `return AnaliseIaSchema.parse(parsed)` por `return { analise: AnaliseIaSchema.parse(parsed), usage };` (idem para `parsed2`). Atualizar o JSDoc da função.

- [ ] **Step 7 — orquestrador + finalize.** Em `src/modules/pipeline/orchestrator.ts` (linha 92): `const { analise, usage: iaUsage } = await analyzeWithIA(metricas, nicho);` e (linha 101) `await finalize({ reportId, orgId, metricas, analise, plano, clientEmail, iaUsage });`. Em `src/modules/pipeline/steps/finalize.ts`: importar o tipo (`import type { IaUsage } from '@/modules/pipeline/steps/analyze-ia';`), adicionar ao `FinalizeInput`:

```ts
  /** Usage da chamada Claude (tokens) — persistido em reports.ia_usage; null p/ retrocompat. */
  iaUsage?: IaUsage | null;
```

e no `tx.update(reports).set({...})` incluir `ia_usage: input.iaUsage ?? null,` após `analise_ia: analise,`.

- [ ] **Step 8 — mocks do orchestrator.test.** Em `tests/integration/orchestrator.test.ts`: adicionar junto ao fixture `MOCK_ANALISE`:

```ts
const MOCK_IA_USAGE = {
  input_tokens: 100,
  output_tokens: 200,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  tentativas: 1,
};
```

e trocar TODOS os `mockResolvedValue(MOCK_ANALISE)` / `mockResolvedValueOnce(MOCK_ANALISE)` por `...({ analise: MOCK_ANALISE, usage: MOCK_IA_USAGE })`. No happy path, adicionar asserção de persistência (junto às asserções de metricas/analise_ia):

```ts
    // ia_usage persistido no caminho de sucesso
    const [rowUsage] = await db
      .select({ ia_usage: reports.ia_usage })
      .from(reports)
      .where(eq(reports.id, reportId));
    expect(rowUsage!.ia_usage).toEqual(MOCK_IA_USAGE);
```

- [ ] **Step 9 — coluna no admin.** Em `src/modules/admin/admin.repository.ts`: em `OrgReportRow` adicionar `iaUsage: { input_tokens: number; output_tokens: number } | null;`; em `listOrgReports` adicionar `ia_usage: reports.ia_usage,` ao select e no map:

```ts
    iaUsage: r.ia_usage
      ? {
          input_tokens: Number((r.ia_usage as Record<string, unknown>).input_tokens ?? 0),
          output_tokens: Number((r.ia_usage as Record<string, unknown>).output_tokens ?? 0),
        }
      : null,
```

Em `src/app/admin/[orgId]/page.tsx`: adicionar `<TH>IA (tokens)</TH>` após `<TH>Erro</TH>` (linha 108) e a célula correspondente após a TD de erro (linha 130):

```tsx
                          <TD className="font-mono text-xs text-muted">
                            {r.iaUsage
                              ? `${r.iaUsage.input_tokens.toLocaleString('pt-BR')} → ${r.iaUsage.output_tokens.toLocaleString('pt-BR')}`
                              : '—'}
                          </TD>
```

(E2E `admin.spec.ts` não asserta estrutura de colunas — verificado; coluna é aditiva.)

- [ ] **Step 10 — rodar tudo:** `npm run test` + `npm run typecheck` (PASSA — inclusive analyze-ia, orchestrator, scheduler-backoff, templates).
- [ ] **Step 11 — commit:** `feat(g0): backoff da auto-geracao (2d + pausa apos 3 falhas) e usage da IA persistido em reports.ia_usage`

---

### Task 6: Robustez da chamada Claude (`stop_reason` + retentativa via streaming)

**Files:**
- Modify: `src/modules/pipeline/steps/analyze-ia.ts` (REESCRITA COMPLETA — versão final abaixo já incorpora Task 4 `avisoBenchmark` e Task 5 `IaUsage`)
- Test: `tests/unit/analyze-ia.test.ts` (mod — mock de `messages.stream` + casos novos)

**Interfaces:**
- Consumes: `getAnthropic()` de `src/modules/ai/claude.ts` (lazy singleton; testes fazem `vi.spyOn`); contrato Task 5: `analyzeWithIA → Promise<{ analise: AnaliseIa; usage: IaUsage }>` (**preservar**); orquestrador mapeia `err.message` → `report.erro` (**preservar**: erros são `Error` com mensagens-código).
- Produces:
  - Checagem de `stop_reason` ANTES do parse em ambas as tentativas: `'refusal'` → `throw new Error('analise_ia_recusada')` (sem retry — repetir o mesmo prompt tende a ser recusado de novo); `'max_tokens'` na 1ª → retentativa; `'max_tokens'` na 2ª → `throw new Error('analise_ia_truncada')`.
  - Retentativa ÚNICA sempre via `client.messages.stream({...}).finalMessage()` com `max_tokens: 32000` (streaming p/ max_tokens alto evita timeout HTTP do SDK): truncamento → MESMAS mensagens (sem turno de correção — a resposta não era inválida, era incompleta); parse inválido → mensagens de correção curta (comportamento atual preservado).
  - `logger.info('analise_ia.tentativa', { tentativa, stopReason, inputTokens, outputTokens })` nas DUAS tentativas.
  - Erros possíveis (todos mapeados p/ `report.erro` pelo orquestrador, contrato intocado): `ia_nao_configurada`, `analise_ia_recusada`, `analise_ia_truncada`, `analise_ia_invalida`.

- [ ] **Step 1 — testes falhando.** Substituir em `tests/unit/analyze-ia.test.ts` o `beforeEach` (setup do mock) para incluir `messages.stream`, ajustar `fakeMessage` para aceitar `stop_reason` e adaptar os casos de retry (agora via stream). Mudanças pontuais:

(a) `fakeMessage` ganha parâmetro:

```ts
function fakeMessage(textContent: string, stopReason: string = 'end_turn') {
  return {
    id: 'msg_fake',
    type: 'message' as const,
    role: 'assistant' as const,
    model: serverEnv.ANALYSIS_MODEL,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 200 },
    content: [
      { type: 'thinking', thinking: 'Reasoning block that should be skipped' },
      { type: 'text', text: textContent },
    ],
  };
}
```

(idem `fakeThinkingOnlyMessage` — manter `stop_reason: 'end_turn'`).

(b) no `beforeEach`, criar também o mock de stream e registrá-lo no client:

```ts
    mockCreate = vi.fn();
    mockStream = vi.fn();
    vi.spyOn(claudeModule, 'getAnthropic').mockReturnValue({
      messages: { create: mockCreate, stream: mockStream },
    } as unknown as import('@anthropic-ai/sdk').default);
```

com `let mockStream: ReturnType<typeof vi.fn>;` declarado junto de `mockCreate`, e um helper no topo do describe:

```ts
  /** Registra a resposta da retentativa (via messages.stream(...).finalMessage()). */
  function streamDevolve(msg: unknown) {
    mockStream.mockReturnValueOnce({ finalMessage: async () => msg });
  }
```

(c) adaptar os casos existentes de retry — a 2ª chamada agora é `mockStream`, não `mockCreate`:
- **Case 1c**: trocar o segundo `mockResolvedValueOnce` por `streamDevolve(fakeMessage(JSON.stringify(validAnalise)))`; ler os params da retentativa de `mockStream.mock.calls[0][0]` (em vez de `mockCreate.mock.calls[1][0]`) e adicionar `expect(mockStream.mock.calls[0][0].max_tokens).toBe(32000);`.
- **Case 2**: idem (`streamDevolve(...)` + `expect(mockCreate).toHaveBeenCalledTimes(1); expect(mockStream).toHaveBeenCalledTimes(1);` + mensagens da correção lidas de `mockStream.mock.calls[0][0].messages`).
- **Case 3**: primeira via `mockCreate.mockResolvedValueOnce(fakeMessage('Não é JSON válido'))`, segunda via `streamDevolve(fakeMessage('Também não é JSON'))`; asserções: `analise_ia_invalida`, `mockCreate` 1x, `mockStream` 1x.
- **Case 7**: segunda resposta via `streamDevolve(...)`; mensagens do retry lidas de `mockStream.mock.calls[0][0].messages`.

(d) casos NOVOS ao final do describe:

```ts
  it('Case 8 — refusal na 1ª tentativa: lança analise_ia_recusada sem retry', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage('', 'refusal'));
    await expect(analyzeWithIA(validMetricas, null)).rejects.toThrow('analise_ia_recusada');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it('Case 9 — max_tokens na 1ª: retenta via stream com 32000 e as MESMAS mensagens (sem turno de correção)', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage('{"truncado":', 'max_tokens'));
    streamDevolve(fakeMessage(JSON.stringify(validAnalise)));

    const result = await analyzeWithIA(validMetricas, null);
    expect(result.analise).toEqual(validAnalise);
    expect(result.usage.tentativas).toBe(2);

    const retry = mockStream.mock.calls[0][0];
    expect(retry.max_tokens).toBe(32000);
    // truncamento NÃO adiciona turno de correção: só o turno user original
    expect(retry.messages).toHaveLength(1);
    expect(retry.messages[0].role).toBe('user');
  });

  it('Case 10 — max_tokens nas DUAS tentativas: lança analise_ia_truncada', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage('{"truncado":', 'max_tokens'));
    streamDevolve(fakeMessage('{"ainda_truncado":', 'max_tokens'));
    await expect(analyzeWithIA(validMetricas, null)).rejects.toThrow('analise_ia_truncada');
  });

  it('Case 11 — refusal na retentativa: lança analise_ia_recusada', async () => {
    mockCreate.mockResolvedValueOnce(fakeMessage('Não é JSON válido'));
    streamDevolve(fakeMessage('', 'refusal'));
    await expect(analyzeWithIA(validMetricas, null)).rejects.toThrow('analise_ia_recusada');
  });
```

Rodar `npm run test -- tests/unit/analyze-ia.test.ts` (FALHA).

- [ ] **Step 2 — reescrever `src/modules/pipeline/steps/analyze-ia.ts`** (versão FINAL — já contém `avisoBenchmark` da Task 4 e `IaUsage` da Task 5; substituir o arquivo inteiro):

```ts
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages/messages';

import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getAnthropic } from '@/modules/ai/claude';
import { AnaliseIaSchema, type AnaliseIa, type Metricas } from '@/modules/pipeline/contracts';

// Build the JSON schema once at module load — pure, no I/O.
const _rawSchema = zodToJsonSchema(AnaliseIaSchema, { $refStrategy: 'none' });
if ('$schema' in _rawSchema) {
  delete (_rawSchema as Record<string, unknown>)['$schema'];
}
const ANALISE_JSON_SCHEMA: Record<string, unknown> = _rawSchema as Record<string, unknown>;

/** Orçamento padrão da 1ª tentativa. */
const MAX_TOKENS_PADRAO = 16000;
/** Orçamento da retentativa (via stream — max_tokens alto exige streaming). */
const MAX_TOKENS_RETENTATIVA = 32000;

// ---------------------------------------------------------------------------
// Usage (Task 5 — persistido em reports.ia_usage)
// ---------------------------------------------------------------------------

/** Usage somado das tentativas da chamada Claude — persistido em reports.ia_usage. */
export type IaUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  tentativas: number;
};

type UsageLike = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

function acumularUsage(acc: IaUsage, usage: UsageLike | undefined | null): void {
  acc.input_tokens += usage?.input_tokens ?? 0;
  acc.output_tokens += usage?.output_tokens ?? 0;
  acc.cache_read_input_tokens += usage?.cache_read_input_tokens ?? 0;
  acc.cache_creation_input_tokens += usage?.cache_creation_input_tokens ?? 0;
  acc.tentativas += 1;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Aviso de benchmark em 3 casos (G0/Task 4):
 * (a) sem benchmark NENHUM → focar mix/canais/regularidade, recomendacoesPreco vazio;
 * (b) parcial (provider ATIVO falhou) → cautela explícita;
 * (c) fonte única completa → analisar preço normalmente citando a fonte.
 */
function avisoBenchmark(metricas: Metricas): string {
  const comMercado = metricas.posicaoPreco.filter((p) => p.precoMercadoMediano > 0);
  if (comMercado.length === 0) {
    return `\n\nATENÇÃO: NENHUM benchmark de mercado está disponível neste período. NÃO invente preços de concorrentes nem posição competitiva. Deixe "recomendacoesPreco" como lista vazia e concentre a análise no mix de produtos, nos canais de venda e na regularidade das vendas — há muito valor nesses dados.`;
  }
  if (metricas.benchmarkParcial) {
    return `\n\nATENÇÃO: O benchmark de mercado está INCOMPLETO (benchmarkParcial=true). NÃO infira nem invente conclusões sobre concorrentes, participação de mercado ou posição relativa a partir de dados ausentes. Em recomendações de preço, deixe claro explicitamente que a base comparativa é limitada e evite afirmações categóricas sobre competitividade.`;
  }
  const fontes = [...new Set(comMercado.map((p) => p.fonte).filter((f) => f !== ''))];
  if (fontes.length === 1) {
    return `\n\nO benchmark de mercado vem de uma única fonte (${fontes[0]}). Analise preços normalmente e cite essa fonte nas recomendações de preço.`;
  }
  return '';
}

function buildSystemPrompt(metricas: Metricas): string {
  const aviso = avisoBenchmark(metricas);
  const truthScore = metricas.truth_score?.score;

  const scoreTexto =
    truthScore === undefined
      ? ''
      : `\n\nAs métricas incluem um "truth_score" (${truthScore}/100) — índice de saúde da operação composto por: crescimento vs período anterior, posição de preço vs mercado, diversificação de canais, regularidade de vendas e cobertura de benchmark (detalhes no campo "fatores"). No resumoExecutivo, comente o score e cite os fatores mais fracos; conecte gargalos e sugestoesMelhoria aos fatores que mais penalizaram o score.`;

  return `Você é um analista sênior de e-commerce e marketplaces brasileiro. A partir das métricas fornecidas pelo usuário, produza uma análise estratégica completa em português do Brasil com os seguintes componentes:

1. **resumoExecutivo**: síntese dos resultados do período (pontos fortes e fracos).
2. **gargalos**: lista dos principais obstáculos ao crescimento identificados nas métricas.
3. **sugestoesMelhoria**: ações concretas e priorizadas para melhorar os resultados.
4. **ideiasVenda**: ideias de campanhas, bundles, estratégias de cross-sell ou up-sell adequadas ao perfil dos produtos.
5. **recomendacoesPreco**: para cada produto com posição de preço disponível, sugira um preço otimizado com justificativa clara baseada nos dados.

Use o nicho informado para contextualizar suas recomendações. Seja direto, prático e orientado a dados.${aviso}${scoreTexto}

Responda EXCLUSIVAMENTE com um objeto JSON válido conforme o schema fornecido. Não inclua texto fora do JSON.`;
}

function buildUserMessage(metricas: Metricas, nicho: string | null): string {
  const nichoTexto = nicho ? `Nicho de mercado: ${nicho}\n\n` : '';
  return `${nichoTexto}Métricas do período:\n${JSON.stringify(metricas, null, 2)}`;
}

function extractTextBlock(content: unknown[]): string | null {
  const block = content.find(
    (b) => typeof b === 'object' && b !== null && (b as { type: string }).type === 'text',
  ) as { type: 'text'; text: string } | undefined;
  return block?.text ?? null;
}

type RespostaClaude = {
  stop_reason?: string | null;
  usage?: UsageLike;
  content: unknown[];
};

function logTentativa(tentativa: number, r: RespostaClaude): void {
  logger.info('analise_ia.tentativa', {
    tentativa,
    stopReason: r.stop_reason ?? null,
    inputTokens: r.usage?.input_tokens ?? 0,
    outputTokens: r.usage?.output_tokens ?? 0,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analisa as métricas usando Claude com saídas estruturadas (JSON Schema via
 * output_config) e devolve também o usage somado (Task 5).
 *
 * Robustez (G0/Task 6) — `stop_reason` é checado ANTES do parse:
 * - 'refusal'    → Error('analise_ia_recusada') — sem retry (repetir o mesmo
 *                  prompt tende a ser recusado de novo).
 * - 'max_tokens' → resposta TRUNCADA (thinking pode consumir o orçamento):
 *                  retentativa com as MESMAS mensagens via messages.stream()
 *                  + finalMessage() e max_tokens 32000. Truncou de novo →
 *                  Error('analise_ia_truncada').
 * - parse/validação inválidos → retentativa de correção CURTA (erro truncado
 *   + instrução), também via stream/32000. Falhou de novo →
 *   Error('analise_ia_invalida').
 *
 * O orquestrador mapeia a mensagem do Error para report.erro — contrato
 * preservado. O prefixo (system + métricas) tem cache_control: o retry paga
 * só o delta.
 */
export async function analyzeWithIA(
  metricas: Metricas,
  nicho: string | null,
): Promise<{ analise: AnaliseIa; usage: IaUsage }> {
  const system = buildSystemPrompt(metricas);
  const userText = buildUserMessage(metricas, nicho);
  const usage: IaUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    tentativas: 0,
  };

  const userBlock = {
    type: 'text' as const,
    text: userText,
    cache_control: { type: 'ephemeral' as const },
  };
  const messages: MessageParam[] = [{ role: 'user', content: [userBlock] }];

  const callParams = {
    model: serverEnv.ANALYSIS_MODEL,
    max_tokens: MAX_TOKENS_PADRAO,
    thinking: { type: 'adaptive' as const },
    output_config: {
      effort: 'high' as const,
      format: {
        type: 'json_schema' as const,
        schema: ANALISE_JSON_SCHEMA,
      },
    },
    system: [
      {
        type: 'text' as const,
        text: system,
        cache_control: { type: 'ephemeral' as const },
      },
    ],
    messages,
  };

  // ---- Tentativa 1 (create) ------------------------------------------------
  const response = (await getAnthropic().messages.create(callParams)) as RespostaClaude;
  acumularUsage(usage, response.usage);
  logTentativa(1, response);

  if (response.stop_reason === 'refusal') {
    throw new Error('analise_ia_recusada');
  }

  const truncou1 = response.stop_reason === 'max_tokens';
  const text1 = truncou1 ? null : extractTextBlock(response.content);

  let parseError: string | null = null;
  if (text1 !== null) {
    try {
      const parsed = JSON.parse(text1);
      return { analise: AnaliseIaSchema.parse(parsed), usage };
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  } else if (!truncou1) {
    parseError = 'Nenhum bloco de texto encontrado na resposta';
  }

  // ---- Retentativa ÚNICA (stream + orçamento maior) ------------------------
  // Truncamento → MESMAS mensagens (a resposta era incompleta, não inválida).
  // Parse inválido → correção curta (prefixo cacheado + erro + instrução).
  let retryMessages: MessageParam[];
  if (truncou1) {
    logger.warn('análise IA: resposta truncada (max_tokens), re-tentando com orçamento maior', {
      maxTokens: MAX_TOKENS_RETENTATIVA,
    });
    retryMessages = messages;
  } else {
    const erroCurto = (parseError ?? 'resposta sem bloco de texto').slice(0, 500);
    logger.warn('análise IA: primeira tentativa inválida, re-tentando', { parseError: erroCurto });
    const correcao = `A resposta anterior falhou na validação do schema: ${erroCurto}. Responda APENAS com o objeto JSON válido conforme o schema, sem texto adicional.`;
    retryMessages =
      text1 !== null
        ? [
            { role: 'user', content: [userBlock] },
            { role: 'assistant', content: text1 },
            { role: 'user', content: correcao },
          ]
        : [
            { role: 'user', content: [userBlock] },
            { role: 'user', content: correcao },
          ];
  }

  const response2 = (await getAnthropic()
    .messages.stream({
      ...callParams,
      max_tokens: MAX_TOKENS_RETENTATIVA,
      messages: retryMessages,
    })
    .finalMessage()) as RespostaClaude;
  acumularUsage(usage, response2.usage);
  logTentativa(2, response2);

  if (response2.stop_reason === 'refusal') {
    throw new Error('analise_ia_recusada');
  }
  if (response2.stop_reason === 'max_tokens') {
    logger.error('análise IA truncada após retentativa com orçamento maior', {
      maxTokens: MAX_TOKENS_RETENTATIVA,
    });
    throw new Error('analise_ia_truncada');
  }

  const text2 = extractTextBlock(response2.content);
  if (text2 !== null) {
    try {
      const parsed2 = JSON.parse(text2);
      return { analise: AnaliseIaSchema.parse(parsed2), usage };
    } catch {
      // fall through
    }
  }

  logger.error('análise IA inválida após retry');
  throw new Error('analise_ia_invalida');
}
```

- [ ] **Step 3 — rodar e ver passar:** `npm run test -- tests/unit/analyze-ia.test.ts` (PASSA — todos os 12+ casos). `npm run test` completo + `npm run typecheck` (orchestrator intocado; `Case 1` da Task 5 continua verde pois `max_tokens: 16000` = `MAX_TOKENS_PADRAO`).
- [ ] **Step 4 — commit:** `feat(g0): stop_reason checado na chamada Claude + retentativa via stream com max_tokens 32000`

---

### Task 7: Tokens Bling vivos + aviso de conexão expirada

**Files:**
- Modify: `src/modules/connections/connection.repository.ts` (`getValidAccessToken` com margem; + `listConnectionsExpirando`)
- Create: `src/modules/connections/token-renewal.ts`
- Modify: `src/app/api/cron/sincronizar-pedidos/route.ts` (passo de renovação ANTES do sync — criado na Task 1)
- Modify: `src/app/(client)/dashboard/page.tsx` (banner conexão expirada)
- Modify: `src/app/admin/client-row.tsx` (badge Expirada `warn` → `danger`)
- Test: `tests/integration/token-renewal.test.ts` (novo)

**Interfaces:**
- Consumes: `getValidAccessToken` atual (`connection.repository.ts:66-107` — refresh se `expira_em − agora ≤ 60s`; em falha marca `status='expirado'` + e-mail best-effort ao cliente — comportamento PRESERVADO); `blingProvider.refresh(refreshToken): Promise<OAuthTokens>`; `notify` + `getOrgPrimaryUser`/`getOrgAnalistaUser` (assinaturas confirmadas em `recipients.ts:35,50`); `getOrganizationById(orgId)`; `getConnection(orgId)` já devolve `status` (`connection.repository.ts:46-64`); componente `Alert` (`variant: 'danger'`).
- Produces:
  - `getValidAccessToken(orgId: string, margemMs: number = REFRESH_MARGIN_MS): Promise<string>` — margem parametrizada; default preserva os 60s (pipeline intocado).
  - `listConnectionsExpirando(margemMs: number, agora?: Date): Promise<string[]>` — org_ids com conexão bling `status='ok'`, tokens presentes, `expira_em ≤ agora + margem`.
  - `MARGEM_RENOVACAO_MS = 24 * 60 * 60 * 1000` e `renovarConexaoDaOrg(orgId: string): Promise<'renovada' | 'expirada'>` em `token-renewal.ts` — em falha, notifica in-app cliente + analista (best-effort, UMA vez: a conexão sai de `'ok'` e não é re-selecionada no dia seguinte).
  - Rota de sync ganha passo de renovação ANTES do sync (conexões que viraram `expirado` saem da lista de sync na mesma execução); resposta ganha `{ renovadas, expiradas }`.
  - Dashboard: `Alert variant="danger"` com link `/conexoes` quando `conn.status === 'expirado'` (aditivo — testids preservados).
  - Lista admin: badge `Expirada` em vermelho (`danger`).

- [ ] **Step 1 — teste de integração falhando.** Criar `tests/integration/token-renewal.test.ts`:

```ts
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { db } from '@/db/client';
import { connections, notifications, organizations, users } from '@/db/schema';
import { encryptSecret } from '@/modules/crypto/crypto';
import { blingProvider } from '@/modules/providers/bling/provider';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-renewal-';
const HORA = 3_600_000;

describe.skipIf(!url)('renovação proativa de tokens Bling — integração', () => {
  let orgId = '';
  let userId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}${RUN}@example.com`, senha_hash: 'h', role: 'client' })
      .returning({ id: users.id });
    userId = user!.id;
    // Conexão ok expirando em 12h (dentro da margem de 24h)
    await db.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: encryptSecret('tok-antigo'),
      refresh_token: encryptSecret('rt-antigo'),
      status: 'ok',
      expira_em: new Date(Date.now() + 12 * HORA),
    });
  });

  afterAll(async () => {
    try {
      await db.delete(notifications).where(eq(notifications.user_id, userId));
      await db.delete(connections).where(eq(connections.org_id, orgId));
      await db.delete(users).where(eq(users.org_id, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('listConnectionsExpirando inclui conexão que expira em <24h e exclui com margem de 1h', async () => {
    const { listConnectionsExpirando } = await import(
      '@/modules/connections/connection.repository'
    );
    expect(await listConnectionsExpirando(24 * HORA)).toContain(orgId);
    expect(await listConnectionsExpirando(1 * HORA)).not.toContain(orgId);
  });

  it('renovarConexaoDaOrg renova o token (refresh ok) e mantém status ok', async () => {
    const refreshSpy = vi.spyOn(blingProvider, 'refresh').mockResolvedValueOnce({
      accessToken: 'tok-novo',
      refreshToken: 'rt-novo',
      expiresInSeconds: 6 * 3600,
    });
    try {
      const { renovarConexaoDaOrg } = await import('@/modules/connections/token-renewal');
      const resultado = await renovarConexaoDaOrg(orgId);
      expect(resultado).toBe('renovada');
      expect(refreshSpy).toHaveBeenCalledWith('rt-antigo');

      const [conn] = await db
        .select({ status: connections.status, expira: connections.expira_em })
        .from(connections)
        .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));
      expect(conn!.status).toBe('ok');
      expect(conn!.expira!.getTime()).toBeGreaterThan(Date.now() + 5 * HORA);
    } finally {
      refreshSpy.mockRestore();
    }
  });

  it('refresh falhou → status expirado + notify in-app do cliente com href /conexoes', async () => {
    const refreshSpy = vi
      .spyOn(blingProvider, 'refresh')
      .mockRejectedValueOnce(new Error('invalid_grant'));
    try {
      const { renovarConexaoDaOrg } = await import('@/modules/connections/token-renewal');
      const resultado = await renovarConexaoDaOrg(orgId);
      expect(resultado).toBe('expirada');

      const [conn] = await db
        .select({ status: connections.status })
        .from(connections)
        .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')));
      expect(conn!.status).toBe('expirado');

      const notifs = await db
        .select({ tipo: notifications.tipo, href: notifications.href })
        .from(notifications)
        .where(eq(notifications.user_id, userId));
      const aviso = notifs.find((n) => n.tipo === 'conexao_expirada');
      expect(aviso).toBeDefined();
      expect(aviso!.href).toBe('/conexoes');
    } finally {
      refreshSpy.mockRestore();
    }
  });
});
```

> NOTA: o 2º teste roda com a conexão renovada expirando em 6h — segue dentro da margem de 24h, então o 3º teste (falha) opera na mesma conexão sem re-seed.

- [ ] **Step 2 — rodar e ver falhar:** `npm run test -- tests/integration/token-renewal.test.ts`.
- [ ] **Step 3 — margem no repositório.** Em `src/modules/connections/connection.repository.ts`: (a) trocar a assinatura (linha 66) para:

```ts
export async function getValidAccessToken(
  orgId: string,
  margemMs: number = REFRESH_MARGIN_MS,
): Promise<string> {
```

e a comparação (linha 77) para `if (expMs - Date.now() > margemMs) {` (JSDoc: "margemMs — renova quando faltar menos que isso p/ expirar; default 60s preserva o comportamento do pipeline; o cron de renovação proativa passa 24h"). (b) adicionar `lte` ao import de `drizzle-orm` e acrescentar ao final do arquivo:

```ts
/**
 * Orgs com conexão Bling 'ok' cujo token expira em até `margemMs` — universo
 * do passo de renovação proativa do cron diário.
 */
export async function listConnectionsExpirando(
  margemMs: number,
  agora: Date = new Date(),
): Promise<string[]> {
  const limite = new Date(agora.getTime() + margemMs);
  const rows = await db
    .select({ orgId: connections.org_id })
    .from(connections)
    .where(
      and(
        eq(connections.provider, PROVIDER),
        eq(connections.status, 'ok'),
        isNotNull(connections.access_token),
        isNotNull(connections.refresh_token),
        isNotNull(connections.expira_em),
        lte(connections.expira_em, limite),
      ),
    );
  return rows.map((r) => r.orgId);
}
```

- [ ] **Step 4 — helper de renovação.** Criar `src/modules/connections/token-renewal.ts`:

```ts
import { logger } from '@/lib/logger';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { getValidAccessToken } from '@/modules/connections/connection.repository';
import { notify } from '@/modules/notifications/notification.repository';
import { getOrgAnalistaUser, getOrgPrimaryUser } from '@/modules/notifications/recipients';

/** Tokens Bling expirando em até 24h são renovados proativamente pelo cron. */
export const MARGEM_RENOVACAO_MS = 24 * 60 * 60 * 1000;

/**
 * Renova o token Bling de UMA org (reusa o refresh de getValidAccessToken com
 * margem de 24h). Em falha, o repositório JÁ marcou status='expirado' e
 * enviou o e-mail ao cliente — aqui somamos as notificações in-app (cliente +
 * analista da carteira), best-effort. Como a conexão sai de 'ok', ela não é
 * re-selecionada amanhã → o aviso sai UMA vez, sem spam.
 */
export async function renovarConexaoDaOrg(orgId: string): Promise<'renovada' | 'expirada'> {
  try {
    await getValidAccessToken(orgId, MARGEM_RENOVACAO_MS);
    return 'renovada';
  } catch (err) {
    logger.warn('token_renewal.refresh_falhou', {
      orgId,
      erro: err instanceof Error ? err.message : String(err),
    });
    await notificarConexaoExpirada(orgId);
    return 'expirada';
  }
}

/** Notificação in-app de conexão expirada (cliente + analista). Nunca lança. */
async function notificarConexaoExpirada(orgId: string): Promise<void> {
  try {
    const [user, analista, org] = await Promise.all([
      getOrgPrimaryUser(orgId),
      getOrgAnalistaUser(orgId),
      getOrganizationById(orgId),
    ]);
    if (user) {
      await notify(user.id, {
        tipo: 'conexao_expirada',
        titulo: 'Sua conexão com o Bling expirou',
        corpo:
          'Seus dados de vendas pararam de atualizar. Reconecte o Bling em Conexões para continuar recebendo análises e alertas.',
        href: '/conexoes',
      });
    }
    if (analista) {
      await notify(analista.id, {
        tipo: 'conexao_expirada',
        titulo: 'Conexão Bling de um cliente expirou',
        corpo: `A conexão Bling de ${org?.name ?? 'um cliente da sua carteira'} expirou. Oriente o cliente a reconectar em Conexões.`,
        href: '/analista',
      });
    }
  } catch (err) {
    logger.warn('token_renewal.notificacao_falhou', {
      orgId,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
}
```

- [ ] **Step 5 — passo de renovação no cron.** Em `src/app/api/cron/sincronizar-pedidos/route.ts` (criado na Task 1), adicionar imports:

```ts
import { listConnectionsExpirando } from '@/modules/connections/connection.repository';
import {
  MARGEM_RENOVACAO_MS,
  renovarConexaoDaOrg,
} from '@/modules/connections/token-renewal';
```

e inserir entre a autenticação e `const orgIds = ...` (o `const agora = new Date();` já existe antes):

```ts
  // Passo 1 (G0/Task 7): renovação proativa de tokens — RODA ANTES do sync
  // para que conexões renovadas sincronizem e as que viraram 'expirado' saiam
  // da lista. Falha em UMA conexão não aborta o lote.
  let renovadas = 0;
  let expiradas = 0;
  for (const orgId of await listConnectionsExpirando(MARGEM_RENOVACAO_MS, agora)) {
    try {
      const resultado = await renovarConexaoDaOrg(orgId);
      if (resultado === 'renovada') renovadas++;
      else expiradas++;
      logger.info('cron.sincronizar_pedidos.token', { orgId, resultado });
    } catch (err) {
      expiradas++;
      logger.error('cron.sincronizar_pedidos.token_erro', {
        orgId,
        erro: err instanceof Error ? err.message : String(err),
      });
    }
  }
```

Atualizar o retorno: `return Response.json({ orgs: orgIds.length, sincronizadas, falhas, renovadas, expiradas });` e o JSDoc da rota ("Passo 1: renova tokens expirando em <24h; Passo 2: sync incremental").

- [ ] **Step 6 — banner no dashboard.** Em `src/app/(client)/dashboard/page.tsx`: adicionar `import { Alert } from '@/components/ui/Alert';` e inserir logo APÓS o `<h1 ...>Dashboard</h1>` (antes do `<OnboardingChecklist ...>`):

```tsx
      {/* Conexão expirada — persistente até reconectar (G0/Task 7) */}
      {conn && conn.status === 'expirado' ? (
        <Alert variant="danger" title="Sua conexão com o Bling expirou">
          Seus dados de vendas pararam de atualizar e os relatórios automáticos foram pausados.{' '}
          <a href="/conexoes" className="font-medium underline underline-offset-2">
            Reconectar em Conexões →
          </a>
        </Alert>
      ) : null}
```

(`conn` já é carregado na página — `getConnection` devolve `status`; nenhum testid alterado.)

- [ ] **Step 7 — badge vermelho no admin.** Em `src/app/admin/client-row.tsx` (linha 41), trocar `expirado: { variant: 'warn', label: 'Expirada' },` por `expirado: { variant: 'danger', label: 'Expirada' },`.
- [ ] **Step 8 — rodar:** `npm run test -- tests/integration/token-renewal.test.ts tests/integration/sync-pedidos.test.ts` (PASSA — os testes de auth da rota seguem verdes: o passo de renovação só roda depois do Bearer). `npm run test` completo + `npm run typecheck`. Conferir `tests/integration/connection-repository.test.ts` (a mudança de assinatura é retrocompatível — default preservado).
- [ ] **Step 9 — commit:** `feat(g0): renovacao proativa de tokens Bling (24h) + aviso de conexao expirada (in-app, banner, admin)`

---

### Task 8: Notify in-app "relatório pronto" + feedback do OAuth callback em /conexoes

**Files:**
- Modify: `src/modules/pipeline/steps/finalize.ts`
- Create: `src/app/(client)/conexoes/callback-feedback.ts`
- Modify: `src/app/(client)/conexoes/page.tsx`
- Test: `tests/unit/callback-feedback.test.ts` (novo), `tests/integration/finalize-notify.test.ts` (novo)

**Interfaces:**
- Consumes: `notify(userId, { tipo, titulo, corpo, href })` (nunca lança); `getOrgPrimaryUser(orgId)`; valores REAIS de erro do callback (`src/app/api/connections/bling/callback/route.ts`): redirects para `/conexoes?erro=state_invalido`, `/conexoes?erro=falha_conexao` e `/conexoes?ok=1` (verificado nas linhas 22, 28, 30); componente `Alert` (variants `success`/`danger`); `FinalizeInput` pós-Task 5 (com `iaUsage`).
- Produces:
  - `finalize` dispara `notify(user.id, { tipo: 'relatorio_pronto', ..., href: '/dashboard/relatorios/{reportId}' })` best-effort, FORA da transação (padrão do e-mail).
  - `feedbackDeCallback(searchParams?: { ok?: string; erro?: string }): { variante: 'success' | 'danger'; titulo: string; mensagem: string } | null` — puro, cobre `state_invalido`, `falha_conexao` e fallback p/ erro desconhecido.
  - `/conexoes` renderiza o Alert correspondente no topo (aditivo — testid `bling-status` intocado; E2E `conexoes.spec.ts` não usa searchParams).

- [ ] **Step 1 — teste unit do feedback falhando.** Criar `tests/unit/callback-feedback.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { feedbackDeCallback } from '@/app/(client)/conexoes/callback-feedback';

describe('feedbackDeCallback — retorno do OAuth Bling', () => {
  it('ok=1 → sucesso com CTA de gerar análise', () => {
    const f = feedbackDeCallback({ ok: '1' });
    expect(f).not.toBeNull();
    expect(f!.variante).toBe('success');
    expect(f!.titulo).toContain('Bling conectado');
    expect(f!.mensagem).toContain('análise');
  });

  it('erro=state_invalido → orientação para tentar de novo', () => {
    const f = feedbackDeCallback({ erro: 'state_invalido' });
    expect(f!.variante).toBe('danger');
    expect(f!.mensagem).toMatch(/tente/i);
  });

  it('erro=falha_conexao → orientação de aguardar e tentar novamente', () => {
    const f = feedbackDeCallback({ erro: 'falha_conexao' });
    expect(f!.variante).toBe('danger');
    expect(f!.mensagem).toMatch(/novamente/i);
  });

  it('erro desconhecido → fallback genérico; sem params → null', () => {
    expect(feedbackDeCallback({ erro: 'outro_qualquer' })!.variante).toBe('danger');
    expect(feedbackDeCallback(undefined)).toBeNull();
    expect(feedbackDeCallback({})).toBeNull();
  });
});
```

- [ ] **Step 2 — rodar e ver falhar**, depois criar `src/app/(client)/conexoes/callback-feedback.ts`:

```ts
/**
 * Feedback do retorno do OAuth Bling (puro) — o callback redireciona para
 * /conexoes?ok=1 | ?erro=state_invalido | ?erro=falha_conexao (ver
 * src/app/api/connections/bling/callback/route.ts). Antes do G0 esses params
 * eram descartados e a falha de conexão não mudava NADA na tela — no passo 1
 * do onboarding.
 */
export type CallbackFeedback = {
  variante: 'success' | 'danger';
  titulo: string;
  mensagem: string;
};

const MENSAGENS_ERRO: Record<string, string> = {
  state_invalido:
    'A autorização expirou ou o link é inválido. Clique em "Conectar Bling" e tente de novo.',
  falha_conexao:
    'Não foi possível concluir a conexão com o Bling. Aguarde alguns instantes e tente novamente.',
};

export function feedbackDeCallback(
  searchParams?: { ok?: string; erro?: string },
): CallbackFeedback | null {
  if (!searchParams) return null;
  if (searchParams.ok === '1') {
    return {
      variante: 'success',
      titulo: 'Bling conectado!',
      mensagem: 'Você já pode gerar sua análise no Dashboard.',
    };
  }
  if (searchParams.erro) {
    return {
      variante: 'danger',
      titulo: 'Falha ao conectar o Bling',
      mensagem:
        MENSAGENS_ERRO[searchParams.erro] ?? 'Não foi possível conectar. Tente novamente.',
    };
  }
  return null;
}
```

Rodar de novo (PASSA).

- [ ] **Step 3 — página /conexoes.** Em `src/app/(client)/conexoes/page.tsx`: adicionar imports (`Alert`, `feedbackDeCallback`), trocar a assinatura para:

```tsx
export default async function ConexoesPage({
  searchParams,
}: {
  searchParams?: { ok?: string; erro?: string };
}) {
```

e inserir após o `<h1 ...>Conexões</h1>`:

```tsx
      {/* Retorno do OAuth Bling (G0/Task 8) */}
      {(() => {
        const feedback = feedbackDeCallback(searchParams);
        return feedback ? (
          <Alert variant={feedback.variante} title={feedback.titulo}>
            {feedback.mensagem}
          </Alert>
        ) : null;
      })()}
```

- [ ] **Step 4 — teste de integração do notify falhando.** Criar `tests/integration/finalize-notify.test.ts`:

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { notifications, organizations, reports, users } from '@/db/schema';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-fin-notify-';

const METRICAS: Metricas = {
  vendasPorCanal: [],
  evolucao: [],
  ticketMedio: 0,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: true,
};
const ANALISE: AnaliseIa = {
  resumoExecutivo: 'ok',
  gargalos: [],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe.skipIf(!url)('finalize — notificação in-app "relatório pronto"', () => {
  let orgId = '';
  let userId = '';
  let reportId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}org-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [user] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}${RUN}@example.com`, senha_hash: 'h', role: 'client' })
      .returning({ id: users.id });
    userId = user!.id;
    const [rep] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'running',
        periodo_inicio: new Date(Date.now() - 7 * 86_400_000),
        periodo_fim: new Date(),
      })
      .returning({ id: reports.id });
    reportId = rep!.id;
  });

  afterAll(async () => {
    await db.delete(notifications).where(eq(notifications.user_id, userId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(users).where(eq(users.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('finalize marca done E cria notificação com href do relatório', async () => {
    const { finalize } = await import('@/modules/pipeline/steps/finalize');
    await finalize({
      reportId,
      orgId,
      metricas: METRICAS,
      analise: ANALISE,
      plano: 'weekly',
      clientEmail: null, // sem RESEND no ambiente de teste — e-mail é no-op
      iaUsage: null,
    });

    const [rep] = await db
      .select({ status: reports.status })
      .from(reports)
      .where(eq(reports.id, reportId));
    expect(rep!.status).toBe('done');

    const notifs = await db
      .select({ tipo: notifications.tipo, href: notifications.href })
      .from(notifications)
      .where(eq(notifications.user_id, userId));
    const pronta = notifs.find((n) => n.tipo === 'relatorio_pronto');
    expect(pronta).toBeDefined();
    expect(pronta!.href).toBe(`/dashboard/relatorios/${reportId}`);
  });
});
```

- [ ] **Step 5 — rodar e ver falhar**, depois implementar em `src/modules/pipeline/steps/finalize.ts`: adicionar imports:

```ts
import { notify } from '@/modules/notifications/notification.repository';
import { getOrgPrimaryUser } from '@/modules/notifications/recipients';
```

e acrescentar APÓS o bloco de e-mail (`if (clientEmail) { ... }`), ainda dentro de `finalize`:

```ts
  // 4. Notificação in-app "relatório pronto" — best-effort, fora da transação
  // (mesma regra do e-mail: jamais falha uma finalização já comprometida).
  try {
    const user = await getOrgPrimaryUser(orgId);
    if (user) {
      await notify(user.id, {
        tipo: 'relatorio_pronto',
        titulo: 'Seu relatório está pronto',
        corpo: 'A análise do seu período foi concluída. Veja os resultados e as recomendações.',
        href: `/dashboard/relatorios/${reportId}`,
      });
    }
  } catch {
    // notificação nunca quebra a finalização do relatório
  }
```

(Atualizar o JSDoc do step: "3. E-mail... 4. Notificação in-app best-effort".)

- [ ] **Step 6 — rodar:** `npm run test -- tests/unit/callback-feedback.test.ts tests/integration/finalize-notify.test.ts` (PASSA). `npm run test` completo + `npm run typecheck` (orchestrator.test segue verde — finalize só ganhou um passo best-effort).
- [ ] **Step 7 — commit:** `feat(g0): notify in-app relatorio pronto + feedback visivel do callback OAuth em /conexoes`

---

### Task 9: Stepper retomável (reload/cron não perdem o momento-wow)

**Files:**
- Modify: `src/app/(client)/dashboard/generate-report.tsx`
- Modify: `src/app/(client)/dashboard/page.tsx`
- Test: E2E existente `tests/e2e/dashboard.spec.ts` NÃO pode quebrar (verificação no Step 3); sem teste novo — a lógica é composição de componentes client sem parte pura extraível (o polling `useReportStatus` e o `geracaoView` já são testados).

**Interfaces:**
- Consumes: `GenerationProgress({ reportId })` (`generation-progress.tsx` — stepper com polling 3s via `useReportStatus`, chama `router.refresh()` em done/failed — confirmado); `getLatestReport(orgId): Promise<ReportSummary | null>` (`latest.status: 'queued' | 'running' | 'done' | 'failed'`); `GenerateReport({ disabled, motivo })` atual renderiza `GenerationProgress` só quando `state.reportId` existe (`generate-report.tsx:73-75` — o estado do form morre no reload: P0-11).
- Produces:
  - `GenerateReport({ disabled, motivo, emAndamentoReportId }: { disabled?: boolean; motivo?: string; emAndamentoReportId?: string | null })` — o stepper monta com `state.reportId` (fluxo do clique, prioridade) OU `emAndamentoReportId` (retomada vinda do server: reload, geração via cron ou via admin).
  - Dashboard passa `emAndamentoReportId = latest.id` quando `latest.status ∈ {queued, running}`, desabilita o botão e mostra motivo "Um relatório está sendo gerado agora.".
  - Invariantes E2E preservadas: com `latest.status='done'` (cenário do E2E) NADA muda — botão desabilitado sem Bling com o texto exato "Conecte o Bling em Conexões.", testids `generate-report-button`/`generation-progress` intocados.

- [ ] **Step 1 — generate-report.tsx.** Substituir o componente `GenerateReport` (linhas 50-78) por:

```tsx
export function GenerateReport({
  disabled,
  motivo,
  emAndamentoReportId,
}: {
  disabled?: boolean;
  motivo?: string;
  /** Report queued/running vindo do server: retoma o stepper após reload/cron (G0). */
  emAndamentoReportId?: string | null;
}) {
  const [state, action] = useFormState(generateReportAction, initial);
  const isDisabled = !!disabled;

  // Prioridade: geração disparada AGORA pelo form (state) > retomada do server.
  const progressoReportId =
    state.reportId && !state.error ? state.reportId : emAndamentoReportId ?? null;

  return (
    <div>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <SubmitButton disabled={isDisabled} />
        {isDisabled && motivo ? (
          <span className="text-sm text-muted">{motivo}</span>
        ) : null}
      </form>
      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-danger-fg">
          {errorLabel(state.error)}
        </p>
      ) : null}
      {progressoReportId ? (
        <GenerationProgress key={progressoReportId} reportId={progressoReportId} />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2 — dashboard/page.tsx.** Após o cálculo de `gate` (linha 56), inserir:

```ts
  // G0/Task 9: relatório em andamento (inclusive gerado pelo cron/admin) →
  // remonta o stepper do server e trava o botão.
  const emAndamentoReportId =
    latest && (latest.status === 'queued' || latest.status === 'running') ? latest.id : null;
```

trocar `const canGenerate = blingOk && gate.ok;` por `const canGenerate = blingOk && gate.ok && !emAndamentoReportId;`, adicionar como PRIMEIRO caso da cadeia de `motivo` (antes de `if (!org)`):

```ts
    if (emAndamentoReportId) {
      motivo = 'Um relatório está sendo gerado agora.';
    } else if (!org) {
```

(a cadeia atual `if (!org) ... else if (!blingOk) ...` vira `else if`), e trocar a renderização:

```tsx
            <GenerateReport
              disabled={!canGenerate}
              motivo={motivo}
              emAndamentoReportId={emAndamentoReportId}
            />
```

- [ ] **Step 3 — verificação.** `npm run typecheck` + `npm run test` (nenhum teste referencia essas props). Conferir manualmente as invariantes E2E de `tests/e2e/dashboard.spec.ts`: (a) cenário seedado tem `latest.status='done'` → `emAndamentoReportId=null` → botão desabilitado por `!blingOk` com motivo `'Conecte o Bling em Conexões.'` EXATO (linha 97 do spec) — preservado porque o novo caso só dispara com queued/running; (b) `getByTestId('generate-report-button')` e `getByTestId('latest-report')` intocados. Se o ambiente E2E estiver configurado (`DATABASE_URL_TEST` + browsers), rodar `npm run test:e2e -- dashboard.spec.ts`.
- [ ] **Step 4 — commit:** `feat(g0): stepper de geracao retomavel apos reload (queued/running remonta GenerationProgress do server)`

---

### Task 10: Card "Status do sistema" no /admin

**Files:**
- Create: `src/modules/admin/system-status.ts` (puro)
- Create: `src/app/admin/system-status-card.tsx` (server component)
- Modify: `src/app/admin/page.tsx`
- Test: `tests/unit/system-status.test.ts` (novo)

**Interfaces:**
- Consumes: `serverEnv` (`src/lib/env.ts` — campos opcionais `RESEND_API_KEY`, `EMAIL_FROM`, `SERPAPI_KEY`, `CRON_SECRET`, `SENTRY_DSN`); primitivos `Card`/`Badge` (variants `success`/`warn`).
- Produces:
  - `statusDoSistema(env: { RESEND_API_KEY?: string; EMAIL_FROM?: string; SERPAPI_KEY?: string; CRON_SECRET?: string; SENTRY_DSN?: string }): SistemaItem[]` com `SistemaItem = { chave: string; nome: string; ok: boolean; opcional: boolean; detalhe: string }` — SÓ presença/ausência, NUNCA valores.
  - `SystemStatusCard()` — server component puro (sem 'use client', sem props), `data-testid="system-status"`, Badge `success` (ok) / `warn` (ausente) + texto pt-BR de CONSEQUÊNCIA.
  - Renderizado em `/admin` entre o form de busca e a tabela de clientes (aditivo — `admin.spec.ts` usa testids por org, verificado).

- [ ] **Step 1 — teste unit falhando.** Criar `tests/unit/system-status.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { statusDoSistema } from '@/modules/admin/system-status';

describe('statusDoSistema — saúde de configuração (presença/ausência)', () => {
  it('tudo configurado → 4 itens ok', () => {
    const itens = statusDoSistema({
      RESEND_API_KEY: 'k',
      EMAIL_FROM: 'noreply@x.com',
      SERPAPI_KEY: 'k',
      CRON_SECRET: 's',
      SENTRY_DSN: 'https://x.ingest.sentry.io/1',
    });
    expect(itens).toHaveLength(4);
    expect(itens.every((i) => i.ok)).toBe(true);
    // NUNCA vaza valores
    expect(JSON.stringify(itens)).not.toContain('noreply@x.com');
  });

  it('RESEND exige chave E remetente; consequência em pt-BR quando ausente', () => {
    const semFrom = statusDoSistema({ RESEND_API_KEY: 'k' });
    const resend = semFrom.find((i) => i.chave === 'resend')!;
    expect(resend.ok).toBe(false);
    expect(resend.opcional).toBe(false);
    expect(resend.detalhe).toContain('NÃO estão sendo enviados');
  });

  it('SERPAPI e SENTRY são opcionais; CRON_SECRET é crítico', () => {
    const itens = statusDoSistema({});
    expect(itens.find((i) => i.chave === 'serpapi')!.opcional).toBe(true);
    expect(itens.find((i) => i.chave === 'sentry')!.opcional).toBe(true);
    const cron = itens.find((i) => i.chave === 'cron')!;
    expect(cron.ok).toBe(false);
    expect(cron.opcional).toBe(false);
    expect(cron.detalhe).toMatch(/NÃO estão rodando/);
  });
});
```

- [ ] **Step 2 — rodar e ver falhar**, depois criar `src/modules/admin/system-status.ts`:

```ts
/**
 * Saúde de configuração do sistema (puro) — o admin descobre no painel, não
 * pelo cliente reclamando. Recebe SÓ os campos opcionais relevantes do
 * serverEnv e devolve presença/ausência com a CONSEQUÊNCIA em pt-BR.
 * NUNCA expõe valores.
 */
export type SistemaItem = {
  chave: 'resend' | 'serpapi' | 'cron' | 'sentry';
  nome: string;
  ok: boolean;
  opcional: boolean;
  detalhe: string;
};

export function statusDoSistema(env: {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  SERPAPI_KEY?: string;
  CRON_SECRET?: string;
  SENTRY_DSN?: string;
}): SistemaItem[] {
  const resendOk = Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
  const serpapiOk = Boolean(env.SERPAPI_KEY);
  const cronOk = Boolean(env.CRON_SECRET);
  const sentryOk = Boolean(env.SENTRY_DSN);
  return [
    {
      chave: 'resend',
      nome: 'E-mail (Resend)',
      ok: resendOk,
      opcional: false,
      detalhe: resendOk
        ? 'E-mails transacionais ativos (relatório pronto, alertas, reset de senha).'
        : 'E-mails NÃO estão sendo enviados — nem relatório pronto, nem reset de senha (modo no-op).',
    },
    {
      chave: 'serpapi',
      nome: 'Benchmark (SerpAPI)',
      ok: serpapiOk,
      opcional: true,
      detalhe: serpapiOk
        ? 'Benchmark de mercado com Google Shopping + Mercado Livre público.'
        : 'Benchmark de mercado usa apenas o Mercado Livre público (opcional).',
    },
    {
      chave: 'cron',
      nome: 'Crons (CRON_SECRET)',
      ok: cronOk,
      opcional: false,
      detalhe: cronOk
        ? 'Sincronização diária, alertas e geração automática autenticados.'
        : 'Crons diários NÃO estão rodando — sync de pedidos, alertas e geração automática parados.',
    },
    {
      chave: 'sentry',
      nome: 'Monitoramento (Sentry)',
      ok: sentryOk,
      opcional: true,
      detalhe: sentryOk
        ? 'Erros de produção capturados.'
        : 'Erros de produção não estão sendo capturados (opcional).',
    },
  ];
}
```

Rodar de novo (PASSA).

- [ ] **Step 3 — card server-only.** Criar `src/app/admin/system-status-card.tsx`:

```tsx
import { serverEnv } from '@/lib/env';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { statusDoSistema } from '@/modules/admin/system-status';

/**
 * Server component PURO (roda só no servidor — lê serverEnv, nunca expõe
 * valores, só presença/ausência). Badge success/warn + consequência pt-BR.
 */
export function SystemStatusCard() {
  const itens = statusDoSistema(serverEnv);
  return (
    <Card data-testid="system-status">
      <CardHeader>
        <CardTitle as="h2" className="text-base">
          Status do sistema
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2.5">
          {itens.map((item) => (
            <li key={item.chave} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={item.ok ? 'success' : 'warn'}>
                {item.ok ? 'Configurado' : item.opcional ? 'Opcional' : 'Ausente'}
              </Badge>
              <span className="text-white/90">{item.nome}</span>
              <span className="text-muted">— {item.detalhe}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4 — renderizar no /admin.** Em `src/app/admin/page.tsx`: `import { SystemStatusCard } from './system-status-card';` e inserir `<SystemStatusCard />` entre o `</form>` do busca e o `<Card className="!p-0">` da tabela.
- [ ] **Step 5 — rodar:** `npm run test -- tests/unit/system-status.test.ts` (PASSA) + `npm run test` + `npm run typecheck`.
- [ ] **Step 6 — commit:** `feat(g0): card Status do sistema no /admin (RESEND/SERPAPI/CRON/SENTRY — presenca e consequencia)`

---

### Task 11: Verificação final da fase

- [ ] **Step 1:** `npm run test` — suíte completa verde (unit + integração; integração exige `DATABASE_URL_TEST` e migrations 0008/0009 aplicadas via `npm run db:migrate:test`).
- [ ] **Step 2:** `npm run typecheck` e `npm run lint` — zero erros.
- [ ] **Step 3:** Se ambiente E2E disponível, `npm run test:e2e` — os 6 specs passam sem alteração (invariante cardinal da fase).
- [ ] **Step 4 — self-review contra o escopo:** (1) cron de sync criado + `last_sync_at` gravado nos 2 caminhos; (2) frescor/cooldown/digest/índice único; (3) janela BRT em dias fechados nas 3 portas de entrada (action, cron, admin) + formatters; (4) `benchmarkParcial` só com provider ativo falhando + aviso em 3 casos; (5) backoff 2d + pausa após 3 falhas + `ia_usage` persistido e exibido; (6) `stop_reason` + stream 32000 + erros `analise_ia_recusada`/`analise_ia_truncada`; (7) renovação 24h + notify/banner/badge; (8) notify "relatório pronto" + feedback do callback; (9) stepper retomável sem quebrar E2E; (10) card status do sistema sem vazar valores. Conferir que NENHUM arquivo de `tests/setup.ts`, detectores puros de alertas e `plan-lock.ts` foi alterado.
- [ ] **Step 5 — revisão ampla:** usar superpowers:requesting-code-review sobre o diff completo do branch antes do merge `--no-ff`.

## Operacional (dono — fora do código, ANTES do deploy em produção)

1. Aplicar migrations **0008 e 0009** no Neon MAIN (`npm run db:migrate` com `.env.local` apontando p/ produção, ou via console) — ambas aditivas; a 0008 resolve duplicatas abertas antes de criar o índice.
2. Conferir `CRON_SECRET` na Vercel (o cron novo `sincronizar-pedidos` usa o mesmo secret; o `vercel.json` novo registra o agendamento no deploy).
3. `RESEND_API_KEY` + `EMAIL_FROM` continuam opcionais (no-op sem elas) — o card "Status do sistema" agora mostra a consequência no /admin.
4. Pós-deploy: disparar `GET /api/cron/sincronizar-pedidos` manualmente com o Bearer p/ validar o primeiro sync e conferir `connections.last_sync_at` no admin (`/admin/[orgId]` → aba Conexão).
