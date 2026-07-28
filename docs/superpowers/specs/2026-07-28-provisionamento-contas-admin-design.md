# Provisionamento administrativo de contas — Design

## Contexto

A tela `/admin/usuarios` hoje possui um único formulário genérico que exige selecionar uma organização antes de criar qualquer usuário. Esse modelo não representa os dois fluxos reais da operação Truth:

- um cliente novo ainda não possui organização; sua empresa e seu primeiro acesso precisam nascer juntos;
- um analista é integrante da operação interna e não deve escolher uma organização de cliente para existir.

## Decisão aprovada

Separar a criação em duas áreas explícitas:

1. **Criar conta de cliente:** recebe nome da empresa e e-mail do responsável, cria uma organização `pending` e o primeiro usuário `client` na mesma transação e retorna uma senha temporária exibida uma única vez.
2. **Criar conta de analista:** recebe somente o e-mail, cria o usuário `analista` automaticamente na organização interna do administrador autenticado e retorna uma senha temporária exibida uma única vez.

O vínculo do analista com clientes continua sendo feito por `organizations.analista_id`; a organização interna serve apenas como identidade-base do analista.

## Regras funcionais

- Somente `admin_truth` pode executar os dois fluxos.
- Nome da empresa: `trim`, mínimo de 2 caracteres e máximo de 255.
- E-mail: validado, normalizado para minúsculas e único globalmente.
- A senha temporária terá 12 caracteres gerados criptograficamente e nunca será persistida em claro, registrada em log, audit ou enviada automaticamente.
- Organização criada pelo admin começa como `pending`, sem plano. A ativação e escolha do plano continuam no painel administrativo existente.
- O primeiro cliente é criado com `role='client'` e `aceitou_termos_em=null`, pois o administrador não pode aceitar os termos em nome dele.
- O analista é criado com `role='analista'` e `org_id` igual ao `orgId` do administrador autenticado.
- Uma colisão de e-mail deve desfazer integralmente a transação de cliente: nenhuma organização órfã pode permanecer.
- Criação e audit devem pertencer à mesma transação, evitando sucesso sem rastreabilidade ou mensagem de erro falsa depois de a conta já ter sido criada.

## Arquitetura

Será criado um módulo administrativo de provisionamento responsável por duas operações transacionais:

- `provisionClientAccount(input)` insere organização, usuário proprietário e audit;
- `provisionAnalystAccount(input)` insere analista e audit na organização interna.

As Server Actions serão responsáveis apenas por autorização, validação de `FormData`, geração da senha temporária, tradução de erros e revalidação. A interface será dividida em dois componentes independentes, removendo o seletor de organização e o seletor de papel.

## Segurança e isolamento

- O `orgId` do analista nunca virá do navegador; será derivado da sessão `admin_truth`.
- O papel também não virá do navegador; cada action chama uma operação com papel fixo.
- A criação do cliente não aceitará `status`, `plano`, `role` ou `analista_id` enviados pelo formulário.
- A restrição única de `users.email` será a última barreira contra concorrência; o erro PostgreSQL `23505` será traduzido para `email_em_uso`.
- Senhas serão transformadas pelo `hashPassword` antes da persistência.

## Interface

No topo de `/admin/usuarios`, dois cards:

- **Criar conta de cliente** — campos “Empresa” e “E-mail do responsável”, ação “Criar cliente”.
- **Criar conta de analista** — campo “E-mail do analista”, ação “Criar analista”.

Cada card mostra feedback e credenciais temporárias separadamente. A transferência de carteira e a lista cross-org permanecem abaixo, sem alteração de comportamento.

## Testes e aceite

- Integração: criação do cliente grava organização, proprietário e audit corretamente.
- Integração: e-mail duplicado não deixa organização órfã.
- Integração: conta administrativa não marca aceite de termos.
- Integração: analista é criado na organização interna fornecida e auditado.
- Segurança: nenhum fluxo aceita papel ou organização escolhidos pelo navegador.
- E2E: admin cria cliente sem organização prévia e cria analista sem selecionar organização; ambos aparecem na lista.
- Regressão: testes, typecheck, lint e build completos devem permanecer verdes.

## Fora de escopo

- Atribuir automaticamente um analista ao cliente recém-criado.
- Ativar automaticamente a organização ou escolher plano nesse formulário.
- Enviar senha por e-mail ou criar fluxo obrigatório de primeiro acesso.
- Implementar o conector Olist ERP; ele será o próximo subprojeto.
