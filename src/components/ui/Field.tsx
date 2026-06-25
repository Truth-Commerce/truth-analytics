import React from 'react';

interface FieldProps {
  label: string;
  htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
  error?: string;
}

export function Field({ label, htmlFor, className = '', children, error }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm text-muted font-medium">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
