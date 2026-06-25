<div align="center">

# 🚀 Truth Analytics

**Inteligência de marketplace para o seu e-commerce.**

Relatórios periódicos gerados por IA a partir do seu Bling — métricas de vendas consolidadas,
benchmark de preços de mercado e recomendações acionáveis de precificação.

[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Claude](https://img.shields.io/badge/IA-Claude%20Opus%204.8-D97757)](https://www.anthropic.com/)
[![Tests](https://img.shields.io/badge/tests-188%20unit%2Fint%20%2B%2010%20e2e-3FB950)](#-testes)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

</div>

---

## 📖 Visão geral

**Truth Analytics** é um SaaS multi-tenant da [Truth Commerce](https://truthcommerce.com.br) que unifica
as vendas de e-commerce via **Bling API v3** (que centraliza os marketplaces — Mercado Livre, Shopee,
Amazon, loja própria), coleta **benchmark de mercado** (Mercado Livre público + SerpAPI) e entrega ao
cliente um **relatório periódico completo gerado por IA** (Claude), conforme a frequência do seu plano
(7, 15 ou 30 dias).

Cada relatório inclui: resumo executivo, métricas por canal, evolução de vendas, top produtos,
posição de preço vs. mercado e **recomendações de precificação com justificativa** — saída estruturada,
validada com Zod.

> **Modelo de negócio:** venda consultiva. O admin ativa o cliente e define o plano pelo painel interno
> (sem gateway de pagamento no MVP).

## ✨ Funcionalidades

- 🔐 **Autenticação e multi-tenancy** — e-mail + senha (Auth.js v5 / bcrypt); todo dado é isolado por `org_id`.
- 🧑‍💼 **Painel administrativo** — ativar/suspender clientes, definir plano; rate-limit de login; auditoria.
- 🔌 **Conexões Bling (OAuth v3)** — cada cliente autoriza a própria conta Bling; tokens cifrados em repouso (AES-256-GCM) + refresh automático.
- 📊 **Pipeline de relatório** — orquestrador próprio: coleta Bling ∥ coleta mercado → métricas (SQL determinístico) → análise IA → finalização.
- 🤖 **Análise por IA (Claude)** — *structured outputs* validados por Zod, com re-tentativa automática.
- 📈 **Dashboard do cliente** — último relatório, histórico e visualização completa (o pipeline escreve, o dashboard só lê).
- ✉️ **Notificações (Resend)** — conta ativada, relatório pronto, falha de conexão Bling, falha de pipeline.
- 🎨 **Identidade visual da marca** — tema dark, verde neon, tipografia Sora / Inter / Space Mono.

## 🏗️ Arquitetura

```
┌──────────────┐   OAuth    ┌───────────────────────── Pipeline (orquestrador próprio) ─────────────────────────┐
│   Bling v3   │◀──────────▶│                                                                                    │
│ (por cliente)│  pedidos   │   coletar Bling  ∥  coletar mercado  →  métricas (SQL)  →  análise IA  →  finalizar │
└──────────────┘            │   (falha dura)      (degr. graciosa)     (determinístico)    (Claude/Zod)   (trava)│
┌──────────────┐  benchmark │                                                                                    │
│ ML / SerpAPI │───────────▶└──────────────────────────────────────────┬─────────────────────────────────────┘
└──────────────┘                                                        │ escreve
                                                                        ▼
       cliente  ──login──▶  Dashboard (RSC, só leitura)  ◀────────  reports / orders / market_snapshots  (Neon)
       admin    ──login──▶  Painel Admin                                 │
                                                                         ▼
                                                              Notificações (Resend)
```

**Princípios de design**
- **O pipeline só escreve; o dashboard só lê.** A única fronteira de escrita do fluxo de análise é a Server Action que dispara o pipeline.
- **Dados do cliente são sagrados:** Bling indisponível → falha dura e o ciclo do plano **não é consumido**. Mercado indisponível → degradação graciosa (`benchmarkParcial`).
- **Multi-tenancy em todas as camadas:** toda query filtra por `org_id`; o gating de acesso sempre reconsulta o banco (o JWT é só um retrato barato na borda).
- **Orquestrador próprio swappable:** steps são funções puras testáveis; trocar para um motor de workflow durável depois é trocar o orquestrador, não reescrever os steps.

## 🧰 Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14 (App Router) · React 18 · TypeScript 5 |
| Estilo | Tailwind CSS 3 · `next/font` (Sora / Inter / Space Mono) |
| Banco | PostgreSQL ([Neon](https://neon.tech)) · Drizzle ORM · `postgres` (postgres-js) |
| Auth | Auth.js v5 (`next-auth`) · CredentialsProvider · bcrypt |
| IA | [Claude](https://www.anthropic.com/) (`@anthropic-ai/sdk`, Opus 4.8) · structured outputs · Zod |
| Integrações | Bling API v3 (OAuth) · SerpAPI / Mercado Livre público · Resend |
| Cripto | AES-256-GCM (tokens OAuth em repouso) |
| Testes | Vitest (unit/integração) · Playwright (E2E) |
| Deploy | Vercel |

## 📂 Estrutura do projeto

```
src/
├─ app/                       # rotas (App Router)
│  ├─ (auth)/                 # sign-in, sign-up
│  ├─ (client)/               # dashboard, conexões, relatórios, aguardando
│  ├─ admin/                  # painel administrativo
│  └─ api/                    # auth + callbacks OAuth Bling
├─ components/ui/             # design system (Button, Card, Table, Badge, …)
├─ db/                        # schema Drizzle + migrations
├─ modules/                   # domínios
│  ├─ auth/  admin/  connections/  tracked-products/
│  ├─ pipeline/               # steps + orquestrador + contratos Zod
│  ├─ market/                 # provedores de benchmark
│  ├─ reports/                # camada de leitura (dashboard)
│  └─ notifications/          # e-mail (Resend)
├─ actions/                   # Server Actions
└─ lib/                       # env (Zod), helpers, crypto
tests/  ├─ unit/  ├─ integration/  └─ e2e/
docs/   └─ superpowers/plans/ # planos de implementação
```

## 🚀 Começando

### Pré-requisitos
- **Node.js 20+**
- Um banco **PostgreSQL** (recomendado: [Neon](https://neon.tech), com um branch dedicado de testes)
- Chaves (opcionais para subir, necessárias em produção): Anthropic, Bling, SerpAPI, Resend

### Instalação

```bash
git clone https://github.com/Truth-Commerce/truth-analytics.git
cd truth-analytics
npm install
```

### Variáveis de ambiente

Crie um `.env.local` na raiz (veja `.env.example` para a lista completa):

```dotenv
# Banco (produção)
POSTGRES_URL=postgres://...
POSTGRES_URL_DIRECT=postgres://...
# Banco de TESTES (branch dedicado — nunca produção)
DATABASE_URL_TEST=postgres://...
DATABASE_URL_TEST_DIRECT=postgres://...

# Auth & cripto
AUTH_SECRET=...                 # openssl rand -base64 32
ENCRYPTION_KEY=...              # 32 bytes em base64
APP_URL=http://localhost:3000

# IA (Claude)
ANTHROPIC_API_KEY=sk-ant-...
ANALYSIS_MODEL=claude-opus-4-8  # opcional (default)

# Integrações (opcionais)
BLING_CLIENT_ID=...
BLING_CLIENT_SECRET=...
BLING_REDIRECT_URI=http://localhost:3000/api/connections/bling/callback
SERPAPI_KEY=...
RESEND_API_KEY=...
EMAIL_FROM=...
ADMIN_ALERT_EMAIL=...
```

### Banco de dados

```bash
npm run db:generate   # gera migrations a partir do schema (quando houver mudança)
npm run db:migrate    # aplica as migrations
npm run db:seed-admin # cria o 1º admin (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD no .env.local)
```

### Rodar

```bash
npm run dev           # http://localhost:3000
```

## 🧪 Testes

Os testes de integração/E2E rodam **somente** contra o branch Neon de testes (blindagem em `tests/setup.ts` e `playwright.config.ts`) — **nunca** contra produção.

```bash
npm run test        # unit + integração (Vitest)
npm run test:e2e    # end-to-end (Playwright)
npm run typecheck   # TypeScript
npm run lint        # ESLint
```

> Suíte atual: **188 testes** unit/integração + **10 testes E2E** verdes.

## 📜 Scripts

| Script | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build de produção / servir |
| `npm run lint` / `npm run typecheck` | Lint / checagem de tipos |
| `npm run test` / `npm run test:watch` | Testes unit/integração |
| `npm run test:e2e` | Testes end-to-end |
| `npm run db:generate` / `db:migrate` | Migrations (Drizzle) |
| `npm run db:seed-admin` | Seed do 1º administrador |

## ☁️ Deploy (Vercel)

1. Importe o repositório na Vercel (detecção automática de Next.js).
2. Configure as **Environment Variables** de produção (use o banco `main`; **não** inclua as `DATABASE_URL_TEST*`).
3. Após o primeiro deploy, defina `APP_URL` e `BLING_REDIRECT_URI` com o domínio gerado e faça **redeploy**.

## 🔒 Segurança

- Tokens OAuth do Bling **cifrados em repouso** (AES-256-GCM); a senha do Bling do cliente nunca é vista.
- Senhas de usuário com **bcrypt** (cost 12).
- Isolamento **multi-tenant** por `org_id` em todas as consultas.
- Segredos **fora do versionamento** (`.env.local` no `.gitignore`).
- Rate-limit de login contra força bruta e rotação de cabeçalhos.

## 🗺️ Status

MVP **completo de ponta a ponta** (Fundação → Admin → Conexões → Pipeline+IA → Dashboard → Notificações → UI).
Próximos passos: smoke real com conta Bling de produção e deploy.

## 📄 Licença

Distribuído sob a licença **MIT**. Veja [`LICENSE`](./LICENSE).

---

<div align="center">
<sub>Feito com ☕ pela <strong>Truth Commerce</strong> — Agência de Inteligência para E-commerce.</sub>
</div>
