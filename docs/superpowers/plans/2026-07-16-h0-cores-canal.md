# H0 — Cores por Canal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo canal de venda renderiza com a cor da marca do marketplace (Shopee laranja, Mercado Livre amarelo, loja virtual azul, desconhecido neutro) em todos os pontos onde métricas por canal aparecem.

**Architecture:** Um módulo puro `src/lib/canal-visual.ts` (normalização de texto → categoria → cor, testável em node) é a única fonte de verdade. Os componentes de chart genéricos (`DonutChart`, `StackedAreaChart`) ganham uma prop opcional `colors` com fallback no comportamento atual (`seriesColor(i)`), e os call sites de canal passam as cores do módulo. Tabelas e PDF ganham um dot/quadrado colorido ao lado do nome do canal.

**Tech Stack:** Next.js 14 (App Router, RSC), Recharts, @react-pdf/renderer, Vitest (node), Tailwind. Sem dependência nova, sem migration.

**Branch:** `feat/h0-cores-canal` (base: `master`).

## Global Constraints

- **Zero mudança de lógica/dados** — só apresentação. Nenhum shape de métrica, contrato Zod ou query muda.
- **Testids e textos preservados** — os E2E existentes são o guard; nenhum `data-testid` ou texto visível muda.
- **Sem lib nova, sem migration, sem env nova.**
- **Cores exatas (spec §3 H0):** Shopee `#EE4D2D`; Mercado Livre `#FFE600`; loja virtual `#3B82F6`; outro = neutro `#94A3B8`.
- **Contraste:** `#FFE600` nunca vira fundo de texto escuro nem cor de texto — só preenchimento de dot/fatia/área (labels continuam na cor de texto padrão ao lado).
- **A11y:** cor nunca é o único sinal — o nome do canal continua sempre escrito.
- Comandos de verificação do projeto: `npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run test:e2e`.

---

### Task 1: Módulo puro `canal-visual.ts`

**Files:**
- Create: `src/lib/canal-visual.ts`
- Test: `tests/unit/canal-visual.test.ts`

**Interfaces:**
- Consumes: nada (módulo folha, zero imports de app).
- Produces (usado pelas Tasks 2–4):
  - `type CanalCategoria = 'shopee' | 'mercado_livre' | 'loja_virtual' | 'outro'`
  - `categoriaDoCanal(canal: string): CanalCategoria`
  - `CORES_CANAL: Record<CanalCategoria, readonly string[]>`
  - `corDoCanal(canal: string): string` — cor-base da categoria.
  - `coresDosCanais(canais: string[]): string[]` — cores para uma série; repetições da mesma categoria avançam para o próximo tom (cíclico).

- [ ] **Step 1: Write the failing test**

Criar `tests/unit/canal-visual.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  categoriaDoCanal,
  coresDosCanais,
  corDoCanal,
  CORES_CANAL,
} from '@/lib/canal-visual';

describe('categoriaDoCanal', () => {
  it('reconhece Shopee em qualquer grafia', () => {
    expect(categoriaDoCanal('Shopee')).toBe('shopee');
    expect(categoriaDoCanal('SHOPEE - Loja Oficial')).toBe('shopee');
  });

  it('reconhece Mercado Livre nas variações comuns', () => {
    expect(categoriaDoCanal('Mercado Livre')).toBe('mercado_livre');
    expect(categoriaDoCanal('MercadoLivre')).toBe('mercado_livre');
    expect(categoriaDoCanal('Mercado Libre')).toBe('mercado_livre');
  });

  it('classifica plataformas de loja virtual como loja_virtual', () => {
    expect(categoriaDoCanal('Nuvemshop')).toBe('loja_virtual');
    expect(categoriaDoCanal('Tray')).toBe('loja_virtual');
    expect(categoriaDoCanal('Loja Integrada')).toBe('loja_virtual');
    expect(categoriaDoCanal('Site próprio')).toBe('loja_virtual');
    expect(categoriaDoCanal('E-commerce')).toBe('loja_virtual');
  });

  it('ignora acentos e caixa', () => {
    expect(categoriaDoCanal('SÍTE')).toBe('loja_virtual');
  });

  it('canal desconhecido cai em outro', () => {
    expect(categoriaDoCanal('Bling')).toBe('outro');
    expect(categoriaDoCanal('Magalu')).toBe('outro');
    expect(categoriaDoCanal('')).toBe('outro');
  });
});

describe('corDoCanal', () => {
  it('devolve a cor-base da categoria (spec H0)', () => {
    expect(corDoCanal('Shopee')).toBe('#EE4D2D');
    expect(corDoCanal('Mercado Livre')).toBe('#FFE600');
    expect(corDoCanal('Nuvemshop')).toBe('#3B82F6');
    expect(corDoCanal('Bling')).toBe('#94A3B8');
  });
});

describe('coresDosCanais', () => {
  it('atribui a cor-base de cada categoria na ordem da série', () => {
    expect(coresDosCanais(['Shopee', 'Mercado Livre', 'Nuvemshop'])).toEqual([
      '#EE4D2D',
      '#FFE600',
      '#3B82F6',
    ]);
  });

  it('repetições da mesma categoria avançam o tom para não colidir', () => {
    const [nuvem, tray] = coresDosCanais(['Nuvemshop', 'Tray']);
    expect(nuvem).toBe('#3B82F6');
    expect(tray).toBe(CORES_CANAL.loja_virtual[1]);
    expect(tray).not.toBe(nuvem);
  });

  it('mais repetições que tons cicla o array de tons', () => {
    const tons = CORES_CANAL.outro;
    const cores = coresDosCanais(['A', 'B', 'C', 'D']);
    expect(cores[3]).toBe(tons[3 % tons.length]);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(coresDosCanais([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/canal-visual.test.ts`
Expected: FAIL — `Cannot find module '@/lib/canal-visual'` (ou equivalente).

- [ ] **Step 3: Write minimal implementation**

Criar `src/lib/canal-visual.ts`:

```ts
/**
 * Identidade visual por canal de venda — puro (testável em node).
 * Única fonte de verdade de categoria e cor por marketplace (spec Programa H §3 H0).
 */

export type CanalCategoria = 'shopee' | 'mercado_livre' | 'loja_virtual' | 'outro';

const TERMOS_LOJA_VIRTUAL = [
  'nuvemshop',
  'tray',
  'loja integrada',
  'vtex',
  'shopify',
  'woocommerce',
  'wix',
  'loja virtual',
  'e-commerce',
  'ecommerce',
  'site',
];

function normaliza(canal: string): string {
  return canal
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function categoriaDoCanal(canal: string): CanalCategoria {
  const n = normaliza(canal);
  if (n.includes('shopee')) return 'shopee';
  if (n.includes('mercado livre') || n.includes('mercadolivre') || n.includes('mercado libre')) {
    return 'mercado_livre';
  }
  if (TERMOS_LOJA_VIRTUAL.some((t) => n.includes(t))) return 'loja_virtual';
  return 'outro';
}

/** Tons por categoria — o 1º é a cor-base; séries com categoria repetida avançam no array. */
export const CORES_CANAL: Record<CanalCategoria, readonly string[]> = {
  shopee: ['#EE4D2D', '#F97316'],
  mercado_livre: ['#FFE600', '#FACC15'],
  loja_virtual: ['#3B82F6', '#60A5FA', '#2563EB'],
  outro: ['#94A3B8', '#CBD5E1', '#64748B'],
};

/** Cor-base do canal (dots, badges, PDF). */
export function corDoCanal(canal: string): string {
  return CORES_CANAL[categoriaDoCanal(canal)][0];
}

/** Cores de uma série de canais (charts): base por categoria; repetição avança o tom (cíclico). */
export function coresDosCanais(canais: string[]): string[] {
  const vistos = new Map<CanalCategoria, number>();
  return canais.map((canal) => {
    const categoria = categoriaDoCanal(canal);
    const idx = vistos.get(categoria) ?? 0;
    vistos.set(categoria, idx + 1);
    const tons = CORES_CANAL[categoria];
    return tons[idx % tons.length];
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/canal-visual.test.ts`
Expected: PASS (todos os testes verdes).

- [ ] **Step 5: Typecheck e lint**

Run: `npm run typecheck && npm run lint`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/lib/canal-visual.ts tests/unit/canal-visual.test.ts
git commit -m "feat(h0): módulo puro de identidade visual por canal (categoria + cores de marca)"
```

---

### Task 2: Charts com cores por canal (Donut + StackedArea)

**Files:**
- Modify: `src/components/ui/charts/DonutChart.tsx`
- Modify: `src/components/ui/charts/StackedAreaChart.tsx`
- Modify: `src/app/(client)/dashboard/dashboard-charts.tsx`
- Modify: `src/app/(client)/dashboard/relatorios/[id]/graficos-cliente.tsx`

**Interfaces:**
- Consumes: `coresDosCanais(canais: string[]): string[]` de `@/lib/canal-visual` (Task 1).
- Produces: `DonutChart` e `StackedAreaChart` aceitam prop opcional `colors?: string[]` (posicional, fallback `seriesColor(i)`). Consumidores existentes sem a prop continuam idênticos.

Contexto para o implementador: ambos os componentes hoje colorem por posição via `seriesColor(i)` de `./chart-theme`. A prop `colors` é posicional (mesmo índice do item/key). NÃO remover `seriesColor` — é o fallback e outros charts podem usá-lo.

- [ ] **Step 1: Adicionar prop `colors` ao DonutChart**

Em `src/components/ui/charts/DonutChart.tsx`, a interface vira:

```tsx
interface DonutChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
  /** Cores posicionais por item; ausente = paleta padrão. */
  colors?: string[];
}
```

A assinatura vira `export function DonutChart({ data, height = 240, formatValue, colors }: DonutChartProps)`, e as DUAS ocorrências de cor trocam para o helper local:

```tsx
const corDe = (i: number) => colors?.[i] ?? seriesColor(i);
```

(declarar dentro do componente, antes do return). No `<Cell>`: `fill={corDe(i)}`. No dot da legenda (`<span style=...>`): `backgroundColor: corDe(i)`.

- [ ] **Step 2: Adicionar prop `colors` ao StackedAreaChart**

Em `src/components/ui/charts/StackedAreaChart.tsx`, mesmo padrão: adicionar `colors?: string[]` à interface (mesmo comentário), incluir na desestruturação, declarar `const corDe = (i: number) => colors?.[i] ?? seriesColor(i);` e trocar as TRÊS ocorrências: `stroke={corDe(i)}` e `fill={corDe(i)}` no `<Area>`, `backgroundColor: corDe(i)` no dot da legenda.

- [ ] **Step 3: Wire no donut do dashboard**

Em `src/app/(client)/dashboard/dashboard-charts.tsx`: adicionar import

```tsx
import { coresDosCanais } from '@/lib/canal-visual';
```

e na linha do donut (hoje `<DonutChart data={canais} formatValue={formatBRL} />`):

```tsx
<DonutChart data={canais} formatValue={formatBRL} colors={coresDosCanais(canais.map((c) => c.label))} />
```

- [ ] **Step 4: Wire no canal×dia do relatório**

Em `src/app/(client)/dashboard/relatorios/[id]/graficos-cliente.tsx`, no componente `CanalPorDiaV2` (usa `stackedAreaModel` → `{ keys, rows }`): adicionar import de `coresDosCanais` de `@/lib/canal-visual` e passar

```tsx
<StackedAreaChart
  keys={keys}
  rows={rows}
  colors={coresDosCanais(keys)}
  /* ...demais props existentes INALTERADAS... */
/>
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo verde (a suíte existente não referencia cores posicionais).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/charts/DonutChart.tsx src/components/ui/charts/StackedAreaChart.tsx "src/app/(client)/dashboard/dashboard-charts.tsx" "src/app/(client)/dashboard/relatorios/[id]/graficos-cliente.tsx"
git commit -m "feat(h0): charts de canal com cores de marca (prop colors opcional, fallback paleta)"
```

---

### Task 3: Dots de canal nas tabelas (métricas + comparar)

**Files:**
- Create: `src/components/ui/CanalDot.tsx`
- Modify: `src/app/(client)/dashboard/relatorios/[id]/metricas-section.tsx:145` (vendas por canal) e `:279` (frete por canal)
- Modify: `src/app/(client)/dashboard/relatorios/comparar/page.tsx:157`

**Interfaces:**
- Consumes: `corDoCanal(canal: string): string` de `@/lib/canal-visual` (Task 1).
- Produces: `CanalDot({ canal }: { canal: string })` — span decorativo (server-safe, sem 'use client') usado pela Task 4 como referência visual (PDF replica a ideia).

- [ ] **Step 1: Criar o componente CanalDot**

Criar `src/components/ui/CanalDot.tsx`:

```tsx
import React from 'react';

import { corDoCanal } from '@/lib/canal-visual';

/** Dot decorativo com a cor da marca do canal — o nome do canal segue sempre escrito ao lado. */
export function CanalDot({ canal }: { canal: string }) {
  return (
    <span
      aria-hidden="true"
      className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full align-middle"
      style={{ backgroundColor: corDoCanal(canal) }}
    />
  );
}
```

- [ ] **Step 2: Wire na tabela de vendas por canal**

Em `src/app/(client)/dashboard/relatorios/[id]/metricas-section.tsx`, adicionar import `import { CanalDot } from '@/components/ui/CanalDot';` e trocar (linha ~145):

```tsx
<TD>{v.canal}</TD>
```

por:

```tsx
<TD><CanalDot canal={v.canal} />{v.canal}</TD>
```

- [ ] **Step 3: Wire na tabela de frete por canal**

No mesmo arquivo (linha ~279), trocar:

```tsx
<TD>{f.canal}</TD>
```

por:

```tsx
<TD><CanalDot canal={f.canal} />{f.canal}</TD>
```

- [ ] **Step 4: Wire na página comparar**

Em `src/app/(client)/dashboard/relatorios/comparar/page.tsx`, adicionar o mesmo import e trocar (linha ~157):

```tsx
<TD className="text-muted">Canal: {c.canal}</TD>
```

por:

```tsx
<TD className="text-muted"><CanalDot canal={c.canal} />Canal: {c.canal}</TD>
```

- [ ] **Step 5: Verificar**

Run: `npm run typecheck && npm run lint && npm test`
Expected: tudo verde. (Textos das células ganham apenas um span `aria-hidden` — E2E que asserta texto não quebra.)

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/CanalDot.tsx "src/app/(client)/dashboard/relatorios/[id]/metricas-section.tsx" "src/app/(client)/dashboard/relatorios/comparar/page.tsx"
git commit -m "feat(h0): dot com cor de marca do canal nas tabelas de métricas e comparativo"
```

---

### Task 4: Cor de canal no PDF + bateria final

**Files:**
- Modify: `src/modules/pdf/report-pdf.tsx:332-338` (tabela "Vendas por canal")

**Interfaces:**
- Consumes: `corDoCanal(canal: string): string` de `@/lib/canal-visual` (Task 1). `@react-pdf/renderer` não aceita `<span>`/CSS web — usar `<View>` com `backgroundColor`.

- [ ] **Step 1: Adicionar o quadrado colorido na linha do canal**

Em `src/modules/pdf/report-pdf.tsx`, adicionar import `import { corDoCanal } from '@/lib/canal-visual';` e trocar o bloco (linhas ~332-338):

```tsx
{metricas.vendasPorCanal.map((v, i) => (
  <View key={i} style={s.row} wrap={false}>
    <Text style={{ width: '50%' }}>{v.canal}</Text>
    <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{BRL(v.total)}</Text>
    <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{v.pedidos}</Text>
  </View>
))}
```

por:

```tsx
{metricas.vendasPorCanal.map((v, i) => (
  <View key={i} style={s.row} wrap={false}>
    <View style={{ width: '50%', flexDirection: 'row', alignItems: 'center' }}>
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 3,
          marginRight: 4,
          backgroundColor: corDoCanal(v.canal),
        }}
      />
      <Text>{v.canal}</Text>
    </View>
    <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{BRL(v.total)}</Text>
    <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{v.pedidos}</Text>
  </View>
))}
```

(Atenção: o texto do canal fica DENTRO do `<View>` de 50% — a largura total da linha não muda.)

- [ ] **Step 2: Bateria completa**

Run: `npm run typecheck && npm run lint && npm test && npm run build`
Expected: tudo verde, build ok.

- [ ] **Step 3: E2E**

Run: `npm run test:e2e`
Expected: 14/14 verdes (nenhum testid/texto mudou).

- [ ] **Step 4: Commit**

```bash
git add src/modules/pdf/report-pdf.tsx
git commit -m "feat(h0): cor de marca do canal na tabela de vendas por canal do PDF"
```

---

## Verificação final do bloco (fora das tasks)

1. Revisão ampla da branch (modelo Opus, padrão dos programas F/G): invariantes = zero mudança de lógica, testids preservados, cores exatas do spec.
2. QA visual (dev server banco test): dashboard donut, relatório (stacked area + tabelas), comparar, PDF — conferir Shopee laranja / ML amarelo / azul / neutro.
3. Merge `--no-ff` em `master` mediante autorização do dono.
