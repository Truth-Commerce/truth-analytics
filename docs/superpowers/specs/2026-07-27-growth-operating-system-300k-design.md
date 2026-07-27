# Truth Analytics Growth Operating System 300K

**Status:** aprovado em conversa em 27/07/2026  
**Escopo:** produto, experiência, dados, arquitetura e roadmap  
**Públicos prioritários:** analista de marketplace e cliente  

## 1. Contexto

O Truth Analytics já possui uma base relevante de consultoria: dashboard, relatórios com IA, alertas, estoque, kits, calendário comercial, plano de ação, ciclos, carteira, visão 360 e comparativo. Entretanto, essas capacidades ainda funcionam como módulos parcialmente isolados. O produto explica o que aconteceu, mas ainda não conduz de ponta a ponta a operação até uma meta financeira.

Todos os projetos acompanhados pela Truth Commerce terão como norte alcançar **R$ 300.000 de faturamento bruto anual**. O Truth Analytics será o meio operacional para diagnosticar, planejar, executar, medir e aprender quais ações aumentam a probabilidade de atingir essa meta.

Esta especificação substitui a ideia de apenas ampliar o dashboard. A decisão é evoluir o produto para um **Growth Operating System**, preservando o monólito modular atual e conectando dados, meta, oportunidades, execução e impacto.

## 2. Definição financeira

Para o programa 300K:

> Faturamento bruto é a soma do valor total dos pedidos válidos antes de comissão, frete, impostos e custos, excluindo pedidos cancelados e valores integralmente estornados.

Todas as interfaces, relatórios, projeções, alertas e análises de IA devem consumir a mesma definição versionada.

Pedidos precisam registrar, além dos campos atuais:

- situação na origem;
- data de aprovação e pagamento, quando disponíveis;
- data de cancelamento;
- estorno parcial ou total;
- data da última atualização na origem;
- valor bruto original e valor bruto válido.

## 3. Resultado esperado do produto

Ao abrir um projeto, o sistema deve responder em menos de 30 segundos:

1. Quanto o projeto faturou no ano?
2. Onde deveria estar hoje para alcançar R$ 300 mil?
3. Qual é a projeção de fechamento?
4. Qual lacuna ainda precisa ser fechada?
5. Quais oportunidades controláveis podem fechar essa lacuna?
6. O que precisa ser executado agora, por quem e até quando?
7. Quais ações anteriores produziram resultado comprovado?

Exemplo de síntese desejada:

> No ritmo atual, este projeto fechará o ano em R$ 284.700. Faltam R$ 15.300 para a meta. As três oportunidades prioritárias somam R$ 19.800 de potencial provável e a primeira precisa começar nesta semana.

## 4. Auditoria da versão atual

### 4.1 Pontos fortes observados

- Monólito modular com separação por domínios.
- Autorização multi-tenant centralizada e coberta por testes.
- Carteira e visão 360 já escopadas por organização.
- Relatórios estruturados com métricas, IA e PDF.
- Plano de ação com Kanban, hierarquia, ciclos, comentários, watchers e revisão.
- Estoque, kits e calendário já geram insumos operacionais.
- Jobs possuem autenticação, heartbeats e watchdog básico.
- Build de produção e lint passam com ambiente válido.
- A suíte executada com ambiente local inerte concluiu 902 testes e pulou 421 testes dependentes de banco/configuração.

### 4.2 Achados P0 reproduzidos

1. **Comparativo indisponível em produção.** A rota `/analista/comparativo` falha de forma reproduzível com erro de Server Component. A causa no código é o envio de `formatBRL`, uma função, de um Server Component para os Client Components `BarChart` e `DonutChart`.
2. **Contexto ambíguo do analista.** O menu do papel analista contém rotas `/dashboard`, `/dashboard/estoque`, `/dashboard/kits`, `/dashboard/calendario`, `/conexoes` e `/configuracoes`, mas essas páginas usam `requireActiveOrg()` e o `orgId` do acesso real. Não existe um cliente em foco persistente nem URL escopada pelo cliente.
3. **Overflow móvel.** Em viewport de 390 px, o dashboard apresentou `documentScrollWidth` de 1.027 px. O grid de bento cards permitiu que conteúdo de largura mínima expandisse uma coluna para aproximadamente 1.003 px.
4. **Fadiga de alertas.** No dashboard móvel, os alertas ocuparam aproximadamente 4.500 px antes dos indicadores de meta e faturamento.
5. **Listagens impraticáveis.** A tela de estoque renderizou 527 linhas e aproximadamente 29 mil px sem busca, filtro, paginação ou virtualização. A visão 360 atingiu aproximadamente 35.781 px por repetir a tabela completa, alertas e outros módulos na mesma página.
6. **Dependências vulneráveis.** A auditoria local de dependências de produção encontrou duas vulnerabilidades críticas e três altas, incluindo versões diretas de autenticação e framework.
7. **Faturamento sem estado completo do pedido.** O modelo não persiste situação, cancelamento ou estorno, criando risco de contabilizar pedidos inválidos na meta.
8. **Testes não herméticos por padrão.** A importação de diversos testes exige `POSTGRES_URL`, `AUTH_SECRET` e chave de criptografia mesmo quando o teste não usa infraestrutura real.

### 4.3 Achados P1/P2 de arquitetura

- `organizations.meta_mensal` é um valor mutável sem meta anual, faseamento, versão ou histórico.
- Comissão é armazenada nos pedidos, mas não participa das métricas; isso não impede a meta bruta, mas reduz a capacidade analítica futura.
- Estoque mantém apenas o estado corrente, sem histórico de saldo, ruptura, lead time ou reposição.
- Pedidos e estoque compartilham `connections.last_sync_at`, apesar de serem rotinas diferentes.
- Jobs são limitados e sequenciais; pedidos e estoque podem priorizar organizações diferentes conforme a carteira cresce.
- Heartbeat registra estado atual, mas não oferece histórico, duração, backlog, idade da fila ou SLO de frescor.
- Relatórios armazenam métricas majoritariamente em JSON, dificultando uma camada semântica histórica e versionada.
- O impacto de tarefas usa comparação antes/depois sem entidade explícita de experimento, hipótese ou controle de confundidores.
- Recomendações de IA não persistem de forma completa versão do prompt, evidências, confiança, feedback humano e avaliação posterior.
- Não existem dados diretos de tráfego, conversão, publicidade, qualidade de anúncio, reputação ou Buy Box dos marketplaces.
- O benchmark de preço por busca pública não controla frete, condição, reputação, variação, cupom ou oferta destacada.

## 5. Decisão de produto

O Truth Analytics será organizado em um ciclo contínuo:

1. Meta 300K.
2. Diagnóstico diário.
3. Oportunidades priorizadas.
4. Plano de crescimento.
5. Experimentos e execução.
6. Impacto medido.
7. Aprendizado e playbooks.
8. Nova priorização.

O produto deixa de otimizar quantidade de relatórios e passa a otimizar a probabilidade de cada projeto alcançar R$ 300 mil.

## 6. Experiência do analista

### 6.1 Dois contextos explícitos

O analista trabalhará em dois níveis:

- **Carteira:** visão agregada de todos os clientes sob responsabilidade.
- **Cliente em foco:** workspace escopado por `orgId`, visível no cabeçalho e na URL.

Rotas de cliente acessadas pelo analista devem incluir o `orgId` ou um contexto equivalente validado por `assertOrgAccess`. Não será permitido inferir silenciosamente o cliente a partir da organização real do usuário.

### 6.2 Menu da carteira

1. Meu dia.
2. Carteira.
3. Oportunidades.
4. Execução.
5. Comparativo.
6. Playbooks.
7. Performance.

### 6.3 Menu do cliente em foco

1. Visão 300K.
2. Oportunidades.
3. Plano de crescimento.
4. Produtos e catálogo.
5. Estoque e reposição.
6. Preços e concorrência.
7. Campanhas e calendário.
8. Relatórios e evidências.
9. Integrações.

O seletor persistente mostrará nome, progresso da meta e frescor dos dados. Trocar o cliente muda a URL e todas as consultas subsequentes.

### 6.4 Meu dia

- três decisões prioritárias;
- clientes perdendo ritmo;
- clientes projetados abaixo da meta;
- tarefas vencidas ou sem responsável;
- recomendações aguardando decisão;
- fontes desatualizadas;
- próximas reuniões;
- briefing gerado para cada reunião.

### 6.5 Mapa da carteira

Cada cliente exibirá:

- faturamento anual acumulado;
- percentual da meta;
- projeção anual;
- lacuna financeira;
- probabilidade de alcance;
- oportunidade disponível;
- ações em andamento;
- última interação;
- frescor e completude dos dados.

A ordenação padrão combinará lacuna, urgência, confiança e controlabilidade, e não apenas um score estático de risco.

## 7. Experiência do cliente

O cliente terá uma interface mais simples e orientada a ação.

Menu:

1. Meu caminho aos 300K.
2. O que fazer agora.
3. Plano de ação.
4. Resultados.
5. Produtos.
6. Calendário.
7. Ajuda e integrações.

A primeira tela mostrará progresso anual, projeção, resultado mensal, três ações prioritárias, pendências, vitórias recentes, próxima reunião e mensagem do analista.

Indicadores sempre terão tradução operacional. Gráficos detalhados e evidências avançadas estarão disponíveis por expansão progressiva, não como primeira camada.

## 8. Visão 300K

### 8.1 Componentes essenciais

- faturamento acumulado;
- meta proporcional até hoje;
- resultado acima ou abaixo do ritmo;
- projeções conservadora, provável e otimista;
- probabilidade de alcance;
- lacuna a fechar;
- ritmo diário, semanal e mensal necessário;
- waterfall das oportunidades que cobrem a lacuna;
- principais motores de crescimento;
- qualidade e frescor dos dados.

### 8.2 Motores de crescimento

- volume de pedidos;
- ticket médio;
- itens por pedido;
- recorrência, quando houver dados;
- disponibilidade de estoque;
- mix e concentração de produtos;
- diversificação de canais;
- tráfego e conversão, quando integrados;
- campanhas;
- preço e competitividade.

Cada motor mostra situação, tendência, impacto potencial, confiança e próxima ação.

## 9. Pipeline de oportunidades

Uma oportunidade possui:

- motor de crescimento;
- problema ou hipótese;
- evidências estruturadas;
- impacto mensal e anual potencial;
- confiança;
- esforço;
- urgência;
- origem: regra, IA, analista ou cliente;
- produtos e canais afetados;
- responsável;
- prazo;
- ação e experimento associados.

Estados:

`detectada -> validada -> aprovada -> em_execucao -> medindo -> comprovada | descartada`

A carteira consolidará potencial identificado, aprovado, em execução, capturado e descartado.

## 10. Plano de crescimento e experimentos

O modelo deixa de ser somente tarefa e passa a formar a cadeia:

`objetivo -> oportunidade -> experimento -> tarefa -> resultado`

Experimentos registram hipótese, baseline, métrica principal, mudança, janela de medição, meta, resultado e confiança. Uma tarefa concluída não recebe automaticamente crédito pela variação posterior.

O registro de impacto preserva:

- receita protegida;
- receita incremental estimada;
- receita incremental observada;
- período;
- método;
- evidências;
- oportunidade e experimento de origem;
- responsável pela validação.

## 11. Meeting Mode

O modo reunião apresentará:

- evolução desde a reunião anterior;
- ritmo da meta 300K;
- compromissos assumidos;
- entregas e bloqueios;
- resultados observados;
- decisões necessárias;
- plano até o próximo encontro.

Ao concluir a reunião, o sistema gera ata, tarefas, responsáveis, atualização das oportunidades, resumo para o cliente e próxima revisão.

## 12. Modelo de dados alvo

### 12.1 `growth_goals`

- `id`, `org_id`, `year`;
- `target_gross_revenue`;
- `starts_at`, `baseline_gross_revenue`;
- `revenue_definition_version`;
- `status`, `created_by`, timestamps.

Restrição: uma meta ativa por organização e ano.

### 12.2 `goal_phases`

- `goal_id`, `month`;
- `seasonality_weight`;
- `target`, `actual`, `forecast`;
- `required_run_rate`;
- `forecast_confidence`;
- timestamps.

### 12.3 `growth_opportunities`

- identidade e organização;
- motor, título, descrição e origem;
- evidências JSON versionadas;
- potencial mensal/anual;
- confiança, esforço e urgência;
- status, responsável e validade;
- produtos, canais e datas relevantes.

### 12.4 `growth_experiments`

- oportunidade associada;
- hipótese e métrica;
- baseline e alvo;
- janela de execução e medição;
- mudança aplicada;
- resultado, impacto e confiança;
- estado e validação humana.

### 12.5 `impact_ledger`

- organização, oportunidade e experimento;
- tipo de impacto;
- valor estimado e observado;
- período e método de cálculo;
- evidências e responsável pela validação.

### 12.6 Catálogo unificado

O modelo futuro separa produto mestre, SKU, variação, kit, componentes do kit, anúncio, marketplace e identificador externo. Isso evita tratar anúncios e kits como estoques independentes quando compartilham componentes.

## 13. Camada de métricas

Métricas estratégicas terão definição e versão únicas, origem, horário de atualização, completude e valor diário/semanal/mensal.

Primeiro conjunto:

- faturamento bruto válido;
- pedidos válidos;
- ticket médio;
- itens por pedido;
- receita por canal e SKU;
- concentração de receita;
- dias com venda;
- cobertura de estoque;
- receita em risco por ruptura;
- receita de produtos parados;
- ritmo necessário;
- projeção anual;
- lacuna para R$ 300 mil.

Relatórios continuarão armazenando snapshots imutáveis, mas não serão a única fonte consultável para métricas históricas.

## 14. Projeção

A projeção evoluirá em versões explícitas.

### V1

- acumulado no ano;
- média móvel recente;
- quantidade de dias restantes;
- sazonalidade mensal configurada;
- cenários conservador, provável e otimista.

### V2

- padrão por dia da semana;
- datas comerciais;
- ruptura e disponibilidade;
- campanhas planejadas;
- intervalo de confiança calibrado com previsões anteriores.

Toda projeção explica entradas, fórmula, atualização e limitações.

## 15. Integrações

A arquitetura de provedores permanecerá baseada em adaptadores.

Ordem de expansão:

1. Bling com estado completo dos pedidos.
2. Importação CSV como contingência governada.
3. Catálogo unificado.
4. Mercado Livre.
5. Shopee.
6. Tráfego, conversão e publicidade.
7. Reputação, logística e qualidade dos anúncios.

## 16. Jobs, filas e observabilidade

Cada tipo de sincronização terá estado próprio:

- última tentativa e sucesso;
- cursor;
- itens processados e pendentes;
- erro;
- próxima tentativa;
- frescor máximo aceitável.

Pedidos, estoque, catálogo, métricas, alertas, relatórios, IA e notificações devem ser idempotentes e recuperáveis. Uma execução interrompida continua do cursor correto.

Observabilidade registra histórico de execuções, duração, backlog, idade da fila, organizações afetadas, tentativas e SLO de frescor.

## 17. IA governada

A IA recomenda; métricas determinísticas permanecem como fonte da verdade.

Cada saída relevante persiste:

- dados e período usados;
- fórmula e suposições;
- confiança e condições de invalidação;
- versão do prompt, contrato e modelo;
- decisão humana;
- resultado posterior.

Publicações externas e alterações em marketplace exigem aprovação humana até que dados, avaliações e rollback estejam maduros.

## 18. Segurança, qualidade e operação

Antes de acelerar o onboarding:

- remover vulnerabilidades críticas conhecidas;
- atualizar autenticação e framework com testes direcionados;
- tornar testes herméticos;
- executar banco descartável em CI;
- separar cursores de sincronização;
- criar backup testado e runbook de restauração;
- manter e ampliar auditoria de ações críticas;
- adicionar smoke tests autenticados das jornadas principais;
- validar isolamento multi-tenant em toda nova rota com `orgId`.

## 19. Roadmap aprovado

### P0 — estabilização

1. Dependências críticas e testes de autenticação.
2. Comparativo.
3. Contexto persistente do cliente para analista.
4. Overflow móvel.
5. Resumo e central de alertas.
6. Paginação/filtros de estoque.
7. Visão 360 em abas.
8. Estado completo do pedido e métrica bruta válida.
9. Cursores separados e histórico de jobs.
10. CI hermético, smoke tests, backup e restauração.

### P1 — fundação 300K

- metas e fases;
- camada de métricas;
- projeção V1;
- visão 300K do analista e cliente;
- mapa da carteira;
- qualidade e frescor dos dados.

### P2 — oportunidades e execução

- motor de oportunidades;
- revenue gap waterfall;
- plano ligado a oportunidades;
- responsabilidades e dependências;
- Meeting Mode.

### P3 — impacto e playbooks

- experimentos;
- impact ledger;
- avaliação de impacto;
- playbooks comprovados e replicação.

### P3.5 — marketplaces

- catálogo unificado;
- integrações diretas;
- tráfego, conversão, anúncios e campanhas.

### P4 — copiloto

- briefing diário;
- simulador de cenários;
- plano semanal sugerido;
- previsão de risco;
- copiloto de reunião;
- conteúdo e campanhas;
- automação externa com aprovação e rollback.

## 20. Critérios de sucesso

### Resultado financeiro

- percentual de projetos no ritmo da meta;
- faturamento bruto acumulado;
- lacuna total da carteira;
- receita incremental observada e protegida;
- potencial aberto e capturado.

### Execução

- tempo até primeira ação;
- oportunidades sem responsável;
- taxa de conclusão;
- tarefas vencidas;
- tempo entre ação e medição;
- dependências do cliente paradas.

### Produto

- analistas e clientes ativos;
- reuniões conduzidas no sistema;
- oportunidades convertidas em ações;
- recomendações aceitas e descartadas;
- tempo para identificar o cliente prioritário.

### Qualidade

- frescor por fonte;
- completude do catálogo;
- jobs com erro;
- cobertura de testes;
- recomendações avaliadas;
- calibração das projeções.

## 21. Decisão de escala

**NO-GO para acelerar o onboarding de novos projetos até a conclusão dos itens P0 de segurança, faturamento válido, contexto de cliente, comparativo e escalabilidade visual.**

A carteira existente pode permanecer em operação com monitoramento e correções priorizadas.

## 22. Fora de escopo imediato

- microserviços;
- publicação autônoma em marketplace;
- atribuição causal perfeita sem dados suficientes;
- cálculo de lucro ou margem como métrica principal do programa 300K;
- integrações profundas antes da estabilização P0 e da fundação P1.

## 23. Próximo passo

Após revisão desta especificação, decompor o P0 em um plano de implementação com tarefas pequenas, testes prévios, arquivos exatos, critérios de aceite e checkpoints de deploy. A implementação deve respeitar a ordem de risco: segurança e corretude antes de expansão funcional.
