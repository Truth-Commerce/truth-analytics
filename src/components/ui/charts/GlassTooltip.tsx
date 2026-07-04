'use client';

import React from 'react';

export interface GlassTooltipPayloadItem {
  name?: string | number;
  value?: string | number;
  color?: string;
}

interface GlassTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: GlassTooltipPayloadItem[];
  formatValue?: (v: number) => string;
}

/** Tooltip glass compartilhado (content custom do Recharts). */
export function GlassTooltip({ active, label, payload, formatValue }: GlassTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-line bg-bg-surface/90 px-3 py-2 backdrop-blur-md">
      {label !== undefined && label !== '' ? (
        <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-muted">{label}</p>
      ) : null}
      {payload.map((item, i) => {
        const raw = typeof item.value === 'number' ? item.value : Number(item.value ?? 0);
        return (
          <p key={i} className="flex items-center gap-2 font-mono text-sm text-white">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: item.color ?? '#07dd2b' }}
            />
            {item.name !== undefined && payload.length > 1 ? (
              <span className="text-muted">{item.name}:</span>
            ) : null}
            {formatValue ? formatValue(raw) : raw}
          </p>
        );
      })}
    </div>
  );
}
