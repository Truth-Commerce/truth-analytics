/** Matemática pura do focus-trap — testável em node, sem DOM. */

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Índice do próximo elemento a focar num loop de Tab dentro do trap.
 * `atual` = índice do elemento focado na lista de focáveis (-1 se o foco
 * está fora da lista, ex.: no próprio painel).
 */
export function proximoIndiceFoco(total: number, atual: number, shiftKey: boolean): number {
  if (total <= 0) return -1;
  if (atual === -1) return shiftKey ? total - 1 : 0;
  if (shiftKey) return atual <= 0 ? total - 1 : atual - 1;
  return atual >= total - 1 ? 0 : atual + 1;
}
