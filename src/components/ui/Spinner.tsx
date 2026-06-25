import React from 'react';

interface SpinnerProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
};

export function Spinner({ className = '', size = 'md' }: SpinnerProps) {
  return (
    <span role="status" className={`inline-flex items-center justify-center ${className}`}>
      <span
        className={`${sizeClasses[size]} animate-spin rounded-full border-brand border-t-transparent`}
        aria-hidden="true"
      />
      <span className="sr-only">Carregando</span>
    </span>
  );
}
