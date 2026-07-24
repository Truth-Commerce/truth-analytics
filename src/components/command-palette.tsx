'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';

import { Dialog } from '@/components/ui/Dialog';

import { buildCommands } from './command-model';

export function CommandPalette({ variant }: { variant: 'client' | 'admin' | 'analista' }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const commands = useMemo(() => buildCommands(variant), [variant]);
  const groups = ['Navegação', 'Ações'] as const;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function run(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      aria-label="Comandos"
      position="top"
      maxWidthClassName="max-w-lg"
      data-testid="command-palette"
    >
      <Command
        label="Comandos"
        className="overflow-hidden rounded-2xl border border-line bg-paper-1/95 shadow-paper backdrop-blur-md"
      >
        <Command.Input
          autoFocus
          data-autofocus
          placeholder="Digite um comando ou busque…"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-sm text-ink placeholder:text-ink-muted outline-none"
        />
        <Command.List className="max-h-72 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
            Nada encontrado.
          </Command.Empty>
          {groups.map((group) => (
            <Command.Group
              key={group}
              heading={group}
              className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-dim"
            >
              {commands
                .filter((c) => c.group === group)
                .map((c) => (
                  <Command.Item
                    key={c.id}
                    value={`${c.label} ${c.keywords ?? ''}`}
                    onSelect={() => run(c.href)}
                    className="cursor-pointer rounded-lg px-3 py-2 text-sm text-ink-soft transition-colors data-[selected=true]:bg-brand-soft data-[selected=true]:text-brand-strong"
                  >
                    {c.label}
                  </Command.Item>
                ))}
            </Command.Group>
          ))}
        </Command.List>
        <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
          <kbd className="rounded border border-line bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-dim">
            esc
          </kbd>
          <span className="text-[10px] text-dim">fechar</span>
        </div>
      </Command>
    </Dialog>
  );
}
