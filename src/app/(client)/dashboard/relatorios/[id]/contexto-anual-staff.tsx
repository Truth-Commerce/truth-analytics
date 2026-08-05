import { Card } from '@/components/ui/Card';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import { agruparPorMes } from '@/modules/desempenho/desempenho-anual';
import { getPedidos12Meses } from '@/modules/desempenho/desempenho-anual.repository';

/** Cliente NUNCA vê a seção anual — só staff em contexto de carteira (?orgId= já validado pelo gate da página). */
export function deveExibirContextoAnual(role: string, orgIdParam: string | undefined): boolean {
  return Boolean(orgIdParam) && (role === 'analista' || role === 'admin_truth');
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/** Server component: computa ao vivo (nada é gravado no relatório — cliente não tem rota para isso). */
export async function ContextoAnualStaff({ orgId }: { orgId: string }) {
  const source = await getActiveErpConnection(orgId);
  if (!source) return null;
  const agora = new Date();
  const meses = agruparPorMes(await getPedidos12Meses(source, agora), agora, 12);
  if (!meses.some((m) => m.pedidos > 0)) return null;
  return (
    <Card data-testid="contexto-anual-staff">
      <h2 className="text-sm font-medium text-ink">Contexto anual (visão interna — o cliente não vê esta seção)</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted">
              <th>Mês</th>
              <th>Faturamento</th>
              <th>Pedidos</th>
              <th>Ticket</th>
              <th>Receita líquida</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className="border-t border-line text-ink">
                <td>{m.mes}</td>
                <td>{brl(m.faturamento)}</td>
                <td>{m.pedidos}</td>
                <td>{brl(m.ticketMedio)}</td>
                <td>{brl(m.receitaLiquida)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
