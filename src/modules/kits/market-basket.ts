/**
 * Análise de cesta — pares de produtos comprados juntos (puro, testável em node).
 * Evidência para os kits: comportamento REAL dos pedidos, não invenção da IA.
 */

export const SUPORTE_MINIMO = 2;
export const MAX_CANDIDATOS = 8;

export type ItemPedido = { sku?: string; nome: string; quantidade: number };

export type KitCandidato = {
  skus: [string, string];
  nomes: [string, string];
  pedidosJuntos: number;
};

export function candidatosDeKits(pedidos: { itens: ItemPedido[] }[]): KitCandidato[] {
  const nomes = new Map<string, string>();
  const pares = new Map<string, number>();

  for (const p of pedidos) {
    const skus = [
      ...new Set(p.itens.filter((i) => i.sku).map((i) => i.sku as string)),
    ].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    for (const item of p.itens) {
      if (item.sku && !nomes.has(item.sku)) nomes.set(item.sku, item.nome);
    }
    for (let i = 0; i < skus.length; i++) {
      for (let j = i + 1; j < skus.length; j++) {
        const chave = `${skus[i]} ${skus[j]}`;
        pares.set(chave, (pares.get(chave) ?? 0) + 1);
      }
    }
  }

  return [...pares.entries()]
    .filter(([, n]) => n >= SUPORTE_MINIMO)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, MAX_CANDIDATOS)
    .map(([chave, pedidosJuntos]) => {
      const [a, b] = chave.split(' ') as [string, string];
      return {
        skus: [a, b],
        nomes: [nomes.get(a) ?? a, nomes.get(b) ?? b],
        pedidosJuntos,
      };
    });
}
