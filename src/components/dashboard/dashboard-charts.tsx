'use client';

import React from 'react';
import { m } from 'framer-motion';
import dynamic from 'next/dynamic';

import { fadeLift } from '@/lib/motion';
import { coresDosCanais } from '@/lib/canal-visual';
import { formatBRL, formatBRLCompacto } from '@/lib/format';
import { Skeleton } from '@/components/ui/Skeleton';
import type { XY } from '@/components/ui/charts/LineChart';

// recharts é pesado e os dois gráficos ficam sob a dobra do dashboard —
// carregá-los via next/dynamic (ssr:false) tira o recharts do bundle inicial
// da rota. Skeleton curto enquanto o chunk chega. Os charts do RELATÓRIO
// continuam SSR (decisão 16): são o conteúdo principal daquela página.
const LineChart = dynamic(
  () => import('@/components/ui/charts/LineChart').then((mod) => mod.LineChart),
  { ssr: false, loading: () => <Skeleton className="h-[260px] rounded-2xl" /> },
);
const DonutChart = dynamic(
  () => import('@/components/ui/charts/DonutChart').then((mod) => mod.DonutChart),
  { ssr: false, loading: () => <Skeleton className="h-[240px] rounded-2xl" /> },
);

interface DashboardChartsProps {
  evolucao: XY[];
  canais: { label: string; value: number }[];
  srSummary: string;
}

/** Bento: evolução (linha com gradiente) + canais (donut). */
export function DashboardCharts({ evolucao, canais, srSummary }: DashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <m.div
        variants={fadeLift}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-line bg-bg-surface p-5 lg:col-span-2"
      >
        <h2 className="mb-3 font-heading text-base font-semibold text-ink">Evolução de vendas</h2>
        {/* Eixo Y compacto ("R$ 2k") conserta o corte do "R$" visto no QA;
            tooltip continua com o valor completo. */}
        <LineChart
          data={evolucao}
          formatY={formatBRLCompacto}
          formatTooltip={formatBRL}
          srSummary={srSummary}
        />
      </m.div>
      <m.div
        variants={fadeLift}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-line bg-bg-surface p-5"
      >
        <h2 className="mb-3 font-heading text-base font-semibold text-ink">Vendas por canal</h2>
        <DonutChart data={canais} formatValue={formatBRL} colors={coresDosCanais(canais.map((c) => c.label))} />
      </m.div>
    </div>
  );
}
