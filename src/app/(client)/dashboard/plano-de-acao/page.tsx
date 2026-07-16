import Link from 'next/link';

import { requireActiveOrg } from '@/modules/auth/require-active-org';
import { getLatestDoneReport } from '@/modules/reports/report.repository';
import { listTasksKanban } from '@/modules/tasks/task.repository';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { NewTaskForm } from '@/components/tasks/NewTaskForm';

export default async function PlanoDeAcaoPage() {
  const access = await requireActiveOrg();
  const [tasks, ultimoRelatorio] = await Promise.all([
    listTasksKanban(access.orgId),
    getLatestDoneReport(access.orgId),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-white">Plano de Ação</h1>
      </div>

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
