# Desempenho Anual (staff) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página staff `analista/[orgId]/desempenho` com 12 meses de histórico (os 4 gráficos do Bling + camada Truth), backfill Bling disparável, contexto anual no prompt da IA e seção staff no relatório.

**Architecture:** `orders` é a fonte única (sem migration, sem tabela nova). Um repository novo busca 12 meses de pedidos via `orderScope` e funções puras agregam em JS (precedente: `stock.repository.ts`). Backfill = `collectOrders` com período de 12 meses + fila de enriquecimento existente. Spec: `docs/superpowers/specs/2026-08-05-desempenho-anual-staff-design.md`.

**Tech Stack:** Next.js 14 App Router, Drizzle + postgres-js, Recharts (wrappers prontos em `src/components/ui/charts/`), vitest, Playwright.

## Global Constraints

- Copy SEMPRE em pt-BR. Mensagens de commit SEM acento.
- Toda leitura de `orders` via `orderScope(source)` — NUNCA replicar predicados na mão (perde o filtro Olist `provider_status != '2'`).
- Sem migration: nenhuma tabela/coluna nova. `orders` já está no `purgeOrg`.
- Página e seção do relatório são SÓ STAFF (`requireAnalista` + `assertOrgAccess`, gate ANTES de qualquer busca; fora da carteira = `notFound()`).
- Testes de integração: `describe.skipIf(!process.env.DATABASE_URL_TEST)`, orgs com prefixo `ta-test-<suite>-${RUN}`, limpeza em `finally`/`afterAll` por `org_id`, rodar com `$env:DATABASE_URL_TEST=$env:DATABASE_URL_TEST_DIRECT` (endpoint DIRETO do Neon).
- Datas: o relógio da máquina tem RTC +3h — testes sempre passam `agora` explícito, nunca dependem do relógio.
- Mês comercial no fuso `America/Sao_Paulo` (sem DST desde 2019; offset fixo `-03:00`).
- TDD: teste falhando antes da implementação, em toda task.
- Modelos de subagente: tasks marcadas **[OPUS]** (difíceis) ou **[SONNET]** (fáceis) — decisão do dono.

---

### Task 1: Agregação mensal pura [OPUS]

**Files:**
- Create: `src/modules/desempenho/desempenho-anual.ts`
- Test: `tests/unit/desempenho-anual.test.ts`

**Interfaces:**
- Consumes: `RawOrderItem` de `@/modules/providers/types` (`{ sku?: string; nome: string; quantidade: number; valor: number }`).
- Produces (Tasks 2, 4, 5, 6 dependem destes nomes/tipos exatos):

```ts
export type PedidoRow = {
  data: Date;
  valor_total: string;   // numeric do PG chega como string
  frete: string;
  comissao: string;
  canal: string;
  itens: RawOrderItem[];
};
export type MesDesempenho = {
  mes: string;           // 'YYYY-MM' em America/Sao_Paulo
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  unidades: number;
  frete: number;
  comissao: number;
  receitaLiquida: number; // faturamento - comissao - frete
};
export function chaveMes(d: Date): string;
export function mesesJanela(agora: Date, meses: number): string[];       // cronológica, inclui mês corrente
export function inicioJanela(agora: Date, meses: number): Date;          // 1º instante do mês mais antigo (SP)
export function agruparPorMes(rows: PedidoRow[], agora: Date, meses: number): MesDesempenho[]; // zero-filled
export function porCanalMensal(rows: PedidoRow[], agora: Date, meses: number): { mes: string; canais: Record<string, number> }[];
export function topSkus(rows: PedidoRow[], limite: number): { sku: string; nome: string; quantidade: number; receita: number }[]; // ordena por quantidade desc
export function filtrarUltimosMeses(rows: PedidoRow[], agora: Date, meses: number): PedidoRow[];
```

- [ ] **Step 1: Escrever testes falhando**

```ts
// tests/unit/desempenho-anual.test.ts
import { describe, expect, it } from 'vitest';

import {
  agruparPorMes, chaveMes, filtrarUltimosMeses, inicioJanela,
  mesesJanela, porCanalMensal, topSkus, type PedidoRow,
} from '@/modules/desempenho/desempenho-anual';

const AGORA = new Date('2026-08-05T15:00:00Z');
const row = (over: Partial<PedidoRow>): PedidoRow => ({
  data: new Date('2026-08-01T12:00:00Z'), valor_total: '100.00', frete: '10.00',
  comissao: '15.00', canal: 'shopee', itens: [], ...over,
});

describe('desempenho-anual (puro)', () => {
  it('chaveMes usa fuso de Sao Paulo', () => {
    // 01:00 UTC do dia 1º = 22:00 SP do dia anterior → mês anterior
    expect(chaveMes(new Date('2026-08-01T01:00:00Z'))).toBe('2026-07');
    expect(chaveMes(new Date('2026-08-01T12:00:00Z'))).toBe('2026-08');
  });

  it('mesesJanela devolve 12 chaves cronológicas terminando no mês corrente', () => {
    const meses = mesesJanela(AGORA, 12);
    expect(meses).toHaveLength(12);
    expect(meses[0]).toBe('2025-09');
    expect(meses[11]).toBe('2026-08');
  });

  it('inicioJanela é o 1º instante SP do mês mais antigo', () => {
    expect(inicioJanela(AGORA, 12).toISOString()).toBe('2025-09-01T03:00:00.000Z');
  });

  it('agruparPorMes zera meses sem venda e calcula receita líquida', () => {
    const rows = [
      row({ data: new Date('2026-08-02T12:00:00Z'), valor_total: '100.00', frete: '10.00', comissao: '15.00' }),
      row({ data: new Date('2026-08-03T12:00:00Z'), valor_total: '50.00', frete: '0.00', comissao: '5.00' }),
      row({ data: new Date('2025-10-10T12:00:00Z'), valor_total: '200.00', frete: '20.00', comissao: '30.00' }),
    ];
    const meses = agruparPorMes(rows, AGORA, 12);
    expect(meses).toHaveLength(12);
    const ago = meses.find((m) => m.mes === '2026-08')!;
    expect(ago).toMatchObject({ faturamento: 150, pedidos: 2, ticketMedio: 75, frete: 10, comissao: 20, receitaLiquida: 120 });
    expect(meses.find((m) => m.mes === '2025-11')).toMatchObject({ faturamento: 0, pedidos: 0, ticketMedio: 0 });
  });

  it('agruparPorMes soma unidades dos itens', () => {
    const rows = [row({ itens: [{ sku: 'A', nome: 'A', quantidade: 2, valor: 10 }, { sku: 'B', nome: 'B', quantidade: 3, valor: 5 }] })];
    expect(agruparPorMes(rows, AGORA, 12).find((m) => m.mes === '2026-08')!.unidades).toBe(5);
  });

  it('porCanalMensal empilha faturamento por canal', () => {
    const rows = [
      row({ canal: 'shopee', valor_total: '100.00' }),
      row({ canal: 'mercado livre', valor_total: '40.00' }),
    ];
    const meses = porCanalMensal(rows, AGORA, 12);
    expect(meses).toHaveLength(12);
    expect(meses[11]).toEqual({ mes: '2026-08', canais: { shopee: 100, 'mercado livre': 40 } });
  });

  it('topSkus agrega por sku, ordena por quantidade e respeita o limite', () => {
    const rows = [
      row({ itens: [{ sku: 'A', nome: 'Produto A', quantidade: 1, valor: 10 }] }),
      row({ itens: [{ sku: 'B', nome: 'Produto B', quantidade: 5, valor: 2 }, { sku: 'A', nome: 'Produto A', quantidade: 2, valor: 10 }] }),
    ];
    const top = topSkus(rows, 1);
    expect(top).toEqual([{ sku: 'B', nome: 'Produto B', quantidade: 5, receita: 10 }]);
  });

  it('topSkus usa nome como fallback quando sku falta', () => {
    const rows = [row({ itens: [{ nome: 'Sem SKU', quantidade: 1, valor: 7 }] })];
    expect(topSkus(rows, 10)[0]).toMatchObject({ sku: 'Sem SKU', nome: 'Sem SKU', receita: 7 });
  });

  it('filtrarUltimosMeses corta pelo início da janela', () => {
    const dentro = row({ data: new Date('2026-06-15T12:00:00Z') });
    const fora = row({ data: new Date('2026-04-30T12:00:00Z') });
    expect(filtrarUltimosMeses([dentro, fora], AGORA, 3)).toEqual([dentro]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- tests/unit/desempenho-anual.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// src/modules/desempenho/desempenho-anual.ts
import type { RawOrderItem } from '@/modules/providers/types';

export type PedidoRow = {
  data: Date;
  valor_total: string;
  frete: string;
  comissao: string;
  canal: string;
  itens: RawOrderItem[];
};

export type MesDesempenho = {
  mes: string;
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  unidades: number;
  frete: number;
  comissao: number;
  receitaLiquida: number;
};

const FMT_MES = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });

/** Chave 'YYYY-MM' do mês comercial (America/Sao_Paulo). */
export function chaveMes(d: Date): string {
  return FMT_MES.format(d);
}

export function mesesJanela(agora: Date, meses: number): string[] {
  const [anoStr, mesStr] = chaveMes(agora).split('-');
  let ano = Number(anoStr);
  let mes = Number(mesStr);
  const out: string[] = [];
  for (let i = 0; i < meses; i++) {
    out.unshift(`${ano}-${String(mes).padStart(2, '0')}`);
    mes--;
    if (mes === 0) { mes = 12; ano--; }
  }
  return out;
}

/** SP não tem DST desde 2019 — offset fixo -03:00. */
export function inicioJanela(agora: Date, meses: number): Date {
  return new Date(`${mesesJanela(agora, meses)[0]}-01T00:00:00-03:00`);
}

const num = (v: string): number => Number(v) || 0;
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function agruparPorMes(rows: PedidoRow[], agora: Date, meses: number): MesDesempenho[] {
  const buckets = new Map<string, { faturamento: number; pedidos: number; unidades: number; frete: number; comissao: number }>();
  for (const chave of mesesJanela(agora, meses)) {
    buckets.set(chave, { faturamento: 0, pedidos: 0, unidades: 0, frete: 0, comissao: 0 });
  }
  for (const r of rows) {
    const b = buckets.get(chaveMes(r.data));
    if (!b) continue;
    b.faturamento += num(r.valor_total);
    b.pedidos += 1;
    b.frete += num(r.frete);
    b.comissao += num(r.comissao);
    for (const item of r.itens) b.unidades += item.quantidade;
  }
  return [...buckets.entries()].map(([mes, b]) => ({
    mes,
    faturamento: round2(b.faturamento),
    pedidos: b.pedidos,
    ticketMedio: b.pedidos > 0 ? round2(b.faturamento / b.pedidos) : 0,
    unidades: b.unidades,
    frete: round2(b.frete),
    comissao: round2(b.comissao),
    receitaLiquida: round2(b.faturamento - b.comissao - b.frete),
  }));
}

export function porCanalMensal(rows: PedidoRow[], agora: Date, meses: number): { mes: string; canais: Record<string, number> }[] {
  const buckets = new Map<string, Record<string, number>>();
  for (const chave of mesesJanela(agora, meses)) buckets.set(chave, {});
  for (const r of rows) {
    const b = buckets.get(chaveMes(r.data));
    if (!b) continue;
    b[r.canal] = round2((b[r.canal] ?? 0) + num(r.valor_total));
  }
  return [...buckets.entries()].map(([mes, canais]) => ({ mes, canais }));
}

export function topSkus(rows: PedidoRow[], limite: number): { sku: string; nome: string; quantidade: number; receita: number }[] {
  const porSku = new Map<string, { nome: string; quantidade: number; receita: number }>();
  for (const r of rows) {
    for (const item of r.itens) {
      const chave = item.sku?.trim() || item.nome;
      const atual = porSku.get(chave) ?? { nome: item.nome, quantidade: 0, receita: 0 };
      atual.quantidade += item.quantidade;
      atual.receita = round2(atual.receita + item.quantidade * item.valor);
      porSku.set(chave, atual);
    }
  }
  return [...porSku.entries()]
    .map(([sku, v]) => ({ sku, ...v }))
    .sort((a, b) => b.quantidade - a.quantidade || b.receita - a.receita)
    .slice(0, limite);
}

export function filtrarUltimosMeses(rows: PedidoRow[], agora: Date, meses: number): PedidoRow[] {
  const inicio = inicioJanela(agora, meses);
  return rows.filter((r) => r.data >= inicio);
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- tests/unit/desempenho-anual.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```powershell
git add src/modules/desempenho/desempenho-anual.ts tests/unit/desempenho-anual.test.ts
git commit -m "feat(desempenho): agregacao mensal pura de 12 meses"
```

---

### Task 2: Repository de leitura (orders → PedidoRow) [OPUS]

**Files:**
- Create: `src/modules/desempenho/desempenho-anual.repository.ts`
- Test: `tests/integration/desempenho-anual.test.ts`

**Interfaces:**
- Consumes: Task 1 (`PedidoRow`, `inicioJanela`); `orderScope` de `@/modules/orders/order-scope`; `ErpDataSource` de `@/modules/providers/data.types`.
- Produces (Tasks 3, 4, 5, 6 dependem):

```ts
export function getPedidos12Meses(source: ErpDataSource, agora: Date): Promise<PedidoRow[]>;
export type CoberturaHistorico = { desde: Date | null; pendentesEnriquecimento: number };
export function getCoberturaHistorico(source: ErpDataSource): Promise<CoberturaHistorico>;
```

- [ ] **Step 1: Teste de integração falhando**

```ts
// tests/integration/desempenho-anual.test.ts
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { orders, organizations } from '@/db/schema';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);
const RUN = Date.now();
const AGORA = new Date('2026-08-05T15:00:00Z');
const sourceFor = (orgId: string) => ({ orgId, provider: 'bling' as const, sourceGeneration: 1 });

describe.skipIf(!url)('desempenho-anual repository (integração)', () => {
  afterAll(async () => {
    await sql.end();
  });

  it('getPedidos12Meses respeita a janela, o escopo e devolve colunas usadas pela agregação', async () => {
    let orgId = '';
    try {
      const [o] = await tdb.insert(organizations).values({ name: `ta-test-desempenho-${RUN}`, status: 'active' }).returning({ id: organizations.id });
      orgId = o.id;
      await tdb.insert(orders).values([
        // dentro da janela de 12 meses
        { org_id: orgId, bling_order_id: `ta-test-desempenho-${RUN}-1`, provider: 'bling', provider_order_id: `ta-test-desempenho-${RUN}-1`, canal: 'shopee', data: new Date('2026-07-10T12:00:00Z'), valor_total: '100.00', frete: '10.00', comissao: '15.00', itens: [{ sku: 'A', nome: 'Produto A', quantidade: 2, valor: 50 }], enriquecido_em: new Date('2026-07-10T13:00:00Z') },
        // fora da janela (13 meses atrás)
        { org_id: orgId, bling_order_id: `ta-test-desempenho-${RUN}-2`, provider: 'bling', provider_order_id: `ta-test-desempenho-${RUN}-2`, canal: 'shopee', data: new Date('2025-07-10T12:00:00Z'), valor_total: '999.00', itens: [] },
        // outro provider (fora do escopo do ERP ativo bling)
        { org_id: orgId, bling_order_id: null, provider: 'olist', provider_order_id: `ta-test-desempenho-${RUN}-3`, canal: 'olist', data: new Date('2026-07-10T12:00:00Z'), valor_total: '500.00', itens: [] },
      ]);
      const { getPedidos12Meses } = await import('@/modules/desempenho/desempenho-anual.repository');
      const rows = await getPedidos12Meses(sourceFor(orgId), AGORA);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ valor_total: '100.00', frete: '10.00', comissao: '15.00', canal: 'shopee' });
      expect(rows[0].itens).toEqual([{ sku: 'A', nome: 'Produto A', quantidade: 2, valor: 50 }]);
    } finally {
      if (orgId) {
        await tdb.delete(orders).where(eq(orders.org_id, orgId));
        await tdb.delete(organizations).where(eq(organizations.id, orgId));
      }
    }
  });

  it('getCoberturaHistorico devolve inicio do historico e pendentes de enriquecimento', async () => {
    let orgId = '';
    try {
      const [o] = await tdb.insert(organizations).values({ name: `ta-test-desempenho-cob-${RUN}`, status: 'active' }).returning({ id: organizations.id });
      orgId = o.id;
      await tdb.insert(orders).values([
        { org_id: orgId, bling_order_id: `ta-test-desempenho-cob-${RUN}-1`, provider: 'bling', provider_order_id: `ta-test-desempenho-cob-${RUN}-1`, canal: 'shopee', data: new Date('2025-12-01T12:00:00Z'), valor_total: '10.00', itens: [], enriquecido_em: new Date() },
        { org_id: orgId, bling_order_id: `ta-test-desempenho-cob-${RUN}-2`, provider: 'bling', provider_order_id: `ta-test-desempenho-cob-${RUN}-2`, canal: 'shopee', data: new Date('2026-01-01T12:00:00Z'), valor_total: '20.00', itens: [] }, // enriquecido_em NULL
      ]);
      const { getCoberturaHistorico } = await import('@/modules/desempenho/desempenho-anual.repository');
      const cobertura = await getCoberturaHistorico(sourceFor(orgId));
      expect(cobertura.desde?.toISOString()).toBe('2025-12-01T12:00:00.000Z');
      expect(cobertura.pendentesEnriquecimento).toBe(1);
    } finally {
      if (orgId) {
        await tdb.delete(orders).where(eq(orders.org_id, orgId));
        await tdb.delete(organizations).where(eq(organizations.id, orgId));
      }
    }
  });

  it('org sem pedidos: lista vazia e cobertura nula', async () => {
    let orgId = '';
    try {
      const [o] = await tdb.insert(organizations).values({ name: `ta-test-desempenho-vazio-${RUN}`, status: 'active' }).returning({ id: organizations.id });
      orgId = o.id;
      const repo = await import('@/modules/desempenho/desempenho-anual.repository');
      expect(await repo.getPedidos12Meses(sourceFor(orgId), AGORA)).toEqual([]);
      expect(await repo.getCoberturaHistorico(sourceFor(orgId))).toEqual({ desde: null, pendentesEnriquecimento: 0 });
    } finally {
      if (orgId) await tdb.delete(organizations).where(eq(organizations.id, orgId));
    }
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (PowerShell): `$env:DATABASE_URL_TEST=$env:DATABASE_URL_TEST_DIRECT; npm test -- tests/integration/desempenho-anual.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

```ts
// src/modules/desempenho/desempenho-anual.repository.ts
import { and, asc, gte, isNull, sql } from 'drizzle-orm';

import { db } from '@/db/client';
import { orders } from '@/db/schema';
import { inicioJanela, type PedidoRow } from '@/modules/desempenho/desempenho-anual';
import { orderScope } from '@/modules/orders/order-scope';
import type { ErpDataSource } from '@/modules/providers/data.types';
import type { RawOrderItem } from '@/modules/providers/types';

const MESES_JANELA = 12;

/** Pedidos dos últimos 12 meses do ERP ativo — colunas mínimas para a agregação pura. */
export async function getPedidos12Meses(source: ErpDataSource, agora: Date): Promise<PedidoRow[]> {
  const rows = await db
    .select({ data: orders.data, valor_total: orders.valor_total, frete: orders.frete, comissao: orders.comissao, canal: orders.canal, itens: orders.itens })
    .from(orders)
    .where(and(orderScope(source), gte(orders.data, inicioJanela(agora, MESES_JANELA))))
    .orderBy(asc(orders.data));
  return rows.map((r) => ({
    data: r.data,
    valor_total: r.valor_total,
    frete: r.frete ?? '0',
    comissao: r.comissao ?? '0',
    canal: r.canal,
    itens: (r.itens ?? []) as RawOrderItem[],
  }));
}

export type CoberturaHistorico = { desde: Date | null; pendentesEnriquecimento: number };

/** Desde quando há histórico e quantos pedidos ainda aguardam enriquecimento (frete/comissão zerados). */
export async function getCoberturaHistorico(source: ErpDataSource): Promise<CoberturaHistorico> {
  const [minRow] = await db
    .select({ desde: sql<Date | null>`min(${orders.data})` })
    .from(orders)
    .where(orderScope(source));
  const [pendRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orders)
    .where(and(orderScope(source), isNull(orders.enriquecido_em)));
  return {
    desde: minRow?.desde ? new Date(minRow.desde) : null,
    pendentesEnriquecimento: pendRow?.n ?? 0,
  };
}
```

Nota: os campos exatos de `orders` estão em `src/db/schema/orders.ts` (`valor_total`/`frete`/`comissao` são `numeric` → string; `frete`/`comissao` têm default `'0'` mas o mapeamento defensivo cobre linhas antigas).

- [ ] **Step 4: Rodar e ver passar**

Run (PowerShell): `$env:DATABASE_URL_TEST=$env:DATABASE_URL_TEST_DIRECT; npm test -- tests/integration/desempenho-anual.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```powershell
git add src/modules/desempenho/desempenho-anual.repository.ts tests/integration/desempenho-anual.test.ts
git commit -m "feat(desempenho): repository de pedidos 12 meses e cobertura"
```

---

### Task 3: Server action de backfill (só Bling) [SONNET]

**Files:**
- Modify: `src/actions/staff.actions.ts` (adicionar action no fim do arquivo)
- Test: `tests/unit/staff-backfill-action.test.ts`

**Interfaces:**
- Consumes: `autorizarStaff(orgId)` (função privada já existente em `staff.actions.ts` — reusar), `getActiveErpConnection` de `@/modules/connections/active-provider.repository`, `collectOrders` de `@/modules/pipeline/steps/collect-orders`, `enrichOrders` + `ENRIQUECIMENTO_SYNC_BLING` de `@/modules/pipeline/steps/enrich-orders` e `@/modules/pipeline/sync-pedidos`, `inicioJanela` da Task 1, `recordAudit` (já importado no arquivo).
- Produces (Task 4 depende):

```ts
export type StaffBackfillState = { error?: string; ok?: boolean; processados?: number; pendentesEnriquecimento?: number };
export function staffBackfillHistoricoAction(_prev: StaffBackfillState, formData: FormData): Promise<StaffBackfillState>;
```

- [ ] **Step 1: Teste unitário falhando (mocks dos módulos de borda)**

```ts
// tests/unit/staff-backfill-action.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const autorizado = { id: 'user-1', orgId: 'org-interna', role: 'analista', orgStatus: 'active', plano: null };
const requireAnalista = vi.fn(async () => autorizado);
const assertOrgAccess = vi.fn(async () => undefined);
const getActiveErpConnection = vi.fn();
const collectOrders = vi.fn(async () => ({ processados: 42, total: 42 }));
const enrichOrders = vi.fn(async () => ({ enriquecidos: 10, falhas: 0, restantes: 32, incompleto: true, quarentenados: 0 }));
const recordAudit = vi.fn(async () => undefined);

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/modules/auth/require-analista', () => ({ requireAnalista }));
vi.mock('@/modules/analista/analista.repository', () => ({ assertOrgAccess }));
vi.mock('@/modules/connections/active-provider.repository', () => ({ getActiveErpConnection }));
vi.mock('@/modules/pipeline/steps/collect-orders', () => ({ collectOrders }));
vi.mock('@/modules/pipeline/steps/enrich-orders', () => ({ enrichOrders }));
vi.mock('@/modules/audit/audit.repository', () => ({ recordAudit }));

// ATENÇÃO ao implementer: confira os caminhos reais dos mocks acima contra os
// imports de src/actions/staff.actions.ts antes de rodar — se recordAudit ou
// assertOrgAccess vierem de outro módulo, ajuste o vi.mock para o caminho real.

const form = (orgId: string) => {
  const fd = new FormData();
  fd.set('orgId', orgId);
  return fd;
};

describe('staffBackfillHistoricoAction', () => {
  beforeEach(() => vi.clearAllMocks());

  it('coleta 12 meses, roda um lote de enriquecimento e devolve pendencias', async () => {
    getActiveErpConnection.mockResolvedValue({ orgId: 'org-a', provider: 'bling', sourceGeneration: 1 });
    const { staffBackfillHistoricoAction } = await import('@/actions/staff.actions');
    const result = await staffBackfillHistoricoAction({}, form('org-a'));
    expect(result).toMatchObject({ ok: true, processados: 42, pendentesEnriquecimento: 32 });
    const [, periodo] = collectOrders.mock.calls[0];
    expect(periodo.inicio.toISOString()).toMatch(/-01T03:00:00\.000Z$/); // 1º do mês SP
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ acao: 'desempenho.backfill_disparado' }));
  });

  it('recusa org sem ERP ativo', async () => {
    getActiveErpConnection.mockResolvedValue(null);
    const { staffBackfillHistoricoAction } = await import('@/actions/staff.actions');
    expect(await staffBackfillHistoricoAction({}, form('org-a'))).toEqual({ error: 'Nenhum ERP ativo para este cliente.' });
  });

  it('recusa ERP ativo que nao seja Bling', async () => {
    getActiveErpConnection.mockResolvedValue({ orgId: 'org-a', provider: 'olist', sourceGeneration: 1 });
    const { staffBackfillHistoricoAction } = await import('@/actions/staff.actions');
    expect(await staffBackfillHistoricoAction({}, form('org-a'))).toEqual({ error: 'Backfill de historico disponivel apenas para Bling.' });
  });

  it('acesso negado fora da carteira', async () => {
    assertOrgAccess.mockRejectedValueOnce(new Error('acesso_negado'));
    const { staffBackfillHistoricoAction } = await import('@/actions/staff.actions');
    expect(await staffBackfillHistoricoAction({}, form('org-x'))).toEqual({ error: 'Acesso negado.' });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- tests/unit/staff-backfill-action.test.ts`
Expected: FAIL (`staffBackfillHistoricoAction` não exportada).

- [ ] **Step 3: Implementar a action (padrão idêntico a `staffGenerateReportAction`)**

```ts
// Adições em src/actions/staff.actions.ts (imports novos no topo, action no fim)
import { collectOrders } from '@/modules/pipeline/steps/collect-orders';
import { enrichOrders } from '@/modules/pipeline/steps/enrich-orders';
import { inicioJanela } from '@/modules/desempenho/desempenho-anual';

export type StaffBackfillState = { error?: string; ok?: boolean; processados?: number; pendentesEnriquecimento?: number };

const BACKFILL_MESES = 12;
const BACKFILL_COLETA_DEADLINE_MS = 120_000;
const BACKFILL_ENRIQUECIMENTO = { maxPedidos: 200, prazoMs: 90_000 } as const;

/**
 * Backfill staff de 12 meses (SÓ Bling): coleta paginada idempotente + um lote
 * de enriquecimento inline. O restante da fila drena pelo cron sincronizar-pedidos.
 */
export async function staffBackfillHistoricoAction(
  _prev: StaffBackfillState,
  formData: FormData,
): Promise<StaffBackfillState> {
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };
  const access = await autorizarStaff(orgId);
  if (!access) return { error: 'Acesso negado.' };

  const source = await getActiveErpConnection(orgId);
  if (!source) return { error: 'Nenhum ERP ativo para este cliente.' };
  if (source.provider !== 'bling') return { error: 'Backfill de historico disponivel apenas para Bling.' };

  const agora = new Date();
  const periodo = { inicio: inicioJanela(agora, BACKFILL_MESES), fim: agora };
  const coleta = await collectOrders(source, periodo, { deadlineMs: BACKFILL_COLETA_DEADLINE_MS });
  const enriquecimento = await enrichOrders(source, BACKFILL_ENRIQUECIMENTO);

  await recordAudit({
    orgId,
    userId: access.id,
    acao: 'desempenho.backfill_disparado',
    detalhes: {
      processados: coleta.processados,
      total: coleta.total,
      enriquecidos: enriquecimento.enriquecidos,
      pendentes: enriquecimento.restantes,
      periodoInicio: periodo.inicio.toISOString(),
    },
  });
  revalidatePath(`/analista/${orgId}/desempenho`);
  return { ok: true, processados: coleta.processados, pendentesEnriquecimento: Math.max(0, enriquecimento.restantes) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- tests/unit/staff-backfill-action.test.ts`
Expected: PASS (4 testes). Rodar também `npm run typecheck`.

- [ ] **Step 5: Commit**

```powershell
git add src/actions/staff.actions.ts tests/unit/staff-backfill-action.test.ts
git commit -m "feat(desempenho): action staff de backfill de 12 meses"
```

---

### Task 4: Página `analista/[orgId]/desempenho` [SONNET]

**Files:**
- Create: `src/app/analista/[orgId]/desempenho/page.tsx`
- Create: `src/app/analista/[orgId]/desempenho/graficos-desempenho.tsx`
- Create: `src/app/analista/[orgId]/desempenho/backfill-historico.tsx`
- Modify: `src/app/analista/[orgId]/page.tsx` (link para a página nova, perto do link "Abrir relatório completo")

**Interfaces:**
- Consumes: Tasks 1–3 (`getPedidos12Meses`, `getCoberturaHistorico`, `agruparPorMes`, `porCanalMensal`, `topSkus`, `filtrarUltimosMeses`, `staffBackfillHistoricoAction`, `StaffBackfillState`); gate `requireAnalista` + `assertOrgAccess` (padrão exato de `analista/[orgId]/page.tsx:58-84`); wrappers `BarChart` (`{ data: {label,value}[], height?, formatValue? }`), `LineChart` (`{ data: {x,y}[], height?, formatY? }`), `StackedAreaChart` (`{ keys, rows (com chave x), height?, formatY?, srSummary, colors? }`); `coresDosCanais` de `@/lib/canal-visual`.
- Produces: rota staff `/analista/[orgId]/desempenho` com testids `desempenho-anual-page`, `desempenho-grafico-faturamento`, `desempenho-grafico-pedidos`, `desempenho-grafico-ticket`, `desempenho-top-skus`, `desempenho-grafico-canais`, `desempenho-grafico-liquida`, `desempenho-cobertura`, `desempenho-backfill`.

- [ ] **Step 1: Página server (gate → dados → render)**

```tsx
// src/app/analista/[orgId]/desempenho/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card } from '@/components/ui/Card';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import { agruparPorMes, filtrarUltimosMeses, porCanalMensal, topSkus } from '@/modules/desempenho/desempenho-anual';
import { getCoberturaHistorico, getPedidos12Meses } from '@/modules/desempenho/desempenho-anual.repository';
import { getOrgById } from '@/modules/organizations/organization.repository';
import { BackfillHistorico } from './backfill-historico';
import { GraficosDesempenho, TopSkusLista } from './graficos-desempenho';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // backfill (server action desta rota) coleta + enriquece um lote

const SELECOES_SKUS = [3, 6, 12] as const;

export default async function DesempenhoAnualPage(props: {
  params: Promise<{ orgId: string }>;
  searchParams?: Promise<{ skus?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const access = await requireAnalista();
  try {
    await assertOrgAccess(access, params.orgId);
  } catch (e) {
    if (e instanceof Error && e.message === 'acesso_negado') notFound();
    throw e;
  }
  const orgId = params.orgId;
  const org = await getOrgById(orgId);
  if (!org) notFound();

  const mesesSkus = SELECOES_SKUS.find((m) => String(m) === searchParams?.skus) ?? 12;
  const source = await getActiveErpConnection(orgId);
  const agora = new Date();
  const rows = source ? await getPedidos12Meses(source, agora) : [];
  const cobertura = source ? await getCoberturaHistorico(source) : { desde: null, pendentesEnriquecimento: 0 };
  const meses = agruparPorMes(rows, agora, 12);
  const canais = porCanalMensal(rows, agora, 12);
  const skus = topSkus(filtrarUltimosMeses(rows, agora, mesesSkus), 10);

  return (
    <div className="space-y-6" data-testid="desempenho-anual-page">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/analista/${orgId}`} className="text-sm text-muted transition-colors hover:text-ink">← Voltar para o cliente</Link>
          <h1 className="text-2xl font-semibold text-ink">Desempenho anual — {org.name}</h1>
          <p className="text-sm text-muted" data-testid="desempenho-cobertura">
            {cobertura.desde
              ? `Histórico desde ${cobertura.desde.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })}`
              : 'Sem histórico coletado ainda'}
            {cobertura.pendentesEnriquecimento > 0
              ? ` · ${cobertura.pendentesEnriquecimento} pedidos aguardando enriquecimento (comissão/frete podem estar zerados)`
              : ''}
          </p>
        </div>
        {source?.provider === 'bling' ? <BackfillHistorico orgId={orgId} /> : null}
      </div>
      {!source ? (
        <Card><p className="text-sm text-muted">Nenhum ERP ativo para este cliente.</p></Card>
      ) : (
        <>
          <GraficosDesempenho meses={meses} canais={canais} />
          <TopSkusLista skus={skus} mesesSelecionados={mesesSkus} orgId={orgId} />
        </>
      )}
    </div>
  );
}
```

Nota ao implementer: confira o nome/caminho real de `getOrgById` em `src/modules/organizations/` (ou o helper que `analista/[orgId]/page.tsx` usa para obter o nome da org) e use o existente — NÃO crie um novo.

- [ ] **Step 2: Gráficos client**

```tsx
// src/app/analista/[orgId]/desempenho/graficos-desempenho.tsx
'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { BarChart } from '@/components/ui/charts/BarChart';
import { LineChart } from '@/components/ui/charts/LineChart';
import { StackedAreaChart } from '@/components/ui/charts/StackedAreaChart';
import { coresDosCanais } from '@/lib/canal-visual';
import type { MesDesempenho } from '@/modules/desempenho/desempenho-anual';

const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const labelMes = (mes: string) => {
  const [ano, m] = mes.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[Number(m) - 1]}/${ano.slice(2)}`;
};

export function GraficosDesempenho({ meses, canais }: {
  meses: MesDesempenho[];
  canais: { mes: string; canais: Record<string, number> }[];
}) {
  const keys = [...new Set(canais.flatMap((c) => Object.keys(c.canais)))];
  const rowsCanais = canais.map((c) => ({ x: labelMes(c.mes), ...c.canais }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card data-testid="desempenho-grafico-faturamento">
        <h2 className="text-sm font-medium text-ink">Valor faturado por mês</h2>
        <BarChart data={meses.map((m) => ({ label: labelMes(m.mes), value: m.faturamento }))} formatValue={formatBRL} />
      </Card>
      <Card data-testid="desempenho-grafico-pedidos">
        <h2 className="text-sm font-medium text-ink">Pedidos por mês</h2>
        <BarChart data={meses.map((m) => ({ label: labelMes(m.mes), value: m.pedidos }))} />
      </Card>
      <Card data-testid="desempenho-grafico-ticket">
        <h2 className="text-sm font-medium text-ink">Ticket médio por mês</h2>
        <LineChart data={meses.map((m) => ({ x: labelMes(m.mes), y: m.ticketMedio }))} formatY={formatBRL} srSummary="Evolução mensal do ticket médio nos últimos 12 meses." />
      </Card>
      <Card data-testid="desempenho-grafico-canais">
        <h2 className="text-sm font-medium text-ink">Faturamento por canal</h2>
        {keys.length > 0 ? (
          <StackedAreaChart keys={keys} rows={rowsCanais} colors={coresDosCanais(keys)} formatY={formatBRL} srSummary={`Faturamento mensal empilhado por canal. Canais: ${keys.join(', ')}.`} />
        ) : <p className="text-sm text-muted">Sem vendas na janela.</p>}
      </Card>
      <Card data-testid="desempenho-grafico-liquida">
        <h2 className="text-sm font-medium text-ink">Receita líquida por mês</h2>
        <p className="text-xs text-muted">Faturamento − comissão − frete (o Bling não mostra isso).</p>
        <BarChart data={meses.map((m) => ({ label: labelMes(m.mes), value: m.receitaLiquida }))} formatValue={formatBRL} />
      </Card>
      <Card data-testid="desempenho-grafico-custos">
        <h2 className="text-sm font-medium text-ink">Comissão e frete por mês</h2>
        <StackedAreaChart
          keys={['Comissão', 'Frete']}
          rows={meses.map((m) => ({ x: labelMes(m.mes), 'Comissão': m.comissao, Frete: m.frete }))}
          formatY={formatBRL}
          srSummary="Comissão e frete somados por mês nos últimos 12 meses."
        />
      </Card>
    </div>
  );
}

export function TopSkusLista({ skus, mesesSelecionados, orgId }: {
  skus: { sku: string; nome: string; quantidade: number; receita: number }[];
  mesesSelecionados: number;
  orgId: string;
}) {
  const max = skus[0]?.quantidade ?? 1;
  return (
    <Card data-testid="desempenho-top-skus">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Top 10 SKUs mais vendidos</h2>
        <nav className="flex gap-2 text-xs">
          {[3, 6, 12].map((m) => (
            <Link key={m} href={`/analista/${orgId}/desempenho?skus=${m}`}
              className={m === mesesSelecionados ? 'font-semibold text-ink' : 'text-muted hover:text-ink'}>
              {m} meses
            </Link>
          ))}
        </nav>
      </div>
      {skus.length === 0 ? <p className="mt-2 text-sm text-muted">Sem vendas no período.</p> : (
        <ol className="mt-3 space-y-2">
          {skus.map((s, i) => (
            <li key={s.sku} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-ink" title={`${s.sku} — ${s.nome}`}>{s.sku} — {s.nome}</span>
              <span className="text-muted">{s.quantidade} un · {s.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              <span className="h-2 w-28 overflow-hidden rounded bg-surface-2">
                <span className="block h-full bg-brand" style={{ width: `${Math.round((s.quantidade / max) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
```

Nota ao implementer: confira as classes/o componente `Card` reais do repo (import e props usados em `analista/[orgId]/page.tsx`) e alinhe; ajuste tokens de cor (`text-ink`, `bg-brand` etc.) aos usados nas telas vizinhas.

- [ ] **Step 3: Botão de backfill client**

```tsx
// src/app/analista/[orgId]/desempenho/backfill-historico.tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/Button';
import { staffBackfillHistoricoAction, type StaffBackfillState } from '@/actions/staff.actions';

const initialState: StaffBackfillState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending} data-testid="desempenho-backfill">
      {pending ? 'Sincronizando…' : 'Sincronizar histórico (12 meses)'}
    </Button>
  );
}

export function BackfillHistorico({ orgId }: { orgId: string }) {
  const [state, action] = useFormState(staffBackfillHistoricoAction, initialState);
  return (
    <form action={action} className="text-right">
      <input type="hidden" name="orgId" value={orgId} />
      <Submit />
      {state.error ? <p className="mt-1 text-xs text-red-400">{state.error}</p> : null}
      {state.ok ? (
        <p className="mt-1 text-xs text-muted">
          {state.processados} pedidos sincronizados
          {state.pendentesEnriquecimento ? ` · ${state.pendentesEnriquecimento} aguardando enriquecimento (o cron completa em ~1h)` : ''}
        </p>
      ) : null}
    </form>
  );
}
```

Nota: siga o padrão exato de `staff-generate-report.tsx` (mesmos imports de `Button`, mesmo uso de `useFormState`).

- [ ] **Step 4: Link na visão 360**

Em `src/app/analista/[orgId]/page.tsx`, junto ao bloco do link "Abrir relatório completo →" (linhas ~163-172), adicionar:

```tsx
<Link
  href={`/analista/${orgId}/desempenho`}
  data-testid="link-desempenho-anual"
  className="inline-flex min-h-10 items-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
>
  Desempenho anual
</Link>
```

(ajustar classes ao padrão dos botões secundários vizinhos.)

- [ ] **Step 5: Verificar build + navegação manual**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: tudo limpo. Smoke manual opcional: `npm run dev`, logar como analista, abrir `/analista/<orgId>/desempenho`.

- [ ] **Step 6: Commit**

```powershell
git add src/app/analista/[orgId]/desempenho/ src/app/analista/[orgId]/page.tsx
git commit -m "feat(desempenho): pagina staff de desempenho anual"
```

---

### Task 5: Contexto anual no prompt da IA [OPUS]

**Files:**
- Modify: `src/modules/pipeline/steps/analyze-ia.ts` (tipo `AnalysisContext` + `buildAnalysisMessages`)
- Modify: `src/modules/pipeline/steps/analysis-context.ts` (`buildAnalysisContext`)
- Test: `tests/unit/analysis-context-anual.test.ts`

**Interfaces:**
- Consumes: Tasks 1-2 (`getPedidos12Meses`, `agruparPorMes`, `MesDesempenho`).
- Produces: campo novo `contextoAnual: MesDesempenho[] | null` em `AnalysisContext`; seção `### Histórico dos últimos 12 meses` no prompt `user`.

- [ ] **Step 1: Testes falhando**

```ts
// tests/unit/analysis-context-anual.test.ts
import { describe, expect, it } from 'vitest';

import { buildAnalysisMessages, type AnalysisContext } from '@/modules/pipeline/steps/analyze-ia';
import type { MesDesempenho } from '@/modules/desempenho/desempenho-anual';

const mes = (over: Partial<MesDesempenho>): MesDesempenho => ({
  mes: '2026-07', faturamento: 1000, pedidos: 10, ticketMedio: 100,
  unidades: 20, frete: 50, comissao: 120, receitaLiquida: 830, ...over,
});

const contextoBase: AnalysisContext = {
  orgName: 'Loja Teste', nicho: null, plano: 30 as AnalysisContext['plano'],
  periodo: { inicio: new Date('2026-07-01T00:00:00Z'), fim: new Date('2026-07-30T23:59:59Z') },
  metaMensal: null, totalMesCorrente: 0, relatorioAnterior: null, datasComerciais: [],
  contextoAnual: null,
};

const METRICAS_VAZIAS = {} as Parameters<typeof buildAnalysisMessages>[0];

describe('contexto anual no prompt', () => {
  it('inclui a secao com uma linha por mes quando ha historico', () => {
    const contexto = { ...contextoBase, contextoAnual: [mes({ mes: '2026-06', faturamento: 2500.5, pedidos: 25, ticketMedio: 100.02 }), mes({})] };
    const { user } = buildAnalysisMessages(METRICAS_VAZIAS, contexto);
    expect(user).toContain('### Histórico dos últimos 12 meses');
    expect(user).toContain('2026-06: R$ 2.500,50 · 25 pedidos · ticket R$ 100,02 · receita líquida R$ 830,00');
    expect(user.indexOf('### Histórico dos últimos 12 meses')).toBeLessThan(user.indexOf('### Métricas do período (JSON)'));
  });

  it('sem historico, informa explicitamente', () => {
    const { user } = buildAnalysisMessages(METRICAS_VAZIAS, contextoBase);
    expect(user).toContain('### Histórico dos últimos 12 meses');
    expect(user).toContain('Sem histórico anual disponível (backfill ainda não executado).');
  });
});
```

Nota ao implementer: `AnalysisContext['plano']` é o tipo `Plano` já existente — use um valor válido dele (confira em `@/modules/pipeline/contracts` ou onde `Plano` é declarado). Se `Metricas` mínimo `{}` não tipar, monte o menor objeto válido consultando `MetricasSchema` em `src/modules/pipeline/contracts.ts` (há testes existentes de `buildAnalysisMessages`? Se houver, copie o fixture de lá).

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- tests/unit/analysis-context-anual.test.ts`
Expected: FAIL (`contextoAnual` não existe no tipo).

- [ ] **Step 3: Implementar**

Em `analyze-ia.ts`, adicionar ao tipo `AnalysisContext` (linhas 84-99):

```ts
import type { MesDesempenho } from '@/modules/desempenho/desempenho-anual';
// ... dentro de AnalysisContext:
  /** Série mensal dos últimos 12 meses (staff/IA) — null quando não há histórico. */
  contextoAnual: MesDesempenho[] | null;
```

Em `buildAnalysisMessages` (junto aos outros `const *Texto`, antes do template `user`):

```ts
  const anualTexto =
    contexto.contextoAnual && contexto.contextoAnual.some((m) => m.pedidos > 0)
      ? contexto.contextoAnual
          .map((m) => `${m.mes}: ${formatBRL(m.faturamento)} · ${m.pedidos} pedidos · ticket ${formatBRL(m.ticketMedio)} · receita líquida ${formatBRL(m.receitaLiquida)}`)
          .join('\n')
      : 'Sem histórico anual disponível (backfill ainda não executado).';
```

E no template `user`, nova seção entre `### Datas comerciais...` e `### Métricas do período (JSON)`:

```
### Histórico dos últimos 12 meses
${anualTexto}
```

Em `analysis-context.ts` (`buildAnalysisContext`), somar ao `Promise.all` existente:

```ts
import { agruparPorMes } from '@/modules/desempenho/desempenho-anual';
import { getPedidos12Meses } from '@/modules/desempenho/desempenho-anual.repository';
// ...
  const agora = new Date();
  const [settings, totalMesCorrente, anteriores, pedidos12m] = await Promise.all([
    getOrgSettings(input.orgId),
    getTotalVendasMesCorrente(input.source),
    getUltimosDoneDetalhados(input.orgId, 1, input.source),
    getPedidos12Meses(input.source, agora),
  ]);
  const serieAnual = agruparPorMes(pedidos12m, agora, 12);
  const contextoAnual = serieAnual.some((m) => m.pedidos > 0) ? serieAnual : null;
  // ... incluir `contextoAnual` no objeto retornado
```

ATENÇÃO: buscar TODOS os construtores de `AnalysisContext` no repo (testes e mocks existentes que montam o objeto literal) e adicionar `contextoAnual: null` — o typecheck aponta cada um.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- tests/unit/analysis-context-anual.test.ts && npm run typecheck`
Expected: PASS + typecheck limpo (incluindo os construtores existentes corrigidos).

- [ ] **Step 5: Commit**

```powershell
git add src/modules/pipeline/steps/analyze-ia.ts src/modules/pipeline/steps/analysis-context.ts tests/unit/analysis-context-anual.test.ts
git commit -m "feat(ia): historico de 12 meses no contexto do prompt"
```

---

### Task 6: Seção staff "Contexto anual" no relatório [SONNET]

**Files:**
- Create: `src/app/(client)/dashboard/relatorios/[id]/contexto-anual-staff.tsx`
- Modify: `src/app/(client)/dashboard/relatorios/[id]/page.tsx`
- Test: `tests/unit/contexto-anual-staff.test.ts`

**Interfaces:**
- Consumes: Tasks 1-2; o mecanismo do PR #28: a rota do cliente recebe `?orgId=` quando aberta pelo analista (`resolveReportOrgId` já valida carteira ANTES — a seção só renderiza se `searchParams.orgId` estiver presente E `access.role` for `analista`/`admin_truth`).
- Produces: componente server `ContextoAnualStaff` com testid `contexto-anual-staff`; função pura exportada `deveExibirContextoAnual(role: string, orgIdParam: string | undefined): boolean`.

- [ ] **Step 1: Teste falhando da regra de exibição**

```ts
// tests/unit/contexto-anual-staff.test.ts
import { describe, expect, it } from 'vitest';

import { deveExibirContextoAnual } from '@/app/(client)/dashboard/relatorios/[id]/contexto-anual-staff';

describe('deveExibirContextoAnual', () => {
  it('exibe para analista/admin_truth abrindo via contexto staff (?orgId=)', () => {
    expect(deveExibirContextoAnual('analista', 'org-1')).toBe(true);
    expect(deveExibirContextoAnual('admin_truth', 'org-1')).toBe(true);
  });
  it('NUNCA exibe para cliente, mesmo se forjar ?orgId= na URL', () => {
    expect(deveExibirContextoAnual('cliente_owner', 'org-1')).toBe(false);
    expect(deveExibirContextoAnual('cliente_membro', 'org-1')).toBe(false);
  });
  it('nao exibe sem ?orgId= (analista lendo o proprio dashboard)', () => {
    expect(deveExibirContextoAnual('analista', undefined)).toBe(false);
  });
});
```

Nota ao implementer: confira os nomes REAIS dos roles de cliente em `@/modules/auth/user.types` (`UserAccess['role']`) e use-os no teste.

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- tests/unit/contexto-anual-staff.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar componente + regra**

```tsx
// src/app/(client)/dashboard/relatorios/[id]/contexto-anual-staff.tsx
import { Card } from '@/components/ui/Card';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import { agruparPorMes } from '@/modules/desempenho/desempenho-anual';
import { getPedidos12Meses } from '@/modules/desempenho/desempenho-anual.repository';

/** Cliente NUNCA vê a seção anual — só staff em contexto de carteira (?orgId= já validado pelo gate da página). */
export function deveExibirContextoAnual(role: string, orgIdParam: string | undefined): boolean {
  return Boolean(orgIdParam) && (role === 'analista' || role === 'admin_truth');
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Server component: computa ao vivo (nada é gravado no relatório — cliente não tem rota para isso). */
export async function ContextoAnualStaff({ orgId }: { orgId: string }) {
  const source = await getActiveErpConnection(orgId);
  if (!source) return null;
  const agora = new Date();
  const meses = agruparPorMes(await getPedidos12Meses(source, agora), agora, 12);
  if (!meses.some((m) => m.pedidos > 0)) return null;
  return (
    <Card data-testid="contexto-anual-staff">
      <h2 className="text-sm font-medium text-ink">Contexto anual (visão interna — o cliente não vê esta seção)</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted"><th>Mês</th><th>Faturamento</th><th>Pedidos</th><th>Ticket</th><th>Receita líquida</th></tr></thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className="border-t border-border text-ink">
                <td>{m.mes}</td><td>{brl(m.faturamento)}</td><td>{m.pedidos}</td><td>{brl(m.ticketMedio)}</td><td>{brl(m.receitaLiquida)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
```

Em `page.tsx` do relatório (após o gate existente `resolveReportOrgId`, junto às demais seções, por exemplo antes do TOC final):

```tsx
import { ContextoAnualStaff, deveExibirContextoAnual } from './contexto-anual-staff';
// ... no JSX:
{deveExibirContextoAnual(access.role, searchParams.orgId) ? <ContextoAnualStaff orgId={orgId} /> : null}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- tests/unit/contexto-anual-staff.test.ts && npm run typecheck && npm run build`
Expected: PASS, build limpo.

- [ ] **Step 5: Commit**

```powershell
git add "src/app/(client)/dashboard/relatorios/[id]/contexto-anual-staff.tsx" "src/app/(client)/dashboard/relatorios/[id]/page.tsx" tests/unit/contexto-anual-staff.test.ts
git commit -m "feat(relatorio): secao staff de contexto anual"
```

---

### Task 7: E2E de acesso e isolamento [OPUS]

**Files:**
- Create: `tests/e2e/desempenho-anual.spec.ts`

**Interfaces:**
- Consumes: helpers de `tests/e2e/helpers/db.ts` (`seedE2EAnalista`, `seedE2EActiveClient`, `cleanupE2E`, `E2E_PREFIX`); testids das Tasks 4 e 6 (`desempenho-anual-page`, `contexto-anual-staff`).

- [ ] **Step 1: Escrever o spec (padrão exato de `analista-navegacao.spec.ts`)**

```ts
// tests/e2e/desempenho-anual.spec.ts
import { expect, test, type Page } from '@playwright/test';

import { cleanupE2E, E2E_PREFIX, seedE2EActiveClient, seedE2EAnalista } from './helpers/db';

const RUN = process.env.PW_E2E_RUN_ID ?? String(Date.now());
const analistaEmail = `${E2E_PREFIX}desempenho-an-${RUN}@example.com`;
const analistaSenha = 'analista-forte-123';
const clienteEmail = `${E2E_PREFIX}desempenho-cli-${RUN}@example.com`;
const clienteSenha = 'cliente-forte-456';

let clienteOrgId: string;

test.beforeAll(async () => {
  const analistaId = await seedE2EAnalista(analistaEmail, analistaSenha);
  clienteOrgId = await seedE2EActiveClient(clienteEmail, clienteSenha, { analistaId });
});

test.afterAll(async () => {
  await cleanupE2E();
});

async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto('/sign-in');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="senha"]', senha);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard$/);
}

test('analista abre a pagina de desempenho anual da carteira', async ({ page }) => {
  await login(page, analistaEmail, analistaSenha);
  await page.goto(`/analista/${clienteOrgId}/desempenho`);
  await expect(page.getByTestId('desempenho-anual-page')).toBeVisible();
  await expect(page.getByTestId('desempenho-cobertura')).toBeVisible();
});

test('cliente nao acessa a pagina de desempenho (redirect do gate staff)', async ({ page }) => {
  await login(page, clienteEmail, clienteSenha);
  await page.goto(`/analista/${clienteOrgId}/desempenho`);
  // requireAnalista redireciona nao-staff para /sign-in (mesmo comportamento das demais rotas /analista)
  await expect(page).not.toHaveURL(new RegExp(`/analista/${clienteOrgId}/desempenho$`));
  await expect(page.getByTestId('desempenho-anual-page')).toHaveCount(0);
});

test('relatorio do cliente NAO contem a secao de contexto anual', async ({ page }) => {
  await login(page, clienteEmail, clienteSenha);
  await page.goto('/dashboard/relatorios');
  // sem relatorio gerado a lista esta vazia; o invariante e: em NENHUMA pagina
  // do cliente a secao staff aparece, mesmo forjando ?orgId= na URL de um id inexistente
  await page.goto(`/dashboard/relatorios/00000000-0000-0000-0000-000000000000?orgId=${clienteOrgId}`);
  await expect(page.getByTestId('contexto-anual-staff')).toHaveCount(0);
});
```

Nota ao implementer: confira em `require-analista.ts` o destino real do redirect de não-staff e ajuste a assertion; se `seedE2EActiveClient` não deixar o cliente logável direto no `/dashboard`, copie o fluxo de login de `analista-navegacao.spec.ts` byte a byte. NÃO semeie `orders` no E2E (evita as armadilhas de FK/cleanup documentadas no Cerebro) — os cenários acima não dependem de dados.

- [ ] **Step 2: Rodar**

Run (PowerShell): `$env:DATABASE_URL_TEST=$env:DATABASE_URL_TEST_DIRECT; npm run test:e2e -- desempenho-anual.spec.ts`
Expected: 3 testes PASS.

- [ ] **Step 3: Commit**

```powershell
git add tests/e2e/desempenho-anual.spec.ts
git commit -m "test(e2e): acesso staff e isolamento do desempenho anual"
```

---

### Task 8: Verificação final da branch [OPUS]

**Files:** nenhum novo — verificação e correções pontuais.

- [ ] **Step 1: Suíte completa**

Run (PowerShell):
```powershell
$env:DATABASE_URL_TEST=$env:DATABASE_URL_TEST_DIRECT
npm run typecheck; npm run lint; npm test; npm run build
```
Expected: typecheck/lint/build limpos. Suíte: comparar falhas com o baseline conhecido do Cerebro (5 ambientais + dado sujo em `analista-meu-dia`/`performance-data`/`replicar-task`) — NENHUMA falha nova relacionada a esta branch.

- [ ] **Step 2: E2E**

Run: `npm run test:e2e -- desempenho-anual.spec.ts`
Expected: PASS.

- [ ] **Step 3: Revisão de código da branch inteira**

`git diff master...HEAD` — revisar contra a spec: (a) toda leitura de `orders` via `orderScope`; (b) nenhum caminho expõe a página/seção a cliente; (c) nada gravado em `reports.metricas`; (d) copy pt-BR; (e) nenhuma migration.

- [ ] **Step 4: Registrar no Cerebro**

Atualizar `C:\Users\makfo\Cerebro\truth-analytics\ESTADO.md` (seção nova curta: branch, HEAD, o que entrega, verificação) e `C:\Users\makfo\Cerebro\STATUS.md` se aplicável.

---

## Execution Handoff

Execute com `superpowers:subagent-driven-development`: um subagente por task, revisão entre tasks, revisão final (Task 8) pelo orquestrador. Modelos por task conforme marcação **[OPUS]**/**[SONNET]** (decisão do dono). Branch: `feat/desempenho-anual-staff`. NÃO pushar nem mergear em `master` sem pedido explícito do dono (o Codex trabalha em `master` em paralelo).
