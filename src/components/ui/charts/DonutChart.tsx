'use client';

import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { seriesColor } from './chart-theme';
import { GlassTooltip } from './GlassTooltip';

interface DonutChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
}

export function DonutChart({ data, height = 240, formatValue }: DonutChartProps) {
  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <PieChart>
            <Tooltip content={<GlassTooltip formatValue={formatValue} />} />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={3}
              stroke="#0a0c10"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={seriesColor(i)} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center gap-1.5 text-xs text-muted">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: seriesColor(i) }}
            />
            {d.label}
          </li>
        ))}
      </ul>
      <p className="sr-only">
        {data.map((d) => `${d.label}: ${formatValue ? formatValue(d.value) : d.value}`).join('; ')}
      </p>
    </div>
  );
}
