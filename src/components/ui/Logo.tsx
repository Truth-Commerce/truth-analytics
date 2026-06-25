import React from 'react';

type LogoSize = 'sm' | 'md' | 'lg';

interface LogoProps {
  withMark?: boolean;
  size?: LogoSize;
  className?: string;
}

const sizeClasses: Record<LogoSize, string> = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-3xl',
};

const iconSizes: Record<LogoSize, number> = {
  sm: 16,
  md: 20,
  lg: 28,
};

function RocketIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Rocket body */}
      <path
        d="M12 2C12 2 7 8 7 14c0 2.5 2 4 5 4s5-1.5 5-4c0-6-5-12-5-12Z"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Flame */}
      <path
        d="M10 18c0 2 2 4 2 4s2-2 2-4"
        stroke="#07dd2b"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Window */}
      <circle cx="12" cy="12" r="1.5" fill="#07dd2b" />
    </svg>
  );
}

export function Logo({ withMark = false, size = 'md', className = '' }: LogoProps) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-heading font-bold select-none ${sizeClasses[size]} ${className}`}
    >
      {withMark && <RocketIcon size={iconSizes[size]} />}
      <span>
        <span className="text-brand">Truth</span>
        <span className="text-white">Analytics</span>
      </span>
    </span>
  );
}
