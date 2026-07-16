'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { signOutAction } from '@/actions/auth.actions';
import { CommandPalette } from '@/components/command-palette';
import { atalhoPaletaLabel, hrefAtivo, logoHref, navItems } from '@/components/nav-model';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Logo } from '@/components/ui/Logo';

interface AppShellProps {
  children: React.ReactNode;
  variant?: 'client' | 'admin' | 'analista';
  planoDeAcaoCount?: number;
}

export function AppShell({ children, variant = 'client', planoDeAcaoCount = 0 }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [atalho, setAtalho] = useState('Ctrl K');
  const pathname = usePathname();

  const itens = navItems(variant);
  const ativo = hrefAtivo(pathname ?? '', itens.map((i) => i.href));
  const verTodasHref = variant === 'client' ? '/dashboard/notificacoes' : undefined;

  useEffect(() => setAtalho(atalhoPaletaLabel(navigator.userAgent)), []);

  function navLinkCls(href: string, mobile = false) {
    return `rounded-lg px-3 ${mobile ? 'py-2' : 'py-1.5'} text-sm outline-none transition-colors duration-200 ease-truth focus-visible:ring-2 focus-visible:ring-brand/60 ${
      ativo === href ? 'bg-brand-glow text-white' : 'text-muted hover:bg-white/5 hover:text-white'
    }`;
  }

  function badgePlano(item: { badge?: boolean }) {
    if (!item.badge || planoDeAcaoCount <= 0) return null;
    return (
      <span
        data-testid="nav-plano-badge"
        className="inline-flex items-center justify-center rounded-full bg-brand px-1.5 py-0.5 font-mono text-[10px] text-[#04150a]"
      >
        {planoDeAcaoCount}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base">
      {/* Skip-link — primeiro foco tabulável de qualquer página logada, revela ao focar */}
      <a
        href="#conteudo"
        className="sr-only rounded-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[#04150a] focus:outline-none focus:ring-2 focus:ring-brand/60 focus:ring-offset-2 focus:ring-offset-bg-base"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 border-b border-line bg-bg-surface/80 backdrop-blur-sm">
        <nav aria-label="Principal" className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          {/* Logo — leva à home do papel */}
          <Link
            href={logoHref(variant)}
            aria-label="Truth Analytics — ir ao início"
            className="flex-shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <Logo size="sm" />
          </Link>

          {/* Nav desktop — por papel, item ativo destacado */}
          <div className="hidden items-center gap-1 sm:flex">
            {itens.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo === item.href ? 'page' : undefined}
                className={`inline-flex items-center gap-1.5 ${navLinkCls(item.href)}`}
              >
                {item.label}
                {badgePlano(item)}
              </Link>
            ))}
          </div>

          {/* Dica da paleta de comandos (Ctrl K / ⌘ K por plataforma) */}
          <button
            type="button"
            aria-label={`Abrir comandos (${atalho})`}
            onClick={() =>
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
            }
            className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[10px] text-dim outline-none transition-colors duration-200 ease-truth hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60 sm:flex"
          >
            {atalho}
          </button>

          {/* Notificações (desktop) */}
          <div className="hidden sm:block">
            <NotificationBell verTodasHref={verTodasHref} />
          </div>

          {/* Sair (desktop) */}
          <form action={signOutAction} className="hidden sm:block">
            <button
              type="submit"
              className="rounded-full px-4 py-1.5 text-sm text-muted outline-none transition-colors duration-200 ease-truth hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              Sair
            </button>
          </form>

          {/* Hambúrguer (mobile) */}
          <button
            type="button"
            aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex sm:hidden flex-col items-center justify-center gap-1.5 rounded-lg p-2 text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60"
          >
            <span className={`block h-0.5 w-5 bg-current transition-transform duration-200 ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition-opacity duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
            <span className={`block h-0.5 w-5 bg-current transition-transform duration-200 ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
          </button>
        </nav>

        {/* Drawer mobile — espelha a nav por papel */}
        {menuOpen && (
          <div id="mobile-nav" className="border-t border-line bg-bg-surface/95 px-4 py-3 sm:hidden">
            <div className="mb-2 flex justify-end">
              <NotificationBell verTodasHref={verTodasHref} />
            </div>
            <div className="flex flex-col gap-1">
              {itens.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={ativo === item.href ? 'page' : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={`inline-flex items-center gap-1.5 ${navLinkCls(item.href, true)}`}
                >
                  {item.label}
                  {badgePlano(item)}
                </Link>
              ))}
              <div className="mt-1 border-t border-line pt-2">
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted outline-none transition-colors hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-brand/60"
                  >
                    Sair
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Alvo do skip-link — cada página fornece o <main> landmark próprio.
          Gutter único: TODA página roteada tem p-6 md:p-8 (G2/T8 removeu o px-4
          daqui, que dobrava a margem no mobile). Só py-8 vertical. */}
      <div id="conteudo" tabIndex={-1} className="py-8 outline-none">
        {children}
      </div>

      <CommandPalette variant={variant} />
    </div>
  );
}
