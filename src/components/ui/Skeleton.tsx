import React from 'react';

/** Shimmer verde sutil sobre superfície escura. */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-shimmer rounded-lg bg-[linear-gradient(90deg,#ffffff08_25%,#07dd2b14_50%,#ffffff08_75%)] bg-[length:200%_100%] motion-reduce:animate-none ${className}`}
    />
  );
}
