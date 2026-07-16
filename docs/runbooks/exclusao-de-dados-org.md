# Runbook — Exclusão total de dados de uma organização (offboarding / LGPD)

> Uso: pedido de encerramento de conta ou pedido de eliminação de dados do titular
> (LGPD art. 18, VI). Prazo operacional: **até 30 dias corridos** após o pedido.
> A exclusão é **IRREVERSÍVEL**. Órgão executor: admin Truth com acesso ao banco.

## Pré-requisitos

- Pedido registrado por e-mail (suporte@truthcommerce.com.br) com identificação do cliente.
- `.env.local` apontando para o banco CERTO (produção = Neon MAIN). Confira `POSTGRES_URL` antes.
- Backup/branch recente do Neon (o Neon mantém histórico point-in-time; anote o horário do purge).

## Passo a passo

1. **Identificar a org**: no /admin, abrir o cliente e copiar o UUID da URL (`/admin/<orgId>`)
   e o nome EXATO exibido.
2. **Revogar a conexão Bling** (se ativa): pedir ao cliente para revogar o app no painel do
   Bling, ou desconectar em nome dele (a linha de `connections` some no purge de toda forma,
   mas a autorização no Bling é externa ao nosso banco).
3. **Dry-run** (obrigatório — mostra as contagens sem excluir nada):

   ```bash
   npm run db:purge-org -- --org <uuid> --nome "Nome Exato da Org"
   ```

4. **Conferir as contagens** com o esperado (nº de relatórios/pedidos visto no admin).
5. **Executar**:

   ```bash
   npm run db:purge-org -- --org <uuid> --nome "Nome Exato da Org" --confirm
   ```

6. **Verificar**: login do ex-cliente falha; `/admin` não lista mais a org; a única linha
   remanescente é `audit_log.acao = 'org.purgada'` (registro mínimo da exclusão, sem dados
   pessoais além do nome da org e contagens).
7. **Responder ao titular** confirmando a eliminação (modelo curto, citando a data e o registro).

## O que o script exclui (ordem de FK real do schema)

| # | Tabela | Critério |
|---|---|---|
| 1 | `notifications` | `user_id` ∈ usuários da org |
| 2 | `task_comments` | `task_id` ∈ tasks da org |
| 3 | `task_activities` | `task_id` ∈ tasks da org |
| 4 | `tasks` | `org_id` |
| 5 | `alerts` | `org_id` |
| 6 | `market_snapshots` | `org_id` (antes de `reports` por FK `report_id`) |
| 7 | `reports` | `org_id` |
| 8 | `orders` | `org_id` |
| 9 | `tracked_products` | `org_id` |
| 10 | `connections` | `org_id` (tokens cifrados do Bling) |
| 11 | `password_reset_tokens` | `user_id` ∈ usuários da org |
| 12 | `login_attempts` | `email` ∈ e-mails dos usuários (sem FK — dado pessoal, sai também) |
| 13 | `audit_log` | `org_id` (sem FK; a linha final `org.purgada` é gravada DEPOIS) |
| 14 | `users` | `org_id` (antes: `organizations.analista_id`/`tasks.assignee_user_id`/`task_activities.user_id` cruzados são anulados defensivamente) |
| 15 | `organizations` | `id` |

> `org_invites` não existe (decisão G5/Task 2: 2º usuário é criado direto pelo admin).
> Se uma fase futura criar a tabela, incluir aqui entre os passos 13 e 14.
>
> `task_templates` é uma tabela GLOBAL (sem `org_id`) — biblioteca de modelos compartilhada
> entre todas as orgs. **Não** é tocada pelo purge de uma org específica.
>
> `aceitou_termos_em` (carimbo de aceite LGPD) vive na própria linha de `users` — some junto
> com o usuário no passo 14. Não precisa de tratamento separado.

## Salvaguardas do script

- **Dry-run por default** — sem `--confirm` nada é excluído.
- **Confirmação dupla** — exige o UUID **e** o nome exato da org (`confirmacao_invalida` se divergir).
- **Proteção absoluta da org interna** — org com usuário `admin_truth` nunca é purgada (`org_interna`).
- **Transação única** — ou tudo, ou nada.
- Se o DELETE de `users` falhar por FK residual: existe referência anômala fora do modelo
  (ex.: comentário cross-org). **NÃO forçar** — investigar a linha antes.

## Retenção pós-purge

- Backups do Neon expiram no ciclo normal de retenção do branch.
- A linha `org.purgada` do audit_log fica como registro mínimo da própria exclusão
  (base: cumprimento de obrigação e exercício regular de direito).
- E-mails já enviados via Resend seguem a retenção do provedor (logs transacionais).
