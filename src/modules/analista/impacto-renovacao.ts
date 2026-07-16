export type PontaRelatorio = { total: number; score: number | null; periodoFim: Date };

export type ImpactoOrg = {
  orgId: string;
  orgName: string;
  primeiro: PontaRelatorio | null;
  ultimo: PontaRelatorio | null;
  deltaFaturamentoPct: number | null;
  deltaScore: number | null;
  tasksConcluidas: number;
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Payoff da consultoria: 1º vs último relatório done + tasks concluídas no intervalo (puro). */
export function impactoRenovacao(input: {
  orgId: string;
  orgName: string;
  primeiro: PontaRelatorio | null;
  ultimo: PontaRelatorio | null;
  tasksConcluidas: number;
}): ImpactoOrg {
  const { primeiro, ultimo } = input;
  const deltaFaturamentoPct =
    primeiro && ultimo && primeiro.total > 0 ? round1(((ultimo.total - primeiro.total) / primeiro.total) * 100) : null;
  const deltaScore =
    primeiro && ultimo && primeiro.score !== null && ultimo.score !== null ? ultimo.score - primeiro.score : null;
  return { ...input, deltaFaturamentoPct, deltaScore };
}
