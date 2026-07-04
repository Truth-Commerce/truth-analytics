import { timingSafeEqual } from 'node:crypto';

/**
 * Compara um segredo recebido com o esperado em tempo constante, evitando
 * timing attacks (a comparação `!==` vaza informação pelo tempo de resposta).
 *
 * Retorna false se `recebido` for nulo/vazio ou se os comprimentos divergirem
 * (timingSafeEqual exige buffers de mesmo tamanho).
 */
export function secretsMatch(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
