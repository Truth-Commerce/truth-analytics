import Link from 'next/link';

import { getUltimaDataPedido } from '@/modules/alerts/alert-data.repository';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import { montarCobertura } from '@/modules/estoque/stock-coverage';
import { getStockRows, getVendas30dPorSku } from '@/modules/estoque/stock.repository';
import { resumoEstoque } from '@/modules/estoque/estoque-view-model';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

/** Card compacto de estoque no dashboard — some quando não há snapshot. */
export async function EstoqueResumo({ orgId }: { orgId: string }) {
  const source = await getActiveErpConnection(orgId);
  if (!source) return null;
  const stockRows = await getStockRows(source);
  if (stockRows.length === 0) return null;

  const agoraEfetivo = await getUltimaDataPedido(source);
  const vendas = agoraEfetivo ? await getVendas30dPorSku(source, agoraEfetivo) : new Map<string, number>();
  const resumo = resumoEstoque(montarCobertura(stockRows, vendas));

  return (
    <Card data-testid="estoque-resumo-card">
      <CardHeader>
        <CardTitle>Estoque</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Badge variant="danger">{resumo.criticos} críticos</Badge>
        {resumo.desalinhados > 0 ? (
          <Badge variant="warn">{resumo.desalinhados} desalinhados</Badge>
        ) : null}
        <Badge variant="warn">{resumo.atencao} em atenção</Badge>
        <Badge variant="neutral">{resumo.parados} parados</Badge>
        <Link href="/dashboard/estoque" className="ml-auto text-sm text-brand hover:underline">
          Ver estoque →
        </Link>
      </CardContent>
    </Card>
  );
}
