import Link from 'next/link';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getDoneAnterior, getReportById, listDoneReports } from '@/modules/reports/report.repository';
import { compararMetricas, compararTopProdutos, fontesRelatorioCompativeis, leituraComparacao } from '@/modules/reports/compare';
import { formatBRL, formatPeriodo } from '@/lib/format';
import { CanalDot } from '@/components/ui/CanalDot';
import { Card, CardContent } from '@/components/ui/Card';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { CompararForm } from './comparar-form';

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return <span className="text-dim">—</span>;
  const positivo = deltaPct >= 0;
  return (
    <span className={positivo ? 'text-brand' : 'text-danger-fg'}>
      {positivo ? '▲' : '▼'} {positivo ? '+' : ''}
      {deltaPct}%
    </span>
  );
}

/** Δ absoluto em R$ ao lado do badge de % (só para linhas monetárias). */
function DeltaBRL({ deltaAbs }: { deltaAbs: number }) {
  return (
    <span className="ml-2 font-mono text-xs text-muted">
      {deltaAbs >= 0 ? '+' : ''}
      {formatBRL(deltaAbs)}
    </span>
  );
}

const SITUACAO_LABEL = {
  subiu: '▲ subiu',
  caiu: '▼ caiu',
  estavel: '→ estável',
  entrou: '★ entrou',
  saiu: '— saiu',
} as const;

const SITUACAO_COR = {
  subiu: 'text-brand',
  caiu: 'text-danger-fg',
  estavel: 'text-muted',
  entrou: 'text-brand',
  saiu: 'text-dim',
} as const;

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Comparar períodos' };

export default async function CompararPage(
  props: {
    searchParams: Promise<{ a?: string; b?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const access = await requireActiveOrg();
  const dones = await listDoneReports(access.orgId);

  // Escopado por org: um id de outra org (forjado na URL) resolve para null,
  // e a página cai na mensagem neutra — nenhum dado de outra org é exibido.
  // Sem `b` (ou b === a), o default é o done imediatamente anterior a A.
  let relA = null as Awaited<ReturnType<typeof getReportById>>;
  let relB = null as Awaited<ReturnType<typeof getReportById>>;
  if (searchParams.a) {
    relA = await getReportById(searchParams.a, access.orgId);
    if (relA) {
      relB =
        searchParams.b && searchParams.b !== searchParams.a
          ? await getReportById(searchParams.b, access.orgId)
          : await getDoneAnterior(access.orgId, relA.createdAt, relA.id, relA);
    }
  }

  const usouDefaultAnterior = !searchParams.b || searchParams.b === searchParams.a;
  const fontesCompativeis = relA !== null && relB !== null && fontesRelatorioCompativeis(relA, relB);
  const fontesIncompativeis = relA !== null && relB !== null && !fontesCompativeis;
  const comp = relA?.metricas && relB?.metricas && fontesCompativeis
    ? compararMetricas(relA.metricas, relB.metricas)
    : null;
  const produtos = relA?.metricas && relB?.metricas && fontesCompativeis
    ? compararTopProdutos(relA.metricas, relB.metricas)
    : [];

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <Link href="/dashboard" className="text-sm text-muted transition-colors hover:text-ink">
        ← Voltar
      </Link>
      <h1 className="font-heading text-2xl font-bold text-ink">Comparar períodos</h1>
      <CompararForm
        relatorios={dones.map((r) => ({
          id: r.id,
          label: formatPeriodo(r.periodoInicio, r.periodoFim),
        }))}
        a={searchParams.a}
        b={relB?.id ?? searchParams.b}
      />
      {comp && relA && relB ? (
        <>
          <p className="text-sm text-ink/90" data-testid="leitura-comparacao">
            {leituraComparacao(comp)}
          </p>
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
                    <DeltaBRL deltaAbs={comp.totalVendas.deltaAbs} />
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
                    <DeltaBRL deltaAbs={comp.ticketMedio.deltaAbs} />
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
                    <TD className="text-muted"><CanalDot canal={c.canal} />Canal: {c.canal}</TD>
                    <TD numeric>{formatBRL(c.delta.atual)}</TD>
                    <TD numeric className="text-muted">
                      {formatBRL(c.delta.anterior)}
                    </TD>
                    <TD>
                      <DeltaBadge deltaPct={c.delta.deltaPct} />
                      <DeltaBRL deltaAbs={c.delta.deltaAbs} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
          {produtos.length > 0 && (
            <Card className="!p-0" data-testid="comparacao-produtos">
              <Table>
                <THead>
                  <TR>
                    <TH>Produto</TH>
                    <TH className="text-right">Receita (A)</TH>
                    <TH className="text-right">Receita (B)</TH>
                    <TH>Situação</TH>
                  </TR>
                </THead>
                <TBody>
                  {produtos.map((p) => (
                    <TR key={p.sku || p.nome}>
                      <TD>
                        {p.nome} <span className="font-mono text-xs text-dim">{p.sku}</span>
                      </TD>
                      <TD numeric>{formatBRL(p.receitaAtual)}</TD>
                      <TD numeric className="text-muted">
                        {formatBRL(p.receitaAnterior)}
                      </TD>
                      <TD className={SITUACAO_COR[p.situacao]}>{SITUACAO_LABEL[p.situacao]}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <CardContent>
            <p className="text-muted">
              {fontesIncompativeis
                ? 'relatorios_fontes_incompativeis'
                : searchParams.a && relA && !relB && usouDefaultAnterior
                ? 'Este é o primeiro relatório concluído — não há período anterior para comparar.'
                : dones.length < 2
                  ? 'Você precisa de pelo menos 2 relatórios concluídos para comparar.'
                  : 'Selecione dois relatórios diferentes acima.'}
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
