import { requireAdmin } from '@/modules/auth/require-admin';
import { listClientOrganizations } from '@/modules/admin/admin.repository';
import { Table, THead, TBody, TR, TH } from '@/components/ui/Table';
import { Card } from '@/components/ui/Card';
import { ClientRow } from './client-row';

export default async function AdminPage() {
  await requireAdmin();
  const clientes = await listClientOrganizations();

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Painel Admin — Clientes</h1>

      <Card className="p-0">
        <Table>
          <THead>
            <TR>
              <TH>Empresa</TH>
              <TH>Status</TH>
              <TH>Plano</TH>
              <TH>Ações</TH>
            </TR>
          </THead>
          <TBody>
            {clientes.length === 0 ? (
              <TR>
                <td className="px-4 py-6 text-center text-muted" colSpan={4}>
                  Nenhum cliente ainda.
                </td>
              </TR>
            ) : (
              clientes.map((c) => (
                <ClientRow
                  key={c.id}
                  orgId={c.id}
                  name={c.name}
                  status={c.status}
                  plano={c.plano}
                />
              ))
            )}
          </TBody>
        </Table>
      </Card>
    </main>
  );
}
