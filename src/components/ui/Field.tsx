import React from 'react';

interface FieldProps {
  label: string;
  htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
  error?: string;
}

export function Field({ label, htmlFor, className = '', children, error }: FieldProps) {
  const errorId = htmlFor ? `${htmlFor}-erro` : undefined;
  const child =
    error && errorId && React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          'aria-invalid': true,
          'aria-describedby': errorId,
        })
      : children;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-muted">
        {label}
      </label>
      {child}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}
