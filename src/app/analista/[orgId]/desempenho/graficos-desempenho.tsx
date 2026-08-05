'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { BarChart } from '@/components/ui/charts/BarChart';
import { LineChart } from '@/components/ui/charts/LineChart';
import { StackedAreaChart } from '@/components/ui/charts/StackedAreaChart';
import { coresDosCanais } from '@/lib/canal-visual';
import type { MesDesempenho } from '@/modules/desempenho/desempenho-anual';

const formatBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const labelMes = (mes: string) => {
  const [ano, m] = mes.split('-');
  const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${nomes[Number(m) - 1]}/${ano.slice(2)}`;
};

export function GraficosDesempenho({ meses, canais }: {
  meses: MesDesempenho[];
  canais: { mes: string; canais: Record<string, number> }[];
}) {
  const keys = [...new Set(canais.flatMap((c) => Object.keys(c.canais)))];
  const rowsCanais = canais.map((c) => ({ x: labelMes(c.mes), ...c.canais }));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card data-testid="desempenho-grafico-faturamento">
        <h2 className="text-sm font-medium text-ink">Valor faturado por mês</h2>
        <BarChart data={meses.map((m) => ({ label: labelMes(m.mes), value: m.faturamento }))} formatValue={formatBRL} />
      </Card>
      <Card data-testid="desempenho-grafico-pedidos">
        <h2 className="text-sm font-medium text-ink">Pedidos por mês</h2>
        <BarChart data={meses.map((m) => ({ label: labelMes(m.mes), value: m.pedidos }))} />
      </Card>
      <Card data-testid="desempenho-grafico-ticket">
        <h2 className="text-sm font-medium text-ink">Ticket médio por mês</h2>
        <LineChart data={meses.map((m) => ({ x: labelMes(m.mes), y: m.ticketMedio }))} formatY={formatBRL} srSummary="Evolução mensal do ticket médio nos últimos 12 meses." />
      </Card>
      <Card data-testid="desempenho-grafico-canais">
        <h2 className="text-sm font-medium text-ink">Faturamento por canal</h2>
        {keys.length > 0 ? (
          <StackedAreaChart keys={keys} rows={rowsCanais} colors={coresDosCanais(keys)} formatY={formatBRL} srSummary={`Faturamento mensal empilhado por canal. Canais: ${keys.join(', ')}.`} />
        ) : <p className="text-sm text-muted">Sem vendas na janela.</p>}
      </Card>
      <Card data-testid="desempenho-grafico-liquida">
        <h2 className="text-sm font-medium text-ink">Receita líquida por mês</h2>
        <p className="text-xs text-muted">Faturamento − comissão − frete (o Bling não mostra isso).</p>
        <BarChart data={meses.map((m) => ({ label: labelMes(m.mes), value: m.receitaLiquida }))} formatValue={formatBRL} />
      </Card>
      <Card data-testid="desempenho-grafico-custos">
        <h2 className="text-sm font-medium text-ink">Comissão e frete por mês</h2>
        <StackedAreaChart
          keys={['Comissão', 'Frete']}
          rows={meses.map((m) => ({ x: labelMes(m.mes), 'Comissão': m.comissao, Frete: m.frete }))}
          formatY={formatBRL}
          srSummary="Comissão e frete somados por mês nos últimos 12 meses."
        />
      </Card>
    </div>
  );
}

export function TopSkusLista({ skus, mesesSelecionados, orgId }: {
  skus: { sku: string; nome: string; quantidade: number; receita: number }[];
  mesesSelecionados: number;
  orgId: string;
}) {
  const max = skus[0]?.quantidade ?? 1;
  return (
    <Card data-testid="desempenho-top-skus">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-ink">Top 10 SKUs mais vendidos</h2>
        <nav className="flex gap-2 text-xs">
          {[3, 6, 12].map((m) => (
            <Link key={m} href={`/analista/${orgId}/desempenho?skus=${m}`}
              className={m === mesesSelecionados ? 'font-semibold text-ink' : 'text-muted hover:text-ink'}>
              {m} meses
            </Link>
          ))}
        </nav>
      </div>
      {skus.length === 0 ? <p className="mt-2 text-sm text-muted">Sem vendas no período.</p> : (
        <ol className="mt-3 space-y-2">
          {skus.map((s, i) => (
            <li key={s.sku} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-ink" title={`${s.sku} — ${s.nome}`}>{s.sku} — {s.nome}</span>
              <span className="text-muted">{s.quantidade} un · {s.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              <span className="h-2 w-28 overflow-hidden rounded bg-paper-2">
                <span className="block h-full bg-brand" style={{ width: `${Math.round((s.quantidade / max) * 100)}%` }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
