# Programa H — Expansão de Valor: Dados, Painéis e CRM Jira-like

**Data:** 2026-07-16
**Status:** Design aprovado pelo dono (brainstorming completo, 3 seções aprovadas)
**Base:** `master` HEAD `5cfb4d7` (contém programas F0–F3a e G0–G5 completos)
**Execução prevista:** Opus 4.8 subagent-driven (implementer → review por task → fix loops → revisão ampla por bloco → merge `--no-ff`), mesmo modelo dos programas F e G.

---

## 1. Contexto e objetivo

O Truth Analytics tem MVP + programas F (produção/experiência/CRM/automação) e G (qualidade total) completos em `master`. O dono trouxe 7 demandas de expansão de valor, com ênfase máxima nos painéis de analista e admin. Este spec consolida o design aprovado de todas elas como o **Programa H**, decomposto em 6 blocos sequenciais + 1 fusão com a fase F3b já planejada.

**Demandas originais → blocos:**

| Demanda do dono | Bloco |
|---|---|
| 1. Cor específica por marketplace nos canais de venda | **H0** |
| 4. Estoque de produtos mais vendidos e críticos (Bling) | **H1** |
| 3. Aba de sugestão de kits com produtos do cliente | **H2** |
| 5. Calendário sazonal com datas + sugestões por nicho | **H3** |
| 6. Painel do analista 3x mais completo + painel admin com controle total | **H4** |
| 7. Plano de execução estilo Jira | **H5** |
| 2. Métricas de ADS (relatório do Mercado Livre) | **H6 → fundido na F3b revisada** |

**Ordem aprovada:** H0 → H1 → H2 → H3 → H4 → H5 → F3b+Ads.
**Justificativa:** o painel do analista (H4) nasce já alimentado pelos dados novos (estoque, kits, calendário) — evita retrabalho. ADS por último por depender de conexão OAuth ML por cliente (território F3b).

---

## 2. Decisões travadas (2026-07-16, via brainstorming com o dono)

1. **Ordem:** dados primeiro, painéis depois, CRM Jira em seguida; ADS fundido na F3b.
2. **Criticidade de estoque:** cobertura em dias (saldo ÷ velocidade de venda 30d). Crítico < 7 dias; atenção < 15; sem venda em 30d = "parado".
3. **Kits:** candidatos por co-ocorrência real nos pedidos + alto giro; IA transforma em kits vendáveis (nome, preço sugerido, argumento, canal).
4. **Nicho do cliente:** IA infere a partir de produtos/pedidos; campo editável por analista/admin.
5. **Painel analista:** 4 pilares — visão 360 por cliente, command center da carteira, inteligência comparativa, pautas IA de consultoria.
6. **Painel admin:** 4 blocos — visões do analista sem filtro de carteira (+corte por analista), centro de operações, gestão completa de contas, impersonation read-only auditado.
7. **CRM Jira:** hierarquia épico→task→subtask (tabela única, `parent_id`+`nivel`), ticket completo (labels, watchers, menções, markdown leve), board turbinado (filtros, DnD real, inline edit, swimlanes, SLA no card), ciclos/sprints com burndown e retrospectiva de impacto.
8. **ADS ML:** viabilidade confirmada na API Mercado Ads (impressões, cliques, CTR, custo, CPC, ACOS, ROAS, vendas diretas/indiretas; janela 90d; OAuth 2.0 da conta do vendedor). Entra como módulo da F3b revisada — a conexão ML é construída UMA vez para vendas + ads.
9. **Custo IA (transversal):** nenhuma geração por page-view. Kits, nicho, pautas e recomendações de calendário são persistidos e regenerados por ciclo (pipeline ou cron), sempre registrados em `ia_usage`.

---

## 3. Blocos

### H0 — Cores por canal (quick win, ~2 tasks)

- Módulo puro `src/lib/canal-visual.ts`: normaliza o texto livre de `orders.canal` (origem: `canal.descricao` do Bling — ex. "Shopee", "Mercado Livre", "Nuvemshop") → categoria → cor.
- Mapa: `shopee` → laranja `#EE4D2D`; `mercado_livre` → amarelo `#FFE600` (com texto escuro por contraste WCAG); `loja_virtual` (Nuvemshop, Tray, Loja Integrada, site próprio) → azul `#3B82F6`; `outro` → neutro do design system.
- Aplicar em TODOS os pontos onde `porCanal` renderiza: gráficos do dashboard (donut/séries), badges, tabelas de métricas, página comparar, PDF.
- Sem migration. Testes unitários do normalizador (variações de grafia, canal desconhecido).

### H1 — Estoque Bling (~8 tasks)

- **Provider:** `fetchStock()` na interface `ConnectionProvider` + implementação Bling v3 (endpoints de produtos/saldos), respeitando rate-limit/backoff existentes.
- **Schema:** tabela `product_stock` (org_id, sku, nome, saldo, updated_at, unique org+sku) + snapshot leve diário para tendência (pode ser coluna jsonb de histórico curto ou tabela `product_stock_snapshots` — decidir no plano).
- **Motor puro `stock-coverage.ts`:** cobertura em dias = saldo ÷ velocidade média de venda 30d (calculada de `orders.itens`). Classificação: crítico < 7d, atenção < 15d, ok, parado (zero venda 30d com saldo > 0).
- **Cron:** sync diário via GitHub Actions (`crons.yml`), junto do `sincronizar-pedidos`; heartbeat para o centro de operações (H4).
- **UI:** página `/dashboard/estoque` (ranking mais vendidos × cobertura, badges de estado, busca) + card resumo no dashboard.
- **Alertas:** novo detector `estoque_critico` no motor F3a (dedup por tipo|sku, mesmo padrão dos existentes).

### H2 — Kits sugeridos (~7 tasks)

- **Motor puro `market-basket.ts`:** co-ocorrência de SKUs em `orders.itens` (suporte e confiança mínimos parametrizados) + produtos de alto giro → lista de candidatos com evidência ("comprados juntos em N pedidos").
- **IA:** 1 chamada Claude por ciclo — candidatos + catálogo → kits com nome comercial, composição, preço sugerido (desconto ancorado no ticket real dos itens), argumento de venda, canal recomendado. Structured output (mesmo padrão do pipeline), registrado em `ia_usage`.
- **Schema:** tabela `kit_suggestions` (org_id, ciclo/report_id, payload jsonb, status: sugerido | virou_task | descartado, created_at).
- **UI:** aba `/dashboard/kits` — cards com "por que este kit" (evidência real) + ações: **virar tarefa** (reusa fluxo CRM; task tipo catálogo/anúncio) e descartar.
- Geração acoplada ao fim do pipeline (após finalize, best-effort — nunca quebra o relatório).

### H3 — Calendário sazonal (~7 tasks)

- **Fonte:** `src/lib/calendario-comercial.ts` já existente (datas fixas + móveis BR com dicas) é promovido a fonte de UI.
- **Schema:** coluna `organizations.nicho` (varchar, nullable) — **inferida por IA** no primeiro pipeline após o deploy (a partir de produtos/pedidos), **editável** por analista/admin na página da org.
- **UI:** página `/dashboard/calendario` — timeline dos próximos 90 dias com datas comerciais, dica geral e **recomendações IA por nicho** usando produtos reais do catálogo ("para Volta às Aulas, empurre X e Y; monte o kit Z").
- Recomendações persistidas por ciclo (tabela `calendar_suggestions` ou payload no relatório — decidir no plano), nunca geradas por page-view.
- **Ação:** "virar tarefa" com prazo = data comercial (entra no CRM com SLA; preparação sugerida com antecedência — ex. 21 dias antes).

### H4 — Painéis do Analista e do Admin (~15 tasks)

**Princípio:** camada de leitura dedicada (`src/modules/analista/` expandida + `src/modules/admin/`), escopo explícito em toda query (carteira via `organizations.analista_id`; admin via `requireAdmin`). Painel do cliente NÃO muda nesta fase.

**Analista:**
1. **Command center** (`/analista` reconstruída): KPIs agregados da carteira (faturamento mês, variação, tasks abertas/atrasadas, relatórios pendentes) + fila "Atenção hoje" — ranking por **score de risco** composto (função pura; insumos: queda de vendas, token Bling expirado/expirando, relatório atrasado/falho, SLA estourado, estoque crítico, meta em risco). Cada linha com ação direta.
2. **Visão 360 por cliente** (`/analista/[orgId]` reconstruída): tudo que o cliente vê (REUSA componentes de charts existentes — zero fork) + camadas exclusivas: tendência por produto/canal entre ciclos, histórico completo do Truth Score, estoque com cobertura (H1), kits e status (H2), nicho/calendário (H3), linha do tempo de alertas, tasks com impacto medido.
3. **Inteligência comparativa** (`/analista/comparativo`): quadrantes crescimento×volume da carteira, agrupamento por nicho (H3), ranking de canais, "o que funcionou" — tasks de alto impacto em clientes semelhantes sugeridas como replicáveis (cria task pré-preenchida no outro cliente).
4. **Pauta IA de consultoria:** 1 chamada Claude por cliente por ciclo, persistida em `analyst_briefings` (org_id, report_id, payload, created_at): prioridades da semana, argumentos para reunião, riscos. Gerada no fim do pipeline, best-effort.

**Admin:**
1. **Visão global:** command center + comparativo sem filtro de carteira, com corte por analista (impacto gerado, SLA, clientes em risco por carteira).
2. **Centro de operações** (`/admin/operacoes`): expande `system-status` — última execução de cada cron (heartbeat via endpoint autenticado por `CRON_SECRET`), fila/estado de relatórios com reprocessar, custo IA por org e total/mês (lê `ia_usage`), conexões Bling de todas as orgs (dias até expirar token), visualizador de `audit_log` com filtros.
3. **Gestão completa de contas** (`/admin/[orgId]` expandida + `/admin/usuarios`): CRUD de usuários de qualquer org, reset de senha via fluxo esqueci-senha existente (NUNCA exibe senha), trocar plano, gerenciar analistas e transferir carteiras em lote. Tudo auditado.
4. **Impersonation** ("ver como cliente"): claim `impersonating_org_id` na sessão via helpers `UserAccess` (não truque de cookie), **somente leitura** (mutações de cliente bloqueadas durante impersonation), banner fixo "Você está vendo como [org] — sair", início/fim gravados em `audit_log`.

**Invariantes de segurança:** toda query nova filtra carteira ou exige `requireAdmin`; teste de acesso cruzado (analista fora da carteira → 404) por task; impersonation read-only + auditado + expira com a sessão.

### H5 — CRM estilo Jira (~13 tasks)

- **Hierarquia:** `tasks.parent_id` (auto-FK) + `tasks.nivel` (`epico | task | subtask`, 3 níveis fixos). Épico agrega progresso das filhas (contagem/barra); subtask herda org/report do pai. Sem tabela nova de épicos.
- **Ticket completo:** detalhe da task vira ticket — descrição markdown leve (render seguro, sem HTML cru), labels (jsonb array + sugestões das já usadas na org), watchers (`task_watchers`: task_id, user_id — notificados in-app), menções `@usuário` em comentários (gera notificação), contador de SLA, links para relatório de origem e pai/filhas.
- **Board turbinado:** filtros combinados (responsável, prioridade, label, épico, texto), **drag-and-drop real com pointer events nativos** (sem lib nova — mantém decisão da F2; fallback `@dnd-kit` se inviável no plano), edição rápida inline no card (prioridade/responsável/prazo), swimlanes opcionais (por épico ou responsável), badge SLA (verde/amarelo/vermelho).
- **Ciclos (sprints):** tabela `cycles` (org_id, nome, inicio, fim, status) + `tasks.cycle_id`. Planejamento (arrastar do backlog), burndown simples (tasks abertas/dia), retrospectiva automática no fechamento: concluídas vs planejadas + impacto em venda (reusa motor de impacto F2) — "este ciclo moveu R$ X".
- Transições/permisões continuam respeitando `podeTransicionar` por papel (F2).

### H6 → F3b revisada — Multi-marketplace + ADS (~16 tasks, após H5)

- O plano F3b existente (`docs/superpowers/plans/`) será **revisado** antes da execução (regra de ouro: revalidar contra `master`), incorporando o módulo **Mercado Ads**:
  - Coleta: campanhas + métricas da API Mercado Ads — impressões (prints), cliques, CTR, custo, CPC, **ACOS**, **ROAS**, vendas diretas/indiretas/totais por publicidade; janela retroativa de 90 dias; header `Api-Version`; OAuth 2.0 da conta do vendedor (mesma conexão ML da F3b).
  - Persistência: tabela `ads_metrics` (histórico próprio além dos 90d da API).
  - UI: `/dashboard/ads` espelhando o relatório nativo do ML (investimento, retorno, ACOS por campanha, evolução).
  - Integração: métricas de ads no relatório IA, na visão 360 do analista e na visão global do admin.
- Fontes de viabilidade (verificadas 2026-07-16): developers.mercadolivre.com.br/en_us/product-ads-us-read; global-selling.mercadolibre.com/devsite/campaigns-ads-and-metrics.

---

## 4. Transversais

- **Migrations:** todas aditivas, numeradas 0012+; aplicadas no Neon MAIN **antes** do deploy de cada bloco (runbook do programa G).
- **Testes:** unit/integração (vitest, banco `test`) + E2E (playwright, testids preservados); revisão por task + revisão ampla por bloco; merge `--no-ff` por bloco; `master` sempre deployável.
- **Custo IA:** chamadas novas (kits, nicho, pauta, calendário) com structured output, registradas em `ia_usage`; estimativa +US$0,05–0,15/cliente/ciclo; visível no centro de operações.
- **Crons:** novas entradas no `crons.yml` (GitHub Actions): sync de estoque diário; gerações IA acopladas ao pipeline. Todo cron manda heartbeat exibido no centro de operações.
- **Rollout:** bloco a bloco. Pré-requisito operacional (fora deste escopo, já encaminhado): destravar o deploy Vercel — produção real (`truth-analytics.vercel.app`) vive na conta pessoal do dono; deploy do time empresa é bloqueado pelo plano Hobby (autor do commit sem acesso).
- **QA:** worktree `C:\Users\makfo\Projetos\truth-analytics-qa` (porta 3300, banco test) segue como ambiente de QA manual do dono.

## 5. Fora de escopo do Programa H

- F3c (assistente/chat) — plano próprio já existente, não iniciado.
- Cobrança/gateway (decisão de 2026-07-03: venda consultiva manual).
- Upgrade React 19 / next-auth estável.
- Mudanças no painel do CLIENTE além das abas novas (kits, estoque, calendário) e cores por canal — o dashboard do cliente foi reformado no G2.

## 6. Riscos e dependências

| Risco | Mitigação |
|---|---|
| Deploy Vercel travado (bloco atual) | Encaminhado fora deste programa: deploy pela conta pessoal (dona do domínio) ou upgrade Pro no time. Nenhum bloco H depende disso para ser DESENVOLVIDO, só para ir ao ar. |
| Endpoints de estoque Bling com formato/limite inesperado | Provider já tem backoff/retry; validar payload real no smoke do H1 com a conta Comercial Mattos. |
| DnD nativo (pointer events) complexo demais | Fallback aprovado: `@dnd-kit` (decisão final no plano do H5). |
| Custo IA crescer com 4 gerações novas por ciclo | Tudo por ciclo (não por view), registrado em `ia_usage`, monitorável no centro de operações; modelos menores (Sonnet/Haiku) via env se precisar. |
| API Mercado Ads exigir aprovação extra do app ML | Verificação fina na revisão da F3b (antes de codar); janela 90d cobre o histórico inicial. |

## 7. Estimativa

| Bloco | Tasks (≈) |
|---|---|
| H0 cores por canal | 2 |
| H1 estoque | 8 |
| H2 kits | 7 |
| H3 calendário | 7 |
| H4 painéis | 15 |
| H5 CRM Jira | 13 |
| **Subtotal Programa H** | **≈52** |
| F3b revisada + Ads | ≈16 (plano revisado na chegada) |

**Próximo passo:** plano de implementação do H0 via writing-plans (1 plano por bloco, como nos programas F/G).
