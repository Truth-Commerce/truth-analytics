import type { RawOrderItem } from '@/modules/providers/types';

export type PedidoRow = {
  data: Date;
  valor_total: string;
  frete: string;
  comissao: string;
  canal: string;
  itens: RawOrderItem[];
};

export type MesDesempenho = {
  mes: string;
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  unidades: number;
  frete: number;
  comissao: number;
  receitaLiquida: number;
};

const FMT_MES = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' });

/** Chave 'YYYY-MM' do mês comercial (America/Sao_Paulo). */
export function chaveMes(d: Date): string {
  return FMT_MES.format(d);
}

export function mesesJanela(agora: Date, meses: number): string[] {
  const [anoStr, mesStr] = chaveMes(agora).split('-');
  let ano = Number(anoStr);
  let mes = Number(mesStr);
  const out: string[] = [];
  for (let i = 0; i < meses; i++) {
    out.unshift(`${ano}-${String(mes).padStart(2, '0')}`);
    mes--;
    if (mes === 0) { mes = 12; ano--; }
  }
  return out;
}

/** SP não tem DST desde 2019 — offset fixo -03:00. */
export function inicioJanela(agora: Date, meses: number): Date {
  // Sem a guarda, `mesesJanela` devolveria [] e o Date sairia Invalid — um filtro
  // silenciosamente vazio lá na frente. Melhor estourar aqui.
  if (!Number.isInteger(meses) || meses < 1) throw new Error('meses_invalido');
  return new Date(`${mesesJanela(agora, meses)[0]}-01T00:00:00-03:00`);
}

const num = (v: string): number => Number(v) || 0;
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function agruparPorMes(rows: PedidoRow[], agora: Date, meses: number): MesDesempenho[] {
  const buckets = new Map<string, { faturamento: number; pedidos: number; unidades: number; frete: number; comissao: number }>();
  for (const chave of mesesJanela(agora, meses)) {
    buckets.set(chave, { faturamento: 0, pedidos: 0, unidades: 0, frete: 0, comissao: 0 });
  }
  for (const r of rows) {
    const b = buckets.get(chaveMes(r.data));
    if (!b) continue;
    b.faturamento += num(r.valor_total);
    b.pedidos += 1;
    b.frete += num(r.frete);
    b.comissao += num(r.comissao);
    for (const item of r.itens) b.unidades += item.quantidade;
  }
  return [...buckets.entries()].map(([mes, b]) => ({
    mes,
    faturamento: round2(b.faturamento),
    pedidos: b.pedidos,
    ticketMedio: b.pedidos > 0 ? round2(b.faturamento / b.pedidos) : 0,
    unidades: b.unidades,
    frete: round2(b.frete),
    comissao: round2(b.comissao),
    receitaLiquida: round2(b.faturamento - b.comissao - b.frete),
  }));
}

export function porCanalMensal(rows: PedidoRow[], agora: Date, meses: number): { mes: string; canais: Record<string, number> }[] {
  // O acumulador é Map, não objeto literal: nomes de canal vêm de texto editável no
  // Bling, e chaves herdadas de Object.prototype ('__proto__' seria descartado,
  // 'constructor' viraria NaN) corromperiam o total. `Object.fromEntries` materializa
  // o Record só na saída, com own properties de verdade.
  const buckets = new Map<string, Map<string, number>>();
  for (const chave of mesesJanela(agora, meses)) buckets.set(chave, new Map());
  for (const r of rows) {
    const b = buckets.get(chaveMes(r.data));
    if (!b) continue;
    b.set(r.canal, round2((b.get(r.canal) ?? 0) + num(r.valor_total)));
  }
  return [...buckets.entries()].map(([mes, canais]) => ({ mes, canais: Object.fromEntries(canais) }));
}

export function topSkus(rows: PedidoRow[], limite: number): { sku: string; nome: string; quantidade: number; receita: number }[] {
  const porSku = new Map<string, { nome: string; quantidade: number; receita: number }>();
  for (const r of rows) {
    for (const item of r.itens) {
      const chave = item.sku?.trim() || item.nome;
      const atual = porSku.get(chave) ?? { nome: item.nome, quantidade: 0, receita: 0 };
      atual.quantidade += item.quantidade;
      atual.receita = round2(atual.receita + item.quantidade * item.valor);
      porSku.set(chave, atual);
    }
  }
  return [...porSku.entries()]
    .map(([sku, v]) => ({ sku, ...v }))
    .sort((a, b) => b.quantidade - a.quantidade || b.receita - a.receita)
    .slice(0, limite);
}

export function filtrarUltimosMeses(rows: PedidoRow[], agora: Date, meses: number): PedidoRow[] {
  const inicio = inicioJanela(agora, meses);
  return rows.filter((r) => r.data >= inicio);
}
