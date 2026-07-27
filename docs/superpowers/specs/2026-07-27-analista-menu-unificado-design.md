# Menu unificado do analista

## Contexto

O modelo de navegação já oferece `Carteira` e `Comparativo` quando o shell é renderizado com a variante `analista`. Entretanto, o login envia todos os papéis para `/dashboard`, cuja árvore usa atualmente a variante `client`. Como consequência, o analista só encontra as áreas próprias ao digitar `/analista` manualmente.

O analista é especialista em marketplace, não na estrutura técnica de URLs. As áreas disponíveis precisam estar expostas de forma estável no menu lateral.

## Decisão

O perfil `analista` terá um menu unificado em todas as áreas que ele pode acessar. O menu será o mesmo em `/dashboard`, `/analista`, `/analista/comparativo` e nas respectivas páginas filhas.

Ordem dos itens:

1. Visão geral (`/dashboard`)
2. Carteira (`/analista`)
3. Comparativo (`/analista/comparativo`)
4. Plano de Ação (`/dashboard/plano-de-acao`)
5. Estoque (`/dashboard/estoque`)
6. Kits (`/dashboard/kits`)
7. Calendário (`/dashboard/calendario`)
8. Conexões (`/conexoes`)
9. Configurações (`/configuracoes`)

O cliente continuará usando apenas o menu de cliente. O administrador continuará usando apenas o menu administrativo.

## Arquitetura

- `navItems('analista')` será a fonte única da navegação unificada do analista.
- O layout da árvore de cliente selecionará a variante `analista` quando a sessão real tiver esse papel; clientes continuarão recebendo `client`.
- O layout de `/analista` continuará usando a variante `analista`, garantindo que o menu não mude durante a navegação.
- O cálculo existente de rota ativa continuará escolhendo o caminho mais específico. Assim, `/analista/comparativo` destacará `Comparativo`, e não `Carteira`.
- A mudança não amplia permissões nem altera regras de middleware, consultas ou mutações. Ela apenas torna navegáveis rotas que o papel já pode acessar.

## Comportamento responsivo e acessível

- O mesmo conjunto de itens aparecerá na sidebar desktop expandida e recolhida.
- O drawer móvel exibirá a mesma ordem.
- Links manterão `aria-current="page"`, rótulos e tooltips existentes.
- Os ícones existentes `portfolio` e `compare` serão reutilizados.

## Testes e critérios de aceite

- Teste unitário do modelo comprova a ordem completa do menu `analista`.
- Teste unitário comprova que o menu `client` não recebe `Carteira` nem `Comparativo`.
- Teste E2E autentica como analista, inicia em `/dashboard` e encontra links visíveis para `/analista` e `/analista/comparativo`.
- O E2E navega pelos dois links e confirma o item ativo correto.
- O drawer móvel expõe os mesmos links.
- Lint, TypeScript, testes relacionados e build permanecem verdes.

## Fora de escopo

- Alterar o destino pós-login.
- Criar novas páginas ou permissões.
- Mudar os menus de cliente ou administrador.
- Redesenhar o conteúdo das páginas Carteira e Comparativo.
