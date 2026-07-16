# Runbook — Onboarding de cliente (Truth Analytics)

> Fluxo REAL de colocar um cliente novo no ar, do cadastro ao primeiro relatório com QA.
> Executores: admin Truth + analista designado. Tempo típico: 1 dia útil
> (limitado pela autorização do Bling pelo cliente).

## Pré-requisitos do ambiente (checar 1x — card "Status do sistema" no /admin)

- [ ] `RESEND_API_KEY` + `EMAIL_FROM` configurados (sem isso NENHUM e-mail sai — inclusive reset de senha).
- [ ] `CRON_SECRET`/`PIPELINE_SECRET` configurados (relatórios automáticos e sync diário).
- [ ] `SERPAPI_KEY` (opcional — melhora o benchmark de mercado).
- [ ] App Bling: modelo por cliente (sem homologação) — cada cliente autoriza o app na própria conta.

## Checklist do onboarding

1. **Conta** — o cliente cria a conta em `/sign-up` (nome da empresa + e-mail + senha
   + aceite dos Termos/Privacidade). Ele cai em `/aguardando` (org `pending`).
2. **Ativar + plano** — admin em `/admin`: botão **Ativar** na linha do cliente, escolhendo o
   plano (Semanal / Quinzenal / Mensal → define cadência do relatório e limite de produtos:
   10 / 20 / 30). O cliente recebe e-mail de conta ativada (se RESEND ok).
3. **Atribuir analista** — em `/admin/<orgId>`, card **Consultoria** → selecionar o analista.
   Sem analista, notificações de consultoria caem no e-mail interno (ADMIN_ALERT_EMAIL).
4. **Meta mensal** — em `/admin/<orgId>`, card **Meta mensal** → combinar o valor com o
   cliente e salvar (alimenta o pace do dashboard).
5. **Conectar o Bling** — o CLIENTE faz: `/conexoes` → **Conectar Bling** → autoriza no
   painel Bling. Conferir em `/admin/<orgId>` aba **Conexão** que a saúde está "Conectada".
6. **Produtos e palavras-chave — feito pelo ANALISTA** — em `/analista/<orgId>` aba
   **Produtos** (ou pelo admin em `/admin/<orgId>` aba **Produtos**): cadastrar os produtos
   estratégicos do cliente com palavras-chave de busca (alimentam o benchmark de mercado).
   Respeitar o limite do plano; priorizar os produtos de maior receita.
7. **(Opcional) 2º usuário** — em `/admin/<orgId>`, card **Usuários** → criar com o e-mail
   do sócio/gestor; repassar a senha temporária pelo canal do cliente e orientar a troca em
   **Configurações** no primeiro acesso.
8. **Primeiro relatório** — em `/admin/<orgId>` → **Gerar relatório agora** (ignora o gate de
   ciclo). Acompanhar o status na aba Relatórios.
9. **QA do primeiro relatório** (admin + analista, ~10 min):
   - [ ] Relatório `done` sem erro; Truth Score plausível; período correto (dias fechados BRT).
   - [ ] Dashboard do cliente: faturamento, meta com pace, alertas coerentes.
   - [ ] Benchmark: posição de preço sem "R$ 0,00"; badge de parcial só se fizer sentido.
   - [ ] Plano de Ação: achados viraram tasks com prazo; analista recebeu a notificação.
   - [ ] E-mail "relatório pronto" chegou ao cliente (se RESEND ok).
10. **Kickoff com o cliente** — analista apresenta o relatório e o plano de ação; combina o
    ritmo de acompanhamento (a cadência do plano gera os próximos automaticamente).

## Notas ao dono

- Homologação do app Bling segue pendente para modelo app-único (bloqueia terceiros no
  modelo antigo — hoje operamos app-por-cliente).
- Os textos de /termos e /privacidade devem ser revisados com jurídico antes do lançamento
  comercial (completar razão social, CNPJ e foro).

## Offboarding

Ver `docs/runbooks/exclusao-de-dados-org.md` (purge completo por org, dry-run first).
