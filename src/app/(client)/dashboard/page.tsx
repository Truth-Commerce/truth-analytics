import { requireActiveOrg } from '@/modules/auth/require-active-org';
import {
  getLatestDoneReport,
  getLatestReport,
  listReports,
} from '@/modules/reports/report.repository';
import { STATUS_LABEL, reportStatusVariant } from '@/modules/reports/report.types';
import { dashboardStats, insightsFromAnalise } from '@/modules/reports/dashboard-model';
import { getConnection } from '@/modules/connections/connection.repository';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { podeGerar } from '@/modules/pipeline/plan-lock';
import { formatData, formatPeriodo } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { GenerateReport } from './generate-report';
import { StatCards } from './stat-cards';
import { InsightsMarquee } from './insights-marquee';
import { DashboardCharts } from './dashboard-charts';

export default async function DashboardPage() {
  const access = await requireActiveOrg();

  const [latest, reports, conn, org, latestDone] = await Promise.all([
    getLatestReport(access.orgId),
    listReports(access.orgId),
    getConnection(access.orgId),
    getOrganizationById(access.orgId),
    getLatestDoneReport(access.orgId),
  ]);

  const blingOk = !!conn?.connected;
  const gate = org ? podeGerar(org) : { ok: false as const, motivo: 'org_nao_encontrada' };
  const canGenerate = blingOk && gate.ok;

  let motivo: string | undefined;
  if (!canGenerate) {
    if (!org) {
      motivo = 'Organização não encontrada. Recarregue a página.';
    } else if (!blingOk) {
      motivo = 'Conecte o Bling em Conexões.';
    } else if (!gate.ok) {
      if (gate.motivo === 'ciclo_em_andamento') {
        const proxData = org.proximo_relatorio_liberado_em;
        motivo = proxData
          ? `Próximo relatório liberado em ${formatData(proxData)}.`
          : 'O próximo relatório ainda não foi liberado.';
      } else if (gate.motivo === 'sem_plano') {
        motivo = 'Nenhum plano definido.';
      } else {
        motivo = 'Organização inativa.';
      }
    }
  }

  const stats = latestDone?.metricas ? dashboardStats(latestDone.metricas) : null;
  const insights = insightsFromAnalise(latestDone?.analiseIa ?? null);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Dashboard</h1>

      {/* Marquee de insights do último relatório */}
      <InsightsMarquee insights={insights} />

      {/* Stats do último relatório done */}
      {stats ? (
        <StatCards
          items={[
            { label: 'Faturamento do período', value: stats.faturamento, format: 'brl', spark: stats.evolucaoTotais },
            { label: 'Pedidos', value: stats.pedidos, format: 'int' },
            { label: 'Ticket médio', value: stats.ticketMedio, format: 'brl' },
            { label: 'Relatórios gerados', value: reports.length, format: 'int' },
          ]}
        />
      ) : null}

      {/* Charts do último relatório done */}
      {latestDone?.metricas ? (
        <DashboardCharts
          evolucao={latestDone.metricas.evolucao.map((e) => ({ x: e.data, y: e.total }))}
          canais={latestDone.metricas.vendasPorCanal.map((v) => ({ label: v.canal, value: v.total }))}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Gerar relatório (âncora do ⌘K) */}
        <Card id="gerar-relatorio">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Gerar relatório</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateReport disabled={!canGenerate} motivo={motivo} />
          </CardContent>
        </Card>

        {/* Último relatório */}
        <Card data-testid="latest-report">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Último relatório</CardTitle>
          </CardHeader>
          <CardContent>
            {latest ? (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-2">
                  <Badge variant={reportStatusVariant(latest.status)}>
                    {STATUS_LABEL[latest.status]}
                  </Badge>
                  <p className="text-sm text-muted">{formatPeriodo(latest.periodoInicio, latest.periodoFim)}</p>
                  <p className="text-xs text-dim">{formatData(latest.createdAt)}</p>
                </div>
                <a
                  data-testid="ver-relatorio"
                  href={`/dashboard/relatorios/${latest.id}`}
                  className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
                >
                  Ver relatório →
                </a>
              </div>
            ) : (
              <p className="text-muted">Nenhum relatório ainda.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Histórico */}
      <section data-testid="reports-list">
        <h2 className="mb-3 font-heading text-base font-semibold text-white">Histórico</h2>
        {reports.length > 0 ? (
          <Card className="!p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Status</TH>
                  <TH>Período</TH>
                  <TH><span className="sr-only">Ações</span></TH>
                </TR>
              </THead>
              <TBody>
                {reports.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <Badge variant={reportStatusVariant(r.status)}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </TD>
                    <TD className="text-muted">{formatPeriodo(r.periodoInicio, r.periodoFim)}</TD>
                    <TD>
                      <a
                        href={`/dashboard/relatorios/${r.id}`}
                        className="text-sm text-brand hover:underline"
                      >
                        Ver
                      </a>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        ) : (
          <p className="text-muted">Nenhum relatório ainda.</p>
        )}
      </section>
    </main>
  );
}
