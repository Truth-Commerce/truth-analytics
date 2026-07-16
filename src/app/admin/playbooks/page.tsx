import { requireAdmin } from '@/modules/auth/require-admin';
import { listTemplates } from '@/modules/tasks/task-template.repository';
import { PageHeader } from '@/components/page-header';
import { PlaybooksManager } from './playbooks-manager';

export default async function PlaybooksPage() {
  await requireAdmin();
  const templates = await listTemplates(false);

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        eyebrow="Operação Truth"
        title="Playbooks"
        description="Templates de task reutilizáveis pelo analista ao criar uma nova tarefa. Global — não pertence a nenhum cliente específico."
      />
      <PlaybooksManager templates={templates} />
    </main>
  );
}
