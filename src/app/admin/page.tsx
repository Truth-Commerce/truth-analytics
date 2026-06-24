import { requireAdmin } from '@/modules/auth/require-admin';

export default async function AdminPage() {
  await requireAdmin();
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Painel Admin</h1>
    </main>
  );
}
