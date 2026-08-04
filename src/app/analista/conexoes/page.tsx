import Link from 'next/link';

import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { getCarteira } from '@/modules/analista/analista.repository';
import { requireAnalista } from '@/modules/auth/require-analista';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Conexões dos clientes' };

export default async function AnalistaConexoesPage() {
  const access = await requireAnalista();
  const carteira = await getCarteira(access);

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <PageHeader
        eyebrow="Integrações"
        title="Conexões dos clientes"
        description="Selecione uma organização para configurar e acompanhar seu ERP."
      />

      {carteira.length === 0 ? (
        <EmptyState
          title="Nenhuma organização disponível."
          description="Peça ao administrador para atribuir uma organização à sua carteira."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {carteira.map((org) => (
            <Card key={org.orgId} data-testid="conexoes-org-card">
              <CardHeader>
                <CardTitle as="h2" className="text-base">
                  {org.orgName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Link
                  className="font-semibold text-brand hover:text-brand-strong"
                  href={`/analista/${org.orgId}?tab=conexao`}
                >
                  Configurar ERP →
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
