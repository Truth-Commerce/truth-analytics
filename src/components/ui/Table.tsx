import React from 'react';

interface TableWrapperProps {
  className?: string;
  children?: React.ReactNode;
  'data-testid'?: string;
}

export function Table({ className = '', children, ...rest }: TableWrapperProps) {
  return (
    // `relative` faz o wrapper ser o containing block dos descendentes
    // position:absolute (ex.: <th><span class="sr-only">). Sem isso, essas
    // células sr-only se posicionam relativas ao <html> e "escapam" do
    // overflow-x-auto, estourando a largura da página no mobile (375px).
    <div className="relative overflow-x-auto">
      <table className={`w-full text-sm ${className}`} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className = '', children }: TableWrapperProps) {
  return (
    <thead className={`border-b border-line ${className}`}>
      {children}
    </thead>
  );
}

export function TBody({ className = '', children }: TableWrapperProps) {
  return <tbody className={className}>{children}</tbody>;
}

export function TR({ className = '', children }: TableWrapperProps) {
  return (
    <tr className={`border-b border-line/50 last:border-0 ${className}`}>
      {children}
    </tr>
  );
}

export function TH({ className = '', children }: TableWrapperProps) {
  return (
    <th
      className={`py-2 px-3 text-left text-xs font-medium uppercase tracking-wide text-muted ${className}`}
    >
      {children}
    </th>
  );
}

interface TDProps extends TableWrapperProps {
  numeric?: boolean;
}

export function TD({ className = '', children, numeric = false, ...rest }: TDProps) {
  return (
    <td
      className={`py-2 px-3 text-white/90 ${numeric ? 'font-mono text-right' : ''} ${className}`}
      {...rest}
    >
      {children}
    </td>
  );
}
