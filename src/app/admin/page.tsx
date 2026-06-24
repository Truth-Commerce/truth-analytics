import { requireAdmin } from '@/modules/auth/require-admin';
import { listClientOrganizations } from '@/modules/admin/admin.repository';
import { ClientRow } from './client-row';

export default async function AdminPage() {
  await requireAdmin();
  const clientes = await listClientOrganizations();

  return (
    <main className="p-8">
      <h1 className="mb-4 text-xl font-semibold">Painel Admin — Clientes</h1>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b">
            <th className="p-2">Empresa</th>
            <th className="p-2">Status</th>
            <th className="p-2">Plano</th>
            <th className="p-2">Ações</th>
          </tr>
        </thead>
        <tbody>
          {clientes.length === 0 ? (
            <tr>
              <td className="p-2" colSpan={4}>Nenhum cliente ainda.</td>
            </tr>
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
        </tbody>
      </table>
    </main>
  );
}
