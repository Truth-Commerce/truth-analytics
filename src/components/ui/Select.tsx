import React from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

export function Select({ className = '', children, ...rest }: SelectProps) {
  return (
    <select
      className={`w-full appearance-none rounded-xl border border-line bg-paper-1 px-3 py-2.5 text-ink shadow-sm outline-none transition-[border-color,box-shadow] focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 ${className}`}
      {...rest}
    >
      {children}
    </select>
  );
}
