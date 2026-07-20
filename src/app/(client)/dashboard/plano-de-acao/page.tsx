import Link from 'next/link';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { listOrgUsers } from '@/modules/auth/user.repository';
import { getLatestDoneReport } from '@/modules/reports/report.repository';
import { listTasksKanban } from '@/modules/tasks/task.repository';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { NewTaskForm } from '@/components/tasks/NewTaskForm';
import { PageHeader } from '@/components/page-header';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Plano de Ação' };

export default async function PlanoDeAcaoPage() {
  const access = await requireActiveOrg();
  const [tasks, ultimoRelatorio, usuarios] = await Promise.all([
    listTasksKanban(access.orgId),
    getLatestDoneReport(access.orgId),
    listOrgUsers(access.orgId),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="Consultoria Truth"
        title="Plano de Ação"
        actions={
          <Link
            href="/dashboard/plano-de-acao/ciclos"
            data-testid="link-ciclos"
            className="rounded-full border border-line px-4 py-1.5 text-sm font-medium text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            Ciclos →
          </Link>
        }
      />

      <details className="rounded-2xl border border-line bg-bg-surface p-5">
        <summary className="cursor-pointer font-heading text-sm font-semibold text-white">Nova task</summary>
        <div className="mt-4">
          <NewTaskForm />
        </div>
      </details>

      <KanbanBoard
        tasks={tasks}
        ator="cliente"
        taskHrefBase="/dashboard/plano-de-acao"
        usuarios={usuarios.map((u) => ({ id: u.id, email: u.email }))}
        emptyCta={
          ultimoRelatorio ? (
            <Link
              href={`/dashboard/relatorios/${ultimoRelatorio.id}`}
              className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-[#04150a] outline-none hover:shadow-glow focus-visible:shadow-glow"
            >
              Ver achados do último relatório
            </Link>
          ) : undefined
        }
      />
    </main>
  );
}
