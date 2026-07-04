import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getReportById } from '@/modules/reports/report.repository';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { renderReportPdf } from '@/modules/pdf/report-pdf';
import { formatData, formatPeriodo } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const access = await requireActiveOrg();
  const rel = await getReportById(params.id, access.orgId);
  if (!rel || rel.status !== 'done' || !rel.metricas) {
    return new Response('Relatório não disponível para exportação.', { status: 404 });
  }

  const org = await getOrganizationById(access.orgId);
  const buffer = await renderReportPdf({
    orgName: org?.name ?? 'Cliente Truth',
    periodo: formatPeriodo(rel.periodoInicio, rel.periodoFim),
    geradoEm: formatData(rel.createdAt),
    metricas: rel.metricas,
    analise: rel.analiseIa,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="truth-analytics-relatorio-${rel.id}.pdf"`,
    },
  });
}
