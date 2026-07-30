import type { Metricas } from '@/modules/pipeline/contracts';
import { isErpProviderId } from '@/modules/providers/provider-catalog';

type FonteRelatorio = { sourceProvider: string | null; sourceGeneration: number | null };

/** Só compara relatórios cuja fonte congelada seja válida e idêntica. */
export function fontesRelatorioCompativeis(a: FonteRelatorio, b: FonteRelatorio): boolean {
  return a.sourceProvider !== null
    && a.sourceGeneration !== null
    && b.sourceProvider !== null
    && b.sourceGeneration !== null
    && isErpProviderId(a.sourceProvider)
    && isErpProviderId(b.sourceProvider)
    && Number.isInteger(a.sourceGeneration)
    && a.sourceGeneration > 0
    && Number.isInteger(b.sourceGeneration)
    && b.sourceGeneration > 0
    && a.sourceProvider === b.sourceProvider
    && a.sourceGeneration === b.sourceGeneration;
}

export type ProgressoMeta = { percentual: number; restante: number; atingida: boolean };

/** Pura. meta null/≤0 → null (sem meta definida). percentual inteiro, cap 999. */
export function progressoMeta(totalMes: number, meta: number | null): ProgressoMeta | null {
  if (meta === null || meta <= 0) return null;
  return {
    percentual: Math.min(999, Math.round((totalMes / meta) * 100)),
    restante: Math.max(0, Math.round((meta - totalMes) * 100) / 100),
    atingida: totalMes >= meta,
  };
}

/** ±5 pontos percentuais entre % real e % esperado = "no ritmo". */
export const PACE_TOLERANCIA_PP = 5;

export type PaceMeta = {
  pctEsperado: number;
  pctReal: number;
  ritmo: 'adiantado' | 'no_ritmo' | 'atrasado';
  projecao: number;
  mensagem: string;
};

/**
 * Pace da meta mensal (pura): % esperado até hoje = dia do mês / dias do mês
 * (hojeIso vem de hojeBrt — calendário America/Sao_Paulo) vs % real, com
 * projeção LINEAR de fechamento. Null sem meta (mesma regra de progressoMeta).
 */
export function paceMeta(totalMes: number, meta: number | null, hojeIso: string): PaceMeta | null {
  const progresso = progressoMeta(totalMes, meta);
  if (progresso === null) return null;
  const ano = Number(hojeIso.slice(0, 4));
  const mes = Number(hojeIso.slice(5, 7));
  const dia = Number(hojeIso.slice(8, 10));
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const pctEsperado = Math.round((dia / diasNoMes) * 100);
  const pctReal = progresso.percentual;
  const diff = pctReal - pctEsperado;
  const ritmo: PaceMeta['ritmo'] =
    diff >= PACE_TOLERANCIA_PP ? 'adiantado' : diff <= -PACE_TOLERANCIA_PP ? 'atrasado' : 'no_ritmo';
  const projecao = Math.round((totalMes / dia) * diasNoMes * 100) / 100;
  const rotulo =
    ritmo === 'adiantado'
      ? 'Você está adiantado'
      : ritmo === 'atrasado'
        ? 'Você está atrasado'
        : 'Você está no ritmo';
  return {
    pctEsperado,
    pctReal,
    ritmo,
    projecao,
    mensagem: `${rotulo}: até hoje o esperado era ~${pctEsperado}% da meta — você está em ${pctReal}%.`,
  };
}

export type DeltaNumero = {
  atual: number;
  anterior: number;
  deltaAbs: number;
  /** % com 1 casa; null quando anterior = 0 (divisão indefinida). */
  deltaPct: number | null;
};

/** Pura. deltaPct null quando `anterior` = 0 (divisão indefinida). */
export function deltaNumero(atual: number, anterior: number): DeltaNumero {
  return {
    atual,
    anterior,
    deltaAbs: Math.round((atual - anterior) * 100) / 100,
    deltaPct: anterior === 0 ? null : Math.round(((atual - anterior) / anterior) * 1000) / 10,
  };
}

/** Soma o total de vendas de `evolucao` (fonte de verdade do total do período). */
export function totalVendas(m: Metricas): number {
  return Math.round(m.evolucao.reduce((acc, e) => acc + e.total, 0) * 100) / 100;
}

/** Soma os pedidos de todos os canais. */
export function totalPedidos(m: Metricas): number {
  return m.vendasPorCanal.reduce((acc, c) => acc + c.pedidos, 0);
}

export type ComparacaoRelatorios = {
  totalVendas: DeltaNumero;
  pedidos: DeltaNumero;
  ticketMedio: DeltaNumero;
  truthScore: DeltaNumero | null; // null se algum lado não tiver score
  porCanal: { canal: string; delta: DeltaNumero }[];
};

export type ProdutoComparado = {
  sku: string;
  nome: string;
  receitaAtual: number;
  receitaAnterior: number;
  situacao: 'subiu' | 'caiu' | 'estavel' | 'entrou' | 'saiu';
};

/** Interseção dos top produtos por sku (fallback: nome). Ordenado por receita atual desc. */
export function compararTopProdutos(atual: Metricas, anterior: Metricas): ProdutoComparado[] {
  const chave = (p: Metricas['topProdutos'][number]): string => p.sku || p.nome;
  const mapA = new Map(atual.topProdutos.map((p) => [chave(p), p]));
  const mapB = new Map(anterior.topProdutos.map((p) => [chave(p), p]));
  const out: ProdutoComparado[] = [];
  for (const k of new Set([...mapA.keys(), ...mapB.keys()])) {
    const a = mapA.get(k);
    const b = mapB.get(k);
    const receitaAtual = a?.receita ?? 0;
    const receitaAnterior = b?.receita ?? 0;
    const situacao: ProdutoComparado['situacao'] = !a
      ? 'saiu'
      : !b
        ? 'entrou'
        : receitaAtual > receitaAnterior
          ? 'subiu'
          : receitaAtual < receitaAnterior
            ? 'caiu'
            : 'estavel';
    const ref = (a ?? b)!;
    out.push({ sku: ref.sku, nome: ref.nome, receitaAtual, receitaAnterior, situacao });
  }
  return out.sort((x, y) => y.receitaAtual - x.receitaAtual || x.nome.localeCompare(y.nome, 'pt-BR'));
}

/** Uma frase determinística de leitura da comparação (sem IA — pura). */
export function leituraComparacao(comp: ComparacaoRelatorios): string {
  const pct = comp.totalVendas.deltaPct;
  if (pct === null) return 'Sem base de comparação no período anterior.';
  const fmt = (v: number): string => Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  if (pct > 0) {
    const top = [...comp.porCanal].sort((a, b) => b.delta.deltaAbs - a.delta.deltaAbs)[0];
    const sufixo = top && top.delta.deltaAbs > 0 ? `, puxado por ${top.canal}` : '';
    return `Crescimento de ${fmt(pct)}% nas vendas${sufixo}.`;
  }
  if (pct < 0) {
    const pior = [...comp.porCanal].sort((a, b) => a.delta.deltaAbs - b.delta.deltaAbs)[0];
    const sufixo = pior && pior.delta.deltaAbs < 0 ? `, com maior recuo em ${pior.canal}` : '';
    return `Queda de ${fmt(pct)}% nas vendas${sufixo}.`;
  }
  return 'Vendas estáveis em relação ao período anterior.';
}

/** Pura. `atual` = relatório mais recente (A); `anterior` = base de comparação (B). */
export function compararMetricas(atual: Metricas, anterior: Metricas): ComparacaoRelatorios {
  const canais = new Map<string, { a: number; b: number }>();
  for (const c of atual.vendasPorCanal) canais.set(c.canal, { a: c.total, b: 0 });
  for (const c of anterior.vendasPorCanal) {
    const cur = canais.get(c.canal) ?? { a: 0, b: 0 };
    canais.set(c.canal, { ...cur, b: c.total });
  }
  const scoreA = atual.truth_score?.score;
  const scoreB = anterior.truth_score?.score;
  return {
    totalVendas: deltaNumero(totalVendas(atual), totalVendas(anterior)),
    pedidos: deltaNumero(totalPedidos(atual), totalPedidos(anterior)),
    ticketMedio: deltaNumero(atual.ticketMedio, anterior.ticketMedio),
    truthScore: scoreA !== undefined && scoreB !== undefined ? deltaNumero(scoreA, scoreB) : null,
    porCanal: Array.from(canais.entries())
      .map(([canal, v]) => ({ canal, delta: deltaNumero(v.a, v.b) }))
      .sort((x, y) => y.delta.atual - x.delta.atual || x.canal.localeCompare(y.canal, 'pt-BR')),
  };
}
