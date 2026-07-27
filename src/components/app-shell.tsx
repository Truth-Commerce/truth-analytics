'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { signOutAction } from '@/actions/auth.actions';
import { CommandPalette } from '@/components/command-palette';
import {
  atalhoPaletaLabel,
  hrefAtivo,
  logoHref,
  navItems,
  type NavItem,
} from '@/components/nav-model';
import { NavigationIcon } from '@/components/navigation-icons';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import {
  pageTitle,
  parseSidebarCollapsed,
  SIDEBAR_STORAGE_KEY,
  variantLabel,
} from '@/components/sidebar-model';
import { Logo } from '@/components/ui/Logo';

interface AppShellProps {
  children: React.ReactNode;
  variant?: 'client' | 'admin' | 'analista';
  planoDeAcaoCount?: number;
}

interface NavigationListProps {
  activeHref: string | null;
  collapsed?: boolean;
  items: NavItem[];
  onNavigate?: () => void;
  planoDeAcaoCount: number;
}

export function mobileMenuKey(path: string) {
  return path;
}

export function mobileMenuPortalTarget(documentRef: Pick<Document, 'body'>) {
  return documentRef.body;
}

const SIDEBAR_STORAGE_EVENT = 'truth:sidebar-collapsed';

function subscribeToSidebarCollapsed(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  window.addEventListener(SIDEBAR_STORAGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStoreChange);
    window.removeEventListener(SIDEBAR_STORAGE_EVENT, onStoreChange);
  };
}

function getSidebarCollapsed() {
  return parseSidebarCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY));
}

function subscribeToNothing() {
  return () => {};
}

function NavigationList({
  activeHref,
  collapsed = false,
  items,
  onNavigate,
  planoDeAcaoCount,
}: NavigationListProps) {
  return (
    <nav aria-label="Principal" className="flex flex-1 flex-col gap-1.5">
      {items.map((item) => {
        const active = activeHref === item.href;
        const showBadge = item.badge && planoDeAcaoCount > 0;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            onClick={onNavigate}
            className={`group relative flex min-h-11 items-center rounded-xl outline-none transition-[background-color,color,box-shadow] duration-200 ease-truth focus-visible:ring-2 focus-visible:ring-brand/50 ${
              collapsed ? 'justify-center px-2' : 'gap-3 px-3'
            } ${
              active
                ? 'bg-brand-soft text-brand-strong shadow-[inset_3px_0_0_#137a3e]'
                : 'text-ink-soft hover:bg-paper-2 hover:text-ink'
            }`}
          >
            <NavigationIcon name={item.icon} className="h-[19px] w-[19px] flex-none" />
            {!collapsed ? (
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
            ) : null}
            {showBadge ? (
              <span
                data-testid="nav-plano-badge"
                className={`inline-flex items-center justify-center rounded-full bg-brand font-mono text-[10px] font-semibold text-white ${
                  collapsed
                    ? 'absolute right-1.5 top-1.5 min-w-4 px-1 leading-4'
                    : 'min-w-5 px-1.5 py-0.5'
                }`}
              >
                {planoDeAcaoCount}
              </span>
            ) : null}
            {collapsed ? (
              <span className="pointer-events-none absolute left-[calc(100%+0.75rem)] z-50 hidden whitespace-nowrap rounded-lg border border-line bg-paper-1 px-2.5 py-1.5 text-xs font-medium text-ink shadow-paper group-hover:block group-focus-visible:block">
                {item.label}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

function SignOutButton({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        aria-label={collapsed ? 'Sair' : undefined}
        title={collapsed ? 'Sair' : undefined}
        className={`flex min-h-11 w-full items-center rounded-xl text-ink-soft outline-none transition-colors duration-200 ease-truth hover:bg-danger-tint hover:text-danger-fg focus-visible:ring-2 focus-visible:ring-danger/40 ${
          collapsed ? 'justify-center px-2' : 'gap-3 px-3'
        }`}
      >
        <NavigationIcon name="logout" className="h-[19px] w-[19px] flex-none" />
        {!collapsed ? <span className="text-sm font-medium">Sair</span> : null}
      </button>
    </form>
  );
}

function MobileMenu({
  activeHref,
  contextLabel,
  items,
  planoDeAcaoCount,
  variant,
}: {
  activeHref: string | null;
  contextLabel: string;
  items: NavItem[];
  planoDeAcaoCount: number;
  variant: NonNullable<AppShellProps['variant']>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const mobileMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileMenuCloseRef = useRef<HTMLButtonElement>(null);
  const restoreMobileMenuFocusRef = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        restoreMobileMenuFocusRef.current = true;
        setMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (menuOpen) {
        mobileMenuCloseRef.current?.focus();
      } else if (restoreMobileMenuFocusRef.current) {
        restoreMobileMenuFocusRef.current = false;
        mobileMenuTriggerRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen]);

  function closeMobileMenu() {
    restoreMobileMenuFocusRef.current = true;
    setMenuOpen(false);
  }

  return (
    <>
      <button
        ref={mobileMenuTriggerRef}
        type="button"
        aria-label="Abrir menu"
        aria-expanded={menuOpen}
        aria-controls="mobile-sidebar"
        onClick={() => setMenuOpen(true)}
        className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-line bg-paper-1 text-ink-soft outline-none transition-colors hover:bg-paper-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50 lg:hidden"
      >
        <NavigationIcon name="menu" />
      </button>

      {menuOpen
        ? createPortal(
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={closeMobileMenu}
            className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]"
          />
          <aside
            id="mobile-sidebar"
            role="dialog"
            aria-modal="true"
            aria-label="Navegação principal"
            className="relative flex h-full w-[min(304px,88vw)] flex-col border-r border-line bg-paper-1 px-4 py-4 shadow-2xl"
          >
            <div className="mb-6 flex h-11 items-center justify-between px-1">
              <Link
                href={logoHref(variant)}
                aria-label="Truth Analytics — ir ao início"
                onClick={closeMobileMenu}
                className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                <Logo withMark size="md" />
              </Link>
              <button
                ref={mobileMenuCloseRef}
                type="button"
                aria-label="Fechar menu"
                onClick={closeMobileMenu}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-soft outline-none transition-colors hover:bg-paper-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                <NavigationIcon name="close" />
              </button>
            </div>

            <div className="mb-3 px-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                Workspace
              </p>
            </div>
            <NavigationList
              activeHref={activeHref}
              items={items}
              onNavigate={closeMobileMenu}
              planoDeAcaoCount={planoDeAcaoCount}
            />

            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 rounded-xl bg-paper-2 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Ambiente
                </p>
                <p className="mt-0.5 text-sm font-medium text-ink">{contextLabel}</p>
              </div>
              <SignOutButton />
            </div>
          </aside>
        </div>,
        mobileMenuPortalTarget(document),
      )
        : null}
    </>
  );
}

export function AppShell({ children, variant = 'client', planoDeAcaoCount = 0 }: AppShellProps) {
  const pathname = usePathname();
  const currentPath = pathname ?? '';
  const collapsed = useSyncExternalStore(subscribeToSidebarCollapsed, getSidebarCollapsed, () => false);
  const atalho = useSyncExternalStore(
    subscribeToNothing,
    () => atalhoPaletaLabel(navigator.userAgent),
    () => 'Ctrl K',
  );

  const items = navItems(variant);
  const activeHref = hrefAtivo(pathname ?? '', items.map((item) => item.href));
  const title = pageTitle(pathname ?? '', items);
  const contextLabel = variantLabel(variant);
  const verTodasHref = variant === 'client' ? '/dashboard/notificacoes' : undefined;

  function toggleCollapsed() {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!collapsed));
    window.dispatchEvent(new Event(SIDEBAR_STORAGE_EVENT));
  }

  function openCommandPalette() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  }

  return (
    <div className="min-h-screen bg-bg-base lg:flex">
      <a
        href="#conteudo"
        className="sr-only rounded-xl focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-brand/40 focus:ring-offset-2 focus:ring-offset-bg-base"
      >
        Pular para o conteúdo
      </a>

      <aside
        data-testid="desktop-sidebar"
        className={`sticky top-0 z-40 hidden h-screen flex-none flex-col border-r border-line bg-paper-1 px-3 py-4 shadow-[6px_0_24px_rgba(20,18,15,0.025)] transition-[width] duration-200 ease-truth lg:flex ${
          collapsed ? 'w-[76px]' : 'w-[264px]'
        }`}
      >
        <div
          className={`mb-6 flex h-11 items-center ${
            collapsed ? 'justify-center' : 'justify-between px-2'
          }`}
        >
          <Link
            href={logoHref(variant)}
            aria-label="Truth Analytics — ir ao início"
            className="rounded-lg text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Logo
              withMark
              size={collapsed ? 'sm' : 'md'}
              className={collapsed ? '[&>span]:hidden' : ''}
            />
          </Link>
          {!collapsed ? (
            <button
              type="button"
              aria-label="Recolher menu lateral"
              aria-expanded="true"
              onClick={toggleCollapsed}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted outline-none transition-colors hover:bg-paper-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50"
            >
              <NavigationIcon name="collapse" className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <button
            type="button"
            aria-label="Expandir menu lateral"
            aria-expanded="false"
            onClick={toggleCollapsed}
            className="mb-3 inline-flex h-10 w-full items-center justify-center rounded-xl text-ink-muted outline-none transition-colors hover:bg-paper-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <NavigationIcon name="expand" className="h-4 w-4" />
          </button>
        ) : (
          <div className="mb-3 px-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Workspace
            </p>
          </div>
        )}

        <NavigationList
          activeHref={activeHref}
          collapsed={collapsed}
          items={items}
          planoDeAcaoCount={planoDeAcaoCount}
        />

        <div className="mt-5 border-t border-line pt-4">
          {!collapsed ? (
            <div className="mb-2 rounded-xl bg-paper-2 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                Ambiente
              </p>
              <p className="mt-0.5 truncate text-sm font-medium text-ink">{contextLabel}</p>
            </div>
          ) : null}
          <SignOutButton collapsed={collapsed} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-line bg-bg-base/90 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <MobileMenu
                key={mobileMenuKey(currentPath)}
                activeHref={activeHref}
                contextLabel={contextLabel}
                items={items}
                planoDeAcaoCount={planoDeAcaoCount}
                variant={variant}
              />
              <div className="min-w-0">
                <p className="hidden text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-muted sm:block">
                  {contextLabel}
                </p>
                <p className="truncate font-heading text-xl leading-none text-ink sm:text-2xl">{title}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                aria-label={`Abrir comandos (${atalho})`}
                onClick={openCommandPalette}
                className="hidden min-h-10 items-center gap-2 rounded-xl border border-line bg-paper-1 px-3 text-sm text-ink-soft outline-none transition-colors hover:border-ink/20 hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/50 sm:flex"
              >
                <NavigationIcon name="search" className="h-4 w-4" />
                <span className="hidden md:inline">Buscar</span>
                <kbd className="rounded-md border border-line bg-paper-2 px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
                  {atalho}
                </kbd>
              </button>
              <NotificationBell verTodasHref={verTodasHref} />
            </div>
          </div>
        </header>

        <div id="conteudo" tabIndex={-1} className="py-6 outline-none sm:py-8">
          {children}
        </div>
      </div>

      <CommandPalette variant={variant} />
    </div>
  );
}
