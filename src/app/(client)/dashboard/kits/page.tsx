import type { Metadata } from 'next';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { listKitsUltimoCiclo } from '@/modules/kits/kit.repository';
import { kitView } from '@/modules/kits/kits-view-model';
import { formatBRL } from '@/lib/format';
import { CanalDot } from '@/components/ui/CanalDot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/page-header';
import { KitActions } from './kit-actions';

export const metadata: Metadata = { title: 'Kits sugeridos' };

export default async function KitsPage() {
  const access = await requireActiveOrg();
  const kits = (await listKitsUltimoCiclo(access.orgId)).map(kitView);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Oportunidade"
        title="Kits sugeridos"
        description="Combinações que seus clientes JÁ compram juntas, transformadas em kits prontos para anunciar."
      />

      {kits.length === 0 ? (
        <EmptyState
          title="Nenhum kit sugerido ainda"
          description="Os kits são gerados junto com cada relatório, a partir dos produtos comprados juntos nos seus pedidos. Gere um relatório para receber as primeiras sugestões."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2" data-testid="kits-grid">
          {kits.map((k) => (
            <Card key={k.id} data-testid="kits-card">
              <CardHeader>
                <CardTitle>{k.titulo}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="text-sm text-muted">
                  {k.itens.map((i, idx) => (
                    <li key={`${i.sku}-${idx}`}>
                      {i.nome} <span className="font-mono text-xs">{i.sku}</span>
                    </li>
                  ))}
                </ul>
                {k.precoSugerido !== null ? (
                  <p className="font-mono text-lg text-white">{formatBRL(k.precoSugerido)}</p>
                ) : null}
                <p className="text-sm">{k.argumento}</p>
                <p className="text-xs text-muted">
                  <CanalDot canal={k.canalRecomendado} />
                  {k.canalRecomendado} · comprados juntos em {k.pedidosJuntos} pedido(s)
                </p>
                <KitActions kitId={k.id} status={k.status} titulo={k.titulo} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
