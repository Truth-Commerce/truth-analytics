import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  'data-testid'?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-glass px-6 py-10 text-center ${className}`}
      {...rest}
    >
      {icon ? <div className="text-brand">{icon}</div> : null}
      <p className="font-heading text-sm font-semibold text-white">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
