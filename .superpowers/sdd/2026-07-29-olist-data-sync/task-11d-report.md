# Task 11D — read model seguro e controles de interface

## Escopo entregue

- Novo `getErpConnectionReadModel(orgId)` concentra ERP ativo, autorização/estado operacional, última sincronização e progresso canônico da preparação.
- O objeto entregue às páginas não contém tokens, credenciais OAuth, fingerprint, geração, cursor ou payload bruto.
- A página do cliente mostra ERP ativo e progresso, mas fixa `canManageErp={false}` e nunca renderiza cutover/rollback.
- A página staff somente oferece `Ativar Olist` quando Olist está autorizado, pronto e ainda não está ativo.
- `Voltar para Bling` somente aparece quando Olist está ativo e Bling permanece autorizado.
- Os formulários usam diretamente as server actions com target/mode fixados no servidor.
- Olist ativo bloqueia visualmente alteração de credenciais e desconexão até o rollback.

## Evidência TDD

### RED

```powershell
npm test -- tests/unit/olist-connection-card.test.ts --run
```

Resultado observado: 6 falhas esperadas porque o componente ainda ignorava `readModel`, não mostrava progresso e não possuía controles staff.

### GREEN local

```powershell
npm test -- tests/unit/erp-connection-read-model.test.ts tests/unit/olist-connection-card.test.ts tests/unit/erp-activation-actions.test.ts --run
```

Resultado: 3 arquivos e 15 testes aprovados.

```powershell
npm run typecheck
npm run lint
```

Resultado: typecheck aprovado; lint aprovado sem erros, com 22 avisos preexistentes fora do escopo.

## CI

A preencher após push do commit da Task 11D.
