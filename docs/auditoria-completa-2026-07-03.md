# Auditoria Completa + Propostas — Truth Analytics (2026-07-03)

Auditoria em 4 dimensões (arquitetura/código, segurança, performance/escalabilidade, UX/produto) feita por agentes independentes sobre `master` (b340460), + análise da identidade do truthcommerce.com.br para a proposta visual.

---

## 1. VEREDITO GERAL

O código é **maduro e disciplinado**: zero TODO/FIXME/`any`, `strict: true`, 188 testes, multi-tenancy sem IDOR, criptografia correta, contratos Zod nas fronteiras. A dívida NÃO é de desleixo — é de **maturidade de produção**: o pipeline roda síncrono numa Server Action (timeout garantido), não há agendamento (produto "periódico" 100% manual), o dashboard de "análise" não tem um único gráfico, e o admin é cego para a operação.

---

## 2. PONTOS FORTES (confirmados com evidência)

1. **Multi-tenancy correto em 100% dos sites de query** — `orgId` sempre vem da sessão, nunca do input; `getReportById(reportId, orgId)` com `and()`; sem IDOR (`report.repository.ts:49-58`).
2. **Autorização em camadas**: middleware = checagem barata do JWT; toda página/action re-consulta o banco (`getUserAccessById`). Nenhuma rota admin esquecida.
3. **Cripto correta**: AES-256-GCM, IV aleatório 12 bytes por operação, auth tag verificada, chave validada 32 bytes (`crypto.ts`).
4. **Sem XSS/SQLi**: zero `dangerouslySetInnerHTML`; output do Claude renderizado como JSX auto-escapado; Drizzle 100% parametrizado.
5. **CSRF OAuth robusto**: state 16 bytes em cookie httpOnly/secure, deletado no callback.
6. **Rate-limit de login com defesa contra rotação de XFF** (5/15min por IP + 20/15min por e-mail).
7. **Pipeline com boas decisões**: `Promise.allSettled` Bling ∥ mercado, `benchmarkParcial` gracioso, `finalize` transacional (done + trava atômicos), upsert idempotente de pedidos, e-mail best-effort que nunca quebra o negócio.
8. **Métricas como funções puras testáveis** (`compute-metrics.ts`, 468 linhas de teste).
9. **Chamada Claude moderna e correta** (`output_config.format` json_schema, thinking adaptive, retry + Zod).
10. **Identidade visual coesa**: tokens em camadas, Sora/Inter/Space Mono, foco visível padronizado, AppShell mobile acessível.
11. **Next 14.2.35** — já corrige CVE-2025-29927 (bypass de middleware).

---

## 3. ACHADOS CRÍTICOS (corrigir ANTES de escalar)

### C1 — Pipeline síncrono na Server Action → timeout Vercel → relatório preso em `running`
`reports.actions.ts:40` + `orchestrator.ts:37-124`. Sem `vercel.json` nem `maxDuration`. Limite default (10–15s) vs pipeline de minutos (Bling paginado + mercado + Claude Opus 16k). A função morre ANTES do `catch` → report órfão em `running` para sempre. Sem watchdog, sem retomada, sem reaper.
**Fix:** background durável (Vercel Workflow/QStash/cron+fila) OU no mínimo `maxDuration=300` + watchdog que marca `running > N min` como `failed` + coluna de progresso por etapa.

### C2 — Coleta de mercado 100% sequencial
`collect-market.ts:21-47`: 3 loops aninhados com `await` serial. Plano monthly = 30 produtos × keywords × 2 provedores = até **180 chamadas HTTP em série** (180–540s) + 180 INSERTs individuais.
**Fix:** `Promise.allSettled` com p-limit 5–8 + bulk insert.

### C3 — Sem lock de idempotência: duplo clique = 2 pipelines = 2× custo Claude
A trava só é escrita no `finalize` (minutos depois). Duas abas/retry passam ambas em `podeGerar`.
**Fix:** constraint parcial única "1 report running por org" ou `pg_advisory_xact_lock(hash(orgId))`.

### C4 — Segurança de segredos (ALTO)
`.env.local` com credenciais vivas; **mesma senha Neon em prod e teste**; `ANTHROPIC_API_KEY` ativa.
**Fix:** rotacionar tudo + credenciais distintas por ambiente. ⚠️ ANTES de rotacionar `ENCRYPTION_KEY`, implementar versionamento de chave (payload `keyId.iv.tag.ct`) — senão TODOS os tokens Bling em repouso viram `decrypt_failed`.

### C5 — Sem "esqueci minha senha"
Nenhuma rota/action. Cliente que esquece a senha fica permanentemente travado (bcrypt irreversível).

---

## 4. GARGALOS DE ESCALA (onde quebra primeiro)

- **1 cliente com catálogo real (HOJE):** timeout (C1+C2). Ponto de ruptura imediato.
- **~50 clientes:** custo Claude Opus sem teto (`effort:high` + `max_tokens:16000`, retry refaz a chamada inteira) + conexões Neon (pool default max:10 por instância serverless, sem `idle_timeout`).
- **~200 clientes:** exaustão de conexões; `market_snapshots.dados` guarda o payload BRUTO inteiro das APIs (dezenas de KB × produto × keyword × provedor × ciclo, sem TTL) → storage explode.
- **~1000 clientes:** modelo inviável sem fila + workers + cron.

**Ordem de correção:** C1 → C2 → C3 → pool (`max:1` + idle_timeout) → custo/storage (Sonnet p/ maioria + prompt caching + podar `bruto`) → cron.

## 5. DÍVIDAS MÉDIAS

- **Sem cron/agendamento** — produto vendido como "relatórios periódicos" é 100% manual (M3).
- **Providers hardcoded em Bling** — interface `ConnectionProvider` existe, mas `connection.repository.ts:12` fixa `PROVIDER='bling'` e o orquestrador chama `collectBlingOrders` direto. Multi-marketplace exige generalizar o wiring.
- **Enums como varchar livre** (status/plano/role/provider/fonte) — sem pgEnum/CHECK.
- **next-auth 5.0.0-beta.4** (beta antigo; traz `cookie@0.6.0` com CVE-2024-47764).
- **`next.config.mjs` vazio** — sem CSP, HSTS, X-Frame-Options.
- **Índices faltando:** `orders(org_id, data)` p/ computeMetrics; `audit_log` sem índice nem retenção; `login_attempts` sem índice por ip.
- **`listReports` = SELECT * sem limit** — puxa jsonb gigante de todos os relatórios e descarta.
- **Bling 429 = falha dura** — qualquer não-2xx aborta o relatório inteiro, sem backoff/Retry-After; paginação acumula tudo em RAM.
- **Sem observabilidade**: só console.log; sem Sentry, request-id, métricas, health check, dashboard de custo IA.
- **Sem verificação de e-mail; signup sem rate-limit; enumeração de e-mail no cadastro.**
- **Data do pedido Bling sem timezone explícito** — pode deslocar dia na evolução.
- **Erro da IA vira `analise_ia_invalida` genérico** — motivo real só no console.

## 6. FALTAS DE UX/PRODUTO (por impacto)

**Crítico:** geração bloqueante sem progresso/polling; dashboard de análise SEM GRÁFICOS (evolução temporal em tabela!); admin cego (não vê relatórios, saúde de conexões, não reprocessa); sem esqueci-senha.
**Alto:** onboarding inexistente; `/aguardando` é beco sem saída (sem logout, sem contato, sem SLA); ações destrutivas sem confirmação; erro técnico cru exposto ao cliente; sem export PDF/CSV; sem comparativo de períodos.
**Médio:** empty states só texto; sem skeleton; contraste `#888` abaixo de AA; tabelas apertadas no mobile; sem perfil/config; sem notificações in-app; sem gestão de usuários por org; `PlanoSelect` duplica `Select.tsx`; cores semânticas não tokenizadas.
**Componentes faltantes (prioridade):** Chart, Toast, Modal/confirm, Skeleton, EmptyState, Alert, Progress/Steps, PeriodSelector, Dropdown/UserMenu, Tabs, Tooltip, Pagination.

---

## 7. PROPOSTA: NOVAS IDEIAS (mesma intenção do produto)

1. **Agendamento automático** (Vercel Cron + fila): relatório gera sozinho no ciclo do plano e chega por e-mail — cumpre a promessa "periódico" e resolve M3.
2. **Multi-marketplace de VENDAS** (hoje "multi-marketplace" é só benchmark): conectar Mercado Livre, Shopee, Amazon como fontes de pedidos via `ConnectionProvider` generalizado. Visão unificada de canais.
3. **Truth Score** — score 0–100 de saúde da operação (mix de crescimento, margem, posição de preço, diversificação de canal, ruptura). Número único que o cliente acompanha e a consultoria melhora. Vira o herói do dashboard.
4. **Alertas proativos (inteligência contínua)**: queda anômala de vendas, concorrente baixou preço abaixo do seu, produto sem venda há N dias → e-mail/in-app imediato, sem esperar o ciclo.
5. **Monitor de ranqueamento** — posição dos produtos monitorados na busca do ML ao longo do tempo (alinha com o serviço "Estratégia de Ranqueamento em Marketplace" da agência).
6. **Pergunte ao Analista (chat IA)** — chat sobre os dados do próprio cliente ("por que setembro caiu?"), usando as métricas já computadas como contexto. Custo baixo (Sonnet/Haiku).
7. **Export PDF branded** do relatório — o deliverable físico da consultoria, com a identidade Truth.
8. **Comparativo entre períodos** + metas (definir meta mensal, acompanhar % no dashboard).
9. **Human-in-the-loop**: relatório IA nasce como rascunho; analista revisa/edita/aprova antes de liberar ao cliente → diferencial "assessoria", não "robô".
10. **Cobrança** (Stripe/Pagar.me): assinatura por plano, gate automático de inadimplência.

## 8. PROPOSTA: CRM COMPLETO DE CONSULTORIA (novo módulo)

**Conceito-chave: o relatório vira PLANO DE AÇÃO.** Cada gargalo/sugestão da análise IA pode virar task com 1 clique (ou automaticamente). O analista de marketplace gerencia a carteira; o cliente executa e acompanha. Fecha o loop diagnóstico → ação → resultado medido no próximo relatório.

### Modelo de dados (novas tabelas)
- `tasks`: org_id, título, descrição, tipo (catalogo/preco/anuncio/logistica/conta/outro), prioridade, status (backlog → todo → em_andamento → em_revisao → concluida), prazo, criado_por (analista|cliente|ia), report_id? (origem), assignee (analista ou cliente), ordem kanban.
- `task_comments`: thread por task, autor, menções.
- `task_activities`: timeline de eventos (status, prazo, atribuição) — reusa o padrão `audit_log`.
- `task_templates` (playbooks): "Otimizar título ML", "Cadastrar EAN", "Ajustar frete", com checklist padrão.
- `users.role` ganha `analista` (entre admin_truth e client); `organizations.analista_id` (dono da conta).

### Telas
- **Cliente** — "Plano de Ação" no dashboard: kanban/lista das suas tasks, marca como concluída (vai p/ revisão do analista), comenta, anexa evidência.
- **Analista** — `/analista`: visão carteira (todas as suas orgs), kanban por cliente, fila "aguardando revisão", SLA/atrasadas, criar task de template, converter achado do relatório em task.
- **Admin** — atribuição de carteira, métricas da consultoria: tasks concluídas/semana, tempo de resposta, IMPACTO (venda antes/depois da task — dado que já existe via pipeline!).

### Regras
- Notificações e-mail + in-app (nova task, comentário, mudança de status, prazo).
- Multi-tenancy idêntico ao atual (org_id da sessão); analista só vê orgs da sua carteira.
- Auditoria total (reusa `audit.repository`).

## 9. PROPOSTA VISUAL — "EXPERIÊNCIA TRUTH" (dinâmica do truthcommerce.com.br)

DNA extraído do site: dark `#040507`/`#0a0c10`, verde `#07dd2b` com glow em 3 camadas (`4d/33/1f`), bordas vidro `#ffffff0f`, muted `#a1a1aa`, Sora/Inter/Space Mono, **GSAP ScrollTrigger**, marquee infinito, easing assinatura `cubic-bezier(.16,1,.3,1)`. O app já tem os tokens certos — o que falta é **MOVIMENTO, PROFUNDIDADE e DADOS VIVOS**.

1. **Motion system** (Framer Motion ou GSAP): entrada staggered de cards, count-up nos números (Space Mono), transições de página com fade+lift, tudo no easing `.16,1,.3,1`. `prefers-reduced-motion` respeitado.
2. **Geração de relatório = momento "wow"**: em vez de spinner, um **stepper cinematográfico em tempo real** (Conectando ao Bling → Coletando pedidos → Varrendo o mercado → IA analisando → Finalizando), com progresso vindo do pipeline em background (polling da coluna de etapa). Transforma o pior atrito de hoje na assinatura do produto.
3. **Dashboard bento grid**: Truth Score como hero (gauge circular com glow), sparklines nos stats, line chart de evolução com gradiente verde neon → transparente, donut de canais. Recharts com theming custom (grid `#ffffff0f`, tooltip glass).
4. **Glassmorphism em camadas**: superfícies translúcidas + `backdrop-blur`, glow verde sob os CTAs e no card ativo.
5. **Relatório como experiência editorial**: hero com score e período, seções com scroll-reveal, números destacados em Space Mono, recomendações em cards com prioridade colorida, TOC lateral fixa.
6. **Command palette (⌘K)**: navegar, gerar relatório, buscar produto — sensação de ferramenta pro.
7. **Micro-interações**: skeleton shimmer verde, toasts glass no canto, confirm modals com blur do fundo, checkbox de task com animação de conclusão (stroke animado).
8. **Marquee de insights** no topo do dashboard (últimos achados/alertas), eco do marquee do site institucional.
9. **Acessibilidade**: corrigir contraste `#888`→`#a1a1aa` mínimo, `role=alert` nos erros, `aria-live` no stepper.

## 10. ROADMAP SUGERIDO

- **Fase 0 — Fundação de produção (1 semana):** C1 background+watchdog, C2 paralelizar, C3 lock, pool serverless, esqueci-senha, rotação de segredos (com versionamento de chave), headers de segurança, índices.
- **Fase 1 — Experiência (1–2 semanas):** charts + bento dashboard, stepper de geração em tempo real, motion system, toasts/modals/skeletons, onboarding + fix `/aguardando`, admin operacional (ver relatórios/conexões/reprocessar), export PDF.
- **Fase 2 — CRM consultoria (2 semanas):** tabelas + role analista, kanban cliente/analista, relatório→task, notificações, métricas de impacto.
- **Fase 3 — Crescimento:** cron automático, Truth Score, alertas proativos, multi-marketplace vendas (ML primeiro), chat IA, cobrança.
