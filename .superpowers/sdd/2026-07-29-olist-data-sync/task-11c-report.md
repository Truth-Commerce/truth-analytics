# Task 11C — actions de ativação e rollback

## Escopo entregue

- `activateOlistAction` fixa no servidor `target: 'olist'` e `mode: 'explicit'`.
- `rollbackToBlingAction` fixa no servidor `target: 'bling'`; não consulta nem depende do kill switch Olist.
- As duas actions aceitam somente `orgId` validado como UUID e ignoram campos forjados de target, mode ou credenciais.
- Cliente, impersonação e analista fora da carteira são bloqueados antes do repositório.
- O repositório recebe o ator real e repete autorização/readiness dentro da transação serializável.
- Erros de domínio são traduzidos para mensagens seguras; erros inesperados não devolvem detalhes, tokens ou respostas do provedor.
- Sucesso invalida `/analista/{orgId}`, `/conexoes` e `/dashboard`.

## Evidência TDD

### RED

Comando:

```powershell
npm test -- tests/unit/erp-activation-actions.test.ts --run
```

Resultado esperado observado: suite falhou porque `@/actions/erp-activation.actions` ainda não existia.

### GREEN local

```powershell
npm test -- tests/unit/erp-activation-actions.test.ts --run
```

Resultado: 1 arquivo, 7 testes aprovados.

### Regressões e análise estática

```powershell
npm test -- tests/unit/erp-activation-actions.test.ts tests/unit/olist-connections-actions.test.ts tests/unit/connection-access.test.ts --run
npm run typecheck
npm run lint
```

Resultado: 21 testes aprovados; typecheck aprovado; lint aprovado sem erros (22 avisos preexistentes fora deste escopo).

## CI

- Commit da implementação: `c399e7490c0fa4f48fb791168a0e988866b5823d`.
- Run: `30622129947` — <https://github.com/Truth-Commerce/truth-analytics/actions/runs/30622129947>.
- Resultado: sucesso em 6m04s.
- Gates aprovados: instalação, audit de produção, migrações PostgreSQL, lint,
  typecheck, `test:ci`, build e Playwright E2E.
