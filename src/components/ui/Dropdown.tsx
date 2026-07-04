'use client';

import React, { useEffect, useRef, useState } from 'react';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'start' | 'end';
  triggerLabel?: string;
}

export function Dropdown({ trigger, children, align = 'end', triggerLabel }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerLabel}
        onClick={() => setOpen((v) => !v)}
        className="rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/50"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute z-40 mt-2 min-w-44 rounded-2xl border border-line bg-bg-surface/95 p-1.5 backdrop-blur-md ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface DropdownItemProps {
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  children: React.ReactNode;
}

export function DropdownItem({ href, onSelect, danger = false, children }: DropdownItemProps) {
  const cls = `block w-full rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/50 ${
    danger ? 'text-danger-fg hover:bg-danger-tint' : 'text-muted hover:bg-white/5 hover:text-white'
  }`;
  if (href) {
    return (
      <a role="menuitem" href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button role="menuitem" type="button" onClick={onSelect} className={cls}>
      {children}
    </button>
  );
}
