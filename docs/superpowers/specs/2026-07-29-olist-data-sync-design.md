# Olist ERP Data Sync Design

**Status:** aprovado para implementação autônoma  
**Data:** 2026-07-29  
**Escopo:** pedidos, detalhes, relatórios e estoque do Olist ERP API v3, sem escrita no ERP

## Decisão

Evoluir o pipeline existente para uma fonte de dados ERP tipada e registrar o Olist ao lado do Bling. A entrega será incremental, mas terminará com valor completo: primeiro pedidos e relatórios; depois estoque retomável. Não haverá um segundo pipeline específico do Olist.

O Olist será promovido de `configurado` para `ok` automaticamente somente quando a organização não possuir outro ERP `ok` **e** o backfill/reconciliação mínimo estiver concluído. Uma organização que já usa Bling poderá autorizar e preparar o Olist em shadow, mas continuará no Bling até um cutover explícito, transacional, auditado e reversível executado por analista/admin.

## Resultado para o produto

- Clientes novos que usam Olist poderão conectar o ERP e gerar os mesmos relatórios disponíveis para clientes Bling.
- Pedidos, itens, faturamento, frete e canal de venda alimentarão o domínio neutro já usado pelas métricas.
- O saldo disponível do Olist alimentará estoque, cobertura e alertas.
- Cliente e analista verão qual ERP está operacional e a data da última sincronização.
- O pipeline continuará operando se uma coleta de mercado falhar e continuará isolando falhas por organização nos crons.

## Fatos oficiais que moldam o desenho

- Base da API: `https://api.tiny.com.br/public-api/v3`.
- Autenticação das operações de dados: bearer token OAuth 2.0.
- Pedidos: `GET /pedidos`, paginação `limit/offset`, filtros `dataInicial/dataFinal`; detalhes em `GET /pedidos/{idPedido}`.
- Produtos: `GET /produtos`, paginação `limit/offset`.
- O saldo completo é obtido por produto em `GET /estoque/{idProduto}`; a listagem de produtos não contém o saldo disponível.
- Limites de leitura são compartilhados por conta, não por aplicativo: 30, 60, 120 ou 140 requisições/minuto conforme o plano.
- O aplicativo precisa de permissões de leitura em Pedidos, Produtos, Estoque e Informações da Conta.

Fontes oficiais:

- https://erp.tiny.com.br/public-api/v3/swagger/index.html
- https://erp.tiny.com.br/public-api/v3/swagger/swagger.json
- https://ajuda.olist.com/hubs-e-plataformas-via-api/aplicativos-api-v3-configuracoes-e-utilizacao

## Abordagens consideradas

### 1. Duplicar o pipeline Bling para Olist

Entrega inicial rápida, mas duplica coleta, enriquecimento, crons, mensagens e correções. Rejeitada porque os dois pipelines divergiriam e cada nova métrica exigiria manutenção dupla.

### 2. Refatoração provider-aware incremental — escolhida

Extrai contratos neutros do código Bling sem reescrever métricas. O Bling continua passando pelos mesmos adaptadores e testes; o Olist entra apenas depois que cada seam está coberto. É a opção com menor risco e melhor evolução.

### 3. Importação Olist completa em uma única função

Pedidos e catálogo poderiam ser varridos de uma vez, mas o estoque exige uma chamada por produto. Sob o limite mínimo, catálogos grandes excederiam o `maxDuration=300`. Rejeitada em favor de cursor, lease e lotes retomáveis.

## Limites da fase

### Incluído

1. Contrato operacional de ERP separado do contrato OAuth.
2. Adapter HTTP Olist com timeout, backoff e erros internos seguros.
3. Coleta paginada de pedidos e detalhe incremental.
4. Persistência provider-aware de pedidos e estoque.
5. Pipeline, scheduler, dashboard e onboarding baseados no ERP ativo.
6. Estoque Olist em lotes retomáveis com cursor e lease.
7. Heartbeats e contadores por provider.
8. Migração, backfill compatível, testes e runbook de produção.

### Não incluído

- Criar, editar ou excluir qualquer dado no Olist.
- Webhooks/gatilhos do Olist.
- Sincronizar simultaneamente dois ERPs para a mesma organização.
- Trocar silenciosamente uma organização que já tem Bling operacional.
- Deduplicar historicamente pedidos que existam em dois ERPs diferentes.
- Importar notas fiscais, contas, clientes ou dados pessoais desnecessários.
- Comissão Olist quando o contrato oficial de pedido não a fornece.

## Invariantes

1. No máximo um `connections.status='ok'` por organização.
2. Toda leitura e escrita local é escopada por `org_id` e `provider`.
3. Um pedido é único por `(org_id, provider, provider_order_id)`.
4. Um saldo é único por `(org_id, provider, sku)` depois do incremento de estoque.
5. Retentativas e retomadas não duplicam pedido, item ou saldo.
6. Uma falha Olist nunca altera tokens/estado do Bling.
7. Tokens, client secret, bearer headers e corpos remotos nunca entram em logs, auditoria ou UI.
8. A aplicação é somente leitora no Olist.
9. Uma sync só atualiza `last_sync_at` depois de persistir dados com sucesso.
10. Cursor só avança depois de persistir o lote correspondente e somente o dono do lease pode avançá-lo.
11. Toda consulta que alimenta métrica, alerta, meta ou relatório recebe o provider da fonte; Olist em shadow nunca entra em resultado Bling.
12. Cada relatório grava o provider usado, tornando a análise reproduzível depois de um cutover.

## Modelo de dados e migração

A migration `0022` conclui a identidade de pedidos iniciada em `0020`:

- `orders.bling_order_id` passa a aceitar `NULL` para linhas Olist.
- remove `orders_org_bling_uq`; a autoridade passa a ser `orders_org_provider_order_uq`.
- adiciona índice `(org_id, provider, data)` para consultas do período.
- adiciona `orders.provider_status`, `enrichment_attempts`, `enrichment_last_attempt_at` e `enrichment_last_error_code` para cancelamentos e quarentena de detalhes.
- adiciona `reports.source_provider`, preenchido como `bling` nos relatórios existentes.
- mantém coluna e trigger legados para escritores Bling durante a compatibilidade.
- não reescreve nem apaga pedidos/estoque existentes.

A remoção de `product_stock_org_sku_uq` fica para a migration do incremento B, somente depois de o writer e todas as leituras de estoque usarem `(org, provider, sku)`.

Leitores históricos continuam aceitando registros Bling existentes. Novos escritores sempre informam `provider` e identificador externo explicitamente.

## Contratos do domínio

```ts
type ErpProviderId = 'bling' | 'olist';

type RawOrder = {
  providerOrderId: string;
  providerStatus: string;
  canal: string;
  data: Date;
  valorTotal: number;
  frete: number;
  itens: RawOrderItem[];
};

type RawOrderDetail = {
  itens: RawOrderItem[];
  frete: number;
  comissao: number;
  canal?: string;
};

interface ErpDataProvider {
  readonly name: ErpProviderId;
  fetchOrders(orgId: string, periodo: Periodo, onPage: PageHandler): Promise<void>;
  fetchOrderDetail(orgId: string, providerOrderId: string): Promise<RawOrderDetail>;
}
```

OAuth permanece em `OAuthConnectionProvider`. O adapter Bling continua expondo suas operações OAuth legadas onde já são consumidas, mas o registry operacional conhece somente `ErpDataProvider`.

## Fluxo de ativação

1. Callback OAuth valida state, ator, organização e versão de credenciais.
2. Tokens são persistidos por compare-and-swap.
3. O Olist permanece `configurado` enquanto o backfill de 90 dias e a reconciliação da janela-alvo não estiverem prontos.
4. Sem outro ERP ativo, uma atualização condicional promove Olist para `ok` depois do gate de readiness.
5. Se Bling já estiver `ok`, Olist permanece em shadow até uma ação explícita de analista/admin. A transação revalida readiness, demove o ERP atual para `configurado`, promove o alvo e grava auditoria; qualquer falha desfaz tudo.
6. A mesma transação permite rollback para o Bling sem apagar tokens ou dados.
7. Refresh preserva o status atual (`ok` ou `configurado`) e nunca demove uma conexão operacional por sucesso.
8. Erro permanente marca a conexão Olist como `expirado`; erro transitório preserva a operação e registra código seguro.

## Pedidos e relatórios

### Listagem Olist

- `GET /pedidos?dataInicial=YYYY-MM-DD&dataFinal=YYYY-MM-DD&orderBy=asc&limit=100&offset=N`.
- ID: `id` convertido para string.
- Data: `dataCriacao`; payload inválido é rejeitado, nunca convertido silenciosamente para epoch.
- Total: `valor`.
- Canal: `ecommerce.canalVenda`, depois `ecommerce.nome`, depois `Olist ERP`.
- Situação: código oficial persistido em `provider_status`; cancelado conhecido (`2`) é excluído das métricas sem apagar a linha auditável.
- A listagem é persistida página a página.

### Detalhe Olist

- `GET /pedidos/{idPedido}`.
- Itens: `produto.sku`, `produto.descricao`, `quantidade`, `valorUnitario`.
- Frete: `valorFrete`.
- Comissão: `0`, porque o contrato oficial consultado não a fornece.
- Canal: `ecommerce.canalVenda`, `ecommerce.nome` ou `intermediador.nome`.
- Sucesso marca `enriquecido_em`; falha de um pedido não contamina os demais.

### Pipeline neutro

- `collectOrders(orgId, provider, periodo)` resolve o adapter e faz upsert pela chave provider-aware.
- `enrichOrders(orgId, provider, options)` filtra pendências pelo mesmo provider.
- `generateReport` resolve a conexão `ok`, coleta e enriquece pelo provider ativo e mantém todo o restante do pipeline inalterado.
- Scheduler, geração manual e cron aceitam qualquer ERP registrado e operacional.
- Toda query de `orders` usada por métricas, alertas, meta, dashboard, analista ou admin recebe `(orgId, provider)`; nenhuma lê providers shadow por acidente.
- `reports.source_provider` registra o provider resolvido no início da execução.
- Códigos/cópias de erro apresentados ao cliente tornam-se neutros (`sem_conexao_erp`, `erp_indisponivel`) com mensagens específicas pelo provider quando houver contexto seguro.

## Backfill e readiness

- A preparação inicial importa 90 dias, suficiente para mês corrente, comparação anterior e sinais de 30 dias; um período de produto mais antigo pode ampliar a janela explicitamente.
- `connection_sync_state` usa `resource='orders_list'` e cursor `{ from, to, offset, total }`.
- O detalhe usa a tabela `orders` como fila durável; após cinco falhas, a linha fica em quarentena por código seguro para não bloquear o lote inteiro.
- Olist só pode ser ativado quando a listagem da janela terminou, a contagem distinta local confere com `paginacao.total`, não há detalhes pendentes/quarentenados na janela-alvo e amostras de soma diária/canal foram reconciliadas.
- Incrementais usam janela sobreposta de três dias e upsert idempotente para absorver atualizações/cancelamentos tardios.

## Estoque retomável

Olist usa `connection_sync_state` com `resource='stock'` e cursor validado:

```ts
type OlistStockCursor = {
  offset: number;
  index: number;
};
```

1. Adquire lease por `(org, olist, stock)` com expiração curta e fencing token aleatório.
2. Lista até 100 produtos no `offset` atual.
3. Retoma no `index` e consulta `GET /estoque/{idProduto}`.
4. Usa `disponivel` como saldo comercial; persiste `provider_product_id`, SKU e nome.
5. Avança `index` somente após o upsert daquele produto.
6. Ao terminar a página, avança `offset` pela quantidade listada e zera `index`.
7. Ao alcançar `paginacao.total`, encerra o ciclo, zera o cursor e grava `succeeded_at`.
8. Toda atualização inclui o fencing token; um worker antigo nunca sobrescreve o progresso do sucessor.
9. Falha libera/expira o lease, preserva cursor e registra código seguro; a próxima execução retoma.

Produtos sem SKU são ignorados e contabilizados. A sincronização não apaga produtos ausentes nesta fase; reconciliação destrutiva exige evidência de snapshot completo e fica fora do escopo.

## Controle de carga

- Olist assume o pior plano oficial: no máximo 27 leituras/minuto por organização, intervalo mínimo de 2.200 ms com jitter. O budget é compartilhado por listagem, detalhe e estoque da mesma conta.
- Timeout por request: 10 segundos.
- `429` e `5xx`: até 2 tentativas totais, backoff exponencial com jitter e `Retry-After` limitado a 30 segundos.
- Outros `4xx`: falha permanente segura; `401` aciona renovação/reclassificação sem logar resposta.
- Pedidos/detalhes e estoque possuem leases separados; cada execução para de iniciar chamadas antes de 240 segundos. Crons de Olist podem processar organizações diferentes com concorrência limitada porque o limite oficial é por conta.
- Nenhuma fila, paginação, resposta, lote ou fan-out é ilimitado.

## Segurança e privacidade

- Reutilizar `getValidAccessTokenForProvider` e o refresh CAS existente.
- Não buscar cliente/endereço/CPF/CNPJ quando o relatório não consome esses campos.
- Validar payload remoto com schemas tolerantes a campos extras e estritos nos campos usados.
- Não registrar URL completa com query de cliente, payload, Authorization ou resposta remota.
- Rotas cron continuam protegidas por comparação constante de `CRON_SECRET`.
- Consultas cross-org só retornam organizações ativas e conexões `ok`.

## Observabilidade e recuperação

- Logs estruturados: `provider`, `orgId`, recurso, página/offset, contadores e código interno allowlisted.
- Heartbeats preservam os nomes atuais e adicionam contadores por provider.
- `connection_sync_state` registra início, sucesso, falha, processados, backlog e último código.
- Falha em uma organização não aborta o lote.
- Operador pode reexecutar o cron: upserts e cursor tornam a repetição segura.
- Rollback de código mantém as colunas novas compatíveis; a migration é aditiva em dados e só remove constraints legadas que o código antigo não necessita para funcionar.
- Um kill switch server-side desabilita novas sincronizações Olist sem afetar Bling ou apagar dados.

## Entregas

### Incremento A — pedidos e relatórios Olist

- migration/identidade provider-aware;
- adapter HTTP/listagem/detalhe;
- preparação shadow, gate de readiness, ativação/cutover/rollback seguros;
- collect/enrich/pipeline/scheduler/dashboard neutros;
- cron de pedidos e testes de regressão Bling.

Critério de valor: uma organização nova somente Olist autoriza, conclui o backfill/readiness, torna-se operacional, sincroniza pedidos e conclui um relatório sem conexão Bling; uma organização Bling permanece inalterada até cutover explícito.

### Incremento B — estoque retomável Olist

- repository de cursor/lease;
- listagem de produtos + saldo por produto;
- upsert provider-aware;
- cron em lotes, heartbeat, visão de estoque e testes de retomada.

Critério de valor: um catálogo maior que um lote avança em execuções sucessivas sem repetir efeitos nem perder o cursor e passa a alimentar cobertura/alertas.

## Critérios de aceite globais

1. Testes comprovam RED antes de cada implementação.
2. PostgreSQL real valida migration, uniques, lease/fencing concorrente e isolamento entre tenants/providers.
3. Contratos oficiais Olist têm testes com fixtures completas de listagem, detalhe, paginação, 401, 429, 5xx e payload inválido.
4. Regressões Bling, pipeline, scheduler, dashboard e crons permanecem verdes.
5. E2E cobre Olist shadow sem alterar métricas, ativação de cliente sem ERP, cutover/rollback pelo analista e ausência de segredos.
6. CI completa, build e 25+ cenários E2E passam antes do merge.
7. Migration é aplicada antes do deployment que grava pedidos Olist.
8. Smoke de produção confirma auth, rotas protegidas, cron real e ausência de 5xx.

## Riscos residuais

- Contas que migram de Bling para Olist precisam de um fluxo posterior de cutover e reconciliação para evitar sobreposição histórica.
- Estoque completo pode levar vários lotes em catálogos grandes; a UI deve mostrar frescor e progresso, não prometer snapshot imediato.
- Olist não fornece comissão no contrato de pedido consultado; métricas de margem/comissão ficam incompletas para esse provider até existir uma fonte oficial.
- Limites são compartilhados por conta; outros aplicativos Olist podem causar `429`, tratado como degradação transitória e retomável.
