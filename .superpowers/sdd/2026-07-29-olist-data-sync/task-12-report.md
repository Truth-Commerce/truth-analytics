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

## Fix round 3 — filtro SQL antes do limite operacional

Base: `4a05d13 fix(erp): limitar rollout Olist ao cron de pedidos`.

Mesmo com `podeSincronizarPedidos` no cron, `listActiveErpConnections({ limit })` aplicava `LIMIT` antes do filtro em memória. Assim, 50 Olist bloqueados podiam ocupar o lote e impedir que Bling posterior fosse retornado. O único call site de `listActiveErpConnections` é o cron de pedidos; os resolvers centrais de leitura são `getActiveErpConnection` e `getActiveErpConnectionsForOrgIds` e não receberam este filtro.

Foi adicionado em `tests/integration/active-provider-read-isolation.test.ts` um teste PostgreSQL que semeia 50 organizações Olist `ok` bloqueadas antes de uma Bling `ok`. Com o flag desligado, o resultado limitado deve conter Bling e nenhum dos Olist bloqueados. Com o flag ligado e uma única organização allowlisted, deve conter Bling e exatamente aquela Olist. O mesmo arquivo mantém o cutover que prova que o reader central continua servindo Olist ativo.

O teste foi criado antes da alteração SQL. Sem `DATABASE_URL_TEST`, a execução local não pode materializar o RED/green no PostgreSQL; o RED conceitual é que a consulta anterior retornaria as 50 Olist inseridas antes de Bling, e a CI deve executar a prova real.

`operationalOrdersProviderPolicy` agora está restrita a `listActiveErpConnections`, aplica `OLIST_DATA_SYNC_ENABLED` + allowlist na cláusula SQL antes de `.limit(limit)`, e preserva a defesa em memória no cron. Leituras centrais e scheduler não foram alterados.

GREEN local: `npm test -- tests/unit/sincronizar-pedidos-route.test.ts tests/integration/active-provider-read-isolation.test.ts`, `npm run typecheck` e `git diff --check`. Saída: 4 testes unitários passaram; 2 integrações foram puladas somente por `DATABASE_URL_TEST` ausente; typecheck e diff check passaram. O gate PostgreSQL real permanece para CI, sem simulação ou alteração de fixtures para ocultar a regressão.

## Fix round 4 — fixtures do cron de relatórios completos

Base: `a21509c fix(cron): filtrar rollout Olist antes do lote`.

A CI `30640079700` executou PostgreSQL e expôs duas falhas em `tests/integration/cron-gerar-relatorios.test.ts`: `resultadoElegivel` e `resultadoRunning` ficaram `undefined`. A consulta do scheduler exige, por contrato, organização ativa, geração automática, `connections.status = 'ok'` e `connections.access_token IS NOT NULL`. Os três fixtures Bling do arquivo declaravam status `ok`, mas omitiam o token, de modo que as duas organizações que deveriam entrar no scheduler eram filtradas antes de o cron exercitar os comportamentos testados.

O RED é a própria execução PostgreSQL da CI. A correção mínima adiciona o mesmo token sintético e não secreto aos fixtures elegível, sem automação e com relatório running. O fixture sem automação também recebe uma conexão contratualmente completa para garantir que sua exclusão continue sendo causada por `geracao_automatica = false`, e não incidentalmente pela ausência de credencial. Nenhum arquivo de produção foi alterado.

Verificação local:

```powershell
npm test -- tests/integration/cron-gerar-relatorios.test.ts
npm run typecheck
git diff --check
```

Saída: o arquivo de integração carregou sem erro, mas os 3 testes foram pulados porque `DATABASE_URL_TEST` não está disponível; typecheck e diff check passaram. O GREEN PostgreSQL dos dois casos deve ser confirmado pela CI com banco configurado.

## Fix round 5 — expectativa E2E alinhada à copy neutra de ERP

Base: `25fb7cc test(cron): completar fixtures do scheduler de relatórios`.

A CI `30640774158` passou migrations, lint, typecheck, `test:ci`, build e 25/26 cenários E2E. A única falha foi o cenário de gating do dashboard, que ainda esperava `Conecte o Bling em Conexões.` após a neutralização da UI. O dashboard renderiza canonicamente `Conecte seu ERP em Conexões.` quando não existe ERP ativo.

A correção ficou restrita a `tests/e2e/dashboard.spec.ts`: nome e comentários do cenário agora descrevem ERP, e a asserção usa a copy exata da UI. Nenhum arquivo de produção foi alterado.

Verificação focal tentada:

```powershell
npx playwright test tests/e2e/dashboard.spec.ts --grep "gating: cliente sem ERP"
```

O Playwright foi bloqueado na carga da configuração, antes de executar testes, porque `DATABASE_URL_TEST` está ausente. O GREEN real desse único cenário permanece como gate da CI com banco de teste configurado.

`npm run typecheck` e `git diff --check` passaram localmente.
