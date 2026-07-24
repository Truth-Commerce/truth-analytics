import React from 'react';

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 font-heading text-2xl text-ink">{children}</h2>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[15px] leading-7 text-ink-soft">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mb-3 list-disc space-y-2 pl-5 text-[15px] leading-7 text-ink-soft marker:text-brand">{children}</ul>;
}
