import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AchadosCards } from '@/components/tasks/AchadosCards';
import { AchadosParaTasks } from '@/components/tasks/AchadosParaTasks';
import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getDoneAnterior, getReportById } from '@/modules/reports/report.repository';
import { heroKpis } from '@/modules/reports/report-view-model';
import { STATUS_LABEL, reportStatusVariant } from '@/modules/reports/report.types';
import { friendlyReportError } from '@/modules/reports/report-errors';
import { listTaskTitulosAbertos } from '@/modules/tasks/task.repository';
import { listTemplates } from '@/modules/tasks/task-template.repository';
import type { TaskTipo } from '@/modules/tasks/task.types';
import { formatBRL, formatData, formatPeriodo } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { Alert } from '@/components/ui/Alert';
import { ScoreGauge } from '@/components/ui/charts/ScoreGauge';
import { Reveal } from './reveal';
import { Toc } from './toc';
import { MetricasSection } from './metricas-section';
import { HeroKpisFaixa } from './hero-kpis';

export default async function RelatorioDetalhePage({ params }: { params: { id: string } }) {
  const access = await requireActiveOrg();
  const rel = await getReportById(params.id, access.orgId);

  if (!rel) notFound();

  const anterior =
    rel.status === 'done' && rel.metricas
      ? await getDoneAnterior(access.orgId, rel.createdAt, rel.id)
      : null;

  const titulosExistentes = rel.analiseIa
    ? await listTaskTitulosAbertos(access.orgId)
    : [];

  // Playbook sugerido por tipo no mini-form de conversão achado→task: 1º
  // template ativo de cada tipo. Só carrega quando o relatório tem achados v2.
  const templatesAtivos = rel.analiseIa?.achados?.length ? await listTemplates(true) : [];
  const playbooksPorTipo: Partial<Record<TaskTipo, { id: string; titulo: string }>> = {};
  for (const t of templatesAtivos) {
    playbooksPorTipo[t.tipo] ??= { id: t.id, titulo: t.titulo };
  }

  return (
    <main className="mx-auto max-w-6xl p-6 md:p-8">
      <Link href="/dashboard" className="text-sm text-muted transition-colors hover:text-white">
        ← Voltar
      </Link>

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
              <>
                <Button
                  as="a"
                  href={`/dashboard/relatorios/comparar?a=${rel.id}`}
                  variant="secondary"
                  size="sm"
                  data-testid="comparar-link"
                >
                  Comparar
                </Button>
                <Button
                  as="a"
                  href={`/api/reports/${rel.id}/pdf`}
                  variant="secondary"
                  size="sm"
                  data-testid="export-pdf"
                >
                  Exportar PDF
                </Button>
              </>
            ) : null}
            <span data-testid="report-status">
              <Badge variant={reportStatusVariant(rel.status)}>{STATUS_LABEL[rel.status]}</Badge>
            </span>
          </div>
        </div>

        {rel.status === 'done' && rel.metricas ? (
          <HeroKpisFaixa
            kpis={heroKpis(rel.metricas, anterior?.metricas ?? null)}
            destaques={rel.analiseIa?.destaques}
          />
        ) : null}
      </header>

      {rel.status === 'done' && rel.metricas ? (
        <div className="mt-6 flex gap-8">
          <Toc
            items={[
              { href: '#metricas', label: 'Métricas' },
              ...(rel.metricas.truth_score
                ? [{ href: '#score-breakdown', label: 'Truth Score' }]
                : []),
              ...(rel.analiseIa ? [{ href: '#resumo', label: 'Resumo executivo' }] : []),
              ...(rel.analiseIa &&
              ((rel.analiseIa.achados?.length ?? 0) > 0 ||
                rel.analiseIa.gargalos.length > 0 ||
                rel.analiseIa.sugestoesMelhoria.length > 0 ||
                rel.analiseIa.ideiasVenda.length > 0)
                ? [{ href: '#recomendacoes', label: 'Recomendações' }]
                : []),
              ...(rel.analiseIa && rel.analiseIa.recomendacoesPreco.length > 0
                ? [{ href: '#precos', label: 'Preços sugeridos' }]
                : []),
            ]}
          />

          <div className="min-w-0 flex-1 space-y-10">
            <Reveal id="metricas" data-testid="metricas" className="space-y-6 scroll-mt-24">
              <MetricasSection metricas={rel.metricas} anterior={anterior?.metricas ?? null} />
            </Reveal>

            {rel.metricas.truth_score && (
              <section id="score-breakdown" data-testid="score-breakdown" className="space-y-3 scroll-mt-24">
                <h2 className="font-heading text-xl font-semibold text-white">Truth Score</h2>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-8">
                    <ScoreGauge score={rel.metricas.truth_score.score} />
                    <div className="min-w-[260px] flex-1 space-y-2">
                      {(
                        [
                          ['Crescimento', rel.metricas.truth_score.fatores.crescimento],
                          ['Posição de preço', rel.metricas.truth_score.fatores.posicaoPreco],
                          ['Diversificação de canais', rel.metricas.truth_score.fatores.diversificacao],
                          ['Regularidade de vendas', rel.metricas.truth_score.fatores.regularidade],
                          ['Cobertura de benchmark', rel.metricas.truth_score.fatores.cobertura],
                        ] as const
                      ).map(([label, fator]) => (
                        <div key={label}>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted">{label}</span>
                            <span className="font-mono text-white">{fator.pontos}/{fator.max}</span>
                          </div>
                          <div className="h-1.5 rounded bg-white/5">
                            <div
                              className="h-1.5 rounded bg-brand"
                              style={{ width: `${(fator.pontos / fator.max) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

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

                {(rel.analiseIa.achados?.length ?? 0) > 0 ||
                rel.analiseIa.gargalos.length > 0 ||
                rel.analiseIa.sugestoesMelhoria.length > 0 ||
                rel.analiseIa.ideiasVenda.length > 0 ? (
                  <Reveal id="recomendacoes" className="space-y-4 scroll-mt-24">
                    <h2 className="font-heading text-xl font-semibold text-white">Recomendações</h2>
                    {rel.analiseIa.achados && rel.analiseIa.achados.length > 0 ? (
                      <AchadosCards
                        reportId={rel.id}
                        achados={rel.analiseIa.achados}
                        titulosExistentes={titulosExistentes}
                        playbooksPorTipo={playbooksPorTipo}
                      />
                    ) : (
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
                    )}
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
