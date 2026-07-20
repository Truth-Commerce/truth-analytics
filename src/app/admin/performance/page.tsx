import { formatBRL } from '@/lib/format';
import { PageHeader } from '@/components/page-header';
import { Reveal } from '@/components/reveal';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { listAnalistas } from '@/modules/analista/analista.repository';
import { carteiraResumo } from '@/modules/analista/carteira-data.repository';
import { requireAdmin } from '@/modules/auth/require-admin';
import {
  getAnalistaPorOrg,
  getImpactosPorAnalista,
  getTasksConcluidas30dPorAnalista,
} from '@/modules/admin/performance-data.repository';
import { performancePorAnalista } from '@/modules/admin/performance-analistas';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Admin · Performance' };

/** Janela de "recente" para tasks concluídas + impacto medido (motor F2) — mesma convenção de `getConsultoriaMetrics` (30 dias). */
const JANELA_DIAS = 30;

/**
 * Performance por analista (H4 T8) — corte cross-org por dono da carteira.
 * `carteiraResumo` com access ADMIN devolve TODAS as orgs cliente (T3); o
 * agrupamento por analista (nOrgs/faturamento/SLA/clientes em risco) é feito
 * pela função pura `performancePorAnalista` (zero I/O), a partir do map
 * orgId→analista e das duas leituras batched (concluídas 30d + impacto F2).
 */
export default async function AdminPerformancePage() {
  const access = await requireAdmin();
  const agora = new Date();
  const desde = new Date(agora.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000);

  const [resumos, analistasBase] = await Promise.all([carteiraResumo(access, agora), listAnalistas()]);
  const orgIds = resumos.map((r) => r.orgId);

  const [analistaPorOrg, concluidas30dPorAnalista, impactos] = await Promise.all([
    getAnalistaPorOrg(orgIds),
    getTasksConcluidas30dPorAnalista(desde),
    getImpactosPorAnalista(desde),
  ]);

  const linhas = performancePorAnalista({
    analistas: analistasBase.map((a) => ({ analistaId: a.id, email: a.email })),
    resumos,
    analistaPorOrg,
    concluidas30dPorAnalista,
    impactos,
  });

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6 md:p-8" data-testid="performance-page">
      <PageHeader eyebrow="Operação Truth" title="Performance por analista" />

      <Reveal>
        {linhas.length === 0 ? (
          <EmptyState
            data-testid="performance-vazio"
            title="Nenhum analista cadastrado."
            description="Cadastre um analista e atribua clientes a ele para ver a performance por aqui."
          />
        ) : (
          <Card className="!p-0">
            <Table data-testid="performance-table">
              <THead>
                <TR>
                  <TH>Analista</TH>
                  <TH>Orgs</TH>
                  <TH>Faturamento da carteira</TH>
                  <TH>Concluídas (30d)</TH>
                  <TH>Impacto positivo</TH>
                  <TH>SLA em dia</TH>
                  <TH>Clientes em risco</TH>
                </TR>
              </THead>
              <TBody>
                {linhas.map((l) => (
                  <TR key={l.analistaId} data-testid="performance-row">
                    <TD>{l.email}</TD>
                    <TD numeric>{l.nOrgs}</TD>
                    <TD numeric>{formatBRL(l.faturamentoCarteira)}</TD>
                    <TD numeric>{l.tasksConcluidas30d}</TD>
                    <TD numeric>{l.impactoPositivoAgregado > 0 ? `+${l.impactoPositivoAgregado}%` : '—'}</TD>
                    <TD numeric>{l.slaPct !== null ? `${l.slaPct}%` : '—'}</TD>
                    <TD numeric className={l.clientesEmRisco > 0 ? 'font-semibold text-danger-fg' : ''}>
                      {l.clientesEmRisco}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        )}
      </Reveal>
    </main>
  );
}
