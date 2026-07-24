'use client';

import React from 'react';
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { chartTheme } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
}

export function BarChart({ data, height = 260, formatValue }: BarChartProps) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RBarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke={chartTheme.grid} vertical={false} />
          <XAxis
            dataKey="label"
            stroke={chartTheme.grid}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
          />
          <YAxis
            width={70}
            stroke={chartTheme.grid}
            tick={{ fill: chartTheme.axis, fontSize: 11, fontFamily: 'var(--font-mono)' }}
            tickLine={false}
            tickFormatter={(v: number) => (formatValue ? formatValue(v) : String(v))}
          />
          <Tooltip
            cursor={{ fill: 'rgba(20,18,15,0.04)' }}
            content={<GlassTooltip formatValue={formatValue} />}
          />
          <Bar dataKey="value" fill={chartTheme.brand} radius={[6, 6, 0, 0]} maxBarSize={40} />
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}
