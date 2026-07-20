import { Badge } from '@/components/ui/Badge';
import { CanalDot } from '@/components/ui/CanalDot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { BarChart } from '@/components/ui/charts/BarChart';
import { DonutChart } from '@/components/ui/charts/DonutChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { formatBRL } from '@/lib/format';
import { carteiraResumo } from '@/modules/analista/carteira-data.repository';
import {
  agruparPorNicho,
  contarPorQuadrante,
  quadrantesCarteira,
  rankearCanaisCarteira,
  type QuadranteLabel,
} from '@/modules/analista/comparativo';
import { getTasksReplicaveisCarteira, getVendasPorCanalCarteira } from '@/modules/analista/comparativo-data.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import { TIPO_TASK_LABEL } from '@/modules/tasks/task.types';

import { ReplicarTaskButton } from './replicar-task-button';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Comparativo da carteira' };

const QUADRANTE_BADGE: Record<QuadranteLabel, 'success' | 'mono' | 'neutral' | 'warn'> = {
  Estrelas: 'success',
  Crescendo: 'mono',
  Estáveis: 'neutral',
  Atenção: 'warn',
};

export default async function ComparativoPage() {
  // Escopo por PAPEL (analista: só a própria carteira; admin: todas as orgs
  // cliente) — mesma fonte de verdade do command center (T5), via
  // `carteiraResumo`. Nunca `access.orgId` (que só existe p/ acesso de cliente).
  const access = await requireAnalista();
  const agora = new Date();

  const [resumos, canaisCrus, sugestoes] = await Promise.all([
    carteiraResumo(access, agora),
    getVendasPorCanalCarteira(access),
    getTasksReplicaveisCarteira(access),
  ]);

  const quadrantes = quadrantesCarteira(resumos);
  const contagemQuadrantes = contarPorQuadrante(quadrantes);
  const nichos = agruparPorNicho(resumos);
  const canais = rankearCanaisCarteira(canaisCrus);
  const orgsDaCarteira = resumos.map((r) => ({ id: r.orgId, name: r.orgName }));

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6 md:p-8" data-testid="analista-comparativo-page">
      <PageHeader eyebrow="Consultoria Truth" title="Comparativo da carteira" />

      {resumos.length === 0 ? (
        <EmptyState
          title="Nenhuma organização na carteira."
          description="Peça ao admin para atribuir clientes a você."
        />
      ) : (
        <>
          <Reveal className="space-y-3" data-testid="analista-comparativo-quadrantes">
            <h2 className="font-heading text-lg font-semibold text-white">
              Quadrantes: crescimento × volume
            </h2>
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <Card>
                <DonutChart
                  data={Object.entries(contagemQuadrantes).map(([label, value]) => ({ label, value }))}
                />
              </Card>
              <Card className="!p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>Organização</TH>
                      <TH className="text-right">Crescimento</TH>
                      <TH className="text-right">Volume (mês)</TH>
                      <TH>Quadrante</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {quadrantes.map((q) => (
                      <TR key={q.orgId}>
                        <TD>{q.orgName}</TD>
                        <TD numeric>
                          {q.crescimentoPct === null
                            ? '—'
                            : `${q.crescimentoPct > 0 ? '+' : ''}${q.crescimentoPct}%`}
                        </TD>
                        <TD numeric>{formatBRL(q.volume)}</TD>
                        <TD>
                          <Badge variant={QUADRANTE_BADGE[q.quadrante]}>{q.quadrante}</Badge>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            </div>
          </Reveal>

          <Reveal className="space-y-3" data-testid="analista-comparativo-nichos">
            <h2 className="font-heading text-lg font-semibold text-white">Por nicho</h2>
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              <Card className="!p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>Nicho</TH>
                      <TH className="text-right">Organizações</TH>
                      <TH className="text-right">Faturamento médio</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {nichos.map((n) => (
                      <TR key={n.nicho}>
                        <TD>{n.nicho}</TD>
                        <TD numeric>{n.quantidade}</TD>
                        <TD numeric>{formatBRL(n.faturamentoMedio)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
              <Card>
                <BarChart
                  data={nichos.map((n) => ({ label: n.nicho, value: n.faturamentoMedio }))}
                  formatValue={formatBRL}
                />
              </Card>
            </div>
          </Reveal>

          <Reveal className="space-y-3" data-testid="analista-comparativo-canais">
            <h2 className="font-heading text-lg font-semibold text-white">Canais da carteira</h2>
            {canais.length === 0 ? (
              <EmptyState
                title="Sem relatórios concluídos ainda"
                description="O ranking de canais usa o último relatório concluído de cada organização."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <Card>
                  <DonutChart data={canais.map((c) => ({ label: c.canal, value: c.total }))} formatValue={formatBRL} />
                </Card>
                <Card className="!p-0">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Canal</TH>
                        <TH className="text-right">Total</TH>
                        <TH className="text-right">Participação</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {canais.map((c) => (
                        <TR key={c.canal}>
                          <TD>
                            <CanalDot canal={c.canal} />
                            {c.canal}
                          </TD>
                          <TD numeric>{formatBRL(c.total)}</TD>
                          <TD numeric>{c.participacaoPct}%</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </Card>
              </div>
            )}
          </Reveal>

          <Reveal className="space-y-3" data-testid="analista-comparativo-o-que-funcionou">
            <h2 className="font-heading text-lg font-semibold text-white">O que funcionou</h2>
            {sugestoes.length === 0 ? (
              <EmptyState
                title="Nenhuma sugestão replicável ainda"
                description="Assim que uma task concluída tiver impacto positivo medido em vendas, ela aparece aqui pronta para replicar em outra organização."
              />
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-bg-surface">
                {sugestoes.map((s) => (
                  <li key={s.taskId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-white">{s.titulo}</p>
                      <p className="text-xs text-dim">
                        {s.orgName} · {TIPO_TASK_LABEL[s.tipo]} ·{' '}
                        <span className="text-success-fg">+{s.deltaPct.toFixed(1).replace('.', ',')}% vendas</span>
                      </p>
                    </div>
                    <ReplicarTaskButton taskId={s.taskId} orgOrigemId={s.orgId} orgsDaCarteira={orgsDaCarteira} />
                  </li>
                ))}
              </ul>
            )}
          </Reveal>
        </>
      )}
    </main>
  );
}
