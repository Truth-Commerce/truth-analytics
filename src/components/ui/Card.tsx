import React from 'react';

interface CardProps {
  className?: string;
  children?: React.ReactNode;
  id?: string;
  'data-testid'?: string;
}

export function Card({ className = '', children, lift = true, ...rest }: CardProps & { lift?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-line bg-paper-1 p-5 shadow-paper transition-[transform,border-color,box-shadow] duration-200 ease-truth ${
        lift ? 'hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-[0_16px_42px_rgba(20,18,15,0.08)]' : ''
      } ${className}`}
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
    <As className={`font-heading text-ink ${className}`}>
      {children}
    </As>
  );
}

export function CardContent({ className = '', children }: CardProps) {
  return <div className={className}>{children}</div>;
}
