import { requireActiveOrg } from '@/modules/auth/require-active-org';

export default async function DashboardPage() {
  const access = await requireActiveOrg();
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <p data-testid="org-id">org: {access.orgId}</p>
    </main>
  );
}
