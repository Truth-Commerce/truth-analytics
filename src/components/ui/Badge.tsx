import React from 'react';

type BadgeVariant = 'mono' | 'success' | 'warn' | 'danger' | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  mono: 'font-sans font-semibold uppercase tracking-wider text-[10px] text-brand-strong bg-brand-soft border border-success-border rounded-full px-3 py-1',
  success:
    'text-[11px] text-success-fg bg-success-tint border border-success-border rounded-full px-3 py-1',
  warn: 'text-[11px] text-warning-fg bg-warning-tint border border-warning-border rounded-full px-3 py-1',
  danger:
    'text-[11px] text-danger-fg bg-danger-tint border border-danger-border rounded-full px-3 py-1',
  neutral:
    'text-[11px] text-ink-soft bg-paper-2 border border-line rounded-full px-3 py-1',
};

export function Badge({ variant = 'neutral', className = '', children, ...rest }: BadgeProps) {
  return (
    <span className={`inline-flex items-center ${variantClasses[variant]} ${className}`} {...rest}>
      {children}
    </span>
  );
}
