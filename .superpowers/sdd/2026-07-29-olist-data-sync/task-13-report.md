# Task 13 — Expandir estoque para geração e fencing

## Resultado

`product_stock` agora declara `source_generation integer NOT NULL DEFAULT 1` e
`fencing_version bigint NOT NULL DEFAULT 0`. A identidade
`(org_id, provider, source_generation, sku)` e o índice de retomada
`(org_id, provider, source_generation, updated_at)` foram adicionados sem remover
`product_stock_org_sku_uq` nem `product_stock_org_provider_sku_uq`.

A migration `0025_olist_stock_expand.sql`, o snapshot e o journal foram gerados
por `npm run db:generate -- --name olist_stock_expand`. A SQL é somente aditiva:
não reescreve nem apaga valores de negócio e mantém os writers legados válidos
pelos defaults.

## RED / GREEN

### RED

O teste PostgreSQL foi escrito antes do schema. Ele aplica migrations até `0024`
em um schema descartável, insere estoque legado, aplica `0025` e verifica:

- backfill/default de geração `1` e fencing `0` sem alterar provider, identificador,
  SKU, nome ou saldo;
- presença das duas uniques antigas, da unique generation-aware e do novo índice;
- bloqueio de coexistência cross-provider/generation durante o rolling deploy;
- rejeição `23505` pela unique generation-aware depois que as uniques antigas são
  removidas apenas no schema descartável do teste.

Comando RED tentado:

```powershell
npm run db:migrate:test
npm test -- tests/integration/olist-stock-schema.test.ts
```

O ambiente local não possui `DATABASE_URL_TEST`, Docker ou PostgreSQL instalado.
O migrador encerrou com `DATABASE_URL_TEST ausente` e o Vitest pulou o teste pelo
guard padrão. Portanto, não houve RED PostgreSQL materializado localmente; o teste
real não foi substituído por mock ou conexão inválida.

### GREEN local disponível

```powershell
npm test -- tests/integration/olist-stock-schema.test.ts tests/integration/schema-h1.test.ts
npm run typecheck
git diff --check
```

Resultado: typecheck e diff-check passaram. Os dois arquivos PostgreSQL carregaram
sem erro, mas seus 3 testes foram pulados exclusivamente pela ausência de
`DATABASE_URL_TEST`.

## Arquivos alterados

- `src/db/schema/product-stock.ts`
- `src/db/migrations/0025_olist_stock_expand.sql`
- `src/db/migrations/meta/0025_snapshot.json`
- `src/db/migrations/meta/_journal.json`
- `tests/integration/olist-stock-schema.test.ts`

## Mutation check e concerns

O teste falha se os defaults mudarem, se a migração perder/reescrever uma linha
legada, se qualquer unique de compatibilidade desaparecer, se a nova identidade
omitir provider/generation/SKU ou se o índice omitir `updated_at`.

Concern de release: migrations e integração PostgreSQL precisam rodar na CI com
`DATABASE_URL_TEST`. A `0025` deve ser aplicada e smoke-tested em produção antes
de qualquer início da Task 14; nenhuma alteração da Task 14 foi incluída aqui.
