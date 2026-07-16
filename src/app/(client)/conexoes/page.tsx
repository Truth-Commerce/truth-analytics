import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getConnection } from '@/modules/connections/connection.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { getOrgSettings } from '@/modules/organizations/organization-settings.repository';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { PageHeader } from '@/components/page-header';
import { DisconnectBling } from './disconnect-bling';
import { TrackedProducts } from './tracked-products';
import { GeracaoAutomaticaToggle } from './geracao-automatica-toggle';
import { feedbackDeCallback } from './callback-feedback';

export default async function ConexoesPage({
  searchParams,
}: {
  searchParams?: { ok?: string; erro?: string };
}) {
  const access = await requireActiveOrg();
  const [conn, produtos, settings] = await Promise.all([
    getConnection(access.orgId),
    listTrackedProducts(access.orgId),
    getOrgSettings(access.orgId),
  ]);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="Configuração"
        title="Conexões"
        description="Bling, produtos monitorados e preferências de geração."
      />

      {/* Retorno do OAuth Bling (G0/Task 8) */}
      {(() => {
        const feedback = feedbackDeCallback(searchParams);
        return feedback ? (
          <Alert variant={feedback.variante} title={feedback.titulo}>
            {feedback.mensagem}
          </Alert>
        ) : null;
      })()}

      {/* Bling */}
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">Bling</CardTitle>
        </CardHeader>
        <CardContent>
          {conn?.connected ? (
            <div className="flex flex-wrap items-center gap-4">
              <p data-testid="bling-status" className="flex items-center gap-1.5 text-sm font-medium text-brand">
                Conectado ✓
              </p>
              <DisconnectBling />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <p data-testid="bling-status" className="text-sm text-muted">
                Não conectado
              </p>
              <Button as="a" href="/api/connections/bling" variant="primary" size="sm">
                Conectar Bling
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Produtos monitorados */}
      <Card id="produtos-monitorados">
        <CardHeader>
          <CardTitle as="h2" className="text-base">Produtos monitorados</CardTitle>
        </CardHeader>
        <CardContent>
          <TrackedProducts
            produtos={produtos.map((p) => ({ id: p.id, nome: p.nome, sku: p.sku, ativo: p.ativo }))}
          />
        </CardContent>
      </Card>

      {/* Preferências */}
      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-base">Preferências</CardTitle>
        </CardHeader>
        <CardContent>
          <GeracaoAutomaticaToggle ativa={settings?.geracaoAutomatica ?? true} />
          <p className="mt-2 text-xs text-dim">
            Com a geração automática ligada, seu relatório é gerado sozinho quando o ciclo do plano vence
            e você recebe um e-mail quando ele fica pronto.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
