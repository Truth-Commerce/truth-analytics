# Task 2 — contratos operacionais e registry de dados

## Entrega

- Criado `src/modules/providers/data.types.ts` com `RawOrder`, `RawOrderDetail`, `OrderPage`, `OrderPageRequest`, `ErpDataProvider`, `OrderPageHandler`, `ErpDataSource`, `RawOrderItem` e `Periodo`.
- O registry operacional agora expõe apenas `getErpDataProvider` e `listRegisteredErpDataProviders`, com Bling como único adapter de dados; Olist continua sem registro operacional.
- O adapter Bling emite identidade neutra (`providerOrderId`/`providerStatus`), páginas com offsets e resolve `loja.id` para o nome do canal no detalhe provider-neutral.
- OAuth permanece isolado em `oauth-registry.ts`. Um adapter legado marcado como depreciado permanece somente para compatibilidade com consumidores Bling ainda não migrados.

## RED / GREEN

RED executado antes da implementação:

```powershell
npm test -- tests/unit/provider-registry.test.ts tests/unit/bling-orders-retry.test.ts tests/unit/bling-order-detail.test.ts
```

Falhou como esperado por ausência de `getErpDataProvider`/`listRegisteredErpDataProviders`, campos `providerOrderId`/`providerStatus`, contrato de paginação e campo `canal` no detalhe.

GREEN/verificação final:

```powershell
npm test -- tests/unit/provider-registry.test.ts tests/unit/oauth-registry.test.ts tests/unit/bling-orders-retry.test.ts tests/unit/bling-order-detail.test.ts tests/unit/bling-oauth.test.ts tests/unit/bling-canal-mapeamento.test.ts
npm run typecheck
git diff --check
```

Resultado: 6 arquivos de teste / 31 testes aprovados; typecheck e diff check aprovados.

## Arquivos

- Produção: `src/modules/providers/data.types.ts`, `types.ts`, `registry.ts`, `bling/orders.ts`, `bling/order-detail.ts`, `bling/provider.ts`.
- Testes: `provider-registry.test.ts`, `oauth-registry.test.ts`, `bling-orders-retry.test.ts`, `bling-order-detail.test.ts`, `bling-canal-mapeamento.test.ts`.

## Riscos / transição

- A API de listagem do Bling não expõe um total global no payload atual. `OrderPage.total` representa o número acumulado observado até a página emitida; o consumidor deve usar `done` para término.
- Os consumidores antigos de Bling permanecem usando o wrapper depreciado até a migração das próximas tarefas. O novo registry não os expõe e não registra/habilita Olist para dados.

## Fix round 1/5

- `fetchOrders` agora sempre entrega uma página terminal (`done: true`) ao receber uma lista vazia, incluindo a primeira página e a página seguinte a um lote cheio. A página terminal vazia preserva `offset`, `nextOffset` e `total`, sem repetir pedidos.
- O modo `updated` passa a usar a janela documentada `dataAlteracaoInicial`/`dataAlteracaoFinal`. O limite final usa o dia atual, mas nunca antecede `updatedAfter`, evitando uma janela invertida.
- RED: os três novos testes falharam antes da correção pelos comportamentos esperados (callback terminal ausente e parâmetro legado `dataAlteracao`).
- GREEN: `npm test -- tests/unit/bling-orders-retry.test.ts` (10 testes), `npm run typecheck` e `git diff --check` aprovados.
