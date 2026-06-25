import { notFound } from 'next/navigation';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getReportById } from '@/modules/reports/report.repository';
import { STATUS_LABEL } from '@/modules/reports/report.types';
import { formatBRL, formatData, formatPeriodo } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Stat } from '@/components/ui/Stat';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';

function statusVariant(status: string): 'success' | 'warn' | 'danger' | 'neutral' {
  if (status === 'done') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'processing') return 'warn';
  return 'neutral';
}

export default async function RelatorioDetalhePage({ params }: { params: { id: string } }) {
  const access = await requireActiveOrg();
  const rel = await getReportById(params.id, access.orgId);

  if (!rel) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <div className="flex items-center gap-3">
        <a href="/dashboard" className="text-sm text-muted hover:text-white transition-colors">
          ← Voltar
        </a>
      </div>

      <div className="flex flex-wrap items-start gap-3">
        <h1 className="font-heading text-2xl font-bold text-white">Relatório</h1>
        <span data-testid="report-status">
          <Badge variant={statusVariant(rel.status)}>
            {STATUS_LABEL[rel.status]}
          </Badge>
        </span>
      </div>

      <p className="text-sm text-muted">{formatPeriodo(rel.periodoInicio, rel.periodoFim)}</p>
      <p className="text-xs text-dim">{formatData(rel.createdAt)}</p>

      {rel.status === 'done' && rel.metricas ? (
        <>
          <section data-testid="metricas" className="space-y-6">
            <h2 className="font-heading text-xl font-semibold text-white">Métricas</h2>

            {/* Ticket médio como Stat */}
            <Card className="inline-flex">
              <Stat
                label="Ticket médio"
                value={formatBRL(rel.metricas.ticketMedio)}
              />
            </Card>

            {rel.metricas.benchmarkParcial && (
              <Badge variant="warn" className="flex w-fit gap-1.5">
                Benchmark de mercado parcial — dados de concorrência incompletos.
              </Badge>
            )}

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

            {/* Evolução */}
            <Card>
              <CardHeader>
                <CardTitle as="h3" className="text-sm">Evolução</CardTitle>
              </CardHeader>
              <CardContent>
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
          </section>

          {rel.analiseIa ? (
            <section className="space-y-4">
              <h2 className="font-heading text-xl font-semibold text-white">Análise da IA</h2>

              {/* Resumo executivo */}
              <Card>
                <CardHeader>
                  <CardTitle as="h3" className="text-sm">Resumo executivo</CardTitle>
                </CardHeader>
                <CardContent>
                  <p data-testid="resumo-executivo" className="text-white/90 leading-relaxed">
                    {rel.analiseIa.resumoExecutivo}
                  </p>
                </CardContent>
              </Card>

              {rel.analiseIa.gargalos.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle as="h3" className="text-sm">Gargalos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5 text-sm text-white/80">
                      {rel.analiseIa.gargalos.map((g, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-0.5 text-brand">•</span>
                          {g}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {rel.analiseIa.sugestoesMelhoria.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle as="h3" className="text-sm">Sugestões de melhoria</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5 text-sm text-white/80">
                      {rel.analiseIa.sugestoesMelhoria.map((s, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-0.5 text-brand">•</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {rel.analiseIa.ideiasVenda.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle as="h3" className="text-sm">Ideias de venda</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5 text-sm text-white/80">
                      {rel.analiseIa.ideiasVenda.map((iv, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-0.5 text-brand">•</span>
                          {iv}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {rel.analiseIa.recomendacoesPreco.length > 0 && (
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
              )}
            </section>
          ) : null}
        </>
      ) : rel.status === 'failed' ? (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent>
            <p className="font-medium text-red-400">Relatório falhou.</p>
            {rel.erro ? (
              <p data-testid="report-erro" className="mt-1 text-sm text-red-300">
                {rel.erro}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <p className="text-muted">Relatório em processamento.</p>
      )}
    </main>
  );
}
