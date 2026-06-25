import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export function Input({ className = '', ...rest }: InputProps) {
  return (
    <input
      className={`w-full bg-bg-elevated border border-line rounded-lg px-3 py-2 text-white placeholder:text-dim focus:border-brand outline-none transition-colors ${className}`}
      {...rest}
    />
  );
}
