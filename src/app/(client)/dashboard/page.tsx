import { requireActiveOrg } from '@/modules/auth/require-active-org';
import {
  getLatestDoneReport,
  getLatestReport,
  getUltimosDoneDetalhados,
  listReports,
} from '@/modules/reports/report.repository';
import { STATUS_LABEL, reportStatusVariant } from '@/modules/reports/report.types';
import { dashboardStats, insightsFromAnalise } from '@/modules/reports/dashboard-model';
import { getConnection } from '@/modules/connections/connection.repository';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import {
  getOrgSettings,
  getTotalVendasMesCorrente,
} from '@/modules/organizations/organization-settings.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';
import { listAlertasAbertos } from '@/modules/alerts/alert.repository';
import { podeGerar } from '@/modules/pipeline/plan-lock';
import { progressoMeta } from '@/modules/reports/compare';
import { formatData, formatPeriodo } from '@/lib/format';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { GenerateReport } from './generate-report';
import { StatCards } from './stat-cards';
import { InsightsMarquee } from './insights-marquee';
import { DashboardCharts } from './dashboard-charts';
import { OnboardingChecklist } from './onboarding-checklist';
import { TruthScoreCard } from './truth-score-card';
import { AlertasSection } from './alertas-section';
import { MetaProgress } from './meta-progress';

export default async function DashboardPage() {
  const access = await requireActiveOrg();

  const [latest, reports, conn, org, latestDone, produtos, donesRecentes, alertas, settings, totalMes] =
    await Promise.all([
      getLatestReport(access.orgId),
      listReports(access.orgId),
      getConnection(access.orgId),
      getOrganizationById(access.orgId),
      getLatestDoneReport(access.orgId),
      listTrackedProducts(access.orgId),
      getUltimosDoneDetalhados(access.orgId, 2),
      listAlertasAbertos(access.orgId),
      getOrgSettings(access.orgId),
      getTotalVendasMesCorrente(access.orgId),
    ]);

  const metaAtual = settings?.metaMensal ?? null;
  const progresso = progressoMeta(totalMes, metaAtual);

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

      {/* Conexão expirada — persistente até reconectar (G0/Task 7) */}
      {conn && conn.status === 'expirado' ? (
        <Alert variant="danger" title="Sua conexão com o Bling expirou">
          Seus dados de vendas pararam de atualizar e os relatórios automáticos foram pausados.{' '}
          <a href="/conexoes" className="font-medium underline underline-offset-2">
            Reconectar em Conexões →
          </a>
        </Alert>
      ) : null}

      <OnboardingChecklist
        blingOk={blingOk}
        temProdutos={produtos.length > 0}
        temRelatorio={reports.length > 0}
      />

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

      {/* Truth Score hero — some quando não há relatório done com score */}
      <TruthScoreCard atual={donesRecentes[0] ?? null} anterior={donesRecentes[1] ?? null} />

      {/* Meta do mês — some quando o admin não definiu meta */}
      <MetaProgress progresso={progresso} meta={metaAtual} totalMes={totalMes} />

      {/* Alertas abertos — some quando não há alertas */}
      <AlertasSection alertas={alertas} />

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
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-semibold text-white">Histórico</h2>
          <a
            data-testid="comparar-periodos-link"
            href="/dashboard/relatorios/comparar"
            className="text-sm text-brand hover:underline"
          >
            Comparar períodos →
          </a>
        </div>
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
          <EmptyState
            title="Nenhum relatório ainda."
            description="Conecte o Bling, adicione produtos e gere sua primeira análise por IA."
            action={
              <Button as="a" href="#gerar-relatorio" variant="primary" size="sm">
                Gerar primeira análise
              </Button>
            }
          />
        )}
      </section>
    </main>
  );
}
