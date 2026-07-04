import { AppShell } from '@/components/app-shell';
import { requireAnalista } from '@/modules/auth/require-analista';

export default async function AnalistaLayout({ children }: { children: React.ReactNode }) {
  await requireAnalista();
  return <AppShell variant="analista">{children}</AppShell>;
}
