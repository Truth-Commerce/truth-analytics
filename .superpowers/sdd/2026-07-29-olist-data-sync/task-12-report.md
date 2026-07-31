# Task 12 — Neutralizar crons, scheduler, dashboard e onboarding

## Resultado

Commit de implementação: `5651667 feat(erp): operar pedidos e relatórios pelo provider ativo`.

O cron de pedidos agora recebe referências ERP ativas congeladas, respeita o limite na consulta, mantém isolamento por organização e retorna apenas contadores agregados por provider. O scheduler não possui mais literal de provider e filtra providers registrados. Dashboard, action e onboarding usam ERP ativo/copy neutra; o workflow de pedidos roda a cada 15 minutos.

## RED / GREEN

### RED

Comando:

```powershell
npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/integration/scheduler-backoff.test.ts tests/unit/scheduler-service.test.ts tests/integration/dashboard-data.test.ts tests/unit/onboarding-model.test.ts tests/unit/report-errors.test.ts
```

Saída inicial: 9 falhas. As falhas de comportamento foram as esperadas: cron ainda chamava `listOrgsComBlingOk`, scheduler ainda lia `blingConectado`, onboarding ainda emitia `bling`, e códigos ERP ainda caíam no fallback genérico. Houve também duas falhas de setup (`repo is not defined`) no teste recém-alterado; o setup foi corrigido antes da implementação.

### GREEN

Comando final:

```powershell
npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/integration/scheduler-backoff.test.ts tests/unit/scheduler-service.test.ts tests/integration/dashboard-data.test.ts tests/unit/onboarding-model.test.ts tests/unit/report-errors.test.ts tests/integration/cron-gerar-relatorios.test.ts
```

Saída: 4 arquivos/17 testes passaram; 3 arquivos/8 testes de integração foram pulados sem `DATABASE_URL_TEST`.

`npm run typecheck` passou.

## Arquivos alterados

- Cron e workflow: `src/app/api/cron/sincronizar-pedidos/route.ts`, `.github/workflows/crons.yml`.
- Scheduler: `src/modules/scheduler/scheduler.repository.ts`, `src/modules/scheduler/scheduler.service.ts`.
- Dashboard/onboarding: `src/modules/reports/dashboard-data.ts`, `src/modules/reports/onboarding-model.ts`, `src/app/(client)/dashboard/page.tsx`, `src/app/(client)/dashboard/onboarding-checklist.tsx`.
- Geração/copy de erro: `src/actions/reports.actions.ts`, `src/app/(client)/dashboard/generate-report.tsx`, `src/modules/reports/report-errors.ts`.
- Cobertura: os seis testes explicitamente listados no briefing.

## Decisões

- Renovação de tokens continua no caminho dedicado Bling; somente o loop operacional de pedidos passou a ser provider-neutral.
- `listActiveErpConnections({ limit: LOTE_MAXIMO_SYNC })` congela provider, geração e fingerprint antes de cada sync; a resposta HTTP não contém essas referências nem segredos.
- O scheduler faz join por `connections.status = 'ok'`, exige token, e só devolve provider presente no catálogo.
- O dashboard usa uma única `source` para os leitores de pedidos e expõe `ERP ativo`/`Última sincronização`; a propriedade `conn` foi preservada como superfície mínima de compatibilidade para a tela interna de analista.
- Códigos client-safe são `sem_conexao_erp` e `erp_indisponivel`; códigos específicos de provider passam ao fallback genérico, mantendo detalhes nos logs de staff.

## Value gate

- `npm run db:migrate:test`: não executou — `DATABASE_URL_TEST` ausente.
- `npm run lint`: exit 0, com 22 warnings pré-existentes (nenhum erro).
- `npm run typecheck`: passou.
- Suite Olist: 25 unitários passaram; 32 integrações foram puladas sem `DATABASE_URL_TEST`.
- E2E Olist/dashboard: não iniciou — `DATABASE_URL_TEST` ausente.
- `npm run build`: passou; aviso pré-existente de múltiplos lockfiles/root inferido pelo Next.js.
- `git diff --check`: passou.

## Mutation check e concerns

- As novas asserções falham se o cron voltar a usar a lista Bling, perder o `limit`, deixar de isolar a falha ou expor o fingerprint; falham se scheduler/onboarding/códigos voltarem aos campos Bling-only.
- Concern de processo: o primeiro RED continha duas falhas de setup, corrigidas imediatamente; as demais falhas observadas foram as de comportamento esperado. O banco de teste não estava configurado, então integrações e E2E exigem repetição com `DATABASE_URL_TEST` antes de deploy.
