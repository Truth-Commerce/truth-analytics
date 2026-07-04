import { requireAdmin } from '@/modules/auth/require-admin';
import { listTemplates } from '@/modules/tasks/task-template.repository';
import { PlaybooksManager } from './playbooks-manager';

export default async function PlaybooksPage() {
  await requireAdmin();
  const templates = await listTemplates(false);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <h1 className="font-heading text-2xl font-bold text-white">Playbooks</h1>
      <p className="text-sm text-muted">
        Templates de task reutilizáveis pelo analista ao criar uma nova tarefa. Global — não pertence a
        nenhum cliente específico.
      </p>
      <PlaybooksManager templates={templates} />
    </main>
  );
}
