import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card } from '@/components/ui/Card';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import { getActiveErpConnection } from '@/modules/connections/active-provider.repository';
import { agruparPorMes, filtrarUltimosMeses, porCanalMensal, topSkus } from '@/modules/desempenho/desempenho-anual';
import { getCoberturaHistorico, getPedidos12Meses } from '@/modules/desempenho/desempenho-anual.repository';
import { BackfillHistorico } from './backfill-historico';
import { GraficosDesempenho, TopSkusLista } from './graficos-desempenho';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // backfill (server action desta rota) coleta + enriquece um lote

const SELECOES_SKUS = [3, 6, 12] as const;

export default async function DesempenhoAnualPage(props: {
  params: Promise<{ orgId: string }>;
  searchParams?: Promise<{ skus?: string }>;
}) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const access = await requireAnalista();
  try {
    await assertOrgAccess(access, params.orgId);
  } catch (e) {
    if (e instanceof Error && e.message === 'acesso_negado') notFound();
    throw e;
  }
  const orgId = params.orgId;
  const org = await getOrganizationById(orgId);
  if (!org) notFound();

  const mesesSkus = SELECOES_SKUS.find((m) => String(m) === searchParams?.skus) ?? 12;
  const source = await getActiveErpConnection(orgId);
  const agora = new Date();
  const rows = source ? await getPedidos12Meses(source, agora) : [];
  const cobertura = source ? await getCoberturaHistorico(source) : { desde: null, pendentesEnriquecimento: 0 };
  const meses = agruparPorMes(rows, agora, 12);
  const canais = porCanalMensal(rows, agora, 12);
  const skus = topSkus(filtrarUltimosMeses(rows, agora, mesesSkus), 10);

  return (
    <div className="space-y-6" data-testid="desempenho-anual-page">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/analista/${orgId}`} className="text-sm text-muted transition-colors hover:text-ink">← Voltar para o cliente</Link>
          <h1 className="text-2xl font-semibold text-ink">Desempenho anual — {org.name}</h1>
          <p className="text-sm text-muted" data-testid="desempenho-cobertura">
            {cobertura.desde
              ? `Histórico desde ${cobertura.desde.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' })}`
              : 'Sem histórico coletado ainda'}
            {cobertura.pendentesEnriquecimento > 0
              ? ` · ${cobertura.pendentesEnriquecimento} pedidos aguardando enriquecimento (comissão/frete podem estar zerados)`
              : ''}
          </p>
        </div>
        {source?.provider === 'bling' ? <BackfillHistorico orgId={orgId} /> : null}
      </div>
      {!source ? (
        <Card><p className="text-sm text-muted">Nenhum ERP ativo para este cliente.</p></Card>
      ) : (
        <>
          <GraficosDesempenho meses={meses} canais={canais} />
          <TopSkusLista skus={skus} mesesSelecionados={mesesSkus} orgId={orgId} />
        </>
      )}
    </div>
  );
}
