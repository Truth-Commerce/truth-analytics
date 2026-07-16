import Link from 'next/link';
import { notFound } from 'next/navigation';

import { AchadosParaTasks } from '@/components/tasks/AchadosParaTasks';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { NewTaskForm } from '@/components/tasks/NewTaskForm';
import { NewTaskFromTemplateForm } from '@/components/tasks/NewTaskFromTemplateForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Tabs } from '@/components/ui/Tabs';
import { PageHeader } from '@/components/page-header';
import { getOrganizationById } from '@/modules/admin/admin.repository';
import { assertOrgAccess } from '@/modules/analista/analista.repository';
import { requireAnalista } from '@/modules/auth/require-analista';
import { getLatestDoneReport } from '@/modules/reports/report.repository';
import { listTemplates } from '@/modules/tasks/task-template.repository';
import { atorFromRole } from '@/modules/tasks/task.types';
import { listTaskTitulosAbertos, listTasksKanban } from '@/modules/tasks/task.repository';

export default async function AnalistaOrgPage({ params }: { params: { orgId: string } }) {
  const access = await requireAnalista();

  // Multi-tenancy: analista só acessa orgs da carteira; org fora da carteira
  // vira 404 (nunca vazamos "existe mas você não tem acesso").
  try {
    await assertOrgAccess(access, params.orgId);
  } catch (e) {
    if (e instanceof Error && e.message === 'acesso_negado') notFound();
    throw e;
  }

  const orgId = params.orgId;
  const ator = atorFromRole(access.role);

  const [org, tarefas, templates, relatorio] = await Promise.all([
    getOrganizationById(orgId),
    listTasksKanban(orgId),
    listTemplates(true),
    getLatestDoneReport(orgId),
  ]);
  if (!org) notFound();

  const titulosExistentes = relatorio?.analiseIa ? await listTaskTitulosAbertos(orgId) : [];

  const analiseIa = relatorio?.analiseIa ?? null;
  const reportId = relatorio?.id ?? '';

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <Link href="/analista" className="text-sm text-muted transition-colors hover:text-white">
        ← Carteira
      </Link>

      <PageHeader eyebrow="Cliente da carteira" title={org.name} />

      <Tabs
        defaultValue="kanban"
        items={[
          {
            id: 'kanban',
            label: 'Kanban',
            content: (
              <KanbanBoard tasks={tarefas} ator={ator} taskHrefBase={`/analista/${orgId}/tasks`} orgId={orgId} />
            ),
          },
          {
            id: 'nova-task',
            label: 'Nova task',
            content: (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle as="h2" className="text-sm">
                      Nova task
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <NewTaskForm orgId={orgId} />
                  </CardContent>
                </Card>

                {templates.length > 0 ? (
                  <Card>
                    <CardHeader>
                      <CardTitle as="h2" className="text-sm">
                        A partir de um template
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <NewTaskFromTemplateForm orgId={orgId} templates={templates} />
                    </CardContent>
                  </Card>
                ) : null}
              </div>
            ),
          },
          {
            id: 'achados',
            label: 'Achados do relatório',
            content:
              analiseIa === null ? (
                <EmptyState
                  title="Nenhum relatório concluído ainda."
                  description="Assim que a análise IA rodar para esse cliente, os achados aparecem aqui para virar tasks."
                />
              ) : (
                <div className="space-y-4">
                  {analiseIa.gargalos.length > 0 ? (
                    <Card className="flex flex-col gap-3">
                      <CardTitle as="h3" className="text-sm">
                        Gargalos
                      </CardTitle>
                      <AchadosParaTasks
                        reportId={reportId}
                        fonte="gargalos"
                        itens={analiseIa.gargalos}
                        titulosExistentes={titulosExistentes}
                      />
                    </Card>
                  ) : null}

                  {analiseIa.sugestoesMelhoria.length > 0 ? (
                    <Card className="flex flex-col gap-3">
                      <CardTitle as="h3" className="text-sm">
                        Sugestões de melhoria
                      </CardTitle>
                      <AchadosParaTasks
                        reportId={reportId}
                        fonte="sugestoesMelhoria"
                        itens={analiseIa.sugestoesMelhoria}
                        titulosExistentes={titulosExistentes}
                      />
                    </Card>
                  ) : null}

                  {analiseIa.ideiasVenda.length > 0 ? (
                    <Card className="flex flex-col gap-3">
                      <CardTitle as="h3" className="text-sm">
                        Ideias de venda
                      </CardTitle>
                      <AchadosParaTasks
                        reportId={reportId}
                        fonte="ideiasVenda"
                        itens={analiseIa.ideiasVenda}
                        titulosExistentes={titulosExistentes}
                      />
                    </Card>
                  ) : null}
                </div>
              ),
          },
        ]}
      />
    </main>
  );
}
