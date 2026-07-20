/**
 * Inteligência comparativa da carteira (H4 T7) — módulo PURO (zero I/O),
 * testável em node. Consome `OrgResumo[]` (T3, já escopado por papel) e
 * dados já lidos de fora (ex.: vendas por canal do último `done` de cada
 * org) — este arquivo só compara/agrupa/rankeia, nunca busca dado.
 */
import { deltaNumero } from '@/modules/reports/compare';
import type { OrgResumo } from './carteira-data.repository';

import type { TaskTipo } from '@/modules/tasks/task.types';

// ---------------------------------------------------------------------------
// Quadrantes crescimento% × volume
// ---------------------------------------------------------------------------

export const QUADRANTE_LABELS = ['Estrelas', 'Crescendo', 'Estáveis', 'Atenção'] as const;
export type QuadranteLabel = (typeof QUADRANTE_LABELS)[number];

export type OrgQuadrante = {
  orgId: string;
  orgName: string;
  /** null quando não há base de comparação (faturamentoMesAnterior = 0). */
  crescimentoPct: number | null;
  volume: number;
  quadrante: QuadranteLabel;
};

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 === 0 ? (ordenado[meio - 1]! + ordenado[meio]!) / 2 : ordenado[meio]!;
}

/**
 * Quadrantes da carteira: eixo X = crescimento (faturamentoMes vs mês
 * anterior, via `deltaNumero`); eixo Y = volume (faturamentoMes vs a MEDIANA
 * da própria carteira nesta chamada).
 *
 * Fronteiras (documentadas, ambas INCLUSIVAS no lado "positivo"):
 * - crescimento >= 0% → "crescendo"; < 0% → "caindo". Quando não há base de
 *   comparação (`faturamentoMesAnterior` = 0, `deltaPct` null), decide pelo
 *   sinal do próprio mês: `faturamentoMes` > 0 → "crescendo" (crescimento "do
 *   zero"); = 0 (org sem nenhum dado) → "caindo" (não há sinal de
 *   crescimento a favor da org).
 * - volume >= mediana da carteira → "alto"; < mediana → "baixo" (empate na
 *   mediana entra em "alto" — inclusivo, mesma convenção do eixo X).
 *
 * Combinação → rótulo pt-BR:
 *   crescendo + alto    → Estrelas
 *   crescendo + baixo   → Crescendo
 *   caindo    + alto    → Estáveis
 *   caindo    + baixo   → Atenção
 */
export function quadrantesCarteira(resumos: OrgResumo[]): OrgQuadrante[] {
  const medianaVolume = mediana(resumos.map((r) => r.faturamentoMes));
  return resumos.map((r) => {
    const delta = deltaNumero(r.faturamentoMes, r.faturamentoMesAnterior);
    const crescendo = delta.deltaPct === null ? r.faturamentoMes > 0 : delta.deltaPct >= 0;
    const volumeAlto = r.faturamentoMes >= medianaVolume;
    const quadrante: QuadranteLabel = crescendo
      ? volumeAlto
        ? 'Estrelas'
        : 'Crescendo'
      : volumeAlto
        ? 'Estáveis'
        : 'Atenção';
    return {
      orgId: r.orgId,
      orgName: r.orgName,
      crescimentoPct: delta.deltaPct,
      volume: r.faturamentoMes,
      quadrante,
    };
  });
}

/** Conta orgs por quadrante — pronto para o DonutChart da UI. Sempre inclui as 4 chaves, mesmo com 0 orgs. */
export function contarPorQuadrante(quadrantes: OrgQuadrante[]): Record<QuadranteLabel, number> {
  const base = Object.fromEntries(QUADRANTE_LABELS.map((label) => [label, 0])) as Record<QuadranteLabel, number>;
  for (const q of quadrantes) base[q.quadrante] += 1;
  return base;
}

// ---------------------------------------------------------------------------
// Agrupamento por nicho
// ---------------------------------------------------------------------------

export const SEM_NICHO = 'sem nicho';

export type NichoGroup = {
  nicho: string;
  quantidade: number;
  faturamentoMedio: number;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Agrupa a carteira por nicho (contagem + faturamento médio); nicho `null` vira o grupo `'sem nicho'`. Ordenado por quantidade desc, empate por nome do nicho asc. */
export function agruparPorNicho(resumos: OrgResumo[]): NichoGroup[] {
  const acc = new Map<string, { quantidade: number; total: number }>();
  for (const r of resumos) {
    const chave = r.nicho ?? SEM_NICHO;
    const cur = acc.get(chave) ?? { quantidade: 0, total: 0 };
    cur.quantidade += 1;
    cur.total += r.faturamentoMes;
    acc.set(chave, cur);
  }
  return Array.from(acc.entries())
    .map(([nicho, v]) => ({ nicho, quantidade: v.quantidade, faturamentoMedio: round2(v.total / v.quantidade) }))
    .sort((a, b) => b.quantidade - a.quantidade || a.nicho.localeCompare(b.nicho, 'pt-BR'));
}

// ---------------------------------------------------------------------------
// Ranking de canais da carteira
// ---------------------------------------------------------------------------

export type CanalRanking = { canal: string; total: number; participacaoPct: number };

/**
 * Rankeia canais agregando `total` por `canal` (mesmo canal em orgs
 * diferentes soma). Entrada crua vem de um repo helper que lê o
 * `vendasPorCanal` do último relatório `done` de cada org da carteira — esta
 * função só agrega/ordena, não faz I/O. `participacaoPct` arredondado em 1
 * casa; 0 quando o total geral é 0 (sem dividir por zero).
 */
export function rankearCanaisCarteira(entradas: Array<{ canal: string; total: number }>): CanalRanking[] {
  const acc = new Map<string, number>();
  for (const e of entradas) acc.set(e.canal, (acc.get(e.canal) ?? 0) + e.total);
  const totalGeral = Array.from(acc.values()).reduce((s, v) => s + v, 0);
  return Array.from(acc.entries())
    .map(([canal, total]) => ({
      canal,
      total: round2(total),
      participacaoPct: totalGeral === 0 ? 0 : Math.round((total / totalGeral) * 1000) / 10,
    }))
    .sort((a, b) => b.total - a.total || a.canal.localeCompare(b.canal, 'pt-BR'));
}

// ---------------------------------------------------------------------------
// "O que funcionou" — tasks concluídas com impacto positivo, replicáveis
// ---------------------------------------------------------------------------

export type TaskReplicavel = {
  taskId: string;
  orgId: string;
  orgName: string;
  titulo: string;
  tipo: TaskTipo;
  /** delta % de vendas medido pelo motor de impacto (F2) — só entram candidatos > 0. */
  deltaPct: number;
};

/** Filtra candidatos com impacto realmente positivo (`deltaPct` > 0) e ordena por impacto desc — a lista final de "o que funcionou" pronta para sugerir réplica. */
export function sugestoesReplicaveis(candidatos: TaskReplicavel[]): TaskReplicavel[] {
  return candidatos.filter((c) => c.deltaPct > 0).sort((a, b) => b.deltaPct - a.deltaPct);
}
