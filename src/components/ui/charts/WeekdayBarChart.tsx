'use client';

import React from 'react';

import { BarChart } from './BarChart';

interface WeekdayBarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
  srSummary: string;
}

/** Média de vendas por dia-da-semana — BarChart da casa + resumo acessível. */
export function WeekdayBarChart({ data, height = 240, formatValue, srSummary }: WeekdayBarChartProps) {
  return (
    <div>
      <BarChart data={data} height={height} formatValue={formatValue} />
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
