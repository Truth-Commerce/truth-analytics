# Auditoria de Qualidade Total + Plano de Excelência — Truth Analytics (2026-07-14)

> Auditoria feita por **Fable 5** (6 agentes paralelos: dashboard, CRM, relatório/IA, visual/a11y, engenharia, produto/negócio) sobre o branch `feat/f3a-automacao-inteligencia` (HEAD `cb5489f`), **+ QA visual ao vivo** (primeiro da história do projeto: dev server porta 3200 + banco test + seed rico + screenshots desktop/mobile nas 3 áreas).
> Objetivo definido pelo dono: **o melhor possível para o CLIENTE** — usabilidade total, relatório com **gráficos avançados** sobre os dados do Bling.
> Implementação prevista: **Opus 4.8 subagent-driven**, após aprovação do dono.

---

## 1. Veredito geral

A fundação (F0) e a segurança continuam exemplares — multi-tenancy sem furos no delta F1→F3a, crons autenticados, templates com escape. O problema agora é outro: **o produto ainda não conta a verdade inteira nem conta bem a história**. Três frentes puxam a nota para baixo:

1. **Verdade dos dados** — os alertas "proativos" e a meta mensal leem a tabela `orders`, que só atualiza quando um relatório roda. Para plano mensal isso **garante** alerta falso de "queda de 100%" (com e-mail!) no meio do ciclo e meta congelada por 30 dias. Alertas resolvidos **renascem no dia seguinte** com novo e-mail (dedup só contra abertos). Janela do relatório em UTC deixa o 1º dia de fora e o último parcial. E-mails são no-op sem RESEND (o produto "relatório por e-mail" não envia e-mail — inclusive reset de senha).
2. **Valor desperdiçado** — o prompt da IA tem ~10 linhas e não recebe período/meta/relatório anterior/calendário BR; o schema devolve **listas de strings** (sem impacto em R$, sem passos, sem SKU estruturado); a página do relatório não mostra nem o total vendido; o PDF omite o Truth Score; frete, curva ABC, dia-da-semana, faixas de mercado — tudo já coletado e nunca usado. O CRM tem actions de edição prontas **sem nenhuma UI** (tasks imutáveis, sem prazo nas tasks de IA → SLA morto).
3. **Polimento** — navegação com `<a>` cru (full reload), eixos de gráfico com "R$" cortado, datas ISO cruas, cards vazando da tela no mobile, modais sem focus-trap, labels em inglês no admin, fila de revisão sem link para a task.

Nada disso é retrabalho estrutural: é **colher o que já foi plantado**. Os dados existem, os primitivos existem, as actions existem.

## 2. QA visual — o que foi visto ao vivo (inédito)

Cenário semeado: loja "Bazar Estrela do Mar" (utilidades domésticas), 4 relatórios done com Truth Score 58→64→71→76 + 1 failed, 2 alertas abertos, kanban com 8 tasks, meta R$ 45k, 3 notificações. Login QA (banco test): `qa.cliente@truthqa.com.br` / `qa.analista@…` / `qa.admin@…` (senha `QaVisual2026!`), server `http://localhost:3200`.

| Tela | Confirmado ao vivo |
|---|---|
| Dashboard desktop | Bonito e coeso; MAS: Meta "R$ 0,00 (0%)" ao lado de "Faturamento R$ 10.880" (dado morto), eixo Y com "R$" **cortado** ("$ 1.500,00"), datas ISO no eixo X, alerta CRÍTICO abaixo da dobra (7º bloco), marquee corta frases no meio, checklist "Primeiros passos" ocupa o topo de uma conta madura |
| Relatório | Hero sem NENHUM número (nem total, nem score); "Métricas" abre com um Stat solitário de Ticket médio; mesma doença dos eixos; tabela Evolução com "2026-07-06" |
| Plano de Ação | Kanban limpo; cards SEM prazo/checklist/comentários visíveis; setas ←→↑↓ crípticas para leigo; badge "Atrasada" funciona |
| /analista | Fila de revisão sem link para inspecionar a task (aprovação às cegas); nav mostra "Dashboard/Conexões" que levam o analista a uma tela quebrada (/aguardando); área sem nenhum motion |
| /admin | "active", "weekly", "monthly" crus; botões truncados "Plano..."; tabela com header/célula desalinhados |
| Mobile 375 | **Cards de stats VAZAM para fora da tela** (overflow horizontal real); gutter duplo (40px/lado) |

Screenshots salvos no scratchpad da sessão (`qa-dashboard-full.jpeg`, `qa-relatorio-full.jpeg`).

## 3. Achados consolidados (deduplicados, por prioridade)

### P0 — Verdade dos dados & confiança (corrigir antes de qualquer melhoria)

| # | Achado | Evidência âncora |
|---|---|---|
| P0-1 | Alertas de janela curta (queda 7d, produto parado 14d) rodam sobre `orders` congelado entre ciclos → falso "queda de 100%" garantido p/ biweekly/monthly, com e-mail | `alert-data.repository.ts:36-48`, `collect-bling.ts` único gravador, sem cron de sync |
| P0-2 | Alerta resolvido renasce no dia seguinte + 1 e-mail por alerta (sem cooldown por `resolvido_em`, sem digest) → loop de spam | `alert-detectors.ts:109-115`, `verificar-alertas/route.ts:82-90` |
| P0-3 | Meta mensal congelada (soma `orders` do mês, dado morto) e exibida como se fosse ao vivo | `organization-settings.repository.ts:18-25` |
| P0-4 | E-mails 100% no-op sem RESEND (inclusive **reset de senha** — usuário fica travado achando que quebrou) e sem notificação in-app de "relatório pronto"/"conexão expirada"; admin não tem visão de saúde de config | `email.ts:30-33`, `notify()` só em tasks/alertas |
| P0-5 | Token Bling expirado = churn silencioso: org sai do cron, ninguém é avisado, sem renovação proativa de token | `scheduler.repository.ts:27`, `connection.repository.ts:94-106` |
| P0-6 | Janela do relatório em UTC ancorada na hora do disparo: 1º dia da janela cai fora das métricas, último dia entra parcial (ponto "despencando" que a IA pode ler como queda) | `enqueue.ts:38-39`, `periodo-plano.ts:11`, `compute-metrics.ts:206-211` |
| P0-7 | `benchmarkParcial=true` SEMPRE que SERPAPI não está configurada (estado atual de produção), mesmo com ML público completo → badge eterna de "dados incompletos" + IA instruída a hedgear preço | `collect-market.ts:31,61-67`, `serpapi.ts:8-10` |
| P0-8 | Auto-geração re-tenta org quebrada TODO dia sem backoff (até 2 chamadas Opus/dia/org) e custo IA sem medição/teto | `scheduler.repository.ts:28-33`, `analyze-ia.ts:78-99` |
| P0-9 | `stop_reason` nunca checado na chamada Claude: thinking pode estourar `max_tokens:16000` → JSON truncado → retry idêntico falha → relatório `failed` sem causa logada | `analyze-ia.ts:102-114` |
| P0-10 | Retorno do OAuth Bling descartado (`?ok=1`/`?erro=` não lidos): falha de conexão = tela muda nada, no passo 1 do onboarding | `callback/route.ts:22-30` vs `conexoes/page.tsx` |
| P0-11 | Relatório em andamento não retoma o stepper após reload/cron (só badge estático) — o momento-wow some no caso mais comum | `generate-report.tsx:73-75` |

### P1 — Valor desperdiçado (o coração do pedido do dono)

- **IA**: prompt de 10 linhas sem período/meta/anterior/calendário BR/audiência leiga/limites; schema de strings soltas; task de IA nasce truncada em 140 chars com tipo por regex e **sem prazo**; prompt caching no-op (<4096 tokens).
- **Métricas**: `orders.frete` nunca lido; sem curva ABC/piores produtos; sem dia-da-semana; sem canal×dia; snapshots reduzidos a 1 mediana (sem min/p25/p75, sem separar fonte); `posicaoPreco` com `nossoPreco=0` exibido como "R$ 0,00".
- **Relatório (página)**: sem total/pedidos/deltas no hero; tabelas mudas sem Δ; posição de preço sem Δ% nem leitura ("7% acima"); TOC com âncoras mortas; datas ISO.
- **PDF**: sem Truth Score, sem evolução, sem total; 100% dark (hostil à impressão); filename com UUID.
- **E-mail "relatório pronto"**: expõe UUID, zero números, zero branding.
- **Comparar**: exige escolher 2 relatórios na mão (caso 90% = vs anterior); sem Δ em R$.
- **Dashboard**: score sem histórico (todos os scores estão persistidos!); `analiseIa` já vem na query e é descartada (nenhuma "ação nº 1"); topProdutos/posicaoPreco invisíveis; "Relatórios gerados" = métrica de vaidade que congela em 50; countdown do próximo relatório enquadrado como bloqueio em vez de serviço.
- **CRM**: `updateTaskAction`/`deleteTaskFormAction` SEM UI (tasks imutáveis); fila de revisão sem link/contexto; dedup só intra-relatório (reincidência vira duplicata); cards sem prazo/checklist/comentários; zero filtros/busca; sem lembrete de prazo (cron não cobre); analista não é notificado de task do cliente; impacto só por task de IA concluída, sem visão agregada para renovação; template desativado cria task placeholder "Task de template".

### P2 — Polimento & a11y (transversal)

Navegação `<a>` cru em todo o shell (full reload, mata fluidez e skeletons); ConfirmDialog e ⌘K sem focus-trap/role/restauração de foco; NotificationBell com `role="menu"` incompleto; toasts com timers órfãos e erro que some em 5s; erros de auth sem `role="alert"` e com cores fora do token; focus do botão primário = hover (indistinguível); nav sem estado ativo + links de cliente para admin/analista; labels EN no admin; kanban 5 colunas a partir de 768px (~130px/coluna); marquee sem pausa (WCAG 2.2.2); LineChart sem fallback sr-only; `dim`≡`muted` (hierarquia achatada); `ease-truth` definido e nunca usado; landing estática sem DNA cinematográfico; metadata único p/ todas as páginas; skeletons em metade das rotas; touch targets <40px; gutter duplo mobile; query dupla de jsonb pesado no dashboard (+SUM em JS, N+1 na carteira, requeue 23505 sem tratamento, `escapeHtml` faltando num template interno, PDF 404 text/plain, `brl()` sem milhar nos alertas).

Dívidas deferidas verificadas: **15 de 16 ainda existem** (resolvida: índice audit_log). `useFormState`→`useActionState` bloqueada por React 18 (upgrade Next 15/React 19 = fase própria futura, fora deste escopo).

## 4. Proposta de implementação — "Operação Excelência" (Opus 4.8, por fases)

> Regra de ouro mantida: re-validar código citado contra o branch base no início de cada fase. Base = `feat/f3a-automacao-inteligencia` (ou master pós-merge da F3a — decisão do dono). Invariante cardinal: preservar testids/fluxos E2E; TDD por task; review por task + revisão ampla por fase.

### G0 — Verdade dos Dados (a fundação da confiança) — ~10 tasks
1. **Cron de sync incremental de pedidos** (diário, reusa `collectBlingOrders` idempotente, janela 2d, por org com conexão ok) → destrava meta viva, alertas honestos e "vendas de ontem".
2. Guarda de frescor nos detectores + **cooldown pós-resolução** (7-14d por `chave_dedup`) + **digest** (1 e-mail/org/execução) + índice único parcial anti-corrida.
3. Janela do relatório em dias fechados **America/Sao_Paulo** (fim = ontem 23:59:59 BRT) + `timeZone` nos formatters.
4. Fix `benchmarkParcial`: filtrar providers pela config; parcial só quando provider ATIVO falha.
5. Backoff de auto-geração p/ org com falha recorrente (pausa após 3 + notifica admin) + **persistir `usage` de tokens por relatório** (governança de custo).
6. Robustez Claude: checar `stop_reason`, migrar p/ `.stream()` + budget maior, logar usage/causa real.
7. Renovação proativa de tokens Bling (cron) + notificação in-app/banner "conexão expirada" (cliente + analista + linha no admin).
8. Notify in-app "relatório pronto"; feedback do OAuth callback em /conexoes (sucesso/erro).
9. Stepper retomável: `latest.status ∈ {queued,running}` → renderizar `GenerationProgress` no server.
10. Card "Status do sistema" no /admin (RESEND/SERPAPI/CRON/SENTRY configurados?) — o admin descobre no painel, não no cliente.

### G1 — O Melhor Relatório (pedido central: gráficos avançados dos dados Bling) — ~12 tasks
1. **Métricas v2** (campos opcionais, retrocompat): evolução com nº de pedidos/dia; vendas por **canal×dia** (área empilhada); **dia-da-semana** (média); **curva ABC/Pareto** de produtos (+piores/parados); **frete** (médio, % da receita, por canal); ticket por canal; **faixas de mercado** min/p25/mediana/p75 por produto e por fonte; unidades e itens/pedido.
2. **Schema IA v2**: `achados[]` estruturados `{titulo ≤80, descricao, tipo, prioridade, impactoEstimadoMensalBRL, comoFazer[], skus[]}`; `recomendacoesPreco` + `precoAtual` + variação; `resumoExecutivo` + `destaques[]` (3 KPIs com direção).
3. **Prompt v2 "consultor Truth com memória e calendário"**: período com datas, plano/cadência, meta + progresso, nicho, relatório anterior (resumo+recomendações → "o que mudou/o que funcionou"), calendário comercial BR (tabela estática ~15 datas), audiência leiga, limites (máx 4+4+3), impacto em R$ com a conta mostrada.
4. Página do relatório v2 — **hero com história**: faixa de KPIs (Total ▲%, Pedidos, Ticket ▲%, Score) + destaques; gráficos avançados (Recharts): evolução com média móvel + comparação sombra do período anterior, canal×dia empilhado, Pareto ABC (barra+linha acumulada), dia-da-semana, **dispersão/barras divergentes preço vs mercado** (Δ% colorido), bullet da meta; tabelas com Δ e setas; posição de preço com leitura leiga ("7% acima do mercado") + fonte com rótulo pt-BR; empty-states honestos; TOC condicional (fix âncoras); datas dd/MM em tudo.
5. Achados IA como cards ordenados por impacto R$ com passos executáveis e CTA "virar tarefa" (pré-preenchida).
6. **PDF v2**: capa branded (cliente+período+score gauge SVG), resumo em 3 números, top-3 ações com R$, breakdown do score, mini-evolução, miolo claro p/ impressão, filename `truth-{org}-{periodo}.pdf`, contato do analista.
7. E-mail v2 "relatório pronto": assunto com resultado ("Suas vendas de 06–12/07: R$ 10.880 (▲12%)"), corpo com score + gargalo nº 1 + CTA; branding mínimo.
8. Comparar v2: default vs anterior, Δ em R$ + %, interseção de top produtos, uma linha de leitura automática.

### G2 — O Melhor Dashboard (decisão em 5 segundos) — ~8 tasks
1. Reordenação por decisão: **Alertas → "Como está minha loja" (Score + delta + ação nº 1 da IA com botão virar task) → Meta com pace → Charts → Geração/Histórico**.
2. **Truth Score com linha do tempo** (todos os scores persistidos → sparkline/线 no card, "de 58 para 76 em 4 relatórios").
3. Meta viva (G0) + **pace** ("no dia 14 você deveria estar em ~47% — está em 52% ✅" + projeção) + empty state quando sem meta.
4. Cards novos do bento: Top 5 produtos (receita), posição de preço ("2 acima / 3 abaixo do mercado"), resumo executivo em 2 linhas → link relatório.
5. Countdown positivo: "Sua próxima análise sai em N dias (dd/mm)" quando automático.
6. Histórico que conta história: colunas Faturamento e Score com ▲▼ vs anterior; substituir "Relatórios gerados" por KPI acionável (delta vs anterior).
7. Charts legíveis: datas dd/MM, eixo Y compacto ("R$ 2k", conserta o corte), tooltip pt-BR, fallback sr-only no LineChart; marquee → chips estáticos com pausa e link (ou rodapé).
8. Mobile: consertar overflow dos stats, gutter único, `md:grid-cols-3 xl:grid-cols-5` no kanban.

### G3 — O Melhor CRM (a máquina de consultoria) — ~12 tasks
1. **UI de edição/exclusão de task** (actions já existem): título, descrição, tipo, prioridade, **prazo**, responsável; excluir com ConfirmDialog.
2. **SLA por prioridade como convenção**: prazo default alta=7d/média=14d/baixa=30d em TODA criação (form, template, IA); "D-3"/"vence amanhã" nos cards.
3. **Conversão achado→task 2.0**: mini-form pré-preenchido (título da IA v2, prazo default, playbook sugerido por tipo com checklist, baseline numérico do relatório na descrição, link para o relatório); "criar todas" mantém caminho rápido.
4. **Dedup cross-report + reincidência**: achado igual a task aberta → não duplica; igual a concluída → cria com badge "Reincidente" + comentário linkando a anterior.
5. Fila de revisão com contexto: link p/ detalhe, prioridade, "aguardando há Xd".
6. **"Meu dia" do analista**: faixa consolidada cross-org (Atrasadas N · Vencem 7d N · Em revisão N · Sem atividade 14d N) com listas deep-link; carteira ordenada por criticidade.
7. **Cobrança de prazos**: detector no cron diário (vence em 2d → cliente; venceu → cliente+analista, dedup) + **digest semanal por org** ("3 concluídas ✅, 2 atrasadas ⚠️" + vendas do mês).
8. Card kanban rico: prazo, checklist "2/5", contagem de comentários; ordenar coluna por prioridade+prazo.
9. Mover sem fricção: select "Mover para…" (1 clique p/ qualquer transição válida), `useOptimistic`, toast de erro nos fire-and-refresh.
10. Notificar analista de task/conversão criada pelo cliente; fallback p/ admin quando org sem analista; nav do admin ganha "Carteira"; playbooks com prioridade+prazo_dias; fix template desativado (erro em vez de placeholder).
11. **Painel de impacto p/ renovação** (admin/consultoria + carteira): por org, faturamento e score do 1º vs último relatório + tasks concluídas no intervalo; impacto por task estendido a tasks sem report (baseline = done mais próximo).
12. Timeline com autor + label 'assignee'; bell "ver todas" (página paginada); empty state do kanban com CTA pro relatório.

### G4 — Polimento Cinematográfico & A11y — ~10 tasks
1. **Primitivo `Dialog` único** (focus-trap, inert, scroll-lock, restore, AnimatePresence) → refatorar ConfirmDialog, ⌘K, popover do sino.
2. Navegação `<Link>` em todo o app + `template.tsx` com fade+lift `EASE_TRUTH` por área + skeletons nas rotas faltantes.
3. **PageHeader compartilhado** (eyebrow Space Mono + título Sora + gradient) nas 3 áreas + motion (stagger/Reveal) em analista/admin.
4. Toast v2 (timers limpos, pausa hover, erro persistente, slot "Desfazer").
5. Focus ring padronizado (`ring-2 ring-brand/60`) + erros de auth com `Alert` + touch targets ≥40px + skip-link + textarea com label + aria dos charts.
6. Labels pt-BR no admin (status/plano) + tabela alinhada (TR/TD do DS) + comparar-form com primitivos DS + nav ativa (`aria-current`) + nav por papel (sem links quebrados p/ analista/admin) + Ctrl+K por plataforma + ⌘K com comandos faltantes.
7. `ease-truth` nos primitivos + hover-lift no Card + ScoreGauge animado 0→score + glow 3 camadas nos momentos certos.
8. Landing cinematográfica (count-up real, mock do dashboard com glow, marquee, CTA glow) + metadata por página.
9. Higiene: `dim` rebaixado (#8b8b94), tokens vermelho/amarelo unificados, Tooltip/Dropdown adotados de verdade (Dropdown controlado no sino) ou removidos, LazyMotion + dynamic imports dos charts.
10. Micro-fixes: PDF 404 content-type, `brl()` milhar, stat 50 → count(), query dupla do dashboard, SUM no SQL, N+1 carteira, requeue 23505, escapeHtml pipeline template, checklist toggle atômico, aguardando redirect quando ativa + copy suspensão.

### G5 (opcional) — Conta & Confiança — ~5 tasks
`/configuracoes` (trocar senha, nome da empresa), 2º usuário por org (convite), páginas /termos + /privacidade + aceite no signup, admin/analista gerenciam produtos monitorados do cliente, runbook onboarding-cliente.md.

**Fora do escopo (já planejado em F3b/F3c):** multi-marketplace de vendas, monitor de ranqueamento, radar de concorrentes, qualidade de catálogo, chat IA, HITL, simulador de margem. **Fora também:** upgrade React 19/Next 15 (fase própria futura).

## 5. Ordem recomendada e dependências

**G0 → G1 → G2 → G3 → G4 (→ G5)**. G0 primeiro porque G1/G2 exibem dados que precisam ser verdadeiros (meta viva, alertas honestos, janela BRT correta) — polir mentira é pior que não polir. G1 antes de G2 porque o dashboard reusa as métricas v2/IA v2. G3 depende do schema IA v2 (G1) para a conversão 2.0. G4 é transversal e pode intercalar. Custo IA pós-G1: ~US$0,15–0,35/relatório (prompt 5-10× mais rico) — irrelevante vs valor.

## 6. Operacional pendente (dono, fora do código)

1. **Decidir merge da F3a** (pré-requisito da base) + migration 0007 no Neon MAIN antes do deploy + CRON_SECRET conferido.
2. **RESEND_API_KEY + EMAIL_FROM + domínio verificado (DKIM)** — sem isso o produto não fala com o cliente (P0-4).
3. SERPAPI_KEY (opcional, melhora benchmark — o fix P0-7 remove a punição de não tê-la).
4. Homologação do app Bling (bloqueia terceiros); domínio próprio.
