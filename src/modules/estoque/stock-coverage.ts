/**
 * Cobertura de estoque em dias — puro (testável em node).
 * cobertura = saldo ÷ (vendas dos últimos 30 dias ÷ 30).
 */

export const ESTOQUE_CRITICO_DIAS = 7;
export const ESTOQUE_ATENCAO_DIAS = 15;
/** Janela de velocidade de venda (dias). */
export const JANELA_VELOCIDADE_DIAS = 30;

export type EstadoEstoque = 'critico' | 'desalinhado' | 'atencao' | 'ok' | 'parado';

export type CoberturaProduto = {
  sku: string;
  nome: string;
  saldo: number;
  vendas30d: number;
  coberturaDias: number | null;
  estado: EstadoEstoque;
};

const PRIORIDADE: Record<EstadoEstoque, number> = {
  critico: 0,
  desalinhado: 1,
  atencao: 2,
  ok: 3,
  parado: 4,
};

function classificar(saldo: number, vendas30d: number): Pick<CoberturaProduto, 'coberturaDias' | 'estado'> {
  // Saldo negativo no Bling = mais saídas (vendas) baixadas do que entradas (compras)
  // lançadas. Não é falta física, é registro furado — categoria própria, não "crítico"
  // (a lógica de cobertura clampeava o negativo em 0 e o mascarava de crítico).
  if (saldo < 0) return { coberturaDias: null, estado: 'desalinhado' };
  if (vendas30d <= 0) return { coberturaDias: null, estado: 'parado' };
  const velocidadeDia = vendas30d / JANELA_VELOCIDADE_DIAS;
  const coberturaDias = Math.max(0, Math.floor(saldo / velocidadeDia));
  if (coberturaDias < ESTOQUE_CRITICO_DIAS) return { coberturaDias, estado: 'critico' };
  if (coberturaDias < ESTOQUE_ATENCAO_DIAS) return { coberturaDias, estado: 'atencao' };
  return { coberturaDias, estado: 'ok' };
}

/**
 * Junta saldo (snapshot) com vendas 30d, filtra mortos (saldo exatamente 0 e zero
 * venda) e ordena por prioridade de estado; empate = mais vendido primeiro.
 * Saldo negativo NUNCA é morto: entra sempre como 'desalinhado', mesmo sem venda.
 */
export function montarCobertura(
  stock: { sku: string; nome: string; saldo: number }[],
  vendas30dPorSku: Map<string, number>,
): CoberturaProduto[] {
  return stock
    .map((p) => {
      const vendas30d = vendas30dPorSku.get(p.sku) ?? 0;
      return { ...p, vendas30d, ...classificar(p.saldo, vendas30d) };
    })
    .filter((p) => p.saldo !== 0 || p.vendas30d > 0)
    .sort(
      (a, b) =>
        PRIORIDADE[a.estado] - PRIORIDADE[b.estado] ||
        b.vendas30d - a.vendas30d ||
        a.sku.localeCompare(b.sku, 'pt-BR'),
    );
}
