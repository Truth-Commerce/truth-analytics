import React from 'react';

type AlertVariant = 'info' | 'success' | 'warning' | 'danger';

interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}

const variantClasses: Record<AlertVariant, string> = {
  info: 'border-line bg-glass text-muted',
  success: 'border-success-border bg-success-tint text-success-fg',
  warning: 'border-warning-border bg-warning-tint text-warning-fg',
  danger: 'border-danger-border bg-danger-tint text-danger-fg',
};

export function Alert({ variant = 'info', title, className = '', children }: AlertProps) {
  return (
    <div
      role={variant === 'danger' ? 'alert' : undefined}
      className={`rounded-2xl border px-4 py-3 text-sm ${variantClasses[variant]} ${className}`}
    >
      {title ? <p className="mb-0.5 font-medium">{title}</p> : null}
      {children}
    </div>
  );
}
