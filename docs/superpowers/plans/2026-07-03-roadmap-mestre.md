# Roadmap Mestre — Truth Analytics 2.0 (2026-07-03)

> Fonte de verdade para os planos de fase. Baseado na auditoria completa `docs/auditoria-completa-2026-07-03.md` (4 agentes: arquitetura, segurança, performance, UX). Escopo TOTAL aprovado pelo dono em 2026-07-03.

## Visão

Evoluir o Truth Analytics de MVP validado para **plataforma de consultoria e assessoria completa**: pipeline de produção robusto, experiência visual cinematográfica (DNA do truthcommerce.com.br), CRM de consultoria (relatório → plano de ação) e camada de inteligência contínua (score, alertas, multi-marketplace).

## Política de modelos e execução

- **Planejamento**: Fable 5 (estes planos).
- **Implementação**: subagent-driven por task — implementer **Opus 4.8** → spec-review → code-review → fix. Revisão ampla ao final de cada plano (Opus). Merge `--no-ff` em `master`.
- **Testes**: vitest (unit/integration no branch Neon `test` via `DATABASE_URL_TEST`) + Playwright E2E. TDD por task. Blindagem existente em `tests/setup.ts` intocável.
- **Convenções do repo**: actions → repositories → steps/providers; contratos Zod nas fronteiras; copy pt-BR; commits em pt no padrão existente (`feat:`, `fix:`, `chore:`); ledger `.superpowers/sdd/progress.md` (gitignored).
- **Regra de ouro entre fases**: antes de executar um plano de fase, re-validar os trechos de código citados contra o `master` atual (fases anteriores mudam o terreno). Divergência pequena = ajustar inline; divergência estrutural = revisar o plano.

## Fases e ordem

| Fase | Plano | Conteúdo | Dep. |
|---|---|---|---|
| **F0** | `2026-07-03-f0-fundacao-producao.md` | 5 críticos + gargalos de produção (background, lock, paralelização, pool, esqueci-senha, cripto versionada, headers, índices, backoff Bling, poda snapshots, logger, next-auth) | — |
| **F1** | `2026-07-03-f1-experiencia.md` | Design system completo + motion + stepper tempo real + dashboard bento/charts + relatório editorial + onboarding + admin operacional + export PDF + ⌘K + a11y | F0 |
| **F2** | `2026-07-03-f2-crm-consultoria.md` | CRM: tasks/playbooks, role analista + carteira, kanban cliente, painel analista, relatório→task, notificações in-app, métricas de impacto | F0, F1 |
| **F3a** | `2026-07-03-f3a-automacao-inteligencia.md` | Cron automático, Truth Score, alertas proativos, comparativo de períodos + metas | F0, F1 |
| **F3b** | `2026-07-03-f3b-expansao-mercado.md` | Multi-marketplace vendas (ML primeiro), monitor de ranqueamento, radar de concorrentes, central de qualidade de catálogo | F0, F3a |
| **F3c** | `2026-07-03-f3c-monetizacao-assistente.md` | Chat "Pergunte ao Analista", human-in-the-loop, simulador de margem por canal (cobrança REMOVIDA do escopo em 2026-07-03 a pedido do dono — venda consultiva segue manual) | F0–F2 |

As **3 ideias extras** (decididas pelo agente, aprovadas por delegação): **Central de Qualidade de Catálogo** (score por produto; alimenta tasks do CRM — casa com o serviço "Arquitetura de Catálogo" da agência), **Simulador de Margem por canal** (taxas ML/Shopee + frete + imposto → preço mínimo saudável; casa com "proteger margem" da marca), **Radar de Concorrentes** (acompanhar concorrentes específicos ao longo do tempo; alimenta alertas).

## Decisões técnicas TRAVADAS (não rediscutir nos planos de fase)

### F0 — Background do pipeline (mantém orquestrador próprio; NÃO Vercel Workflow — decisão do dono)
- `generateReportAction`: valida gating, insere `reports` com `status:'queued'` e dispara `POST /api/pipeline/run` (autenticada por header `x-pipeline-secret` = env `PIPELINE_SECRET`), aguardando só o `202`.
- Rota `/api/pipeline/run`: `export const maxDuration = 300`; responde `202` imediatamente e executa `generateReport(reportId)` via `waitUntil` (`@vercel/functions`).
- **Progresso por etapa**: coluna `reports.etapa` (`coletando_vendas` | `analisando_mercado` | `analisando_ia` | `finalizando`), atualizada pelo orquestrador entre steps. Habilita o stepper da F1.
- **Status endpoint**: `GET /api/reports/[id]/status` → `{ status, etapa }` (escopado por org da sessão). Client faz polling 3s enquanto `queued/running`.
- **Lock**: índice único parcial `reports(org_id) WHERE status IN ('queued','running')`; insert que conflita = erro `relatorio_em_andamento`.
- **Watchdog**: Vercel Cron `GET /api/cron/watchdog` (a cada 10 min, autenticado por `CRON_SECRET`) marca `queued/running` com `updated_at` > 20 min como `failed` (`erro:'timeout_watchdog'`).
- **Coleta de mercado**: paralelizar com limite de concorrência 6 (helper próprio `src/lib/p-limit.ts`, sem dependência nova) + bulk insert de snapshots; persistir só `precos` + metadados (**remover `bruto`**).
- **Pool**: `postgres(url, { prepare:false, max:1, idle_timeout:20, connect_timeout:10 })` quando serverless (manter override p/ scripts locais).
- **Bling**: tratar 429 com `Retry-After`/backoff exponencial (3 tentativas); persistir pedidos em lotes por página (não acumular tudo em RAM).
- **Cripto versionada**: payload novo `v1:<keyId>:<iv>:<tag>:<ct>`; envs `ENCRYPTION_KEYS` (JSON `{keyId: base64}`) + `ENCRYPTION_KEY_ACTIVE`; payload sem prefixo = legacy decifrado com `ENCRYPTION_KEY` (retrocompat). Script `scripts/reencrypt-connections.ts`. Runbook de rotação de TODOS os segredos no plano (senha Neon separada por ambiente, ANTHROPIC_API_KEY, AUTH_SECRET).
- **Esqueci senha**: tabela `password_reset_tokens` (token hasheado sha256, expira 1h, single-use), rotas `/esqueci-senha` e `/redefinir-senha/[token]`, e-mail via módulo notifications; resposta sempre "se existir uma conta, enviamos instruções" (anti-enumeração).
- **IA**: manter `ANALYSIS_MODEL` (Opus default); adicionar prompt caching (`cache_control` no bloco system) e retry de correção curto (enviar só o erro de validação + pedir JSON corrigido) em vez de refazer a chamada inteira.
- **Headers**: `next.config.mjs` com CSP restritiva, HSTS, `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `poweredByHeader:false`.
- **Índices**: `orders(org_id, data)`; `audit_log(org_id, created_at)`; `login_attempts(ip, created_at)`. Enums → `CHECK` constraints (status/plano/role/provider/fonte).
- **Logger**: `src/lib/logger.ts` estruturado mínimo (JSON, níveis, `requestId`/`orgId`/`reportId`), substituindo `console.*` nos módulos. Sentry opcional via env (`SENTRY_DSN` ausente = no-op).
- **next-auth**: subir para o beta mais recente da v5 e revalidar authorize/callbacks (resolve `cookie` CVE junto). Rate-limit no signup (reusa `login_attempts` com escopo `signup`), Zod no `signInAction`.
- `listReports`: selecionar só colunas de summary + `limit 50`.

### F1 — Experiência (contratos que F2/F3 consomem)
- **Stack visual**: `framer-motion` (motion) + `recharts` (charts) + `@react-pdf/renderer` OU rota print-CSS para PDF (plano decide e justifica). Easing assinatura `[0.16, 1, 0.3, 1]` em token (`src/lib/motion.ts`). `prefers-reduced-motion` respeitado em tudo.
- **Novos primitivos em `src/components/ui/`** (APIs estáveis): `Toast` (provider + `useToast()`), `ConfirmDialog`, `Skeleton`, `EmptyState`, `Alert`, `Tabs`, `Dropdown`, `Tooltip`, `Pagination`, `Stepper`, `charts/` (LineChart/BarChart/DonutChart/Sparkline themados: grid `#ffffff0f`, verde `#07dd2b`, gradiente→transparente, tooltip glass).
- **Stepper de geração em tempo real** consumindo `GET /api/reports/[id]/status` (F0).
- **Tokens novos** no tailwind: cores semânticas (`success/warning/danger` tokenizadas), `glass` (bg translúcido + blur), glow em 3 camadas (`#07dd2b4d/33/1f`). Corrigir contraste `dim` → mínimo `#a1a1aa`.
- **Admin operacional**: `/admin/[orgId]` (detalhe: relatórios, conexão, produtos, e-mails), reprocessar relatório failed, busca/paginação na lista, coluna saúde da conexão.
- **Invariante da F1**: preservar testids/fluxos dos E2E existentes (guard), como no Plano 7 original.

### F2 — CRM (contratos)
- Tabelas: `tasks` (org_id, titulo, descricao, tipo `catalogo|preco|anuncio|logistica|conta|outro`, prioridade `baixa|media|alta`, status `backlog|todo|em_andamento|em_revisao|concluida`, prazo, criado_por `analista|cliente|ia`, report_id?, assignee_user_id?, ordem), `task_comments`, `task_activities`, `task_templates`.
- `users.role` ganha `'analista'`; `organizations.analista_id` (carteira). `requireAnalista` segue o padrão `requireAdmin`.
- **Notificações in-app**: tabela `notifications` (user_id, tipo, titulo, corpo, lida, href) + bell no AppShell — API genérica (F3 reusa para alertas).
- Multi-tenancy idêntico: org_id da sessão; analista só vê orgs da carteira; admin vê tudo.

### F3 — contratos mínimos
- **F3a**: Vercel Cron diário `/api/cron/gerar-relatorios` (varre orgs com ciclo vencido → enfileira via mesma rota F0); `truth_score` calculado em `computeMetrics` e persistido no jsonb `metricas`; alertas = tabela `alerts` + cron de verificação + notificação in-app/e-mail; metas em `organizations.meta_mensal`.
- **F3b**: generalizar `connection.repository` (parâmetro `provider`), orquestrador seleciona providers conectados via registry; ML OAuth como segundo `ConnectionProvider`; `competitors` e `catalog_scores` como tabelas novas.
- **F3c**: chat = rota streaming com contexto das métricas (Sonnet), HITL = `reports.status` ganha `em_revisao` + flag org `revisao_humana`, simulador de margem = página client-side pura com tabela de taxas versionada. (Cobrança/Stripe REMOVIDA do escopo em 2026-07-03 por decisão do dono; MVP segue com venda consultiva manual.)

## Riscos e mitigação

- **waitUntil/maxDuration exigem plano Vercel adequado** (Fluid/Pro p/ 300s) — validar no início da F0; fallback: processar via cron-fila (mesma rota, disparo pelo watchdog).
- Planos F2/F3 escritos contra código futuro — mitigado pela regra de re-validação + contratos acima.
- Rotação de `ENCRYPTION_KEY` só DEPOIS do versionamento estar em produção.
