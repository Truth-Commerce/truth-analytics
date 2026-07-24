import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function Input({ className = '', ...rest }: InputProps) {
  return (
    <input
      className={`w-full rounded-xl border border-line bg-paper-1 px-3 py-2.5 text-ink shadow-sm placeholder:text-ink-muted outline-none transition-[border-color,box-shadow] focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 ${className}`}
      {...rest}
    />
  );
}
