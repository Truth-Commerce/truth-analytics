# F1 — Experiência Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Transformar o Truth Analytics de "esqueleto funcional dark" em **experiência cinematográfica da marca Truth**: design system completo (tokens semânticos, glow em camadas, glass), motion system (framer-motion, easing assinatura), stepper de geração em tempo real, dashboard bento com charts, relatório editorial com export PDF, onboarding, admin operacional e command palette ⌘K — **sem mudar lógica de negócio** e preservando 100% dos testids/textos/fluxos cobertos pelos E2E.

**Architecture:** Camada de apresentação por cima do que a F0 entregou. Tokens novos em `tailwind.config.ts`; motion centralizado em `src/lib/motion.ts` (easing `[0.16,1,0.3,1]`, variants, count-up) com `MotionConfig reducedMotion="user"` global; novos primitivos em `src/components/ui/` com APIs estáveis (F2/F3 consomem); charts Recharts themados em `src/components/ui/charts/`; o stepper consome o contrato F0 `GET /api/reports/[id]/status` → `{status, etapa}` via polling de 3 s. Admin ganha `/admin/[orgId]` com queries read-only cross-org no `admin.repository` e ações de disparo/reprocesso que reusam a rota F0 `POST /api/pipeline/run`.
**Decisão PDF — `@react-pdf/renderer` (não print-CSS):** a identidade dark com verde neon é irreproduzível em print-CSS (browsers removem backgrounds por padrão, sem controle de paginação/margens, resultado varia por browser); o PDF é o entregável físico da consultoria e precisa ser byte-consistente e gerado server-side (também habilita anexar em e-mail na F3).
**Decisão ⌘K — `cmdk` (não próprio):** ~5 kB gzip, zero dependências transitivas, headless (estilizamos 100% com nossos tokens) e resolve filtro + navegação por teclado + ARIA de combobox — reimplementar isso à mão é risco de a11y sem ganho.

**Tech Stack:** Next.js 14 App Router, Tailwind 3.4, TypeScript strict, `framer-motion@^11`, `recharts@^2.15`, `cmdk@^1`, `@react-pdf/renderer@^4`, vitest (unit/integration no branch Neon `test`), Playwright E2E.

## Global Constraints

- **INVARIANTE CARDINAL (igual ao Plano 7):** preservar todos os `data-testid`, textos asserados e `name` de inputs cobertos por `tests/e2e/*.spec.ts`. Zero mudança de lógica de negócio fora do listado neste plano. **Única exceção autorizada:** os fluxos de "Desconectar" e "Remover produto" ganham ConfirmDialog (item do escopo) — os specs E2E correspondentes são atualizados **na mesma task**, minimamente (um clique a mais em `[data-testid="confirm-dialog-confirm"]`).
- **Testids/textos a preservar (inventário conferido no código):** `generate-report-button`, `latest-report`, `ver-relatorio`, `reports-list`, `report-status`, `metricas`, `resumo-executivo`, `report-erro`, `bling-status`, `add-form`, `produto-${id}`, `disconnect-bling`, `org-${orgId}`, `status-${orgId}`; textos `Conectado ✓`, `Não conectado`, `Conecte o Bling em Conexões.`, `Nenhum produto ainda.`, `Remover`, `Ativar`, `active`; `name` de inputs: `email`, `senha`, `orgName`, `nome`, `sku`, `keywords`, `orgId`, `plano`, `id`; `<select name="plano">` com options `weekly|biweekly|monthly`.
- **Dependência F0:** este plano consome `reports.etapa` (`coletando_vendas|analisando_mercado|analisando_ia|finalizando`), `GET /api/reports/[id]/status` → `{ status, etapa }`, `POST /api/pipeline/run` (header `x-pipeline-secret` = env `PIPELINE_SECRET`) e `generateReportAction` retornando `{reportId}` imediato (report `queued`). **Regra de ouro:** antes de cada task, re-validar os trechos citados contra o `master` pós-F0; se a F0 tiver exportado helpers equivalentes (ex.: dispatch do pipeline, período por plano), **reusar em vez de duplicar**.
- **prefers-reduced-motion respeitado em TUDO:** framer via `MotionConfig reducedMotion="user"`; animações CSS com `motion-reduce:animate-none`.
- **DNA visual (seguir à risca):** dark `#040507`/`#0a0c10`/`#0d0d10`, verde `#07dd2b`, glow 3 camadas (`#07dd2b4d`/`33`/`1f`), bordas `#ffffff0f`, muted `#a1a1aa`, Sora/Inter/Space Mono, easing `cubic-bezier(.16,1,.3,1)`, glassmorphism com `backdrop-blur`.
- **Contraste:** token `dim` sobe de `#888888` para `#a1a1aa` (mínimo AA).
- **Verificação por task:** `npm run test` + `npm run typecheck` + `npm run lint` + `npm run build`; tasks que tocam telas com E2E fecham com `npm run test:e2e`. **QA visual:** dev server na porta **3200** apontando ao branch `test` (`$env:POSTGRES_URL = $env:DATABASE_URL_TEST; $env:POSTGRES_URL_DIRECT = $env:DATABASE_URL_TEST; npm run dev -- -p 3200`) + screenshots via chrome-devtools (1280×800 e 375×812) avaliados pelo controlador.
- **Testes de componente:** o vitest do repo roda em `environment: 'node'` sem testing-library — logo, TODA lógica de componente testável vive em módulos puros `.ts` (models) com testes unit; o render visual é verificado por QA de screenshot. Não adicionar jsdom.
- **Idioma:** UI e commits pt-BR (`feat:`/`fix:`/`chore:`). Branch **`feat/f1-experiencia`** a partir de `master` (pós-merge F0). Nunca push/merge sem revisão. Blindagem de `tests/setup.ts` intocável.

## File Structure

| Caminho | Responsabilidade |
|---|---|
| `tailwind.config.ts` (mod) | tokens semânticos success/warning/danger, glass, glow 3 camadas, easing `truth`, keyframes marquee/shimmer, fix `dim` |
| `src/lib/motion.ts` (criar) | `EASE_TRUTH`, `DUR`, variants `fadeLift`/`staggerContainer`, hook `useCountUp` |
| `src/components/motion-provider.tsx` (criar) | `MotionConfig reducedMotion="user"` global |
| `src/components/ui/toast-store.ts` + `Toast.tsx` (criar) | fila de toasts pura + Provider/viewport/useToast |
| `src/components/ui/{Alert,Skeleton,EmptyState,ConfirmDialog}.tsx` (criar) | primitivos de feedback |
| `src/components/ui/{Tabs,Dropdown,Tooltip,Pagination,Stepper}.tsx` + `pagination-model.ts` (criar) | primitivos de navegação/dados |
| `src/components/ui/charts/{chart-theme.ts,GlassTooltip.tsx,LineChart.tsx,BarChart.tsx,DonutChart.tsx,Sparkline.tsx}` (criar) | Recharts themado |
| `src/modules/reports/{stepper-model.ts,dashboard-model.ts,report-view-model.ts,report-errors.ts}` (criar) | models puros (testáveis em node) |
| `src/app/(client)/dashboard/{use-report-status.ts,generation-progress.tsx,stat-cards.tsx,insights-marquee.tsx,dashboard-charts.tsx,onboarding-checklist.tsx}` (criar) | dashboard vivo |
| `src/app/(client)/dashboard/relatorios/[id]/{reveal.tsx,toc.tsx}` (criar) | relatório editorial |
| `src/modules/pdf/{fonts.ts,report-pdf.tsx}` + `src/app/api/reports/[id]/pdf/route.ts` + `public/fonts/*.ttf` (criar) | export PDF |
| `src/modules/admin/admin.repository.ts` (mod) + `src/modules/admin/periodo-plano.ts` (criar) | queries operacionais cross-org (read-only) + período por plano |
| `src/app/admin/[orgId]/{page.tsx,report-actions.tsx,generate-now.tsx}` (criar); `src/app/admin/{page.tsx,client-row.tsx}` (mod) | admin operacional |
| `src/components/{command-model.ts,command-palette.tsx}` (criar); `src/components/app-shell.tsx` (mod) | ⌘K |
| telas existentes (mod) | bento dashboard, relatório editorial, conexões, aguardando — preservando testids |
| `src/app/(client)/dashboard/loading.tsx` etc. (criar) | skeletons por área |

---

### Task 1: Tokens semânticos + fundação de motion (+ Badge tokenizado + PlanoSelect unificado)

**Files:**
- Modify: `tailwind.config.ts`
- Create: `src/lib/motion.ts`, `src/components/motion-provider.tsx`
- Modify: `src/app/layout.tsx`, `src/components/ui/Badge.tsx`, `src/app/admin/client-row.tsx`
- Test: `tests/unit/motion.test.ts`

**Interfaces:**
- Consumes: tokens existentes (`bg.*`, `brand`, `muted`, `line`), `Select` de `src/components/ui/Select.tsx`.
- Produces: classes tailwind `text-success-fg|warning-fg|danger-fg`, `bg-success-tint|warning-tint|danger-tint`, `border-success-border|warning-border|danger-border`, `bg-glass`, `shadow-glow-3`, `ease-truth`, `animate-marquee`, `animate-shimmer`; `EASE_TRUTH: readonly [number,number,number,number]`, `DUR: {fast:0.2; base:0.4; slow:0.7}`, `fadeLift: Variants`, `staggerContainer: Variants`, `useCountUp(target: number, durationS?: number): number`; `<MotionProvider>{children}</MotionProvider>`. Badge mantém variantes `mono|success|warn|danger|neutral` (API inalterada).

- [ ] **Step 1: instalar framer-motion**

```bash
npm i framer-motion@^11
```

- [ ] **Step 2: escrever o teste que falha**

```ts
// tests/unit/motion.test.ts
import { describe, expect, it } from 'vitest';

import { DUR, EASE_TRUTH, fadeLift, staggerContainer } from '@/lib/motion';

describe('motion tokens', () => {
  it('EASE_TRUTH é o easing assinatura do site', () => {
    expect(EASE_TRUTH).toEqual([0.16, 1, 0.3, 1]);
  });

  it('fadeLift entra de baixo com o easing assinatura', () => {
    expect(fadeLift.hidden).toEqual({ opacity: 0, y: 16 });
    expect(fadeLift.visible).toMatchObject({
      opacity: 1,
      y: 0,
      transition: { duration: DUR.base, ease: EASE_TRUTH },
    });
  });

  it('staggerContainer escalona filhos', () => {
    expect(staggerContainer.visible).toMatchObject({
      transition: { staggerChildren: 0.08, delayChildren: 0.05 },
    });
  });
});
```

- [ ] **Step 3: rodar e ver falhar**

Run: `npx vitest run tests/unit/motion.test.ts`
Expected: FAIL — `Cannot find module '@/lib/motion'` (ou equivalente).

- [ ] **Step 4: implementar `src/lib/motion.ts`**

```ts
/**
 * Motion system Truth — easing assinatura do truthcommerce.com.br,
 * variants reutilizáveis e count-up. prefers-reduced-motion é respeitado
 * globalmente via <MotionProvider> (MotionConfig reducedMotion="user");
 * useCountUp checa o hook useReducedMotion diretamente.
 */
import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';

export const EASE_TRUTH = [0.16, 1, 0.3, 1] as const;

export const DUR = { fast: 0.2, base: 0.4, slow: 0.7 } as const;

/** Entrada padrão de cards/seções: fade + lift. */
export const fadeLift: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.base, ease: EASE_TRUTH },
  },
};

/** Container que escalona a entrada dos filhos (usar com fadeLift nos filhos). */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

/**
 * Anima um número de 0 até `target` (Space Mono nos consumidores).
 * Com prefers-reduced-motion, retorna `target` direto (sem animação).
 */
export function useCountUp(target: number, durationS = 1.1): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const controls = animate(0, target, {
      duration: durationS,
      ease: EASE_TRUTH,
      onUpdate: (v) => setValue(v),
    });
    return () => controls.stop();
  }, [target, durationS, reduced]);

  return value;
}
```

- [ ] **Step 5: rodar e ver passar**

Run: `npx vitest run tests/unit/motion.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: tokens no tailwind** — em `tailwind.config.ts`, dentro de `theme.extend`, substituir/adicionar (mantendo o que já existe):

```ts
      colors: {
        bg: {
          base: '#040507',
          surface: '#0a0c10',
          elevated: '#0d0d10',
        },
        brand: {
          DEFAULT: '#07dd2b',
          glow: '#07dd2b1f',
        },
        muted: '#a1a1aa',
        // era #888888 — abaixo de AA; mínimo agora é #a1a1aa
        dim: '#a1a1aa',
        line: '#ffffff0f',
        strong: 'rgba(255,255,255,0.15)',
        glass: 'rgba(255,255,255,0.03)',
        success: {
          DEFAULT: '#07dd2b',
          fg: '#4ade80',
          tint: 'rgba(7,221,43,0.10)',
          border: 'rgba(7,221,43,0.30)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          fg: '#fbbf24',
          tint: 'rgba(245,158,11,0.10)',
          border: 'rgba(245,158,11,0.30)',
        },
        danger: {
          DEFAULT: '#ef4444',
          fg: '#f87171',
          tint: 'rgba(239,68,68,0.10)',
          border: 'rgba(239,68,68,0.30)',
        },
      },
      boxShadow: {
        glow: '0 0 24px 0 #07dd2b40',
        // glow assinatura em 3 camadas (DNA do site)
        'glow-3':
          '0 0 60px -10px #07dd2b4d, 0 0 28px -6px #07dd2b33, 0 0 12px 0 #07dd2b1f',
      },
      transitionTimingFunction: {
        truth: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        marquee: 'marquee 40s linear infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
```

(Manter `fontFamily` e `borderRadius` como estão.)

- [ ] **Step 7: MotionProvider global** — criar `src/components/motion-provider.tsx`:

```tsx
'use client';

import { MotionConfig } from 'framer-motion';

/** Respeita prefers-reduced-motion em TODAS as animações framer da árvore. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
```

Em `src/app/layout.tsx`, envolver o conteúdo do `<body>`:

```tsx
import { MotionProvider } from '@/components/motion-provider';
// ... dentro do return, mantendo classes/fontes existentes:
      <body className="font-sans">
        <MotionProvider>{children}</MotionProvider>
      </body>
```

(Conferir o body atual e apenas envolver `{children}` — não mexer em fontes/metadata.)

- [ ] **Step 8: tokenizar o Badge** — em `src/components/ui/Badge.tsx`, substituir o mapa de variantes (API e nomes de variante INALTERADOS):

```ts
const variantClasses: Record<BadgeVariant, string> = {
  mono: 'font-mono uppercase tracking-wider text-[11px] text-brand bg-brand-glow border border-brand/30 rounded-full px-3 py-1',
  success:
    'text-[11px] text-success-fg bg-success-tint border border-success-border rounded-full px-3 py-1',
  warn: 'text-[11px] text-warning-fg bg-warning-tint border border-warning-border rounded-full px-3 py-1',
  danger:
    'text-[11px] text-danger-fg bg-danger-tint border border-danger-border rounded-full px-3 py-1',
  neutral:
    'text-[11px] text-white/60 bg-white/10 border border-white/10 rounded-full px-3 py-1',
};
```

- [ ] **Step 9: unificar PlanoSelect com Select.tsx** — em `src/app/admin/client-row.tsx`, remover a função local `PlanoSelect` e usar o primitivo (options e `name` EXATOS — o E2E admin usa `select[name="plano"]` + `selectOption('weekly')`):

```tsx
import { Select } from '@/components/ui/Select';

function PlanoSelect() {
  return (
    <Select name="plano" defaultValue="" className="w-auto py-1.5 text-sm">
      <option value="" disabled>
        Plano…
      </option>
      <option value="weekly">Semanal</option>
      <option value="biweekly">Quinzenal</option>
      <option value="monthly">Mensal</option>
    </Select>
  );
}
```

- [ ] **Step 10: verificação completa**

Run: `npm run test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: tudo verde (suíte completa + E2E — Badge/Select preservam textos e `name`).

- [ ] **Step 11: commit**

```bash
git add tailwind.config.ts src/lib/motion.ts src/components/motion-provider.tsx src/app/layout.tsx src/components/ui/Badge.tsx src/app/admin/client-row.tsx tests/unit/motion.test.ts package.json package-lock.json
git commit -m "feat(f1): tokens semânticos + glow 3 camadas + motion system (easing Truth, reduced-motion) + Badge tokenizado + PlanoSelect unificado"
```

---

### Task 2: Primitivos de feedback — Toast, Alert, Skeleton, EmptyState, ConfirmDialog

**Files:**
- Create: `src/components/ui/toast-store.ts`, `src/components/ui/Toast.tsx`, `src/components/ui/Alert.tsx`, `src/components/ui/Skeleton.tsx`, `src/components/ui/EmptyState.tsx`, `src/components/ui/ConfirmDialog.tsx`
- Modify: `src/app/layout.tsx` (montar ToastProvider)
- Test: `tests/unit/toast-store.test.ts`

**Interfaces:**
- Consumes: `EASE_TRUTH`, `DUR` de `@/lib/motion`; tokens da Task 1.
- Produces (APIs estáveis — F2/F3 consomem):
  - `useToast(): { toast: (input: ToastInput) => void }` com `ToastInput = { title: string; description?: string; variant?: 'success' | 'error' | 'info' }`; `<ToastProvider>` montado no root layout.
  - `Alert({ variant, title, children, className }: { variant: 'info' | 'success' | 'warning' | 'danger'; title?: string; children?: React.ReactNode; className?: string })` — `variant="danger"` renderiza `role="alert"`.
  - `Skeleton({ className }: { className?: string })` — shimmer verde, `motion-reduce:animate-none`.
  - `EmptyState({ icon, title, description, action, 'data-testid' }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; 'data-testid'?: string })`.
  - `ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', variant = 'danger', onConfirm, onCancel })` — testids `confirm-dialog-confirm` / `confirm-dialog-cancel`, Esc cancela, foco inicial no confirmar, `role="dialog" aria-modal`.

- [ ] **Step 1: teste que falha (fila de toasts pura)**

```ts
// tests/unit/toast-store.test.ts
import { describe, expect, it } from 'vitest';

import { addToast, removeToast, type ToastItem } from '@/components/ui/toast-store';

describe('toast-store', () => {
  it('addToast adiciona com defaults e id fornecido', () => {
    const list = addToast([], { title: 'Salvo' }, 1);
    expect(list).toEqual([{ id: 1, title: 'Salvo', description: undefined, variant: 'info' }]);
  });

  it('mantém no máximo 4 toasts (descarta os mais antigos)', () => {
    let list: ToastItem[] = [];
    for (let i = 1; i <= 6; i++) list = addToast(list, { title: `t${i}` }, i);
    expect(list).toHaveLength(4);
    expect(list[0].title).toBe('t3');
    expect(list[3].title).toBe('t6');
  });

  it('removeToast remove por id', () => {
    const list = addToast(addToast([], { title: 'a' }, 1), { title: 'b' }, 2);
    expect(removeToast(list, 1).map((t) => t.id)).toEqual([2]);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npx vitest run tests/unit/toast-store.test.ts`
Expected: FAIL — módulo `toast-store` inexistente.

- [ ] **Step 3: implementar `src/components/ui/toast-store.ts`**

```ts
/** Fila de toasts pura — testável em node, sem React. */
export type ToastVariant = 'success' | 'error' | 'info';

export type ToastItem = {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
};

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

const MAX_TOASTS = 4;

export function addToast(list: ToastItem[], input: ToastInput, id: number): ToastItem[] {
  const item: ToastItem = {
    id,
    title: input.title,
    description: input.description,
    variant: input.variant ?? 'info',
  };
  return [...list, item].slice(-MAX_TOASTS);
}

export function removeToast(list: ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id);
}
```

- [ ] **Step 4: rodar e ver passar**

Run: `npx vitest run tests/unit/toast-store.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: implementar `src/components/ui/Toast.tsx`**

```tsx
'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { DUR, EASE_TRUTH } from '@/lib/motion';

import {
  addToast,
  removeToast,
  type ToastInput,
  type ToastItem,
  type ToastVariant,
} from './toast-store';

const AUTO_DISMISS_MS = 5000;

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

  const toast = useCallback((input: ToastInput) => {
    const id = idRef.current++;
    setItems((list) => addToast(list, input, id));
    setTimeout(() => setItems((list) => removeToast(list, id)), AUTO_DISMISS_MS);
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
                </div>
                <button
                  type="button"
                  aria-label="Fechar aviso"
                  onClick={() => setItems((list) => removeToast(list, t.id))}
                  className="rounded p-0.5 text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
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

- [ ] **Step 6: montar no root layout** — em `src/app/layout.tsx`:

```tsx
import { ToastProvider } from '@/components/ui/Toast';
// dentro do body:
        <MotionProvider>
          <ToastProvider>{children}</ToastProvider>
        </MotionProvider>
```

- [ ] **Step 7: implementar `src/components/ui/Alert.tsx`**

```tsx
import React from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}

const variantClasses: Record<AlertVariant, string> = {
  info: 'border-line bg-glass text-muted',
  success: 'border-success-border bg-success-tint text-success-fg',
  warning: 'border-warning-border bg-warning-tint text-warning-fg',
  danger: 'border-danger-border bg-danger-tint text-danger-fg',
};

export function Alert({ variant = 'info', title, className = '', children }: AlertProps) {
  return (
    <div
      role={variant === 'danger' ? 'alert' : undefined}
      className={`rounded-2xl border px-4 py-3 text-sm ${variantClasses[variant]} ${className}`}
    >
      {title ? <p className="mb-0.5 font-medium">{title}</p> : null}
      {children}
    </div>
  );
}
```

- [ ] **Step 8: implementar `src/components/ui/Skeleton.tsx`**

```tsx
import React from 'react';

/** Shimmer verde sutil sobre superfície escura. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-shimmer rounded-lg bg-[linear-gradient(90deg,#ffffff08_25%,#07dd2b14_50%,#ffffff08_75%)] bg-[length:200%_100%] motion-reduce:animate-none ${className}`}
    />
  );
}
```

- [ ] **Step 9: implementar `src/components/ui/EmptyState.tsx`**

```tsx
import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-glass px-6 py-10 text-center ${className}`}
      {...rest}
    >
      {icon ? <div className="text-brand">{icon}</div> : null}
      <p className="font-heading text-sm font-semibold text-white">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
```

- [ ] **Step 10: implementar `src/components/ui/ConfirmDialog.tsx`**

```tsx
'use client';

import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { DUR, EASE_TRUTH } from '@/lib/motion';

import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
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
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DUR.fast }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: DUR.fast, ease: EASE_TRUTH }}
            className="w-full max-w-sm rounded-2xl border border-line bg-bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
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
              {/* ref não passa pelo Button (props tipadas) — botão nativo estilizado */}
              <button
                ref={confirmRef}
                type="button"
                data-testid="confirm-dialog-confirm"
                onClick={onConfirm}
                className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm font-medium outline-none transition-all duration-150 ${
                  variant === 'danger'
                    ? 'border border-danger-border text-danger-fg hover:bg-danger-tint focus-visible:ring-1 focus-visible:ring-danger/50'
                    : 'bg-brand font-semibold text-[#04150a] hover:shadow-glow focus-visible:shadow-glow'
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 11: verificação**

Run: `npm run test && npm run typecheck && npm run lint && npm run build`
Expected: tudo verde (componentes ainda sem consumidores — wiring nas Tasks 9+).

- [ ] **Step 12: commit**

```bash
git add src/components/ui/toast-store.ts src/components/ui/Toast.tsx src/components/ui/Alert.tsx src/components/ui/Skeleton.tsx src/components/ui/EmptyState.tsx src/components/ui/ConfirmDialog.tsx src/app/layout.tsx tests/unit/toast-store.test.ts
git commit -m "feat(f1): primitivos de feedback — Toast (provider+useToast), Alert, Skeleton, EmptyState, ConfirmDialog"
```

---
### Task 3: Primitivos de navegação/dados — Tabs, Dropdown, Tooltip, Pagination, Stepper

**Files:**
- Create: `src/components/ui/Tabs.tsx`, `src/components/ui/Dropdown.tsx`, `src/components/ui/Tooltip.tsx`, `src/components/ui/pagination-model.ts`, `src/components/ui/Pagination.tsx`, `src/components/ui/Stepper.tsx`
- Test: `tests/unit/pagination-model.test.ts`

**Interfaces:**
- Consumes: tokens Task 1 (`ease-truth`, cores semânticas), `EASE_TRUTH`/`DUR` de `@/lib/motion`.
- Produces (APIs estáveis — F2/F3 consomem):
  - `Tabs({ items, defaultValue, className }: { items: { id: string; label: string; content: React.ReactNode }[]; defaultValue?: string; className?: string })` — client, ARIA tablist, setas navegam, testid `tab-${id}`.
  - `Dropdown({ trigger, children, align = 'end', triggerLabel }: { trigger: React.ReactNode; children: React.ReactNode; align?: 'start' | 'end'; triggerLabel?: string })` + `DropdownItem({ href, onSelect, danger, children })` — fecha com Esc/clique fora.
  - `Tooltip({ content, children }: { content: string; children: React.ReactNode })` — hover/focus-within, `role="tooltip"` + `aria-describedby`.
  - `paginationRange(page: number, pageCount: number): (number | 'gap')[]` (pura) e `Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (page: number) => string })` — server-friendly (links), `data-testid="pagination"`.
  - `Stepper({ steps, activeIndex, failed }: { steps: readonly { id: string; label: string }[]; activeIndex: number; failed?: boolean })` — `aria-current="step"` no ativo, check nos concluídos, pulso glow no ativo, `data-testid="stepper"`.

- [ ] **Step 1: teste que falha (modelo de paginação)**

```ts
// tests/unit/pagination-model.test.ts
import { describe, expect, it } from 'vitest';

import { paginationRange } from '@/components/ui/pagination-model';

describe('paginationRange', () => {
  it('poucas páginas: lista todas sem gap', () => {
    expect(paginationRange(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('muitas páginas, no meio: gaps dos dois lados', () => {
    expect(paginationRange(10, 20)).toEqual([1, 'gap', 9, 10, 11, 'gap', 20]);
  });

  it('início: gap só à direita', () => {
    expect(paginationRange(2, 20)).toEqual([1, 2, 3, 'gap', 20]);
  });

  it('fim: gap só à esquerda', () => {
    expect(paginationRange(19, 20)).toEqual([1, 'gap', 18, 19, 20]);
  });

  it('1 página: só ela', () => {
    expect(paginationRange(1, 1)).toEqual([1]);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npx vitest run tests/unit/pagination-model.test.ts`
Expected: FAIL — módulo `pagination-model` inexistente.

- [ ] **Step 3: implementar `src/components/ui/pagination-model.ts`**

```ts
/** Janela de páginas: 1 … page-1 page page+1 … pageCount (pura, testável). */
export function paginationRange(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push('gap');
    out.push(p);
    prev = p;
  }
  return out;
}
```

- [ ] **Step 4: rodar e ver passar**

Run: `npx vitest run tests/unit/pagination-model.test.ts`
Expected: PASS (5 testes).

- [ ] **Step 5: implementar `src/components/ui/Pagination.tsx`**

```tsx
import React from 'react';

import { paginationRange } from './pagination-model';

interface PaginationProps {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  className?: string;
}

const linkCls =
  'inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 font-mono text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50';

export function Pagination({ page, pageCount, hrefFor, className = '' }: PaginationProps) {
  if (pageCount <= 1) return null;
  const items = paginationRange(page, pageCount);
  return (
    <nav aria-label="Paginação" data-testid="pagination" className={className}>
      <ul className="flex items-center gap-1">
        <li>
          {page > 1 ? (
            <a href={hrefFor(page - 1)} aria-label="Página anterior" className={linkCls}>
              ←
            </a>
          ) : (
            <span className="inline-flex h-8 items-center px-2 text-sm text-white/20">←</span>
          )}
        </li>
        {items.map((item, i) => (
          <li key={`${item}-${i}`}>
            {item === 'gap' ? (
              <span className="inline-flex h-8 items-center px-1.5 text-sm text-dim">…</span>
            ) : item === page ? (
              <span
                aria-current="page"
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-brand-glow px-2 font-mono text-sm text-brand"
              >
                {item}
              </span>
            ) : (
              <a href={hrefFor(item)} className={linkCls}>
                {item}
              </a>
            )}
          </li>
        ))}
        <li>
          {page < pageCount ? (
            <a href={hrefFor(page + 1)} aria-label="Próxima página" className={linkCls}>
              →
            </a>
          ) : (
            <span className="inline-flex h-8 items-center px-2 text-sm text-white/20">→</span>
          )}
        </li>
      </ul>
    </nav>
  );
}
```

- [ ] **Step 6: implementar `src/components/ui/Tabs.tsx`**

```tsx
'use client';

import React, { useRef, useState } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  className?: string;
}

export function Tabs({ items, defaultValue, className = '' }: TabsProps) {
  const [active, setActive] = useState(defaultValue ?? items[0]?.id);
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const idx = items.findIndex((t) => t.id === active);
    if (idx === -1) return;
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
    else return;
    e.preventDefault();
    setActive(items[next].id);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  }

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            onClick={() => setActive(t.id)}
            data-testid={`tab-${t.id}`}
            className={`-mb-px whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/50 ${
              t.id === active
                ? 'border-brand font-medium text-white'
                : 'border-transparent text-muted hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {items.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`tabpanel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== active}
          className="pt-5"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: implementar `src/components/ui/Dropdown.tsx`**

```tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  triggerLabel?: string;
}

export function Dropdown({ trigger, children, align = 'end', triggerLabel }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute z-40 mt-2 min-w-44 rounded-2xl border border-line bg-bg-surface/95 p-1.5 backdrop-blur-md ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface DropdownItemProps {
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  children: React.ReactNode;
}

export function DropdownItem({ href, onSelect, danger = false, children }: DropdownItemProps) {
  const cls = `block w-full rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/50 ${
    danger ? 'text-danger-fg hover:bg-danger-tint' : 'text-muted hover:bg-white/5 hover:text-white'
  }`;
  if (href) {
    return (
      <a role="menuitem" href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onSelect} className={cls}>
      {children}
    </button>
  );
}
```

- [ ] **Step 8: implementar `src/components/ui/Tooltip.tsx`**

```tsx
'use client';

import React, { useId } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

/** Tooltip CSS (hover/focus-within) com aria-describedby — sem dependências. */
export function Tooltip({ content, children, className = '' }: TooltipProps) {
  const id = useId();
  return (
    <span className={`group relative inline-flex ${className}`} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-bg-elevated/95 px-2.5 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
```

- [ ] **Step 9: implementar `src/components/ui/Stepper.tsx`** (primitivo genérico — a Task 5 pluga o tempo real)

```tsx
'use client';

import React from 'react';
import { motion } from 'framer-motion';

import { EASE_TRUTH } from '@/lib/motion';

export interface StepperStep {
  id: string;
  label: string;
}

interface StepperProps {
  steps: readonly StepperStep[];
  /** Índice do passo ativo; steps.length = todos concluídos. */
  activeIndex: number;
  failed?: boolean;
  className?: string;
}

export function Stepper({ steps, activeIndex, failed = false, className = '' }: StepperProps) {
  return (
    <ol className={`flex flex-col ${className}`} data-testid="stepper">
      {steps.map((step, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex && activeIndex < steps.length;
        const isFailed = failed && active;
        return (
          <li
            key={step.id}
            aria-current={active ? 'step' : undefined}
            className="flex items-stretch gap-3"
          >
            <div className="flex flex-col items-center">
              <span
                className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border font-mono text-[10px] transition-colors duration-300 ${
                  done
                    ? 'border-brand bg-brand text-[#04150a]'
                    : isFailed
                      ? 'border-danger-border bg-danger-tint text-danger-fg'
                      : active
                        ? 'border-brand bg-brand-glow text-brand shadow-glow'
                        : 'border-line bg-bg-elevated text-dim'
                }`}
              >
                {done ? '✓' : isFailed ? '✕' : i + 1}
              </span>
              {i < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`w-px flex-1 ${done ? 'bg-brand/50' : 'bg-line'}`}
                />
              ) : null}
            </div>
            <div className="flex min-h-10 items-start pb-3">
              <span
                className={`text-sm transition-colors duration-300 ${
                  done
                    ? 'text-white/80'
                    : isFailed
                      ? 'text-danger-fg'
                      : active
                        ? 'font-medium text-white'
                        : 'text-dim'
                }`}
              >
                {step.label}
                {active && !isFailed ? (
                  <motion.span
                    aria-hidden="true"
                    className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-brand align-middle"
                    animate={{ opacity: [1, 0.25, 1] }}
                    transition={{ duration: 1.4, ease: EASE_TRUTH, repeat: Infinity }}
                  />
                ) : null}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 10: verificação**

Run: `npm run test && npm run typecheck && npm run lint && npm run build`
Expected: tudo verde.

- [ ] **Step 11: commit**

```bash
git add src/components/ui/Tabs.tsx src/components/ui/Dropdown.tsx src/components/ui/Tooltip.tsx src/components/ui/pagination-model.ts src/components/ui/Pagination.tsx src/components/ui/Stepper.tsx tests/unit/pagination-model.test.ts
git commit -m "feat(f1): primitivos de navegação/dados — Tabs, Dropdown, Tooltip, Pagination (+model), Stepper"
```

---

### Task 4: Charts Recharts themados (LineChart, BarChart, DonutChart, Sparkline)

**Files:**
- Create: `src/components/ui/charts/chart-theme.ts`, `src/components/ui/charts/GlassTooltip.tsx`, `src/components/ui/charts/LineChart.tsx`, `src/components/ui/charts/BarChart.tsx`, `src/components/ui/charts/DonutChart.tsx`, `src/components/ui/charts/Sparkline.tsx`
- Test: `tests/unit/chart-theme.test.ts`

**Interfaces:**
- Consumes: tokens Task 1.
- Produces (APIs estáveis — F2/F3 consomem):
  - `chartTheme` (grid `#ffffff0f`, axis `#a1a1aa`, brand `#07dd2b`, `areaFrom: 'rgba(7,221,43,0.35)'`, `areaTo: 'rgba(7,221,43,0)'`, paleta `series`), `seriesColor(i: number): string`.
  - `type XY = { x: string; y: number }` e `LineChart({ data, height = 260, formatY }: { data: XY[]; height?: number; formatY?: (v: number) => string })` — área com gradiente verde→transparente.
  - `BarChart({ data, height = 260, formatValue }: { data: { label: string; value: number }[]; height?: number; formatValue?: (v: number) => string })`.
  - `DonutChart({ data, height = 240, formatValue }: { data: { label: string; value: number }[]; height?: number; formatValue?: (v: number) => string })` — legenda custom abaixo + resumo `sr-only`.
  - `Sparkline({ data, width = 120, height = 36 }: { data: number[]; width?: number; height?: number })` — sem eixos/tooltip, `aria-hidden`.
  - Todos `'use client'`; tooltip glass compartilhado `GlassTooltip`.

- [ ] **Step 1: instalar recharts**

```bash
npm i recharts@^2.15.0
```

- [ ] **Step 2: teste que falha (tema)**

```ts
// tests/unit/chart-theme.test.ts
import { describe, expect, it } from 'vitest';

import { chartTheme, seriesColor } from '@/components/ui/charts/chart-theme';

describe('chart-theme', () => {
  it('usa o DNA visual Truth (grid vidro, verde neon, eixo AA)', () => {
    expect(chartTheme.grid).toBe('#ffffff0f');
    expect(chartTheme.brand).toBe('#07dd2b');
    expect(chartTheme.axis).toBe('#a1a1aa');
    expect(chartTheme.areaFrom).toBe('rgba(7,221,43,0.35)');
    expect(chartTheme.areaTo).toBe('rgba(7,221,43,0)');
  });

  it('seriesColor começa no verde e dá a volta na paleta', () => {
    expect(seriesColor(0)).toBe('#07dd2b');
    expect(seriesColor(chartTheme.series.length)).toBe('#07dd2b');
  });
});
```

- [ ] **Step 3: rodar e ver falhar**

Run: `npx vitest run tests/unit/chart-theme.test.ts`
Expected: FAIL — módulo `chart-theme` inexistente.

- [ ] **Step 4: implementar `src/components/ui/charts/chart-theme.ts`**

```ts
/** Tema Recharts com o DNA visual Truth — usado por todos os charts. */
export const chartTheme = {
  grid: '#ffffff0f',
  axis: '#a1a1aa',
  brand: '#07dd2b',
  areaFrom: 'rgba(7,221,43,0.35)',
  areaTo: 'rgba(7,221,43,0)',
  series: ['#07dd2b', '#38bdf8', '#a78bfa', '#fbbf24', '#f87171', '#94a3b8'],
} as const;

export function seriesColor(i: number): string {
  return chartTheme.series[i % chartTheme.series.length];
}
```

- [ ] **Step 5: rodar e ver passar**

Run: `npx vitest run tests/unit/chart-theme.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: implementar `src/components/ui/charts/GlassTooltip.tsx`**

```tsx
'use client';

import React from 'react';

export interface GlassTooltipPayloadItem {
  name?: string | number;
  value?: string | number;
  color?: string;
}

interface GlassTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: GlassTooltipPayloadItem[];
  formatValue?: (v: number) => string;
}

/** Tooltip glass compartilhado (content custom do Recharts). */
export function GlassTooltip({ active, label, payload, formatValue }: GlassTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-bg-surface/90 px-3 py-2 backdrop-blur-md">
      {label !== undefined && label !== '' ? (
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted">{label}</p>
      ) : null}
      {payload.map((item, i) => {
        const raw = typeof item.value === 'number' ? item.value : Number(item.value ?? 0);
        return (
          <p key={i} className="flex items-center gap-2 font-mono text-sm text-white">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: item.color ?? '#07dd2b' }}
            />
            {item.name !== undefined && payload.length > 1 ? (
              <span className="text-muted">{item.name}:</span>
            ) : null}
            {formatValue ? formatValue(raw) : raw}
          </p>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: implementar `src/components/ui/charts/LineChart.tsx`**

```tsx
'use client';

import React, { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';

export type XY = { x: string; y: number };

interface LineChartProps {
  data: XY[];
  height?: number;
  formatY?: (v: number) => string;
}

/** Linha/área com gradiente verde neon → transparente (evolução temporal). */
export function LineChart({ data, height = 260, formatY }: LineChartProps) {
  const gradId = useId().replace(/:/g, '');
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.areaFrom} />
              <stop offset="100%" stopColor={chartTheme.areaTo} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="x"
            stroke={chartTheme.grid}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
          />
          <YAxis
            width={70}
            stroke={chartTheme.grid}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            tickFormatter={(v: number) => (formatY ? formatY(v) : String(v))}
          />
          <Tooltip
            cursor={{ stroke: chartTheme.brand, strokeOpacity: 0.3 }}
            content={<GlassTooltip formatValue={formatY} />}
          />
          <Area
            type="monotone"
            dataKey="y"
            stroke={chartTheme.brand}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, fill: chartTheme.brand, stroke: '#04150a' }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 8: implementar `src/components/ui/charts/BarChart.tsx`**

```tsx
'use client';

import React from 'react';
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
}

export function BarChart({ data, height = 260, formatValue }: BarChartProps) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={chartTheme.grid}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
          />
          <YAxis
            width={70}
            stroke={chartTheme.grid}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            tickFormatter={(v: number) => (formatValue ? formatValue(v) : String(v))}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            content={<GlassTooltip formatValue={formatValue} />}
          />
          <Bar dataKey="value" fill={chartTheme.brand} radius={[6, 6, 0, 0]} maxBarSize={40} />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 9: implementar `src/components/ui/charts/DonutChart.tsx`**

```tsx
'use client';

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { seriesColor } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';

interface DonutChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
}

export function DonutChart({ data, height = 240, formatValue }: DonutChartProps) {
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <PieChart>
            <Tooltip content={<GlassTooltip formatValue={formatValue} />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={3}
              stroke="#0a0c10"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={seriesColor(i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: seriesColor(i) }}
            />
            {d.label}
          </li>
        ))}
      </ul>
      <p className="sr-only">
        {data.map((d) => `${d.label}: ${formatValue ? formatValue(d.value) : d.value}`).join('; ')}
      </p>
    </div>
  );
}
```

- [ ] **Step 10: implementar `src/components/ui/charts/Sparkline.tsx`**

```tsx
'use client';

import React, { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

import { chartTheme } from './chart-theme';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
}

/** Mini-tendência sem eixos/tooltip — decorativa (aria-hidden). */
export function Sparkline({ data, width = 120, height = 36 }: SparklineProps) {
  const gradId = useId().replace(/:/g, '');
  const points = data.map((y, i) => ({ i, y }));
  return (
    <div aria-hidden="true" style={{ width, height }}>
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartTheme.areaFrom} />
              <stop offset="100%" stopColor={chartTheme.areaTo} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="y"
            stroke={chartTheme.brand}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 11: verificação**

Run: `npm run test && npm run typecheck && npm run lint && npm run build`
Expected: tudo verde (consumo visual nas Tasks 6–7; QA de screenshot acontece lá).

- [ ] **Step 12: commit**

```bash
git add src/components/ui/charts tests/unit/chart-theme.test.ts package.json package-lock.json
git commit -m "feat(f1): charts Recharts themados — LineChart gradiente, BarChart, DonutChart, Sparkline, tooltip glass"
```

---
### Task 5: Stepper de geração em TEMPO REAL (polling do contrato F0)

**Files:**
- Create: `src/modules/reports/stepper-model.ts`, `src/app/(client)/dashboard/use-report-status.ts`, `src/app/(client)/dashboard/generation-progress.tsx`
- Modify: `src/app/(client)/dashboard/generate-report.tsx`
- Test: `tests/unit/stepper-model.test.ts`

**Interfaces:**
- Consumes: **contrato F0** `GET /api/reports/[id]/status` → `{ status: ReportStatus; etapa: EtapaPipeline | null }`; `ReportStatus` de `@/modules/reports/report.types`; `Stepper` (Task 3); `Alert` (Task 2); `GenerateState = { error?: string; reportId?: string }` de `@/actions/reports.actions` (pós-F0 o action retorna `{reportId}` imediato com report `queued` — re-validar).
- Produces:
  - `type EtapaPipeline = 'coletando_vendas' | 'analisando_mercado' | 'analisando_ia' | 'finalizando'`.
  - `ETAPAS_GERACAO: readonly { id: string; label: string }[]` — labels EXATOS: `Conectando ao Bling`, `Coletando pedidos`, `Varrendo o mercado`, `IA analisando`, `Finalizando`.
  - `geracaoView(status: ReportStatus, etapa: EtapaPipeline | null): { activeIndex: number; failed: boolean; done: boolean }`.
  - `useReportStatus(reportId: string | null, intervalMs = 3000): { status: ReportStatus; etapa: EtapaPipeline | null } | null` — para de pollar em `done`/`failed`.
  - `GenerationProgress({ reportId }: { reportId: string })` — `data-testid="generation-progress"`, região `aria-live="polite"`, chama `router.refresh()` ao terminar.

- [ ] **Step 1: teste que falha (mapeamento status/etapa → passo)**

```ts
// tests/unit/stepper-model.test.ts
import { describe, expect, it } from 'vitest';

import { ETAPAS_GERACAO, geracaoView } from '@/modules/reports/stepper-model';

describe('stepper-model', () => {
  it('tem as 5 etapas na ordem da experiência', () => {
    expect(ETAPAS_GERACAO.map((e) => e.label)).toEqual([
      'Conectando ao Bling',
      'Coletando pedidos',
      'Varrendo o mercado',
      'IA analisando',
      'Finalizando',
    ]);
  });

  it('queued (sem etapa) = conectando', () => {
    expect(geracaoView('queued', null)).toEqual({ activeIndex: 0, failed: false, done: false });
  });

  it('running mapeia cada etapa do pipeline para o passo certo', () => {
    expect(geracaoView('running', 'coletando_vendas').activeIndex).toBe(1);
    expect(geracaoView('running', 'analisando_mercado').activeIndex).toBe(2);
    expect(geracaoView('running', 'analisando_ia').activeIndex).toBe(3);
    expect(geracaoView('running', 'finalizando').activeIndex).toBe(4);
  });

  it('running sem etapa ainda = conectando', () => {
    expect(geracaoView('running', null).activeIndex).toBe(0);
  });

  it('done = tudo concluído', () => {
    expect(geracaoView('done', 'finalizando')).toEqual({
      activeIndex: ETAPAS_GERACAO.length,
      failed: false,
      done: true,
    });
  });

  it('failed marca o passo corrente como falho', () => {
    expect(geracaoView('failed', 'analisando_ia')).toEqual({
      activeIndex: 3,
      failed: true,
      done: false,
    });
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npx vitest run tests/unit/stepper-model.test.ts`
Expected: FAIL — módulo `stepper-model` inexistente.

- [ ] **Step 3: implementar `src/modules/reports/stepper-model.ts`**

```ts
import type { ReportStatus } from './report.types';

/** Contrato F0: coluna reports.etapa atualizada pelo orquestrador entre steps. */
export type EtapaPipeline =
  | 'coletando_vendas'
  | 'analisando_mercado'
  | 'analisando_ia'
  | 'finalizando';

/** Passos exibidos no stepper cinematográfico (copy travada). */
export const ETAPAS_GERACAO = [
  { id: 'conectando', label: 'Conectando ao Bling' },
  { id: 'coletando_vendas', label: 'Coletando pedidos' },
  { id: 'analisando_mercado', label: 'Varrendo o mercado' },
  { id: 'analisando_ia', label: 'IA analisando' },
  { id: 'finalizando', label: 'Finalizando' },
] as const;

export type GeracaoView = {
  activeIndex: number;
  failed: boolean;
  done: boolean;
};

/** Converte {status, etapa} do endpoint F0 no estado visual do stepper (pura). */
export function geracaoView(status: ReportStatus, etapa: EtapaPipeline | null): GeracaoView {
  if (status === 'done') {
    return { activeIndex: ETAPAS_GERACAO.length, failed: false, done: true };
  }
  const idx = etapa ? ETAPAS_GERACAO.findIndex((e) => e.id === etapa) : 0;
  const activeIndex = idx === -1 ? 0 : idx;
  if (status === 'failed') {
    return { activeIndex, failed: true, done: false };
  }
  return { activeIndex, failed: false, done: false };
}
```

- [ ] **Step 4: rodar e ver passar**

Run: `npx vitest run tests/unit/stepper-model.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: implementar o hook de polling `src/app/(client)/dashboard/use-report-status.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';

import type { ReportStatus } from '@/modules/reports/report.types';
import type { EtapaPipeline } from '@/modules/reports/stepper-model';

export type ReportStatusPayload = {
  status: ReportStatus;
  etapa: EtapaPipeline | null;
};

/**
 * Polling de 3 s do contrato F0 GET /api/reports/[id]/status.
 * Para sozinho quando o status é terminal (done/failed).
 */
export function useReportStatus(
  reportId: string | null,
  intervalMs = 3000,
): ReportStatusPayload | null {
  const [payload, setPayload] = useState<ReportStatusPayload | null>(null);

  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      try {
        const res = await fetch(`/api/reports/${reportId}/status`, { cache: 'no-store' });
        if (res.ok) {
          const data = (await res.json()) as ReportStatusPayload;
          if (cancelled) return;
          setPayload(data);
          if (data.status === 'done' || data.status === 'failed') return;
        }
      } catch {
        // erro de rede transitório: tenta de novo no próximo tick
      }
      if (!cancelled) timer = setTimeout(tick, intervalMs);
    }

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reportId, intervalMs]);

  return payload;
}
```

- [ ] **Step 6: implementar `src/app/(client)/dashboard/generation-progress.tsx`**

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { ETAPAS_GERACAO, geracaoView } from '@/modules/reports/stepper-model';
import { Stepper } from '@/components/ui/Stepper';
import { Alert } from '@/components/ui/Alert';

import { useReportStatus } from './use-report-status';

/** Momento "wow": stepper cinematográfico alimentado pelo pipeline em background. */
export function GenerationProgress({ reportId }: { reportId: string }) {
  const payload = useReportStatus(reportId);
  const router = useRouter();
  const view = geracaoView(payload?.status ?? 'queued', payload?.etapa ?? null);

  // Ao terminar, refresca os RSC (histórico/último relatório aparecem sem F5)
  useEffect(() => {
    if (view.done || view.failed) router.refresh();
  }, [view.done, view.failed, router]);

  return (
    <div data-testid="generation-progress" aria-live="polite" className="mt-4">
      <Stepper steps={ETAPAS_GERACAO} activeIndex={view.activeIndex} failed={view.failed} />
      {view.done ? (
        <p className="mt-2 text-sm text-brand">
          Relatório pronto.{' '}
          <a
            href={`/dashboard/relatorios/${reportId}`}
            className="underline underline-offset-2 hover:text-white"
          >
            Ver relatório →
          </a>
        </p>
      ) : null}
      {view.failed ? (
        <Alert variant="danger" className="mt-2">
          A geração não foi concluída desta vez. Tente novamente — se persistir, fale com o
          suporte.
        </Alert>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 7: integrar em `generate-report.tsx`** — substituir APENAS o bloco de sucesso (o `SubmitButton` com `data-testid="generate-report-button"`, o `motivo` e o mapa `ERROR_LABELS` ficam intactos; adicionar `role="alert"` no erro):

```tsx
// imports adicionais no topo:
import { GenerationProgress } from './generation-progress';

// no JSX do return, trocar:
//   {state.error ? (<p className="mt-3 text-sm text-red-400">…</p>) : null}
//   {state.reportId && !state.error ? (<p className="mt-3 text-sm text-brand">Relatório gerado.</p>) : null}
// por:
      {state.error ? (
        <p role="alert" className="mt-3 text-sm text-danger-fg">
          {errorLabel(state.error)}
        </p>
      ) : null}
      {state.reportId && !state.error ? (
        <GenerationProgress key={state.reportId} reportId={state.reportId} />
      ) : null}
```

(`key={state.reportId}` remonta o stepper a cada nova geração. Pós-F0 o action responde rápido com o report `queued` — o `pending` do submit dura pouco e o stepper assume.)

- [ ] **Step 8: verificação + E2E**

Run: `npm run test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: tudo verde — o teste de gating (`generate-report-button` desabilitado + `Conecte o Bling em Conexões.`) não muda.

- [ ] **Step 9: QA visual (controlador)** — subir o dev server QA (porta 3200, branch `test`), logar com um cliente ativo com Bling seedado, disparar geração e capturar screenshots do stepper avançando (aria-live confere no snapshot de a11y do chrome-devtools).

- [ ] **Step 10: commit**

```bash
git add src/modules/reports/stepper-model.ts "src/app/(client)/dashboard/use-report-status.ts" "src/app/(client)/dashboard/generation-progress.tsx" "src/app/(client)/dashboard/generate-report.tsx" tests/unit/stepper-model.test.ts
git commit -m "feat(f1): stepper de geração em tempo real — polling 3s do status F0, aria-live, refresh ao concluir"
```

---

### Task 6: Dashboard bento grid — stats com count-up + sparkline, charts, marquee de insights

**Files:**
- Create: `src/modules/reports/dashboard-model.ts`, `src/app/(client)/dashboard/stat-cards.tsx`, `src/app/(client)/dashboard/insights-marquee.tsx`, `src/app/(client)/dashboard/dashboard-charts.tsx`
- Modify: `src/modules/reports/report.repository.ts` (novo `getLatestDoneReport`), `src/app/(client)/dashboard/page.tsx`
- Test: `tests/unit/dashboard-model.test.ts`, `tests/integration/report-repository-f1.test.ts`

**Interfaces:**
- Consumes: `Metricas`/`AnaliseIa` de `@/modules/pipeline/contracts`; `LineChart`/`DonutChart`/`Sparkline` (Task 4); `useCountUp`, `fadeLift`, `staggerContainer` (Task 1); `formatBRL` de `@/lib/format`; `rowToDetail` interno do repository.
- Produces:
  - `getLatestDoneReport(orgId: string): Promise<ReportDetail | null>` — último report `done` (com jsonb) para alimentar o bento.
  - `dashboardStats(m: Metricas): { faturamento: number; pedidos: number; ticketMedio: number; evolucaoTotais: number[] }`.
  - `insightsFromAnalise(a: AnaliseIa | null): string[]` — máx. 8, prefixos `Gargalo:`/`Sugestão:`/`Ideia:`.
  - `StatCards({ items }: { items: { label: string; value: number; format: 'brl' | 'int'; spark?: number[] }[] })`.
  - `InsightsMarquee({ insights }: { insights: string[] })` — `data-testid="insights-marquee"`.
  - `DashboardCharts({ evolucao, canais }: { evolucao: { x: string; y: number }[]; canais: { label: string; value: number }[] })`.
  - Card "Gerar relatório" ganha `id="gerar-relatorio"` (âncora do ⌘K — Task 12).

- [ ] **Step 1: teste que falha (model puro)**

```ts
// tests/unit/dashboard-model.test.ts
import { describe, expect, it } from 'vitest';

import { dashboardStats, insightsFromAnalise } from '@/modules/reports/dashboard-model';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

const METRICAS: Metricas = {
  vendasPorCanal: [
    { canal: 'Mercado Livre', total: 1000, pedidos: 10 },
    { canal: 'Shopee', total: 500, pedidos: 8 },
  ],
  evolucao: [
    { data: '2026-06-01', total: 700 },
    { data: '2026-06-15', total: 800 },
  ],
  ticketMedio: 83.33,
  topProdutos: [],
  posicaoPreco: [],
  benchmarkParcial: false,
};

const ANALISE: AnaliseIa = {
  resumoExecutivo: 'ok',
  gargalos: ['Frete caro'],
  sugestoesMelhoria: ['Negociar tarifa'],
  ideiasVenda: ['Kit promocional'],
  recomendacoesPreco: [],
};

describe('dashboard-model', () => {
  it('dashboardStats agrega faturamento, pedidos e série da evolução', () => {
    expect(dashboardStats(METRICAS)).toEqual({
      faturamento: 1500,
      pedidos: 18,
      ticketMedio: 83.33,
      evolucaoTotais: [700, 800],
    });
  });

  it('insightsFromAnalise prefixa por origem e limita a 8', () => {
    expect(insightsFromAnalise(ANALISE)).toEqual([
      'Gargalo: Frete caro',
      'Sugestão: Negociar tarifa',
      'Ideia: Kit promocional',
    ]);
    const cheia: AnaliseIa = {
      ...ANALISE,
      gargalos: Array.from({ length: 10 }, (_, i) => `g${i}`),
    };
    expect(insightsFromAnalise(cheia)).toHaveLength(8);
  });

  it('sem análise = sem insights', () => {
    expect(insightsFromAnalise(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npx vitest run tests/unit/dashboard-model.test.ts`
Expected: FAIL — módulo `dashboard-model` inexistente.

- [ ] **Step 3: implementar `src/modules/reports/dashboard-model.ts`**

```ts
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

export type DashboardStats = {
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  evolucaoTotais: number[];
};

/** Agregados do bento a partir das métricas do último relatório done (pura). */
export function dashboardStats(m: Metricas): DashboardStats {
  return {
    faturamento: m.vendasPorCanal.reduce((s, v) => s + v.total, 0),
    pedidos: m.vendasPorCanal.reduce((s, v) => s + v.pedidos, 0),
    ticketMedio: m.ticketMedio,
    evolucaoTotais: m.evolucao.map((e) => e.total),
  };
}

const MAX_INSIGHTS = 8;

/** Frases curtas para o marquee, na ordem gargalo → sugestão → ideia (pura). */
export function insightsFromAnalise(a: AnaliseIa | null): string[] {
  if (!a) return [];
  return [
    ...a.gargalos.map((g) => `Gargalo: ${g}`),
    ...a.sugestoesMelhoria.map((s) => `Sugestão: ${s}`),
    ...a.ideiasVenda.map((i) => `Ideia: ${i}`),
  ].slice(0, MAX_INSIGHTS);
}
```

- [ ] **Step 4: rodar e ver passar**

Run: `npx vitest run tests/unit/dashboard-model.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: teste de integração que falha (`getLatestDoneReport`)**

```ts
// tests/integration/report-repository-f1.test.ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { organizations, reports } from '@/db/schema';
import { getLatestDoneReport } from '@/modules/reports/report.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-f1-dash-';
const RUN = Date.now();

describe.skipIf(!url)('report.repository — getLatestDoneReport (F1)', () => {
  let orgId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org.id;

    const base = {
      org_id: orgId,
      periodo_inicio: new Date('2026-06-01'),
      periodo_fim: new Date('2026-06-30'),
    };
    // done antigo, failed recente, done recente — deve voltar o done recente
    await tdb.insert(reports).values({
      ...base,
      status: 'done',
      metricas: { marcador: 'antigo' },
      created_at: new Date('2026-06-10'),
    });
    await tdb.insert(reports).values({
      ...base,
      status: 'failed',
      erro: 'x',
      created_at: new Date('2026-06-20'),
    });
    await tdb.insert(reports).values({
      ...base,
      status: 'done',
      metricas: { marcador: 'recente' },
      created_at: new Date('2026-06-15'),
    });
  });

  afterAll(async () => {
    await tdb.delete(reports).where(eq(reports.org_id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await sql.end();
  });

  it('retorna o done mais recente, ignorando failed', async () => {
    const rel = await getLatestDoneReport(orgId);
    expect(rel?.status).toBe('done');
    expect(rel?.metricas).toMatchObject({ marcador: 'recente' });
  });

  it('org sem done retorna null', async () => {
    const [vazia] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}vazia-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    expect(await getLatestDoneReport(vazia.id)).toBeNull();
    await tdb.delete(organizations).where(eq(organizations.id, vazia.id));
  });
});
```

- [ ] **Step 6: rodar e ver falhar**

Run: `npx vitest run tests/integration/report-repository-f1.test.ts`
Expected: FAIL — `getLatestDoneReport` não exportado.

- [ ] **Step 7: implementar `getLatestDoneReport` em `src/modules/reports/report.repository.ts`**

```ts
export async function getLatestDoneReport(orgId: string): Promise<ReportDetail | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done')))
    .orderBy(desc(reports.created_at))
    .limit(1);
  return row ? rowToDetail(row) : null;
}
```

- [ ] **Step 8: rodar e ver passar**

Run: `npx vitest run tests/integration/report-repository-f1.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 9: implementar `src/app/(client)/dashboard/stat-cards.tsx`**

```tsx
'use client';

import React from 'react';
import { motion } from 'framer-motion';

import { fadeLift, staggerContainer, useCountUp } from '@/lib/motion';
import { formatBRL } from '@/lib/format';
import { Sparkline } from '@/components/ui/charts/Sparkline';

export type StatItem = {
  label: string;
  value: number;
  format: 'brl' | 'int';
  spark?: number[];
};

function StatValue({ value, format }: { value: number; format: 'brl' | 'int' }) {
  const v = useCountUp(value);
  return (
    <span className="font-mono text-2xl font-bold text-white">
      {format === 'brl' ? formatBRL(v) : String(Math.round(v))}
    </span>
  );
}

/** Linha de stats do bento: count-up em Space Mono + sparkline. */
export function StatCards({ items }: { items: StatItem[] }) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {items.map((item) => (
        <motion.div
          key={item.label}
          variants={fadeLift}
          className="flex flex-col gap-1 rounded-2xl border border-line bg-bg-surface p-5"
        >
          <span className="text-xs uppercase tracking-wide text-muted">{item.label}</span>
          <div className="flex items-end justify-between gap-2">
            <StatValue value={item.value} format={item.format} />
            {item.spark && item.spark.length > 1 ? <Sparkline data={item.spark} /> : null}
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}
```

- [ ] **Step 10: implementar `src/app/(client)/dashboard/insights-marquee.tsx`** (CSS puro — eco do marquee do site)

```tsx
import React from 'react';

/** Marquee infinito de insights (lista duplicada + translateX(-50%)). */
export function InsightsMarquee({ insights }: { insights: string[] }) {
  if (insights.length === 0) return null;
  const loop = [...insights, ...insights];
  return (
    <div
      data-testid="insights-marquee"
      aria-label="Últimos insights da análise"
      className="relative overflow-hidden rounded-full border border-line bg-glass py-2"
    >
      <div className="flex w-max animate-marquee gap-8 pr-8 motion-reduce:animate-none">
        {loop.map((texto, i) => (
          <span
            key={i}
            aria-hidden={i >= insights.length}
            className="flex items-center gap-2 whitespace-nowrap text-xs text-muted"
          >
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-brand" />
            {texto}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 11: implementar `src/app/(client)/dashboard/dashboard-charts.tsx`**

```tsx
'use client';

import React from 'react';
import { motion } from 'framer-motion';

import { fadeLift } from '@/lib/motion';
import { formatBRL } from '@/lib/format';
import { LineChart, type XY } from '@/components/ui/charts/LineChart';
import { DonutChart } from '@/components/ui/charts/DonutChart';

interface DashboardChartsProps {
  evolucao: XY[];
  canais: { label: string; value: number }[];
}

/** Bento: evolução (linha com gradiente) + canais (donut). */
export function DashboardCharts({ evolucao, canais }: DashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <motion.div
        variants={fadeLift}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-line bg-bg-surface p-5 lg:col-span-2"
      >
        <h2 className="mb-3 font-heading text-base font-semibold text-white">Evolução de vendas</h2>
        <LineChart data={evolucao} formatY={formatBRL} />
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

- [ ] **Step 12: reestruturar `src/app/(client)/dashboard/page.tsx`** — bento grid mantendo TODOS os testids/textos. Novo arquivo completo:

```tsx
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import {
  getLatestDoneReport,
  getLatestReport,
  listReports,
} from '@/modules/reports/report.repository';
import { STATUS_LABEL, reportStatusVariant } from '@/modules/reports/report.types';
import { dashboardStats, insightsFromAnalise } from '@/modules/reports/dashboard-model';
import { getConnection } from '@/modules/connections/connection.repository';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { podeGerar } from '@/modules/pipeline/plan-lock';
import { formatData, formatPeriodo } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { GenerateReport } from './generate-report';
import { StatCards } from './stat-cards';
import { InsightsMarquee } from './insights-marquee';
import { DashboardCharts } from './dashboard-charts';

export default async function DashboardPage() {
  const access = await requireActiveOrg();

  const [latest, reports, conn, org, latestDone] = await Promise.all([
    getLatestReport(access.orgId),
    listReports(access.orgId),
    getConnection(access.orgId),
    getOrganizationById(access.orgId),
    getLatestDoneReport(access.orgId),
  ]);

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

  const stats = latestDone?.metricas ? dashboardStats(latestDone.metricas) : null;
  const insights = insightsFromAnalise(latestDone?.analiseIa ?? null);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Dashboard</h1>

      {/* Marquee de insights do último relatório */}
      <InsightsMarquee insights={insights} />

      {/* Stats do último relatório done */}
      {stats ? (
        <StatCards
          items={[
            { label: 'Faturamento do período', value: stats.faturamento, format: 'brl', spark: stats.evolucaoTotais },
            { label: 'Pedidos', value: stats.pedidos, format: 'int' },
            { label: 'Ticket médio', value: stats.ticketMedio, format: 'brl' },
            { label: 'Relatórios gerados', value: reports.length, format: 'int' },
          ]}
        />
      ) : null}

      {/* Charts do último relatório done */}
      {latestDone?.metricas ? (
        <DashboardCharts
          evolucao={latestDone.metricas.evolucao.map((e) => ({ x: e.data, y: e.total }))}
          canais={latestDone.metricas.vendasPorCanal.map((v) => ({ label: v.canal, value: v.total }))}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Gerar relatório (âncora do ⌘K) */}
        <Card id="gerar-relatorio">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Gerar relatório</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateReport disabled={!canGenerate} motivo={motivo} />
          </CardContent>
        </Card>

        {/* Último relatório */}
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

      {/* Histórico */}
      <section data-testid="reports-list">
        <h2 className="mb-3 font-heading text-base font-semibold text-white">Histórico</h2>
        {reports.length > 0 ? (
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
                {reports.map((r) => (
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
          <p className="text-muted">Nenhum relatório ainda.</p>
        )}
      </section>
    </main>
  );
}
```

(Nota: o empty state com CTA do histórico entra na Task 9 junto dos demais empty states. Pós-F0, `listReports` retorna só colunas de summary com `limit 50` — conferir a assinatura antes de usar.)

- [ ] **Step 13: verificação + E2E**

Run: `npm run test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: tudo verde — dashboard.spec continua achando `latest-report`, `ver-relatorio`, `generate-report-button` e o motivo.

- [ ] **Step 14: QA visual (controlador)** — screenshots do dashboard com relatório done seedado (stats + count-up + line + donut + marquee) em 1280×800 e 375×812; conferir `motion-reduce` emulando `prefers-reduced-motion` no chrome-devtools.

- [ ] **Step 15: commit**

```bash
git add src/modules/reports/dashboard-model.ts src/modules/reports/report.repository.ts "src/app/(client)/dashboard/stat-cards.tsx" "src/app/(client)/dashboard/insights-marquee.tsx" "src/app/(client)/dashboard/dashboard-charts.tsx" "src/app/(client)/dashboard/page.tsx" tests/unit/dashboard-model.test.ts tests/integration/report-repository-f1.test.ts
git commit -m "feat(f1): dashboard bento — stats com count-up e sparkline, evolução com gradiente, donut de canais, marquee de insights"
```

---
### Task 7: Relatório como experiência editorial + erro amigável (sem expor `rel.erro` cru)

**Files:**
- Create: `src/modules/reports/report-errors.ts`, `src/modules/reports/report-view-model.ts`, `src/app/(client)/dashboard/relatorios/[id]/reveal.tsx`, `src/app/(client)/dashboard/relatorios/[id]/toc.tsx`
- Modify: `src/app/(client)/dashboard/relatorios/[id]/page.tsx`
- Test: `tests/unit/report-errors.test.ts`, `tests/unit/report-view-model.test.ts`

**Interfaces:**
- Consumes: `ReportDetail`/`STATUS_LABEL`/`reportStatusVariant`; `AnaliseIa` de `@/modules/pipeline/contracts`; `fadeLift` (Task 1); `LineChart` (Task 4); `Badge`/`Card`/`Stat`/`Table` existentes.
- Produces:
  - `friendlyReportError(erro: string | null): string` — mapeia códigos p/ pt-BR; NUNCA ecoa código desconhecido.
  - `type Prioridade = 'alta' | 'media' | 'baixa'`; `PRIORIDADE_LABEL: Record<Prioridade, string>`; `recomendacaoCards(a: AnaliseIa): { texto: string; prioridade: Prioridade; origem: 'gargalo' | 'sugestao' | 'ideia' }[]`.
  - `Reveal({ children, className, id, 'data-testid' })` — `motion.section` com `whileInView` + `fadeLift` (scroll-reveal).
  - `Toc({ items }: { items: { href: string; label: string }[] })` — TOC lateral sticky (desktop), `aria-label="Sumário do relatório"`.

- [ ] **Step 1: teste que falha (erros amigáveis)**

```ts
// tests/unit/report-errors.test.ts
import { describe, expect, it } from 'vitest';

import { friendlyReportError } from '@/modules/reports/report-errors';

describe('friendlyReportError', () => {
  it('mapeia códigos conhecidos para pt-BR', () => {
    expect(friendlyReportError('timeout_watchdog')).toContain('demorou mais que o esperado');
    expect(friendlyReportError('analise_ia_invalida')).toContain('não conseguiu concluir a análise');
    expect(friendlyReportError('sem_conexao_bling')).toContain('Bling');
    expect(friendlyReportError('refresh_bling_falhou')).toContain('Reconecte');
  });

  it('NUNCA ecoa código desconhecido (stack/objeto técnico não vaza)', () => {
    const cru = 'TypeError: fetch failed at orchestrator.ts:42';
    const msg = friendlyReportError(cru);
    expect(msg).not.toContain('TypeError');
    expect(msg).not.toContain('orchestrator');
    expect(msg).toContain('Não foi possível concluir');
  });

  it('null usa a mensagem genérica', () => {
    expect(friendlyReportError(null)).toContain('Não foi possível concluir');
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npx vitest run tests/unit/report-errors.test.ts`
Expected: FAIL — módulo `report-errors` inexistente.

- [ ] **Step 3: implementar `src/modules/reports/report-errors.ts`**

```ts
/**
 * Tradução de códigos de erro do pipeline para copy amigável pt-BR.
 * O valor cru de reports.erro é técnico (código ou stack) e NUNCA
 * deve ser exibido ao cliente — só o admin vê o cru (Task 10).
 */
const ERRO_LABEL: Record<string, string> = {
  timeout_watchdog:
    'A geração demorou mais que o esperado e foi interrompida. Tente novamente — se persistir, fale com o suporte.',
  analise_ia_invalida:
    'Nossa IA não conseguiu concluir a análise desta vez. Gere o relatório novamente.',
  sem_conexao_bling:
    'A conexão com o Bling não estava disponível. Reconecte em Conexões e tente de novo.',
  refresh_bling_falhou:
    'A autorização do Bling expirou. Reconecte em Conexões e gere o relatório novamente.',
  bling_sem_pedidos: 'Não encontramos pedidos no período analisado.',
  relatorio_em_andamento: 'Já existe um relatório em geração para a sua conta. Aguarde ele terminar.',
};

const ERRO_GENERICO =
  'Não foi possível concluir este relatório. Tente gerar novamente — se persistir, fale com o suporte.';

export function friendlyReportError(erro: string | null): string {
  if (!erro) return ERRO_GENERICO;
  return ERRO_LABEL[erro] ?? ERRO_GENERICO;
}
```

(Re-validar os códigos contra o `master` pós-F0 — a F0 introduz `timeout_watchdog`; adicionar ao mapa qualquer código novo encontrado em `orchestrator.ts`/`watchdog`.)

- [ ] **Step 4: rodar e ver passar**

Run: `npx vitest run tests/unit/report-errors.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: teste que falha (cards de recomendação com prioridade)**

```ts
// tests/unit/report-view-model.test.ts
import { describe, expect, it } from 'vitest';

import { PRIORIDADE_LABEL, recomendacaoCards } from '@/modules/reports/report-view-model';
import type { AnaliseIa } from '@/modules/pipeline/contracts';

const ANALISE: AnaliseIa = {
  resumoExecutivo: 'ok',
  gargalos: ['Frete caro'],
  sugestoesMelhoria: ['Negociar tarifa'],
  ideiasVenda: ['Kit promocional'],
  recomendacoesPreco: [],
};

describe('report-view-model', () => {
  it('deriva prioridade por origem: gargalo=alta, sugestão=média, ideia=baixa', () => {
    expect(recomendacaoCards(ANALISE)).toEqual([
      { texto: 'Frete caro', prioridade: 'alta', origem: 'gargalo' },
      { texto: 'Negociar tarifa', prioridade: 'media', origem: 'sugestao' },
      { texto: 'Kit promocional', prioridade: 'baixa', origem: 'ideia' },
    ]);
  });

  it('labels pt-BR das prioridades', () => {
    expect(PRIORIDADE_LABEL).toEqual({ alta: 'Alta', media: 'Média', baixa: 'Baixa' });
  });
});
```

- [ ] **Step 6: rodar e ver falhar**

Run: `npx vitest run tests/unit/report-view-model.test.ts`
Expected: FAIL — módulo `report-view-model` inexistente.

- [ ] **Step 7: implementar `src/modules/reports/report-view-model.ts`**

```ts
import type { AnaliseIa } from '@/modules/pipeline/contracts';

export type Prioridade = 'alta' | 'media' | 'baixa';

export const PRIORIDADE_LABEL: Record<Prioridade, string> = {
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export type RecomendacaoCard = {
  texto: string;
  prioridade: Prioridade;
  origem: 'gargalo' | 'sugestao' | 'ideia';
};

/**
 * Prioridade derivada da origem (o schema da IA não tem campo prioridade —
 * gargalo é o que trava vendas hoje, sugestão melhora, ideia expande).
 */
export function recomendacaoCards(a: AnaliseIa): RecomendacaoCard[] {
  return [
    ...a.gargalos.map<RecomendacaoCard>((texto) => ({ texto, prioridade: 'alta', origem: 'gargalo' })),
    ...a.sugestoesMelhoria.map<RecomendacaoCard>((texto) => ({ texto, prioridade: 'media', origem: 'sugestao' })),
    ...a.ideiasVenda.map<RecomendacaoCard>((texto) => ({ texto, prioridade: 'baixa', origem: 'ideia' })),
  ];
}
```

- [ ] **Step 8: rodar e ver passar**

Run: `npx vitest run tests/unit/report-view-model.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 9: implementar `reveal.tsx` e `toc.tsx`**

```tsx
// src/app/(client)/dashboard/relatorios/[id]/reveal.tsx
'use client';

import React from 'react';
import { motion } from 'framer-motion';

import { fadeLift } from '@/lib/motion';

interface RevealProps {
  children: React.ReactNode;
  className?: string;
  id?: string;
  'data-testid'?: string;
}

/** Seção com scroll-reveal (fade+lift ao entrar na viewport, uma vez). */
export function Reveal({ children, className = '', id, ...rest }: RevealProps) {
  return (
    <motion.section
      id={id}
      variants={fadeLift}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      className={className}
      {...rest}
    >
      {children}
    </motion.section>
  );
}
```

```tsx
// src/app/(client)/dashboard/relatorios/[id]/toc.tsx
import React from 'react';

interface TocProps {
  items: { href: string; label: string }[];
}

/** Sumário lateral fixo (desktop) — âncoras das seções do relatório. */
export function Toc({ items }: TocProps) {
  return (
    <nav
      aria-label="Sumário do relatório"
      className="sticky top-24 hidden h-fit w-44 flex-shrink-0 xl:block"
    >
      <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-dim">Neste relatório</p>
      <ul className="flex flex-col gap-1 border-l border-line">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="-ml-px block border-l border-transparent px-3 py-1 text-sm text-muted outline-none transition-colors hover:border-brand hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 10: reestruturar `src/app/(client)/dashboard/relatorios/[id]/page.tsx`** — hero + TOC + scroll-reveal + chart de evolução + cards de recomendação, preservando `report-status`, `metricas`, `resumo-executivo`, `report-erro` e o texto `Relatório em processamento.`. Estrutura (as tabelas internas existentes de vendas/canal, top produtos, posição de preço e recomendações de preço são movidas SEM alteração de conteúdo):

```tsx
import { notFound } from 'next/navigation';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getReportById } from '@/modules/reports/report.repository';
import { STATUS_LABEL, reportStatusVariant } from '@/modules/reports/report.types';
import { friendlyReportError } from '@/modules/reports/report-errors';
import { PRIORIDADE_LABEL, recomendacaoCards } from '@/modules/reports/report-view-model';
import { formatBRL, formatData, formatPeriodo } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Stat } from '@/components/ui/Stat';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { Alert } from '@/components/ui/Alert';
import { LineChart } from '@/components/ui/charts/LineChart';
import { Reveal } from './reveal';
import { Toc } from './toc';

const PRIORIDADE_BADGE = { alta: 'danger', media: 'warn', baixa: 'neutral' } as const;

export default async function RelatorioDetalhePage({ params }: { params: { id: string } }) {
  const access = await requireActiveOrg();
  const rel = await getReportById(params.id, access.orgId);

  if (!rel) notFound();

  const cards = rel.analiseIa ? recomendacaoCards(rel.analiseIa) : [];

  return (
    <main className="mx-auto max-w-6xl p-6 md:p-8">
      <a href="/dashboard" className="text-sm text-muted transition-colors hover:text-white">
        ← Voltar
      </a>

      {/* Hero editorial */}
      <header className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-bg-surface p-8">
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
            <p className="font-mono text-[11px] uppercase tracking-widest text-brand">
              Análise Truth
            </p>
            <h1 className="mt-1 font-heading text-3xl font-bold text-white">Relatório</h1>
            <p className="mt-2 font-mono text-sm text-muted">
              {formatPeriodo(rel.periodoInicio, rel.periodoFim)}
            </p>
            <p className="mt-0.5 text-xs text-dim">Gerado em {formatData(rel.createdAt)}</p>
          </div>
          <span data-testid="report-status">
            <Badge variant={reportStatusVariant(rel.status)}>{STATUS_LABEL[rel.status]}</Badge>
          </span>
        </div>
      </header>

      {rel.status === 'done' && rel.metricas ? (
        <div className="mt-6 flex gap-8">
          <Toc
            items={[
              { href: '#metricas', label: 'Métricas' },
              ...(rel.analiseIa
                ? [
                    { href: '#resumo', label: 'Resumo executivo' },
                    { href: '#recomendacoes', label: 'Recomendações' },
                    { href: '#precos', label: 'Preços sugeridos' },
                  ]
                : []),
            ]}
          />

          <div className="min-w-0 flex-1 space-y-10">
            <Reveal id="metricas" data-testid="metricas" className="space-y-6 scroll-mt-24">
              <h2 className="font-heading text-xl font-semibold text-white">Métricas</h2>

              <Card className="inline-flex">
                <Stat label="Ticket médio" value={formatBRL(rel.metricas.ticketMedio)} />
              </Card>

              {rel.metricas.benchmarkParcial && (
                <Badge variant="warn" className="flex w-fit gap-1.5">
                  Benchmark de mercado parcial — dados de concorrência incompletos.
                </Badge>
              )}

              {/* Evolução agora como chart + tabela */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-sm">Evolução</CardTitle>
                </CardHeader>
                <CardContent>
                  <LineChart
                    data={rel.metricas.evolucao.map((e) => ({ x: e.data, y: e.total }))}
                    formatY={formatBRL}
                  />
                  {/* tabela "Evolução" existente permanece abaixo do chart, inalterada */}
                </CardContent>
              </Card>

              {/* Cards existentes movidos sem alteração de conteúdo:
                  "Vendas por canal", "Top produtos", "Posição de preço" */}
            </Reveal>

            {rel.analiseIa ? (
              <>
                <Reveal id="resumo" className="space-y-4 scroll-mt-24">
                  <h2 className="font-heading text-xl font-semibold text-white">Análise da IA</h2>
                  <Card>
                    <CardHeader>
                      <CardTitle as="h3" className="text-sm">Resumo executivo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p data-testid="resumo-executivo" className="leading-relaxed text-white/90">
                        {rel.analiseIa.resumoExecutivo}
                      </p>
                    </CardContent>
                  </Card>
                </Reveal>

                {cards.length > 0 ? (
                  <Reveal id="recomendacoes" className="space-y-4 scroll-mt-24">
                    <h2 className="font-heading text-xl font-semibold text-white">Recomendações</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {cards.map((c, i) => (
                        <Card key={i} className="flex flex-col gap-2">
                          <Badge variant={PRIORIDADE_BADGE[c.prioridade]} className="w-fit">
                            Prioridade {PRIORIDADE_LABEL[c.prioridade]}
                          </Badge>
                          <p className="text-sm leading-relaxed text-white/80">{c.texto}</p>
                        </Card>
                      ))}
                    </div>
                  </Reveal>
                ) : null}

                {rel.analiseIa.recomendacoesPreco.length > 0 ? (
                  <Reveal id="precos" className="space-y-4 scroll-mt-24">
                    {/* Card "Recomendações de preço" existente movido sem alteração */}
                  </Reveal>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : rel.status === 'failed' ? (
        <div className="mt-6">
          <Alert variant="danger" title="Relatório falhou.">
            <p data-testid="report-erro">{friendlyReportError(rel.erro)}</p>
          </Alert>
        </div>
      ) : (
        <p className="mt-6 text-muted">Relatório em processamento.</p>
      )}
    </main>
  );
}
```

**Importante:** os comentários `/* … movidos sem alteração */` significam copiar o JSX EXISTENTE do arquivo atual (tabelas de Vendas por canal, Evolução, Top produtos, Posição de preço, Recomendações de preço e as listas de gargalos/sugestões/ideias, que agora são substituídas pelos cards de recomendação — as LISTAS antigas de gargalos/sugestões/ideias saem, os dados aparecem nos cards). O bloco `failed` troca o texto cru `{rel.erro}` por `friendlyReportError(rel.erro)` mantendo o `data-testid="report-erro"`.

- [ ] **Step 11: verificação + E2E**

Run: `npm run test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: tudo verde — dashboard.spec assere `resumo-executivo` (texto intacto) e `metricas` contendo `123,45` (Stat de ticket médio intacto).

- [ ] **Step 12: QA visual (controlador)** — screenshots do relatório done seedado: hero, TOC (xl), scroll-reveal, chart de evolução, cards de prioridade; e do relatório failed (mensagem amigável, sem stack).

- [ ] **Step 13: commit**

```bash
git add src/modules/reports/report-errors.ts src/modules/reports/report-view-model.ts "src/app/(client)/dashboard/relatorios/[id]/reveal.tsx" "src/app/(client)/dashboard/relatorios/[id]/toc.tsx" "src/app/(client)/dashboard/relatorios/[id]/page.tsx" tests/unit/report-errors.test.ts tests/unit/report-view-model.test.ts
git commit -m "feat(f1): relatório editorial — hero, TOC lateral, scroll-reveal, cards de recomendação com prioridade, erro amigável pt-BR"
```

---

### Task 8: Onboarding — checklist pós-ativação + reforma da tela /aguardando

**Files:**
- Create: `src/app/(client)/dashboard/onboarding-checklist.tsx`
- Modify: `src/app/(client)/dashboard/page.tsx` (montar checklist), `src/app/(client)/aguardando/page.tsx`
- Test: `tests/unit/onboarding-model.test.ts` + Create: `src/modules/reports/onboarding-model.ts`

**Interfaces:**
- Consumes: dados que a page do dashboard já busca (`conn.connected`, `listTrackedProducts`, `reports.length`); `signOutAction` de `@/actions/auth.actions`; `Card`/`Button`/`Logo` existentes.
- Produces:
  - `onboardingSteps(input: { blingOk: boolean; temProdutos: boolean; temRelatorio: boolean }): { id: 'bling' | 'produtos' | 'relatorio'; label: string; done: boolean; href: string }[]` e `onboardingCompleto(input): boolean` (puras).
  - `OnboardingChecklist({ blingOk, temProdutos, temRelatorio })` — `data-testid="onboarding-checklist"`; não renderiza nada quando completo.

- [ ] **Step 1: teste que falha**

```ts
// tests/unit/onboarding-model.test.ts
import { describe, expect, it } from 'vitest';

import { onboardingCompleto, onboardingSteps } from '@/modules/reports/onboarding-model';

describe('onboarding-model', () => {
  it('3 passos na ordem conectar → produtos → relatório, com hrefs', () => {
    const steps = onboardingSteps({ blingOk: false, temProdutos: false, temRelatorio: false });
    expect(steps.map((s) => s.id)).toEqual(['bling', 'produtos', 'relatorio']);
    expect(steps[0]).toMatchObject({ label: 'Conectar o Bling', done: false, href: '/conexoes' });
    expect(steps[1]).toMatchObject({
      label: 'Adicionar produtos para monitorar',
      href: '/conexoes#produtos-monitorados',
    });
    expect(steps[2]).toMatchObject({
      label: 'Gerar seu primeiro relatório',
      href: '/dashboard#gerar-relatorio',
    });
  });

  it('marca done conforme o progresso', () => {
    const steps = onboardingSteps({ blingOk: true, temProdutos: true, temRelatorio: false });
    expect(steps.map((s) => s.done)).toEqual([true, true, false]);
  });

  it('onboardingCompleto só quando os 3 estão feitos', () => {
    expect(onboardingCompleto({ blingOk: true, temProdutos: true, temRelatorio: true })).toBe(true);
    expect(onboardingCompleto({ blingOk: true, temProdutos: false, temRelatorio: true })).toBe(false);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npx vitest run tests/unit/onboarding-model.test.ts`
Expected: FAIL — módulo `onboarding-model` inexistente.

- [ ] **Step 3: implementar `src/modules/reports/onboarding-model.ts`**

```ts
export type OnboardingInput = {
  blingOk: boolean;
  temProdutos: boolean;
  temRelatorio: boolean;
};

export type OnboardingStep = {
  id: 'bling' | 'produtos' | 'relatorio';
  label: string;
  done: boolean;
  href: string;
};

/** Checklist pós-ativação (pura): conectar Bling → produtos → primeiro relatório. */
export function onboardingSteps(input: OnboardingInput): OnboardingStep[] {
  return [
    { id: 'bling', label: 'Conectar o Bling', done: input.blingOk, href: '/conexoes' },
    {
      id: 'produtos',
      label: 'Adicionar produtos para monitorar',
      done: input.temProdutos,
      href: '/conexoes#produtos-monitorados',
    },
    {
      id: 'relatorio',
      label: 'Gerar seu primeiro relatório',
      done: input.temRelatorio,
      href: '/dashboard#gerar-relatorio',
    },
  ];
}

export function onboardingCompleto(input: OnboardingInput): boolean {
  return input.blingOk && input.temProdutos && input.temRelatorio;
}
```

- [ ] **Step 4: rodar e ver passar**

Run: `npx vitest run tests/unit/onboarding-model.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: implementar `src/app/(client)/dashboard/onboarding-checklist.tsx`** (RSC — sem estado)

```tsx
import React from 'react';

import {
  onboardingCompleto,
  onboardingSteps,
  type OnboardingInput,
} from '@/modules/reports/onboarding-model';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';

/** Checklist de primeiros passos — some sozinho quando tudo está feito. */
export function OnboardingChecklist(props: OnboardingInput) {
  if (onboardingCompleto(props)) return null;
  const steps = onboardingSteps(props);
  const feitos = steps.filter((s) => s.done).length;

  return (
    <Card data-testid="onboarding-checklist" className="border-brand/20">
      <CardHeader>
        <CardTitle as="h2" className="text-base">Primeiros passos</CardTitle>
        <span className="font-mono text-xs text-muted">
          {feitos}/{steps.length}
        </span>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-2">
          {steps.map((step) => (
            <li key={step.id} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${
                  step.done
                    ? 'border-brand bg-brand text-[#04150a]'
                    : 'border-line bg-bg-elevated text-dim'
                }`}
              >
                {step.done ? '✓' : ''}
              </span>
              {step.done ? (
                <span className="text-sm text-muted line-through decoration-white/20">
                  {step.label}
                </span>
              ) : (
                <a
                  href={step.href}
                  className="text-sm text-white outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  {step.label} →
                </a>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: montar no dashboard** — em `src/app/(client)/dashboard/page.tsx`, adicionar a busca de produtos e o componente logo abaixo do `<h1>` (antes do marquee):

```tsx
// import adicional:
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { OnboardingChecklist } from './onboarding-checklist';

// no Promise.all, adicionar:
    listTrackedProducts(access.orgId),
// (desestruturar como `produtos`)

// no JSX, logo após o <h1>:
      <OnboardingChecklist
        blingOk={blingOk}
        temProdutos={produtos.length > 0}
        temRelatorio={reports.length > 0}
      />
```

- [ ] **Step 7: reformar `/aguardando`** — reescrever `src/app/(client)/aguardando/page.tsx` (logout + contato + o que esperar; auth.spec só assere a URL):

```tsx
import { requireSession } from '@/modules/auth/require-session';
import { signOutAction } from '@/actions/auth.actions';
import { Logo } from '@/components/ui/Logo';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const passos = [
  { titulo: 'Análise da conta', texto: 'Nossa equipe revisa seu cadastro e define o plano ideal para a sua operação.' },
  { titulo: 'Ativação', texto: 'Você recebe um e-mail assim que a conta for ativada — normalmente em até 1 dia útil.' },
  { titulo: 'Primeiro relatório', texto: 'Com a conta ativa, você conecta o Bling e gera sua primeira análise em minutos.' },
];

export default async function AguardandoPage() {
  await requireSession();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-bg-base p-8">
      <Logo withMark size="lg" />
      <div className="max-w-md space-y-2 text-center">
        <h1 className="font-heading text-xl font-semibold text-white">Conta aguardando ativação</h1>
        <p className="text-sm text-muted">
          Sua conta foi criada e será ativada pela equipe Truth em breve.
        </p>
      </div>

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

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button as="a" href="mailto:suporte@truthcommerce.com.br" variant="secondary" size="sm">
          Falar com o suporte
        </Button>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sair
          </Button>
        </form>
      </div>
    </main>
  );
}
```

- [ ] **Step 8: verificação + E2E**

Run: `npm run test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: tudo verde (auth.spec só verifica redirecionamento para `/aguardando`).

- [ ] **Step 9: QA visual (controlador)** — screenshots do dashboard de um cliente novo (checklist 0/3) e da `/aguardando`.

- [ ] **Step 10: commit**

```bash
git add src/modules/reports/onboarding-model.ts "src/app/(client)/dashboard/onboarding-checklist.tsx" "src/app/(client)/dashboard/page.tsx" "src/app/(client)/aguardando/page.tsx" tests/unit/onboarding-model.test.ts
git commit -m "feat(f1): onboarding — checklist pós-ativação no dashboard + /aguardando com logout, contato e expectativas"
```

---
### Task 9: Confirmações destrutivas + toasts + skeletons + empty states + a11y de forms (com atualização mínima dos E2E)

**Files:**
- Modify: `src/components/ui/Field.tsx`, `src/app/(client)/conexoes/disconnect-bling.tsx`, `src/app/(client)/conexoes/tracked-products.tsx`, `src/app/(client)/conexoes/page.tsx` (âncora `id="produtos-monitorados"`), `src/app/admin/client-row.tsx` (confirm no Suspender), `src/app/(client)/dashboard/page.tsx` (EmptyState do histórico)
- Create: `src/app/(client)/dashboard/loading.tsx`, `src/app/(client)/conexoes/loading.tsx`, `src/app/(client)/dashboard/relatorios/[id]/loading.tsx`, `src/app/admin/loading.tsx`
- Modify (E2E — exceção autorizada): `tests/e2e/conexoes.spec.ts`

**Interfaces:**
- Consumes: `ConfirmDialog`, `useToast`, `Skeleton`, `EmptyState`, `Alert` (Task 2); actions existentes (`disconnectBlingAction`, `removeTrackedProductAction`, `addTrackedProductAction`, `suspendClientAction`) — assinaturas INALTERADAS.
- Produces: `Field` com `error` acessível (`role="alert"`, `id="${htmlFor}-erro"`, `aria-invalid`/`aria-describedby` clonados no filho); fluxos destrutivos com confirmação (testids `confirm-dialog-confirm`/`confirm-dialog-cancel` da Task 2); toasts de sucesso/erro nas ações de conexões.

- [ ] **Step 1: Field acessível** — reescrever `src/components/ui/Field.tsx`:

```tsx
import React from 'react';

interface FieldProps {
  label: string;
  htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
  error?: string;
}

export function Field({ label, htmlFor, className = '', children, error }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-erro` : undefined;
  const child =
    error && errorId && React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          'aria-invalid': true,
          'aria-describedby': errorId,
        })
      : children;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-muted">
        {label}
      </label>
      {child}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Desconectar Bling com confirmação + toast** — reescrever `src/app/(client)/conexoes/disconnect-bling.tsx` (testid e texto do botão INTACTOS; o submit real só ocorre após confirmar):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';

import { disconnectBlingAction, type ConnState } from '@/actions/connections.actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';

const initial: ConnState = {};

export function DisconnectBling() {
  const [state, action] = useFormState(disconnectBlingAction, initial);
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) toast({ title: 'Não foi possível desconectar.', description: state.error, variant: 'error' });
  }, [state, toast]);

  return (
    <>
      <form ref={formRef} action={action}>
        <Button
          type="button"
          variant="danger"
          size="sm"
          data-testid="disconnect-bling"
          onClick={() => setConfirming(true)}
        >
          Desconectar
        </Button>
        {state.error ? <span className="ml-2 text-sm text-danger-fg" role="alert">{state.error}</span> : null}
      </form>
      <ConfirmDialog
        open={confirming}
        title="Desconectar o Bling?"
        description="A coleta de pedidos para os relatórios vai parar até você reconectar."
        confirmLabel="Desconectar"
        onConfirm={() => {
          setConfirming(false);
          formRef.current?.requestSubmit();
        }}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
```

- [ ] **Step 3: atualizar o E2E de desconectar (exceção autorizada — um clique a mais)** — em `tests/e2e/conexoes.spec.ts`, no teste `Desconectar Bling…`, trocar:

```ts
  // Click disconnect
  await page.click('[data-testid="disconnect-bling"]');
```

por:

```ts
  // Click disconnect + confirma no dialog
  await page.click('[data-testid="disconnect-bling"]');
  await page.click('[data-testid="confirm-dialog-confirm"]');
```

- [ ] **Step 4: Remover produto com confirmação + toasts** — em `src/app/(client)/conexoes/tracked-products.tsx`: manter `add-form`, `name="nome|sku|keywords"`, `produto-${id}`, textos `Adicionar`/`Remover`/`Nenhum produto ainda.`. Mudanças: botão `Remover` vira `type="button"` que abre o ConfirmDialog; um único dialog controlado por `pendingId`; erros com `role="alert"` + toast. Arquivo completo:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';

import {
  addTrackedProductAction,
  removeTrackedProductAction,
  type ConnState,
} from '@/actions/connections.actions';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';

const initial: ConnState = {};

type Produto = { id: string; nome: string; sku: string | null; ativo: boolean };

export function TrackedProducts({ produtos }: { produtos: Produto[] }) {
  const [addState, add] = useFormState(addTrackedProductAction, initial);
  const [rmState, remove] = useFormState(removeTrackedProductAction, initial);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const formsRef = useRef<Map<string, HTMLFormElement>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    if (addState.error) toast({ title: 'Não foi possível adicionar.', description: addState.error, variant: 'error' });
  }, [addState, toast]);

  useEffect(() => {
    if (rmState.error) toast({ title: 'Não foi possível remover.', description: rmState.error, variant: 'error' });
  }, [rmState, toast]);

  const pendente = produtos.find((p) => p.id === pendingId);

  return (
    <div>
      <form action={add} className="mb-5 grid gap-3 sm:grid-cols-3" data-testid="add-form">
        <Field label="Nome do produto" htmlFor="nome">
          <Input id="nome" name="nome" placeholder="Ex: Tênis Running Pro" />
        </Field>
        <Field label="SKU (opcional)" htmlFor="sku">
          <Input id="sku" name="sku" placeholder="Ex: TRP-001" />
        </Field>
        <Field label="Palavras-chave" htmlFor="keywords">
          <Input id="keywords" name="keywords" placeholder="tênis, corrida, running" />
        </Field>
        <div className="flex items-end sm:col-span-3">
          <Button type="submit" variant="primary" size="sm">
            Adicionar
          </Button>
        </div>
      </form>

      {addState.error ? (
        <p role="alert" className="mb-3 text-sm text-danger-fg">{addState.error}</p>
      ) : null}
      {rmState.error ? (
        <p role="alert" className="mb-3 text-sm text-danger-fg">{rmState.error}</p>
      ) : null}

      <ul className="flex flex-col divide-y divide-line">
        {produtos.map((p) => (
          <li
            key={p.id}
            data-testid={`produto-${p.id}`}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="text-white/90">
              {p.nome}
              {p.sku ? <span className="ml-1.5 font-mono text-xs text-muted">({p.sku})</span> : ''}
            </span>
            <form
              action={remove}
              ref={(el) => {
                if (el) formsRef.current.set(p.id, el);
                else formsRef.current.delete(p.id);
              }}
            >
              <input type="hidden" name="id" value={p.id} />
              <Button type="button" variant="danger" size="sm" onClick={() => setPendingId(p.id)}>
                Remover
              </Button>
            </form>
          </li>
        ))}
        {produtos.length === 0 ? (
          <li className="py-3">
            <EmptyState
              title="Nenhum produto ainda."
              description="Adicione os produtos que você quer acompanhar no mercado — eles alimentam o benchmark do relatório."
            />
          </li>
        ) : null}
      </ul>

      <ConfirmDialog
        open={pendingId !== null}
        title={`Remover ${pendente?.nome ?? 'este produto'}?`}
        description="O produto sai do monitoramento de mercado dos próximos relatórios."
        confirmLabel="Remover"
        onConfirm={() => {
          if (pendingId) formsRef.current.get(pendingId)?.requestSubmit();
          setPendingId(null);
        }}
        onCancel={() => setPendingId(null)}
      />
    </div>
  );
}
```

(O texto `Nenhum produto ainda.` — asserado no E2E — permanece visível como `title` do EmptyState.)

- [ ] **Step 5: atualizar o E2E de remover produto** — em `tests/e2e/conexoes.spec.ts`, no teste `remove produto monitorado da lista`, trocar:

```ts
  const li = page.locator('li', { hasText: 'Tênis Running Pro' });
  await li.getByRole('button', { name: 'Remover' }).click();
```

por:

```ts
  const li = page.locator('li', { hasText: 'Tênis Running Pro' });
  await li.getByRole('button', { name: 'Remover' }).click();
  await page.click('[data-testid="confirm-dialog-confirm"]');
```

- [ ] **Step 6: âncora dos produtos** — em `src/app/(client)/conexoes/page.tsx`, no Card "Produtos monitorados", adicionar `id="produtos-monitorados"`:

```tsx
      <Card id="produtos-monitorados">
```

(Se `Card` não aceitar `id`, adicionar `id?: string` à interface `CardProps` e repassar ao `div` — mudança de 2 linhas em `src/components/ui/Card.tsx`.)

- [ ] **Step 7: Suspender org com confirmação** — em `src/app/admin/client-row.tsx`, trocar o form de suspender (o E2E admin não cobre suspensão; `orgId`/`name`/testids intactos):

```tsx
// imports adicionais:
import { useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

// dentro de ClientRow, junto aos useFormState:
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const suspendFormRef = useRef<HTMLFormElement>(null);

// trocar o form de suspender por:
              <form action={suspend} ref={suspendFormRef}>
                <input type="hidden" name="orgId" value={orgId} />
                <Button type="button" variant="danger" size="sm" onClick={() => setConfirmSuspend(true)}>
                  Suspender
                </Button>
              </form>
              <ConfirmDialog
                open={confirmSuspend}
                title={`Suspender ${name}?`}
                description="O cliente perde o acesso ao painel até ser reativado."
                confirmLabel="Suspender"
                onConfirm={() => {
                  setConfirmSuspend(false);
                  suspendFormRef.current?.requestSubmit();
                }}
                onCancel={() => setConfirmSuspend(false)}
              />
```

- [ ] **Step 8: EmptyState do histórico no dashboard** — em `src/app/(client)/dashboard/page.tsx`, trocar o fallback do histórico (`<p className="text-muted">Nenhum relatório ainda.</p>` da seção `reports-list`) por:

```tsx
          <EmptyState
            title="Nenhum relatório ainda."
            description="Conecte o Bling, adicione produtos e gere sua primeira análise por IA."
            action={
              <Button as="a" href="#gerar-relatorio" variant="primary" size="sm">
                Gerar primeira análise
              </Button>
            }
          />
```

(+ imports de `EmptyState` e `Button`. O card "Último relatório" mantém o `<p>` simples.)

- [ ] **Step 9: skeletons por área** — criar os 4 `loading.tsx`:

```tsx
// src/app/(client)/dashboard/loading.tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
    </main>
  );
}
```

```tsx
// src/app/(client)/conexoes/loading.tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function ConexoesLoading() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </main>
  );
}
```

```tsx
// src/app/(client)/dashboard/relatorios/[id]/loading.tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function RelatorioLoading() {
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
      <Skeleton className="h-72 rounded-2xl" />
    </main>
  );
}
```

```tsx
// src/app/admin/loading.tsx
import { Skeleton } from '@/components/ui/Skeleton';

export default function AdminLoading() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-10 w-80 rounded-full" />
      <Skeleton className="h-96 rounded-2xl" />
    </main>
  );
}
```

- [ ] **Step 10: verificação + E2E (guard das confirmações)**

Run: `npm run test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: tudo verde — conexoes.spec agora clica confirmar; os demais specs inalterados.

- [ ] **Step 11: QA visual (controlador)** — screenshots: dialog de desconectar (backdrop blur), toast de erro (semear erro removendo produto inexistente é inviável — validar toast visualmente via story manual: adicionar produto com nome vazio dispara `addState.error`), skeleton do dashboard (throttle de rede no chrome-devtools), EmptyState do histórico.

- [ ] **Step 12: commit**

```bash
git add src/components/ui/Field.tsx src/components/ui/Card.tsx "src/app/(client)/conexoes/disconnect-bling.tsx" "src/app/(client)/conexoes/tracked-products.tsx" "src/app/(client)/conexoes/page.tsx" src/app/admin/client-row.tsx "src/app/(client)/dashboard/page.tsx" "src/app/(client)/dashboard/loading.tsx" "src/app/(client)/conexoes/loading.tsx" "src/app/(client)/dashboard/relatorios/[id]/loading.tsx" src/app/admin/loading.tsx tests/e2e/conexoes.spec.ts
git commit -m "feat(f1): confirmações destrutivas (desconectar/remover/suspender), toasts, skeletons por área, empty states com CTA, erros de form acessíveis"
```

---

### Task 10: Admin operacional — `/admin/[orgId]`, busca + paginação + saúde de conexão, disparar/reprocessar relatório

**Files:**
- Modify: `src/modules/admin/admin.repository.ts`, `src/modules/reports/report.repository.ts` (novo `createQueuedReport`), `src/actions/admin.actions.ts`, `src/app/admin/page.tsx`, `src/app/admin/client-row.tsx`
- Create: `src/modules/admin/periodo-plano.ts`, `src/app/admin/[orgId]/page.tsx`, `src/app/admin/[orgId]/report-actions.tsx`, `src/app/admin/[orgId]/generate-now.tsx`
- Test: `tests/unit/periodo-plano.test.ts`, `tests/integration/admin-operacional.test.ts`

**Interfaces:**
- Consumes: contrato F0 `POST /api/pipeline/run` (`x-pipeline-secret` = `PIPELINE_SECRET`, body `{ reportId }`) e coluna `reports.etapa`; `requireAdmin`; `recordAudit`; `serverEnv.APP_URL`; `Pagination`/`Tabs`/`Tooltip`/`Badge`/`EmptyState`/`useToast`; `friendlyReportError` (Task 7); `STATUS_LABEL`/`reportStatusVariant`.
- Produces (admin.repository — **somente leitura cross-org**, exceto requeue que é UPDATE restrito a `failed`):
  - `type ConexaoSaude = 'ok' | 'expirado' | 'erro' | 'nenhuma'`.
  - `listClientOrganizationsPage(params: { q?: string; page: number; pageSize: number }): Promise<{ items: (ClientOrganization & { conexao: ConexaoSaude })[]; total: number }>`.
  - `listOrgReports(orgId: string, limit?: number): Promise<{ id: string; status: string; etapa: string | null; periodoInicio: Date; periodoFim: Date; createdAt: Date; erro: string | null }[]>`.
  - `getOrgConnectionHealth(orgId: string): Promise<{ provider: string; saude: ConexaoSaude; expiraEm: Date | null; lastSyncAt: Date | null } | null>`.
  - `requeueFailedReport(input: { reportId: string; actorUserId: string }): Promise<{ orgId: string } | null>` — `UPDATE … SET status='queued', etapa=null, erro=null WHERE id=? AND status='failed'` + audit `report.reprocessado`.
  - report.repository: `createQueuedReport(input: { orgId: string; periodoInicio: Date; periodoFim: Date }): Promise<{ reportId: string }>` — lança `relatorio_em_andamento` se violar o índice parcial único da F0 (código PG `23505`).
  - `periodoDoPlano(plano: Plano, hoje: Date): { inicio: Date; fim: Date }` — weekly=7, biweekly=14, monthly=30 dias. **Re-validar:** se a F0 já tiver criado helper equivalente (ex.: em `src/modules/pipeline/`), importar e apagar este.
  - actions: `adminReprocessReportAction(prev: AdminActionState, formData: FormData): Promise<AdminActionState>` (campo `reportId`) e `adminGenerateReportAction(prev: AdminActionState, formData: FormData): Promise<AdminActionState>` (campo `orgId`; exige org active+plano+Bling ok; ignora o gate de ciclo — disparo manual do admin).

- [ ] **Step 1: teste que falha (período por plano)**

```ts
// tests/unit/periodo-plano.test.ts
import { describe, expect, it } from 'vitest';

import { periodoDoPlano } from '@/modules/admin/periodo-plano';

describe('periodoDoPlano', () => {
  const hoje = new Date('2026-07-03T12:00:00Z');

  it('weekly = 7 dias até hoje', () => {
    const p = periodoDoPlano('weekly', hoje);
    expect(p.fim).toEqual(hoje);
    expect(p.inicio).toEqual(new Date('2026-06-26T12:00:00Z'));
  });

  it('biweekly = 14 dias', () => {
    expect(periodoDoPlano('biweekly', hoje).inicio).toEqual(new Date('2026-06-19T12:00:00Z'));
  });

  it('monthly = 30 dias', () => {
    expect(periodoDoPlano('monthly', hoje).inicio).toEqual(new Date('2026-06-03T12:00:00Z'));
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `npx vitest run tests/unit/periodo-plano.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: implementar `src/modules/admin/periodo-plano.ts`**

```ts
import type { Plano } from '@/modules/auth/user.types';

const DIAS: Record<Plano, number> = { weekly: 7, biweekly: 14, monthly: 30 };

/** Janela de análise do disparo manual do admin (pura). */
export function periodoDoPlano(plano: Plano, hoje: Date): { inicio: Date; fim: Date } {
  const inicio = new Date(hoje.getTime() - DIAS[plano] * 24 * 60 * 60 * 1000);
  return { inicio, fim: hoje };
}
```

- [ ] **Step 4: rodar e ver passar**

Run: `npx vitest run tests/unit/periodo-plano.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: teste de integração que falha (novas queries)** — segue o padrão de `tests/integration/admin-repository.test.ts` (mesmo esquema de seed/cleanup com `describe.skipIf(!url)`):

```ts
// tests/integration/admin-operacional.test.ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { auditLog, connections, organizations, reports, users } from '@/db/schema';
import {
  getOrgConnectionHealth,
  listClientOrganizationsPage,
  listOrgReports,
  requeueFailedReport,
} from '@/modules/admin/admin.repository';
import { createQueuedReport } from '@/modules/reports/report.repository';

const url = process.env.DATABASE_URL_TEST;
const sql = postgres(url ?? '', { prepare: false });
const tdb = drizzle(sql);

const PREFIX = 'ta-test-adminop-';
const RUN = Date.now();

describe.skipIf(!url)('admin operacional — integração', () => {
  let orgId = '';
  let internalOrgId = '';
  let adminUserId = '';
  let failedReportId = '';

  beforeAll(async () => {
    const [org] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}cliente-${RUN}`, status: 'active', plano: 'weekly' })
      .returning({ id: organizations.id });
    orgId = org.id;

    const [internal] = await tdb
      .insert(organizations)
      .values({ name: `${PREFIX}truth-${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    internalOrgId = internal.id;

    const [admin] = await tdb
      .insert(users)
      .values({
        org_id: internalOrgId,
        email: `adminop-${RUN}@ta-test.example.com`,
        senha_hash: 'x',
        role: 'admin_truth',
      })
      .returning({ id: users.id });
    adminUserId = admin.id;

    await tdb.insert(connections).values({
      org_id: orgId,
      provider: 'bling',
      access_token: 'enc',
      refresh_token: 'enc',
      status: 'ok',
    });

    const [failed] = await tdb
      .insert(reports)
      .values({
        org_id: orgId,
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        status: 'failed',
        erro: 'analise_ia_invalida',
      })
      .returning({ id: reports.id });
    failedReportId = failed.id;
  });

  afterAll(async () => {
    await tdb.delete(auditLog).where(eq(auditLog.org_id, orgId));
    await tdb.delete(reports).where(eq(reports.org_id, orgId));
    await tdb.delete(connections).where(eq(connections.org_id, orgId));
    await tdb.delete(users).where(eq(users.org_id, internalOrgId));
    await tdb.delete(organizations).where(eq(organizations.id, orgId));
    await tdb.delete(organizations).where(eq(organizations.id, internalOrgId));
    await sql.end();
  });

  it('listClientOrganizationsPage filtra por nome e traz saúde da conexão', async () => {
    const page = await listClientOrganizationsPage({ q: `${PREFIX}cliente-${RUN}`, page: 1, pageSize: 20 });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ id: orgId, conexao: 'ok' });
  });

  it('listClientOrganizationsPage exclui org interna', async () => {
    const page = await listClientOrganizationsPage({ q: `${PREFIX}truth-${RUN}`, page: 1, pageSize: 20 });
    expect(page.total).toBe(0);
  });

  it('listOrgReports retorna os reports da org com etapa e erro', async () => {
    const list = await listOrgReports(orgId);
    expect(list.some((r) => r.id === failedReportId && r.erro === 'analise_ia_invalida')).toBe(true);
  });

  it('getOrgConnectionHealth resume a conexão', async () => {
    const health = await getOrgConnectionHealth(orgId);
    expect(health).toMatchObject({ provider: 'bling', saude: 'ok' });
  });

  it('requeueFailedReport re-enfileira só failed e audita', async () => {
    const res = await requeueFailedReport({ reportId: failedReportId, actorUserId: adminUserId });
    expect(res).toEqual({ orgId });
    const [row] = await tdb.select().from(reports).where(eq(reports.id, failedReportId));
    expect(row.status).toBe('queued');
    expect(row.erro).toBeNull();
    // segunda chamada: não está mais failed → null
    expect(await requeueFailedReport({ reportId: failedReportId, actorUserId: adminUserId })).toBeNull();
    // volta para failed para não colidir com o índice parcial em outros testes
    await tdb.update(reports).set({ status: 'failed', erro: 'x' }).where(eq(reports.id, failedReportId));
  });

  it('createQueuedReport insere queued e barra duplicata (relatorio_em_andamento)', async () => {
    const { reportId } = await createQueuedReport({
      orgId,
      periodoInicio: new Date('2026-06-26'),
      periodoFim: new Date('2026-07-03'),
    });
    expect(reportId).toBeTruthy();
    await expect(
      createQueuedReport({
        orgId,
        periodoInicio: new Date('2026-06-26'),
        periodoFim: new Date('2026-07-03'),
      }),
    ).rejects.toThrow('relatorio_em_andamento');
    await tdb.delete(reports).where(eq(reports.id, reportId));
  });
});
```

- [ ] **Step 6: rodar e ver falhar**

Run: `npx vitest run tests/integration/admin-operacional.test.ts`
Expected: FAIL — funções não exportadas.

- [ ] **Step 7: implementar as queries** — em `src/modules/admin/admin.repository.ts`, adicionar (imports extras: `count`, `ilike`, `sql` de `drizzle-orm`; `connections`, `reports` de `@/db/schema`):

```ts
export type ConexaoSaude = 'ok' | 'expirado' | 'erro' | 'nenhuma';

function saudeFromRow(status: string | null, accessToken: string | null): ConexaoSaude {
  if (status === null) return 'nenhuma';
  if (status === 'ok' && accessToken !== null) return 'ok';
  if (status === 'expirado') return 'expirado';
  return 'erro';
}

export async function listClientOrganizationsPage(params: {
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ items: (ClientOrganization & { conexao: ConexaoSaude })[]; total: number }> {
  const filtroNome = params.q ? ilike(organizations.name, `%${params.q}%`) : undefined;
  const where = filtroNome
    ? and(eq(isInternalOrg(), false), filtroNome)
    : eq(isInternalOrg(), false);

  const [{ n }] = await db.select({ n: count() }).from(organizations).where(where);

  const rows = await db
    .select({
      org: organizations,
      connStatus: connections.status,
      connToken: connections.access_token,
    })
    .from(organizations)
    .leftJoin(
      connections,
      and(eq(connections.org_id, organizations.id), eq(connections.provider, 'bling')),
    )
    .where(where)
    .orderBy(desc(organizations.created_at))
    .limit(params.pageSize)
    .offset((params.page - 1) * params.pageSize);

  return {
    total: n,
    items: rows.map((r) => ({
      ...rowToClient(r.org),
      conexao: saudeFromRow(r.connStatus, r.connToken),
    })),
  };
}

export type OrgReportRow = {
  id: string;
  status: string;
  etapa: string | null;
  periodoInicio: Date;
  periodoFim: Date;
  createdAt: Date;
  erro: string | null;
};

export async function listOrgReports(orgId: string, limit = 20): Promise<OrgReportRow[]> {
  const rows = await db
    .select({
      id: reports.id,
      status: reports.status,
      etapa: reports.etapa,
      periodo_inicio: reports.periodo_inicio,
      periodo_fim: reports.periodo_fim,
      created_at: reports.created_at,
      erro: reports.erro,
    })
    .from(reports)
    .where(eq(reports.org_id, orgId))
    .orderBy(desc(reports.created_at))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    etapa: r.etapa,
    periodoInicio: r.periodo_inicio,
    periodoFim: r.periodo_fim,
    createdAt: r.created_at,
    erro: r.erro,
  }));
}

export async function getOrgConnectionHealth(orgId: string): Promise<{
  provider: string;
  saude: ConexaoSaude;
  expiraEm: Date | null;
  lastSyncAt: Date | null;
} | null> {
  const [row] = await db
    .select({
      provider: connections.provider,
      status: connections.status,
      access_token: connections.access_token,
      expira_em: connections.expira_em,
      last_sync_at: connections.last_sync_at,
    })
    .from(connections)
    .where(and(eq(connections.org_id, orgId), eq(connections.provider, 'bling')))
    .limit(1);
  if (!row) return null;
  return {
    provider: row.provider,
    saude: saudeFromRow(row.status, row.access_token),
    expiraEm: row.expira_em,
    lastSyncAt: row.last_sync_at,
  };
}

export async function requeueFailedReport(input: {
  reportId: string;
  actorUserId: string;
}): Promise<{ orgId: string } | null> {
  const updated = await db
    .update(reports)
    .set({ status: 'queued', etapa: null, erro: null })
    .where(and(eq(reports.id, input.reportId), eq(reports.status, 'failed')))
    .returning({ org_id: reports.org_id });
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

(`reports.etapa` vem da F0 — se o nome/local divergir, ajustar aqui e no select. Se `set({ etapa: null })` não compilar por a coluna não existir ainda, é sinal de que a F0 não foi mergeada: **parar e mergear F0 primeiro**.)

Em `src/modules/reports/report.repository.ts`, adicionar:

```ts
/** Insere um report na fila (o índice parcial único da F0 garante 1 por org). */
export async function createQueuedReport(input: {
  orgId: string;
  periodoInicio: Date;
  periodoFim: Date;
}): Promise<{ reportId: string }> {
  try {
    const [row] = await db
      .insert(reports)
      .values({
        org_id: input.orgId,
        periodo_inicio: input.periodoInicio,
        periodo_fim: input.periodoFim,
        status: 'queued',
      })
      .returning({ id: reports.id });
    return { reportId: row.id };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    const causeCode = ((e as { cause?: { code?: string } })?.cause)?.code;
    if (code === '23505' || causeCode === '23505') {
      throw new Error('relatorio_em_andamento');
    }
    throw e;
  }
}
```

(**Re-validar:** a F0 provavelmente já criou um insert equivalente para o `generateReportAction` — se existir, reusar e NÃO duplicar.)

- [ ] **Step 8: rodar e ver passar**

Run: `npx vitest run tests/integration/admin-operacional.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 9: actions do admin** — em `src/actions/admin.actions.ts`, adicionar:

```ts
import { serverEnv } from '@/lib/env';
import {
  getOrgConnectionHealth,
  getOrganizationById,
  requeueFailedReport,
} from '@/modules/admin/admin.repository';
import { periodoDoPlano } from '@/modules/admin/periodo-plano';
import { createQueuedReport } from '@/modules/reports/report.repository';
import { isValidPlano } from '@/modules/admin/admin.repository';

/**
 * Dispara o pipeline F0 para um report já enfileirado.
 * Re-validar: se a F0 exporta um helper de dispatch, usar ele no lugar do fetch.
 */
async function dispatchPipeline(reportId: string): Promise<void> {
  await fetch(`${serverEnv.APP_URL}/api/pipeline/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-pipeline-secret': process.env.PIPELINE_SECRET ?? '',
    },
    body: JSON.stringify({ reportId }),
  });
}

export async function adminReprocessReportAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const reportId = String(formData.get('reportId') ?? '');
  if (!reportId) return { error: 'Relatório inválido.' };

  const res = await requeueFailedReport({ reportId, actorUserId: admin.id });
  if (!res) return { error: 'Só relatórios com falha podem ser reprocessados.' };

  await dispatchPipeline(reportId);
  revalidatePath(`/admin/${res.orgId}`);
  return { ok: true };
}

export async function adminGenerateReportAction(
  _prev: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const orgId = String(formData.get('orgId') ?? '');
  if (!orgId) return { error: 'Cliente inválido.' };

  const org = await getOrganizationById(orgId);
  if (!org || org.status !== 'active') return { error: 'Organização não está ativa.' };
  if (!isValidPlano(org.plano)) return { error: 'Organização sem plano definido.' };

  const health = await getOrgConnectionHealth(orgId);
  if (health?.saude !== 'ok') return { error: 'Bling não está conectado para este cliente.' };

  const { inicio, fim } = periodoDoPlano(org.plano, new Date());
  let reportId: string;
  try {
    ({ reportId } = await createQueuedReport({ orgId, periodoInicio: inicio, periodoFim: fim }));
  } catch (e) {
    if (e instanceof Error && e.message === 'relatorio_em_andamento') {
      return { error: 'Já existe um relatório em andamento para este cliente.' };
    }
    throw e;
  }

  await recordAudit({
    orgId,
    userId: admin.id,
    acao: 'report.disparado_admin',
    detalhes: { reportId },
  });
  await dispatchPipeline(reportId);
  revalidatePath(`/admin/${orgId}`);
  return { ok: true };
}
```

(Import de `recordAudit` de `@/modules/audit/audit.repository`. `PIPELINE_SECRET`: se a F0 tiver adicionado ao `serverEnv`, usar `serverEnv.PIPELINE_SECRET`.)

- [ ] **Step 10: lista admin com busca + paginação + coluna de conexão** — reescrever `src/app/admin/page.tsx`:

```tsx
import { requireAdmin } from '@/modules/auth/require-admin';
import { listClientOrganizationsPage } from '@/modules/admin/admin.repository';
import { Table, THead, TBody, TR, TH } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { ClientRow } from './client-row';

const PAGE_SIZE = 20;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  await requireAdmin();
  const q = searchParams.q?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { items, total } = await listClientOrganizationsPage({ q, page, pageSize: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefFor = (p: number) =>
    `/admin?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Painel Admin — Clientes</h1>

      <form method="get" action="/admin" className="flex max-w-sm items-center gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Buscar por empresa…"
          aria-label="Buscar cliente por nome"
        />
        <Button type="submit" variant="secondary" size="sm">
          Buscar
        </Button>
      </form>

      <Card className="!p-0">
        <Table>
          <THead>
            <TR>
              <TH>Empresa</TH>
              <TH>Status</TH>
              <TH>Plano</TH>
              <TH>Conexão</TH>
              <TH>Ações</TH>
            </TR>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <TR>
                <td className="px-4 py-6 text-center text-muted" colSpan={5}>
                  {q ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente ainda.'}
                </td>
              </TR>
            ) : (
              items.map((c) => (
                <ClientRow
                  key={c.id}
                  orgId={c.id}
                  name={c.name}
                  status={c.status}
                  plano={c.plano}
                  conexao={c.conexao}
                />
              ))
            )}
          </TBody>
        </Table>
      </Card>

      <Pagination page={page} pageCount={pageCount} hrefFor={hrefFor} />
    </main>
  );
}
```

Em `src/app/admin/client-row.tsx`: adicionar prop `conexao: 'ok' | 'expirado' | 'erro' | 'nenhuma'`, célula nova entre Plano e Ações (colSpan do vazio já ajustado acima) e link do nome para o detalhe:

```tsx
const CONEXAO_BADGE: Record<Props['conexao'], { variant: 'success' | 'warn' | 'danger' | 'neutral'; label: string }> = {
  ok: { variant: 'success', label: 'Bling ok' },
  expirado: { variant: 'warn', label: 'Expirada' },
  erro: { variant: 'danger', label: 'Com erro' },
  nenhuma: { variant: 'neutral', label: 'Sem conexão' },
};

// célula do nome (linkar para o detalhe, mantendo o texto):
      <td className="px-4 py-3 text-white/90">
        <a href={`/admin/${orgId}`} className="hover:text-brand hover:underline">
          {name}
        </a>
      </td>
// nova célula após Plano:
      <td className="px-4 py-3" data-testid={`conexao-${orgId}`}>
        <Badge variant={CONEXAO_BADGE[conexao].variant}>{CONEXAO_BADGE[conexao].label}</Badge>
      </td>
```

(O E2E admin localiza a linha por `hasText` e usa `select[name="plano"]`/`Ativar`/`active` — tudo preservado; o nome virar link não muda o texto.)

- [ ] **Step 11: página de detalhe `/admin/[orgId]`** — criar `src/app/admin/[orgId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';

import { requireAdmin } from '@/modules/auth/require-admin';
import {
  getOrgConnectionHealth,
  getOrganizationById,
  listOrgReports,
} from '@/modules/admin/admin.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { formatData, formatPeriodo } from '@/lib/format';
import { STATUS_LABEL, reportStatusVariant, type ReportStatus } from '@/modules/reports/report.types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ReportActions } from './report-actions';
import { GenerateNow } from './generate-now';

const SAUDE_BADGE = {
  ok: { variant: 'success', label: 'Conectada' },
  expirado: { variant: 'warn', label: 'Expirada' },
  erro: { variant: 'danger', label: 'Com erro' },
  nenhuma: { variant: 'neutral', label: 'Nunca conectada' },
} as const;

export default async function AdminOrgPage({ params }: { params: { orgId: string } }) {
  await requireAdmin();
  const org = await getOrganizationById(params.orgId);
  if (!org) notFound();

  const [relatorios, saude, produtos] = await Promise.all([
    listOrgReports(org.id),
    getOrgConnectionHealth(org.id),
    listTrackedProducts(org.id),
  ]);

  const saudeInfo = SAUDE_BADGE[saude?.saude ?? 'nenhuma'];

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <a href="/admin" className="text-sm text-muted transition-colors hover:text-white">
        ← Clientes
      </a>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-white">{org.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant={org.status === 'active' ? 'success' : org.status === 'suspended' ? 'danger' : 'warn'}>
              {org.status}
            </Badge>
            <span className="font-mono text-sm text-muted">{org.plano ?? 'sem plano'}</span>
            <Badge variant={saudeInfo.variant}>{saudeInfo.label}</Badge>
          </div>
        </div>
        <GenerateNow orgId={org.id} />
      </div>

      <Tabs
        defaultValue="relatorios"
        items={[
          {
            id: 'relatorios',
            label: `Relatórios (${relatorios.length})`,
            content:
              relatorios.length === 0 ? (
                <EmptyState title="Nenhum relatório gerado." description="Use “Gerar relatório agora” para disparar o primeiro." />
              ) : (
                <Card className="!p-0">
                  <Table data-testid="admin-org-reports">
                    <THead>
                      <TR>
                        <TH>Status</TH>
                        <TH>Etapa</TH>
                        <TH>Período</TH>
                        <TH>Criado</TH>
                        <TH>Erro</TH>
                        <TH><span className="sr-only">Ações</span></TH>
                      </TR>
                    </THead>
                    <TBody>
                      {relatorios.map((r) => (
                        <TR key={r.id}>
                          <TD>
                            <Badge variant={reportStatusVariant(r.status)}>
                              {STATUS_LABEL[r.status as ReportStatus] ?? r.status}
                            </Badge>
                          </TD>
                          <TD className="font-mono text-xs text-muted">{r.etapa ?? '—'}</TD>
                          <TD className="text-muted">{formatPeriodo(r.periodoInicio, r.periodoFim)}</TD>
                          <TD className="text-muted">{formatData(r.createdAt)}</TD>
                          {/* admin VÊ o erro cru — é a tela de operação */}
                          <TD className="max-w-56 truncate font-mono text-xs text-danger-fg" title={r.erro ?? undefined}>
                            {r.erro ?? '—'}
                          </TD>
                          <TD>
                            {r.status === 'failed' ? <ReportActions reportId={r.id} /> : null}
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              ),
          },
          {
            id: 'conexao',
            label: 'Conexão',
            content: (
              <Card>
                <CardHeader>
                  <CardTitle as="h2" className="text-base">Bling</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <p className="flex items-center gap-2">
                    <Badge variant={saudeInfo.variant}>{saudeInfo.label}</Badge>
                  </p>
                  <p className="text-muted">
                    Token expira em:{' '}
                    <span className="font-mono text-white/80">
                      {saude?.expiraEm ? formatData(saude.expiraEm) : '—'}
                    </span>
                  </p>
                  <p className="text-muted">
                    Última sincronização:{' '}
                    <span className="font-mono text-white/80">
                      {saude?.lastSyncAt ? formatData(saude.lastSyncAt) : '—'}
                    </span>
                  </p>
                </CardContent>
              </Card>
            ),
          },
          {
            id: 'produtos',
            label: `Produtos (${produtos.length})`,
            content:
              produtos.length === 0 ? (
                <EmptyState title="Nenhum produto monitorado." description="O cliente ainda não cadastrou produtos em Conexões." />
              ) : (
                <ul className="flex flex-col divide-y divide-line">
                  {produtos.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span className="text-white/90">
                        {p.nome}
                        {p.sku ? <span className="ml-1.5 font-mono text-xs text-muted">({p.sku})</span> : null}
                      </span>
                      <span className="font-mono text-xs text-dim">{p.keywords.join(', ')}</span>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
    </main>
  );
}
```

- [ ] **Step 12: client components das ações** — criar:

```tsx
// src/app/admin/[orgId]/report-actions.tsx
'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { adminReprocessReportAction, type AdminActionState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

const initial: AdminActionState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" size="sm" disabled={pending} data-testid="reprocessar-relatorio">
      {pending ? 'Reprocessando…' : 'Reprocessar'}
    </Button>
  );
}

export function ReportActions({ reportId }: { reportId: string }) {
  const [state, action] = useFormState(adminReprocessReportAction, initial);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) toast({ title: 'Relatório reenfileirado.', variant: 'success' });
    if (state.error) toast({ title: state.error, variant: 'error' });
  }, [state, toast]);

  return (
    <form action={action}>
      <input type="hidden" name="reportId" value={reportId} />
      <Submit />
    </form>
  );
}
```

```tsx
// src/app/admin/[orgId]/generate-now.tsx
'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { adminGenerateReportAction, type AdminActionState } from '@/actions/admin.actions';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';

const initial: AdminActionState = {};

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending} data-testid="gerar-relatorio-admin">
      {pending ? 'Disparando…' : 'Gerar relatório agora'}
    </Button>
  );
}

export function GenerateNow({ orgId }: { orgId: string }) {
  const [state, action] = useFormState(adminGenerateReportAction, initial);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) toast({ title: 'Relatório disparado.', description: 'Acompanhe o status na aba Relatórios.', variant: 'success' });
    if (state.error) toast({ title: state.error, variant: 'error' });
  }, [state, toast]);

  return (
    <form action={action}>
      <input type="hidden" name="orgId" value={orgId} />
      <Submit />
    </form>
  );
}
```

- [ ] **Step 13: verificação + E2E**

Run: `npm run test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: tudo verde — admin.spec continua ativando cliente (busca/paginação não interferem: sem `q`, página 1 lista os mais recentes).

- [ ] **Step 14: QA visual (controlador)** — screenshots: lista admin (busca, coluna Conexão, paginação com 21+ orgs seed opcional), detalhe da org (3 abas), toast do reprocesso.

- [ ] **Step 15: commit**

```bash
git add src/modules/admin/admin.repository.ts src/modules/admin/periodo-plano.ts src/modules/reports/report.repository.ts src/actions/admin.actions.ts src/app/admin/page.tsx src/app/admin/client-row.tsx "src/app/admin/[orgId]" tests/unit/periodo-plano.test.ts tests/integration/admin-operacional.test.ts
git commit -m "feat(f1): admin operacional — detalhe da org (relatórios/conexão/produtos), reprocessar e disparar relatório, busca + paginação + saúde de conexão"
```

---
### Task 11: Export PDF do relatório (@react-pdf/renderer, server-side)

**Files:**
- Create: `src/modules/pdf/fonts.ts`, `src/modules/pdf/report-pdf.tsx`, `src/app/api/reports/[id]/pdf/route.ts`, `public/fonts/{Sora-Regular,Sora-Bold,Inter-Regular,Inter-SemiBold,SpaceMono-Regular,SpaceMono-Bold}.ttf`
- Modify: `src/app/(client)/dashboard/relatorios/[id]/page.tsx` (botão Exportar PDF)
- Test: `tests/unit/report-pdf.test.ts`

**Interfaces:**
- Consumes: `Metricas`/`AnaliseIa` de `@/modules/pipeline/contracts`; `getReportById`, `requireActiveOrg`, `getOrganizationById`; `formatBRL`/`formatData`/`formatPeriodo`; `recomendacaoCards`/`PRIORIDADE_LABEL` (Task 7).
- Produces:
  - `registerPdfFonts(): { heading: string; body: string; mono: string }` — registra TTFs de `public/fonts`; fallback Helvetica/Courier se ausentes (teste passa em qualquer ambiente).
  - `type ReportPdfInput = { orgName: string; periodo: string; geradoEm: string; metricas: Metricas; analise: AnaliseIa | null }` e `renderReportPdf(input: ReportPdfInput): Promise<Buffer>`.
  - Rota `GET /api/reports/[id]/pdf` — escopada pela org da sessão; 404 se não `done`; `content-disposition: attachment`.

- [ ] **Step 1: instalar dependência e baixar fontes**

```bash
npm i @react-pdf/renderer@^4
mkdir -p public/fonts
# Listar URLs TTF (User-Agent antigo força o Google Fonts a servir .ttf):
curl -s -A "" "https://fonts.googleapis.com/css?family=Sora:400,700|Inter:400,600|Space+Mono:400,700" | grep -oE "https://[^)]+\.ttf"
# Baixar cada URL na ordem listada para os nomes fixos:
# Sora 400→Sora-Regular.ttf, Sora 700→Sora-Bold.ttf, Inter 400→Inter-Regular.ttf,
# Inter 600→Inter-SemiBold.ttf, Space Mono 400→SpaceMono-Regular.ttf, 700→SpaceMono-Bold.ttf
# Ex.: curl -sL -o public/fonts/Sora-Regular.ttf "<url>"
ls -la public/fonts
```

Expected: 6 arquivos `.ttf` (> 50 KB cada). **Fallback:** se algum download falhar, seguir sem ele — `registerPdfFonts` cai para Helvetica/Courier e nada quebra; registrar a pendência no PR.

- [ ] **Step 2: teste que falha (smoke de render)**

```ts
// tests/unit/report-pdf.test.ts
import { describe, expect, it } from 'vitest';

import { renderReportPdf } from '@/modules/pdf/report-pdf';
import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';

const METRICAS: Metricas = {
  vendasPorCanal: [{ canal: 'Mercado Livre', total: 1000, pedidos: 10 }],
  evolucao: [
    { data: '2026-06-01', total: 500 },
    { data: '2026-06-30', total: 500 },
  ],
  ticketMedio: 123.45,
  topProdutos: [{ nome: 'Produto Teste', sku: 'SKU-001', quantidade: 10, receita: 1000 }],
  posicaoPreco: [
    { sku: 'SKU-001', nome: 'Produto Teste', nossoPreco: 100, precoMercadoMediano: 95, fonte: 'Mercado Livre' },
  ],
  benchmarkParcial: false,
};

const ANALISE: AnaliseIa = {
  resumoExecutivo: 'Desempenho sólido no período.',
  gargalos: ['Frete caro'],
  sugestoesMelhoria: ['Negociar tarifa'],
  ideiasVenda: ['Kit promocional'],
  recomendacoesPreco: [
    { sku: 'SKU-001', nome: 'Produto Teste', precoSugerido: 98, justificativa: 'Ajuste competitivo.' },
  ],
};

describe('report-pdf', () => {
  it('renderiza um PDF válido com métricas e análise', async () => {
    const buf = await renderReportPdf({
      orgName: 'Comercial Exemplo',
      periodo: '01/06/2026 – 30/06/2026',
      geradoEm: '01/07/2026',
      metricas: METRICAS,
      analise: ANALISE,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('renderiza sem análise IA (só métricas)', async () => {
    const buf = await renderReportPdf({
      orgName: 'Comercial Exemplo',
      periodo: '01/06/2026 – 30/06/2026',
      geradoEm: '01/07/2026',
      metricas: METRICAS,
      analise: null,
    });
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
```

- [ ] **Step 3: rodar e ver falhar**

Run: `npx vitest run tests/unit/report-pdf.test.ts`
Expected: FAIL — módulo `report-pdf` inexistente.

- [ ] **Step 4: implementar `src/modules/pdf/fonts.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';

import { Font } from '@react-pdf/renderer';

export type PdfFontFamilies = { heading: string; body: string; mono: string };

let registered: PdfFontFamilies | null = null;

/**
 * Registra Sora/Inter/Space Mono a partir de public/fonts.
 * Se os TTFs não existirem (ex.: CI sem assets), cai para Helvetica/Courier —
 * o PDF perde as fontes da marca mas nunca quebra.
 */
export function registerPdfFonts(): PdfFontFamilies {
  if (registered) return registered;

  const dir = path.join(process.cwd(), 'public', 'fonts');
  const p = (f: string) => path.join(dir, f);
  const all = [
    'Sora-Regular.ttf',
    'Sora-Bold.ttf',
    'Inter-Regular.ttf',
    'Inter-SemiBold.ttf',
    'SpaceMono-Regular.ttf',
    'SpaceMono-Bold.ttf',
  ];

  if (all.every((f) => fs.existsSync(p(f)))) {
    Font.register({
      family: 'Sora',
      fonts: [{ src: p('Sora-Regular.ttf') }, { src: p('Sora-Bold.ttf'), fontWeight: 700 }],
    });
    Font.register({
      family: 'Inter',
      fonts: [{ src: p('Inter-Regular.ttf') }, { src: p('Inter-SemiBold.ttf'), fontWeight: 600 }],
    });
    Font.register({
      family: 'Space Mono',
      fonts: [
        { src: p('SpaceMono-Regular.ttf') },
        { src: p('SpaceMono-Bold.ttf'), fontWeight: 700 },
      ],
    });
    registered = { heading: 'Sora', body: 'Inter', mono: 'Space Mono' };
  } else {
    registered = { heading: 'Helvetica-Bold', body: 'Helvetica', mono: 'Courier' };
  }
  return registered;
}
```

- [ ] **Step 5: implementar `src/modules/pdf/report-pdf.tsx`** — documento dark com a identidade Truth (capa com wordmark, faixa verde de destaque, números em mono):

```tsx
import React from 'react';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { PRIORIDADE_LABEL, recomendacaoCards } from '@/modules/reports/report-view-model';

import { registerPdfFonts } from './fonts';

export type ReportPdfInput = {
  orgName: string;
  periodo: string;
  geradoEm: string;
  metricas: Metricas;
  analise: AnaliseIa | null;
};

const BRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

function buildStyles(fonts: ReturnType<typeof registerPdfFonts>) {
  return StyleSheet.create({
    page: {
      backgroundColor: '#0a0c10',
      color: '#ffffff',
      padding: 40,
      fontFamily: fonts.body,
      fontSize: 10,
    },
    kicker: {
      fontFamily: fonts.mono,
      fontSize: 8,
      color: '#07dd2b',
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    wordmarkTruth: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 22, color: '#07dd2b' },
    wordmarkRest: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 22, color: '#ffffff' },
    h1: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 18, marginTop: 16 },
    h2: {
      fontFamily: fonts.heading,
      fontWeight: 700,
      fontSize: 13,
      color: '#07dd2b',
      marginTop: 18,
      marginBottom: 8,
    },
    muted: { color: '#a1a1aa' },
    mono: { fontFamily: fonts.mono },
    divider: { height: 2, backgroundColor: '#07dd2b', marginTop: 12, width: 64 },
    card: {
      backgroundColor: '#0d0d10',
      borderWidth: 1,
      borderColor: '#26262b',
      borderRadius: 8,
      padding: 10,
      marginBottom: 6,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
    tableHead: { fontFamily: fonts.mono, fontSize: 7, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1 },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 40,
      right: 40,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: '#a1a1aa',
    },
  });
}

export function ReportPdf({ orgName, periodo, geradoEm, metricas, analise }: ReportPdfInput) {
  const fonts = registerPdfFonts();
  const s = buildStyles(fonts);
  const cards = analise ? recomendacaoCards(analise) : [];

  return (
    <Document title={`Truth Analytics — ${orgName}`} author="Truth Commerce">
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>Análise por IA · Truth Commerce</Text>
        <Text>
          <Text style={s.wordmarkTruth}>Truth</Text>
          <Text style={s.wordmarkRest}>Analytics</Text>
        </Text>
        <Text style={s.h1}>{orgName}</Text>
        <Text style={[s.mono, s.muted, { marginTop: 4 }]}>Período: {periodo}</Text>
        <Text style={[s.muted, { fontSize: 8, marginTop: 2 }]}>Gerado em {geradoEm}</Text>
        <View style={s.divider} />

        <Text style={s.h2}>Métricas</Text>
        <View style={s.card}>
          <Text style={s.tableHead}>Ticket médio</Text>
          <Text style={[s.mono, { fontSize: 16, marginTop: 2 }]}>{BRL(metricas.ticketMedio)}</Text>
        </View>

        <Text style={s.h2}>Vendas por canal</Text>
        <View style={s.row}>
          <Text style={[s.tableHead, { width: '50%' }]}>Canal</Text>
          <Text style={[s.tableHead, { width: '25%', textAlign: 'right' }]}>Total</Text>
          <Text style={[s.tableHead, { width: '25%', textAlign: 'right' }]}>Pedidos</Text>
        </View>
        {metricas.vendasPorCanal.map((v, i) => (
          <View key={i} style={s.row}>
            <Text style={{ width: '50%' }}>{v.canal}</Text>
            <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{BRL(v.total)}</Text>
            <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{v.pedidos}</Text>
          </View>
        ))}

        <Text style={s.h2}>Top produtos</Text>
        {metricas.topProdutos.map((pr, i) => (
          <View key={i} style={s.row}>
            <Text style={{ width: '45%' }}>{pr.nome}</Text>
            <Text style={[s.mono, s.muted, { width: '20%' }]}>{pr.sku}</Text>
            <Text style={[s.mono, { width: '15%', textAlign: 'right' }]}>{pr.quantidade}</Text>
            <Text style={[s.mono, { width: '20%', textAlign: 'right' }]}>{BRL(pr.receita)}</Text>
          </View>
        ))}

        <Text style={s.h2}>Posição de preço</Text>
        {metricas.posicaoPreco.map((pp, i) => (
          <View key={i} style={s.row}>
            <Text style={{ width: '40%' }}>{pp.nome}</Text>
            <Text style={[s.mono, { width: '20%', textAlign: 'right' }]}>{BRL(pp.nossoPreco)}</Text>
            <Text style={[s.mono, s.muted, { width: '25%', textAlign: 'right' }]}>
              mercado {BRL(pp.precoMercadoMediano)}
            </Text>
            <Text style={[s.muted, { width: '15%', textAlign: 'right' }]}>{pp.fonte}</Text>
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>truthcommerce.com.br</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>

      {analise ? (
        <Page size="A4" style={s.page}>
          <Text style={s.h2}>Resumo executivo</Text>
          <View style={s.card}>
            <Text style={{ lineHeight: 1.5 }}>{analise.resumoExecutivo}</Text>
          </View>

          {cards.length > 0 ? (
            <>
              <Text style={s.h2}>Recomendações</Text>
              {cards.map((c, i) => (
                <View key={i} style={s.card}>
                  <Text style={[s.tableHead, { color: c.prioridade === 'alta' ? '#f87171' : c.prioridade === 'media' ? '#fbbf24' : '#a1a1aa' }]}>
                    Prioridade {PRIORIDADE_LABEL[c.prioridade]}
                  </Text>
                  <Text style={{ marginTop: 3, lineHeight: 1.4 }}>{c.texto}</Text>
                </View>
              ))}
            </>
          ) : null}

          {analise.recomendacoesPreco.length > 0 ? (
            <>
              <Text style={s.h2}>Preços sugeridos</Text>
              {analise.recomendacoesPreco.map((r, i) => (
                <View key={i} style={s.card}>
                  <Text style={s.mono}>
                    {r.sku} · {r.nome} → {BRL(r.precoSugerido)}
                  </Text>
                  <Text style={[s.muted, { marginTop: 2, lineHeight: 1.4 }]}>{r.justificativa}</Text>
                </View>
              ))}
            </>
          ) : null}

          <View style={s.footer} fixed>
            <Text>truthcommerce.com.br</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
          </View>
        </Page>
      ) : null}
    </Document>
  );
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return renderToBuffer(<ReportPdf {...input} />);
}
```

- [ ] **Step 6: rodar e ver passar**

Run: `npx vitest run tests/unit/report-pdf.test.ts`
Expected: PASS (2 testes). (Se o vitest reclamar de JSX em dependência, conferir que o arquivo é `.tsx` — o vitest do repo compila TSX por padrão via esbuild.)

- [ ] **Step 7: rota `src/app/api/reports/[id]/pdf/route.ts`**

```ts
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getReportById } from '@/modules/reports/report.repository';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { renderReportPdf } from '@/modules/pdf/report-pdf';
import { formatData, formatPeriodo } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireActiveOrg();
  const rel = await getReportById(params.id, access.orgId);
  if (!rel || rel.status !== 'done' || !rel.metricas) {
    return new Response('Relatório não disponível para exportação.', { status: 404 });
  }

  const org = await getOrganizationById(access.orgId);
  const buffer = await renderReportPdf({
    orgName: org?.name ?? 'Cliente Truth',
    periodo: formatPeriodo(rel.periodoInicio, rel.periodoFim),
    geradoEm: formatData(rel.createdAt),
    metricas: rel.metricas,
    analise: rel.analiseIa,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="truth-analytics-relatorio-${rel.id}.pdf"`,
    },
  });
}
```

- [ ] **Step 8: botão no relatório** — em `src/app/(client)/dashboard/relatorios/[id]/page.tsx`, no hero (junto ao badge de status, só quando `done`):

```tsx
// import adicional:
import { Button } from '@/components/ui/Button';

// no header do hero, ao lado do <span data-testid="report-status">:
          <div className="flex items-center gap-3">
            {rel.status === 'done' && rel.metricas ? (
              <Button
                as="a"
                href={`/api/reports/${rel.id}/pdf`}
                variant="secondary"
                size="sm"
                data-testid="export-pdf"
              >
                Exportar PDF
              </Button>
            ) : null}
            <span data-testid="report-status">
              <Badge variant={reportStatusVariant(rel.status)}>{STATUS_LABEL[rel.status]}</Badge>
            </span>
          </div>
```

- [ ] **Step 9: verificação + E2E**

Run: `npm run test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: tudo verde. (`@react-pdf/renderer` roda só na rota Node — sem impacto no bundle client.)

- [ ] **Step 10: QA manual (controlador)** — no dev QA (3200), baixar o PDF do relatório done seedado e abrir: capa dark, verde nos títulos, números em mono, 2 páginas, paginação no rodapé.

- [ ] **Step 11: commit**

```bash
git add src/modules/pdf src/app/api/reports public/fonts "src/app/(client)/dashboard/relatorios/[id]/page.tsx" tests/unit/report-pdf.test.ts package.json package-lock.json
git commit -m "feat(f1): export PDF branded do relatório — @react-pdf/renderer server-side, fontes da marca com fallback"
```

---

### Task 12: Command palette ⌘K (cmdk) + verificação final do plano

**Files:**
- Create: `src/components/command-model.ts`, `src/components/command-palette.tsx`
- Modify: `src/components/app-shell.tsx` (montar palette + botão ⌘K)
- Test: `tests/unit/command-model.test.ts`

**Interfaces:**
- Consumes: `cmdk` (`Command` component); âncoras `#gerar-relatorio` (Task 6) e `#produtos-monitorados` (Task 9); `useRouter` do Next.
- Produces:
  - `type CommandItem = { id: string; label: string; group: 'Navegação' | 'Ações'; href: string; keywords?: string }` e `buildCommands(variant: 'client' | 'admin'): CommandItem[]`.
  - `CommandPalette({ variant }: { variant: 'client' | 'admin' })` — abre com ⌘K/Ctrl+K, `data-testid="command-palette"`.

- [ ] **Step 1: instalar cmdk**

```bash
npm i cmdk@^1
```

- [ ] **Step 2: teste que falha (modelo de comandos)**

```ts
// tests/unit/command-model.test.ts
import { describe, expect, it } from 'vitest';

import { buildCommands } from '@/components/command-model';

describe('buildCommands', () => {
  it('client: navegação (sem admin) + ações', () => {
    const cmds = buildCommands('client');
    expect(cmds.map((c) => c.id)).toEqual([
      'nav-dashboard',
      'nav-conexoes',
      'acao-gerar-relatorio',
      'acao-adicionar-produto',
    ]);
    expect(cmds.find((c) => c.id === 'acao-gerar-relatorio')).toMatchObject({
      label: 'Gerar relatório',
      href: '/dashboard#gerar-relatorio',
      group: 'Ações',
    });
  });

  it('admin: inclui a navegação do painel admin', () => {
    const cmds = buildCommands('admin');
    expect(cmds.some((c) => c.id === 'nav-admin' && c.href === '/admin')).toBe(true);
  });
});
```

- [ ] **Step 3: rodar e ver falhar**

Run: `npx vitest run tests/unit/command-model.test.ts`
Expected: FAIL — módulo `command-model` inexistente.

- [ ] **Step 4: implementar `src/components/command-model.ts`**

```ts
export type CommandItem = {
  id: string;
  label: string;
  group: 'Navegação' | 'Ações';
  href: string;
  keywords?: string;
};

/** Comandos do ⌘K por variante do shell (pura). */
export function buildCommands(variant: 'client' | 'admin'): CommandItem[] {
  const nav: CommandItem[] = [
    { id: 'nav-dashboard', label: 'Ir para o Dashboard', group: 'Navegação', href: '/dashboard' },
    { id: 'nav-conexoes', label: 'Ir para Conexões', group: 'Navegação', href: '/conexoes', keywords: 'bling produtos' },
  ];
  if (variant === 'admin') {
    nav.push({ id: 'nav-admin', label: 'Ir para o Admin', group: 'Navegação', href: '/admin', keywords: 'clientes' });
  }
  const acoes: CommandItem[] = [
    {
      id: 'acao-gerar-relatorio',
      label: 'Gerar relatório',
      group: 'Ações',
      href: '/dashboard#gerar-relatorio',
      keywords: 'análise ia relatório novo',
    },
    {
      id: 'acao-adicionar-produto',
      label: 'Adicionar produto monitorado',
      group: 'Ações',
      href: '/conexoes#produtos-monitorados',
      keywords: 'sku keywords monitorar',
    },
  ];
  return [...nav, ...acoes];
}
```

- [ ] **Step 5: rodar e ver passar**

Run: `npx vitest run tests/unit/command-model.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 6: implementar `src/components/command-palette.tsx`**

```tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';

import { buildCommands } from './command-model';

export function CommandPalette({ variant }: { variant: 'client' | 'admin' }) {
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[18vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
      data-testid="command-palette"
    >
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Command
          label="Comandos"
          className="overflow-hidden rounded-2xl border border-line bg-bg-surface/95 shadow-glow-3 backdrop-blur-md"
        >
          <Command.Input
            autoFocus
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
      </div>
    </div>
  );
}
```

(cmdk fecha com Esc via input; garantir tecla Esc global: o overlay fecha no clique fora; adicionar no `useEffect` acima `if (e.key === 'Escape') setOpen(false);` dentro do handler.)

- [ ] **Step 7: montar no AppShell** — em `src/components/app-shell.tsx`:

```tsx
// import:
import { CommandPalette } from '@/components/command-palette';

// dentro do <nav>, antes do form de Sair desktop (botão-dica que dispara o atalho):
          <button
            type="button"
            aria-label="Abrir comandos (Ctrl+K)"
            onClick={() =>
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
            }
            className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[10px] text-dim outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50 sm:flex"
          >
            ⌘K
          </button>

// antes do fechamento do <div className="min-h-screen …">:
      <CommandPalette variant={variant} />
```

(Nada de testid/link existente muda — o E2E de conexões já escopa o submit ao `add-form`.)

- [ ] **Step 8: verificação final COMPLETA do plano**

Run: `npm run test && npm run typecheck && npm run lint && npm run build && npm run test:e2e`
Expected: suíte inteira + E2E verdes.

- [ ] **Step 9: QA visual final (controlador)** — passada completa no dev QA (3200): landing, sign-in, dashboard (bento + checklist + marquee + stepper), relatório (editorial + PDF), conexões (dialogs + toasts), admin (lista + detalhe), ⌘K aberto; mobile 375×812; `prefers-reduced-motion` emulado (nada se move); snapshot a11y do chrome-devtools sem violações de contraste.

- [ ] **Step 10: commit**

```bash
git add src/components/command-model.ts src/components/command-palette.tsx src/components/app-shell.tsx tests/unit/command-model.test.ts package.json package-lock.json
git commit -m "feat(f1): command palette ⌘K (cmdk) — navegação e ações rápidas com visual glass"
```

- [ ] **Step 11: revisão ampla do branch (Opus) → merge `--no-ff` em `master`** (conforme política do roadmap; nunca sem revisão).

---

## Self-Review

**Cobertura do escopo (11 itens do roadmap F1):**
1. Tokens (success/warning/danger, glass, glow 3 camadas, fix `dim`) + `src/lib/motion.ts` c/ reduced-motion → Task 1. ✓
2. Primitivos Toast/ConfirmDialog/Skeleton/EmptyState/Alert → Task 2; Tabs/Dropdown/Tooltip/Pagination/Stepper → Task 3; charts themados → Task 4; APIs documentadas nos blocos Interfaces. ✓
3. Stepper tempo real (polling 3 s de `GET /api/reports/[id]/status`, 5 etapas, aria-live) → Task 5. ✓
4. Dashboard bento (stats+sparkline+count-up, line chart, donut, marquee) → Task 6. ✓
5. Relatório editorial (hero, scroll-reveal, Space Mono, cards com prioridade, TOC) → Task 7. ✓
6. Onboarding (checklist 3 passos + /aguardando com logout/contato/expectativas) → Task 8. ✓
7. Admin operacional (`/admin/[orgId]` com relatórios/etapa/saúde/produtos, disparar/reprocessar via rota F0, busca+paginação+coluna saúde, queries read-only no admin.repository) → Task 10. ✓
8. Confirmações destrutivas (desconectar/remover/suspender), toasts, skeletons, empty states com CTA, `role=alert`/`aria-describedby` no Field, erro amigável no failed (Task 7 `friendlyReportError`; cru só no admin) → Tasks 7 e 9. ✓
9. Export PDF — decisão @react-pdf/renderer justificada na Architecture → Task 11. ✓
10. ⌘K — decisão cmdk justificada na Architecture → Task 12. ✓
11. PlanoSelect unificado com Select.tsx + Badges tokenizados → Task 1. ✓

**Placeholder scan:** sem TBD/TODO/"similar à task N"; os únicos blocos "mover sem alteração" (Task 7) referenciam JSX existente citado integralmente neste plano (leitura do arquivo atual na própria task); todo step de código tem código.

**Consistência de nomes entre tasks (verificada):** `useToast`/`ToastProvider` (T2→T9/T10); `ConfirmDialog` props `open/title/description/confirmLabel/onConfirm/onCancel` (T2→T9); `Stepper({steps, activeIndex, failed})` (T3→T5); `ETAPAS_GERACAO`/`geracaoView` (T5); `LineChart({data, formatY})`/`DonutChart({data, formatValue})`/`Sparkline({data})` (T4→T6/T7); `getLatestDoneReport` (T6); `friendlyReportError` (T7→T10 usa cru de propósito no admin); `recomendacaoCards`/`PRIORIDADE_LABEL` (T7→T11); `listClientOrganizationsPage`/`listOrgReports`/`getOrgConnectionHealth`/`requeueFailedReport`/`createQueuedReport`/`periodoDoPlano` (T10); `buildCommands` (T12); âncoras `#gerar-relatorio` (T6) e `#produtos-monitorados` (T9) consumidas por T8/T12.

**Riscos & mitigação:** (1) F0 divergir dos contratos assumidos → regra de re-validação nos Global Constraints + checkpoints explícitos (etapa/insert queued/dispatch/PIPELINE_SECRET). (2) ConfirmDialog quebrar E2E → specs atualizados na MESMA task (exceção autorizada, mínima). (3) Recharts/framer no bundle → só client components de folha; build verifica. (4) Fontes do PDF indisponíveis → fallback Helvetica documentado e testado. (5) `useFormState` sem retorno `ok` em `ConnState` → toasts de conexões disparam apenas sobre `error` (o sucesso revalida a página — comportamento atual preservado).

---

## Execução

Subagent-driven (implementer Opus 4.8 por task → spec-review → code-review → fix), branch `feat/f1-experiencia`, ledger em `.superpowers/sdd/progress.md`. QA visual por screenshots (controlador) no dev server 3200/branch `test`. E2E é o guard de regressão em toda task de tela. Revisão ampla (Opus) ao final → merge `--no-ff` em `master`.
