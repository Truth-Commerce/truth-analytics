import { getConsultoriaMetrics } from '@/modules/analista/analista.repository';
import { requireAdmin } from '@/modules/auth/require-admin';
import { Card } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';

export default async function ConsultoriaPage() {
  await requireAdmin();
  const metrics = await getConsultoriaMetrics();

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Consultoria</h1>

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
    </main>
  );
}
