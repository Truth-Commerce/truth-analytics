'use client';

import React, { useId } from 'react';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  className?: string;
}

/** Tooltip CSS (hover/focus-within) com aria-describedby — sem dependências. */
export function Tooltip({ content, children, className = '' }: TooltipProps) {
  const id = useId();
  return (
    <span className={`group relative inline-flex ${className}`} aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg border border-line bg-bg-elevated/95 px-2.5 py-1 text-xs text-white opacity-0 backdrop-blur-sm transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
