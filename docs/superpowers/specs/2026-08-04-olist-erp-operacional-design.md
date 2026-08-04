# Olist ERP operacional e seleção exclusiva de ERP

## Objetivo

Permitir que cada organização use exatamente um ERP operacional — Bling ou Olist ERP (antigo Tiny) — e garantir que pedidos, estoque, dashboard, crons e relatórios usem automaticamente o ERP conectado.

## Regras de negócio

- Cada organização pode ter no máximo um ERP operacional.
- Uma conexão só se torna operacional após possuir credenciais OAuth válidas e um teste mínimo bem-sucedido contra a API do provedor.
- Ao ativar um ERP, qualquer outra conexão ERP da organização deixa de ser operacional.
- Nenhum fluxo de leitura pode assumir Bling quando o ERP ativo for Olist.
- Sem ERP operacional, geração e sincronização ficam bloqueadas com uma orientação neutra: `Conecte seu ERP`.
- A origem do dado deve ser preservada para auditoria, sem alterar o contrato normalizado consumido pelos relatórios.

## Arquitetura

### Seleção do provedor

Um serviço central resolve o ERP operacional da organização a partir das conexões persistidas. Ele devolve o identificador do provedor e seu adaptador registrado. A exclusividade é garantida transacionalmente ao concluir OAuth/ativação, não apenas pela interface.

### Contrato do adaptador

Olist e Bling implementam o mesmo contrato de ERP:

- obter e renovar token válido;
- listar pedidos paginados dentro de um período;
- obter detalhes necessários dos pedidos;
- listar produtos e estoque;
- normalizar erros permanentes, transitórios e de limite;
- devolver pedidos e estoque nos tipos internos já usados pelo pipeline.

O pipeline passa a depender do contrato, não de imports específicos do Bling.

### Olist ERP

O adaptador Olist utilizará a API oficial do Olist ERP, antigo Tiny, com OAuth 2.0 já existente. A coleta deve:

- paginar sem acumular toda a carteira em memória;
- respeitar limites com backoff para `429` e falhas transitórias;
- mapear identificador externo, data, situação, canal, cliente, totais, frete, desconto e itens;
- tratar campos ausentes sem produzir `NaN` ou datas inválidas;
- deduplicar pela combinação de organização, provedor e identificador externo;
- sincronizar saldo de estoque para o snapshot interno.

### Pipeline e relatório

O orquestrador resolve o ERP operacional uma vez no início. Coleta, enriquecimento e estoque utilizam o adaptador resolvido. Métricas, IA, calendário, tarefas e relatório continuam consumindo as tabelas normalizadas e não precisam conhecer o provedor.

Crons de pedidos, estoque, renovação e elegibilidade passam a considerar qualquer ERP operacional. Uma organização Olist não dependerá de registro Bling.

### Interface

- Checklist: `Conectar o ERP`.
- Bloqueios e estados vazios: `Conecte seu ERP em Conexões`.
- Etapas do relatório: `Conectando ao ERP` e mensagens neutras.
- A tela de conexões informa qual ERP está ativo e impede dois ERPs operacionais simultâneos.
- Textos específicos continuam permitidos dentro do cartão de configuração do próprio provedor.
- Será removida a mensagem de que relatórios Olist continuam usando Bling.

## Erros e segurança

- Token expirado tenta renovação coordenada antes da coleta.
- Erro permanente marca apenas a conexão correspondente e orienta reconexão.
- Erro transitório não desconecta o cliente; o job falha de forma reexecutável.
- Credenciais e tokens permanecem criptografados e nunca entram em logs.
- O callback OAuth mantém validação de estado, organização e impressão digital das credenciais.

## Migração e compatibilidade

- Organizações Bling existentes continuam funcionando sem ação manual.
- Conexões Olist já autorizadas tornam-se elegíveis após validação operacional.
- Se dados legados não registrarem provedor no identificador externo, a migração preservará a compatibilidade e evitará colisões por organização.
- A ativação será reversível: desabilitar a seleção Olist não apaga pedidos já importados.

## Testes e critérios de aceite

- Selecionar Bling ou Olist como único ERP operacional por organização.
- Ativar Olist desativa operacionalmente Bling, e vice-versa.
- Olist pagina, normaliza e persiste pedidos sem chamar APIs Bling.
- Olist sincroniza estoque sem chamar APIs Bling.
- Geração manual e cron produzem relatório para organização somente Olist.
- Organização sem ERP recebe bloqueio neutro.
- Dashboard e relatório não exibem instruções Bling quando o ERP ativo for Olist.
- Suíte existente de Bling permanece verde.
- Testes de integração comprovam isolamento entre organizações e ausência de vazamento de tokens.

## Fora de escopo

- Permitir dois ERPs simultâneos na mesma organização.
- Mesclar pedidos de provedores diferentes no mesmo período.
- Redesenhar relatórios ou alterar métricas de negócio.
- Migrar ou apagar dados históricos do Bling.
