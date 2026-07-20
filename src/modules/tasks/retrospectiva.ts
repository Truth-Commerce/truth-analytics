export type Retrospectiva = {
  planejadas: number;
  concluidas: number;
  taxaConclusao: number;
  impactoBRL: number;
};

/**
 * Fecha os números de um ciclo (retrospectiva): `taxaConclusao` =
 * round(concluidas/planejadas*100), 0 quando planejadas=0 (evita divisão por
 * zero). `impactoBRL` já vem somado do repo — soma do motor F2
 * (`task-impact.getTaskImpact`, `totalAtual - totalOrigem`) nas tasks
 * concluídas do ciclo. Esta função é pura: só formata/agrega o pacote final,
 * não recalcula nem valida o impacto.
 */
export function retrospectiva(planejadas: number, concluidas: number, impactoBRL: number): Retrospectiva {
  const taxaConclusao = planejadas === 0 ? 0 : Math.round((concluidas / planejadas) * 100);
  return { planejadas, concluidas, taxaConclusao, impactoBRL };
}
