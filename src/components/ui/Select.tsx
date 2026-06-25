import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

export function Select({ className = '', children, ...rest }: SelectProps) {
  return (
    <select
      className={`w-full bg-bg-elevated border border-line rounded-lg px-3 py-2 text-white focus:border-brand outline-none transition-colors appearance-none ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
