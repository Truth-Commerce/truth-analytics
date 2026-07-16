/**
 * Identidade visual por canal de venda — puro (testável em node).
 * Única fonte de verdade de categoria e cor por marketplace (spec Programa H §3 H0).
 */

export type CanalCategoria = 'shopee' | 'mercado_livre' | 'loja_virtual' | 'outro';

const TERMOS_LOJA_VIRTUAL = [
  'nuvemshop',
  'tray',
  'loja integrada',
  'vtex',
  'shopify',
  'woocommerce',
  'wix',
  'loja virtual',
  'e-commerce',
  'ecommerce',
  'site',
];

function normaliza(canal: string): string {
  return canal
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function categoriaDoCanal(canal: string): CanalCategoria {
  const n = normaliza(canal);
  if (n.includes('shopee')) return 'shopee';
  if (n.includes('mercado livre') || n.includes('mercadolivre') || n.includes('mercado libre')) {
    return 'mercado_livre';
  }
  if (TERMOS_LOJA_VIRTUAL.some((t) => n.includes(t))) return 'loja_virtual';
  return 'outro';
}

/** Tons por categoria — o 1º é a cor-base; séries com categoria repetida avançam no array. */
export const CORES_CANAL: Record<CanalCategoria, readonly string[]> = {
  shopee: ['#EE4D2D', '#F97316'],
  mercado_livre: ['#FFE600', '#FACC15'],
  loja_virtual: ['#3B82F6', '#60A5FA', '#2563EB'],
  outro: ['#94A3B8', '#CBD5E1', '#64748B'],
};

/** Cor-base do canal (dots, badges, PDF). */
export function corDoCanal(canal: string): string {
  return CORES_CANAL[categoriaDoCanal(canal)][0];
}

/** Cores de uma série de canais (charts): base por categoria; repetição avança o tom (cíclico). */
export function coresDosCanais(canais: string[]): string[] {
  const vistos = new Map<CanalCategoria, number>();
  return canais.map((canal) => {
    const categoria = categoriaDoCanal(canal);
    const idx = vistos.get(categoria) ?? 0;
    vistos.set(categoria, idx + 1);
    const tons = CORES_CANAL[categoria];
    return tons[idx % tons.length];
  });
}
