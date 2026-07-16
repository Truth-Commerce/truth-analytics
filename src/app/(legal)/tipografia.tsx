import React from 'react';

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-8 font-heading text-lg font-semibold text-white">{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-muted">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">{children}</ul>;
}
