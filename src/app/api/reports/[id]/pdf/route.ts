import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getReportById } from '@/modules/reports/report.repository';
import { resolveReportOrgId } from '@/modules/reports/report-access';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { getOrgAnalistaUser } from '@/modules/notifications/recipients';
import { renderReportPdf } from '@/modules/pdf/report-pdf';
import { formatData, formatPeriodo, slugify } from '@/lib/format';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const access = await requireActiveOrg();
  let orgId: string;
  try {
    orgId = await resolveReportOrgId(access, new URL(req.url).searchParams.get('orgId') ?? undefined);
  } catch (error) {
    if (error instanceof Error && error.message === 'acesso_negado') {
      return new Response('Relatório não disponível para exportação.', { status: 404 });
    }
    throw error;
  }
  const rel = await getReportById(id, orgId);
  if (!rel || rel.status !== 'done' || !rel.metricas) {
    return new Response('Relatório não disponível para exportação.', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const [org, analista] = await Promise.all([
    getOrganizationById(orgId),
    getOrgAnalistaUser(orgId),
  ]);
  const buffer = await renderReportPdf({
    orgName: org?.name ?? 'Cliente Truth',
    periodo: formatPeriodo(rel.periodoInicio, rel.periodoFim),
    geradoEm: formatData(rel.createdAt),
    metricas: rel.metricas,
    analise: rel.analiseIa,
    analistaEmail: analista?.email ?? null,
  });

  const inicio = rel.periodoInicio.toISOString().slice(0, 10);
  const fim = rel.periodoFim.toISOString().slice(0, 10);
  const filename = `truth-analytics-${slugify(org?.name ?? 'cliente')}-${inicio}-${fim}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
