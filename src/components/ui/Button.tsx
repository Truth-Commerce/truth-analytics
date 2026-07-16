import React from 'react';
import Link from 'next/link';

import { isInternalHref } from './href';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: React.ReactNode;
}

interface ButtonAsButton extends ButtonBaseProps {
  as?: 'button';
  href?: undefined;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  'data-testid'?: string;
  form?: string;
}

interface ButtonAsAnchor extends ButtonBaseProps {
  as: 'a';
  href: string;
  type?: undefined;
  disabled?: undefined;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  'data-testid'?: string;
  form?: undefined;
}

type ButtonProps = ButtonAsButton | ButtonAsAnchor;

const FOCUS_RING =
  'focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base';

const FOCUS_RING_DANGER =
  'focus-visible:ring-2 focus-visible:ring-danger/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base';

const variantClasses: Record<ButtonVariant, string> = {
  primary: `bg-brand text-[#04150a] font-semibold hover:shadow-glow focus-visible:shadow-glow ${FOCUS_RING} disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none`,
  secondary: `border border-strong bg-white/5 text-white hover:bg-white/10 ${FOCUS_RING} disabled:opacity-50 disabled:cursor-not-allowed`,
  ghost: `text-muted hover:text-white ${FOCUS_RING} disabled:opacity-50 disabled:cursor-not-allowed`,
  danger: `border border-danger-border text-danger-fg hover:bg-danger-tint ${FOCUS_RING_DANGER} disabled:opacity-50 disabled:cursor-not-allowed`,
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2 text-sm',
};

export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: ButtonProps) {
  const base = `inline-flex items-center justify-center rounded-full font-medium transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-200 ease-truth outline-none focus-visible:outline-none ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  if (rest.as === 'a') {
    const { as: _as, href, ...anchorRest } = rest as ButtonAsAnchor;
    if (isInternalHref(href)) {
      return (
        <Link href={href} className={base} {...anchorRest}>
          {children}
        </Link>
      );
    }
    return (
      <a href={href} className={base} {...anchorRest}>
        {children}
      </a>
    );
  }

  const { as: _as, href: _href, ...btnRest } = rest as ButtonAsButton & { href?: undefined };
  return (
    <button className={base} {...btnRest}>
      {children}
    </button>
  );
}
