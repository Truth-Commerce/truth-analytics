import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { RevisaoQueue } from '@/components/tasks/RevisaoQueue';
import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { getCarteira, getImpactoPorOrg, getMeuDia, listTasksEmRevisao } from '@/modules/analista/analista.repository';
import { carteiraResumo, kpisDaCarteira } from '@/modules/analista/carteira-data.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import { STATUS_TASK_LABEL, TASK_STATUSES } from '@/modules/tasks/task.types';

import { FilaAtencaoHoje } from './fila-atencao';
import { KpisCarteiraHero } from './kpis-carteira';
import { MeuDiaFaixa } from './meu-dia';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Carteira' };

export default async function AnalistaPage() {
  const access = await requireAnalista();
  const agora = new Date();

  // Escopo de TODOS os insumos abaixo vem do papel (analista: carteira
  // própria; admin: todas as orgs cliente) via `getCarteira`/`carteiraResumo`
  // — nunca de `access.orgId` (que só existe p/ acesso de cliente).
  const [carteira, fila, meuDia, impacto, resumos] = await Promise.all([
    getCarteira(access),
    listTasksEmRevisao(access),
    getMeuDia(access),
    getImpactoPorOrg(access),
    carteiraResumo(access, agora),
  ]);
  const impactoMap = new Map(impacto.map((i) => [i.orgId, i]));
  const kpis = kpisDaCarteira(resumos);

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <PageHeader eyebrow="Consultoria Truth" title="Carteira de clientes" />

      <Reveal>
        <KpisCarteiraHero kpis={kpis} />
      </Reveal>

      <Reveal className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-ink">Atenção hoje</h2>
        <FilaAtencaoHoje resumos={resumos} />
      </Reveal>

      <MeuDiaFaixa meuDia={meuDia} />

      <Reveal className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-ink">Fila de revisão</h2>
        <RevisaoQueue items={fila} />
      </Reveal>

      <Reveal className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-ink">Organizações</h2>
        {carteira.length === 0 ? (
          <EmptyState
            title="Nenhuma organização na carteira."
            description="Peça ao admin para atribuir clientes a você."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {carteira.map((org) => (
              <Card key={org.orgId} data-testid="carteira-org">
                <CardHeader>
                  <CardTitle as="h3" className="text-base">
                    {org.orgName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {TASK_STATUSES.map((status) => (
                      <Badge key={status} variant="neutral">
                        {STATUS_TASK_LABEL[status]}: {org.counts[status]}
                      </Badge>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <span className={org.atrasadas > 0 ? 'font-semibold text-danger-fg' : 'text-dim'}>
                      Atrasadas: {org.atrasadas}
                    </span>
                    <span className="font-semibold text-brand">Em revisão: {org.emRevisao}</span>
                  </div>

                  {(() => {
                    const imp = impactoMap.get(org.orgId);
                    return imp?.deltaFaturamentoPct !== null && imp?.deltaFaturamentoPct !== undefined ? (
                      <p className="text-xs text-dim" data-testid="carteira-org-impacto">
                        Desde o 1º relatório:{' '}
                        <span className={imp.deltaFaturamentoPct >= 0 ? 'text-success-fg' : 'text-danger-fg'}>
                          {imp.deltaFaturamentoPct > 0 ? '+' : ''}
                          {imp.deltaFaturamentoPct}% faturamento
                        </span>
                        {imp.deltaScore !== null ? ` · score ${imp.deltaScore > 0 ? '+' : ''}${imp.deltaScore}` : ''}
                      </p>
                    ) : null;
                  })()}

                  <Link
                    href={`/analista/${org.orgId}`}
                    className="inline-block text-sm text-brand outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
                  >
                    Abrir kanban →
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </Reveal>
    </main>
  );
}
