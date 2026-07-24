import Link from 'next/link';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import {
  burndownDoCiclo,
  getCicloAtivo,
  listCiclos,
  retrospectivaDoCiclo,
  tasksDoCiclo,
  tasksSemCiclo,
  type Cycle,
} from '@/modules/tasks/cycle.repository';
import type { Retrospectiva } from '@/modules/tasks/retrospectiva';
import { CicloAtivoPanel } from '@/components/tasks/CicloAtivoPanel';
import { CiclosList } from '@/components/tasks/CiclosList';
import { NovoCicloForm } from '@/components/tasks/NovoCicloForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/page-header';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Ciclos' };

export default async function CiclosPage() {
  const access = await requireActiveOrg();
  const orgId = access.orgId;

  const [ciclos, cicloAtivo] = await Promise.all([listCiclos(orgId), getCicloAtivo(orgId)]);

  const [tasksCiclo, tasksDisponiveis, burndownPontos] = cicloAtivo
    ? await Promise.all([
        tasksDoCiclo(orgId, cicloAtivo.id),
        tasksSemCiclo(orgId),
        burndownDoCiclo(orgId, cicloAtivo.id),
      ])
    : [[], [], []];

  // Retrospectiva de cada ciclo FECHADO — o motor F2 (via retrospectivaDoCiclo)
  // é recalculado por leitura, não cacheado; para o número de ciclos fechados
  // de uma org (tipicamente dezenas, não milhares) isso é aceitável em troca
  // de nunca mostrar um impacto desatualizado.
  const ciclosFechados = ciclos.filter((c) => c.status === 'fechado');
  const retrospectivasEntries = await Promise.all(
    ciclosFechados.map(async (c): Promise<[string, Retrospectiva]> => [c.id, await retrospectivaDoCiclo(orgId, c.id)]),
  );
  const retrospectivas = Object.fromEntries(retrospectivasEntries);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8" data-testid="crm-ciclos-page">
      <Link href="/dashboard/plano-de-acao" className="text-sm text-muted transition-colors hover:text-ink">
        ← Plano de Ação
      </Link>

      <PageHeader
        eyebrow="Consultoria Truth"
        title="Ciclos"
        description="Planeje sprints, acompanhe o burndown do ciclo ativo e feche com a retrospectiva de impacto."
      />

      <details className="rounded-2xl border border-line bg-bg-surface p-5">
        <summary className="cursor-pointer font-heading text-sm font-semibold text-ink">Novo ciclo</summary>
        <div className="mt-4">
          <NovoCicloForm />
        </div>
      </details>

      {cicloAtivo ? (
        <CicloAtivoPanel
          ciclo={cicloAtivo as Cycle}
          tasks={tasksCiclo}
          tasksDisponiveis={tasksDisponiveis}
          burndown={burndownPontos}
        />
      ) : (
        <EmptyState
          title="Nenhum ciclo ativo"
          description="Crie um ciclo acima e clique em Ativar (na lista abaixo) para acompanhar o burndown."
          data-testid="crm-ciclos-sem-ativo"
        />
      )}

      <CiclosList ciclos={ciclos} retrospectivas={retrospectivas} />
    </main>
  );
}
