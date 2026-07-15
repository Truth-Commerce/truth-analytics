'use client';

import React from 'react';
import { motion } from 'framer-motion';

import { fadeLift } from '@/lib/motion';
import { formatBRL, formatBRLCompacto } from '@/lib/format';
import { LineChart, type XY } from '@/components/ui/charts/LineChart';
import { DonutChart } from '@/components/ui/charts/DonutChart';

interface DashboardChartsProps {
  evolucao: XY[];
  canais: { label: string; value: number }[];
  srSummary: string;
}

/** Bento: evolução (linha com gradiente) + canais (donut). */
export function DashboardCharts({ evolucao, canais, srSummary }: DashboardChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <motion.div
        variants={fadeLift}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-line bg-bg-surface p-5 lg:col-span-2"
      >
        <h2 className="mb-3 font-heading text-base font-semibold text-white">Evolução de vendas</h2>
        {/* Eixo Y compacto ("R$ 2k") conserta o corte do "R$" visto no QA;
            tooltip continua com o valor completo. */}
        <LineChart
          data={evolucao}
          formatY={formatBRLCompacto}
          formatTooltip={formatBRL}
          srSummary={srSummary}
        />
      </motion.div>
      <motion.div
        variants={fadeLift}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-line bg-bg-surface p-5"
      >
        <h2 className="mb-3 font-heading text-base font-semibold text-white">Vendas por canal</h2>
        <DonutChart data={canais} formatValue={formatBRL} />
      </motion.div>
    </div>
  );
}
