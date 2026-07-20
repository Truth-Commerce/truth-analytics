// ---------------------------------------------------------------------------
// dnd.ts — lógica PURA do drag-and-drop do board (H5/T7). Sem DOM, sem I/O:
// recebe retângulos/coordenadas já extraídos (getBoundingClientRect) e devolve
// decisões (qual coluna está sob o ponteiro, em que índice soltar, quantos
// passos de reorderTaskFormAction aplicar). O componente (KanbanBoard.tsx) faz
// a medição do DOM e chama estas funções — mantém o miolo testável sem jsdom.
// ---------------------------------------------------------------------------

export type RetanguloXY = { top: number; left: number; right: number; bottom: number };

function dentro(r: RetanguloXY, ponto: { x: number; y: number }): boolean {
  return ponto.x >= r.left && ponto.x <= r.right && ponto.y >= r.top && ponto.y <= r.bottom;
}

/**
 * Encontra o item cujo retângulo contém o ponto (hit-test 2D). Genérico sobre
 * o payload (T) — usado pra achar a coluna (e, em tabuleiros com raias, a
 * combinação raia+coluna) sob o ponteiro durante o arraste.
 */
export function itemSobPonteiro<T>(
  itens: ReadonlyArray<{ valor: T; rect: RetanguloXY }>,
  ponto: { x: number; y: number },
): T | null {
  const achado = itens.find((i) => dentro(i.rect, ponto));
  return achado ? achado.valor : null;
}

/**
 * Índice de inserção dentro de uma coluna: recebe os midpoints verticais das
 * cards JÁ SEM o item arrastado (em ordem visual topo→baixo) e o Y do
 * ponteiro no momento do drop. Devolve quantos midpoints ficam acima do
 * ponteiro — ou seja, a posição (0-based) em que o item cairia se inserido
 * ali.
 */
export function indiceAlvoPorPonteiro(midpointsY: readonly number[], y: number): number {
  const idx = midpointsY.findIndex((m) => y < m);
  return idx === -1 ? midpointsY.length : idx;
}

/**
 * Passos de reorderTaskFormAction (direção + quantidade de swaps com o
 * vizinho por `ordem`) pra levar o item de `deIndex` (posição atual, COM ele
 * mesmo na lista) até `paraIndiceSemArrastada` (índice-alvo calculado SEM ele,
 * via indiceAlvoPorPonteiro) — null quando não há mudança de posição.
 *
 * reorderTask (task.repository.ts) só sabe mover 1 posição por chamada
 * (troca com o vizinho imediato por `ordem`); esta função traduz "solte aqui"
 * em N chamadas sequenciais na mesma direção.
 */
export function passosReordenar(
  deIndex: number,
  paraIndiceSemArrastada: number,
): { direcao: 'up' | 'down'; passos: number } | null {
  const delta = paraIndiceSemArrastada - deIndex;
  if (delta === 0) return null;
  return { direcao: delta > 0 ? 'down' : 'up', passos: Math.abs(delta) };
}
