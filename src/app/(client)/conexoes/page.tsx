import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getConnection } from '@/modules/connections/connection.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { DisconnectBling } from './disconnect-bling';
import { TrackedProducts } from './tracked-products';

export default async function ConexoesPage() {
  const access = await requireActiveOrg();
  const conn = await getConnection(access.orgId);
  const produtos = await listTrackedProducts(access.orgId);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Conexões</h1>

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
    </main>
  );
}
