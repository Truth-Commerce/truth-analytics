import { Stat } from '@/components/ui/Stat';
import type { KpisCarteira } from '@/modules/analista/carteira-data.repository';

function formatBRL(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function hintVariacao(pct: number | null): string | undefined {
  if (pct === null) return 'sem mês anterior p/ comparar';
  return `${pct > 0 ? '+' : ''}${pct}% vs mês anterior`;
}

/**
 * Hero de KPIs agregados da carteira (H4 T5) — puro em cima de `kpisDaCarteira`
 * (T3): faturamento do mês + variação, tasks abertas/atrasadas, pendentes de
 * revisão e organizações em risco. RSC-safe (sem estado/efeitos).
 */
export function KpisCarteiraHero({ kpis }: { kpis: KpisCarteira }) {
  return (
    <section
      data-testid="analista-kpis"
      className="grid gap-4 rounded-2xl border border-line bg-bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4"
    >
      <Stat
        data-testid="analista-kpi-faturamento"
        label="Faturamento do mês (carteira)"
        value={formatBRL(kpis.faturamentoMes)}
        hint={hintVariacao(kpis.variacaoFaturamentoPct)}
      />
      <Stat
        data-testid="analista-kpi-tasks-abertas"
        label="Tasks abertas"
        value={kpis.tasksAbertas}
        hint={kpis.tasksAtrasadas > 0 ? `${kpis.tasksAtrasadas} atrasadas` : 'nenhuma atrasada'}
      />
      <Stat
        data-testid="analista-kpi-pendentes-revisao"
        label="Pendentes de revisão"
        value={kpis.pendentesRevisao}
      />
      <Stat
        data-testid="analista-kpi-orgs-risco"
        label="Organizações em risco"
        value={`${kpis.orgsEmRisco}/${kpis.totalOrgs}`}
        hint={kpis.totalOrgs === 0 ? 'carteira vazia' : undefined}
      />
    </section>
  );
}
