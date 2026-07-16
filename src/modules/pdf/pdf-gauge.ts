/** Helpers puros do gauge/mini-chart do PDF (sem dependência de react-pdf). */
import { formatDataCurta } from '@/lib/format';

export const GAUGE_INICIO = -135;
const GAUGE_VARREDURA = 270;

/** Ângulo em graus com 0° no TOPO, sentido horário (convenção de gauge). */
export function polarToXY(cx: number, cy: number, r: number, anguloGraus: number): { x: number; y: number } {
  const rad = ((anguloGraus - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

export function anguloDoScore(score: number): number {
  return GAUGE_INICIO + (GAUGE_VARREDURA * Math.min(100, Math.max(0, score))) / 100;
}

export function arcoPath(cx: number, cy: number, r: number, inicioGraus: number, fimGraus: number): string {
  const ini = polarToXY(cx, cy, r, inicioGraus);
  const fim = polarToXY(cx, cy, r, fimGraus);
  const largeArc = fimGraus - inicioGraus > 180 ? 1 : 0;
  return `M ${ini.x.toFixed(2)} ${ini.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${fim.x.toFixed(2)} ${fim.y.toFixed(2)}`;
}

/** Barras normalizadas (0–100%) da evolução para o mini-chart do PDF. */
export function barrasEvolucao(
  evolucao: { data: string; total: number }[],
  maxBarras = 31,
): { label: string; pct: number }[] {
  const fatia = evolucao.slice(-maxBarras);
  const max = Math.max(0, ...fatia.map((e) => e.total));
  return fatia.map((e) => ({
    label: formatDataCurta(e.data),
    pct: max <= 0 ? 0 : Math.round((e.total / max) * 100),
  }));
}
