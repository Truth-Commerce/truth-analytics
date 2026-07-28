'use client';

import React, { useRef, useState } from 'react';

export interface TabItem {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabsProps {
  items: TabItem[];
  defaultValue?: string;
  className?: string;
}

export function Tabs({ items, defaultValue, className = '' }: TabsProps) {
  const ids = items.map((item) => item.id);
  const [active, setActive] = useState(() => resolveTabValue(ids, defaultValue, items[0]?.id));
  const [previousDefault, setPreviousDefault] = useState(defaultValue);
  const listRef = useRef<HTMLDivElement>(null);

  if (previousDefault !== defaultValue) {
    setPreviousDefault(defaultValue);
    if (defaultValue && ids.includes(defaultValue)) setActive(defaultValue);
  }

  const resolvedActive = resolveTabValue(
    ids,
    active,
    resolveTabValue(ids, defaultValue, items[0]?.id),
  );

  function onKeyDown(e: React.KeyboardEvent) {
    const idx = items.findIndex((t) => t.id === resolvedActive);
    if (idx === -1) return;
    let next = idx;
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
    else return;
    e.preventDefault();
    setActive(items[next].id);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  }

  return (
    <div className={className}>
      <div
        ref={listRef}
        role="tablist"
        onKeyDown={onKeyDown}
        className="flex gap-1 overflow-x-auto border-b border-line"
      >
        {items.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={t.id === resolvedActive}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={t.id === resolvedActive ? 0 : -1}
            onClick={() => setActive(t.id)}
            data-testid={`tab-${t.id}`}
            className={`-mb-px whitespace-nowrap rounded-t-lg border-b-2 px-4 py-2 text-sm outline-none transition-colors duration-200 ease-truth focus-visible:ring-2 focus-visible:ring-brand/50 ${
              t.id === resolvedActive
                ? 'border-brand font-medium text-ink'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {items.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`tabpanel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={t.id !== resolvedActive}
          className="pt-5"
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}

export function resolveTabValue(
  itemIds: readonly string[],
  requested: string | undefined,
  fallback: string | undefined,
): string | undefined {
  return requested && itemIds.includes(requested) ? requested : fallback;
}
