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

## Fix round 1 — política de rollout Olist

O commit base real desta rodada foi `ced8330 feat(erp): operar pedidos e relatórios pelo provider ativo` (o identificador `5651667` acima foi o hash anterior ao amend que incluiu este relatório).

### RED

Adicionado em `tests/unit/sincronizar-pedidos-route.test.ts` o cenário de comportamento: uma lista contendo Olist e Bling, com `OLIST_DATA_SYNC_ENABLED=false`, deve devolver/contabilizar somente Bling e executar apenas esse sync. O teste executa a rota real e observa a resposta/efeito do loop; a lista de fontes é o único boundary dobrado.

Comando:

```powershell
npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/unit/report-errors.test.ts
```

Saída RED: falhou como esperado, com `orgs: 2` e `sincronizadas: 2` quando o esperado era `1`; `erp_sem_pedidos` também caía no fallback genérico.

### GREEN

- `isActiveErpSourceAllowed` aplica exatamente o switch e a allowlist a Olist, preservando Bling.
- As três consultas de `active-provider.repository` aplicam a política no SQL e antes do retorno, protegendo dashboard e action que resolvem a fonte ativa.
- Scheduler filtra a mesma política antes de devolver candidatos; cron reaplica o filtro imediatamente antes de enfileirar.
- `bling_sem_pedidos` foi migrado para `erp_sem_pedidos`; a copy de provider legado não é exposta ao cliente.
- Comentários do cron agora descrevem frequência de 15 minutos/próxima execução.

Comandos GREEN:

```powershell
npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/unit/report-errors.test.ts
npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/integration/scheduler-backoff.test.ts tests/unit/scheduler-service.test.ts tests/integration/dashboard-data.test.ts tests/unit/onboarding-model.test.ts tests/unit/report-errors.test.ts tests/integration/cron-gerar-relatorios.test.ts
npm run typecheck
git diff --check
```

Saída: 8/8 testes focados passaram; suite ampliada com 18 testes passou e 8 integrações foram puladas por `DATABASE_URL_TEST` ausente; typecheck e diff check passaram.

### Gate externo

PostgreSQL/integration e E2E reais continuam pendentes exclusivamente porque `DATABASE_URL_TEST` não está disponível no worktree. Não foram simulados; o controller deve executar `db:migrate:test`, integrações e E2E na CI com essa variável configurada.

## Fix round 2 — rollout apenas no cron operacional

Base: `e4679e9 fix(erp): respeitar rollout Olist nas fontes ativas`.

### Causa confirmada

A política adicionada no round 1 a `getActiveErpConnection`, `listActiveErpConnections` e `getActiveErpConnectionsForOrgIds` convertia uma conexão Olist já `ok` em ausência de fonte quando o flag tinha o default `false`. Isso quebrou o isolamento de leitura após cutover e consumidores de carteira/dashboard/action. A CI `30639505144` reproduziu o problema em `active-provider-read-isolation`, `scheduler-backoff` e `cron-gerar-relatorios`.

O contrato correto é: o flag/allowlist bloqueia novas execuções operacionais Olist no cron de pedidos (e o preparar-olist já tem seu próprio guard), mas nunca oculta uma fonte já ativa das leituras, scheduler de relatórios ou action. Assim o incident flag-off preserva e serve datasets existentes.

### RED

Evidência RED foi a CI `30639505144`: oito testes em cinco arquivos falharam no commit base. Em particular, o teste de integração de isolamento faz cutover para uma conexão Olist `ok` sob o default do flag e recebeu `null` do resolver central. O teste de cron que já existia continua cobrindo, no boundary real da rota, Olist ignorado + Bling processado com switch desligado.

O teste estático legado `cron-bling-only` que exigia o literal `provider: 'bling'` foi removido; esse contrato é agora coberto pela rota executada, não por texto-fonte.

### GREEN

- Removida a política de rollout dos três resolvers centrais e do scheduler.
- `podeSincronizarPedidos` fica local ao cron `sincronizar-pedidos`, aplicando switch e allowlist imediatamente antes do enqueue; Bling sempre passa.
- Mantidos os testes de comportamento da rota para switch false e para Olist autorizado.

Comando:

```powershell
npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/unit/cron-bling-only.test.ts tests/integration/active-provider-read-isolation.test.ts tests/integration/scheduler-backoff.test.ts tests/integration/cron-gerar-relatorios.test.ts
npm run typecheck
git diff --check
```

Saída local: 6 testes unitários passaram; 7 testes de integração foram pulados por ausência de `DATABASE_URL_TEST`; typecheck e diff check passaram. A repetição das integrações reais é gate da CI, sem fixtures mascaradas.
