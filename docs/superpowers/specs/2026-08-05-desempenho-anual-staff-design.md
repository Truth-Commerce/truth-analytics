# Desempenho Anual (staff) — histórico de 12 meses

> Spec aprovada pelo dono em 2026-08-05. Frente 1 de 3 (2: módulo Mercado Livre;
> 3: professor de estratégia com metas). Cada frente tem ciclo próprio de
> spec → plano → implementação → validação.

## Objetivo

Replicar dentro do Truth Analytics os painéis de longo prazo do Bling (faturamento,
pedidos, ticket médio, top SKUs — hoje só visíveis no próprio Bling) e ir além deles
com métricas que o Bling não mostra (receita líquida, comissão, frete, canal por mês),
para o analista da Truth construir estratégia de faturamento com o cliente.

O Truth Analytics hoje só enxerga a janela do relatório (7/15/30 dias). Esta frente
cria a visão de 12 meses.

## Decisões do dono

| Decisão | Escolha |
|---|---|
| Onde mora | Página nova no painel do **analista** + seção staff no relatório + prompt da IA |
| Quem vê | **Só staff.** Cliente NÃO vê a página nem a seção anual do relatório. A IA usa o histórico no prompt (o texto dela, visível ao cliente, pode citar tendências) |
| Profundidade do backfill | **12 meses** |
| Conjunto de gráficos | Os 4 do Bling + camada Truth (canal, comissão, frete, receita líquida, unidades) |
| Armazenamento | `orders` como fonte única, agregação SQL na leitura (abordagem A aprovada) |

## Arquitetura

### Dados: backfill + frescor (sem migration, sem tabela nova)

- **Backfill:** ação staff "Sincronizar histórico" na página nova. Chama
  `collectOrders(source, periodo)` com período de 12 meses — no Bling é busca
  paginada simples (100/página), upsert idempotente por
  `(org_id, provider, source_generation, provider_order_id)`. Pedidos novos caem
  com `enriquecido_em = NULL` e a fila de enriquecimento existente (cron
  `sincronizar-pedidos` a cada 15 min, com quarentena) preenche
  canal/frete/comissão gradualmente.
- **Frescor:** já resolvido pelo cron `sincronizar-pedidos` (últimos 2 dias, a
  cada 15 min). Nenhum cron novo.
- **Cobertura visível:** a página mostra "histórico desde MMM/AA · N pedidos
  aguardando enriquecimento" para o analista saber se receita líquida/canal já
  são confiáveis.
- **Olist:** fora do escopo do backfill v1 (Olist tem preparação própria de 90d).
  A página funciona para org com Olist ativo lendo o que existir em `orders`.
- **LGPD:** nenhuma tabela nova; `orders` já está no `purgeOrg`.

### Agregação: leitura mínima no repository + agregação pura em JS

> Ajustado na implementação (aprovado no plano): a spec original prescrevia
> agregação SQL com `unnest` do jsonb. O que foi implementado busca as colunas
> mínimas e agrega em JS puro — precedente do `stock.repository.ts`. Ganho: as
> funções de agregação ficam testáveis sem banco e a lógica de mês comercial
> (America/Sao_Paulo) mora num lugar só.

`src/modules/desempenho/desempenho-anual.repository.ts` — leitura fina sobre
`orders`, sempre via `orderScope(ref)` (ERP ativo):

- `getPedidos12Meses(source, agora)` seleciona só
  `data, valor_total, frete, comissao, canal, itens` da janela de 12 meses.
- `getCoberturaHistorico(source)` devolve `desde` (menor `data`) e
  `pendentesEnriquecimento` (pedidos com `enriquecido_em IS NULL`).

`src/modules/desempenho/desempenho-anual.ts` (puro, sem banco) agrega essas
linhas. Por mês (12 meses, meses sem venda zerados):

- faturamento, pedidos, ticket médio, unidades (soma de `quantidade` dos itens),
  frete, comissão
- **receita líquida** = faturamento − comissão − frete
- faturamento por canal (para área/barras empilhadas)
- top SKUs por quantidade e receita (a partir do jsonb `itens` já carregado), com
  seletor de período 3/6/12 meses

Padrão do app mantido: telas só leem, pipeline só escreve.

### Página `src/app/analista/[orgId]/desempenho`

- Link a partir da visão 360 (`analista/[orgId]`). Gate de carteira igual às
  rotas staff existentes (padrão dos PRs #26/#28): gate ANTES da busca; fora da
  carteira → 404.
- Gráficos SSR reusando `src/components/ui/charts/` (`BarChart`, `LineChart`,
  `StackedAreaChart`):
  - Os 4 do Bling: faturamento/mês (barras), pedidos/mês (barras), ticket
    médio/mês (linha), top SKUs (lista com barras de proporção + seletor de
    período)
  - Camada Truth: faturamento empilhado por canal/mês, comissão+frete/mês,
    receita líquida/mês, unidades/mês
- Botão "Sincronizar histórico" (server action staff) com estado de progresso
  (cobertura + fila de enriquecimento).

### Relatório e IA

- `analysis-context` ganha `contextoAnual`: série mensal compacta dos 12 meses
  (mês, faturamento, pedidos, ticket), computada ao vivo do `orders` no momento
  da geração. Nova seção `### Histórico 12 meses` em `buildAnalysisMessages`.
- `analysis-context` ganha também `coberturaAnual` (`pendentesEnriquecimento`).
  O texto que a IA escreve é lido pelo CLIENTE, então a seção do prompt carrega
  ressalvas obrigatórias: só entram meses com pedidos (mês zerado por backfill
  pendente não pode virar "queda de vendas"), o último mês é marcado como
  parcial, e receita líquida/comissão/frete só aparecem com a fila de
  enriquecimento vazia — caso contrário a linha os omite e o prompt avisa que
  são indisponíveis. Sempre há a linha dizendo que mês ausente ≠ queda.
- Falha na leitura anual (`getPedidos12Meses`/`getCoberturaHistorico`) não
  derruba a geração do relatório: cai para `contextoAnual: null`.
- Seção visual "Contexto anual" APENAS na visão staff do relatório (rotas do
  analista). Computada ao vivo pelo repository — nada gravado em
  `reports.metricas`, então não existe caminho de API para o cliente acessar.
- A visão do cliente do relatório permanece byte a byte igual (exceto o texto
  que a própria IA escrever).

## Erros e casos-limite

- Org sem histórico (conta Bling recente): página renderiza com meses zerados.
- Backfill re-disparado: idempotente (upsert); não duplica.
- Rate limit do Bling durante backfill: retry/quarentena existentes; falha
  parcial não corrompe (páginas são upserts independentes).
- Pedidos ainda não enriquecidos têm `comissao=0`/`frete=0`: o aviso de
  cobertura evita leitura distorcida da receita líquida.
- Org com ERP Olist ativo: sem botão de backfill; página lê o que existe.

## Testes

- Integração: agregações mensais com pedidos semeados (mês vazio, multi-canal,
  receita líquida, top SKUs com seletor de período).
- Integração: backfill idempotente (rodar 2x não duplica).
- Unit: `contextoAnual` entra no prompt (`buildAnalysisMessages`).
- E2E: analista acessa a página; cliente é barrado (404/redirect); relatório do
  cliente NÃO contém a seção anual; visão staff do relatório contém.

## Fora de escopo (frentes futuras)

- Módulo Mercado Livre (visitas, reputação, Mercado Ads) — frente 2. NUNCA
  ingerir vendas do ML como fonte de receita: o Bling já espelha os pedidos do
  ML e isso duplicaria faturamento (veredito NOT_ALIGNED da revisão do F3b).
- Professor de estratégia com metas mensal/anual — frente 3 (usará o histórico
  desta frente).
- Exposição da página ao cliente; gráficos anuais no PDF.

## Execução

Planejamento e revisão: Fable. Implementação por subagentes: tarefas difíceis
com Opus, fáceis com Sonnet (decisão do dono, 2026-08-05).
