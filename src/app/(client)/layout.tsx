import { AppShell } from '@/components/app-shell';
import { getSessionContext } from '@/modules/auth/session';
import { countTasksAbertas } from '@/modules/tasks/task.repository';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const access = await getSessionContext();
  const planoDeAcaoCount =
    access && access.role === 'client' && access.orgStatus === 'active'
      ? await countTasksAbertas(access.orgId)
      : 0;

  return (
    <AppShell variant="client" planoDeAcaoCount={planoDeAcaoCount}>
      {children}
    </AppShell>
  );
}
