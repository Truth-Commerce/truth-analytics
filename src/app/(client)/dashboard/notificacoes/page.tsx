import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatData } from '@/lib/format';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { listNotificationsPage } from '@/modules/notifications/notification.repository';

const PAGE_SIZE = 20;

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Notificações' };

export default async function NotificacoesPage({ searchParams }: { searchParams: { pagina?: string } }) {
  const access = await requireActiveOrg();
  const pagina = Math.max(1, Number(searchParams.pagina ?? '1') || 1);
  const { items, total } = await listNotificationsPage(access.id, pagina, PAGE_SIZE);
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Notificações</h1>

      {items.length === 0 ? (
        <EmptyState title="Nenhuma notificação por aqui." />
      ) : (
        <Card className="!p-0">
          <ul data-testid="notificacoes-lista" className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className={`p-4 ${n.lida ? '' : 'bg-brand-glow'}`}>
                {n.href ? (
                  <Link
                    href={n.href}
                    className="text-sm font-medium text-white outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
                  >
                    {n.titulo}
                  </Link>
                ) : (
                  <p className="text-sm font-medium text-white">{n.titulo}</p>
                )}
                <p className="mt-0.5 text-xs text-muted">{n.corpo}</p>
                <p className="mt-1 font-mono text-[10px] text-dim">{formatData(n.createdAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {totalPaginas > 1 ? (
        <nav className="flex items-center justify-between text-sm" aria-label="Paginação">
          {pagina > 1 ? (
            <Link href={`/dashboard/notificacoes?pagina=${pagina - 1}`} className="text-brand hover:underline">
              ← Mais recentes
            </Link>
          ) : (
            <span />
          )}
          <span className="text-dim">
            Página {pagina} de {totalPaginas}
          </span>
          {pagina < totalPaginas ? (
            <Link href={`/dashboard/notificacoes?pagina=${pagina + 1}`} className="text-brand hover:underline">
              Mais antigas →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  );
}
