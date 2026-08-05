# Períodos manuais do analista — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que analistas e administradores gerem, pela carteira, relatórios de 7, 14, 30, 60, 90 ou 180 dias fechados.

**Architecture:** Um módulo puro será a fonte única da allowlist e do cálculo da janela. A action validará o `FormData` antes de enfileirar, e `enqueueReport` aceitará uma janela explícita opcional sem alterar os consumidores automáticos existentes. O componente apenas apresenta as opções aceitas pelo domínio.

**Tech Stack:** Next.js 16 App Router, React 19 server actions, TypeScript, Zod, Vitest, Drizzle/PostgreSQL.

## Global Constraints

- Valores aceitos: `7`, `14`, `30`, `60`, `90` e `180` dias.
- Cada janela termina ontem às `23:59:59.999Z` e contém N dias-calendário fechados segundo `America/Sao_Paulo`.
- O período padrão na interface é 30 dias.
- A seleção não altera plano, cadência automática nem trava futura da organização.
- A action mantém autorização por carteira, ERP ativo e exclusão de relatório concorrente.
- Bling e Olist usam o mesmo fluxo.

---

### Task 1: Domínio dos períodos manuais

**Files:**
- Create: `src/modules/reports/manual-report-period.ts`
- Create: `tests/unit/manual-report-period.test.ts`

**Interfaces:**
- Consumes: `janelaDiasFechados(dias: number, agora?: Date): { inicio: Date; fim: Date }` de `src/lib/timezone.ts`.
- Produces: `REPORT_PERIOD_DAYS`, `ReportPeriodDays`, `parseReportPeriodDays(value: unknown)` e `manualReportPeriod(days, now?)`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
import { describe, expect, it } from 'vitest';
import {
  manualReportPeriod,
  parseReportPeriodDays,
  REPORT_PERIOD_DAYS,
} from '@/modules/reports/manual-report-period';

describe('período manual do relatório', () => {
  it('aceita exatamente as seis janelas públicas', () => {
    expect(REPORT_PERIOD_DAYS).toEqual([7, 14, 30, 60, 90, 180]);
    for (const days of REPORT_PERIOD_DAYS) expect(parseReportPeriodDays(String(days))).toBe(days);
  });

  it.each(['', '0', '15', '30.5', '181', 'abc', null])('recusa valor adulterado %s', (value) => {
    expect(parseReportPeriodDays(value)).toBeNull();
  });

  it('180 dias terminam ontem e contêm exatamente 180 dias fechados', () => {
    expect(manualReportPeriod(180, new Date('2026-08-05T15:00:00Z'))).toEqual({
      inicio: new Date('2026-02-06T00:00:00.000Z'),
      fim: new Date('2026-08-04T23:59:59.999Z'),
    });
  });
});
```

- [ ] **Step 2: Executar RED**

Run: `npm test -- --run tests/unit/manual-report-period.test.ts`

Expected: FAIL porque `@/modules/reports/manual-report-period` ainda não existe.

- [ ] **Step 3: Implementar o módulo mínimo**

```ts
import { janelaDiasFechados } from '@/lib/timezone';

export const REPORT_PERIOD_DAYS = [7, 14, 30, 60, 90, 180] as const;
export type ReportPeriodDays = (typeof REPORT_PERIOD_DAYS)[number];

export function parseReportPeriodDays(value: unknown): ReportPeriodDays | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const days = Number(value);
  return REPORT_PERIOD_DAYS.includes(days as ReportPeriodDays) ? days as ReportPeriodDays : null;
}

export function manualReportPeriod(days: ReportPeriodDays, now: Date = new Date()) {
  return janelaDiasFechados(days, now);
}
```

- [ ] **Step 4: Executar GREEN**

Run: `npm test -- --run tests/unit/manual-report-period.test.ts`

Expected: 3 testes aprovados.

- [ ] **Step 5: Commit**

```bash
git add src/modules/reports/manual-report-period.ts tests/unit/manual-report-period.test.ts
git commit -m "feat: definir períodos manuais de relatório"
```

---

### Task 2: Action e fila com janela explícita

**Files:**
- Modify: `src/modules/pipeline/enqueue.ts`
- Modify: `src/actions/staff.actions.ts`
- Modify: `tests/unit/staff-actions.test.ts`
- Modify: `tests/unit/enqueue.test.ts`

**Interfaces:**
- Consumes: `parseReportPeriodDays` e `manualReportPeriod` da Task 1.
- Produces: `enqueueReport(orgId: string, explicitPeriod?: { inicio: Date; fim: Date }): Promise<EnqueueResult>`.

- [ ] **Step 1: Escrever teste RED da action**

Adicionar em `tests/unit/staff-actions.test.ts` um caso com ERP Olist ativo e `periodDays=180`. O teste deve verificar que a action chama `enqueueReport('org-cliente', { inicio: new Date(...), fim: new Date(...) })` usando relógio controlado por `vi.setSystemTime`, retorna o `reportId` e registra `periodDays: 180` na auditoria. Adicionar tabela com `periodDays` ausente, `15`, `30.5` e `abc`, esperando `{ error: 'Selecione um período válido.' }` sem chamar a fila.

- [ ] **Step 2: Escrever teste RED da fila**

Em `tests/unit/enqueue.test.ts`, adicionar um caso que fornece uma janela literal a `enqueueReport` e espera que `createQueuedReport` receba exatamente essa janela. Manter o caso existente sem segundo argumento comprovando que o plano continua calculando o período automático.

- [ ] **Step 3: Executar RED**

Run: `npm test -- --run tests/unit/staff-actions.test.ts tests/unit/enqueue.test.ts`

Expected: FAIL porque a action ignora `periodDays` e `enqueueReport` não recebe a janela explícita.

- [ ] **Step 4: Implementar a fila mínima**

Alterar a assinatura para:

```ts
type ReportPeriod = { inicio: Date; fim: Date };
export async function enqueueReport(orgId: string, explicitPeriod?: ReportPeriod): Promise<EnqueueResult> {
  // gates existentes permanecem
  const periodo = explicitPeriod ?? periodoDoPlano(org.plano, new Date());
  // criação e dispatch existentes permanecem
}
```

O gate de plano continua obrigatório para o comportamento atual; nenhum consumidor existente precisa mudar.

- [ ] **Step 5: Implementar validação e encaminhamento na action**

Antes de consultar o ERP:

```ts
const periodDays = parseReportPeriodDays(formData.get('periodDays'));
if (!periodDays) return { error: 'Selecione um período válido.' };
const period = manualReportPeriod(periodDays);
```

Chamar `enqueueReport(orgId, period)` e registrar na auditoria:

```ts
detalhes: {
  reportId: result.reportId,
  provider: source.provider,
  periodDays,
  periodStart: period.inicio.toISOString(),
  periodEnd: period.fim.toISOString(),
}
```

- [ ] **Step 6: Executar GREEN**

Run: `npm test -- --run tests/unit/staff-actions.test.ts tests/unit/enqueue.test.ts tests/unit/manual-report-period.test.ts`

Expected: todos aprovados.

- [ ] **Step 7: Commit**

```bash
git add src/modules/pipeline/enqueue.ts src/actions/staff.actions.ts tests/unit/staff-actions.test.ts tests/unit/enqueue.test.ts
git commit -m "feat: enfileirar período escolhido pelo analista"
```

---

### Task 3: Seletor na interface e validação final

**Files:**
- Modify: `src/app/analista/[orgId]/staff-generate-report.tsx`
- Modify: `tests/unit/staff-generate-report.test.ts`

**Interfaces:**
- Consumes: `REPORT_PERIOD_DAYS` da Task 1 e `staffGenerateReportAction` da Task 2.
- Produces: formulário do staff com `select[name="periodDays"]`, padrão `30` e seis opções.

- [ ] **Step 1: Escrever teste RED do componente**

Renderizar o componente com Bling ativo e verificar no HTML real:

```ts
expect(html).toContain('name="periodDays"');
expect(html).toContain('<option value="30" selected="">30 dias</option>');
for (const days of [7, 14, 30, 60, 90, 180]) {
  expect(html).toContain(`value="${days}"`);
}
```

Preservar os testes de ERP ausente e relatório em andamento.

- [ ] **Step 2: Executar RED**

Run: `npm test -- --run tests/unit/staff-generate-report.test.ts`

Expected: FAIL porque o seletor não existe.

- [ ] **Step 3: Implementar o seletor acessível**

Dentro do formulário, antes do botão, renderizar um `<label htmlFor="periodDays">Período analisado</label>` e um `<select id="periodDays" name="periodDays" defaultValue="30">`. Mapear `REPORT_PERIOD_DAYS`; usar `Últimos ${days} dias` como texto visual. Manter `orgId` oculto, mensagens e bloqueio atuais.

- [ ] **Step 4: Executar GREEN e regressões focadas**

Run:

```bash
npm test -- --run tests/unit/staff-generate-report.test.ts tests/unit/staff-actions.test.ts tests/unit/enqueue.test.ts tests/unit/manual-report-period.test.ts
npm run typecheck
npm run lint
```

Expected: testes aprovados, TypeScript aprovado e lint sem erros.

- [ ] **Step 5: Executar verificação completa**

Run:

```bash
npm test -- --reporter=dot
npm run build
git diff --check
```

No build local, fornecer apenas valores sintéticos válidos para `POSTGRES_URL`, `AUTH_SECRET` e `ENCRYPTION_KEY`; nunca copiar segredos de produção.

- [ ] **Step 6: Commit**

```bash
git add src/app/analista/[orgId]/staff-generate-report.tsx tests/unit/staff-generate-report.test.ts
git commit -m "feat: permitir período no relatório do analista"
```

- [ ] **Step 7: Publicar e verificar**

Criar PR contra `master`, fazer squash merge após os checks, acionar deploy do EasyPanel e verificar `### Success`, serviço `Running`, log `Ready` e HTTP 200 em `https://analytics.truthcommerce.com.br/sign-in`.
