import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getConnection } from '@/modules/connections/connection.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { TrackedProducts } from './tracked-products';

export default async function ConexoesPage() {
  const access = await requireActiveOrg();
  const conn = await getConnection(access.orgId);
  const produtos = await listTrackedProducts(access.orgId);

  return (
    <main className="p-8">
      <h1 className="mb-4 text-xl font-semibold">Conexões</h1>

      <section className="mb-8">
        <h2 className="mb-2 font-medium">Bling</h2>
        {conn?.connected ? (
          <p data-testid="bling-status" className="text-green-700">Conectado ✓</p>
        ) : (
          <div>
            <p data-testid="bling-status" className="mb-2 text-gray-600">Não conectado</p>
            <a href="/api/connections/bling" className="bg-black px-3 py-2 text-white">
              Conectar Bling
            </a>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">Produtos monitorados</h2>
        <TrackedProducts produtos={produtos.map((p) => ({ id: p.id, nome: p.nome, sku: p.sku, ativo: p.ativo }))} />
      </section>
    </main>
  );
}
