import type { Metadata } from 'next';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getUltimaDataPedido } from '@/modules/alerts/alert-data.repository';
import { montarCobertura } from '@/modules/estoque/stock-coverage';
import { getStockRows, getVendas30dPorSku } from '@/modules/estoque/stock.repository';
import { badgeDoEstado, labelCobertura, resumoEstoque } from '@/modules/estoque/estoque-view-model';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/page-header';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

export const metadata: Metadata = { title: 'Estoque' };

export default async function EstoquePage() {
  const access = await requireActiveOrg();

  const [stockRows, agoraEfetivo] = await Promise.all([
    getStockRows(access.orgId),
    getUltimaDataPedido(access.orgId),
  ]);
  const vendas = agoraEfetivo
    ? await getVendas30dPorSku(access.orgId, agoraEfetivo)
    : new Map<string, number>();
  const produtos = montarCobertura(stockRows, vendas);
  const resumo = resumoEstoque(produtos);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Estoque"
        description="Saldo do Bling cruzado com o ritmo de venda dos últimos 30 dias — veja o que acaba primeiro."
      />

      {produtos.length === 0 ? (
        <EmptyState
          title="Sem dados de estoque ainda"
          description="O estoque sincroniza automaticamente todo dia às 4h30 (horário de Brasília), logo após o sync de pedidos. Confira se o Bling está conectado em Conexões."
        />
      ) : (
        <Card data-testid="estoque-card">
          <CardHeader>
            <CardTitle>
              Cobertura por produto
              <span className="ml-2 font-mono text-xs text-muted" data-testid="estoque-resumo-inline">
                {resumo.criticos} críticos · {resumo.atencao} em atenção · {resumo.parados} parados
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="estoque-table">
              <THead>
                <TR>
                  <TH>Produto</TH>
                  <TH className="text-right">Saldo</TH>
                  <TH className="text-right">Vendas 30d</TH>
                  <TH className="text-right">Cobertura</TH>
                  <TH>Estado</TH>
                </TR>
              </THead>
              <TBody>
                {produtos.map((p) => {
                  const badge = badgeDoEstado(p.estado);
                  return (
                    <TR key={p.sku}>
                      <TD>
                        {p.nome} <span className="font-mono text-xs text-muted">{p.sku}</span>
                      </TD>
                      <TD numeric>{p.saldo}</TD>
                      <TD numeric>{p.vendas30d}</TD>
                      <TD numeric>{labelCobertura(p)}</TD>
                      <TD>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
