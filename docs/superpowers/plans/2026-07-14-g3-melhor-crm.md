# G3 — O Melhor CRM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

> **Pré-requisitos: G0 e G1 mergeadas; revalidar contratos.** Este plano assume no `master`: da **G0** (`2026-07-14-g0-verdade-dos-dados.md`) — `src/lib/timezone.ts` (`hojeBrt(agora?: Date): string`, `ontemBrt`, `somarDias` NÃO existe lá — é criado AQUI), cron `sincronizar-pedidos` (vercel.json com 4 crons), `verificar-alertas` reescrito (agora efetivo + cooldown + digest), migrations 0008/0009 aplicadas; da **G1** (`2026-07-14-g1-melhor-relatorio.md`) — `AchadoSchema` `{titulo≤80, descricao, tipo, prioridade, impactoEstimadoMensalBRL: number|null, comoFazer[], skus[]}` em `contracts.ts`, `FONTES_ANALISE` com `'achados'`, `achadoToTaskInput(achado, reportId)` em `report-to-task.ts`, `AchadosCards.tsx` (testids `virar-task-achados-{i}`), `ordenarAchados`/`primeiroGargalo` em `report-view-model.ts`, `getDoneAnterior(orgId, beforeCreatedAt, excludeId)` em `report.repository.ts`, `formatDataCurta`/`slugify` em `format.ts`. **No início de CADA task, revalide os trechos citados contra o `master` real** — os snippets deste plano foram extraídos do HEAD `5c07999` (pré-G0/G1) e os arquivos de tasks/notifications/cron TÊM drift garantido pós-G0/G1. Divergência pequena = adaptar inline e anotar no commit; estrutural = parar e revisar o plano.

**Goal:** Transformar o CRM na máquina de consultoria (auditoria 2026-07-14, seções 3-P1/CRM e 4/G3): SLA por prioridade em TODA criação de task (a task de IA hoje nasce sem prazo), UI de edição/exclusão (as actions existem sem UI), conversão achado→task 2.0 (prazo + playbook + baseline + link), dedup cross-report com reincidência, fila de revisão com contexto, "Meu dia" do analista, cobrança de prazos no cron, digest semanal por org, kanban rico com "Mover para…" otimista, notificações simétricas (analista também é avisado), painel de impacto para renovação e higiene (timeline com autor, página de notificações, tempo médio honesto).

**Architecture:** Segue o padrão do repo — domínio puro em `src/modules/tasks/*` (novo `sla.ts` puro ao lado de `task-transitions.ts`), repositórios multi-tenant escopados por `org_id`, server actions em `src/actions/tasks.actions.ts` (gate por sessão → `assertOrgAccess` → repositório → `revalidatePath`), crons finos que delegam a helpers testáveis (padrão G0: helper fora do `route.ts`), componentes server + client finos. **Transições de status continuam passando SÓ por `podeTransicionar`** (que vive em `src/modules/tasks/task-transitions.ts` — divergência do brief, que o citava em `task.types.ts`; confirmado no código: `task-transitions.ts:9-22`, chamado por `moveTask` em `task.repository.ts:114`). Dedup de lembrete de prazo usa `task_activities` como ledger (evento `lembrete_prazo`, `de=prazo`, `para=tipo`) — sem tabela nova; `notifications` não tem dedup (decisão documentada na Task 7).

**Tech Stack:** Next.js 14 App Router + React 18.3 (`useFormState`/`useFormStatus`; **`useOptimistic` NÃO existe em React 18.3** — o kanban otimista usa `useState` + `useTransition`, divergência documentada na Task 9), Drizzle/Neon (`postgres.js`), Zod, Vercel Cron, Resend best-effort, Vitest (unit + integração no branch Neon `test` via `DATABASE_URL_TEST`), Playwright E2E existente **intocado** (ver invariantes abaixo).

## Global Constraints

- **Regra de ouro:** antes de cada task, re-validar os trechos citados contra o `master` atual (G0 reescreveu `verificar-alertas/route.ts` e `format.ts`; G1 mexeu em `report-to-task.ts`/`.repository.ts`, `AchadosCards.tsx`, `contracts.ts`, `report-view-model.ts`). Ler o arquivo REAL antes de editar.
- Next 14 App Router + Drizzle + Neon — **testes de integração SÓ no branch `test` via `DATABASE_URL_TEST`** (`describe.skipIf(!process.env.DATABASE_URL_TEST)`, cleanup em `afterAll`/`finally`, prefixo `ta-test-` nos dados). `tests/setup.ts` é intocável.
- **TDD com vitest (`npm run test`):** teste falhando → rodar e VER falhar → implementar → rodar e VER passar → commit. Rodar `npm run test -- <arquivo>` para suíte pontual e `npm run test` + `npm run typecheck` antes de cada commit.
- **Copy pt-BR SEMPRE** (UI, e-mails, notificações, mensagens de erro); commits em português no padrão `feat(g3): ...` / `fix(g3): ...` / `test(g3): ...`.
- **Multi-tenancy sagrado:** cliente usa `access.orgId` da sessão (NUNCA lê orgId de form); analista/admin passam por `assertOrgAccess(access, orgId)` (analista: só carteira; admin: tudo) ANTES de qualquer repositório; toda query nova escopada por `org_id` (ou por papel, no caso das agregadas do analista — seguir o padrão de `listTasksEmRevisao`).
- **E-mail/notify best-effort:** NUNCA lança, NUNCA quebra o fluxo de negócio (padrões `sendEmail` em `email.ts:24-48` e `dispatch` em `task-notifications.ts:30-57`).
- **Crons idempotentes:** auth `Authorization: Bearer ${CRON_SECRET}` com `secretsMatch` timing-safe; falha em UMA org/task não aborta o lote (try/catch + `logger`); `vercel.json` só GANHA entradas (nunca sobrescrever as existentes).
- **Transições de status:** `podeTransicionar` (task-transitions.ts) permanece a ÚNICA porta — nenhuma task deste plano cria caminho alternativo de mudança de status; UI nova (select "Mover para…") só OFERECE destinos que `podeTransicionar` aprova e o servidor revalida via `moveTask`.
- **Migrations SEMPRE aditivas** (ADD COLUMN com default/nullable). Única migration desta fase: `task_templates` + `prioridade`/`prazo_dias` (Task 10). Aplicar no branch `test` com `npm run db:migrate:test` antes dos testes de integração; Neon MAIN é passo operacional do dono.
- **Preservar 100% os testids/fluxos E2E.** Guards: `tests/e2e/plano-de-acao.spec.ts` usa `kanban-col-backlog`, `kanban-col-em_andamento`, `kanban-col-em_revisao`, `task-card`, `task-concluir`, `nova-task-form` (input `name="titulo"` + submit) e o texto de aba "Nova task"; `tests/e2e/relatorio-task.spec.ts` usa `resumo-executivo`, `virar-task-gargalos-0` (texto final "Task criada"), `kanban-col-backlog`, `task-card`. **Nenhum desses pode sumir ou mudar de semântica.** Os specs NÃO usam as setas `←→↑↓` do TaskCard (verificado) — a Task 9 pode substituí-las sem tocar spec. Intocáveis também (usados por outros specs/UI): `aprovar-task`, `revisao-queue`, `carteira-org`, `nav-plano-badge`, `notification-bell`, `notification-unread`, `criar-todas-{fonte}`, `virar-task-{fonte}-{i}`, `virar-task-achados-{i}` (G1), `nova-task-template-form`, `task-atividades`, `task-impacto`, `stat-concluidas-7d`, `stat-concluidas-30d`, `stat-tempo-medio`, `analistas-metrics-table`. Mudança de spec E2E só com step explícito e justificativa — este plano NÃO tem nenhuma.
- **Testes de integração que este plano ALTERA de propósito** (com justificativa nos steps): `tests/integration/tasks-actions.test.ts` (Task 10 — fallback de destinatário) e, se o `toEqual` do response existir pós-G0, `tests/integration/cron-verificar-alertas.test.ts` (Task 7 — campo aditivo no JSON). Nada mais.
- **Sem libs novas.**
- **Branch:** `feat/g3-melhor-crm` a partir de `master` (pós-G0+G1). Merge `--no-ff` só após a Task 13 (revisão ampla).

## Constantes de negócio (decididas AQUI — não rediscutir)

| Constante | Valor | Onde | Significado |
|---|---|---|---|
| `SLA_DIAS` | `{ alta: 7, media: 14, baixa: 30 }` | sla.ts | prazo default por prioridade, a partir de hoje BRT |
| `VENCE_EM_BREVE_DIAS` | `2` | sla.ts | `statusPrazo` → `vence_em_breve` quando prazo ≤ hoje+2 |
| `LEMBRETE_ANTECEDENCIA_DIAS` | `2` | lembretes-prazo.ts | cobrança "vence em breve" |
| `VENCEM_JANELA_DIAS` | `7` | analista.repository.ts | "Vencem em 7d" do Meu dia |
| `SEM_ATIVIDADE_DIAS` | `14` | analista.repository.ts | task aberta sem update há 14d |
| `MEU_DIA_LIMITE` | `50` | analista.repository.ts | máx. itens por lista do Meu dia |
| Cron digest semanal | `0 12 * * 1` | vercel.json | segunda 12h UTC = 9h BRT |
| `DEDUP_CONCLUIDAS_LIMITE` | `500` | task.repository.ts | máx. concluídas varridas p/ reincidência |
| `TEMPO_MEDIO_JANELA_DIAS` | `90` | analista.repository.ts | janela do tempo médio de conclusão |
| Ordenação de coluna kanban | prioridade (alta→baixa) → prazo asc (null por último) → ordem asc | kanban-order.ts | Task 9 |
| Rótulo de prazo | `<0`→"Atrasada há Nd" · `0`→"Vence hoje" · `1`→"Vence amanhã" · `≤7`→"D-N" · resto→"dd/mm" | sla.ts `labelPrazo` | cards/fila |

## Divergências do brief → adaptações (verificadas no código real)

1. **`podeTransicionar` vive em `src/modules/tasks/task-transitions.ts`**, não em `task.types.ts` (o brief mandava confirmar — confirmado). `task.types.ts` tem `isTaskAtrasada` (com o bug UTC nas linhas 71-72) e os labels.
2. **`useOptimistic` não existe em React 18.3.1** (`package.json`: react `^18.3.1`; o repo usa `useFormState`, upgrade React 19 é fase futura explícita da auditoria). Task 9 implementa o otimismo com `useState` + `useTransition` — mesma UX, API disponível.
3. **`listTasksEmRevisao` NÃO devolve `updated_at`** (ordena por ele mas não seleciona — `analista.repository.ts:111-129`). O brief dizia "updated_at já vem"; a Task 5 ADICIONA o campo ao select e ao tipo.
4. **`taskComments.user_id` é NOT NULL** (insert em `task-comment.repository.ts:15` com `userId: string`; join `innerJoin(users)`), e `createTasksFromReport` roda com `actorUserId: string | null`. Logo o "comentário automático de reincidência" é inviável como comment → a nota de reincidência vai na DESCRIÇÃO + `task_activities` evento `reincidencia` (user_id nullable). Decisão documentada na Task 4.
5. **Fallback de destinatário quando org sem analista** (task-notifications.ts:40-41 descarta silencioso): NÃO usar "primeiro user admin_truth do banco" (no branch `test` compartilhado outras suítes criam admins → teste flaky e, em prod, admin arbitrário). Decisão: fallback = **e-mail para `getAdminAlertEmail()`** (env `ADMIN_ALERT_EMAIL ?? EMAIL_FROM`, determinístico, já é o padrão de falha de pipeline — `recipients.ts:26-28`), sem in-app. Task 10.
6. **"Task de template" placeholder**: `NewTaskFromTemplateForm` envia `titulo="Task de template"` oculto e confia no servidor sobrescrever; template inexistente/inativo cai no fluxo normal e cria a task placeholder (`tasks.actions.ts:137-148`). Fix na Task 10: erro `Template indisponível`.
7. **Meta/vendas do mês**: `getTotalVendasMesCorrente` vive em `src/modules/organizations/organization-settings.repository.ts:18-25` (o brief citava caminho `admin/`). O digest (Task 8) adiciona `getTotalVendasMesAnterior` ao MESMO arquivo, mesma convenção UTC.
8. **`parseChecklist` existe e é exportado** (`checklist-line.ts:43-53`) — confirmado; Task 9 o consome.
9. **A página do analista desabilita botões via `titulosExistentes` de `listTaskTitulosByReport`** (`analista/[orgId]/page.tsx:42-44`), não "um botão" — Task 4 troca a fonte para títulos ABERTOS da org inteira (`listTaskTitulosAbertos`).
10. **AchadosCards (G1) vive só na página de relatório do CLIENTE**; a aba "Achados do relatório" do analista continua com as 3 listas legadas. A conversão 2.0 (Task 3) evolui `AchadosCards`; o caminho do analista fica como está (fora de escopo, anotado).

## File Structure

| Caminho | Ação | Task | Responsabilidade |
|---|---|---|---|
| `src/modules/tasks/sla.ts` | criar | 1 | `SLA_DIAS`, `somarDias`, `prazoDefault`, `statusPrazo`, `diasAtePrazo`, `labelPrazo`, `diasDesde` (puros) |
| `src/modules/tasks/task.types.ts` | mod | 1 | `isTaskAtrasada` em BRT via `hojeBrt` |
| `src/actions/tasks.actions.ts` | mod | 1, 2, 3, 9, 10 | prazo default; `redirectTo` no delete; itens com overrides; `moveTaskAction`; gatilhos + fix template |
| `src/modules/tasks/report-to-task.repository.ts` | mod | 1, 3, 4 | prazo default nas tasks de IA; baseline+link+playbook; dedup cross-report |
| `src/components/tasks/TaskEditForm.tsx` | criar | 2 | edição + exclusão (analista/admin) com ConfirmDialog |
| `src/components/tasks/TaskDetail.tsx` | mod | 2, 4, 12 | monta TaskEditForm; badge Reincidente; timeline com autor + labels |
| `src/modules/tasks/report-to-task.ts` | mod | 3 | `achadoToTaskInput` ganha `extras` (baseline, link, checklist playbook) |
| `src/modules/tasks/task-template.repository.ts` | mod | 3, 10 | `getTemplateAtivoPorTipo`; campos `prioridade`/`prazoDias` |
| `src/components/tasks/AchadosCards.tsx` | mod | 3 | mini-form de conversão (prazo + checkbox playbook) |
| `src/app/(client)/dashboard/relatorios/[id]/page.tsx` | mod | 3, 4 | passa `playbooksPorTipo`; titulosExistentes → abertos da org |
| `src/modules/tasks/task.repository.ts` | mod | 4, 9 | `listTaskTitulosAbertos`, `findTaskConcluidaPorTitulo`; `listTasksKanban` |
| `src/app/analista/[orgId]/page.tsx` | mod | 4, 9 | titulosExistentes → abertos da org; `listTasksKanban` |
| `src/modules/analista/analista.repository.ts` | mod | 5, 6, 11, 12 | `listTasksEmRevisao`+updatedAt; `getCarteira` GROUP BY + `getMeuDia`; `getImpactoPorOrg`; tempo médio 90d |
| `src/components/tasks/RevisaoQueue.tsx` | mod | 5 | link p/ task, badges prioridade+prazo, "aguardando há Xd" |
| `src/app/analista/meu-dia.tsx` | criar | 6 | faixa consolidada cross-org (server) |
| `src/app/analista/page.tsx` | mod | 6, 11 | Meu dia + carteira ordenada por criticidade + impacto por org |
| `src/modules/tasks/lembretes-prazo.ts` | criar | 7 | detector + dedup por task_activities + notify/e-mail |
| `src/app/api/cron/verificar-alertas/route.ts` | mod | 7 | passo `processarLembretesDePrazo` (aditivo, pós-G0) |
| `src/modules/notifications/templates.ts` | mod | 7, 8, 10 | `lembretePrazoTemplate`, `digestSemanalTemplate`, `taskRevisaoTemplate` |
| `src/modules/notifications/email.ts` | mod | 7, 8, 10 | senders correspondentes |
| `src/modules/tasks/digest-semanal.ts` | criar | 8 | resumo semanal por org (puro + I/O) |
| `src/app/api/cron/digest-semanal/route.ts` | criar | 8 | cron semanal autenticado |
| `vercel.json` | mod | 8 | + cron `0 12 * * 1` (preservar existentes) |
| `src/modules/organizations/organization-settings.repository.ts` | mod | 8 | `getTotalVendasMesAnterior` |
| `src/modules/tasks/kanban-order.ts` | criar | 9 | `ordenarColuna` pura |
| `src/components/tasks/KanbanBoard.tsx` | mod | 9, 12 | client + otimista + colunas ordenadas + empty CTA |
| `src/components/tasks/TaskCard.tsx` | mod | 9 | prazo/checklist/comentários + `MoverTaskSelect` (remove setas) |
| `src/components/tasks/MoverTaskSelect.tsx` | criar | 9 | select de transições válidas |
| `src/app/(client)/dashboard/plano-de-acao/page.tsx` | mod | 9, 12 | `listTasksKanban` + CTA relatório |
| `src/modules/notifications/recipients.ts` | mod | 10 | (sem função nova — decisão 5 usa `getAdminAlertEmail` existente) |
| `src/modules/tasks/task-notifications.ts` | mod | 10 | `notifyTaskCriadaPeloCliente`, `notifyTasksDoRelatorioParaAnalista`, fallback e-mail admin |
| `src/components/app-shell.tsx` | mod | 10 | nav admin ganha "Carteira" (/analista) |
| `src/db/schema/task-templates.ts` | mod | 10 | + `prioridade`, `prazo_dias` → migration 0010 |
| `src/actions/task-templates.actions.ts` | mod | 10 | schema + campos novos |
| `src/app/admin/playbooks/playbooks-manager.tsx` | mod | 10 | campos prioridade/prazo_dias |
| `src/components/tasks/NewTaskFromTemplateForm.tsx` | mod | 10 | remove selects de prioridade/prazo (template manda) |
| `src/modules/tasks/task-impact.ts` | mod | 11 | baseline p/ task SEM report_id |
| `src/modules/reports/report.repository.ts` | mod | 11 | `getPrimeiroDoneReport`, `getDoneMaisProximo` |
| `src/modules/analista/impacto-renovacao.ts` | criar | 11 | modelo puro `impactoRenovacao` |
| `src/app/admin/consultoria/page.tsx` | mod | 11, 12 | seção "Impacto por cliente" |
| `src/modules/tasks/task-activity.repository.ts` | mod | 12 | timeline com `userEmail` |
| `src/modules/notifications/notification.repository.ts` | mod | 12 | `listNotificationsPage` |
| `src/components/notifications/NotificationBell.tsx` | mod | 12 | link "Ver todas" (prop `verTodasHref`) |
| `src/app/(client)/dashboard/notificacoes/page.tsx` | criar | 12 | página paginada |
| `tests/unit/*`, `tests/integration/*` | criar/mod | todas | ver tasks |

**Dependências entre tasks:** 1→{3,5,6,7,9,10} (`sla.ts`), 3→4 (mesmo loop do repositório), 4→{3-UI} (titulosExistentes), 7→8 (padrão de template/sender), 9 usa 1 (`labelPrazo`), 10 usa 7 (swap do destinatário do lembrete atrasado), 11 independente pós-1, 12 por último (higiene). Ordem de execução = ordem numérica.

---
### Task 1: SLA por prioridade (domínio) + prazo default em TODA criação + fix BRT

**Files:**
- Create: `src/modules/tasks/sla.ts`
- Modify: `src/modules/tasks/task.types.ts:69-73` (`isTaskAtrasada`)
- Modify: `src/actions/tasks.actions.ts:150-161` (createTaskAction)
- Modify: `src/modules/tasks/report-to-task.repository.ts` (createTask calls do loop)
- Test: `tests/unit/sla.test.ts` (criar), `tests/integration/report-to-task-prazo.test.ts` (criar)

**Interfaces:**
- Consumes: `hojeBrt(agora?: Date): string` de `@/lib/timezone` (G0 — devolve `'yyyy-mm-dd'` no fuso America/Sao_Paulo); `TaskPrioridade` de `task.types.ts`; `createTask` (`task.repository.ts:47` — já aceita `prazo?: string | null`); `createTaskAction` (tasks.actions.ts:115); loop de `createTasksFromReport` (report-to-task.repository.ts — pós-G1 tem DOIS ramos de `createTask`: achados e legado).
- Produces (contratos consumidos pelas Tasks 3, 5, 6, 7, 9, 10):

```ts
// src/modules/tasks/sla.ts (100% puro)
export const SLA_DIAS: Record<TaskPrioridade, number>; // { alta: 7, media: 14, baixa: 30 }
export const VENCE_EM_BREVE_DIAS = 2;
export function somarDias(dia: string, dias: number): string; // 'yyyy-mm-dd' + N dias (aritmética UTC pura)
export function prazoDefault(prioridade: TaskPrioridade, aPartirDe?: string): string; // default aPartirDe = hojeBrt()
export type StatusPrazo = 'sem_prazo' | 'no_prazo' | 'vence_em_breve' | 'atrasada';
export function statusPrazo(prazo: string | null, hoje?: string): StatusPrazo;
export function diasAtePrazo(prazo: string, hoje?: string): number; // negativo = atrasada
export function labelPrazo(prazo: string | null, hoje?: string): string | null;
export function diasDesde(quando: Date, agora?: Date): number; // floor((agora-quando)/dia) — "aguardando há Xd"
```

Semântica: `statusPrazo` NÃO olha o status da task (o chamador filtra `concluida`); `prazo < hoje` → `atrasada`; `prazo ≤ hoje+2` → `vence_em_breve`; senão `no_prazo`. `tasks.prazo` é `date mode:'string'` (schema `tasks.ts:19`) — comparação lexicográfica de `'yyyy-mm-dd'` é correta.

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/unit/sla.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import {
  SLA_DIAS,
  diasAtePrazo,
  diasDesde,
  labelPrazo,
  prazoDefault,
  somarDias,
  statusPrazo,
} from '@/modules/tasks/sla';

describe('somarDias', () => {
  it('soma atravessando mês e ano', () => {
    expect(somarDias('2026-07-14', 7)).toBe('2026-07-21');
    expect(somarDias('2026-07-28', 7)).toBe('2026-08-04');
    expect(somarDias('2026-12-30', 30)).toBe('2027-01-29');
  });
});

describe('prazoDefault', () => {
  it('alta=7d, media=14d, baixa=30d a partir da data dada', () => {
    expect(SLA_DIAS).toEqual({ alta: 7, media: 14, baixa: 30 });
    expect(prazoDefault('alta', '2026-07-14')).toBe('2026-07-21');
    expect(prazoDefault('media', '2026-07-14')).toBe('2026-07-28');
    expect(prazoDefault('baixa', '2026-07-14')).toBe('2026-08-13');
  });
});

describe('statusPrazo', () => {
  it('classifica sem_prazo/no_prazo/vence_em_breve/atrasada', () => {
    expect(statusPrazo(null, '2026-07-14')).toBe('sem_prazo');
    expect(statusPrazo('2026-07-13', '2026-07-14')).toBe('atrasada');
    expect(statusPrazo('2026-07-14', '2026-07-14')).toBe('vence_em_breve'); // vence hoje
    expect(statusPrazo('2026-07-16', '2026-07-14')).toBe('vence_em_breve'); // hoje+2
    expect(statusPrazo('2026-07-17', '2026-07-14')).toBe('no_prazo');
  });
});

describe('diasAtePrazo e labelPrazo', () => {
  it('conta dias com sinal', () => {
    expect(diasAtePrazo('2026-07-17', '2026-07-14')).toBe(3);
    expect(diasAtePrazo('2026-07-12', '2026-07-14')).toBe(-2);
  });

  it('rótulos pt-BR por faixa', () => {
    expect(labelPrazo(null, '2026-07-14')).toBeNull();
    expect(labelPrazo('2026-07-12', '2026-07-14')).toBe('Atrasada há 2d');
    expect(labelPrazo('2026-07-14', '2026-07-14')).toBe('Vence hoje');
    expect(labelPrazo('2026-07-15', '2026-07-14')).toBe('Vence amanhã');
    expect(labelPrazo('2026-07-17', '2026-07-14')).toBe('D-3');
    expect(labelPrazo('2026-08-20', '2026-07-14')).toBe('20/08');
  });
});

describe('diasDesde', () => {
  it('dias inteiros desde um instante', () => {
    const agora = new Date('2026-07-14T12:00:00Z');
    expect(diasDesde(new Date('2026-07-11T10:00:00Z'), agora)).toBe(3);
    expect(diasDesde(new Date('2026-07-14T09:00:00Z'), agora)).toBe(0);
  });
});
```

- [ ] **Step 2:** `npm run test -- tests/unit/sla.test.ts` → **FALHA** (módulo não existe).

- [ ] **Step 3:** Criar `src/modules/tasks/sla.ts`:

```ts
import { hojeBrt } from '@/lib/timezone';

import type { TaskPrioridade } from './task.types';

/** SLA de prazo por prioridade (dias corridos a partir de hoje BRT). */
export const SLA_DIAS: Record<TaskPrioridade, number> = { alta: 7, media: 14, baixa: 30 };

export const VENCE_EM_BREVE_DIAS = 2;

const DIA_MS = 86_400_000;

function paraUtcMs(dia: string): number {
  const [y, m, d] = dia.split('-').map(Number);
  return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
}

/** Soma N dias a um dia-calendário 'yyyy-mm-dd' (aritmética UTC pura). */
export function somarDias(dia: string, dias: number): string {
  return new Date(paraUtcMs(dia) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Prazo default pela convenção de SLA: alta=7d, media=14d, baixa=30d. */
export function prazoDefault(prioridade: TaskPrioridade, aPartirDe: string = hojeBrt()): string {
  return somarDias(aPartirDe, SLA_DIAS[prioridade]);
}

export type StatusPrazo = 'sem_prazo' | 'no_prazo' | 'vence_em_breve' | 'atrasada';

/**
 * Classifica um prazo ('yyyy-mm-dd' | null) contra hoje BRT. NÃO olha o
 * status da task — o chamador exclui `concluida` antes.
 */
export function statusPrazo(prazo: string | null, hoje: string = hojeBrt()): StatusPrazo {
  if (!prazo) return 'sem_prazo';
  if (prazo < hoje) return 'atrasada';
  if (prazo <= somarDias(hoje, VENCE_EM_BREVE_DIAS)) return 'vence_em_breve';
  return 'no_prazo';
}

/** Dias até o prazo (negativo = atrasada). */
export function diasAtePrazo(prazo: string, hoje: string = hojeBrt()): number {
  return Math.round((paraUtcMs(prazo) - paraUtcMs(hoje)) / DIA_MS);
}

/** Rótulo curto pt-BR do prazo para cards e filas. */
export function labelPrazo(prazo: string | null, hoje: string = hojeBrt()): string | null {
  if (!prazo) return null;
  const dias = diasAtePrazo(prazo, hoje);
  if (dias < 0) return `Atrasada há ${-dias}d`;
  if (dias === 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  if (dias <= 7) return `D-${dias}`;
  return `${prazo.slice(8, 10)}/${prazo.slice(5, 7)}`;
}

/** Dias inteiros decorridos desde um instante ("aguardando há Xd"). */
export function diasDesde(quando: Date, agora: Date = new Date()): number {
  return Math.max(0, Math.floor((agora.getTime() - quando.getTime()) / DIA_MS));
}
```

- [ ] **Step 4:** `npm run test -- tests/unit/sla.test.ts` → **PASSA**.

- [ ] **Step 5 (fix BRT no isTaskAtrasada):** Em `src/modules/tasks/task.types.ts`, adicionar `import { hojeBrt } from '@/lib/timezone';` no topo e trocar o corpo (linhas 69-73):

```ts
export function isTaskAtrasada(task: Pick<TaskSummary, 'prazo' | 'status'>, hoje: Date = new Date()): boolean {
  if (!task.prazo || task.status === 'concluida') return false;
  // Dia-calendário em America/Sao_Paulo (o antigo toISOString().slice(0,10)
  // era UTC: entre 21h e 0h BRT a task "atrasava" 3h antes da meia-noite).
  return task.prazo < hojeBrt(hoje);
}
```

Adicionar em `tests/unit/sla.test.ts` (mesmo arquivo, describe novo):

```ts
import { isTaskAtrasada } from '@/modules/tasks/task.types';

describe('isTaskAtrasada em BRT', () => {
  it('às 02:59Z ainda é o dia anterior em BRT — task com prazo de ontem UTC não está atrasada', () => {
    // 2026-07-15T02:59Z = 2026-07-14 23:59 BRT → hoje BRT = 2026-07-14
    expect(isTaskAtrasada({ prazo: '2026-07-14', status: 'todo' }, new Date('2026-07-15T02:59:00Z'))).toBe(false);
    expect(isTaskAtrasada({ prazo: '2026-07-14', status: 'todo' }, new Date('2026-07-15T03:00:00Z'))).toBe(true);
    expect(isTaskAtrasada({ prazo: '2026-07-13', status: 'concluida' }, new Date('2026-07-15T03:00:00Z'))).toBe(false);
  });
});
```

Rodar → **PASSA**.

- [ ] **Step 6 (integração falha primeiro):** Criar `tests/integration/report-to-task-prazo.test.ts` (boilerplate de `report-to-task-action.test.ts`):

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '@/db/client';
import { organizations, reports, taskActivities, tasks } from '@/db/schema';
import { createTasksFromReport } from '@/modules/tasks/report-to-task.repository';
import { prazoDefault } from '@/modules/tasks/sla';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-r2t-prazo-';

const SAMPLE_ANALISE = {
  resumoExecutivo: 'R.',
  gargalos: [`${PREFIX}gargalo-${RUN}`],
  sugestoesMelhoria: [],
  ideiasVenda: [],
  recomendacoesPreco: [],
};

describe.skipIf(!url)('report-to-task — prazo default de SLA (integração)', () => {
  let orgId = '';
  let reportId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [rep] = await db
      .insert(reports)
      .values({
        org_id: orgId,
        status: 'done',
        periodo_inicio: new Date('2026-06-01'),
        periodo_fim: new Date('2026-06-30'),
        analise_ia: SAMPLE_ANALISE,
      })
      .returning({ id: reports.id });
    reportId = rep!.id;
  });

  afterAll(async () => {
    const rows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.org_id, orgId));
    for (const r of rows) await db.delete(taskActivities).where(eq(taskActivities.task_id, r.id));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(reports).where(eq(reports.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('task de IA nasce com prazo = prazoDefault(prioridade)', async () => {
    const criadas = await createTasksFromReport({
      reportId,
      orgId,
      itens: [{ fonte: 'gargalos', indice: 0 }],
      actorUserId: null,
    });
    expect(criadas).toBe(1);
    const [t] = await db.select().from(tasks).where(eq(tasks.org_id, orgId));
    expect(t!.prioridade).toBe('alta'); // PRIORIDADE_POR_FONTE.gargalos
    expect(t!.prazo).toBe(prazoDefault('alta')); // hoje BRT + 7d
  });
});
```

`npm run test -- tests/integration/report-to-task-prazo.test.ts` → **FALHA** (`prazo` null).

- [ ] **Step 7 (aplicar o default nas 3 origens):**

**`report-to-task.repository.ts`** — importar `prazoDefault` de `./sla` e, em TODO `createTask(...)` do loop de `createTasksFromReport` (pós-G1 são dois: ramo `achados` e ramo legado), adicionar `prazo: prazoDefault(t.prioridade),` ao objeto (o spread `...t` não traz prazo — `achadoToTaskInput`/`itemToTaskInput` não o produzem):

```ts
      await createTask({ orgId: input.orgId, ...t, prazo: prazoDefault(t.prioridade), actorUserId: input.actorUserId });
```

**`tasks.actions.ts` (createTaskAction)** — importar `prazoDefault` de `@/modules/tasks/sla` e trocar a linha `prazo: prazo ?? null,` do `createTask` (linha 159) por:

```ts
    prazo: prazo ?? prazoDefault(prioridade),
```

(cobre form do cliente/analista E o caminho de template — o refinamento por `template.prazo_dias` vem na Task 10).

- [ ] **Step 8:** `npm run test -- tests/integration/report-to-task-prazo.test.ts tests/unit/sla.test.ts` → **PASSA**. `npm run test` + `npm run typecheck` → verdes (a suíte antiga de report-to-task não asserta prazo null — se assertar, atualizar a asserção para o novo default com nota no commit).

- [ ] **Step 9:** **Commit:** `feat(g3): sla por prioridade — prazo default em toda criacao de task + isTaskAtrasada em BRT`

---
### Task 2: UI de edição e exclusão de task (TaskEditForm)

**Files:**
- Create: `src/components/tasks/TaskEditForm.tsx`
- Modify: `src/components/tasks/TaskDetail.tsx` (render p/ analista/admin)
- Modify: `src/actions/tasks.actions.ts:468-501` (`deleteTaskFormAction` + `redirectTo`)
- Test: `tests/integration/tasks-actions-edicao.test.ts` (criar)

**Interfaces:**
- Consumes: `updateTaskAction` (tasks.actions.ts:419 — stateful, **já bloqueia cliente** na linha 427 `if (ator === 'cliente') return { error: ... }`; campos `taskId, titulo?, descricao?, tipo?, prioridade?, prazo?('' limpa), assigneeUserId?`); `deleteTaskFormAction` (tasks.actions.ts:468 — fire-and-refresh, já bloqueia cliente); `ConfirmDialog` (props `{ open, title, description?, confirmLabel?, cancelLabel?, variant?, onConfirm, onCancel }` — padrão de uso em `src/app/(client)/conexoes/tracked-products.tsx`); `useToast` (`{ toast } = useToast()`, input `{ title, description?, variant: 'success'|'error'|'info' }`); primitivos `Button/Field/Input/Select`; `TaskDetail` model (`task.types.ts:51-56`).
- Produces:

```tsx
// TaskEditForm.tsx ('use client')
export function TaskEditForm(props: {
  task: { id: string; titulo: string; descricao: string; tipo: TaskTipo; prioridade: TaskPrioridade; prazo: string | null };
  orgId: string;
  backHref: string; // destino pós-exclusão
}): JSX.Element;
// testids: task-edit-form, task-edit-salvar, task-excluir
```

```ts
// deleteTaskFormAction: aceita campo opcional `redirectTo` (path interno começando com '/')
// e redireciona após excluir — a página de detalhe deixa de existir.
```

**Permissões (confirmadas no código):** cliente NÃO edita nem exclui — o gate já existe no servidor (updateTaskAction:427, deleteTaskFormAction:473-476); a UI só é renderizada quando `ator !== 'cliente'`. Nada a restringir na action.

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/integration/tasks-actions-edicao.test.ts` (padrão de mock de `password-reset-actions.test.ts` + mock de sessão):

```ts
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Sem contexto de request nos testes de action: revalidatePath e a sessão
// precisam de stub (padrão password-reset-actions.test.ts).
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const sessaoMock = { access: null as unknown };
vi.mock('@/modules/auth/require-session', () => ({
  requireSession: async () => sessaoMock.access,
}));

import { db } from '@/db/client';
import { organizations, taskActivities, tasks, users } from '@/db/schema';
import { deleteTaskFormAction, updateTaskAction } from '@/actions/tasks.actions';

const url = process.env.DATABASE_URL_TEST;
const RUN = Date.now();
const PREFIX = 'ta-test-edicao-';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

function isNextRedirect(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { digest?: unknown }).digest === 'string' &&
    (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  );
}

describe.skipIf(!url)('edição/exclusão de task via actions (integração)', () => {
  let orgId = '';
  let adminId = '';
  let taskId = '';

  beforeAll(async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${PREFIX}${RUN}`, status: 'active' })
      .returning({ id: organizations.id });
    orgId = org!.id;
    const [admin] = await db
      .insert(users)
      .values({ org_id: orgId, email: `${PREFIX}${RUN}@example.com`, senha_hash: 'h', role: 'admin_truth' })
      .returning({ id: users.id });
    adminId = admin!.id;
    const [t] = await db
      .insert(tasks)
      .values({ org_id: orgId, titulo: `${PREFIX}task-${RUN}`, criado_por: 'analista', prioridade: 'media' })
      .returning({ id: tasks.id });
    taskId = t!.id;
  });

  afterAll(async () => {
    await db.delete(taskActivities).where(eq(taskActivities.task_id, taskId));
    await db.delete(tasks).where(eq(tasks.org_id, orgId));
    await db.delete(users).where(eq(users.org_id, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('admin edita titulo/prioridade/prazo', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active' };
    const r = await updateTaskAction(
      {},
      form({ orgId, taskId, titulo: 'Título editado pelo admin', prioridade: 'alta', prazo: '2026-08-01' }),
    );
    expect(r.ok).toBe(true);
    const [t] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(t!.titulo).toBe('Título editado pelo admin');
    expect(t!.prioridade).toBe('alta');
    expect(t!.prazo).toBe('2026-08-01');
  });

  it('cliente é bloqueado pela action', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'client', orgStatus: 'active' };
    const r = await updateTaskAction({}, form({ taskId, titulo: 'Hack do cliente' }));
    expect(r.error).toBe('Você não tem permissão para editar esta tarefa.');
  });

  it('deleteTaskFormAction com redirectTo exclui e redireciona', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active' };
    let redirecionou = false;
    try {
      await deleteTaskFormAction(form({ orgId, taskId, redirectTo: `/analista/${orgId}` }));
    } catch (err) {
      if (!isNextRedirect(err)) throw err;
      redirecionou = true;
    }
    expect(redirecionou).toBe(true);
    const rows = await db.select().from(tasks).where(eq(tasks.id, taskId));
    expect(rows).toHaveLength(0);
  });
});
```

`npm run test -- tests/integration/tasks-actions-edicao.test.ts` → **FALHA** no 3º caso (`redirectTo` ainda não redireciona; os 2 primeiros devem passar — provam a permissão existente).

- [ ] **Step 2 (redirectTo no delete):** Em `tasks.actions.ts`, `deleteTaskFormAction`, após o `recordAudit` e o `revalidateTaskRoutes(orgId)` (fim da função), adicionar:

```ts
  // Exclusão a partir da página de detalhe: a página deixa de existir —
  // redireciona para onde o form mandar (só paths internos).
  const redirectTo = String(formData.get('redirectTo') ?? '');
  if (redirectTo.startsWith('/')) redirect(redirectTo);
```

(`redirect` já é importado no arquivo, linha 5.) Rodar o teste → **PASSA**.

- [ ] **Step 3 (componente):** Criar `src/components/tasks/TaskEditForm.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { deleteTaskFormAction, updateTaskAction, type TaskActionState } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import {
  PRIORIDADE_TASK_LABEL,
  TASK_PRIORIDADES,
  TASK_TIPOS,
  TIPO_TASK_LABEL,
  type TaskPrioridade,
  type TaskTipo,
} from '@/modules/tasks/task.types';

const initial: TaskActionState = {};

function SalvarButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} data-testid="task-edit-salvar">
      Salvar alterações
    </Button>
  );
}

/**
 * Edição + exclusão de task — SÓ analista/admin (o servidor também bloqueia
 * cliente em updateTaskAction/deleteTaskFormAction; aqui o componente nem é
 * montado para o cliente — ver TaskDetail).
 */
export function TaskEditForm({
  task,
  orgId,
  backHref,
}: {
  task: { id: string; titulo: string; descricao: string; tipo: TaskTipo; prioridade: TaskPrioridade; prazo: string | null };
  orgId: string;
  backHref: string;
}) {
  const [state, action] = useFormState(updateTaskAction, initial);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) toast({ variant: 'success', title: 'Tarefa atualizada' });
    if (state.error) toast({ variant: 'error', title: 'Não foi possível salvar.', description: state.error });
  }, [state, toast]);

  return (
    <details className="rounded-2xl border border-line bg-bg-surface p-5">
      <summary className="cursor-pointer font-heading text-sm font-semibold text-white">Editar tarefa</summary>

      <form action={action} data-testid="task-edit-form" className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="orgId" value={orgId} />

        <Field label="Título" htmlFor="task-edit-titulo" className="sm:col-span-2">
          <Input id="task-edit-titulo" name="titulo" defaultValue={task.titulo} required minLength={3} maxLength={200} />
        </Field>

        <Field label="Tipo" htmlFor="task-edit-tipo">
          <Select id="task-edit-tipo" name="tipo" defaultValue={task.tipo}>
            {TASK_TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {TIPO_TASK_LABEL[tipo]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Prioridade" htmlFor="task-edit-prioridade">
          <Select id="task-edit-prioridade" name="prioridade" defaultValue={task.prioridade}>
            {TASK_PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_TASK_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Prazo" htmlFor="task-edit-prazo">
          <Input id="task-edit-prazo" name="prazo" type="date" defaultValue={task.prazo ?? ''} />
        </Field>

        <Field label="Descrição (linhas `- [ ]` viram checklist)" htmlFor="task-edit-descricao" className="sm:col-span-2">
          <textarea
            id="task-edit-descricao"
            name="descricao"
            rows={5}
            maxLength={5000}
            defaultValue={task.descricao}
            className="w-full rounded-lg border border-line bg-bg-elevated px-3 py-2 text-white outline-none transition-colors placeholder:text-dim focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/50"
          />
        </Field>

        <div className="flex items-center justify-between sm:col-span-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="task-excluir"
            className="text-danger-fg"
            onClick={() => setConfirmarExclusao(true)}
          >
            Excluir tarefa
          </Button>
          <SalvarButton />
        </div>
      </form>

      {/* Exclusão: form separado (fire-and-refresh) disparado pelo ConfirmDialog. */}
      <form id={`excluir-task-${task.id}`} action={deleteTaskFormAction} className="hidden">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="redirectTo" value={backHref} />
      </form>

      <ConfirmDialog
        open={confirmarExclusao}
        title="Excluir esta tarefa?"
        description="Comentários e histórico também serão excluídos. Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="danger"
        onCancel={() => setConfirmarExclusao(false)}
        onConfirm={() => {
          setConfirmarExclusao(false);
          (document.getElementById(`excluir-task-${task.id}`) as HTMLFormElement | null)?.requestSubmit();
        }}
      />
    </details>
  );
}
```

*(nota: edição da descrição crua inclui as linhas de checklist markdown — comportamento intencional, o analista pode ajustar o checklist por texto; o hint no label explica.)*

- [ ] **Step 4 (montar no TaskDetail):** Em `TaskDetail.tsx`, importar `TaskEditForm` e, logo APÓS o `</header>` (linha 146), adicionar:

```tsx
      {ator !== 'cliente' && orgId ? (
        <TaskEditForm
          task={{
            id: task.id,
            titulo: task.titulo,
            descricao: task.descricao,
            tipo: task.tipo,
            prioridade: task.prioridade,
            prazo: task.prazo,
          }}
          orgId={orgId}
          backHref={backHref}
        />
      ) : null}
```

- [ ] **Step 5:** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/plano-de-acao.spec.ts` (com `DATABASE_URL_TEST`) → verde (cliente não vê o form — nada muda no fluxo do spec). Smoke manual: como analista, editar título/prazo e excluir com confirmação → volta ao kanban.

- [ ] **Step 6:** **Commit:** `feat(g3): ui de edicao e exclusao de task para analista/admin com confirmacao`

---
### Task 3: Conversão achado→task 2.0 (prazo, playbook, baseline e link do relatório)

**Files:**
- Modify: `src/modules/tasks/report-to-task.ts` (`achadoToTaskInput` ganha `extras`)
- Modify: `src/modules/tasks/report-to-task.repository.ts` (baseline + checklist do playbook)
- Modify: `src/modules/tasks/task-template.repository.ts` (+ `getTemplateAtivoPorTipo`)
- Modify: `src/actions/tasks.actions.ts:557-564` (itens com overrides opcionais)
- Modify: `src/components/tasks/AchadosCards.tsx` (mini-form por card)
- Modify: `src/app/(client)/dashboard/relatorios/[id]/page.tsx` (prop `playbooksPorTipo`)
- Test: `tests/unit/report-to-task-v2.test.ts` (criar), `tests/integration/report-to-task-v2.test.ts` (criar)

**Interfaces:**
- Consumes (G1 — revalidar): `achadoToTaskInput(achado: Achado, reportId: string)` em `report-to-task.ts` (fim do arquivo pós-G1; monta descricao com impacto/SKUs/origem/`- [ ] ` dos passos); `AchadosCards` (`'use client'`, props `{ reportId, achados, titulosExistentes }`, hidden input `itens` JSON, testids `virar-task-achados-{i}`); `createTasksFromReportAction` (zod `createTasksFromReportItemSchema = { fonte, indice }`, tasks.actions.ts:557-560); `MetricasSchema` + `totalVendas` (`@/modules/reports/compare`); `formatBRL`; `prazoDefault` (Task 1); `CHECKLIST_UNCHECKED` (`checklist-line.ts:13`); `TaskTemplate` (`task-template.repository.ts:15-22`).
- Produces:

```ts
// report-to-task.ts
export type AchadoExtras = {
  baselineVendas?: number | null;      // total de vendas do período do relatório
  checklistPlaybook?: string[];        // itens extras (playbook por tipo)
};
export function achadoToTaskInput(achado: Achado, reportId: string, extras?: AchadoExtras): {
  titulo: string; descricao: string; tipo: TaskTipo; prioridade: TaskPrioridade; criadoPor: 'ia'; reportId: string;
}; // assinatura ESTENDIDA (parâmetro opcional — chamadas G1 existentes seguem compilando)

// task-template.repository.ts
export async function getTemplateAtivoPorTipo(tipo: TaskTipo): Promise<TaskTemplate | null>; // 1º ativo do tipo (created_at asc)

// tasks.actions.ts — item do zod ganha overrides opcionais:
// { fonte, indice, prazo?: 'yyyy-mm-dd', usarChecklistPlaybook?: boolean }

// report-to-task.repository.ts — createTasksFromReport aceita os overrides:
export async function createTasksFromReport(input: {
  reportId: string;
  orgId: string;
  itens: Array<{ fonte: FonteAnalise; indice: number; prazo?: string; usarChecklistPlaybook?: boolean }>;
  actorUserId: string | null;
}): Promise<number>;

// AchadosCards.tsx — prop nova:
// playbooksPorTipo?: Partial<Record<TaskTipo, { id: string; titulo: string }>>
```

Semântica da descrição v2 do achado (ordem das linhas): descricao → impacto (G1) → SKUs (G1) → `Vendas do período: R$ X` (novo, quando baseline) → `[Ver relatório](/dashboard/relatorios/{reportId})` (novo) → `_Origem: análise IA do relatório._` (G1) → checklist `comoFazer` (G1) → checklist do playbook (novo, após os passos da IA). Prazo do item: `item.prazo ?? prazoDefault(prioridade)` — vale para TODAS as fontes (o override chega do mini-form; "criar todas" não envia override).

**Invariante E2E:** `relatorio-task.spec.ts` usa a fonte legada `gargalos` sem overrides — o ramo legado só ganha o `prazo` opcional (já coberto pela Task 1) e NADA muda no render fallback. Os cards v2 (com mini-form) só aparecem quando `analiseIa.achados` existe.

- [ ] **Step 1 (teste unit falha primeiro):** Criar `tests/unit/report-to-task-v2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Achado } from '@/modules/pipeline/contracts';
import { achadoToTaskInput } from '@/modules/tasks/report-to-task';

const ACHADO: Achado = {
  titulo: 'Frete come 12% da receita no Mercado Livre',
  descricao: 'O frete médio de R$ 25 representa 12% da receita do canal.',
  tipo: 'logistica',
  prioridade: 'alta',
  impactoEstimadoMensalBRL: 1200,
  comoFazer: ['Ativar o Mercado Envios Full'],
  skus: ['SKU-001'],
};

describe('achadoToTaskInput v2 (extras)', () => {
  it('sem extras: comportamento G1 intacto (sem baseline nem link)', () => {
    const t = achadoToTaskInput(ACHADO, 'r1');
    expect(t.descricao).not.toContain('Vendas do período');
    expect(t.descricao).not.toContain('[Ver relatório]');
  });

  it('baseline vira linha "Vendas do período" + link markdown para o relatório', () => {
    const t = achadoToTaskInput(ACHADO, 'r1', { baselineVendas: 10880.5 });
    expect(t.descricao).toContain('Vendas do período: R$');
    expect(t.descricao).toContain('10.880,50');
    expect(t.descricao).toContain('[Ver relatório](/dashboard/relatorios/r1)');
  });

  it('checklist do playbook entra APÓS os passos da IA, como itens não marcados', () => {
    const t = achadoToTaskInput(ACHADO, 'r1', { checklistPlaybook: ['Conferir tabela de frete'] });
    const desc = t.descricao;
    expect(desc).toContain('- [ ] Ativar o Mercado Envios Full');
    expect(desc).toContain('- [ ] Conferir tabela de frete');
    expect(desc.indexOf('Ativar o Mercado Envios Full')).toBeLessThan(desc.indexOf('Conferir tabela de frete'));
  });

  it('baselineVendas null não gera linha', () => {
    const t = achadoToTaskInput(ACHADO, 'r1', { baselineVendas: null });
    expect(t.descricao).not.toContain('Vendas do período');
  });
});
```

`npm run test -- tests/unit/report-to-task-v2.test.ts` → **FALHA** (assinatura não aceita extras / link ausente).

- [ ] **Step 2 (implementar o puro):** Em `report-to-task.ts`, estender `achadoToTaskInput` (corpo G1 — revalidar contra o real; o resultado FINAL esperado):

```ts
export type AchadoExtras = {
  baselineVendas?: number | null;
  checklistPlaybook?: string[];
};

/** Conversão achado estruturado → task (v2: baseline, link do relatório e playbook). */
export function achadoToTaskInput(
  achado: Achado,
  reportId: string,
  extras?: AchadoExtras,
): { titulo: string; descricao: string; tipo: TaskTipo; prioridade: TaskPrioridade; criadoPor: 'ia'; reportId: string } {
  const linhas: string[] = [achado.descricao.trim()];
  if (achado.impactoEstimadoMensalBRL !== null) {
    linhas.push(`Impacto estimado: ${formatBRL(achado.impactoEstimadoMensalBRL)}/mês`);
  }
  if (achado.skus.length > 0) linhas.push(`SKUs: ${achado.skus.join(', ')}`);
  if (extras?.baselineVendas != null) {
    linhas.push(`Vendas do período: ${formatBRL(extras.baselineVendas)}`);
  }
  if (extras) {
    linhas.push(`[Ver relatório](/dashboard/relatorios/${reportId})`);
  }
  linhas.push('', '_Origem: análise IA do relatório._');
  if (achado.comoFazer.length > 0) {
    linhas.push(...achado.comoFazer.map((p) => `${CHECKLIST_UNCHECKED}${p}`));
  }
  if (extras?.checklistPlaybook && extras.checklistPlaybook.length > 0) {
    linhas.push(...extras.checklistPlaybook.map((p) => `${CHECKLIST_UNCHECKED}${p}`));
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

*(decisão: o link só aparece no fluxo v2 — `extras` presente — para não alterar byte a byte as descrições que `tests/unit/report-to-task-achados.test.ts` da G1 asserta sem extras).* Rodar o unit → **PASSA** (e a suíte G1 `report-to-task-achados.test.ts` continua verde).

- [ ] **Step 3 (repositório de template):** Em `task-template.repository.ts`, adicionar após `listTemplates` (juntar `and`/`asc` ao import do drizzle):

```ts
/** 1º template ATIVO do tipo (created_at asc) — playbook sugerido da conversão achado→task. */
export async function getTemplateAtivoPorTipo(tipo: TaskTipo): Promise<TaskTemplate | null> {
  const [row] = await db
    .select()
    .from(taskTemplates)
    .where(and(eq(taskTemplates.tipo, tipo), eq(taskTemplates.ativo, true)))
    .orderBy(asc(taskTemplates.created_at))
    .limit(1);
  return row ? rowToTemplate(row) : null;
}
```

- [ ] **Step 4 (teste de integração falha primeiro):** Criar `tests/integration/report-to-task-v2.test.ts` (boilerplate da Task 1 Step 6, `PREFIX = 'ta-test-r2t-v2-'`), semeando org + report `done` com `analise_ia` contendo `achados: [ACHADO]` (mesmo shape do unit; arrays legados vazios + `resumoExecutivo: 'R.'` + `recomendacoesPreco: []`), `metricas: { vendasPorCanal: [{ canal: 'shopee', total: 10880.5, pedidos: 48 }], evolucao: [], ticketMedio: 0, topProdutos: [], posicaoPreco: [], benchmarkParcial: false }`, e um template ativo `{ titulo: 'Playbook logística', tipo: 'logistica', checklist: ['Conferir tabela de frete'] }` (guardar `templateId` p/ cleanup):

```ts
  it('conversão v2: prazo do form, baseline das métricas, link e checklist do playbook', async () => {
    const criadas = await createTasksFromReport({
      reportId,
      orgId,
      itens: [{ fonte: 'achados', indice: 0, prazo: '2026-08-01', usarChecklistPlaybook: true }],
      actorUserId: null,
    });
    expect(criadas).toBe(1);
    const [t] = await db.select().from(tasks).where(eq(tasks.org_id, orgId));
    expect(t!.prazo).toBe('2026-08-01');
    expect(t!.descricao).toContain('Vendas do período: R$');
    expect(t!.descricao).toContain(`[Ver relatório](/dashboard/relatorios/${reportId})`);
    expect(t!.descricao).toContain('- [ ] Conferir tabela de frete');
  });
```

(cleanup no `afterAll`: além do padrão, `db.delete(taskTemplates).where(eq(taskTemplates.id, templateId))`.) Rodar → **FALHA**.

- [ ] **Step 5 (repositório da conversão):** Em `report-to-task.repository.ts`:

1. Estender o select do report: `.select({ org_id: reports.org_id, analise_ia: reports.analise_ia, metricas: reports.metricas })`.
2. Calcular o baseline UMA vez antes do loop:

```ts
import { AnaliseIaSchema, MetricasSchema } from '@/modules/pipeline/contracts';
import { totalVendas } from '@/modules/reports/compare';
import { prazoDefault } from './sla';
import { getTemplateAtivoPorTipo } from './task-template.repository';

  const metricasParsed = MetricasSchema.safeParse(rep.metricas);
  const baselineVendas = metricasParsed.success ? totalVendas(metricasParsed.data) : null;
```

3. Renomear a variável do loop para `item` (`for (const item of input.itens) { const { fonte, indice } = item;`). No ramo `fonte === 'achados'` (G1):

```ts
      const checklistPlaybook =
        item.usarChecklistPlaybook === true
          ? ((await getTemplateAtivoPorTipo(achado.tipo))?.checklist ?? [])
          : undefined;
      const t = achadoToTaskInput(achado, input.reportId, { baselineVendas, checklistPlaybook });
      await createTask({
        orgId: input.orgId,
        ...t,
        prazo: item.prazo ?? prazoDefault(t.prioridade),
        actorUserId: input.actorUserId,
      });
```

4. No ramo legado, o create vira `prazo: item.prazo ?? prazoDefault(t.prioridade)` (a Task 1 já pôs o `?? prazoDefault` — só acrescentar o `item.prazo ??`). Tipar `input.itens` conforme o Produces.

- [ ] **Step 6 (action):** Em `tasks.actions.ts`, estender o schema do item (linhas 557-560):

```ts
const createTasksFromReportItemSchema = z.object({
  fonte: z.enum(FONTES_ANALISE),
  indice: z.number().int().min(0),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  usarChecklistPlaybook: z.boolean().optional(),
});
```

(o resto da action não muda — `itens` já flui inteiro para `createTasksFromReport`). Rodar `npm run test -- tests/integration/report-to-task-v2.test.ts` → **PASSA**.

- [ ] **Step 7 (mini-form no AchadosCards):** Em `AchadosCards.tsx` (G1 — revalidar o arquivo real antes):

1. Props ganham `playbooksPorTipo?: Partial<Record<TaskTipo, { id: string; titulo: string }>>` (import `type TaskTipo` de `@/modules/tasks/task.types`).
2. Imports novos: `useState` (react) e `prazoDefault` de `@/modules/tasks/sla`.
3. Estados locais:

```tsx
  const [aberto, setAberto] = useState<number | null>(null);
  const [prazos, setPrazos] = useState<Record<number, string>>({});
  const [usarPlaybook, setUsarPlaybook] = useState<Record<number, boolean>>({});
```

4. `definirItens` passa a aceitar overrides: `Array<{ fonte: 'achados'; indice: number; prazo?: string; usarChecklistPlaybook?: boolean }>`.
5. O botão `virar-task-achados-{indice}` (quando NÃO `jaExiste`) vira `type="button"` que abre o mini-form (`onClick={() => setAberto(indice)}`; quando `jaExiste`, permanece como está — "Tarefa criada" desabilitado). O submit real sai do mini-form:

```tsx
{aberto === indice && !jaExiste ? (
  <div className="mt-2 space-y-2 rounded-xl border border-line bg-bg-elevated p-3" data-testid={`achado-form-${indice}`}>
    <p className="text-xs text-dim">
      Tipo: {TIPO_TASK_LABEL[achado.tipo]} · Prioridade: {PRIORIDADE_TASK_LABEL[achado.prioridade]}
    </p>
    <label className="block text-xs text-muted" htmlFor={`achado-prazo-${indice}`}>
      Prazo
      <input
        id={`achado-prazo-${indice}`}
        type="date"
        defaultValue={prazoDefault(achado.prioridade)}
        onChange={(e) => setPrazos((prev) => ({ ...prev, [indice]: e.target.value }))}
        className="mt-1 block w-full rounded-lg border border-line bg-bg-surface px-3 py-1.5 text-sm text-white outline-none focus:border-brand"
      />
    </label>
    {playbooksPorTipo?.[achado.tipo] ? (
      <label className="flex items-center gap-2 text-xs text-muted">
        <input
          type="checkbox"
          checked={usarPlaybook[indice] ?? true}
          onChange={(e) => setUsarPlaybook((prev) => ({ ...prev, [indice]: e.target.checked }))}
        />
        Usar checklist do playbook "{playbooksPorTipo[achado.tipo]!.titulo}"
      </label>
    ) : null}
    <Button
      type="submit"
      size="sm"
      data-testid={`achado-criar-${indice}`}
      onClick={() =>
        definirItens([
          {
            fonte: 'achados',
            indice,
            prazo: prazos[indice] ?? prazoDefault(achado.prioridade),
            usarChecklistPlaybook: playbooksPorTipo?.[achado.tipo] ? (usarPlaybook[indice] ?? true) : undefined,
          },
        ])
      }
    >
      Criar tarefa
    </Button>
  </div>
) : null}
```

6. Botão "criar todas" (se o G1 real tiver um, manter; senão adicionar no topo do form, testid `criar-todas-achados`): envia `ordenados.filter(({ achado }) => !existentes.has(tituloFromItem(achado.titulo))).map(({ indice }) => ({ fonte: 'achados' as const, indice }))` — SEM overrides (defaults do servidor).
7. No `useEffect` de sucesso existente, acrescentar `setAberto(null);`.

**Nota (SSR/client):** `prazoDefault()` chama `hojeBrt(new Date())` — determinístico por dia; risco de hydration mismatch só na virada do dia, aceitável para um `defaultValue` (anotar no commit).

- [ ] **Step 8 (página passa os playbooks):** Em `dashboard/relatorios/[id]/page.tsx`, onde `AchadosCards` é montado (G1 Task 9):

```ts
import { listTemplates } from '@/modules/tasks/task-template.repository';
import type { TaskTipo } from '@/modules/tasks/task.types';

  const templatesAtivos = rel.analiseIa?.achados?.length ? await listTemplates(true) : [];
  const playbooksPorTipo: Partial<Record<TaskTipo, { id: string; titulo: string }>> = {};
  for (const t of templatesAtivos) {
    playbooksPorTipo[t.tipo] ??= { id: t.id, titulo: t.titulo };
  }
```

e passar `playbooksPorTipo={playbooksPorTipo}` ao `<AchadosCards ... />`.

- [ ] **Step 9:** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/relatorio-task.spec.ts` → **verde** (seed sem `achados` → fallback legado intacto). Smoke manual com relatório v2 semeado: abrir mini-form, mudar prazo, criar → task com prazo escolhido + checklist do playbook + baseline + link.

- [ ] **Step 10:** **Commit:** `feat(g3): conversao achado->task 2.0 — prazo, playbook por tipo, baseline e link do relatorio`

---
### Task 4: Dedup cross-report + reincidência

**Files:**
- Modify: `src/modules/tasks/task.repository.ts` (+ `listTaskTitulosAbertos`, `findTaskConcluidaPorTitulo`)
- Modify: `src/modules/tasks/report-to-task.repository.ts` (dedup org-wide + nota de reincidência)
- Modify: `src/app/(client)/dashboard/relatorios/[id]/page.tsx` e `src/app/analista/[orgId]/page.tsx:42-44` (fonte do `titulosExistentes`)
- Modify: `src/components/tasks/TaskDetail.tsx` (badge Reincidente)
- Test: `tests/integration/report-to-task-dedup.test.ts` (criar)

**Interfaces:**
- Consumes: `normalizarTexto(s)` (report-to-task.ts:12-14 — lowercase + sem acentos); `tituloFromItem`; `listTaskTitulosByReport` (task.repository.ts:176 — NÃO remover, deixa de ser usado pelas páginas); `recordTaskActivity` (user_id nullable — task-activity.repository.ts:6-20); ramos do loop de `createTasksFromReport` (pós Tasks 1/3).
- Produces:

```ts
// task.repository.ts
export const DEDUP_CONCLUIDAS_LIMITE = 500;
export async function listTaskTitulosAbertos(orgId: string): Promise<string[]>; // títulos CRUS, status != 'concluida', org inteira
export async function findTaskConcluidaPorTitulo(
  orgId: string,
  titulo: string,
): Promise<{ id: string; titulo: string; updatedAt: Date } | null>;
// match por normalizarTexto contra concluídas (updated_at desc, varre ≤ DEDUP_CONCLUIDAS_LIMITE)
```

**Regras (decididas):** achado cujo título normalizado bate com task **ABERTA** da org (qualquer report) → pula. Bate com task **CONCLUÍDA** → cria e marca reincidência: linha `_Reincidente: recomendação já concluída anteriormente — [tarefa anterior](/dashboard/plano-de-acao/{id})._` no FIM da descrição + `recordTaskActivity({ evento: 'reincidencia', de: anteriorId, userId: actorUserId ?? null })`. **Sem comentário automático**: `taskComments.user_id` é NOT NULL e a conversão roda com `actorUserId: null` no caminho automático (divergência 4 do topo). O badge "Reincidente" no TaskDetail deriva do marcador `_Reincidente:` na descrição (o contrato de `tasks` não ganha coluna; TaskSummary não muda). O título NÃO ganha prefixo — prefixo quebraria o próprio dedup futuro.

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/integration/report-to-task-dedup.test.ts` (boilerplate da Task 1 Step 6, `PREFIX = 'ta-test-r2t-dedup-'`; imports `and`, `eq`, `ne` do drizzle). Seed: org + 2 reports done (`repAId`, `repBId`) ambos com `analise_ia = { resumoExecutivo: 'R.', gargalos: ['Custo de frete elevado no canal ML'], sugestoesMelhoria: [], ideiasVenda: [], recomendacoesPreco: [] }`:

```ts
  it('dedup cross-report: task ABERTA criada pelo repA bloqueia o mesmo achado no repB', async () => {
    const a = await createTasksFromReport({ reportId: repAId, orgId, itens: [{ fonte: 'gargalos', indice: 0 }], actorUserId: null });
    expect(a).toBe(1);
    const b = await createTasksFromReport({ reportId: repBId, orgId, itens: [{ fonte: 'gargalos', indice: 0 }], actorUserId: null });
    expect(b).toBe(0);
  });

  it('dedup é por título NORMALIZADO (caixa/acento diferentes ainda bloqueiam)', async () => {
    // torna a task existente CAIXA ALTA — normalizarTexto ainda bate
    await db.update(tasks).set({ titulo: 'CUSTO DE FRETE ELEVADO NO CANAL ML' }).where(eq(tasks.org_id, orgId));
    const b = await createTasksFromReport({ reportId: repBId, orgId, itens: [{ fonte: 'gargalos', indice: 0 }], actorUserId: null });
    expect(b).toBe(0);
  });

  it('reincidência: achado igual a task CONCLUÍDA cria de novo com nota + activity', async () => {
    await db.update(tasks).set({ status: 'concluida' }).where(eq(tasks.org_id, orgId));
    const b = await createTasksFromReport({ reportId: repBId, orgId, itens: [{ fonte: 'gargalos', indice: 0 }], actorUserId: null });
    expect(b).toBe(1);
    const novas = await db.select().from(tasks).where(and(eq(tasks.org_id, orgId), ne(tasks.status, 'concluida')));
    expect(novas).toHaveLength(1);
    expect(novas[0]!.descricao).toContain('_Reincidente: recomendação já concluída anteriormente');
    expect(novas[0]!.descricao).toContain('/dashboard/plano-de-acao/');
    const acts = await db
      .select()
      .from(taskActivities)
      .where(and(eq(taskActivities.task_id, novas[0]!.id), eq(taskActivities.evento, 'reincidencia')));
    expect(acts).toHaveLength(1);
    expect(acts[0]!.de).not.toBeNull(); // id da task anterior
  });
```

Rodar → **FALHA** (dedup atual é intra-report).

- [ ] **Step 2 (repositório de tasks):** Em `task.repository.ts` (perto de `listTaskTitulosByReport`; adicionar `ne` ao import do drizzle e `import { normalizarTexto } from './report-to-task';` — sem ciclo: `report-to-task.ts` só importa `task.types`):

```ts
export const DEDUP_CONCLUIDAS_LIMITE = 500;

/** Títulos CRUS das tasks ABERTAS da org (dedup cross-report + botões da UI). */
export async function listTaskTitulosAbertos(orgId: string): Promise<string[]> {
  const rows = await db
    .select({ titulo: tasks.titulo })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), ne(tasks.status, 'concluida')));
  return rows.map((r) => r.titulo);
}

/**
 * Task CONCLUÍDA mais recente cujo título normalizado bate com `titulo`
 * (reincidência). Varre no máx. DEDUP_CONCLUIDAS_LIMITE concluídas.
 */
export async function findTaskConcluidaPorTitulo(
  orgId: string,
  titulo: string,
): Promise<{ id: string; titulo: string; updatedAt: Date } | null> {
  const alvo = normalizarTexto(titulo);
  const rows = await db
    .select({ id: tasks.id, titulo: tasks.titulo, updatedAt: tasks.updated_at })
    .from(tasks)
    .where(and(eq(tasks.org_id, orgId), eq(tasks.status, 'concluida')))
    .orderBy(desc(tasks.updated_at))
    .limit(DEDUP_CONCLUIDAS_LIMITE);
  return rows.find((r) => normalizarTexto(r.titulo) === alvo) ?? null;
}
```

- [ ] **Step 3 (dedup no createTasksFromReport):** Em `report-to-task.repository.ts`, trocar a base de dedup (linha 23 pré-G1) e o miolo do loop. Imports novos: `findTaskConcluidaPorTitulo`, `listTaskTitulosAbertos` (task.repository), `normalizarTexto` (report-to-task), `recordTaskActivity` (task-activity.repository).

```ts
  // Dedup ORG-WIDE: títulos normalizados de tasks abertas (qualquer report).
  const abertosNorm = new Set((await listTaskTitulosAbertos(input.orgId)).map(normalizarTexto));
```

Em CADA ramo do loop (achados e legado), no lugar de `if (existentes.has(titulo)) continue;`:

```ts
    const tituloNorm = normalizarTexto(titulo);
    if (abertosNorm.has(tituloNorm)) continue;
    const anterior = await findTaskConcluidaPorTitulo(input.orgId, titulo);
```

e o create de cada ramo passa a capturar o id e anexar a nota:

```ts
    const descricaoFinal = anterior
      ? `${t.descricao}\n\n_Reincidente: recomendação já concluída anteriormente — [tarefa anterior](/dashboard/plano-de-acao/${anterior.id})._`
      : t.descricao;
    const taskId = await createTask({
      orgId: input.orgId,
      ...t,
      descricao: descricaoFinal,
      prazo: item.prazo ?? prazoDefault(t.prioridade),
      actorUserId: input.actorUserId,
    });
    if (anterior) {
      await recordTaskActivity({ taskId, userId: input.actorUserId ?? null, evento: 'reincidencia', de: anterior.id });
    }
    abertosNorm.add(tituloNorm);
    criadas += 1;
```

(o `Set existentes`/`listTaskTitulosByReport` sai deste arquivo.) Rodar o teste novo → **PASSA**. Rodar `npm run test -- tests/integration/report-to-task-action.test.ts tests/integration/report-to-task-prazo.test.ts tests/integration/report-to-task-v2.test.ts` → verdes (dedup intra-report continua coberto: a task aberta do mesmo report também está em `abertosNorm`).

- [ ] **Step 4 (UI usa títulos abertos da org):**

`dashboard/relatorios/[id]/page.tsx` — trocar `listTaskTitulosByReport(rel.id, orgId)` por `listTaskTitulosAbertos(orgId)` (manter o NOME `titulosExistentes`).

`analista/[orgId]/page.tsx:42-44` — trocar por:

```ts
  const titulosExistentes = relatorio?.analiseIa ? await listTaskTitulosAbertos(orgId) : [];
```

(botão "Task criada" agora reflete task aberta com o mesmo título em QUALQUER report — coerente com o servidor; para concluídas o botão fica ativo, reincidência é permitida.)

- [ ] **Step 5 (badge Reincidente):** Em `TaskDetail.tsx`, no bloco de badges do header (após o badge Atrasada, linha 142):

```tsx
          {task.descricao.includes('_Reincidente:') ? <Badge variant="warn">Reincidente</Badge> : null}
```

- [ ] **Step 6:** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/relatorio-task.spec.ts` → **verde** (1º clique cria — não há task aberta prévia; o botão vira "Task criada" pois o título entra em `listTaskTitulosAbertos`). **Commit:** `feat(g3): dedup cross-report por titulo normalizado + reincidencia com nota e activity`

---
### Task 5: Fila de revisão com contexto

**Files:**
- Modify: `src/modules/analista/analista.repository.ts:104-145` (`listTasksEmRevisao` + `updatedAt`)
- Modify: `src/components/tasks/RevisaoQueue.tsx`
- Test: `tests/integration/revisao-queue-data.test.ts` (criar)

**Interfaces:**
- Consumes: `listTasksEmRevisao(access)` (divergência 3 do topo: ordena por `updated_at` mas NÃO o seleciona — adicionar); `labelPrazo`/`statusPrazo`/`diasDesde` (Task 1); `PRIORIDADE_TASK_LABEL` e o mapa de variant `{ alta: 'danger', media: 'warn', baixa: 'neutral' }` (padrão TaskCard.tsx:18-22); `aprovarTaskFormAction`/`DevolverTaskButton` (mantidos).
- Produces:

```ts
// analista.repository.ts — retorno de listTasksEmRevisao ganha updatedAt:
Promise<Array<TaskSummary & { orgId: string; orgName: string; updatedAt: Date }>>
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/integration/revisao-queue-data.test.ts` (padrão `describe.skipIf` + `PREFIX = 'ta-test-revq-'`): semear org com `analista_id` de um user analista + 1 task `status: 'em_revisao'`; chamar `listTasksEmRevisao({ id: analistaId, orgId, role: 'analista' } as UserAccess)` e assertar que o item traz `updatedAt` instância de `Date` e `orgName` correto. Cleanup padrão. Rodar → **FALHA** (`updatedAt` undefined).

- [ ] **Step 2:** Em `listTasksEmRevisao`, adicionar ao select `updated_at: tasks.updated_at,` e ao map `updatedAt: r.updated_at,`; ajustar o tipo de retorno conforme o Produces. Rodar → **PASSA**.

- [ ] **Step 3 (componente):** Reescrever `src/components/tasks/RevisaoQueue.tsx`:

```tsx
import Link from 'next/link';

import { aprovarTaskFormAction } from '@/actions/tasks.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { diasDesde, labelPrazo, statusPrazo } from '@/modules/tasks/sla';
import { PRIORIDADE_TASK_LABEL, type TaskPrioridade, type TaskSummary } from '@/modules/tasks/task.types';

import { DevolverTaskButton } from './DevolverTaskButton';

type ItemFila = TaskSummary & { orgId: string; orgName: string; updatedAt: Date };

const PRIORIDADE_VARIANT: Record<TaskPrioridade, 'danger' | 'warn' | 'neutral'> = {
  alta: 'danger',
  media: 'warn',
  baixa: 'neutral',
};

/** Fila global de tasks em revisão das orgs da carteira — usada em /analista. */
export function RevisaoQueue({ items }: { items: ItemFila[] }) {
  if (items.length === 0) {
    return <EmptyState title="Nenhuma task aguardando revisão" />;
  }

  return (
    <ul data-testid="revisao-queue" className="divide-y divide-line rounded-2xl border border-line bg-bg-surface">
      {items.map((item) => {
        const prazoLabel = labelPrazo(item.prazo);
        const atrasada = statusPrazo(item.prazo) === 'atrasada';
        const aguardando = diasDesde(item.updatedAt);
        return (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-xs text-dim">{item.orgName}</p>
              <Link
                href={`/analista/${item.orgId}/tasks/${item.id}`}
                className="text-sm font-medium text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                {item.titulo}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant={PRIORIDADE_VARIANT[item.prioridade]}>{PRIORIDADE_TASK_LABEL[item.prioridade]}</Badge>
                {prazoLabel ? <Badge variant={atrasada ? 'danger' : 'neutral'}>{prazoLabel}</Badge> : null}
                <span className="text-xs text-dim">aguardando há {aguardando}d</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <form action={aprovarTaskFormAction}>
                <input type="hidden" name="taskId" value={item.id} />
                <input type="hidden" name="orgId" value={item.orgId} />
                <Button type="submit" size="sm" data-testid="aprovar-task">
                  Aprovar
                </Button>
              </form>
              <DevolverTaskButton taskId={item.id} orgId={item.orgId} titulo={item.titulo} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

(testids `revisao-queue` e `aprovar-task` preservados; Aprovar/Devolver intactos. `labelPrazo`/`statusPrazo`/`diasDesde` rodam no servidor — RevisaoQueue segue server component.)

- [ ] **Step 4:** `npm run test` + `npm run typecheck` verdes. Smoke: /analista com task em revisão → título linka pro detalhe, badges e "aguardando há Xd" visíveis. **Commit:** `feat(g3): fila de revisao com link, prioridade, prazo e tempo de espera`

---
### Task 6: "Meu dia" do analista + fix N+1 da carteira

**Files:**
- Modify: `src/modules/analista/analista.repository.ts` (reescrever `getCarteira` com GROUP BY; + `getMeuDia`; `countTasksAtrasadas` sai)
- Create: `src/app/analista/meu-dia.tsx`
- Modify: `src/app/analista/page.tsx`
- Test: `tests/integration/analista-meu-dia.test.ts` (criar)

**Interfaces:**
- Consumes: `getCarteira(access)` (analista.repository.ts:84-102 — hoje faz 2 queries POR org via `Promise.all` de `countTasksByStatus` + `countTasksAtrasadas`, o N+1 da auditoria; `countTasksAtrasadas` usa `CURRENT_DATE` = UTC do banco, bug de fuso); `listClientOrganizations` (admin.repository.ts:46); `hojeBrt`/`somarDias` (timezone/sla); `labelPrazo` (Task 1); padrão de escopo por papel de `listTasksEmRevisao` (admin: sem filtro; analista: `organizations.analista_id = access.id`).
- Produces:

```ts
// analista.repository.ts
export const VENCEM_JANELA_DIAS = 7;
export const SEM_ATIVIDADE_DIAS = 14;
export const MEU_DIA_LIMITE = 50;

export type MeuDiaItem = {
  taskId: string;
  orgId: string;
  orgName: string;
  titulo: string;
  prazo: string | null;
  status: TaskStatus;
  updatedAt: Date;
};
export type MeuDia = {
  atrasadas: MeuDiaItem[];      // status != concluida, prazo < hoje BRT (prazo asc)
  vencem7d: MeuDiaItem[];       // status != concluida, hoje <= prazo <= hoje+7 (prazo asc)
  emRevisao: MeuDiaItem[];      // status = em_revisao (updated_at asc — mais antiga primeiro)
  semAtividade14d: MeuDiaItem[]; // status in (backlog,todo,em_andamento), updated_at < agora-14d (updated_at asc)
};
export async function getMeuDia(access: UserAccess, agora?: Date): Promise<MeuDia>;

// getCarteira: MESMA assinatura e MESMO CarteiraOrg, mas 2 queries agregadas no total
// (GROUP BY org_id/status + GROUP BY org_id p/ atrasadas em BRT) e retorno ORDENADO
// por criticidade: atrasadas desc → emRevisao desc → orgName asc.
```

- [ ] **Step 1 (teste falha primeiro):** Criar `tests/integration/analista-meu-dia.test.ts` (`PREFIX = 'ta-test-meudia-'`): semear 1 analista (user role `analista` numa org interna qualquer — pode ser a própria org semeada), 2 orgs `active` com `analista_id` do analista, e tasks: org1 → 1 atrasada (`prazo: '2020-01-01'`, status `todo`), 1 vencendo (`prazo: somarDias(hojeBrt(), 3)`, status `em_andamento`), 1 `em_revisao`; org2 → 1 sem atividade (status `todo` com `updated_at` envelhecido via `db.update(tasks).set({ updated_at: new Date(Date.now() - 20 * 86_400_000) })` — o `$onUpdateFn` só roda em updates via drizzle com set explícito? **Atenção:** `updated_at` tem `$onUpdateFn(() => new Date())`, então envelhecer via drizzle NÃO funciona — usar SQL cru: `await db.execute(sql\`UPDATE tasks SET updated_at = now() - interval '20 days' WHERE id = ${taskId}\`)`).

```ts
  it('getMeuDia agrega as 4 listas cross-org da carteira', async () => {
    const { getMeuDia } = await import('@/modules/analista/analista.repository');
    const meuDia = await getMeuDia({ id: analistaId, orgId: org1Id, role: 'analista' } as UserAccess);
    expect(meuDia.atrasadas.map((t) => t.taskId)).toContain(taskAtrasadaId);
    expect(meuDia.vencem7d.map((t) => t.taskId)).toContain(taskVencendoId);
    expect(meuDia.emRevisao.map((t) => t.taskId)).toContain(taskRevisaoId);
    expect(meuDia.semAtividade14d.map((t) => t.taskId)).toContain(taskParadaId);
    // atrasada NÃO entra em vencem7d
    expect(meuDia.vencem7d.map((t) => t.taskId)).not.toContain(taskAtrasadaId);
  });

  it('getCarteira ordena por criticidade e conta atrasadas em BRT', async () => {
    const { getCarteira } = await import('@/modules/analista/analista.repository');
    const carteira = await getCarteira({ id: analistaId, orgId: org1Id, role: 'analista' } as UserAccess);
    const nossas = carteira.filter((c) => [org1Id, org2Id].includes(c.orgId));
    expect(nossas[0]!.orgId).toBe(org1Id); // 1 atrasada > 0 atrasadas
    expect(nossas[0]!.atrasadas).toBe(1);
    expect(nossas[0]!.emRevisao).toBe(1);
  });
```

(escopo do assert: filtrar pelas orgs da suíte — o branch `test` é compartilhado.) Rodar → **FALHA** (`getMeuDia` não existe).

- [ ] **Step 2 (repositório):** Em `analista.repository.ts`:

1. Remover `countTasksAtrasadas` (privada) e reescrever `getCarteira`:

```ts
import { hojeBrt } from '@/lib/timezone';

export async function getCarteira(access: UserAccess): Promise<CarteiraOrg[]> {
  const orgs =
    access.role === 'admin_truth'
      ? (await listClientOrganizations()).map((o) => ({ id: o.id, name: o.name }))
      : await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.analista_id, access.id));
  if (orgs.length === 0) return [];
  const orgIds = orgs.map((o) => o.id);
  const hoje = hojeBrt();

  // 2 queries agregadas no TOTAL (era 2 por org — N+1 da auditoria).
  const [countsRows, atrasadasRows] = await Promise.all([
    db
      .select({ orgId: tasks.org_id, status: tasks.status, n: count() })
      .from(tasks)
      .where(inArray(tasks.org_id, orgIds))
      .groupBy(tasks.org_id, tasks.status),
    db
      .select({ orgId: tasks.org_id, n: count() })
      .from(tasks)
      .where(and(inArray(tasks.org_id, orgIds), lt(tasks.prazo, hoje), ne(tasks.status, 'concluida')))
      .groupBy(tasks.org_id),
  ]);

  const countsMap = new Map<string, Record<TaskStatus, number>>();
  for (const r of countsRows) {
    const base = countsMap.get(r.orgId) ?? { backlog: 0, todo: 0, em_andamento: 0, em_revisao: 0, concluida: 0 };
    base[r.status as TaskStatus] = Number(r.n);
    countsMap.set(r.orgId, base);
  }
  const atrasadasMap = new Map(atrasadasRows.map((r) => [r.orgId, Number(r.n)]));

  return orgs
    .map((org) => {
      const counts =
        countsMap.get(org.id) ?? { backlog: 0, todo: 0, em_andamento: 0, em_revisao: 0, concluida: 0 };
      return {
        orgId: org.id,
        orgName: org.name,
        counts,
        atrasadas: atrasadasMap.get(org.id) ?? 0,
        emRevisao: counts.em_revisao,
      };
    })
    .sort(
      (a, b) =>
        b.atrasadas - a.atrasadas || b.emRevisao - a.emRevisao || a.orgName.localeCompare(b.orgName, 'pt-BR'),
    );
}
```

(`lt(tasks.prazo, hoje)` compara `date` com string `'yyyy-mm-dd'` — o driver aceita; o antigo `CURRENT_DATE` era o dia UTC do banco.)

2. Adicionar `getMeuDia` (mesmo padrão de escopo de `listTasksEmRevisao`; `gte`/`lte` ao import do drizzle):

```ts
export const VENCEM_JANELA_DIAS = 7;
export const SEM_ATIVIDADE_DIAS = 14;
export const MEU_DIA_LIMITE = 50;

export type MeuDiaItem = {
  taskId: string;
  orgId: string;
  orgName: string;
  titulo: string;
  prazo: string | null;
  status: TaskStatus;
  updatedAt: Date;
};

export type MeuDia = {
  atrasadas: MeuDiaItem[];
  vencem7d: MeuDiaItem[];
  emRevisao: MeuDiaItem[];
  semAtividade14d: MeuDiaItem[];
};

const CAMPOS_MEU_DIA = {
  taskId: tasks.id,
  orgId: organizations.id,
  orgName: organizations.name,
  titulo: tasks.titulo,
  prazo: tasks.prazo,
  status: tasks.status,
  updatedAt: tasks.updated_at,
};

/** Faixa "Meu dia": 4 listas cross-org da carteira, cada uma numa query agregada. */
export async function getMeuDia(access: UserAccess, agora: Date = new Date()): Promise<MeuDia> {
  const escopoOrg =
    access.role === 'admin_truth' ? undefined : eq(organizations.analista_id, access.id);
  const hoje = hojeBrt(agora);
  const fimJanela = somarDias(hoje, VENCEM_JANELA_DIAS);
  const corteAtividade = new Date(agora.getTime() - SEM_ATIVIDADE_DIAS * 86_400_000);
  const abertas = inArray(tasks.status, ['backlog', 'todo', 'em_andamento']);

  function consulta(cond: ReturnType<typeof and>, ordem: 'prazo' | 'updated') {
    return db
      .select(CAMPOS_MEU_DIA)
      .from(tasks)
      .innerJoin(organizations, eq(tasks.org_id, organizations.id))
      .where(escopoOrg ? and(cond, escopoOrg) : cond)
      .orderBy(ordem === 'prazo' ? tasks.prazo : tasks.updated_at)
      .limit(MEU_DIA_LIMITE);
  }

  const [atrasadas, vencem7d, emRevisao, semAtividade14d] = await Promise.all([
    consulta(and(ne(tasks.status, 'concluida'), lt(tasks.prazo, hoje)), 'prazo'),
    consulta(and(ne(tasks.status, 'concluida'), gte(tasks.prazo, hoje), lte(tasks.prazo, fimJanela)), 'prazo'),
    consulta(eq(tasks.status, 'em_revisao'), 'updated'),
    consulta(and(abertas, lt(tasks.updated_at, corteAtividade)), 'updated'),
  ]);

  const mapear = (rows: typeof atrasadas): MeuDiaItem[] =>
    rows.map((r) => ({ ...r, status: r.status as TaskStatus }));
  return {
    atrasadas: mapear(atrasadas),
    vencem7d: mapear(vencem7d),
    emRevisao: mapear(emRevisao),
    semAtividade14d: mapear(semAtividade14d),
  };
}
```

(import `somarDias` de `@/modules/tasks/sla`.) Rodar o teste → **PASSA**. Rodar `npm run test -- tests/integration/analista-carteira.test.ts` → verde (mesma assinatura/shape; se o teste antigo assertar ORDEM de orgs, atualizar para a nova ordenação por criticidade com nota no commit).

- [ ] **Step 3 (componente):** Criar `src/app/analista/meu-dia.tsx` (server component):

```tsx
import Link from 'next/link';

import { labelPrazo } from '@/modules/tasks/sla';
import type { MeuDia, MeuDiaItem } from '@/modules/analista/analista.repository';

function ListaExpandivel({ rotulo, itens, tom }: { rotulo: string; itens: MeuDiaItem[]; tom: 'danger' | 'warn' | 'brand' | 'dim' }) {
  const cor =
    tom === 'danger' ? 'text-danger-fg' : tom === 'warn' ? 'text-warning-fg' : tom === 'brand' ? 'text-brand' : 'text-dim';
  return (
    <details className="rounded-xl border border-line bg-bg-surface px-4 py-2">
      <summary className={`cursor-pointer text-sm font-semibold ${cor}`}>
        {rotulo} ({itens.length})
      </summary>
      {itens.length === 0 ? (
        <p className="py-2 text-xs text-dim">Nada por aqui.</p>
      ) : (
        <ul className="space-y-1 py-2">
          {itens.map((t) => (
            <li key={t.taskId} className="flex flex-wrap items-center gap-2 text-sm">
              <Link
                href={`/analista/${t.orgId}/tasks/${t.taskId}`}
                className="text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                {t.titulo}
              </Link>
              <span className="text-xs text-dim">{t.orgName}</span>
              {labelPrazo(t.prazo) ? <span className="text-xs text-muted">{labelPrazo(t.prazo)}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Faixa consolidada do analista: o que precisa de atenção HOJE, cross-org. */
export function MeuDiaFaixa({ meuDia }: { meuDia: MeuDia }) {
  return (
    <section data-testid="meu-dia" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <ListaExpandivel rotulo="Atrasadas" itens={meuDia.atrasadas} tom="danger" />
      <ListaExpandivel rotulo="Vencem em 7d" itens={meuDia.vencem7d} tom="warn" />
      <ListaExpandivel rotulo="Em revisão" itens={meuDia.emRevisao} tom="brand" />
      <ListaExpandivel rotulo="Sem atividade há 14d" itens={meuDia.semAtividade14d} tom="dim" />
    </section>
  );
}
```

- [ ] **Step 4 (página):** Em `src/app/analista/page.tsx`, importar `getMeuDia` e `MeuDiaFaixa`, trocar o `Promise.all` por:

```ts
  const [carteira, fila, meuDia] = await Promise.all([
    getCarteira(access),
    listTasksEmRevisao(access),
    getMeuDia(access),
  ]);
```

e renderizar `<MeuDiaFaixa meuDia={meuDia} />` logo abaixo do `<h1>` (antes da Fila de revisão). A carteira já vem ordenada por criticidade do repositório — sem mudança no map (testid `carteira-org` intacto).

- [ ] **Step 5:** `npm run test` + `npm run typecheck` verdes. Smoke: /analista mostra a faixa com contagens e listas expandem com deep-link. **Commit:** `feat(g3): meu dia do analista cross-org + carteira sem n+1 ordenada por criticidade`

---
### Task 7: Cobrança de prazos no cron diário (lembretes)

**Files:**
- Create: `src/modules/tasks/lembretes-prazo.ts`
- Modify: `src/modules/notifications/templates.ts` (+ `lembretePrazoTemplate`)
- Modify: `src/modules/notifications/email.ts` (+ `sendLembretePrazoEmail`)
- Modify: `src/app/api/cron/verificar-alertas/route.ts` (passo aditivo pós-loop)
- Test: `tests/unit/notification-templates.test.ts` (mod — bloco novo), `tests/integration/lembretes-prazo.test.ts` (criar)

**Decisões (travadas):** (a) o lembrete roda como **passo separado no MESMO route handler** de `verificar-alertas` — o loop de alertas itera só orgs com relatório recente (`listOrgsComRelatorioRecente`), e prazos valem para QUALQUER org com task, então o passo é independente e roda depois, com try/catch próprio; (b) **dedup SEM tabela nova**: `notifications` não tem dedup (auditoria) → o ledger é `task_activities` com `evento='lembrete_prazo'`, `de=prazo`, `para=tipo` — se o prazo mudar, o lembrete pode disparar de novo (chave inclui o prazo), e cada tipo (`vence_em_breve`/`atrasada`) dispara no máximo 1 vez por prazo; (c) destinatários: `vence_em_breve` → cliente; `atrasada` → cliente + analista (analista via `getOrgAnalistaUser`, silencioso se org sem analista — a Task 10 pluga o fallback de e-mail admin); (d) e-mails best-effort com `escapeHtml`.

**Interfaces:**
- Consumes: `statusPrazo`/`somarDias`/`labelPrazo` (Task 1); `hojeBrt` (G0); `recordTaskActivity`; `notify` (notification.repository.ts:14 — nunca lança); `getOrgPrimaryUser`/`getOrgAnalistaUser` (recipients.ts); `escapeHtml`/`EmailContent` (templates.ts:23-30); `sendEmail`; `secretsMatch`/`serverEnv.CRON_SECRET`/`logger` (padrão do route atual, `verificar-alertas/route.ts:42-48` pré-G0 — **revalidar o corpo pós-G0 antes de editar**; o passo é aditivo em qualquer versão).
- Produces:

```ts
// lembretes-prazo.ts
export const LEMBRETE_ANTECEDENCIA_DIAS = 2; // = VENCE_EM_BREVE_DIAS (statusPrazo é a fonte da classificação)
export type TipoLembrete = 'vence_em_breve' | 'atrasada';
export type TaskParaLembrete = { taskId: string; orgId: string; titulo: string; prazo: string; tipo: TipoLembrete };
export function classificarLembrete(prazo: string, hoje: string): TipoLembrete | null; // pura (via statusPrazo)
export async function listTasksParaLembrete(hoje: string): Promise<TaskParaLembrete[]>; // global (loop server-side do cron)
export async function jaLembrada(taskId: string, tipo: TipoLembrete, prazo: string): Promise<boolean>;
export async function processarLembretesDePrazo(agora?: Date): Promise<number>; // lembretes enviados

// templates.ts
export function lembretePrazoTemplate(input: { titulo: string; prazoLabel: string; tipo: 'vence_em_breve' | 'atrasada' }, appUrl: string): EmailContent;

// email.ts
export async function sendLembretePrazoEmail(to: string, input: { titulo: string; prazoLabel: string; tipo: 'vence_em_breve' | 'atrasada' }): Promise<void>;
```

- [ ] **Step 1 (unit do template falha primeiro):** Em `tests/unit/notification-templates.test.ts`, adicionar describe:

```ts
import { lembretePrazoTemplate } from '@/modules/notifications/templates';

describe('lembretePrazoTemplate', () => {
  it('vence_em_breve: assunto de aviso + título escapado + link do plano', () => {
    const t = lembretePrazoTemplate(
      { titulo: 'Ajustar <preço> do kit', prazoLabel: 'Vence amanhã', tipo: 'vence_em_breve' },
      'http://x',
    );
    expect(t.subject).toContain('Tarefa perto do prazo');
    expect(t.html).toContain('&lt;preço&gt;');
    expect(t.html).toContain('http://x/dashboard/plano-de-acao');
    expect(t.text).toContain('Vence amanhã');
  });

  it('atrasada: assunto de atraso', () => {
    const t = lembretePrazoTemplate({ titulo: 'T', prazoLabel: 'Atrasada há 2d', tipo: 'atrasada' }, 'http://x');
    expect(t.subject).toContain('Tarefa atrasada');
  });
});
```

Rodar → **FALHA**. Implementar em `templates.ts`:

```ts
/**
 * Template: lembrete de prazo de tarefa (vence em breve / atrasada).
 * `titulo` vem do usuário → escapado.
 */
export function lembretePrazoTemplate(
  input: { titulo: string; prazoLabel: string; tipo: 'vence_em_breve' | 'atrasada' },
  appUrl: string,
): EmailContent {
  const url = `${appUrl}/dashboard/plano-de-acao`;
  const subject =
    input.tipo === 'atrasada'
      ? 'Tarefa atrasada no seu Plano de Ação — Truth Analytics'
      : 'Tarefa perto do prazo — Truth Analytics';
  const text = [
    input.tipo === 'atrasada' ? 'Uma tarefa do seu Plano de Ação está atrasada.' : 'Uma tarefa do seu Plano de Ação está perto do prazo.',
    '',
    `Tarefa: ${input.titulo}`,
    `Prazo: ${input.prazoLabel}`,
    '',
    `Acesse em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>${input.tipo === 'atrasada' ? 'Uma tarefa do seu Plano de Ação está <strong>atrasada</strong>.' : 'Uma tarefa do seu Plano de Ação está <strong>perto do prazo</strong>.'}</p>
<p><strong>Tarefa:</strong> ${escapeHtml(input.titulo)}<br><strong>Prazo:</strong> ${escapeHtml(input.prazoLabel)}</p>
<p><a href="${escapeHtml(url)}">Abrir o Plano de Ação</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;
  return { subject, html, text };
}
```

e em `email.ts`:

```ts
/** Lembrete de prazo de tarefa. Nunca lança. */
export async function sendLembretePrazoEmail(
  to: string,
  input: { titulo: string; prazoLabel: string; tipo: 'vence_em_breve' | 'atrasada' },
): Promise<void> {
  const content = lembretePrazoTemplate(input, serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}
```

Rodar → **PASSA**.

- [ ] **Step 2 (integração falha primeiro):** Criar `tests/integration/lembretes-prazo.test.ts` (`PREFIX = 'ta-test-lembrete-'`): semear org active + user client + task `em_andamento` com `prazo = somarDias(hojeBrt(), 1)` (vence amanhã) e outra com `prazo = '2020-01-01'` (atrasada); spy `vi.spyOn(emailModule, 'sendLembretePrazoEmail')`:

```ts
  it('processa lembretes: 1 por task, in-app + email, e NÃO repete na 2ª execução', async () => {
    const { processarLembretesDePrazo } = await import('@/modules/tasks/lembretes-prazo');
    const n1 = await processarLembretesDePrazo();
    // as 2 tasks desta suíte lembradas (pode haver tasks de outras suítes — asserta pelo notifications DESTE user)
    expect(n1).toBeGreaterThanOrEqual(2);
    const notifs = await db.select().from(notifications).where(eq(notifications.user_id, userId));
    const tipos = notifs.map((n) => n.tipo).sort();
    expect(tipos).toContain('lembrete_vence_em_breve');
    expect(tipos).toContain('lembrete_atrasada');

    const antes = notifs.length;
    await processarLembretesDePrazo(); // 2ª execução — dedup via task_activities
    const depois = await db.select().from(notifications).where(eq(notifications.user_id, userId));
    expect(depois.length).toBe(antes);
  });

  it('prazo alterado → lembra de novo (chave de dedup inclui o prazo)', async () => {
    await db.update(tasks).set({ prazo: somarDias(hojeBrt(), 2) }).where(eq(tasks.id, taskVencendoId));
    const { processarLembretesDePrazo } = await import('@/modules/tasks/lembretes-prazo');
    await processarLembretesDePrazo();
    const acts = await db
      .select()
      .from(taskActivities)
      .where(and(eq(taskActivities.task_id, taskVencendoId), eq(taskActivities.evento, 'lembrete_prazo')));
    expect(acts.length).toBe(2); // um por prazo
  });
```

(cleanup: notifications do user, activities, tasks, user, org.) Rodar → **FALHA** (módulo não existe).

- [ ] **Step 3 (helper):** Criar `src/modules/tasks/lembretes-prazo.ts`:

```ts
import { and, eq, inArray, isNotNull, lte, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, taskActivities, tasks } from '@/db/schema';
import { hojeBrt } from '@/lib/timezone';
import { logger } from '@/lib/logger';
import { sendLembretePrazoEmail } from '@/modules/notifications/email';
import { notify } from '@/modules/notifications/notification.repository';
import { getOrgAnalistaUser, getOrgPrimaryUser } from '@/modules/notifications/recipients';

import { labelPrazo, somarDias, statusPrazo, VENCE_EM_BREVE_DIAS } from './sla';

export const LEMBRETE_ANTECEDENCIA_DIAS = VENCE_EM_BREVE_DIAS;

export type TipoLembrete = 'vence_em_breve' | 'atrasada';
export type TaskParaLembrete = { taskId: string; orgId: string; titulo: string; prazo: string; tipo: TipoLembrete };

/** Pura: mapeia statusPrazo → tipo de lembrete (no_prazo/sem_prazo → null). */
export function classificarLembrete(prazo: string, hoje: string): TipoLembrete | null {
  const s = statusPrazo(prazo, hoje);
  return s === 'atrasada' || s === 'vence_em_breve' ? s : null;
}

/** Tasks candidatas a lembrete: org active, não concluídas, prazo ≤ hoje+2 (global — loop do cron). */
export async function listTasksParaLembrete(hoje: string): Promise<TaskParaLembrete[]> {
  const rows = await db
    .select({ taskId: tasks.id, orgId: tasks.org_id, titulo: tasks.titulo, prazo: tasks.prazo })
    .from(tasks)
    .innerJoin(organizations, eq(tasks.org_id, organizations.id))
    .where(
      and(
        eq(organizations.status, 'active'),
        ne(tasks.status, 'concluida'),
        isNotNull(tasks.prazo),
        lte(tasks.prazo, somarDias(hoje, LEMBRETE_ANTECEDENCIA_DIAS)),
      ),
    );
  return rows.flatMap((r) => {
    const tipo = r.prazo ? classificarLembrete(r.prazo, hoje) : null;
    return tipo ? [{ taskId: r.taskId, orgId: r.orgId, titulo: r.titulo, prazo: r.prazo!, tipo }] : [];
  });
}

/** Dedup: já existe activity lembrete_prazo com o MESMO tipo e o MESMO prazo? */
export async function jaLembrada(taskId: string, tipo: TipoLembrete, prazo: string): Promise<boolean> {
  const [row] = await db
    .select({ id: taskActivities.id })
    .from(taskActivities)
    .where(
      and(
        eq(taskActivities.task_id, taskId),
        eq(taskActivities.evento, 'lembrete_prazo'),
        eq(taskActivities.para, tipo),
        eq(taskActivities.de, prazo),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Cobra prazos: vence em ≤2d → notifica o cliente; venceu → cliente +
 * analista. Dedup por (task, tipo, prazo) em task_activities — sem tabela
 * nova; `notifications` não tem dedup (decisão documentada no plano G3).
 * Best-effort por task; devolve o nº de lembretes enviados.
 */
export async function processarLembretesDePrazo(agora: Date = new Date()): Promise<number> {
  const hoje = hojeBrt(agora);
  const candidatas = await listTasksParaLembrete(hoje);
  let enviados = 0;
  for (const t of candidatas) {
    try {
      if (await jaLembrada(t.taskId, t.tipo, t.prazo)) continue;
      const prazoLabel = labelPrazo(t.prazo, hoje) ?? t.prazo;
      const tituloNotif = t.tipo === 'atrasada' ? 'Tarefa atrasada' : 'Tarefa perto do prazo';

      const cliente = await getOrgPrimaryUser(t.orgId);
      if (cliente) {
        await notify(cliente.id, {
          tipo: `lembrete_${t.tipo}`,
          titulo: tituloNotif,
          corpo: `${t.titulo} — ${prazoLabel}`,
          href: `/dashboard/plano-de-acao/${t.taskId}`,
        });
        await sendLembretePrazoEmail(cliente.email, { titulo: t.titulo, prazoLabel, tipo: t.tipo });
      }
      if (t.tipo === 'atrasada') {
        const analista = await getOrgAnalistaUser(t.orgId);
        if (analista) {
          await notify(analista.id, {
            tipo: 'lembrete_atrasada',
            titulo: 'Tarefa atrasada na sua carteira',
            corpo: `${t.titulo} — ${prazoLabel}`,
            href: `/analista/${t.orgId}/tasks/${t.taskId}`,
          });
          await sendLembretePrazoEmail(analista.email, { titulo: t.titulo, prazoLabel, tipo: t.tipo });
        }
      }
      // Ledger de dedup — só grava se notificou (ou tentou) sem lançar.
      await db.insert(taskActivities).values({
        task_id: t.taskId,
        user_id: null,
        evento: 'lembrete_prazo',
        de: t.prazo,
        para: t.tipo,
      });
      enviados += 1;
    } catch (err) {
      logger.warn('lembrete de prazo falhou', { taskId: t.taskId }, err);
    }
  }
  return enviados;
}
```

Rodar `npm run test -- tests/integration/lembretes-prazo.test.ts` → **PASSA**.

- [ ] **Step 4 (plugar no cron):** Em `src/app/api/cron/verificar-alertas/route.ts` (LER a versão pós-G0 antes), importar `processarLembretesDePrazo` e, APÓS o loop de orgs e ANTES do `return Response.json(...)` final:

```ts
  // G3: cobrança de prazos — independente do loop de alertas (cobre TODA org
  // active com task, não só as com relatório recente).
  let lembretesEnviados = 0;
  try {
    lembretesEnviados = await processarLembretesDePrazo(agora);
  } catch (err) {
    logger.error('cron.lembretes_prazo.erro', { erro: err instanceof Error ? err.message : String(err) });
  }
```

e acrescentar `lembretesEnviados` ao JSON de resposta (campo ADITIVO). **Se** `tests/integration/cron-verificar-alertas.test.ts` assertar o response com `toEqual` estrito, atualizar o expected para incluir o campo novo (justificativa: campo aditivo do G3; anotar no commit) — se usar `toMatchObject`/asserções pontuais, nada a fazer.

- [ ] **Step 5:** `npm run test` + `npm run typecheck` verdes (incl. `cron-verificar-alertas.test.ts`). **Commit:** `feat(g3): cobranca de prazos no cron diario — lembretes com dedup por task_activities`

---
### Task 8: Digest semanal por org (e-mail)

**Files:**
- Create: `src/modules/tasks/digest-semanal.ts`, `src/app/api/cron/digest-semanal/route.ts`
- Modify: `vercel.json` (+ 1 cron — PRESERVAR os existentes, incl. `sincronizar-pedidos` da G0)
- Modify: `src/modules/notifications/templates.ts` (+ `digestSemanalTemplate`), `src/modules/notifications/email.ts` (+ `sendDigestSemanalEmail`)
- Modify: `src/modules/organizations/organization-settings.repository.ts` (+ `getTotalVendasMesAnterior`)
- Test: `tests/unit/digest-semanal.test.ts` (criar), `tests/integration/cron-digest-semanal.test.ts` (criar — padrão `cron-verificar-alertas.test.ts`)

**Interfaces:**
- Consumes: `getTotalVendasMesCorrente(orgId, agora?)` (organization-settings.repository.ts:18-25 — soma `orders` do mês UTC corrente; viva pós-G0 graças ao sync diário); `getOrgPrimaryUser`; `escapeHtml`; `sendEmail`; `secretsMatch`; `taskActivities` (`evento='status'`, `para='concluida'`).
- Produces:

```ts
// organization-settings.repository.ts
export async function getTotalVendasMesAnterior(orgId: string, agora?: Date): Promise<number>; // mês UTC ANTERIOR fechado (mesma convenção do corrente)

// digest-semanal.ts
export type DigestOrg = {
  orgId: string;
  orgName: string;
  concluidas7d: number;   // distinct tasks com activity status→concluida nos últimos 7d
  atrasadas: number;      // não concluídas com prazo < hoje BRT
  emAndamento: number;    // status = em_andamento
  vendasMes: number;
  vendasMesAnterior: number;
};
export function linhaResumo(d: Pick<DigestOrg, 'concluidas7d' | 'atrasadas' | 'emAndamento'>): string;
// "3 concluídas ✅, 2 atrasadas ⚠️, 4 em andamento" (pura)
export async function montarDigestOrg(org: { id: string; name: string }, agora: Date): Promise<DigestOrg | null>; // null se a org não tem NENHUMA task
export async function processarDigestSemanal(agora?: Date): Promise<{ orgs: number; enviados: number }>;

// templates.ts — SEM importar digest-semanal (evita ciclo digest→email→templates→digest):
export type DigestEmailData = { orgName: string; resumo: string; vendasMes: number; vendasMesAnterior: number };
export function digestSemanalTemplate(dados: DigestEmailData, appUrl: string): EmailContent;

// email.ts
export async function sendDigestSemanalEmail(to: string, dados: DigestEmailData): Promise<void>;

// rota GET /api/cron/digest-semanal → 500 {error:'cron_nao_configurado'} sem secret; 401 Bearer inválido; 200 { orgs, enviados }
```

- [ ] **Step 1 (unit falha primeiro):** Criar `tests/unit/digest-semanal.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { linhaResumo } from '@/modules/tasks/digest-semanal';

describe('linhaResumo', () => {
  it('monta a frase pt-BR com emojis', () => {
    expect(linhaResumo({ concluidas7d: 3, atrasadas: 2, emAndamento: 4 })).toBe(
      '3 concluídas ✅, 2 atrasadas ⚠️, 4 em andamento',
    );
    expect(linhaResumo({ concluidas7d: 1, atrasadas: 0, emAndamento: 0 })).toBe(
      '1 concluída ✅, 0 atrasadas ⚠️, 0 em andamento',
    );
  });
});
```

E em `tests/unit/notification-templates.test.ts`:

```ts
import { digestSemanalTemplate } from '@/modules/notifications/templates';

describe('digestSemanalTemplate', () => {
  const DADOS = {
    orgName: 'Loja <Teste>',
    resumo: '3 concluídas ✅, 2 atrasadas ⚠️, 4 em andamento',
    vendasMes: 10880.5,
    vendasMesAnterior: 9700,
  };
  it('assunto com resumo, nome escapado, vendas e CTA do plano de ação', () => {
    const t = digestSemanalTemplate(DADOS, 'http://x');
    expect(t.subject).toContain('Resumo da semana');
    expect(t.html).toContain('&lt;Teste&gt;');
    expect(t.html).toContain('3 concluídas ✅, 2 atrasadas ⚠️, 4 em andamento');
    expect(t.text).toContain('R$');
    expect(t.html).toContain('http://x/dashboard/plano-de-acao');
  });
});
```

Rodar → **FALHA**.

- [ ] **Step 2 (puros + template):** Em `digest-semanal.ts` (parte pura primeiro — o tipo e a frase):

```ts
export type DigestOrg = {
  orgId: string;
  orgName: string;
  concluidas7d: number;
  atrasadas: number;
  emAndamento: number;
  vendasMes: number;
  vendasMesAnterior: number;
};

/** "3 concluídas ✅, 2 atrasadas ⚠️, 4 em andamento" (singular só na 1ª parte). */
export function linhaResumo(d: Pick<DigestOrg, 'concluidas7d' | 'atrasadas' | 'emAndamento'>): string {
  const concluidas = `${d.concluidas7d} ${d.concluidas7d === 1 ? 'concluída' : 'concluídas'} ✅`;
  return `${concluidas}, ${d.atrasadas} atrasadas ⚠️, ${d.emAndamento} em andamento`;
}
```

Em `templates.ts` (SEM importar digest-semanal — o `resumo` chega pronto; evita o ciclo digest→email→templates→digest):

```ts
export type DigestEmailData = { orgName: string; resumo: string; vendasMes: number; vendasMesAnterior: number };

/** Template: digest semanal do Plano de Ação + vendas do mês. */
export function digestSemanalTemplate(dados: DigestEmailData, appUrl: string): EmailContent {
  const url = `${appUrl}/dashboard/plano-de-acao`;
  const brl = (n: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  const deltaPct =
    dados.vendasMesAnterior > 0
      ? Math.round(((dados.vendasMes - dados.vendasMesAnterior) / dados.vendasMesAnterior) * 1000) / 10
      : null;
  const linhaVendas =
    deltaPct === null
      ? `Vendas do mês: ${brl(dados.vendasMes)}`
      : `Vendas do mês: ${brl(dados.vendasMes)} (${deltaPct >= 0 ? '▲' : '▼'} ${Math.abs(deltaPct)}% vs mês anterior)`;
  const subject = `Resumo da semana — ${dados.resumo} — Truth Analytics`;
  const text = [
    `Como foi a semana do Plano de Ação da ${dados.orgName}:`,
    '',
    dados.resumo,
    linhaVendas,
    '',
    `Veja e priorize as próximas tarefas: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Como foi a semana do Plano de Ação da <strong>${escapeHtml(dados.orgName)}</strong>:</p>
<p><strong>${escapeHtml(dados.resumo)}</strong></p>
<p>${escapeHtml(linhaVendas)}</p>
<p><a href="${escapeHtml(url)}">Veja e priorize as próximas tarefas</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;
  return { subject, html, text };
}
```

(usa `Intl` local em vez de `formatBRL` — o módulo de templates é autocontido, padrão do arquivo.) Em `email.ts`:

```ts
import type { DigestEmailData } from './templates'; // juntar ao import existente

/** Digest semanal por org. Nunca lança. */
export async function sendDigestSemanalEmail(to: string, dados: DigestEmailData): Promise<void> {
  const content = digestSemanalTemplate(dados, serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}
```

Rodar os units → **PASSA**.

- [ ] **Step 3 (integração falha primeiro):** Criar `tests/integration/cron-digest-semanal.test.ts` — MESMO boilerplate de `cron-verificar-alertas.test.ts` (`vi.mock('@/lib/env')` com `CRON_SECRET: 'cron-digest-teste-16+++++'`, helper `req(auth?)` apontando para `/api/cron/digest-semanal`): semear org active + user client + 2 tasks (1 `em_andamento`, 1 `todo` com `prazo: '2020-01-01'`) + 1 activity `{ evento: 'status', para: 'concluida' }` numa 3ª task concluída + orders do mês corrente e do anterior; spy em `emailModule.sendDigestSemanalEmail`:

```ts
  it('401 sem Bearer válido', async () => {
    const { GET } = await import('@/app/api/cron/digest-semanal/route');
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('Bearer errado'))).status).toBe(401);
  });

  it('processa: 1 e-mail para a org com tasks, com contagens certas no resumo', async () => {
    const spy = vi.spyOn(emailModule, 'sendDigestSemanalEmail').mockResolvedValue();
    const { GET } = await import('@/app/api/cron/digest-semanal/route');
    const res = await GET(req(`Bearer ${CRON_SECRET_TEST}`));
    expect(res.status).toBe(200);
    const chamadaDaOrg = spy.mock.calls.find(([to]) => to === userEmail);
    expect(chamadaDaOrg).toBeDefined();
    expect(chamadaDaOrg![1].resumo).toBe('1 concluída ✅, 1 atrasadas ⚠️, 1 em andamento');
  });
```

Rodar → **FALHA** (rota não existe).

- [ ] **Step 4 (I/O + rota):** Completar `digest-semanal.ts`:

```ts
import { and, count, countDistinct, eq, gte, inArray, lt, ne } from 'drizzle-orm';

import { db } from '@/db/client';
import { organizations, taskActivities, tasks } from '@/db/schema';
import { hojeBrt } from '@/lib/timezone';
import { logger } from '@/lib/logger';
import { sendDigestSemanalEmail } from '@/modules/notifications/email';
import { getOrgPrimaryUser } from '@/modules/notifications/recipients';
import {
  getTotalVendasMesAnterior,
  getTotalVendasMesCorrente,
} from '@/modules/organizations/organization-settings.repository';

const DIA_MS = 86_400_000;

/** Digest da org (null quando não há NENHUMA task — org sem CRM não recebe e-mail). */
export async function montarDigestOrg(org: { id: string; name: string }, agora: Date): Promise<DigestOrg | null> {
  const hoje = hojeBrt(agora);
  const corte7d = new Date(agora.getTime() - 7 * DIA_MS);
  const [[total], [concluidas], [atrasadas], [andamento], vendasMes, vendasMesAnterior] = await Promise.all([
    db.select({ n: count() }).from(tasks).where(eq(tasks.org_id, org.id)),
    db
      .select({ n: countDistinct(taskActivities.task_id) })
      .from(taskActivities)
      .innerJoin(tasks, eq(taskActivities.task_id, tasks.id))
      .where(
        and(
          eq(tasks.org_id, org.id),
          eq(taskActivities.evento, 'status'),
          eq(taskActivities.para, 'concluida'),
          gte(taskActivities.created_at, corte7d),
        ),
      ),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.org_id, org.id), ne(tasks.status, 'concluida'), lt(tasks.prazo, hoje))),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.org_id, org.id), eq(tasks.status, 'em_andamento'))),
    getTotalVendasMesCorrente(org.id, agora),
    getTotalVendasMesAnterior(org.id, agora),
  ]);
  if (Number(total?.n ?? 0) === 0) return null;
  return {
    orgId: org.id,
    orgName: org.name,
    concluidas7d: Number(concluidas?.n ?? 0),
    atrasadas: Number(atrasadas?.n ?? 0),
    emAndamento: Number(andamento?.n ?? 0),
    vendasMes,
    vendasMesAnterior,
  };
}

/** 1 e-mail por org active com tasks. Best-effort por org. */
export async function processarDigestSemanal(agora: Date = new Date()): Promise<{ orgs: number; enviados: number }> {
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.status, 'active'));
  let enviados = 0;
  for (const org of orgs) {
    try {
      const digest = await montarDigestOrg(org, agora);
      if (!digest) continue;
      const user = await getOrgPrimaryUser(org.id);
      if (!user) continue;
      await sendDigestSemanalEmail(user.email, {
        orgName: digest.orgName,
        resumo: linhaResumo(digest),
        vendasMes: digest.vendasMes,
        vendasMesAnterior: digest.vendasMesAnterior,
      });
      enviados += 1;
    } catch (err) {
      logger.warn('digest semanal falhou para org', { orgId: org.id }, err);
    }
  }
  return { orgs: orgs.length, enviados };
}
```

Em `organization-settings.repository.ts`:

```ts
/** Soma de orders.valor_total do mês UTC ANTERIOR fechado (consistente com getTotalVendasMesCorrente). */
export async function getTotalVendasMesAnterior(orgId: string, agora: Date = new Date()): Promise<number> {
  const inicioMesAtual = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const inicioMesAnterior = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - 1, 1));
  const rows = await db
    .select({ valor_total: orders.valor_total })
    .from(orders)
    .where(and(eq(orders.org_id, orgId), gte(orders.data, inicioMesAnterior), lt(orders.data, inicioMesAtual)));
  return Math.round(rows.reduce((acc, o) => acc + Number(o.valor_total), 0) * 100) / 100;
}
```

(adicionar `gte`/`lt` ao import do drizzle.) Criar `src/app/api/cron/digest-semanal/route.ts`:

```ts
import { serverEnv } from '@/lib/env';
import { secretsMatch } from '@/lib/secret-compare';
import { processarDigestSemanal } from '@/modules/tasks/digest-semanal';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Cron semanal (segunda 12h UTC = 9h BRT): digest do Plano de Ação por org. */
export async function GET(req: Request): Promise<Response> {
  if (!serverEnv.CRON_SECRET) {
    return Response.json({ error: 'cron_nao_configurado' }, { status: 500 });
  }
  if (!secretsMatch(req.headers.get('authorization'), `Bearer ${serverEnv.CRON_SECRET}`)) {
    return new Response('unauthorized', { status: 401 });
  }
  const { orgs, enviados } = await processarDigestSemanal(new Date());
  return Response.json({ orgs, enviados });
}
```

E em `vercel.json`, ADICIONAR ao array (mantendo watchdog, gerar-relatorios, verificar-alertas e o sincronizar-pedidos da G0):

```json
    { "path": "/api/cron/digest-semanal", "schedule": "0 12 * * 1" }
```

Rodar `npm run test -- tests/integration/cron-digest-semanal.test.ts` → **PASSA**.

- [ ] **Step 5:** `npm run test` + `npm run typecheck` verdes. **Commit:** `feat(g3): digest semanal por org — tasks da semana + vendas do mes com cron segunda 9h brt`

---
### Task 9: Card kanban rico + "Mover para…" sem fricção (otimista)

**Files:**
- Modify: `src/modules/tasks/task.repository.ts` (+ `listTasksKanban` — comentários agregados, checklist)
- Create: `src/modules/tasks/kanban-order.ts` (ordenação pura)
- Modify: `src/actions/tasks.actions.ts` (+ `moveTaskAction` com retorno `{error?}`)
- Create: `src/components/tasks/MoverTaskSelect.tsx`
- Modify: `src/components/tasks/KanbanBoard.tsx` (client + otimista), `src/components/tasks/TaskCard.tsx`
- Modify: `src/app/(client)/dashboard/plano-de-acao/page.tsx`, `src/app/analista/[orgId]/page.tsx` (usar `listTasksKanban`)
- Test: `tests/unit/kanban-order.test.ts` (criar), `tests/integration/list-tasks-kanban.test.ts` (criar)

**DIVERGÊNCIA (React 18.3):** o brief pedia `useOptimistic` — hook de React 19, inexistente em `react@18.3.1` (o repo usa `useFormState`; upgrade React 19 é fase futura). Implementação equivalente: `useState` (mapa taskId→status otimista) + `useTransition` chamando `moveTaskAction`; o `revalidatePath` da action atualiza a árvore RSC dentro da MESMA transition e o mapa é limpo no settle. Anotar no commit.

**Decisões:** as setas `←→` (mover) e `↑↓` (reordenar) SAEM do card — mover vira select "Mover para…" com rótulos pt-BR das colunas (só transições que `podeTransicionar` aprova; o servidor revalida em `moveTask`); a ordem manual sai de cena: colunas ordenadas por **prioridade → prazo → ordem** (`ordenarColuna` pura; `reorderTaskFormAction`/`reorderTask` FICAM no código, sem UI — remoção é dívida futura). O botão **Concluir do cliente fica intacto** (testid `task-concluir`, E2E guard). Checklist "2/5" = parse da descrição via `parseChecklist`; nº de comentários via agregação em UMA query (LEFT JOIN + GROUP BY — sem N+1).

**Interfaces:**
- Consumes: `podeTransicionar` (task-transitions.ts:9); `proximoStatusAoConcluir`; `parseChecklist` (checklist-line.ts:43); `labelPrazo`/`statusPrazo` (Task 1); `STATUS_TASK_LABEL`/`TASK_STATUSES`; `moveTask` (task.repository.ts:109); `useToast`; `taskComments` schema.
- Produces:

```ts
// task.repository.ts
export type TaskCardInfo = TaskSummary & {
  comentarios: number;
  checklistFeitos: number;
  checklistTotal: number;
  reincidente: boolean; // descricao contém '_Reincidente:' (Task 4)
};
export async function listTasksKanban(orgId: string): Promise<TaskCardInfo[]>; // 1 query (LEFT JOIN count comments) + parse em JS

// kanban-order.ts (puro — importável por client component)
export function ordenarColuna<T extends { prioridade: TaskPrioridade; prazo: string | null; ordem: number }>(tasks: T[]): T[];
// prioridade alta>media>baixa → prazo asc (null por último) → ordem asc; NÃO muta o array

// tasks.actions.ts
export async function moveTaskAction(formData: FormData): Promise<TaskActionState>;
// mesma validação/permissão de moveTaskFormAction, mas DEVOLVE { ok } | { error } p/ toast

// MoverTaskSelect.tsx ('use client')
export function MoverTaskSelect(props: {
  taskId: string;
  destinosValidos: TaskStatus[]; // já filtrados por podeTransicionar no TaskCard
  onMove: (taskId: string, para: TaskStatus) => void;
  pendente: boolean;
}): JSX.Element; // testid: mover-task-{taskId}

// KanbanBoard.tsx ('use client') — mesmas props + tasks: TaskCardInfo[]
```

- [ ] **Step 1 (unit falha primeiro):** Criar `tests/unit/kanban-order.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { ordenarColuna } from '@/modules/tasks/kanban-order';

const t = (prioridade: 'alta' | 'media' | 'baixa', prazo: string | null, ordem: number) => ({
  prioridade,
  prazo,
  ordem,
});

describe('ordenarColuna', () => {
  it('prioridade primeiro, depois prazo asc (null por último), depois ordem', () => {
    const entrada = [
      t('baixa', '2026-07-01', 1),
      t('alta', null, 2),
      t('alta', '2026-07-20', 3),
      t('alta', '2026-07-10', 4),
      t('media', '2026-07-05', 5),
    ];
    expect(ordenarColuna(entrada).map((x) => x.ordem)).toEqual([4, 3, 2, 5, 1]);
  });

  it('não muta o array original', () => {
    const entrada = [t('baixa', null, 1), t('alta', null, 2)];
    ordenarColuna(entrada);
    expect(entrada.map((x) => x.ordem)).toEqual([1, 2]);
  });
});
```

Rodar → **FALHA**. Implementar `src/modules/tasks/kanban-order.ts`:

```ts
import type { TaskPrioridade } from './task.types';

const PESO_PRIORIDADE: Record<TaskPrioridade, number> = { alta: 0, media: 1, baixa: 2 };

/** Ordem canônica de coluna do kanban: prioridade → prazo asc (null por último) → ordem. */
export function ordenarColuna<T extends { prioridade: TaskPrioridade; prazo: string | null; ordem: number }>(
  tasks: T[],
): T[] {
  return [...tasks].sort((a, b) => {
    const p = PESO_PRIORIDADE[a.prioridade] - PESO_PRIORIDADE[b.prioridade];
    if (p !== 0) return p;
    if (a.prazo !== b.prazo) {
      if (a.prazo === null) return 1;
      if (b.prazo === null) return -1;
      return a.prazo.localeCompare(b.prazo);
    }
    return a.ordem - b.ordem;
  });
}
```

Rodar → **PASSA**.

- [ ] **Step 2 (integração falha primeiro):** Criar `tests/integration/list-tasks-kanban.test.ts` (`PREFIX = 'ta-test-kanban-'`): semear org + user + 1 task com descricao `'Livre\n- [x] a\n- [ ] b\n- [ ] c'` + 2 comments (via `db.insert(taskComments)` com o userId semeado) + 1 task sem nada:

```ts
  it('listTasksKanban traz contagem de comentários e checklist sem N+1', async () => {
    const { listTasksKanban } = await import('@/modules/tasks/task.repository');
    const lista = await listTasksKanban(orgId);
    const rica = lista.find((t) => t.id === taskRicaId)!;
    expect(rica.comentarios).toBe(2);
    expect(rica.checklistFeitos).toBe(1);
    expect(rica.checklistTotal).toBe(3);
    expect(rica.reincidente).toBe(false);
    const vazia = lista.find((t) => t.id === taskVaziaId)!;
    expect(vazia.comentarios).toBe(0);
    expect(vazia.checklistTotal).toBe(0);
  });
```

Rodar → **FALHA**.

- [ ] **Step 3 (repositório):** Em `task.repository.ts` (após `listTasksByOrg`, que FICA — testes/outros usos):

```ts
import { parseChecklist } from './checklist-line';

export type TaskCardInfo = TaskSummary & {
  comentarios: number;
  checklistFeitos: number;
  checklistTotal: number;
  reincidente: boolean;
};

/** Kanban rico: summary + nº de comentários (agregado em SQL) + checklist (parse da descricao). */
export async function listTasksKanban(orgId: string): Promise<TaskCardInfo[]> {
  const rows = await db
    .select({
      task: tasks,
      comentarios: count(taskComments.id),
    })
    .from(tasks)
    .leftJoin(taskComments, eq(taskComments.task_id, tasks.id))
    .where(eq(tasks.org_id, orgId))
    .groupBy(tasks.id)
    .orderBy(tasks.status, tasks.ordem);
  return rows.map(({ task, comentarios }) => {
    const itens = parseChecklist(task.descricao);
    return {
      ...rowToSummary(task),
      comentarios: Number(comentarios),
      checklistFeitos: itens.filter((i) => i.feito).length,
      checklistTotal: itens.length,
      reincidente: task.descricao.includes('_Reincidente:'),
    };
  });
}
```

Rodar → **PASSA**.

- [ ] **Step 4 (action com retorno):** Em `tasks.actions.ts`, após `moveTaskFormAction` (que FICA intocada — compat):

```ts
/**
 * moveTaskAction — mesma regra de moveTaskFormAction, mas DEVOLVE o resultado
 * (o kanban otimista mostra toast de erro em vez de falhar em silêncio).
 * Transição continua validada exclusivamente por podeTransicionar dentro de
 * moveTask — esta action não abre porta nova.
 */
export async function moveTaskAction(formData: FormData): Promise<TaskActionState> {
  const resolved = await resolveTaskContextOrError(formData);
  if (!resolved.ok) return { error: resolved.error };
  const { access, orgId, ator } = resolved.ctx;

  const parsed = moveTaskSchema.safeParse({ taskId: formData.get('taskId'), para: formData.get('para') });
  if (!parsed.success) return { error: 'Dados inválidos. Tente novamente.' };

  try {
    await moveTask({ taskId: parsed.data.taskId, orgId, ator, actorUserId: access.id, para: parsed.data.para });
  } catch (e) {
    if (e instanceof Error && e.message === 'transicao_invalida') {
      return { error: 'Essa mudança de coluna não é permitida.' };
    }
    if (e instanceof Error && e.message === 'task_nao_encontrada') {
      return { error: 'Tarefa não encontrada.' };
    }
    throw e;
  }

  revalidateTaskRoutes(orgId);
  return { ok: true, taskId: parsed.data.taskId };
}
```

- [ ] **Step 5 (MoverTaskSelect):** Criar `src/components/tasks/MoverTaskSelect.tsx`:

```tsx
'use client';

import { STATUS_TASK_LABEL, type TaskStatus } from '@/modules/tasks/task.types';

/** Select "Mover para…": só destinos válidos (podeTransicionar, calculado pelo pai). */
export function MoverTaskSelect({
  taskId,
  destinosValidos,
  onMove,
  pendente,
}: {
  taskId: string;
  destinosValidos: TaskStatus[];
  onMove: (taskId: string, para: TaskStatus) => void;
  pendente: boolean;
}) {
  if (destinosValidos.length === 0) return null;
  return (
    <select
      aria-label="Mover para"
      data-testid={`mover-task-${taskId}`}
      value=""
      disabled={pendente}
      onChange={(e) => {
        const para = e.target.value as TaskStatus;
        if (para) onMove(taskId, para);
      }}
      className="rounded-lg border border-line bg-bg-elevated px-2 py-1 text-xs text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
    >
      <option value="" disabled>
        Mover para…
      </option>
      {destinosValidos.map((s) => (
        <option key={s} value={s}>
          {STATUS_TASK_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 6 (TaskCard rico):** Reescrever `src/components/tasks/TaskCard.tsx` (client-safe — sem 'use client' próprio, será importado pelo KanbanBoard client; manter export e forms de server action, que funcionam em client components):

```tsx
import Link from 'next/link';

import { concluirTaskFormAction } from '@/actions/tasks.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { labelPrazo, statusPrazo } from '@/modules/tasks/sla';
import { podeTransicionar } from '@/modules/tasks/task-transitions';
import type { TaskCardInfo } from '@/modules/tasks/task.repository';
import {
  PRIORIDADE_TASK_LABEL,
  TASK_STATUSES,
  TIPO_TASK_LABEL,
  type TaskAtor,
  type TaskPrioridade,
  type TaskStatus,
} from '@/modules/tasks/task.types';

import { MoverTaskSelect } from './MoverTaskSelect';

const PRIORIDADE_BADGE_VARIANT: Record<TaskPrioridade, 'danger' | 'warn' | 'neutral'> = {
  alta: 'danger',
  media: 'warn',
  baixa: 'neutral',
};

export function TaskCard({
  task,
  ator,
  taskHrefBase,
  orgId,
  onMove,
  pendente,
}: {
  task: TaskCardInfo;
  ator: TaskAtor;
  taskHrefBase: string;
  orgId?: string;
  onMove: (taskId: string, para: TaskStatus) => void;
  pendente: boolean;
}) {
  const somenteLeitura = ator === 'cliente' && (task.status === 'em_revisao' || task.status === 'concluida');
  const mostrarConcluir = !somenteLeitura && ator === 'cliente' && task.status === 'em_andamento';

  // Única porta de transição: podeTransicionar. O select só OFERECE o que ele
  // aprova; o servidor revalida em moveTask. Para o cliente, o avanço a partir
  // de em_andamento é o botão Concluir (destino calculado no server) — o
  // destino de conclusão sai da lista do select para não duplicar o caminho.
  const destinosValidos = TASK_STATUSES.filter(
    (para) =>
      !somenteLeitura &&
      para !== task.status &&
      !(mostrarConcluir && ['em_revisao', 'concluida'].includes(para)) &&
      podeTransicionar({ ator, criadoPor: task.criadoPor, de: task.status, para }),
  );

  const prazoLabel = labelPrazo(task.prazo);
  const prazoStatus = statusPrazo(task.status === 'concluida' ? null : task.prazo);

  return (
    <div data-testid="task-card" className="rounded-xl border border-line bg-bg-elevated p-3">
      <Link
        href={`${taskHrefBase}/${task.id}`}
        className="text-sm font-medium text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        {task.titulo}
      </Link>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge variant="neutral">{TIPO_TASK_LABEL[task.tipo]}</Badge>
        <Badge variant={PRIORIDADE_BADGE_VARIANT[task.prioridade]}>{PRIORIDADE_TASK_LABEL[task.prioridade]}</Badge>
        {task.reincidente ? <Badge variant="warn">Reincidente</Badge> : null}
        {prazoStatus === 'atrasada' ? <Badge variant="danger">Atrasada</Badge> : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-dim">
        {prazoLabel && task.status !== 'concluida' ? (
          <span className={prazoStatus === 'vence_em_breve' ? 'text-warning-fg' : undefined}>{prazoLabel}</span>
        ) : null}
        {task.checklistTotal > 0 ? (
          <span aria-label={`Checklist: ${task.checklistFeitos} de ${task.checklistTotal}`}>
            ☑ {task.checklistFeitos}/{task.checklistTotal}
          </span>
        ) : null}
        {task.comentarios > 0 ? (
          <span aria-label={`${task.comentarios} comentário(s)`}>💬 {task.comentarios}</span>
        ) : null}
      </div>

      {!somenteLeitura ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <MoverTaskSelect taskId={task.id} destinosValidos={destinosValidos} onMove={onMove} pendente={pendente} />
          {mostrarConcluir ? (
            <form action={concluirTaskFormAction}>
              <input type="hidden" name="taskId" value={task.id} />
              {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
              <Button type="submit" variant="secondary" size="sm" data-testid="task-concluir">
                Concluir
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
```

(as setas `←→↑↓` e os imports `moveTaskFormAction`/`reorderTaskFormAction`/`isTaskAtrasada` saem; o badge Atrasada agora deriva de `statusPrazo` — mesma semântica BRT do fix da Task 1.)

- [ ] **Step 7 (KanbanBoard otimista):** Reescrever `src/components/tasks/KanbanBoard.tsx`:

```tsx
'use client';

import { useMemo, useState, useTransition } from 'react';

import { moveTaskAction } from '@/actions/tasks.actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { TaskCard } from '@/components/tasks/TaskCard';
import { useToast } from '@/components/ui/Toast';
import { ordenarColuna } from '@/modules/tasks/kanban-order';
import type { TaskCardInfo } from '@/modules/tasks/task.repository';
import {
  STATUS_TASK_LABEL,
  TASK_STATUSES,
  type TaskAtor,
  type TaskStatus,
} from '@/modules/tasks/task.types';

export function KanbanBoard({
  tasks,
  ator,
  taskHrefBase,
  orgId,
  emptyCta,
}: {
  tasks: TaskCardInfo[];
  ator: TaskAtor;
  taskHrefBase: string;
  orgId?: string;
  emptyCta?: React.ReactNode; // Task 12: CTA pro último relatório quando o board está vazio
}) {
  // Otimismo sem useOptimistic (React 18.3): mapa taskId→status aplicado por
  // cima dos dados do servidor; limpo quando a action settla (o
  // revalidatePath da action já terá atualizado a árvore RSC na transition).
  const [movidas, setMovidas] = useState<Record<string, TaskStatus>>({});
  const [, startTransition] = useTransition();
  const [pendenteId, setPendenteId] = useState<string | null>(null);
  const { toast } = useToast();

  const efetivas = useMemo(
    () => tasks.map((t) => (movidas[t.id] ? { ...t, status: movidas[t.id]! } : t)),
    [tasks, movidas],
  );

  function onMove(taskId: string, para: TaskStatus) {
    setMovidas((prev) => ({ ...prev, [taskId]: para }));
    setPendenteId(taskId);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('taskId', taskId);
      fd.set('para', para);
      if (orgId) fd.set('orgId', orgId);
      const res = await moveTaskAction(fd);
      if (res.error) {
        toast({ variant: 'error', title: 'Não foi possível mover.', description: res.error });
      }
      setMovidas((prev) => {
        const { [taskId]: _, ...resto } = prev;
        return resto;
      });
      setPendenteId(null);
    });
  }

  if (tasks.length === 0 && emptyCta) {
    return (
      <EmptyState
        title="Nenhuma tarefa no seu Plano de Ação ainda."
        description="Converta os achados do seu último relatório em tarefas com 1 clique."
        action={emptyCta}
        data-testid="kanban-vazio"
      />
    );
  }

  const grupos = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as TaskCardInfo[]])) as Record<
    TaskStatus,
    TaskCardInfo[]
  >;
  for (const t of efetivas) grupos[t.status]?.push(t);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible md:pb-0">
      {TASK_STATUSES.map((status) => {
        const itens = ordenarColuna(grupos[status]);
        return (
          <div key={status} data-testid={`kanban-col-${status}`} className="w-64 flex-shrink-0 md:w-auto">
            <Card className="flex h-full flex-col gap-3">
              <CardHeader className="mb-0">
                <CardTitle as="h3" className="text-sm">
                  {STATUS_TASK_LABEL[status]}
                </CardTitle>
                <span className="text-xs text-dim">{itens.length}</span>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                {itens.length === 0 ? (
                  <EmptyState title="Nenhuma task" className="px-3 py-6" />
                ) : (
                  itens.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      ator={ator}
                      taskHrefBase={taskHrefBase}
                      orgId={orgId}
                      onMove={onMove}
                      pendente={pendenteId === task.id}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
```

(testids `kanban-col-{status}`/`task-card` preservados; `isFirst`/`isLast`/`agruparPorStatus` saem. `TaskCardInfo` tem `createdAt: Date` — serializável server→client no RSC.)

- [ ] **Step 8 (páginas):** Nas duas páginas que montam o board, trocar `listTasksByOrg` por `listTasksKanban`:

`dashboard/plano-de-acao/page.tsx`: `const tasks = await listTasksKanban(access.orgId);` (import ajustado; a prop `emptyCta` chega na Task 12 — por ora não passar).

`analista/[orgId]/page.tsx`: no `Promise.all`, `listTasksByOrg(orgId)` → `listTasksKanban(orgId)`.

- [ ] **Step 9:** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/plano-de-acao.spec.ts tests/e2e/relatorio-task.spec.ts` → **verdes** (o spec usa `task-concluir` e cria task — nenhum uso das setas removidas; `nova-task-form` intacto). Smoke manual: mover via select é instantâneo (card troca de coluna na hora); transição inválida forjada → toast de erro e card volta.

- [ ] **Step 10:** **Commit:** `feat(g3): kanban rico (prazo, checklist, comentarios) + mover para... otimista com toast de erro`

---
### Task 10: Notificações certas + nav Carteira + fix template + playbooks com prioridade/prazo

**Files:**
- Modify: `src/modules/tasks/task-notifications.ts` (fallback e-mail admin + 2 gatilhos novos)
- Modify: `src/modules/notifications/templates.ts` (+ `taskRevisaoTemplate`), `src/modules/notifications/email.ts` (+ `sendTaskRevisaoEmail`)
- Modify: `src/actions/tasks.actions.ts` (gatilhos do cliente + fix template desativado + campos do template)
- Modify: `src/components/app-shell.tsx` (nav admin: link "Carteira")
- Modify: `src/db/schema/task-templates.ts` (+ `prioridade`, `prazo_dias`) → gerar `src/db/migrations/0010_*.sql`
- Modify: `src/modules/tasks/task-template.repository.ts`, `src/actions/task-templates.actions.ts`, `src/app/admin/playbooks/playbooks-manager.tsx`, `src/components/tasks/NewTaskFromTemplateForm.tsx`
- Modify: `src/modules/tasks/lembretes-prazo.ts` (lembrete atrasada sem analista → e-mail admin)
- Test: `tests/integration/tasks-actions.test.ts` (mod — JUSTIFICADO abaixo), `tests/integration/task-template-repository.test.ts` (mod), `tests/unit/notification-templates.test.ts` (mod)

**Decisão de fallback (divergência 5 do topo):** org sem analista → gatilhos direcionados ao analista (`task_em_revisao`, `task_comentario` de cliente, task criada pelo cliente, conversão pelo cliente, lembrete de task atrasada) enviam **e-mail para `getAdminAlertEmail()`** (env `ADMIN_ALERT_EMAIL ?? EMAIL_FROM`) e NÃO criam in-app (não há user determinístico; buscar "um admin_truth qualquer" no banco seria flaky no branch test compartilhado e arbitrário em produção). Se a env não estiver configurada, comporta-se como hoje (descarte logado) — o "Status do sistema" da G0 já expõe a config ao admin.

**Interfaces:**
- Consumes: `dispatch` (task-notifications.ts:30-57 — privado; ganha `fallbackEmailAdmin`); `getAdminAlertEmail()` (recipients.ts:26-28); `notifyTaskCriada` (:60 — task de analista → cliente, INTOCADO); `createTaskAction` template path (tasks.actions.ts:137-148); `createTasksFromReportAction` (:619-622 — `if (ator !== 'cliente')`); `NewTaskFromTemplateForm` (envia `titulo="Task de template"` oculto — NewTaskFromTemplateForm.tsx:50); `prazoDefault`/`somarDias`/`hojeBrt` (Task 1/G0); `TaskTemplate` (repo); AppShell variant admin (app-shell.tsx:62-83 desktop, 180-204 mobile).
- Produces:

```ts
// task-notifications.ts
export async function notifyTaskCriadaPeloCliente(orgId: string, taskId: string, titulo: string): Promise<void>;
// → analista da org (in-app + e-mail taskRevisaoTemplate); sem analista → e-mail admin
export async function notifyTasksDoRelatorioParaAnalista(orgId: string, reportId: string, criadas: number): Promise<void>;
// → analista; href /analista/{orgId}; sem analista → e-mail admin

// templates.ts
export function taskRevisaoTemplate(titulo: string, url: string): EmailContent; // genérico "task precisa da sua atenção"
// email.ts
export async function sendTaskRevisaoEmail(to: string, titulo: string, url: string): Promise<void>;

// task-template.repository.ts — TaskTemplate ganha:
//   prioridade: TaskPrioridade; prazoDias: number | null;
// createTemplate/updateTemplate aceitam os campos novos.

// tasks.actions.ts — template path:
//   template inexistente/inativo → { error: 'Template indisponível. Atualize a página e tente novamente.' }
//   template válido → titulo/tipo/descricao/checklist DO template + prioridade DO template
//     + prazo = prazo do form ?? (prazoDias != null ? somarDias(hojeBrt(), prazoDias) : prazoDefault(prioridade do template))
```

- [ ] **Step 1 (migration):** Em `src/db/schema/task-templates.ts`, adicionar após `checklist` (import `integer` do pg-core):

```ts
  prioridade: varchar('prioridade', { length: 8 }).notNull().default('media'),
  prazo_dias: integer('prazo_dias'),
```

Rodar `npm run db:generate` → conferir `src/db/migrations/0010_*.sql` (numeração segue a última pós-G0 — se G0 gerou 0008/0009, esta é 0010; ajustar a expectativa ao real): só `ALTER TABLE "task_templates" ADD COLUMN "prioridade" varchar(8) DEFAULT 'media' NOT NULL;` + `ADD COLUMN "prazo_dias" integer;`. Aplicar no branch test: `npm run db:migrate:test`.

- [ ] **Step 2 (repo de templates — teste primeiro):** Em `tests/integration/task-template-repository.test.ts`, adicionar caso:

```ts
  it('prioridade e prazoDias persistem e voltam no shape do TaskTemplate', async () => {
    const { createTemplate, getTemplateById } = await import('@/modules/tasks/task-template.repository');
    const id = await createTemplate({
      titulo: `ta-test-tpl-prazo-${RUN}`,
      tipo: 'preco',
      checklist: [],
      prioridade: 'alta',
      prazoDias: 5,
    });
    idsCriados.push(id); // usar o mecanismo de cleanup do arquivo (revalidar o nome real)
    const tpl = await getTemplateById(id);
    expect(tpl?.prioridade).toBe('alta');
    expect(tpl?.prazoDias).toBe(5);
  });
```

Rodar → **FALHA**. Implementar em `task-template.repository.ts`:

```ts
export type TaskTemplate = {
  id: string;
  titulo: string;
  tipo: TaskTipo;
  descricao: string;
  checklist: string[];
  ativo: boolean;
  prioridade: TaskPrioridade;   // novo
  prazoDias: number | null;     // novo
};
```

`rowToTemplate` ganha `prioridade: row.prioridade as TaskPrioridade, prazoDias: row.prazo_dias,`; `createTemplate` ganha `prioridade?: TaskPrioridade; prazoDias?: number | null` no input (values: `prioridade: input.prioridade ?? 'media', prazo_dias: input.prazoDias ?? null`); `updateTemplate` patch ganha `prioridade` e `prazoDias` (set `prazo_dias`). Import `TaskPrioridade`. Rodar → **PASSA**.

- [ ] **Step 3 (fix template + aplicação — teste primeiro):** Em `tests/integration/tasks-actions-edicao.test.ts` (arquivo da Task 2 — mesmo mock de sessão), adicionar describe:

```ts
import { createTaskAction } from '@/actions/tasks.actions';
import { taskTemplates } from '@/db/schema';
import { hojeBrt } from '@/lib/timezone';
import { somarDias } from '@/modules/tasks/sla';

describe.skipIf(!url)('createTaskAction com template (integração)', () => {
  it('template desativado → erro, NÃO cria task placeholder', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active' };
    const [tpl] = await db
      .insert(taskTemplates)
      .values({ titulo: `${PREFIX}tpl-off-${RUN}`, tipo: 'preco', ativo: false })
      .returning({ id: taskTemplates.id });
    const r = await createTaskAction(
      {},
      form({ orgId, titulo: 'Task de template', tipo: 'outro', prioridade: 'media', templateId: tpl!.id }),
    );
    expect(r.error).toBe('Template indisponível. Atualize a página e tente novamente.');
    const criadas = await db.select().from(tasks).where(and(eq(tasks.org_id, orgId), eq(tasks.titulo, 'Task de template')));
    expect(criadas).toHaveLength(0);
    await db.delete(taskTemplates).where(eq(taskTemplates.id, tpl!.id));
  });

  it('template ativo aplica prioridade e prazo_dias do playbook', async () => {
    sessaoMock.access = { id: adminId, orgId, role: 'admin_truth', orgStatus: 'active' };
    const [tpl] = await db
      .insert(taskTemplates)
      .values({ titulo: `${PREFIX}tpl-on-${RUN}`, tipo: 'preco', ativo: true, prioridade: 'alta', prazo_dias: 5 })
      .returning({ id: taskTemplates.id });
    const r = await createTaskAction(
      {},
      form({ orgId, titulo: 'Task de template', tipo: 'outro', prioridade: 'media', templateId: tpl!.id }),
    );
    expect(r.ok).toBe(true);
    const [t] = await db.select().from(tasks).where(eq(tasks.id, r.taskId!));
    expect(t!.titulo).toBe(`${PREFIX}tpl-on-${RUN}`);
    expect(t!.prioridade).toBe('alta');
    expect(t!.prazo).toBe(somarDias(hojeBrt(), 5));
    await db.delete(taskTemplates).where(eq(taskTemplates.id, tpl!.id));
  });
});
```

(cleanup extra no afterAll: tasks da org já são apagadas lá.) Rodar → **FALHA**. Implementar em `createTaskAction` (substituindo o bloco 137-148):

```ts
  let prioridadeFinal: TaskPrioridade = prioridade;
  let prazoFinal: string | null = prazo ?? null;

  // templateId é um recurso do analista/admin — cliente nunca copia template.
  if (templateId && ator !== 'cliente') {
    const template = await getTemplateById(templateId);
    if (!template || !template.ativo) {
      // Antes: caía no fluxo normal e criava a task placeholder "Task de
      // template" (o form envia titulo oculto). Agora: erro honesto.
      return { error: 'Template indisponível. Atualize a página e tente novamente.' };
    }
    titulo = template.titulo;
    tipo = template.tipo;
    descricao = template.descricao;
    if (template.checklist.length > 0) {
      const checklistLines = template.checklist.map((item) => `${CHECKLIST_UNCHECKED}${item}`).join('\n');
      descricao = descricao ? `${descricao}\n${checklistLines}` : checklistLines;
    }
    prioridadeFinal = template.prioridade;
    prazoFinal =
      prazo ??
      (template.prazoDias != null ? somarDias(hojeBrt(), template.prazoDias) : null);
  }

  const criadoPor: TaskCriadoPor = ator === 'cliente' ? 'cliente' : 'analista';

  const taskId = await createTask({
    orgId,
    titulo,
    descricao,
    tipo,
    prioridade: prioridadeFinal,
    criadoPor,
    prazo: prazoFinal ?? prazoDefault(prioridadeFinal),
    actorUserId: access.id,
  });
```

(imports: `somarDias` de `@/modules/tasks/sla`, `hojeBrt` de `@/lib/timezone`, `type TaskPrioridade` de task.types; o `prazoDefault` da Task 1 continua sendo o fallback final.) Rodar → **PASSA**.

- [ ] **Step 4 (form do template + admin playbooks):**

`NewTaskFromTemplateForm.tsx` — REMOVER os `Field` de Prioridade e Prazo e o hidden `prioridade` (o playbook agora manda; manter hidden `titulo`/`tipo` — o zod os exige); atualizar o JSDoc: "prioridade e prazo vêm do playbook (prazo_dias); o servidor aplica". O form fica: hidden orgId/titulo/tipo + select de template + submit (testid `nova-task-template-form` intacto).

`task-templates.actions.ts` — `templateSchema` ganha:

```ts
  prioridade: z.enum(TASK_PRIORIDADES).default('media'),
  prazoDias: z.coerce.number().int().min(1).max(365).optional(),
```

(import `TASK_PRIORIDADES`); nos dois actions, parsear `prioridade: formData.get('prioridade')` e `prazoDias: formData.get('prazoDias') || undefined` e repassar `{ prioridade, prazoDias: prazoDias ?? null }` a `createTemplate`/`updateTemplate`.

`playbooks-manager.tsx` — no form (junto do Field de Tipo), adicionar:

```tsx
          <Field label="Prioridade" htmlFor="prioridade">
            <Select id="prioridade" name="prioridade" defaultValue={editing?.prioridade ?? 'media'}>
              {TASK_PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {PRIORIDADE_TASK_LABEL[p]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Prazo (dias após criação)" htmlFor="prazoDias">
            <Input id="prazoDias" name="prazoDias" type="number" min={1} max={365} defaultValue={editing?.prazoDias ?? ''} />
          </Field>
```

(imports `TASK_PRIORIDADES`/`PRIORIDADE_TASK_LABEL`; revalidar os nomes reais de `editing` no arquivo.)

- [ ] **Step 5 (fallback + gatilhos novos — teste primeiro):** Em `tests/integration/tasks-actions.test.ts`, ATUALIZAR o caso `'notifyTaskEmRevisao: org SEM analista → não lança e não chama notify (destinatário null)'` (linha ~129): **continua não chamando `notify`** (sem in-app), mas agora asserta o fallback de e-mail. **Justificativa da mudança:** comportamento intencional da G3 (auditoria P1-CRM: descarte silencioso) — o teste ganha o novo contrato:

```ts
  it('notifyTaskEmRevisao: org SEM analista → sem in-app; com ADMIN_ALERT_EMAIL → e-mail de fallback', async () => {
    const notifySpy = vi.spyOn(notificationRepo, 'notify');
    const emailSpy = vi.spyOn(emailModule, 'sendTaskRevisaoEmail').mockResolvedValue();
    // serverEnv já vem mockado no topo do arquivo? Se NÃO houver vi.mock de env
    // aqui, adicionar no describe: vi.mock('@/lib/env') com ADMIN_ALERT_EMAIL
    // definido (padrão do cron-verificar-alertas.test.ts).
    await notifyTaskEmRevisao(orgSemAnalistaId, taskId, 'Título');
    expect(notifySpy).not.toHaveBeenCalled();
    expect(emailSpy).toHaveBeenCalledWith('admin-alertas@teste.dev', 'Título', expect.stringContaining('/analista/'));
  });
```

(adaptar ao boilerplate REAL do arquivo — ele já tem spies de notify/email; o valor `'admin-alertas@teste.dev'` vem do mock de env.) Rodar → **FALHA**.

- [ ] **Step 6 (implementar notificações):**

`templates.ts`:

```ts
/** Template: task aguardando ação da consultoria (revisão/nova task do cliente). */
export function taskRevisaoTemplate(titulo: string, url: string): EmailContent {
  const subject = 'Tarefa aguardando sua atenção — Truth Analytics';
  const text = [
    'Uma tarefa precisa da atenção da consultoria.',
    '',
    `Tarefa: ${titulo}`,
    '',
    `Acesse em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Uma tarefa precisa da atenção da consultoria.</p>
<p><strong>Tarefa:</strong> ${escapeHtml(titulo)}</p>
<p><a href="${escapeHtml(url)}">Clique aqui para visualizar a tarefa</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;
  return { subject, html, text };
}
```

`email.ts`:

```ts
/** Task aguardando ação da consultoria. Nunca lança. */
export async function sendTaskRevisaoEmail(to: string, titulo: string, url: string): Promise<void> {
  const content = taskRevisaoTemplate(titulo, url);
  await sendEmail({ to, ...content });
}
```

`task-notifications.ts` — `dispatch` ganha o fallback (import `getAdminAlertEmail` de recipients):

```ts
async function dispatch(input: {
  taskId: string;
  tipo: string;
  tituloNotificacao: string;
  corpo: string;
  href: string;
  getDestinatario: () => Promise<Destinatario | null>;
  enviarEmail?: EmailSender;
  /** Sem destinatário (org sem analista): manda o e-mail p/ getAdminAlertEmail() — sem in-app. */
  fallbackEmailAdmin?: boolean;
}): Promise<void> {
  try {
    const destinatario = await input.getDestinatario();
    const url = `${serverEnv.APP_URL}${input.href}`;
    if (!destinatario) {
      if (input.fallbackEmailAdmin && input.enviarEmail) {
        const adminEmail = getAdminAlertEmail();
        if (adminEmail) await input.enviarEmail(adminEmail, input.corpo, url);
      }
      return;
    }
    await notify(destinatario.id, {
      tipo: input.tipo,
      titulo: input.tituloNotificacao,
      corpo: input.corpo,
      href: input.href,
    });
    if (input.enviarEmail) {
      await input.enviarEmail(destinatario.email, input.corpo, url);
    }
  } catch (e) {
    logger.warn('gatilho de notificação de task falhou', { taskId: input.taskId, tipo: input.tipo }, e);
  }
}
```

`notifyTaskEmRevisao` ganha `enviarEmail: sendTaskRevisaoEmail, fallbackEmailAdmin: true`; `notifyTaskComentario` ganha `fallbackEmailAdmin: autorEhCliente` (fallback só quando o alvo é a consultoria). Gatilhos novos:

```ts
/** Task criada PELO CLIENTE → notifica o analista da org (fallback: e-mail admin). */
export async function notifyTaskCriadaPeloCliente(orgId: string, taskId: string, titulo: string): Promise<void> {
  await dispatch({
    taskId,
    tipo: 'task_criada_cliente',
    tituloNotificacao: 'Cliente criou uma tarefa',
    corpo: titulo,
    href: hrefAnalista(orgId, taskId),
    getDestinatario: () => getOrgAnalistaUser(orgId),
    enviarEmail: sendTaskRevisaoEmail,
    fallbackEmailAdmin: true,
  });
}

/** Cliente converteu achados em N tasks → notifica o analista (fallback: e-mail admin). */
export async function notifyTasksDoRelatorioParaAnalista(
  orgId: string,
  reportId: string,
  criadas: number,
): Promise<void> {
  const texto = `Cliente criou ${criadas} tarefa(s) a partir do relatório`;
  await dispatch({
    taskId: reportId,
    tipo: 'tasks_do_relatorio_cliente',
    tituloNotificacao: texto,
    corpo: texto,
    href: `/analista/${orgId}`,
    getDestinatario: () => getOrgAnalistaUser(orgId),
    enviarEmail: sendTaskRevisaoEmail,
    fallbackEmailAdmin: true,
  });
}
```

`tasks.actions.ts` — em `createTaskAction`, trocar o bloco de gatilho (166-168) por:

```ts
  if (ator !== 'cliente') {
    await notifyTaskCriada(orgId, taskId, titulo);
  } else {
    await notifyTaskCriadaPeloCliente(orgId, taskId, titulo);
  }
```

e em `createTasksFromReportAction` (619-622):

```ts
    if (ator !== 'cliente') {
      await notifyTasksDoRelatorio(orgId, reportId, criadas);
    } else {
      await notifyTasksDoRelatorioParaAnalista(orgId, reportId, criadas);
    }
```

`lembretes-prazo.ts` (Task 7) — no ramo `atrasada`, quando `analista === null`, enviar `sendLembretePrazoEmail(getAdminAlertEmail()!, ...)` se `getAdminAlertEmail()` não for null (import de recipients). Rodar o teste do Step 5 → **PASSA**; adicionar mais um caso rápido no mesmo arquivo assertando que `notifyTaskCriadaPeloCliente` com analista presente chama `notify` com `href` `/analista/{orgId}/tasks/{taskId}` (padrão dos casos vizinhos).

- [ ] **Step 7 (nav Carteira do admin):** Em `app-shell.tsx`, dentro do bloco `variant === 'admin'` (desktop, após "Consultoria") E no bloco mobile correspondente, adicionar:

```tsx
                <a
                  href="/analista"
                  className="rounded-lg px-3 py-1.5 text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  Carteira
                </a>
```

(no mobile usar `px-3 py-2` + `onClick={() => setMenuOpen(false)}` como os vizinhos. `/analista` aceita admin: `requireAnalista` admite `admin_truth`, e `getCarteira` admin vê todas as orgs — confirmado em analista.repository.ts:84-91.)

- [ ] **Step 8:** `npm run test` + `npm run typecheck` verdes (incl. `tasks-actions.test.ts` atualizado). **Commit:** `feat(g3): notificacoes simetricas (analista avisado) + fallback email admin + fix template desativado + playbooks com prioridade e prazo`

---
### Task 11: Impacto agregado para renovação (admin/consultoria + carteira)

**Files:**
- Modify: `src/modules/reports/report.repository.ts` (+ `getPrimeiroDoneReport`, `getDoneMaisProximo`)
- Modify: `src/modules/tasks/task-impact.ts` (task SEM `reportId`)
- Create: `src/modules/analista/impacto-renovacao.ts` (modelo puro)
- Modify: `src/modules/analista/analista.repository.ts` (+ `getImpactoPorOrg`)
- Modify: `src/app/admin/consultoria/page.tsx` (seção "Impacto por cliente"), `src/app/analista/page.tsx` (linha de impacto no card da carteira)
- Test: `tests/unit/impacto-renovacao.test.ts` (criar), `tests/integration/impacto-renovacao.test.ts` (criar), `tests/integration/task-impact.test.ts` (mod — caso sem report)

**Interfaces:**
- Consumes: `getTaskImpact` (task-impact.ts:29-56 — hoje devolve `null` quando `!task.reportId`, linha 33); `getLatestDoneReportAfter(orgId, afterCreatedAt, excludeId)` (report.repository.ts:127); `MetricasSchema`; `totalVendas` privado de task-impact (reduce de `vendasPorCanal`); `metricas.truth_score.score` (opcional no jsonb); `taskActivities` (`evento='status'`, `para='concluida'`); `CarteiraOrg`/`getCarteira` (Task 6); `ReportDetail` (report.repository — tem `metricas`, `createdAt`, `periodoInicio`, `periodoFim`).
- Produces:

```ts
// report.repository.ts
export async function getPrimeiroDoneReport(orgId: string): Promise<ReportDetail | null>; // done mais ANTIGO (created_at asc)
export async function getDoneMaisProximo(orgId: string, ref: Date): Promise<ReportDetail | null>;
// done mais recente com created_at <= ref; fallback: done mais antigo com created_at > ref (decisão da auditoria:
// baseline = done mais próximo da criação da task)

// task-impact.ts — getTaskImpact(taskId, orgId): MESMA assinatura/retorno; para task sem reportId,
// origem = getDoneMaisProximo(orgId, task.createdAt) (era: return null)

// impacto-renovacao.ts (puro)
export type PontaRelatorio = { total: number; score: number | null; periodoFim: Date };
export type ImpactoOrg = {
  orgId: string;
  orgName: string;
  primeiro: PontaRelatorio | null;
  ultimo: PontaRelatorio | null;   // null quando a org tem <2 dones (sem comparação)
  deltaFaturamentoPct: number | null; // (ultimo-primeiro)/primeiro*100, 1 casa; primeiro 0 → null
  deltaScore: number | null;          // ultimo.score - primeiro.score quando ambos existem
  tasksConcluidas: number;            // concluídas entre primeiro.createdAt e ultimo.createdAt
};
export function impactoRenovacao(input: {
  orgId: string;
  orgName: string;
  primeiro: { total: number; score: number | null; periodoFim: Date } | null;
  ultimo: { total: number; score: number | null; periodoFim: Date } | null;
  tasksConcluidas: number;
}): ImpactoOrg;

// analista.repository.ts
export async function getImpactoPorOrg(access: UserAccess): Promise<ImpactoOrg[]>;
// escopo por papel (padrão getCarteira); loop por org com Promise.all interno — carteiras são pequenas
// (dezenas), anotado como aceitável; NÃO reintroduz N+1 em listas grandes de tasks.
```

- [ ] **Step 1 (unit falha primeiro):** Criar `tests/unit/impacto-renovacao.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { impactoRenovacao } from '@/modules/analista/impacto-renovacao';

const base = { orgId: 'o1', orgName: 'Org' };

describe('impactoRenovacao', () => {
  it('deltas de faturamento (1 casa) e score', () => {
    const r = impactoRenovacao({
      ...base,
      primeiro: { total: 9700, score: 58, periodoFim: new Date('2026-05-31') },
      ultimo: { total: 10880, score: 76, periodoFim: new Date('2026-06-30') },
      tasksConcluidas: 5,
    });
    expect(r.deltaFaturamentoPct).toBe(12.2);
    expect(r.deltaScore).toBe(18);
    expect(r.tasksConcluidas).toBe(5);
  });

  it('sem 2 dones → deltas null', () => {
    const r = impactoRenovacao({ ...base, primeiro: null, ultimo: null, tasksConcluidas: 0 });
    expect(r.deltaFaturamentoPct).toBeNull();
    expect(r.deltaScore).toBeNull();
  });

  it('primeiro com total 0 → deltaFaturamentoPct null (sem divisão por zero)', () => {
    const r = impactoRenovacao({
      ...base,
      primeiro: { total: 0, score: null, periodoFim: new Date('2026-05-31') },
      ultimo: { total: 100, score: 60, periodoFim: new Date('2026-06-30') },
      tasksConcluidas: 1,
    });
    expect(r.deltaFaturamentoPct).toBeNull();
    expect(r.deltaScore).toBeNull(); // score do primeiro é null
  });
});
```

Rodar → **FALHA**. Implementar `src/modules/analista/impacto-renovacao.ts`:

```ts
export type PontaRelatorio = { total: number; score: number | null; periodoFim: Date };

export type ImpactoOrg = {
  orgId: string;
  orgName: string;
  primeiro: PontaRelatorio | null;
  ultimo: PontaRelatorio | null;
  deltaFaturamentoPct: number | null;
  deltaScore: number | null;
  tasksConcluidas: number;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Payoff da consultoria: 1º vs último relatório done + tasks concluídas no intervalo (puro). */
export function impactoRenovacao(input: {
  orgId: string;
  orgName: string;
  primeiro: PontaRelatorio | null;
  ultimo: PontaRelatorio | null;
  tasksConcluidas: number;
}): ImpactoOrg {
  const { primeiro, ultimo } = input;
  const deltaFaturamentoPct =
    primeiro && ultimo && primeiro.total > 0 ? round1(((ultimo.total - primeiro.total) / primeiro.total) * 100) : null;
  const deltaScore =
    primeiro && ultimo && primeiro.score !== null && ultimo.score !== null ? ultimo.score - primeiro.score : null;
  return { ...input, deltaFaturamentoPct, deltaScore };
}
```

Rodar → **PASSA**.

- [ ] **Step 2 (queries de report — teste de integração falha primeiro):** Criar `tests/integration/impacto-renovacao.test.ts` (`PREFIX = 'ta-test-impacto-'`): semear org + 2 reports done (created_at naturalmente ordenados pela inserção; metricas `{ vendasPorCanal: [{ canal: 'x', total: 9700, pedidos: 1 }], evolucao: [], ticketMedio: 0, topProdutos: [], posicaoPreco: [], benchmarkParcial: false, truth_score: <objeto completo com score 58 — copiar o shape de tests/unit/... contracts com totalPeriodo/fatores> }` e o 2º com total 10880/score 76) + 1 task concluída com activity `status→concluida` entre os dois `created_at` (inserir a activity DEPOIS do 1º report e ANTES do 2º — na prática, como created_at é defaultNow, inserir na ordem: report1 → task+activity → report2):

```ts
  it('getPrimeiroDoneReport / getDoneMaisProximo', async () => {
    const { getDoneMaisProximo, getPrimeiroDoneReport } = await import('@/modules/reports/report.repository');
    const primeiro = await getPrimeiroDoneReport(orgId);
    expect(primeiro?.id).toBe(rep1Id);
    const proximo = await getDoneMaisProximo(orgId, new Date()); // agora → o mais recente <= agora
    expect(proximo?.id).toBe(rep2Id);
    const antesDoPrimeiro = await getDoneMaisProximo(orgId, new Date(Date.now() - 365 * 86_400_000));
    expect(antesDoPrimeiro?.id).toBe(rep1Id); // fallback: mais antigo depois da ref
  });

  it('getImpactoPorOrg agrega primeiro vs último + tasks concluídas no intervalo', async () => {
    const { getImpactoPorOrg } = await import('@/modules/analista/analista.repository');
    const lista = await getImpactoPorOrg({ id: analistaId, orgId, role: 'analista' } as UserAccess);
    const org = lista.find((o) => o.orgId === orgId)!;
    expect(org.primeiro?.total).toBe(9700);
    expect(org.ultimo?.total).toBe(10880);
    expect(org.deltaFaturamentoPct).toBe(12.2);
    expect(org.deltaScore).toBe(18);
    expect(org.tasksConcluidas).toBe(1);
  });

  it('getTaskImpact para task SEM report_id usa o done mais próximo da criação como baseline', async () => {
    const { getTaskImpact } = await import('@/modules/tasks/task-impact');
    // taskConcluidaSemReportId criada entre rep1 e rep2 → origem rep1, atual rep2
    const impact = await getTaskImpact(taskSemReportId, orgId);
    expect(impact).not.toBeNull();
    expect(impact!.totalOrigem).toBe(9700);
    expect(impact!.totalAtual).toBe(10880);
  });
```

(a org precisa de `analista_id` do analista semeado.) Rodar → **FALHA**.

- [ ] **Step 3 (implementar queries):**

`report.repository.ts` (imports `asc`/`lte`/`gt` conforme necessário; seguir o estilo de `getLatestDoneReport`):

```ts
/** Done mais ANTIGO da org — a "foto de entrada" do cliente na consultoria. */
export async function getPrimeiroDoneReport(orgId: string): Promise<ReportDetail | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done')))
    .orderBy(asc(reports.created_at))
    .limit(1);
  return row ? rowToDetail(row) : null;
}

/**
 * Done mais próximo de `ref`: o mais recente com created_at <= ref; se não
 * houver (task mais velha que qualquer relatório), o mais antigo depois de
 * ref. Baseline de impacto p/ tasks sem report_id (decisão da auditoria).
 */
export async function getDoneMaisProximo(orgId: string, ref: Date): Promise<ReportDetail | null> {
  const [antes] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done'), lte(reports.created_at, ref)))
    .orderBy(desc(reports.created_at))
    .limit(1);
  if (antes) return rowToDetail(antes);
  const [depois] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.org_id, orgId), eq(reports.status, 'done'), gt(reports.created_at, ref)))
    .orderBy(asc(reports.created_at))
    .limit(1);
  return depois ? rowToDetail(depois) : null;
}
```

`task-impact.ts` — trocar as linhas 33-36 (`if (!task.reportId) return null; const origem = await getReportById(...)`) por:

```ts
  // Task de relatório: origem = o próprio report. Task manual/cliente (sem
  // report_id): origem = done mais próximo da criação da task (auditoria G3).
  const origem = task.reportId
    ? await getReportById(task.reportId, orgId)
    : await getDoneMaisProximo(orgId, task.createdAt);
  if (!origem || origem.status !== 'done') return null;
```

(import `getDoneMaisProximo`; `task.createdAt` existe em `TaskDetail` via `TaskSummary`.) Em `tests/integration/task-impact.test.ts`, ATUALIZAR o caso que asserta `null` para task sem reportId (se existir — grep `reportId` no arquivo): agora espera impacto quando há 2 dones; justificar no commit (contrato estendido de propósito).

`analista.repository.ts`:

```ts
import { getDoneMaisProximo, getPrimeiroDoneReport, getLatestDoneReport } from '@/modules/reports/report.repository';
import { MetricasSchema } from '@/modules/pipeline/contracts';
import { impactoRenovacao, type ImpactoOrg } from './impacto-renovacao';

function pontaDoReport(rep: { metricas: unknown; periodoFim: Date } | null):
  | { total: number; score: number | null; periodoFim: Date }
  | null {
  if (!rep) return null;
  const parsed = MetricasSchema.safeParse(rep.metricas);
  if (!parsed.success) return null;
  const total = parsed.data.vendasPorCanal.reduce((s, c) => s + c.total, 0);
  return { total, score: parsed.data.truth_score?.score ?? null, periodoFim: rep.periodoFim };
}

/** Impacto 1º vs último done por org da carteira (renovação). Carteira pequena → loop aceitável. */
export async function getImpactoPorOrg(access: UserAccess): Promise<ImpactoOrg[]> {
  const orgs =
    access.role === 'admin_truth'
      ? (await listClientOrganizations()).map((o) => ({ id: o.id, name: o.name }))
      : await db
          .select({ id: organizations.id, name: organizations.name })
          .from(organizations)
          .where(eq(organizations.analista_id, access.id));

  return Promise.all(
    orgs.map(async (org) => {
      const [primeiroRep, ultimoRep] = await Promise.all([
        getPrimeiroDoneReport(org.id),
        getLatestDoneReport(org.id),
      ]);
      const doisDones = primeiroRep && ultimoRep && primeiroRep.id !== ultimoRep.id;
      let tasksConcluidas = 0;
      if (doisDones) {
        const [row] = await db
          .select({ n: sql<number>`count(distinct ${taskActivities.task_id})::int` })
          .from(taskActivities)
          .innerJoin(tasks, eq(taskActivities.task_id, tasks.id))
          .where(
            and(
              eq(tasks.org_id, org.id),
              eq(taskActivities.evento, 'status'),
              eq(taskActivities.para, 'concluida'),
              gte(taskActivities.created_at, primeiroRep.createdAt),
              lte(taskActivities.created_at, ultimoRep.createdAt),
            ),
          );
        tasksConcluidas = Number(row?.n ?? 0);
      }
      return impactoRenovacao({
        orgId: org.id,
        orgName: org.name,
        primeiro: doisDones ? pontaDoReport(primeiroRep) : null,
        ultimo: doisDones ? pontaDoReport(ultimoRep) : null,
        tasksConcluidas,
      });
    }),
  );
}
```

(`lte` ao import; `ReportDetail` precisa expor `createdAt` — confirmar no `rowToDetail` real; se o campo não existir no tipo, adicionar ao select/detail é mudança aditiva, anotar.) Rodar `npm run test -- tests/integration/impacto-renovacao.test.ts` → **PASSA**.

- [ ] **Step 4 (UI admin):** Em `src/app/admin/consultoria/page.tsx`, carregar junto (`requireAdmin` já devolve o access? — a página chama `await requireAdmin()` sem capturar; capturar `const admin = await requireAdmin();` e usar `getImpactoPorOrg({ ...admin } as UserAccess)` — revalidar o shape retornado por `requireAdmin`) e renderizar após a tabela de analistas:

```tsx
      <Card className="!p-0">
        <Table data-testid="impacto-orgs-table">
          <THead>
            <TR>
              <TH>Cliente</TH>
              <TH>Faturamento 1º → último</TH>
              <TH>Score 1º → último</TH>
              <TH>Tasks concluídas</TH>
            </TR>
          </THead>
          <TBody>
            {impacto.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted" colSpan={4}>
                  Nenhum cliente com relatórios suficientes para comparar.
                </td>
              </tr>
            ) : (
              impacto.map((o) => (
                <TR key={o.orgId}>
                  <TD>{o.orgName}</TD>
                  <TD numeric>
                    {o.primeiro && o.ultimo
                      ? `${formatBRL(o.primeiro.total)} → ${formatBRL(o.ultimo.total)}${o.deltaFaturamentoPct !== null ? ` (${o.deltaFaturamentoPct > 0 ? '+' : ''}${o.deltaFaturamentoPct}%)` : ''}`
                      : '—'}
                  </TD>
                  <TD numeric>
                    {o.primeiro?.score !== null && o.primeiro !== null && o.ultimo?.score != null
                      ? `${o.primeiro.score} → ${o.ultimo.score}`
                      : '—'}
                  </TD>
                  <TD numeric>{o.tasksConcluidas}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </Card>
```

(import `formatBRL`; filtrar `impacto = (await getImpactoPorOrg(...)).filter((o) => o.primeiro !== null)` para a tabela só listar quem tem comparação — decisão de UI.)

- [ ] **Step 5 (carteira do analista):** Em `src/app/analista/page.tsx`, adicionar `getImpactoPorOrg(access)` ao `Promise.all` e, no card da carteira (`carteira-org`), abaixo da linha de Atrasadas/Em revisão:

```tsx
                  {(() => {
                    const imp = impactoMap.get(org.orgId);
                    return imp?.deltaFaturamentoPct !== null && imp?.deltaFaturamentoPct !== undefined ? (
                      <p className="text-xs text-dim">
                        Desde o 1º relatório:{' '}
                        <span className={imp.deltaFaturamentoPct >= 0 ? 'text-success-fg' : 'text-danger-fg'}>
                          {imp.deltaFaturamentoPct > 0 ? '+' : ''}
                          {imp.deltaFaturamentoPct}% faturamento
                        </span>
                        {imp.deltaScore !== null ? ` · score ${imp.deltaScore > 0 ? '+' : ''}${imp.deltaScore}` : ''}
                      </p>
                    ) : null;
                  })()}
```

com `const impactoMap = new Map(impacto.map((i) => [i.orgId, i]));`.

- [ ] **Step 6:** `npm run test` + `npm run typecheck` verdes. **Commit:** `feat(g3): impacto agregado para renovacao — 1o vs ultimo relatorio + impacto de task sem report`

---
### Task 12: Higiene do CRM (timeline com autor, página de notificações, empty state, tempo médio honesto)

**Files:**
- Modify: `src/modules/tasks/task-activity.repository.ts` (`listTaskActivities` + `userEmail`)
- Modify: `src/components/tasks/TaskDetail.tsx` (labels novos + autor)
- Modify: `src/modules/notifications/notification.repository.ts` (+ `listNotificationsPage`)
- Modify: `src/components/notifications/NotificationBell.tsx` (+ prop `verTodasHref`), `src/components/app-shell.tsx` (passa a prop no variant client)
- Create: `src/app/(client)/dashboard/notificacoes/page.tsx`
- Modify: `src/app/(client)/dashboard/plano-de-acao/page.tsx` (empty CTA)
- Modify: `src/modules/analista/analista.repository.ts:176-185` (`tempoMedioConclusaoDias`)
- Test: `tests/integration/notifications-page.test.ts` (criar), `tests/integration/consultoria-metrics.test.ts` (mod — tempo médio), `tests/integration/task-comments.test.ts` (intocado)

**Decisões:** (a) página de notificações é **rota única na área client** (`/dashboard/notificacoes`); o link "Ver todas" só aparece quando o AppShell está no variant `client` (o Bell ganha prop `verTodasHref?: string` — analista/admin seguem só com o popover; anotado como limitação aceita, o consumidor primário de notificações é o cliente); (b) "tempo médio de conclusão" passa a contar **a PRIMEIRA transição a concluida por task** (`MIN(created_at)`) e **janela de 90d** — o `AVG` atual (analista.repository.ts:176-185) conta re-conclusões repetidas e a vida inteira do banco; (c) labels de evento faltantes: `assignee`, `lembrete_prazo` (Task 7), `reincidencia` (Task 4).

**Interfaces:**
- Consumes: `listTaskActivities(taskId, orgId)` (task-activity.repository.ts:22-41 — join com `tasks`, sem autor); padrão de join de autor de `listTaskComments` (task-comment.repository.ts:29 `userEmail: users.email` com innerJoin); `listNotifications`/`markAllRead` (notification.repository); `EVENTO_LABEL` (TaskDetail.tsx:38-45); `getLatestDoneReport` (report.repository:111); `KanbanBoard.emptyCta` (Task 9); `formatData`.
- Produces:

```ts
// task-activity.repository.ts — listTaskActivities passa a devolver também:
//   userEmail: string | null (LEFT JOIN users — user_id é nullable: sistema/cron)

// notification.repository.ts
export async function listNotificationsPage(
  userId: string,
  page: number,
  pageSize?: number, // default 20
): Promise<{ items: Array<{ id: string; tipo: string; titulo: string; corpo: string; href: string | null; lida: boolean; createdAt: Date }>; total: number }>;

// NotificationBell.tsx — prop nova: verTodasHref?: string (renderiza link "Ver todas" no rodapé do popover)
```

- [ ] **Step 1 (timeline com autor — teste primeiro):** Em `tests/integration/notifications-page.test.ts` NÃO (é outro assunto) — criar o caso no arquivo de integração existente de activities se houver; senão, adicionar ao `tests/integration/tasks-actions-edicao.test.ts` (org/task já semeadas lá):

```ts
  it('listTaskActivities devolve o autor (userEmail) e null para eventos de sistema', async () => {
    const { listTaskActivities, recordTaskActivity } = await import('@/modules/tasks/task-activity.repository');
    await recordTaskActivity({ taskId: taskAutorId, userId: adminId, evento: 'editada' });
    await recordTaskActivity({ taskId: taskAutorId, userId: null, evento: 'lembrete_prazo', de: '2026-08-01', para: 'atrasada' });
    const acts = await listTaskActivities(taskAutorId, orgId);
    expect(acts.find((a) => a.evento === 'editada')?.userEmail).toContain('@example.com');
    expect(acts.find((a) => a.evento === 'lembrete_prazo')?.userEmail).toBeNull();
  });
```

(semear `taskAutorId` própria para não colidir com o caso de exclusão.) Rodar → **FALHA**. Implementar em `task-activity.repository.ts`: adicionar `import { users } from '@/db/schema'` ao import existente, `.leftJoin(users, eq(taskActivities.user_id, users.id))` e `userEmail: users.email,` no select de `listTaskActivities`. Rodar → **PASSA**.

- [ ] **Step 2 (labels + autor no TaskDetail):** Em `TaskDetail.tsx`:

1. `EVENTO_LABEL` ganha:

```ts
  assignee: 'Responsável alterado',
  lembrete_prazo: 'Lembrete de prazo enviado',
  reincidencia: 'Reincidência de recomendação já concluída',
```

2. O tipo da prop `activities` ganha `userEmail: string | null`; o `<li>` da timeline mostra o autor:

```tsx
                <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-white/80">
                    {eventoLabel(a)}
                    {a.userEmail ? <span className="text-xs text-dim"> — {a.userEmail}</span> : null}
                  </span>
                  <span className="whitespace-nowrap text-xs text-dim">{formatData(a.createdAt)}</span>
                </li>
```

- [ ] **Step 3 (paginação — teste primeiro):** Criar `tests/integration/notifications-page.test.ts` (`PREFIX = 'ta-test-notifpage-'`): semear org + user + 25 notifications (loop `notify(userId, {...})`):

```ts
  it('listNotificationsPage pagina (20 + 5) e devolve total', async () => {
    const { listNotificationsPage } = await import('@/modules/notifications/notification.repository');
    const p1 = await listNotificationsPage(userId, 1);
    expect(p1.items).toHaveLength(20);
    expect(p1.total).toBe(25);
    const p2 = await listNotificationsPage(userId, 2);
    expect(p2.items).toHaveLength(5);
    // escopo: outro user não vê
    const outra = await listNotificationsPage(outroUserId, 1);
    expect(outra.total).toBe(0);
  });
```

Rodar → **FALHA**. Implementar em `notification.repository.ts`:

```ts
const PAGE_SIZE_DEFAULT = 20;

/** Página de notificações do usuário (mais recentes primeiro) + total p/ paginação. */
export async function listNotificationsPage(userId: string, page: number, pageSize = PAGE_SIZE_DEFAULT) {
  const paginaSegura = Math.max(1, Math.floor(page));
  const [items, [totalRow]] = await Promise.all([
    db
      .select({
        id: notifications.id,
        tipo: notifications.tipo,
        titulo: notifications.titulo,
        corpo: notifications.corpo,
        href: notifications.href,
        lida: notifications.lida,
        createdAt: notifications.created_at,
      })
      .from(notifications)
      .where(eq(notifications.user_id, userId))
      .orderBy(desc(notifications.created_at))
      .limit(pageSize)
      .offset((paginaSegura - 1) * pageSize),
    db.select({ n: count() }).from(notifications).where(eq(notifications.user_id, userId)),
  ]);
  return { items, total: Number(totalRow?.n ?? 0) };
}
```

Rodar → **PASSA**.

- [ ] **Step 4 (página + bell):** Criar `src/app/(client)/dashboard/notificacoes/page.tsx`:

```tsx
import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatData } from '@/lib/format';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { listNotificationsPage } from '@/modules/notifications/notification.repository';

const PAGE_SIZE = 20;

export default async function NotificacoesPage({ searchParams }: { searchParams: { pagina?: string } }) {
  const access = await requireActiveOrg();
  const pagina = Math.max(1, Number(searchParams.pagina ?? '1') || 1);
  const { items, total } = await listNotificationsPage(access.id, pagina, PAGE_SIZE);
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Notificações</h1>

      {items.length === 0 ? (
        <EmptyState title="Nenhuma notificação por aqui." />
      ) : (
        <Card className="!p-0">
          <ul data-testid="notificacoes-lista" className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={`p-4 ${n.lida ? '' : 'bg-brand-glow'}`}>
                {n.href ? (
                  <Link href={n.href} className="text-sm font-medium text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/50">
                    {n.titulo}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-white">{n.titulo}</p>
                )}
                <p className="mt-0.5 text-xs text-muted">{n.corpo}</p>
                <p className="mt-1 font-mono text-[10px] text-dim">{formatData(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {totalPaginas > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          {pagina > 1 ? (
            <Link href={`/dashboard/notificacoes?pagina=${pagina - 1}`} className="text-brand hover:underline">
              ← Mais recentes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-dim">
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? (
            <Link href={`/dashboard/notificacoes?pagina=${pagina + 1}`} className="text-brand hover:underline">
              Mais antigas →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  );
}
```

`NotificationBell.tsx` — props: `export function NotificationBell({ verTodasHref }: { verTodasHref?: string } = {})`; no rodapé do popover (junto de "Marcar todas como lidas"):

```tsx
            {verTodasHref ? (
              <a
                href={verTodasHref}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-brand outline-none transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                Ver todas
              </a>
            ) : null}
```

`app-shell.tsx` — nas DUAS montagens do Bell: `<NotificationBell verTodasHref={variant === 'client' ? '/dashboard/notificacoes' : undefined} />`.

- [ ] **Step 5 (empty CTA do kanban):** Em `dashboard/plano-de-acao/page.tsx`:

```tsx
import Link from 'next/link';
import { getLatestDoneReport } from '@/modules/reports/report.repository';

  const [tasks, ultimoRelatorio] = await Promise.all([
    listTasksKanban(access.orgId),
    getLatestDoneReport(access.orgId),
  ]);
```

e no board:

```tsx
      <KanbanBoard
        tasks={tasks}
        ator="cliente"
        taskHrefBase="/dashboard/plano-de-acao"
        emptyCta={
          ultimoRelatorio ? (
            <Link
              href={`/dashboard/relatorios/${ultimoRelatorio.id}`}
              className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-[#04150a] outline-none hover:shadow-glow focus-visible:shadow-glow"
            >
              Ver achados do último relatório
            </Link>
          ) : undefined
        }
      />
```

(sem relatório done → `emptyCta` undefined → board de colunas vazias renderiza como hoje. O E2E `plano-de-acao.spec.ts` sempre semeia 1 task antes de visitar → nunca cai no empty state; `kanban-col-*` continua visível no fluxo do spec.)

- [ ] **Step 6 (tempo médio honesto — teste primeiro):** Em `tests/integration/consultoria-metrics.test.ts`, adicionar caso (usar o seed existente do arquivo; se necessário, semear task com 2 activities `status→concluida` em dias distintos e outra concluída há >90d via SQL cru de `created_at`):

```ts
  it('tempo médio usa a PRIMEIRA conclusão por task e ignora conclusões com mais de 90d', async () => {
    // task desta suíte: criada agora, 1ª conclusão registrada agora → média ~0 dias
    // re-conclusão adicional (devolvida e concluída de novo) NÃO puxa a média
    const { getConsultoriaMetrics } = await import('@/modules/analista/analista.repository');
    const m = await getConsultoriaMetrics();
    expect(m.tempoMedioConclusaoDias).not.toBeNull();
    expect(m.tempoMedioConclusaoDias!).toBeLessThan(1);
  });
```

(o assert exato depende do seed do arquivo — adaptar mantendo a intenção: re-conclusões e conclusões antigas fora.) Rodar → comportamento atual pode até passar por coincidência; garantir o cenário de re-conclusão no seed para VER falhar. Implementar em `analista.repository.ts` (substituindo 176-185):

```ts
export const TEMPO_MEDIO_JANELA_DIAS = 90;

/**
 * Tempo médio entre a criação da task e a PRIMEIRA transição a concluida,
 * só para conclusões dos últimos 90 dias (o AVG antigo contava re-conclusões
 * e a vida inteira do banco — auditoria G3).
 */
async function tempoMedioConclusaoDias(agora: Date = new Date()): Promise<number | null> {
  const corte = new Date(agora.getTime() - TEMPO_MEDIO_JANELA_DIAS * 86_400_000);
  const primeira = db
    .select({
      task_id: taskActivities.task_id,
      concluida_em: sql<Date>`min(${taskActivities.created_at})`.as('concluida_em'),
    })
    .from(taskActivities)
    .where(and(eq(taskActivities.evento, 'status'), eq(taskActivities.para, 'concluida')))
    .groupBy(taskActivities.task_id)
    .as('primeira_conclusao');
  const [row] = await db
    .select({
      media: sql<string | null>`avg(extract(epoch from (${primeira.concluida_em} - ${tasks.created_at})) / 86400)`,
    })
    .from(primeira)
    .innerJoin(tasks, eq(primeira.task_id, tasks.id))
    .where(gte(primeira.concluida_em, corte));
  return row?.media != null ? Number(row.media) : null;
}
```

Rodar → **PASSA** (e o caso antigo do arquivo, se assertar valor exato, atualizar com justificativa no commit: métrica corrigida de propósito).

- [ ] **Step 7:** `npm run test` + `npm run typecheck` verdes. `npx playwright test tests/e2e/plano-de-acao.spec.ts` → verde. **Commit:** `feat(g3): higiene do crm — timeline com autor, pagina de notificacoes, cta do kanban vazio e tempo medio honesto`

---
### Task 13: Revisão ampla final + E2E completo

**Files:** nenhum novo (só correções que a revisão apontar).

- [ ] **Step 1:** `npm run test` (suíte completa, com `DATABASE_URL_TEST`) → ZERO falhas. `npm run typecheck` + `npm run lint` (se existir script) → verdes.
- [ ] **Step 2:** `npx playwright test` (E2E completo) → verdes, em especial `plano-de-acao.spec.ts` e `relatorio-task.spec.ts` (guards da fase — NENHUM spec foi editado neste plano).
- [ ] **Step 3 (checklist de invariantes, manual):**
  - grep `podeTransicionar` → únicas chamadas: task-transitions (def), task.repository (moveTask), TaskCard (oferta do select). Nenhum caminho novo de status.
  - grep `orgId` nas queries novas (`getMeuDia`, `getImpactoPorOrg`, `listTasksKanban`, `listNotificationsPage`, lembretes/digest) → todas escopadas por org ou por papel/user.
  - grep `sendEmail\|notify(` nos módulos novos → tudo dentro de try/catch ou funções nunca-lançam.
  - `vercel.json` → 5 crons (3 originais + sincronizar-pedidos G0 + digest-semanal G3).
  - Migration 0010 aplicada no branch test; anotar no PR que o dono precisa aplicar no Neon MAIN antes do deploy.
- [ ] **Step 4:** Solicitar revisão de código ampla da branch (superpowers:requesting-code-review) e corrigir achados críticos.
- [ ] **Step 5:** **Commit final** (se houver ajustes): `fix(g3): ajustes da revisao ampla`. Merge `--no-ff` em `master` só com aprovação do dono.

## Operacional pendente (dono, fora do código)

1. Aplicar `0010_*.sql` no Neon MAIN antes do deploy (coluna nova em `task_templates`).
2. Conferir `CRON_SECRET` na Vercel (o cron novo `digest-semanal` usa o mesmo secret).
3. `ADMIN_ALERT_EMAIL` (ou `EMAIL_FROM`) configurado — sem ele, o fallback "org sem analista" continua descartando (visível no Status do sistema da G0).
4. RESEND_API_KEY + EMAIL_FROM verificados (P0-4 da auditoria) — lembretes/digest são no-op sem eles.

## Self-review (executado na escrita do plano)

- **Cobertura vs escopo travado (auditoria §4/G3, 12 itens):** 1→Task 2 · 2→Task 1 · 3→Task 3 · 4→Task 4 · 5→Task 5 · 6→Task 6 · 7→Tasks 7+8 · 8→Task 9 · 9→Task 9 · 10→Task 10 · 11→Task 11 · 12→Task 12. Sem lacunas.
- **Placeholders:** nenhum "TBD/TODO/implementar depois"; todo step de código tem o código.
- **Consistência de nomes:** `prazoDefault`/`statusPrazo`/`labelPrazo`/`somarDias`/`diasDesde` (sla.ts) usados idênticos nas Tasks 3, 5, 6, 7, 9, 10; `listTasksKanban`/`TaskCardInfo` (9→12); `listTaskTitulosAbertos` (4→páginas); `getOrgAnalistaUser`+`getAdminAlertEmail` (7→10); `DigestEmailData` sem ciclo de import (templates ← email ← digest).
- **E2E:** nenhum spec editado; testids guardados listados nos Global Constraints; mudanças de testes de integração são só as 2 justificadas (tasks-actions fallback, cron response aditivo) + asserts de métricas corrigidas (task-impact/consultoria) com justificativa nos steps.
