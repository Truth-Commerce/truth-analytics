# Contexto explícito de cliente para o analista

## Objetivo

Impedir que páginas operacionais do analista consultem a organização interna da equipe e permitir que analistas atribuídos e administradores gerem relatórios no contexto explícito de uma organização cliente.

## Problema confirmado

O menu lateral do analista aponta para rotas do cliente, como `/dashboard` e `/dashboard/estoque`. Essas rotas resolvem a organização por `access.orgId`, que para um analista é a organização interna da Truth. Consequentemente, o dashboard informa que não há ERP conectado mesmo quando o Olist está ativo na organização da carteira.

## Navegação

O menu do analista conterá somente superfícies próprias do papel:

- Carteira: `/analista`
- Comparativo: `/analista/comparativo`
- Conexões: `/analista/conexoes`

As páginas genéricas de cliente serão removidas do menu do analista. Informações de dashboard, tarefas, produtos, conexão e demais dados de uma conta continuarão disponíveis dentro de `/analista/[orgId]`, sempre depois da autorização da organização.

## Geração de relatório

A ficha `/analista/[orgId]` exibirá uma área de geração do relatório no contexto do cliente selecionado. O servidor receberá o `orgId`, recarregará a sessão e executará `assertOrgAccess` antes de qualquer leitura ou escrita.

O fluxo permitirá:

- analista somente quando a organização estiver atribuída à sua carteira;
- `admin_truth` para qualquer organização cliente acessível;
- organização ativa e com plano válido;
- um ERP ativo, independentemente de ser Bling ou Olist;
- no máximo um relatório `queued` ou `running` por organização.

A action reutilizará `enqueueReport`, evitando duplicar criação de período, fila e disparo do pipeline. O resultado mostrará sucesso, relatório já em andamento, ERP ausente, plano ausente ou falha de disparo.

## Auditoria e segurança

Cada disparo bem-sucedido registrará uma entrada de auditoria com organização, usuário, relatório e origem `staff`. O `orgId` do formulário nunca será considerado autorização: ele será apenas o alvo validado por `requireAnalista` e `assertOrgAccess`.

Não haverá impersonação nem mudança do `orgId` da sessão. Isso evita vazamento entre clientes e mantém o contexto explícito em todas as operações.

## Interface

Na ficha do cliente, o card exibirá:

- ERP ativo e respectivo provedor;
- botão `Gerar relatório agora` quando elegível;
- estado de carregamento durante o disparo;
- mensagem objetiva de sucesso ou erro;
- link para acompanhar o relatório quando houver identificador disponível.

## Testes e aceite

- teste puro confirma que o menu do analista não contém rotas de cliente;
- teste da action permite analista atribuído e administrador;
- teste da action rejeita analista fora da carteira antes de enfileirar;
- teste aceita tanto Olist quanto Bling como ERP ativo;
- teste impede disparo sem ERP e relatório concorrente;
- TypeScript, lint e testes focados passam;
- em produção, a organização J & D exibe Olist ativo e permite iniciar o primeiro relatório pela ficha da carteira.

## Fora de escopo

Não será criado seletor global de organização nem serão adaptadas todas as rotas `/dashboard/*` para staff. Essas páginas permanecem exclusivas da conta cliente.
