'use client';

import React from 'react';
import { Bar, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart as RBarChart } from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';
import type { DivergingRow } from './chart-models';

interface DivergingBarChartProps {
  data: DivergingRow[];
  height?: number;
  srSummary: string;
}

/** Δ% do nosso preço vs mediana de mercado: verde abaixo (competitivo), vermelho acima. */
export function DivergingBarChart({ data, height = 240, srSummary }: DivergingBarChartProps) {
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <RBarChart data={data} layout="vertical" margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={chartTheme.grid} horizontal={false} />
            <XAxis type="number" stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} tickFormatter={(v: number) => `${v}%`} />
            <YAxis type="category" dataKey="label" width={110} stroke={chartTheme.grid} tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<GlassTooltip formatValue={(v) => `${v}%`} />} />
            <ReferenceLine x={0} stroke={chartTheme.axis} />
            <Bar dataKey="deltaPct" name="Δ vs mercado" radius={[0, 6, 6, 0]} maxBarSize={18}>
              {data.map((d) => (
                <Cell key={d.label} fill={d.deltaPct > 0 ? '#f87171' : chartTheme.brand} />
              ))}
            </Bar>
          </RBarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">{srSummary}</p>
    </div>
  );
}
