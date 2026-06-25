import React from 'react';

interface CardProps {
  className?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}

export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`bg-bg-surface border border-line rounded-2xl p-5 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children }: CardProps) {
  return (
    <div className={`mb-4 flex items-center justify-between gap-2 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({
  className = '',
  children,
  as: As = 'h2',
}: CardProps & { as?: 'h2' | 'h3' | 'h4' }) {
  return (
    <As className={`font-heading font-semibold text-white ${className}`}>
      {children}
    </As>
  );
}

export function CardContent({ className = '', children }: CardProps) {
  return <div className={className}>{children}</div>;
}
