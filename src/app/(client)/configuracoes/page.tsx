import type { Metadata } from 'next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PLANO_LABEL } from '@/lib/labels';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getUserAuthById } from '@/modules/auth/user.repository';
import { NomeEmpresaForm } from './nome-empresa-form';
import { TrocarSenhaForm } from './trocar-senha-form';

export const metadata: Metadata = {
  title: 'Configurações — Truth Analytics',
  description: 'Gerencie sua conta: senha, nome da empresa e plano.',
};

export default async function ConfiguracoesPage() {
  const access = await requireActiveOrg();
  const [org, user] = await Promise.all([
    getOrganizationById(access.orgId),
    getUserAuthById(access.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-ink">Configurações</h1>

      <Card data-testid="conta-info">
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Sua conta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="text-muted">
            E-mail: <span className="font-mono text-ink/80">{user?.email ?? '—'}</span>
          </p>
          <p className="text-muted">
            Plano atual:{' '}
            <span className="font-mono text-ink/80">
              {access.plano ? PLANO_LABEL[access.plano] : 'Sem plano'}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card data-testid="nome-empresa-card">
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Nome da empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <NomeEmpresaForm nomeAtual={org?.name ?? ''} />
        </CardContent>
      </Card>

      <Card data-testid="trocar-senha-card">
        <CardHeader>
          <CardTitle as="h2" className="text-base">
            Trocar senha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TrocarSenhaForm />
        </CardContent>
      </Card>
    </main>
  );
}
