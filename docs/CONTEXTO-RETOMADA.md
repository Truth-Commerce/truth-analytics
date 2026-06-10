# Truth Analytics — Contexto para Retomada

**Última atualização:** 2026-06-10
**Status do projeto:** ⏸️ Design completo e aprovado em brainstorm — **aguardando aprovação da liderança da Truth Commerce** para iniciar o plano de implementação.

## O que é o projeto

SaaS da Truth Commerce para venda aos clientes: plataforma de **análise completa de métricas multi-marketplace/e-commerce**. Unifica dados de venda de todos os canais do cliente, coleta benchmark de mercado do nicho e gera por IA um relatório periódico com métricas, gráficos, resumo executivo, gargalos, sugestões de melhoria, ideias de venda e recomendações de precificação.

## Onde está tudo

| Artefato | Caminho |
|---|---|
| **Spec de design (fonte da verdade)** | `docs/superpowers/specs/2026-06-10-truth-analytics-design.md` |
| **PDF para a liderança** | `docs/pdf/2026-06-10-truth-analytics-design.pdf` |
| Template CSS do PDF | `docs/pdf/head.html` |
| Mockups/diagramas do brainstorm | `.superpowers/brainstorm/501-1781088495/content/` (welcome, architecture-options, data-model, pipeline-flow) |
| Repositório git | inicializado neste diretório, branch `master` |

## Decisões tomadas no brainstorm (10/06/2026)

Cada decisão foi feita pelo Matheus entre alternativas apresentadas:

1. **Ingestão de dados do cliente:** híbrido faseado — **Bling API v3 (OAuth)** como única integração do MVP (traz vendas de todos os canais que o cliente opera). APIs diretas de marketplaces ficam para fase 2.
2. **Dados de mercado/nicho:** **ML API pública + SerpAPI/DataForSEO** (cobertura Shopee, Amazon BR, Google Shopping). Cobertura multi-canal foi exigência explícita.
3. **Formato da análise:** **relatório periódico completo (formato A)** — pipeline inteiro roda só na frequência do plano; custo de IA previsível foi exigência explícita. Sem dashboard de sync diário, sem chat IA (candidatos a fase 2).
4. **Planos:** 7/15/30 dias entre relatórios (weekly/biweekly/monthly). Trava implementada por `proximo_relatorio_liberado_em` — **setada apenas no sucesso** (falha não consome o ciclo do cliente).
5. **Cobrança:** **manual no MVP** — venda consultiva; admin Truth ativa cliente e plano no painel interno. Stripe fica para self-service futuro.
6. **Stack:** **Next.js (App Router) + Vercel + Neon Postgres + Resend** (stack que o Matheus já domina, mesma do Zeneagrama).
7. **Orquestração do pipeline:** **Vercel Workflow (durable workflows)** — escolhido no diagrama visual em vez de cron+máquina de estados própria ou Inngest.
8. **IA:** Claude API (o Matheus editou o spec para "Claude ou OpenAI" — decidir provedor no plano), saída JSON estruturada validada com Zod.

## Resumo da arquitetura aprovada

- **6 módulos:** Auth & Contas (Auth.js, conta nasce inativa) · Painel Admin `/admin` (role `admin_truth`) · Conexões (OAuth Bling, tokens AES-256-GCM, `tracked_products` com keywords) · Pipeline de Relatório (5 steps duráveis) · Dashboard do Cliente (relatórios imutáveis, botão travado pelo plano) · Notificações (Resend).
- **8 tabelas:** organizations, users, connections, tracked_products, orders (upsert idempotente por `bling_order_id`), market_snapshots, reports (metricas + analise_ia em jsonb), audit_log. Multi-tenant por `org_id` em toda query.
- **Pipeline:** validação → Step 1 Coletar Bling ∥ Step 2 Coletar mercado → Step 3 Calcular métricas (SQL puro) → Step 4 Análise IA (dados mastigados, ~2-4 chamadas) → Step 5 Finalizar (salvar, travar ciclo, e-mail).
- **Erros:** Bling = falha dura; mercado = degradação graciosa ("benchmark parcial"); JSON inválido da IA = retry com erro no prompt; falha definitiva = e-mail ao admin.
- **Testes:** Vitest (métricas, trava de plano), integração com fixtures mockadas, Playwright E2E, TDD na implementação.

Detalhes completos no spec — este resumo não o substitui.

## Próximos passos (quando a liderança aprovar)

1. Retomar com Claude Code neste diretório (`Projetos/truth-analytics`) e pedir: *"a liderança aprovou o design do Truth Analytics, vamos criar o plano de implementação"*.
2. Claude deve invocar a skill **`superpowers:writing-plans`** usando o spec como insumo (era a task #8 pendente do brainstorm).
3. Pontos a resolver no início do plano:
   - Provedor de IA definitivo (Claude vs OpenAI) — o spec foi editado para deixar em aberto.
   - Criar conta/projeto: Neon, Resend, SerpAPI ou DataForSEO, app no portal de desenvolvedor do Bling (OAuth) — credenciais necessárias antes do código de integração.
   - Incorporar qualquer ajuste que a liderança pedir → editar o spec, regerar o PDF.

## Como regerar o PDF após editar o spec

```powershell
$dir = "C:\Users\makfo\Projetos\truth-analytics"
npx --yes marked --gfm -i "$dir\docs\superpowers\specs\2026-06-10-truth-analytics-design.md" -o "$dir\docs\pdf\body.html"
$full = (Get-Content "$dir\docs\pdf\head.html" -Raw) + (Get-Content "$dir\docs\pdf\body.html" -Raw -Encoding UTF8) + "</body></html>"
[System.IO.File]::WriteAllText("$dir\docs\pdf\full.html", $full, [System.Text.UTF8Encoding]::new($false))
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="$dir\docs\pdf\2026-06-10-truth-analytics-design.pdf" "file:///C:/Users/makfo/Projetos/truth-analytics/docs/pdf/full.html"
```
