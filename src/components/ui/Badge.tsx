import React from 'react';

type BadgeVariant = 'mono' | 'success' | 'warn' | 'danger' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children?: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  mono: 'font-mono uppercase tracking-wider text-[11px] text-brand bg-brand-glow border border-brand/30 rounded-full px-3 py-1',
  success: 'text-[11px] text-green-400 bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1',
  warn: 'text-[11px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/30 rounded-full px-3 py-1',
  danger: 'text-[11px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-3 py-1',
  neutral: 'text-[11px] text-white/60 bg-white/10 border border-white/10 rounded-full px-3 py-1',
};

export function Badge({ variant = 'neutral', className = '', children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
