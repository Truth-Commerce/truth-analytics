import { formatBRL } from '@/lib/format';
import { getConsultoriaMetrics, getImpactoPorOrg } from '@/modules/analista/analista.repository';
import { requireAdmin } from '@/modules/auth/require-admin';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { Stat } from '@/components/ui/Stat';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Consultoria' };

export default async function ConsultoriaPage() {
  const admin = await requireAdmin();
  const [metrics, impactoTodos] = await Promise.all([getConsultoriaMetrics(), getImpactoPorOrg(admin)]);
  // Só orgs com 2+ dones têm comparação — as demais não dizem nada aqui.
  const impacto = impactoTodos.filter((o) => o.primeiro !== null && o.ultimo !== null);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader eyebrow="Operação Truth" title="Consultoria" />

      <Reveal>
        <Card>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <Stat
            label="Concluídas (7 dias)"
            value={metrics.concluidas7d}
            data-testid="stat-concluidas-7d"
          />
          <Stat
            label="Concluídas (30 dias)"
            value={metrics.concluidas30d}
            data-testid="stat-concluidas-30d"
          />
          <Stat
            label="Tempo médio de conclusão"
            value={
              metrics.tempoMedioConclusaoDias !== null
                ? `${metrics.tempoMedioConclusaoDias.toFixed(1)} dias`
                : '—'
            }
            data-testid="stat-tempo-medio"
          />
        </div>
        </Card>
      </Reveal>

      <Reveal>
        <Card className="!p-0">
        <Table data-testid="analistas-metrics-table">
          <THead>
            <TR>
              <TH>Analista</TH>
              <TH>Orgs na carteira</TH>
              <TH>Tasks abertas</TH>
              <TH>Concluídas (30d)</TH>
            </TR>
          </THead>
          <TBody>
            {metrics.porAnalista.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-muted" colSpan={4}>
                  Nenhum analista cadastrado.
                </td>
              </tr>
            ) : (
              metrics.porAnalista.map((a) => (
                <TR key={a.analistaId}>
                  <TD>{a.email}</TD>
                  <TD numeric>{a.orgs}</TD>
                  <TD numeric>{a.abertas}</TD>
                  <TD numeric>{a.concluidas30d}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
        </Card>
      </Reveal>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-ink">Impacto por cliente</h2>
        <Card className="!p-0">
          <Table data-testid="impacto-orgs-table">
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Faturamento 1º → último</TH>
                <TH>Score 1º → último</TH>
                <TH>Tasks concluídas</TH>
              </TR>
            </THead>
            <TBody>
              {impacto.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-muted" colSpan={4}>
                    Nenhum cliente com relatórios suficientes para comparar.
                  </td>
                </tr>
              ) : (
                impacto.map((o) => (
                  <TR key={o.orgId}>
                    <TD>{o.orgName}</TD>
                    <TD numeric>
                      {o.primeiro && o.ultimo
                        ? `${formatBRL(o.primeiro.total)} → ${formatBRL(o.ultimo.total)}${o.deltaFaturamentoPct !== null ? ` (${o.deltaFaturamentoPct > 0 ? '+' : ''}${o.deltaFaturamentoPct}%)` : ''}`
                        : '—'}
                    </TD>
                    <TD numeric>
                      {o.primeiro !== null && o.ultimo !== null && o.primeiro.score !== null && o.ultimo.score !== null
                        ? `${o.primeiro.score} → ${o.ultimo.score}`
                        : '—'}
                    </TD>
                    <TD numeric>{o.tasksConcluidas}</TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </Card>
      </section>
    </main>
  );
}
