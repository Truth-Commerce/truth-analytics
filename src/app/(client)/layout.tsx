import { AppShell } from '@/components/app-shell';
import { shellVariantForRole } from '@/components/nav-model';
import { getImpersonationBanner } from '@/modules/auth/require-active-org';
import { getSessionContext } from '@/modules/auth/session';
import { countTasksAbertas } from '@/modules/tasks/task.repository';
import { ImpersonationBanner } from './impersonation-banner';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const access = await getSessionContext();
  const planoDeAcaoCount =
    access && access.role === 'client' && access.orgStatus === 'active'
      ? await countTasksAbertas(access.orgId)
      : 0;
  // Cliente real: access.role é sempre 'client', getImpersonationBanner
  // devolve null sem sequer olhar o cookie — 0 custo extra no caminho comum.
  const impersonation = await getImpersonationBanner(access);
  const shellVariant = shellVariantForRole(access?.role);

  return (
    <>
      {impersonation ? <ImpersonationBanner orgName={impersonation.orgName} /> : null}
      <AppShell variant={shellVariant} planoDeAcaoCount={planoDeAcaoCount}>
        {children}
      </AppShell>
    </>
  );
}
