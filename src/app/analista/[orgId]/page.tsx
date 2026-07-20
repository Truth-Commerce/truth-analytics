import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AchadosParaTasks } from '@/components/tasks/AchadosParaTasks';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { NewTaskForm } from '@/components/tasks/NewTaskForm';
import { NewTaskFromTemplateForm } from '@/components/tasks/NewTaskFromTemplateForm';
import { StaffTrackedProducts } from '@/components/tracked-products/StaffTrackedProducts';
import { AcaoPrincipalCard } from '@/components/dashboard/acao-principal';
import { DashboardCharts } from '@/components/dashboard/dashboard-charts';
import { MetaProgress } from '@/components/dashboard/meta-progress';
import { StatCards } from '@/components/dashboard/stat-cards';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { LineChart } from '@/components/ui/charts/LineChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { Tabs } from '@/components/ui/Tabs';
import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { PLANO_LABEL } from '@/lib/labels';
import { formatBRL, formatData, formatDataCurta, formatDataUtc, formatPeriodo } from '@/lib/format';
import { hojeBrt } from '@/lib/timezone';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { orgResumoUnico } from '@/modules/analista/carteira-data.repository';
import { badgeDoNivel, top3Motivos } from '@/modules/analista/carteira-view-model';
import { getVisao360 } from '@/modules/analista/visao360.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import { statusSugestaoBadge } from '@/modules/calendario/calendario-view-model';
import { badgeDoEstado, labelCobertura, resumoEstoque } from '@/modules/estoque/estoque-view-model';
import { statusKitBadge } from '@/modules/kits/kits-view-model';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { getDashboardData } from '@/modules/reports/dashboard-data';
import { paceMeta, progressoMeta } from '@/modules/reports/compare';
import {
  acaoNumeroUm,
  srSummaryEvolucao,
  statCardsModel,
} from '@/modules/reports/dashboard-model';
import { listTemplates } from '@/modules/tasks/task-template.repository';
import { atorFromRole } from '@/modules/tasks/task.types';
import { listTasksKanban } from '@/modules/tasks/task.repository';
import { listTrackedProducts } from '@/modules/tracked-products/tracked-product.repository';

import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { orgId: string } }): Promise<Metadata> {
  const org = await getOrganizationById(params.orgId);
  return { title: org ? `${org.name} · Cliente` : 'Cliente' };
}

export default async function AnalistaOrgPage({ params }: { params: { orgId: string } }) {
  const access = await requireAnalista();

  // Multi-tenancy: analista só acessa orgs da carteira; org fora da carteira
  // vira 404 (nunca vazamos "existe mas você não tem acesso"). TODA leitura
  // abaixo (hero + reuso do cliente + camadas exclusivas) é org-scoped e só
  // acontece depois deste guard.
  try {
    await assertOrgAccess(access, params.orgId);
  } catch (e) {
    if (e instanceof Error && e.message === 'acesso_negado') notFound();
    throw e;
  }

  const orgId = params.orgId;
  const ator = atorFromRole(access.role);
  const agora = new Date();

  const [resumo, dashboardData, visao360, tarefas, templates, produtos] = await Promise.all([
    orgResumoUnico(access, orgId, agora),
    getDashboardData(orgId),
    getVisao360(orgId, agora),
    listTasksKanban(orgId),
    listTemplates(true),
    listTrackedProducts(orgId),
  ]);

  const { org, historico, latestDone, doneAnterior, settings, totalMes, conn, ultimaDataPedido, titulosTasksUltimoDone } =
    dashboardData;
  if (!org) notFound();

  // "Achados do relatório" (tab preservada) usa o mesmo latestDone/titulos já
  // calculados por getDashboardData — dedupe do que a página antiga buscava
  // separadamente (getLatestDoneReport ≡ dashboardData.latestDone).
  const relatorio = latestDone;
  const titulosExistentes = titulosTasksUltimoDone;
  const analiseIa = relatorio?.analiseIa ?? null;
  const reportId = relatorio?.id ?? '';

  // --- "O que o cliente vê" — mesma derivação de src/app/(client)/dashboard/page.tsx ---
  const metaAtual = settings?.metaMensal ?? null;
  const progresso = progressoMeta(totalMes, metaAtual);
  const pace = paceMeta(totalMes, metaAtual, hojeBrt(agora));
  const dadosAte = conn?.last_sync_at
    ? formatData(conn.last_sync_at)
    : ultimaDataPedido
      ? formatDataUtc(ultimaDataPedido)
      : null;
  const acao = latestDone ? acaoNumeroUm(latestDone.analiseIa) : null;

  const riscoBadge = resumo ? badgeDoNivel(resumo.risco.nivel) : null;
  const motivosTop3 = resumo ? top3Motivos(resumo.risco.motivos) : [];

  const scoreHistoricoData = visao360.scoreHistorico.map((p) => ({ x: p.label, y: p.score }));
  const resumoEstoqueCounts = resumoEstoque(visao360.estoque);

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-8">
      <Link href="/analista" className="text-sm text-muted transition-colors hover:text-white">
        ← Carteira
      </Link>

      {/* 1. Hero — nome/nicho/plano/risco (T3 orgResumoUnico + T2 score de risco) */}
      <div data-testid="analista-360-hero">
        <PageHeader eyebrow="Cliente da carteira" title={org.name} description={org.nicho ?? undefined}>
          {riscoBadge ? (
            <Badge variant={riscoBadge.variant}>
              {riscoBadge.label} · risco {resumo!.risco.score}
            </Badge>
          ) : null}
          <span className="font-mono text-sm text-muted">
            {org.plano ? PLANO_LABEL[org.plano] : 'sem plano'}
          </span>
        </PageHeader>
        {motivosTop3.length > 0 ? (
          <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-dim">
            {motivosTop3.map((motivo) => (
              <li key={motivo}>{motivo}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* 2. Pauta IA do ciclo (T4 briefing) — card destacado, primeira coisa que o analista lê */}
      <Reveal data-testid="analista-360-briefing">
        {visao360.briefing ? (
          <Card className="border-brand/30">
            <CardHeader>
              <CardTitle as="h2" className="text-base">Pauta da reunião</CardTitle>
              {visao360.briefingCriadoEm ? (
                <span className="text-xs text-dim">gerada em {formatData(visao360.briefingCriadoEm)}</span>
              ) : null}
            </CardHeader>
            <CardContent className="space-y-4">
              {visao360.briefing.prioridades.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand">Prioridades</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-white/90">
                    {visao360.briefing.prioridades.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {visao360.briefing.argumentosReuniao.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brand">Argumentos para falar com o cliente</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                    {visao360.briefing.argumentosReuniao.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {visao360.briefing.riscos.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-danger-fg">Riscos</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted">
                    {visao360.briefing.riscos.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            title="Nenhuma pauta gerada ainda"
            description="A pauta da reunião é gerada por IA junto com o relatório do ciclo — assim que o próximo relatório rodar, ela aparece aqui."
          />
        )}
      </Reveal>

      {/* 3. O que o cliente vê — reuso direto dos componentes do dashboard (extraídos p/ src/components/dashboard) */}
      <Reveal className="space-y-4" data-testid="analista-360-cliente-view">
        <h2 className="font-heading text-lg font-semibold text-white">O que o cliente vê</h2>

        {acao && latestDone ? (
          <AcaoPrincipalCard
            reportId={latestDone.id}
            acao={acao}
            jaExiste={titulosTasksUltimoDone.includes(acao.titulo)}
          />
        ) : null}

        {historico.length > 0 ? (
          <MetaProgress progresso={progresso} meta={metaAtual} totalMes={totalMes} pace={pace} dadosAte={dadosAte} />
        ) : null}

        {latestDone?.metricas ? (
          <>
            <p className="text-xs text-dim" data-testid="analista-360-stats-periodo">
              Período analisado: {formatPeriodo(latestDone.periodoInicio, latestDone.periodoFim)}
            </p>
            <StatCards items={statCardsModel(latestDone.metricas, doneAnterior?.metricas ?? null)} />
            <DashboardCharts
              evolucao={latestDone.metricas.evolucao.map((e) => ({ x: formatDataCurta(e.data), y: e.total }))}
              canais={latestDone.metricas.vendasPorCanal.map((v) => ({ label: v.canal, value: v.total }))}
              srSummary={srSummaryEvolucao(latestDone.metricas.evolucao)}
            />
          </>
        ) : (
          <EmptyState
            title="Ainda sem relatório concluído"
            description="Assim que o primeiro relatório rodar, os números do cliente aparecem aqui."
          />
        )}
      </Reveal>

      {/* 4. Camadas exclusivas do analista (o cliente não vê) */}
      <Reveal className="space-y-3" data-testid="analista-360-score-historico">
        <h2 className="font-heading text-lg font-semibold text-white">Histórico do Truth Score</h2>
        {scoreHistoricoData.length > 0 ? (
          <Card>
            <LineChart data={scoreHistoricoData} height={220} />
          </Card>
        ) : (
          <EmptyState
            title="Sem histórico de score ainda"
            description="Cada relatório concluído com Truth Score entra neste gráfico."
          />
        )}
      </Reveal>

      <Reveal className="space-y-3" data-testid="analista-360-estoque">
        <h2 className="font-heading text-lg font-semibold text-white">Estoque</h2>
        {visao360.estoque.length === 0 ? (
          <EmptyState
            title="Sem dados de estoque ainda"
            description="O estoque sincroniza automaticamente todo dia às 4h30 (horário de Brasília)."
          />
        ) : (
          <Card className="!p-0">
            <CardHeader className="p-5 pb-0">
              <CardTitle className="text-base">
                Cobertura por produto
                <span className="ml-2 font-mono text-xs font-normal text-muted">
                  {resumoEstoqueCounts.criticos} críticos · {resumoEstoqueCounts.atencao} em atenção ·{' '}
                  {resumoEstoqueCounts.parados} parados
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <Table>
                <THead>
                  <TR>
                    <TH>Produto</TH>
                    <TH className="text-right">Saldo</TH>
                    <TH className="text-right">Vendas 30d</TH>
                    <TH className="text-right">Cobertura</TH>
                    <TH>Estado</TH>
                  </TR>
                </THead>
                <TBody>
                  {visao360.estoque.map((p) => {
                    const badge = badgeDoEstado(p.estado);
                    return (
                      <TR key={p.sku}>
                        <TD>
                          {p.nome} <span className="font-mono text-xs text-muted">{p.sku}</span>
                        </TD>
                        <TD numeric>{p.saldo}</TD>
                        <TD numeric>{p.vendas30d}</TD>
                        <TD numeric>{labelCobertura(p)}</TD>
                        <TD>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </Reveal>

      <Reveal className="space-y-3" data-testid="analista-360-kits">
        <h2 className="font-heading text-lg font-semibold text-white">Kits sugeridos</h2>
        {visao360.kits.length === 0 ? (
          <EmptyState
            title="Nenhum kit sugerido ainda"
            description="Kits são gerados junto com cada relatório, a partir dos produtos comprados juntos."
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visao360.kits.map((k) => {
              const badge = statusKitBadge(k.status);
              return (
                <Card key={k.id}>
                  <CardHeader>
                    <CardTitle className="text-sm">{k.titulo}</CardTitle>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <ul className="text-muted">
                      {k.itens.map((i, idx) => (
                        <li key={`${i.sku}-${idx}`}>
                          {i.nome} <span className="font-mono text-xs">{i.sku}</span>
                        </li>
                      ))}
                    </ul>
                    {k.precoSugerido !== null ? (
                      <p className="font-mono text-white">{formatBRL(k.precoSugerido)}</p>
                    ) : null}
                    <p className="text-xs text-muted">
                      {k.canalRecomendado} · comprados juntos em {k.pedidosJuntos} pedido(s)
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Reveal>

      <Reveal className="space-y-3" data-testid="analista-360-calendario">
        <h2 className="font-heading text-lg font-semibold text-white">Calendário comercial</h2>
        {visao360.sugestoesCalendario.length === 0 ? (
          <EmptyState
            title="Nenhuma sugestão de calendário ainda"
            description="Sugestões sazonais são geradas junto com cada relatório."
          />
        ) : (
          <div className="space-y-3">
            {visao360.sugestoesCalendario.map((s) => {
              const badge = statusSugestaoBadge(s.status);
              return (
                <Card key={s.id}>
                  <CardHeader>
                    <CardTitle className="text-sm">
                      {s.titulo} <span className="ml-2 font-mono text-xs text-muted">{s.nomeData}</span>
                    </CardTitle>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p>{s.sugestao}</p>
                    {s.skus.length > 0 ? <p className="font-mono text-xs text-muted">{s.skus.join(', ')}</p> : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </Reveal>

      <Reveal className="space-y-3" data-testid="analista-360-alertas">
        <h2 className="font-heading text-lg font-semibold text-white">Linha do tempo de alertas</h2>
        {visao360.alertas.length === 0 ? (
          <EmptyState title="Nenhum alerta registrado" description="Alertas aparecem aqui quando os detectores rodam." />
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-bg-surface">
            {visao360.alertas.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.severidade === 'critico' ? 'danger' : 'warn'}>
                      {a.severidade === 'critico' ? 'Crítico' : 'Atenção'}
                    </Badge>
                    <Badge variant={a.resolvido ? 'neutral' : 'success'}>
                      {a.resolvido ? 'Resolvido' : 'Aberto'}
                    </Badge>
                    <p className="text-sm font-medium text-white">{a.titulo}</p>
                  </div>
                  <p className="text-sm text-muted">{a.corpo}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-dim">
                  {a.resolvido && a.resolvidoEm ? `resolvido em ${formatData(a.resolvidoEm)}` : formatData(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      <Reveal className="space-y-3" data-testid="analista-360-tasks-impacto">
        <h2 className="font-heading text-lg font-semibold text-white">Tasks concluídas com impacto</h2>
        {visao360.tasksImpacto.length === 0 ? (
          <EmptyState
            title="Nenhuma task concluída com impacto medível ainda"
            description="Assim que uma task concluída tiver um relatório posterior para comparar, o impacto aparece aqui."
          />
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-bg-surface">
            {visao360.tasksImpacto.map(({ task, impacto }) => (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <Link
                  href={`/analista/${orgId}/tasks/${task.id}`}
                  className="text-sm font-medium text-white outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-brand/50"
                >
                  {task.titulo}
                </Link>
                <span
                  className={`font-mono text-sm ${impacto.deltaPct >= 0 ? 'text-brand' : 'text-danger-fg'}`}
                >
                  {impacto.deltaPct >= 0 ? '▲ +' : '▼ '}
                  {Math.abs(impacto.deltaPct).toFixed(1).replace('.', ',')}% ({formatBRL(impacto.totalOrigem)} →{' '}
                  {formatBRL(impacto.totalAtual)})
                </span>
              </li>
            ))}
          </ul>
        )}
      </Reveal>

      {/* 5. Gestão de tarefas do cliente — seções preservadas da página anterior (Kanban/Nova task/Achados/Produtos) */}
      <Tabs
        defaultValue="kanban"
        items={[
          {
            id: 'kanban',
            label: 'Kanban',
            content: (
              <KanbanBoard tasks={tarefas} ator={ator} taskHrefBase={`/analista/${orgId}/tasks`} orgId={orgId} />
            ),
          },
          {
            id: 'nova-task',
            label: 'Nova task',
            content: (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle as="h2" className="text-sm">
                      Nova task
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <NewTaskForm orgId={orgId} />
                  </CardContent>
                </Card>

                {templates.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle as="h2" className="text-sm">
                        A partir de um template
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <NewTaskFromTemplateForm orgId={orgId} templates={templates} />
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ),
          },
          {
            id: 'achados',
            label: 'Achados do relatório',
            content:
              analiseIa === null ? (
                <EmptyState
                  title="Nenhum relatório concluído ainda."
                  description="Assim que a análise IA rodar para esse cliente, os achados aparecem aqui para virar tasks."
                />
              ) : (
                <div className="space-y-4">
                  {analiseIa.gargalos.length > 0 ? (
                    <Card className="flex flex-col gap-3">
                      <CardTitle as="h3" className="text-sm">
                        Gargalos
                      </CardTitle>
                      <AchadosParaTasks
                        reportId={reportId}
                        fonte="gargalos"
                        itens={analiseIa.gargalos}
                        titulosExistentes={titulosExistentes}
                      />
                    </Card>
                  ) : null}

                  {analiseIa.sugestoesMelhoria.length > 0 ? (
                    <Card className="flex flex-col gap-3">
                      <CardTitle as="h3" className="text-sm">
                        Sugestões de melhoria
                      </CardTitle>
                      <AchadosParaTasks
                        reportId={reportId}
                        fonte="sugestoesMelhoria"
                        itens={analiseIa.sugestoesMelhoria}
                        titulosExistentes={titulosExistentes}
                      />
                    </Card>
                  ) : null}

                  {analiseIa.ideiasVenda.length > 0 ? (
                    <Card className="flex flex-col gap-3">
                      <CardTitle as="h3" className="text-sm">
                        Ideias de venda
                      </CardTitle>
                      <AchadosParaTasks
                        reportId={reportId}
                        fonte="ideiasVenda"
                        itens={analiseIa.ideiasVenda}
                        titulosExistentes={titulosExistentes}
                      />
                    </Card>
                  ) : null}
                </div>
              ),
          },
          {
            id: 'produtos',
            label: `Produtos (${produtos.length})`,
            content: (
              <Card>
                <CardContent>
                  <StaffTrackedProducts
                    orgId={orgId}
                    produtos={produtos.map((p) => ({
                      id: p.id,
                      nome: p.nome,
                      sku: p.sku,
                      keywords: p.keywords,
                    }))}
                  />
                </CardContent>
              </Card>
            ),
          },
        ]}
      />
    </main>
  );
}
