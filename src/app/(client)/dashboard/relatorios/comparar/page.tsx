import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getReportById, listDoneReports } from '@/modules/reports/report.repository';
import { compararMetricas } from '@/modules/reports/compare';
import { formatBRL, formatPeriodo } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/Card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { CompararForm } from './comparar-form';

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return <span className="text-dim">—</span>;
  const positivo = deltaPct >= 0;
  return (
    <span className={positivo ? 'text-brand' : 'text-red-400'}>
      {positivo ? '▲' : '▼'} {positivo ? '+' : ''}
      {deltaPct}%
    </span>
  );
}

export default async function CompararPage({
  searchParams,
}: {
  searchParams: { a?: string; b?: string };
}) {
  const access = await requireActiveOrg();
  const dones = await listDoneReports(access.orgId);

  // Escopado por org: um id de outra org (forjado na URL) resolve para null,
  // e a página cai na mensagem neutra — nenhum dado de outra org é exibido.
  const [relA, relB] =
    searchParams.a && searchParams.b && searchParams.a !== searchParams.b
      ? await Promise.all([
          getReportById(searchParams.a, access.orgId),
          getReportById(searchParams.b, access.orgId),
        ])
      : [null, null];

  const comp =
    relA?.metricas && relB?.metricas ? compararMetricas(relA.metricas, relB.metricas) : null;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <a href="/dashboard" className="text-sm text-muted transition-colors hover:text-white">
        ← Voltar
      </a>
      <h1 className="font-heading text-2xl font-bold text-white">Comparar períodos</h1>
      <CompararForm
        relatorios={dones.map((r) => ({
          id: r.id,
          label: formatPeriodo(r.periodoInicio, r.periodoFim),
        }))}
        a={searchParams.a}
        b={searchParams.b}
      />
      {comp && relA && relB ? (
        <Card className="!p-0" data-testid="comparacao">
          <Table>
            <THead>
              <TR>
                <TH>Métrica</TH>
                <TH>{formatPeriodo(relA.periodoInicio, relA.periodoFim)}</TH>
                <TH>{formatPeriodo(relB.periodoInicio, relB.periodoFim)}</TH>
                <TH>Δ</TH>
              </TR>
            </THead>
            <TBody>
              <TR>
                <TD>Total de vendas</TD>
                <TD numeric>{formatBRL(comp.totalVendas.atual)}</TD>
                <TD numeric className="text-muted">
                  {formatBRL(comp.totalVendas.anterior)}
                </TD>
                <TD>
                  <DeltaBadge deltaPct={comp.totalVendas.deltaPct} />
                </TD>
              </TR>
              <TR>
                <TD>Pedidos</TD>
                <TD numeric>{comp.pedidos.atual}</TD>
                <TD numeric className="text-muted">
                  {comp.pedidos.anterior}
                </TD>
                <TD>
                  <DeltaBadge deltaPct={comp.pedidos.deltaPct} />
                </TD>
              </TR>
              <TR>
                <TD>Ticket médio</TD>
                <TD numeric>{formatBRL(comp.ticketMedio.atual)}</TD>
                <TD numeric className="text-muted">
                  {formatBRL(comp.ticketMedio.anterior)}
                </TD>
                <TD>
                  <DeltaBadge deltaPct={comp.ticketMedio.deltaPct} />
                </TD>
              </TR>
              {comp.truthScore && (
                <TR>
                  <TD>Truth Score</TD>
                  <TD numeric>{comp.truthScore.atual}</TD>
                  <TD numeric className="text-muted">
                    {comp.truthScore.anterior}
                  </TD>
                  <TD>
                    <DeltaBadge deltaPct={comp.truthScore.deltaPct} />
                  </TD>
                </TR>
              )}
              {comp.porCanal.map((c) => (
                <TR key={c.canal}>
                  <TD className="text-muted">Canal: {c.canal}</TD>
                  <TD numeric>{formatBRL(c.delta.atual)}</TD>
                  <TD numeric className="text-muted">
                    {formatBRL(c.delta.anterior)}
                  </TD>
                  <TD>
                    <DeltaBadge deltaPct={c.delta.deltaPct} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <p className="text-muted">
              {dones.length < 2
                ? 'Você precisa de pelo menos 2 relatórios concluídos para comparar.'
                : 'Selecione dois relatórios diferentes acima.'}
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
