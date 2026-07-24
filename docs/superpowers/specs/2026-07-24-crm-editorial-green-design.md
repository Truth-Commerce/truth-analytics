# Design — CRM editorial verde para o Truth Analytics

**Data:** 24 de julho de 2026  
**Status:** aprovado  
**Referência visual:** Zeneagrama, reinterpretado para o contexto analítico do Truth Analytics

## Objetivo

Transformar o Truth Analytics em uma aplicação com aparência de CRM maduro, mantendo toda a lógica, as rotas e as permissões existentes. A navegação autenticada deixa o topo e passa para uma barra lateral recolhível. Todo o produto adota um tema exclusivamente claro, editorial e premium, com verde como cor de ação e identidade.

## Decisões aprovadas

| Tema | Decisão |
| --- | --- |
| Escopo | Aplicação inteira |
| Navegação autenticada | Sidebar recolhível |
| Direção visual | CRM híbrido editorial |
| Referência | Linguagem visual do Zeneagrama |
| Cor principal | Verde, sem laranja |
| Tema | Somente claro, sem alternância para escuro |
| Ícones | SVGs locais, sem nova dependência |
| Persistência | Estado da sidebar salvo no navegador |

## Sistema visual

### Cores

- Papel principal: #FAF8F4
- Superfície: #FFFFFF
- Superfície secundária: #F1EDE4
- Texto forte: #14120F
- Texto suave: #4A443C
- Texto discreto: #8A8378
- Verde principal: #137A3E
- Verde forte: #0D6331
- Verde suave: #E9F6EC
- Gradiente de destaque: #137A3E até #58B973
- Linhas: bege e cinza quentes de baixo contraste
- Estados de erro, alerta e sucesso permanecem semanticamente distintos

O verde deve aparecer em ações, item ativo, foco, destaques e visualizações. Ele não deve preencher grandes áreas sem função.

### Tipografia

- Instrument Serif: títulos, números de destaque e KPIs
- Inter: interface, navegação, tabelas, formulários e textos corridos
- Space Mono e Sora deixam de ser fontes principais do produto

### Superfícies

- Fundo em tom de papel
- Cards brancos com borda quente, sombra baixa e raio moderado
- Hierarquia construída por espaço, tipografia e contraste
- Motion curto, entre 150 e 220 ms
- Sem brilhos neon, fundos pretos ou excesso de gradientes

## Shell autenticado

### Sidebar

- Largura aberta: 264 px
- Largura recolhida: 76 px
- Altura integral da viewport
- Logo no topo e controle de recolhimento próximo ao cabeçalho
- Navegação definida por perfil continua vindo do modelo atual de rotas
- Item ativo usa fundo verde suave, texto verde forte e indicador lateral
- No modo recolhido, apenas os ícones permanecem; rótulos ficam disponíveis por tooltip e nome acessível
- Rodapé da sidebar contém contexto do perfil e ação de sair
- Preferência salva em truth-sidebar-collapsed

### Topbar

A topbar deixa de repetir a navegação principal. Ela contém:

- botão do drawer em telas pequenas;
- título ou breadcrumb da página atual;
- atalho de busca global com indicação Ctrl K;
- notificações;
- contexto de conta quando disponível.

### Mobile

- A sidebar vira drawer sobreposto
- O drawer fecha por botão, tecla Escape, clique no overlay e navegação
- A página não rola por baixo do drawer aberto
- A topbar permanece compacta e funcional

## Áreas públicas

Landing page, login, cadastro, redefinição de senha e páginas legais recebem os mesmos tokens, fontes e componentes. Essas páginas mantêm cabeçalho convencional, pois a sidebar representa o ambiente autenticado do CRM.

## Componentes e migração

Serão atualizados:

- botões, inputs, selects, badges e estados de foco;
- cards, tabelas, modais, toasts, command palette e estados vazios;
- gráficos, tooltips, overlays e visualizações;
- documentos PDF visuais gerados pela aplicação;
- páginas de cliente, analista e administrador;
- páginas públicas e seus cabeçalhos;
- logo e iconografia para garantir contraste no fundo claro.

Classes hardcoded do tema escuro serão migradas por contexto. Não haverá substituição global cega de texto branco, porque ele ainda é correto em botões verdes e alguns estados semânticos.

## Acessibilidade e estados

- Contraste mínimo AA para texto e controles
- Foco visível em verde
- Alvos interativos com no mínimo 40 px quando possível
- Todos os controles de ícone com nome acessível
- Sidebar operável por teclado
- Preferência de movimento reduzido respeitada
- Estados de carregamento, vazio, erro, sucesso e desabilitado continuam explícitos

## Comportamento e dados

Não serão alterados:

- regras de negócio;
- permissões por perfil;
- contratos de API;
- rotas existentes;
- textos funcionais essenciais;
- atributos data-testid usados pelos testes.

O redesenho deve preservar a leitura de dados e melhorar escaneabilidade, hierarquia e orientação.

## Verificação

A entrega será validada com:

- lint, verificação de tipos e build de produção;
- testes unitários existentes e testes focados na nova navegação;
- inspeção visual das principais rotas públicas e autenticadas;
- validação de sidebar aberta, recolhida e drawer mobile;
- revisão de overflow, foco, contraste e responsividade;
- comparação dos seletores restantes do tema antigo.

## Fora de escopo

- Mudança de regras de negócio ou banco de dados
- Renomeação de rotas
- Atualização ampla de dependências
- Tema escuro ou seletor de tema
- Inclusão de biblioteca externa de ícones
- Redesenho dos e-mails transacionais
