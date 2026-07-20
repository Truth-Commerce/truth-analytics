/**
 * Performance por analista (H4 T8) — módulo PURO (zero I/O), testável em
 * node. Consome `OrgResumo[]` (T3, já escopado por papel — aqui sempre o
 * escopo admin = TODAS as orgs cliente) + insumos já lidos de fora (map
 * orgId→analistaId, tasks concluídas 30d por analista, entradas de impacto
 * medidas pelo motor F2). Este arquivo só agrupa/agrega/ordena, nunca busca
 * dado — mesma separação de `comparativo.ts` vs `comparativo-data.repository.ts`.
 */
import type { OrgResumo } from '@/modules/analista/carteira-data.repository';

/** "Cliente em risco" = org com `risco.score >= 50` (mesmo limiar de LIMIAR_CRITICO em score-risco.ts). */
export const CLIENTE_EM_RISCO_SCORE_MINIMO = 50;

export type AnalistaBase = { analistaId: string; email: string };

/** Uma entrada por task concluída com impacto MEDIDO pelo motor F2 (`getTaskImpact`) — positivo ou não; a decisão de filtrar só os positivos é desta função (não do repo I/O). */
export type TaskImpactoAnalista = { analistaId: string; deltaPct: number };

export type PerformanceAnalista = {
  analistaId: string;
  email: string;
  nOrgs: number;
  faturamentoCarteira: number;
  tasksConcluidas30d: number;
  /** Média do `deltaPct` só das tasks com impacto POSITIVO (>0); 0 quando não há nenhuma. */
  impactoPositivoAgregado: number;
  /** % de tasks abertas EM DIA (não atrasadas); null quando o analista não tem nenhuma task aberta p/ medir. */
  slaPct: number | null;
  clientesEmRisco: number;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Agrega performance por analista. Orgs SEM analista atribuído (ausentes ou
 * `null`/`undefined` em `analistaPorOrg`) são EXCLUÍDAS de qualquer linha —
 * decisão deliberada: a tabela é "por analista", não existe uma linha
 * "sem analista" (o hero/fila da home admin já cobre a carteira inteira,
 * incluindo essas orgs; esta tabela é um corte específico por dono).
 * Analistas em `analistas` sem nenhuma org aparecem mesmo assim (linha
 * zerada) — garante visibilidade de quem está sem carteira atribuída.
 */
export function performancePorAnalista(input: {
  analistas: AnalistaBase[];
  resumos: OrgResumo[];
  analistaPorOrg: Map<string, string>;
  concluidas30dPorAnalista: Map<string, number>;
  impactos: TaskImpactoAnalista[];
}): PerformanceAnalista[] {
  const { analistas, resumos, analistaPorOrg, concluidas30dPorAnalista, impactos } = input;

  const orgsPorAnalista = new Map<string, OrgResumo[]>();
  for (const r of resumos) {
    const analistaId = analistaPorOrg.get(r.orgId);
    if (!analistaId) continue; // org sem analista atribuído — fora de qualquer linha
    const lista = orgsPorAnalista.get(analistaId) ?? [];
    lista.push(r);
    orgsPorAnalista.set(analistaId, lista);
  }

  const impactosPorAnalista = new Map<string, number[]>();
  for (const i of impactos) {
    if (i.deltaPct <= 0) continue; // só impacto POSITIVO entra no agregado
    const lista = impactosPorAnalista.get(i.analistaId) ?? [];
    lista.push(i.deltaPct);
    impactosPorAnalista.set(i.analistaId, lista);
  }

  const linhas = analistas.map((a): PerformanceAnalista => {
    const orgs = orgsPorAnalista.get(a.analistaId) ?? [];
    const faturamentoCarteira = round2(orgs.reduce((s, o) => s + o.faturamentoMes, 0));
    const tasksAbertasTotal = orgs.reduce((s, o) => s + o.tasksAbertas, 0);
    const tasksAtrasadasTotal = orgs.reduce((s, o) => s + o.tasksAtrasadas, 0);
    const positivos = impactosPorAnalista.get(a.analistaId) ?? [];

    return {
      analistaId: a.analistaId,
      email: a.email,
      nOrgs: orgs.length,
      faturamentoCarteira,
      tasksConcluidas30d: concluidas30dPorAnalista.get(a.analistaId) ?? 0,
      impactoPositivoAgregado:
        positivos.length === 0 ? 0 : round1(positivos.reduce((s, v) => s + v, 0) / positivos.length),
      slaPct:
        tasksAbertasTotal === 0
          ? null
          : round1(((tasksAbertasTotal - tasksAtrasadasTotal) / tasksAbertasTotal) * 100),
      clientesEmRisco: orgs.filter((o) => o.risco.score >= CLIENTE_EM_RISCO_SCORE_MINIMO).length,
    };
  });

  return linhas.sort(
    (a, b) => b.faturamentoCarteira - a.faturamentoCarteira || a.email.localeCompare(b.email, 'pt-BR'),
  );
}
