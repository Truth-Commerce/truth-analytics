import { requireAdmin } from '@/modules/auth/require-admin';
import { listClientOrganizationsPage } from '@/modules/admin/admin.repository';
import { Table, THead, TBody, TR, TH } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { ClientRow } from './client-row';
import { SystemStatusCard } from './system-status-card';

const PAGE_SIZE = 20;

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin · Clientes' };

export default async function AdminPage({
  searchParams,
}: {
  searchParams: { q?: string; page?: string };
}) {
  await requireAdmin();
  const q = searchParams.q?.trim() || undefined;
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { items, total } = await listClientOrganizationsPage({ q, page, pageSize: PAGE_SIZE });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hrefFor = (p: number) =>
    `/admin?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) }).toString()}`;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <PageHeader eyebrow="Operação Truth" title="Clientes" />

      <form method="get" action="/admin" className="flex max-w-sm items-center gap-2">
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Buscar por empresa…"
          aria-label="Buscar cliente por nome"
        />
        <Button type="submit" variant="secondary" size="sm">
          Buscar
        </Button>
      </form>

      <Reveal>
        <SystemStatusCard />
      </Reveal>

      <Reveal>
        <Card className="!p-0">
        <Table>
          <THead>
            <TR>
              <TH>Empresa</TH>
              <TH>Status</TH>
              <TH>Plano</TH>
              <TH>Conexão</TH>
              <TH>Ações</TH>
            </TR>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <TR>
                <td className="px-4 py-6 text-center text-muted" colSpan={5}>
                  {q ? 'Nenhum cliente encontrado para essa busca.' : 'Nenhum cliente ainda.'}
                </td>
              </TR>
            ) : (
              items.map((c) => (
                <ClientRow
                  key={c.id}
                  orgId={c.id}
                  name={c.name}
                  status={c.status}
                  plano={c.plano}
                  conexao={c.conexao}
                />
              ))
            )}
          </TBody>
        </Table>
        </Card>
      </Reveal>

      <Pagination page={page} pageCount={pageCount} hrefFor={hrefFor} />
    </main>
  );
}
