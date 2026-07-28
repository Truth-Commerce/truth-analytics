# README equilibrado do Truth Analytics

**Status:** aprovado em conversa em 28/07/2026  
**Escopo:** reescrita integral do `README.md`  
**Públicos prioritários:** gestores e parceiros que avaliam o produto; desenvolvedores e operadores que mantêm a plataforma

## 1. Decisão

O README seguirá uma progressão executiva para técnica. A abertura explicará o problema, os públicos e o valor operacional do Truth Analytics. As seções seguintes documentarão as capacidades implementadas, a arquitetura, a segurança, o desenvolvimento local, os testes, o CI/CD e a operação em produção.

O documento distinguirá explicitamente o sistema disponível hoje do norte estratégico do Growth Operating System 300K. A meta de R$ 300 mil será apresentada como direção de produto, sem atribuir ao sistema atual funcionalidades que ainda pertencem ao roadmap.

## 2. Objetivos

- Permitir que uma pessoa entenda em poucos minutos para que o produto existe e quem o utiliza.
- Registrar as funcionalidades implementadas para cliente, analista e administrador.
- Explicar os principais fluxos, limites arquiteturais e controles de segurança.
- Oferecer uma instalação local reproduzível e segura.
- Documentar testes, CI/CD, deploy e operação sem depender de conhecimento informal.
- Substituir versões, contagens, status e descrições desatualizadas do README atual.
- Direcionar leitores aos planos, especificações e runbooks detalhados sem duplicá-los integralmente.

## 3. Não objetivos

- Transformar o README em documentação exaustiva de cada módulo ou tabela.
- Reproduzir todo o histórico de commits.
- Apresentar funcionalidades planejadas como concluídas.
- Publicar credenciais, URLs privadas ou procedimentos destrutivos sem salvaguardas.
- Usar o README como material publicitário independente de evidências do produto.

## 4. Estrutura editorial

1. Identidade do projeto, links de produção e indicadores técnicos verificáveis.
2. Visão do produto e definição do norte 300K.
3. Públicos e jornadas: cliente, analista e administrador.
4. Capacidades implementadas agrupadas por domínio.
5. Contexto do sistema em Mermaid.
6. Fluxo operacional e pipeline em Mermaid.
7. Arquitetura do monólito modular, fontes de verdade e limites de escrita.
8. Segurança, autenticação, autorização, multi-tenancy e proteção de segredos.
9. Stack e versões atuais.
10. Estrutura do repositório.
11. Pré-requisitos, instalação e variáveis de ambiente.
12. Banco, migrations, seeds e scripts operacionais.
13. Estratégia de testes e segurança do banco de testes.
14. CI/CD e deploy na Vercel.
15. Runbooks e documentação complementar.
16. Melhorias recentes e estado atual.
17. Roadmap 300K e limitações conhecidas.
18. Licença.

## 5. Voz e linguagem

- Português do Brasil, com tom calmo, direto e profissional.
- Vocabulário consistente com o produto: organização, cliente, analista, relatório, oportunidade, tarefa, ciclo, faturamento bruto e meta 300K.
- Frases concretas que nomeiem ator, ação e resultado.
- Poucos elementos decorativos; badges apenas quando representarem fatos sustentáveis.
- Sem superlativos, promessas vagas, slogans genéricos ou afirmações de segurança absoluta.
- Termos técnicos explicados apenas quando isso reduzir ambiguidade para o leitor não técnico.

## 6. Política de exatidão

Cada afirmação será conferida contra uma fonte atual do repositório:

| Afirmação | Fonte principal |
|---|---|
| Versões e scripts | `package.json` e `package-lock.json` |
| Funcionalidades e rotas | `src/app`, `src/components` e `src/modules` |
| Modelo de dados | `src/db/schema` e migrations |
| Variáveis | `.env.example` e validação de ambiente |
| Segurança | módulos de auth/crypto, headers e testes negativos |
| CI | `.github/workflows/ci.yml` |
| Testes | execução atual da suíte e configuração Vitest/Playwright |
| Produção | projeto Vercel e domínio público |
| Estratégia 300K | especificação aprovada do Growth Operating System 300K |

Contagens voláteis de testes não serão colocadas em badges estáticos. Quando uma contagem for útil, ficará identificada como fotografia da validação atual e vinculada ao workflow de CI.

## 7. Diagramas

O README terá dois diagramas Mermaid, cada um com um único nível de abstração:

1. **Contexto do sistema:** papéis humanos, aplicação Next.js/Vercel, PostgreSQL e integrações externas.
2. **Fluxo operacional:** sincronização, métricas determinísticas, IA, relatórios, oportunidades, execução no Kanban e aprendizado.

As setas indicarão direção e finalidade. O diagrama não apresentará filas ou serviços que não existam na implementação atual. Capacidades futuras aparecerão apenas no roadmap em texto.

## 8. Segurança da documentação

- Exemplos de ambiente usarão placeholders e valores fictícios.
- O README explicará a separação entre banco de produção e banco de testes.
- Operações remotas destrutivas exigirão referência ao consentimento explícito já implementado no guard de banco.
- Seeds, recriptografia e exclusão apontarão para scripts e runbooks antes de instruções de alto risco.
- O documento não afirmará que o sistema é “seguro”; descreverá controles existentes e a evidência de validação.

## 9. Validação da implementação

Após a reescrita:

- verificar links e caminhos locais citados;
- conferir comandos contra os scripts disponíveis;
- procurar versões, contagens e status antigos;
- procurar placeholders acidentais, `TODO`, contradições e credenciais;
- validar blocos Mermaid e cercas Markdown por inspeção;
- executar `npm run lint`, `npm run typecheck` e a suíte de testes relevante caso a documentação altere arquivos consumidos por tooling;
- revisar o diff final para garantir que somente a documentação aprovada mudou.

## 10. Critérios de aceite

- Um leitor não técnico identifica propósito, públicos e valor operacional antes das seções de setup.
- Um desenvolvedor consegue instalar, configurar, migrar e validar o projeto sem depender do README antigo.
- Funcionalidades atuais e roadmap estão visualmente e semanticamente separados.
- Next.js 16, React 19 e os demais componentes da stack aparecem com versões coerentes com o repositório.
- Cliente, analista e administrador possuem responsabilidades e acessos descritos corretamente.
- O pipeline de CI, o PostgreSQL descartável e a proteção contra banco remoto estão documentados.
- O deploy atual e os links de produção estão corretos.
- Não há credenciais reais, marketing sem evidência ou informações sabidamente desatualizadas.
