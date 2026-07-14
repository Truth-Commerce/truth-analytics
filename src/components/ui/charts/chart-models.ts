/** Modelos puros dos charts v2 — sem React/Recharts (testáveis em node). */
import { formatDataCurta } from '@/lib/format';

const round2 = (n: number): number => Math.round(n * 100) / 100;

export const MEDIA_MOVEL_JANELA = 7;

export function mediaMovel(valores: number[], janela = MEDIA_MOVEL_JANELA): number[] {
  return valores.map((_, i) => {
    const ini = Math.max(0, i - janela + 1);
    const fatia = valores.slice(ini, i + 1);
    return round2(fatia.reduce((a, v) => a + v, 0) / fatia.length);
  });
}

export type EvolucaoComparadaRow = { x: string; atual: number; media: number; anterior: number | null };

export function evolucaoComparadaModel(
  atual: { data: string; total: number }[],
  anterior: { data: string; total: number }[] | null,
): EvolucaoComparadaRow[] {
  const medias = mediaMovel(atual.map((e) => e.total));
  return atual.map((e, i) => ({
    x: formatDataCurta(e.data),
    atual: e.total,
    media: medias[i],
    anterior: anterior?.[i]?.total ?? null,
  }));
}

export type StackedAreaModel = { keys: string[]; rows: Array<Record<string, number | string>> };

export function stackedAreaModel(
  canalPorDia: { data: string; canais: Record<string, number> }[],
): StackedAreaModel {
  const totais = new Map<string, number>();
  for (const dia of canalPorDia) {
    for (const [canal, total] of Object.entries(dia.canais)) totais.set(canal, (totais.get(canal) ?? 0) + total);
  }
  const keys = Array.from(totais.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([c]) => c);
  const rows = canalPorDia.map((dia) => {
    const row: Record<string, number | string> = { x: formatDataCurta(dia.data) };
    for (const k of keys) row[k] = dia.canais[k] ?? 0;
    return row;
  });
  return { keys, rows };
}

export type ParetoInputItem = { sku: string; nome: string; receita: number; pctAcumulado: number };
export type ParetoRow = { label: string; receita: number; acumulado: number };

export function paretoModel(
  abc: { a: ParetoInputItem[]; b: ParetoInputItem[]; c: ParetoInputItem[] },
  max = 15,
): ParetoRow[] {
  return [...abc.a, ...abc.b, ...abc.c]
    .slice(0, max)
    .map((p) => ({ label: p.sku || p.nome, receita: p.receita, acumulado: p.pctAcumulado }));
}

export type DivergingRow = { label: string; deltaPct: number };

export function divergingPrecoModel(
  posicao: { sku: string; nome: string; nossoPreco: number; precoMercadoMediano: number }[],
): DivergingRow[] {
  return posicao
    .filter((p) => p.nossoPreco > 0 && p.precoMercadoMediano > 0)
    .map((p) => ({
      label: p.sku || p.nome,
      deltaPct: Math.round(((p.nossoPreco - p.precoMercadoMediano) / p.precoMercadoMediano) * 1000) / 10,
    }))
    .sort((a, b) => b.deltaPct - a.deltaPct || a.label.localeCompare(b.label, 'pt-BR'));
}
