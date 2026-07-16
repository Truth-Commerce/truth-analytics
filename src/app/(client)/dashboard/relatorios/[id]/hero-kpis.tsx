import React from 'react';

import { formatBRL } from '@/lib/format';
import type { Destaque } from '@/modules/pipeline/contracts';
import type { HeroKpis } from '@/modules/reports/report-view-model';
import { Stat } from '@/components/ui/Stat';

function DeltaTag({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return null;
  const positivo = deltaPct >= 0;
  return (
    <span className={`font-mono text-xs ${positivo ? 'text-brand' : 'text-danger-fg'}`}>
      {positivo ? '▲' : '▼'} {positivo ? '+' : ''}
      {deltaPct.toLocaleString('pt-BR')}% vs anterior
    </span>
  );
}

const DIRECAO_ICONE: Record<Destaque['direcao'], string> = { up: '▲', down: '▼', flat: '→' };
const DIRECAO_COR: Record<Destaque['direcao'], string> = {
  up: 'text-brand',
  down: 'text-danger-fg',
  flat: 'text-muted',
};

/** Faixa de 4 KPIs do hero + destaques da IA (quando presentes). */
export function HeroKpisFaixa({ kpis, destaques }: { kpis: HeroKpis; destaques?: Destaque[] }) {
  return (
    <div data-testid="hero-kpis" className="relative mt-6 grid grid-cols-2 gap-6 border-t border-line pt-6 md:grid-cols-4">
      <Stat label="Total do período" value={formatBRL(kpis.total.valor)} data-testid="hero-total" />
      <Stat label="Pedidos" value={kpis.pedidos.valor} />
      <Stat label="Ticket médio" value={formatBRL(kpis.ticket.valor)} />
      {kpis.score ? (
        <Stat
          label="Truth Score"
          value={`${kpis.score.valor}/100`}
          hint={
            kpis.score.deltaAbs === null
              ? undefined
              : `${kpis.score.deltaAbs >= 0 ? '+' : ''}${kpis.score.deltaAbs} pts vs anterior`
          }
        />
      ) : (
        <Stat label="Truth Score" value="—" hint="disponível a partir deste ciclo" />
      )}
      <div className="col-span-2 -mt-4 flex gap-6 md:col-span-4">
        <DeltaTag deltaPct={kpis.total.deltaPct} />
        <DeltaTag deltaPct={kpis.ticket.deltaPct} />
      </div>
      {destaques && destaques.length > 0 ? (
        <ul className="col-span-2 flex flex-wrap gap-2 md:col-span-4">
          {destaques.map((d) => (
            <li key={d.label} className="flex items-center gap-1.5 rounded-full border border-line bg-bg-elevated px-3 py-1 text-xs">
              <span aria-hidden="true" className={DIRECAO_COR[d.direcao]}>{DIRECAO_ICONE[d.direcao]}</span>
              <span className="text-muted">{d.label}:</span>
              <span className="font-mono text-white">{d.valor}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
