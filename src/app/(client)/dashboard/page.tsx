import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getLatestReport, listReports } from '@/modules/reports/report.repository';
import { STATUS_LABEL } from '@/modules/reports/report.types';
import { getConnection } from '@/modules/connections/connection.repository';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { podeGerar } from '@/modules/pipeline/plan-lock';
import { formatData, formatPeriodo } from '@/lib/format';
import { GenerateReport } from './generate-report';

export default async function DashboardPage() {
  const access = await requireActiveOrg();

  const [latest, reports, conn, org] = await Promise.all([
    getLatestReport(access.orgId),
    listReports(access.orgId),
    getConnection(access.orgId),
    getOrganizationById(access.orgId),
  ]);

  const blingOk = !!conn?.connected;
  const gate = org ? podeGerar(org) : { ok: false as const, motivo: 'org_nao_encontrada' };
  const canGenerate = blingOk && gate.ok;

  let motivo: string | undefined;
  if (!canGenerate) {
    if (!blingOk) {
      motivo = 'Conecte o Bling em Conexões.';
    } else if (!gate.ok) {
      if (gate.motivo === 'ciclo_em_andamento') {
        const proxData = org?.proximo_relatorio_liberado_em;
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

  return (
    <main className="p-8">
      <h1 className="mb-6 text-xl font-semibold">Dashboard</h1>

      <section className="mb-8">
        <h2 className="mb-2 font-medium">Gerar relatório</h2>
        <GenerateReport disabled={!canGenerate} motivo={motivo} />
      </section>

      <section className="mb-8" data-testid="latest-report">
        <h2 className="mb-2 font-medium">Último relatório</h2>
        {latest ? (
          <div className="rounded border p-4">
            <p className="font-medium">{STATUS_LABEL[latest.status]}</p>
            <p className="text-sm text-gray-600">{formatPeriodo(latest.periodoInicio, latest.periodoFim)}</p>
            <p className="text-sm text-gray-500">{formatData(latest.createdAt)}</p>
            <a
              data-testid="ver-relatorio"
              href={`/dashboard/relatorios/${latest.id}`}
              className="mt-2 inline-block text-sm text-blue-600 underline"
            >
              Ver relatório
            </a>
          </div>
        ) : (
          <p className="text-gray-500">Nenhum relatório ainda.</p>
        )}
      </section>

      <section data-testid="reports-list">
        <h2 className="mb-2 font-medium">Histórico</h2>
        {reports.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {reports.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 border-b pb-2">
                <span className="font-medium">{STATUS_LABEL[r.status]}</span>
                <span className="text-sm text-gray-600">{formatPeriodo(r.periodoInicio, r.periodoFim)}</span>
                <a
                  href={`/dashboard/relatorios/${r.id}`}
                  className="text-sm text-blue-600 underline"
                >
                  Ver
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">Nenhum relatório ainda.</p>
        )}
      </section>
    </main>
  );
}
