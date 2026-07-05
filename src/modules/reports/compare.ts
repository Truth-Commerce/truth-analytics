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
