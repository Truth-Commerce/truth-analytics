import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

export function Select({ className = '', children, ...rest }: SelectProps) {
  return (
    <select
      className={`w-full bg-bg-elevated border border-line rounded-lg px-3 py-2 text-white outline-none transition-colors appearance-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/50 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
