# Truth Analytics

Plataforma de gestão e inteligência para operações de marketplace. O Truth Analytics reúne dados, diagnóstico, execução e acompanhamento em um único ambiente para que clientes, analistas e administradores trabalhem sobre a mesma realidade operacional.

O objetivo de longo prazo é transformar a plataforma no sistema de operação que ajuda cada projeto a buscar **R$ 300 mil de faturamento bruto anual**. A meta orienta o roadmap; não é uma promessa automática de resultado.

[![Produção](https://img.shields.io/badge/produção-Vercel-176B45?logo=vercel&logoColor=white)](https://truth-analytics.vercel.app)
[![CI](https://github.com/Truth-Commerce/truth-analytics/actions/workflows/ci.yml/badge.svg)](https://github.com/Truth-Commerce/truth-analytics/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-111111?logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-176B45?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-176B45?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Licença MIT](https://img.shields.io/badge/licença-MIT-176B45)](./LICENSE)

[Acessar a plataforma](https://truth-analytics.vercel.app) · [Ver o repositório](https://github.com/Truth-Commerce/truth-analytics) · [Consultar o roadmap de R$ 300 mil](./docs/superpowers/specs/2026-07-27-growth-operating-system-300k-design.md)

## O que o produto resolve

Gerenciar marketplace exige mais do que consultar vendas. É preciso descobrir onde existe perda de receita, priorizar ações, distribuir responsabilidades, acompanhar prazos e verificar se o trabalho produziu efeito. O Truth Analytics conecta essas etapas:

- integra pedidos, estoque e produtos do Bling;
- consolida indicadores e histórico por organização;
- compara preços com referências públicas de mercado;
- transforma dados em relatórios e recomendações estruturadas;
- organiza a execução em planos de ação, ciclos, tarefas e playbooks;
- acompanha estoque, kits, calendário comercial, alertas e notificações;
- oferece visões específicas para cliente, analista e administração;
- registra atividades sensíveis para rastreabilidade operacional.

Os cálculos determinísticos continuam sendo a fonte de verdade. A IA interpreta contexto e sugere caminhos, mas não substitui as métricas nem decide silenciosamente pelo usuário.

## Para quem foi construído

| Perfil | Trabalho principal na plataforma |
|---|---|
| **Cliente** | Acompanha resultados, relatórios e comparativos; consulta estoque, kits e calendário; executa e revisa tarefas do plano de ação. |
| **Analista** | Enxerga sua carteira, compara operações, acessa a visão 360º de cada cliente e conduz prioridades, tarefas e ciclos sem depender de URLs manuais. |
| **Admin Truth** | Ativa clientes, organiza usuários e analistas, acompanha operação e performance, mantém playbooks e supervisiona a consultoria. |

A interface atual utiliza tema claro editorial, verde como cor de marca, menu lateral recolhível e navegação responsiva. A arquitetura de informação foi desenhada para deixar o trabalho diário visível mesmo para quem não tem familiaridade técnica.

## Capacidades disponíveis hoje

### Inteligência e dados

- OAuth por cliente com a API v3 do Bling, atualização de tokens e sincronização de pedidos e estoque.
- Benchmark público do Mercado Livre e enriquecimento opcional por SerpAPI.
- Pipeline de métricas, análise estruturada por IA e geração de relatórios.
- Histórico, comparação entre relatórios e exportação em PDF.
- Produtos acompanhados, cobertura de estoque e alertas operacionais.
- Sugestões de kits e oportunidades de calendário comercial.

### Execução e acompanhamento

- Kanban com hierarquia de tarefas, prioridade, etiquetas, responsável, prazo, SLA e movimentação entre etapas.
- Comentários, atividades, seguidores e fluxo de revisão com o cliente.
- Ciclos de trabalho, templates e playbooks reutilizáveis.
- Carteira do analista, visão “Meu dia”, comparativo e visão 360º por cliente.
- Notificações no produto e comunicações por e-mail quando configuradas.

### Administração e operação

- Ativação, suspensão e configuração de planos de clientes.
- Associação entre organizações e analistas.
- Gestão de usuários, consultoria, performance, operações e playbooks.
- Rotas autenticadas para rotinas agendadas, heartbeats e watchdog operacional.
- Auditoria de operações administrativas e controles de acesso por papel e organização.

## Como o sistema se organiza

O Truth Analytics é um monólito modular em Next.js. As páginas, Server Actions e rotas de API compartilham contratos de domínio e persistência, sem misturar dados entre organizações.

```mermaid
flowchart LR
    Client["Cliente"]
    Analyst["Analista"]
    Admin["Admin Truth"]
    App["Truth Analytics<br/>Next.js"]
    DB[("PostgreSQL")]
    Bling["Bling API v3"]
    Market["Mercado Livre<br/>SerpAPI opcional"]
    AI["Anthropic"]
    Email["Resend"]

    Client --> App
    Analyst --> App
    Admin --> App
    App <--> DB
    App <--> Bling
    App --> Market
    App --> AI
    App --> Email
```

As fronteiras mais importantes são:

- **Organização:** registros de negócio são vinculados a `org_id`; a autorização é conferida no servidor.
- **Carteira do analista:** o vínculo da organização com `analista_id` limita quais clientes o profissional pode acessar.
- **Administração:** ações privilegiadas passam por guardas de papel e geram trilha de auditoria quando aplicável.
- **Pipeline:** integrações coletam dados; métricas determinísticas consolidam a base; a análise por IA produz uma camada complementar validada por contratos.
- **Operação agendada:** rotas protegidas executam sincronizações, relatórios, alertas, digest semanal e monitoramento de rotinas.

```mermaid
flowchart LR
    Goal["Meta e contexto"] --> Data["Pedidos, estoque<br/>e mercado"]
    Data --> Diagnosis["Métricas e diagnóstico"]
    Diagnosis --> Priority["Oportunidades<br/>priorizadas"]
    Priority --> Plan["Plano de ação"]
    Plan --> Work["Tarefas, ciclos<br/>e playbooks"]
    Work --> Review["Revisão de resultado"]
    Review --> Learning["Histórico e aprendizado"]
    Learning --> Goal
```

## Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 16.2, React 19.2 e TypeScript 5 |
| Interface | Tailwind CSS 3.4, Framer Motion e Recharts |
| Banco | PostgreSQL, Drizzle ORM 0.45 e postgres-js |
| Autenticação | Auth.js 5, Credentials Provider e bcrypt |
| IA | Anthropic SDK, saída estruturada e validação com Zod |
| Integrações | Bling API v3, Mercado Livre, SerpAPI e Resend |
| Documentos | React PDF |
| Testes | Vitest e Playwright |
| Entrega | GitHub Actions e Vercel |

## Estrutura do repositório

```text
src/
├── app/                 # rotas, layouts e APIs do App Router
├── actions/             # Server Actions e fronteiras de escrita
├── components/          # componentes de interface e domínio
├── db/
│   ├── migrations/      # migrações SQL versionadas
│   └── schema/          # tabelas e relações do Drizzle
├── lib/                 # ambiente, segurança e utilitários compartilhados
└── modules/             # regras organizadas por capacidade de negócio
scripts/                 # seeds, migração de chaves e exclusão de organizações
tests/
├── unit/                # regras isoladas
├── integration/         # banco e integrações internas
└── e2e/                 # jornadas reais no navegador
docs/
├── runbooks/            # procedimentos operacionais
└── superpowers/         # especificações e planos de implementação
```

Entre os domínios de `src/modules` estão autenticação, organizações, analista, tarefas, relatórios, pipeline, estoque, kits, calendário, mercado, alertas, notificações, auditoria e integrações.

## Desenvolvimento local

### Pré-requisitos

- Node.js 22 — a CI usa exatamente a versão `22.19.0`;
- npm;
- PostgreSQL;
- Git.

### Instalação

```bash
git clone https://github.com/Truth-Commerce/truth-analytics.git
cd truth-analytics
npm ci
cp .env.example .env.local
```

No PowerShell, a última linha pode ser substituída por:

```powershell
Copy-Item .env.example .env.local
```

### Variáveis de ambiente

O arquivo [`.env.example`](./.env.example) é a referência completa. Para iniciar a aplicação, configure ao menos o banco, a autenticação e a criptografia:

```dotenv
POSTGRES_URL=postgres://usuario:senha@host:5432/banco
AUTH_SECRET=gere-um-segredo-longo-e-aleatorio
APP_URL=http://localhost:3000

# Chaveiro versionado recomendado para criptografar tokens OAuth.
ENCRYPTION_KEYS={"v1":"chave-de-32-bytes-em-base64"}
ENCRYPTION_KEY_ACTIVE=v1
```

`ENCRYPTION_KEY` continua disponível apenas para compatibilidade com instalações antigas. Novas instalações devem usar `ENCRYPTION_KEYS` e `ENCRYPTION_KEY_ACTIVE` para permitir rotação sem interromper a leitura de dados já cifrados.

Recursos adicionais dependem de suas próprias credenciais:

| Grupo | Variáveis principais |
|---|---|
| Bling | `BLING_CLIENT_ID`, `BLING_CLIENT_SECRET`, `BLING_REDIRECT_URI` |
| IA | `ANTHROPIC_API_KEY`, `ANALYSIS_MODEL` |
| Mercado | `SERPAPI_KEY` — opcional; a fonte pública continua disponível sem ela |
| E-mail | `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_ALERT_EMAIL` |
| Rotinas | `PIPELINE_SECRET`, `CRON_SECRET` |
| Observabilidade | `SENTRY_DSN` — opcional |

### Banco e primeiro acesso

```bash
npm run db:migrate
npm run db:seed-admin
npm run dev
```

O seed administrativo lê `SEED_ADMIN_EMAIL` e `SEED_ADMIN_PASSWORD`. Para criar um analista, use `ANALISTA_EMAIL` e `ANALISTA_SENHA` com `npm run db:seed-analista`; é necessário que já exista um usuário `admin_truth`.

A aplicação estará disponível em [http://localhost:3000](http://localhost:3000).

## Scripts úteis

| Comando | Finalidade |
|---|---|
| `npm run dev` | Inicia o ambiente de desenvolvimento. |
| `npm run build` | Gera o build de produção. |
| `npm start` | Serve o build produzido. |
| `npm run lint` | Executa o ESLint. |
| `npm run typecheck` | Valida os tipos sem gerar arquivos. |
| `npm test` | Executa a suíte Vitest. |
| `npm run test:ci` | Executa o Vitest no modo usado pela CI. |
| `npm run test:watch` | Mantém os testes em observação. |
| `npm run test:e2e` | Executa as jornadas Playwright. |
| `npm run db:generate` | Gera migrações a partir do schema. |
| `npm run db:migrate` | Aplica migrações no banco da aplicação. |
| `npm run db:migrate:test` | Aplica migrações exclusivamente no banco de testes. |
| `npm run db:seed-admin` | Cria ou promove o administrador inicial. |
| `npm run db:seed-analista` | Cria o usuário analista inicial. |
| `npm run db:reencrypt` | Recriptografa segredos após rotação de chave. |
| `npm run db:purge-org` | Executa a exclusão controlada dos dados de uma organização. |

## Testes e proteção do banco

A suíte combina testes unitários, integração com PostgreSQL e jornadas E2E. Na CI, o projeto cria um PostgreSQL 16 descartável e executa migrações antes dos testes.

Para operações destrutivas locais, `DATABASE_URL_TEST` é obrigatória. Endereços loopback são aceitos automaticamente. Um banco remoto exige a confirmação literal abaixo:

```dotenv
ALLOW_REMOTE_TEST_DATABASE=I_UNDERSTAND_THIS_IS_DESTRUCTIVE
```

Mesmo com essa confirmação, a proteção rejeita um endpoint remoto que corresponda a `POSTGRES_URL` ou `POSTGRES_URL_DIRECT` pelo host, porta e nome do banco. Nunca aponte `DATABASE_URL_TEST` para produção.

Validação recomendada antes de abrir um pull request:

```bash
npm run lint
npm run typecheck
npm run test:ci
npm run build
npm run test:e2e
```

## CI, deploy e operação

O workflow [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) roda em pull requests e em alterações na `master`. A sequência inclui:

1. instalação reproduzível com `npm ci`;
2. auditoria das dependências de produção;
3. PostgreSQL descartável e migrações de teste;
4. lint, typecheck, Vitest e build;
5. instalação do Chromium e Playwright E2E.

O projeto está conectado à Vercel. Alterações integradas à `master` seguem para produção pela integração Git e devem ser acompanhadas no workflow e no deployment correspondente.

As rotas para sincronização de pedidos e estoque, geração de relatórios, alertas, digest semanal e watchdog já existem e exigem autenticação por segredo. O agendamento deve ser configurado no ambiente de hospedagem; não há um cronograma versionado em `vercel.json` neste repositório.

## Segurança e privacidade

Os controles implementados incluem:

- senhas armazenadas com bcrypt e sessões geridas pelo Auth.js;
- papéis `client`, `analista` e `admin_truth`, com autorização no servidor;
- escopo por organização e validação explícita da carteira do analista;
- tokens OAuth do Bling cifrados com AES-256-GCM e suporte a rotação de chaves;
- limitação de tentativas de login e fluxo de redefinição de senha;
- auditoria de operações administrativas relevantes;
- CSP, HSTS, proteção contra framing, `nosniff` e política de permissões;
- segredos fora do repositório e validação centralizada das variáveis de ambiente;
- barreira contra uso acidental do banco de produção nos testes;
- auditoria de dependências de produção como etapa da CI.

Segurança é um processo contínuo. Mudanças em autenticação, autorização, criptografia, integrações ou retenção de dados devem incluir testes e revisão específica.

## Entregas recentes

- migração para Next.js 16 e React 19;
- menu lateral recolhível e tema claro editorial em toda a aplicação;
- Carteira e Comparativo expostos diretamente no menu do analista;
- visão de cliente, execução em Kanban e navegação móvel refinadas;
- correção do campo de responsável para permanecer dentro do card no Kanban;
- atualização crítica do Auth.js e reforço do pipeline de dependências;
- atualização do Drizzle, incluindo compatibilidade de identificadores e erros do PostgreSQL;
- testes herméticos, proteção destrutiva do banco e PostgreSQL descartável na CI;
- ações oficiais do GitHub e imagem de banco fixadas por versão/digest;
- produção ativa na Vercel.

## Limitações conhecidas

- O sistema operacional completo de crescimento rumo a R$ 300 mil ainda está em construção; metas versionadas, forecast, waterfall de gap, ledger de impacto e experimentos pertencem ao roadmap.
- Alguns formulários ainda usam `useFormState` e devem migrar para `useActionState` do React 19.
- Permanecem avisos não bloqueantes de lint em pontos legados.
- A ordem entre carregamento de metadata e autorização em algumas páginas dinâmicas de admin e analista precisa de endurecimento adicional.
- Testes de integração que dependem do banco podem ser ignorados localmente quando `DATABASE_URL_TEST` não está configurada; a CI os executa com banco descartável.
- As rotas operacionais estão prontas para agendamento, mas o cronograma da hospedagem não é mantido neste repositório.

## Caminho para R$ 300 mil brutos anuais

A meta de produto é apoiar cada operação na busca por **R$ 300.000 de faturamento bruto anual**, considerando pedidos válidos e excluindo cancelamentos e reembolsos integrais. A definição financeira definitiva será versionada no produto para impedir divergências entre telas e períodos.

O avanço está organizado em etapas:

1. **Estabilização:** segurança, autorização, consistência visual, confiabilidade dos dados e da entrega.
2. **Fundação 300K:** metas, fases do projeto, camada semântica de métricas, forecast inicial, qualidade e atualização dos dados.
3. **Oportunidades e execução:** waterfall do gap, motor de oportunidades, plano vinculado aos indicadores e modo de reunião.
4. **Impacto e playbooks:** experimentos, registro de impacto, avaliação antes/depois e aprendizado reutilizável.
5. **Expansão de marketplace:** catálogo, integrações, tráfego e conversão.
6. **Copiloto:** briefings, simulação de cenários, plano semanal e automações controladas.

O desenho completo, com limites entre capacidades atuais e futuras, está em [Growth Operating System — R$ 300 mil](./docs/superpowers/specs/2026-07-27-growth-operating-system-300k-design.md).

## Documentação

| Documento | Uso |
|---|---|
| [Onboarding de cliente](./docs/runbooks/onboarding-cliente.md) | Preparação e ativação de uma nova operação. |
| [Rotação de segredos](./docs/runbooks/rotacao-segredos.md) | Troca segura de credenciais e chaves de criptografia. |
| [Exclusão de dados por organização](./docs/runbooks/exclusao-de-dados-org.md) | Procedimento controlado de remoção. |
| [Auditoria completa — 03/07/2026](./docs/auditoria-completa-2026-07-03.md) | Diagnóstico técnico e de produto. |
| [Auditoria de qualidade — 14/07/2026](./docs/auditoria-qualidade-2026-07-14.md) | Verificação complementar de qualidade. |
| [Especificação deste README](./docs/superpowers/specs/2026-07-28-readme-design.md) | Decisões editoriais e critérios da documentação. |

## Licença

Distribuído sob a [licença MIT](./LICENSE).

---

Desenvolvido pela Truth Commerce para transformar análise em rotina, responsabilidade e evolução mensurável.
