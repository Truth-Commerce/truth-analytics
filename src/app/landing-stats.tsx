'use client';

import { useCountUp } from '@/lib/motion';
import { LANDING_METRICAS } from './landing-data';

function StatCountUp({ alvo, label }: { alvo: number; label: string }) {
  const valor = Math.round(useCountUp(alvo, 1.2));
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <span className="font-mono text-4xl font-bold text-brand">{valor}</span>
      <span className="max-w-[16rem] text-sm text-muted">{label}</span>
    </div>
  );
}

/** Faixa de números do produto (count-up real — nada inventado). */
export function LandingStats() {
  return (
    <div className="grid gap-8 sm:grid-cols-3">
      {LANDING_METRICAS.map((m) => (
        <StatCountUp key={m.label} alvo={m.alvo} label={m.label} />
      ))}
    </div>
  );
}
