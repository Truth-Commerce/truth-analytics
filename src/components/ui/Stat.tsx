import React from 'react';

interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
  'data-testid'?: string;
}

export function Stat({ label, value, hint, className = '', ...rest }: StatProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`} {...rest}>
      <span className="text-xs text-muted uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-mono font-bold text-white">{value}</span>
      {hint && <span className="text-xs text-dim">{hint}</span>}
    </div>
  );
}
