import { notFound } from 'next/navigation';

import { AchadosParaTasks } from '@/components/tasks/AchadosParaTasks';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getReportById } from '@/modules/reports/report.repository';
import { STATUS_LABEL, reportStatusVariant } from '@/modules/reports/report.types';
import { friendlyReportError } from '@/modules/reports/report-errors';
import { listTaskTitulosByReport } from '@/modules/tasks/task.repository';
import { formatBRL, formatData, formatPeriodo } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Stat } from '@/components/ui/Stat';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { Alert } from '@/components/ui/Alert';
import { Reveal } from './reveal';
import { Toc } from './toc';
import { EvolucaoChart } from './evolucao-chart';

export default async function RelatorioDetalhePage({ params }: { params: { id: string } }) {
  const access = await requireActiveOrg();
  const rel = await getReportById(params.id, access.orgId);

  if (!rel) notFound();

  const titulosExistentes = rel.analiseIa
    ? await listTaskTitulosByReport(rel.id, access.orgId)
    : [];

  return (
    <main className="mx-auto max-w-6xl p-6 md:p-8">
      <a href="/dashboard" className="text-sm text-muted transition-colors hover:text-white">
        ← Voltar
      </a>

      {/* Hero editorial */}
      <header className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-bg-surface p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 90% at 20% 0%, rgba(7,221,43,0.08) 0%, transparent 60%)',
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-brand">
              Análise Truth
            </p>
            <h1 className="mt-1 font-heading text-3xl font-bold text-white">Relatório</h1>
            <p className="mt-2 font-mono text-sm text-muted">
              {formatPeriodo(rel.periodoInicio, rel.periodoFim)}
            </p>
            <p className="mt-0.5 text-xs text-dim">Gerado em {formatData(rel.createdAt)}</p>
          </div>
          <div className="flex items-center gap-3">
            {rel.status === 'done' && rel.metricas ? (
              <Button
                as="a"
                href={`/api/reports/${rel.id}/pdf`}
                variant="secondary"
                size="sm"
                data-testid="export-pdf"
              >
                Exportar PDF
              </Button>
            ) : null}
            <span data-testid="report-status">
              <Badge variant={reportStatusVariant(rel.status)}>{STATUS_LABEL[rel.status]}</Badge>
            </span>
          </div>
        </div>
      </header>

      {rel.status === 'done' && rel.metricas ? (
        <div className="mt-6 flex gap-8">
          <Toc
            items={[
              { href: '#metricas', label: 'Métricas' },
              ...(rel.analiseIa
                ? [
                    { href: '#resumo', label: 'Resumo executivo' },
                    { href: '#recomendacoes', label: 'Recomendações' },
                    { href: '#precos', label: 'Preços sugeridos' },
                  ]
                : []),
            ]}
          />

          <div className="min-w-0 flex-1 space-y-10">
            <Reveal id="metricas" data-testid="metricas" className="space-y-6 scroll-mt-24">
              <h2 className="font-heading text-xl font-semibold text-white">Métricas</h2>

              {/* Ticket médio como Stat */}
              <Card className="inline-flex">
                <Stat label="Ticket médio" value={formatBRL(rel.metricas.ticketMedio)} />
              </Card>

              {rel.metricas.benchmarkParcial && (
                <Badge variant="warn" className="flex w-fit gap-1.5">
                  Benchmark de mercado parcial — dados de concorrência incompletos.
                </Badge>
              )}

              {/* Evolução agora como chart + tabela */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-sm">Evolução</CardTitle>
                </CardHeader>
                <CardContent>
                  <EvolucaoChart
                    data={rel.metricas.evolucao.map((e) => ({ x: e.data, y: e.total }))}
                  />
                  <Table>
                    <THead>
                      <TR>
                        <TH>Data</TH>
                        <TH className="text-right">Total</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rel.metricas.evolucao.map((e, i) => (
                        <TR key={i}>
                          <TD className="font-mono text-sm">{e.data}</TD>
                          <TD numeric>{formatBRL(e.total)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Vendas por canal */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-sm">Vendas por canal</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Canal</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="text-right">Pedidos</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rel.metricas.vendasPorCanal.map((v, i) => (
                        <TR key={i}>
                          <TD>{v.canal}</TD>
                          <TD numeric>{formatBRL(v.total)}</TD>
                          <TD numeric>{v.pedidos}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Top produtos */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-sm">Top produtos</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <THead>
                      <TR>
                        <TH>Nome</TH>
                        <TH>SKU</TH>
                        <TH className="text-right">Qtd.</TH>
                        <TH className="text-right">Receita</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rel.metricas.topProdutos.map((p, i) => (
                        <TR key={i}>
                          <TD>{p.nome}</TD>
                          <TD className="font-mono text-sm">{p.sku}</TD>
                          <TD numeric>{p.quantidade}</TD>
                          <TD numeric>{formatBRL(p.receita)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Posição de preço */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-sm">Posição de preço</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <THead>
                      <TR>
                        <TH>SKU</TH>
                        <TH>Nome</TH>
                        <TH className="text-right">Nosso preço</TH>
                        <TH className="text-right">Mercado (mediana)</TH>
                        <TH>Fonte</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rel.metricas.posicaoPreco.map((pp, i) => (
                        <TR key={i}>
                          <TD className="font-mono text-sm">{pp.sku}</TD>
                          <TD>{pp.nome}</TD>
                          <TD numeric>{formatBRL(pp.nossoPreco)}</TD>
                          <TD numeric>{formatBRL(pp.precoMercadoMediano)}</TD>
                          <TD>{pp.fonte}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </CardContent>
              </Card>
            </Reveal>

            {rel.analiseIa ? (
              <>
                <Reveal id="resumo" className="space-y-4 scroll-mt-24">
                  <h2 className="font-heading text-xl font-semibold text-white">Análise da IA</h2>
                  <Card>
                    <CardHeader>
                      <CardTitle as="h3" className="text-sm">Resumo executivo</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p data-testid="resumo-executivo" className="leading-relaxed text-white/90">
                        {rel.analiseIa.resumoExecutivo}
                      </p>
                    </CardContent>
                  </Card>
                </Reveal>

                {rel.analiseIa.gargalos.length > 0 ||
                rel.analiseIa.sugestoesMelhoria.length > 0 ||
                rel.analiseIa.ideiasVenda.length > 0 ? (
                  <Reveal id="recomendacoes" className="space-y-4 scroll-mt-24">
                    <h2 className="font-heading text-xl font-semibold text-white">Recomendações</h2>
                    <div className="space-y-4">
                      {rel.analiseIa.gargalos.length > 0 ? (
                        <Card className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="danger">Prioridade Alta</Badge>
                            <CardTitle as="h3" className="text-sm">Gargalos</CardTitle>
                          </div>
                          <AchadosParaTasks
                            reportId={rel.id}
                            fonte="gargalos"
                            itens={rel.analiseIa.gargalos}
                            titulosExistentes={titulosExistentes}
                          />
                        </Card>
                      ) : null}

                      {rel.analiseIa.sugestoesMelhoria.length > 0 ? (
                        <Card className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="warn">Prioridade Média</Badge>
                            <CardTitle as="h3" className="text-sm">Sugestões de melhoria</CardTitle>
                          </div>
                          <AchadosParaTasks
                            reportId={rel.id}
                            fonte="sugestoesMelhoria"
                            itens={rel.analiseIa.sugestoesMelhoria}
                            titulosExistentes={titulosExistentes}
                          />
                        </Card>
                      ) : null}

                      {rel.analiseIa.ideiasVenda.length > 0 ? (
                        <Card className="flex flex-col gap-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="neutral">Prioridade Baixa</Badge>
                            <CardTitle as="h3" className="text-sm">Ideias de venda</CardTitle>
                          </div>
                          <AchadosParaTasks
                            reportId={rel.id}
                            fonte="ideiasVenda"
                            itens={rel.analiseIa.ideiasVenda}
                            titulosExistentes={titulosExistentes}
                          />
                        </Card>
                      ) : null}
                    </div>
                  </Reveal>
                ) : null}

                {rel.analiseIa.recomendacoesPreco.length > 0 ? (
                  <Reveal id="precos" className="space-y-4 scroll-mt-24">
                    <Card>
                      <CardHeader>
                        <CardTitle as="h3" className="text-sm">Recomendações de preço</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <THead>
                            <TR>
                              <TH>SKU</TH>
                              <TH>Nome</TH>
                              <TH className="text-right">Preço sugerido</TH>
                              <TH>Justificativa</TH>
                            </TR>
                          </THead>
                          <TBody>
                            {rel.analiseIa.recomendacoesPreco.map((r, i) => (
                              <TR key={i}>
                                <TD className="font-mono text-sm">{r.sku}</TD>
                                <TD>{r.nome}</TD>
                                <TD numeric>{formatBRL(r.precoSugerido)}</TD>
                                <TD className="text-sm text-muted">{r.justificativa}</TD>
                              </TR>
                            ))}
                          </TBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </Reveal>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : rel.status === 'failed' ? (
        <div className="mt-6">
          <Alert variant="danger" title="Relatório falhou.">
            <p data-testid="report-erro">{friendlyReportError(rel.erro)}</p>
          </Alert>
        </div>
      ) : (
        <p className="mt-6 text-muted">Relatório em processamento.</p>
      )}
    </main>
  );
}
