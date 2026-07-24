import React from 'react';

/** Shimmer verde sutil sobre superfície de papel. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-shimmer rounded-lg bg-[linear-gradient(90deg,#ebe6dc_25%,#d9efde_50%,#ebe6dc_75%)] bg-[length:200%_100%] motion-reduce:animate-none ${className}`}
    />
  );
}
