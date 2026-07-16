import Link from 'next/link';

import { aprovarTaskFormAction, concluirTaskFormAction } from '@/actions/tasks.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatBRL, formatData, formatDataUtc } from '@/lib/format';
import { CHECKLIST_CHECKED, CHECKLIST_UNCHECKED, parseChecklist } from '@/modules/tasks/checklist-line';
import type { TaskImpact } from '@/modules/tasks/task-impact';
import {
  PRIORIDADE_TASK_LABEL,
  STATUS_TASK_LABEL,
  TIPO_TASK_LABEL,
  isTaskAtrasada,
  type TaskAtor,
  type TaskCriadoPor,
  type TaskDetail as TaskDetailModel,
  type TaskPrioridade,
  type TaskStatus,
} from '@/modules/tasks/task.types';

import { DevolverTaskButton } from './DevolverTaskButton';
import { TaskChecklist } from './TaskChecklist';
import { TaskComments } from './TaskComments';
import { TaskEditForm } from './TaskEditForm';

const PRIORIDADE_BADGE_VARIANT: Record<TaskPrioridade, 'danger' | 'warn' | 'neutral'> = {
  alta: 'danger',
  media: 'warn',
  baixa: 'neutral',
};

const CRIADO_POR_LABEL: Record<TaskCriadoPor, string> = {
  ia: 'Criada pela análise IA',
  analista: 'Criada pela consultoria',
  cliente: 'Criada pelo cliente',
};

const EVENTO_LABEL: Record<string, string> = {
  criada: 'Task criada',
  comentario: 'Novo comentário',
  aprovada: 'Conclusão aprovada',
  devolvida: 'Devolvida para ajustes',
  editada: 'Editada',
  prazo: 'Prazo alterado',
  assignee: 'Responsável alterado',
  lembrete_prazo: 'Lembrete de prazo enviado',
  reincidencia: 'Reincidência de recomendação concluída',
};

function statusLabel(status: string | null): string {
  if (!status) return '';
  return status in STATUS_TASK_LABEL ? STATUS_TASK_LABEL[status as TaskStatus] : status;
}

function eventoLabel(a: { evento: string; de: string | null; para: string | null }): string {
  if (a.evento === 'status') {
    return `Movida de ${statusLabel(a.de)} para ${statusLabel(a.para)}`;
  }
  return EVENTO_LABEL[a.evento] ?? a.evento;
}

/** Texto livre da descrição — exclui as linhas de checklist (renderizadas à parte por TaskChecklist). */
function descricaoLivre(descricao: string): string {
  return descricao
    .split('\n')
    .filter((line) => !line.startsWith(CHECKLIST_UNCHECKED) && !line.startsWith(CHECKLIST_CHECKED))
    .join('\n')
    .trim();
}

function formatDeltaPct(pctArredondado: number): string {
  const sinal = pctArredondado > 0 ? '+' : '';
  return `${sinal}${pctArredondado}%`;
}

export function TaskDetail({
  task,
  ator,
  orgId,
  comments,
  activities,
  impact,
  backHref,
}: {
  task: TaskDetailModel;
  ator: TaskAtor;
  orgId?: string;
  comments: Array<{ id: string; corpo: string; userEmail: string; createdAt: Date }>;
  activities: Array<{
    id: string;
    evento: string;
    de: string | null;
    para: string | null;
    userEmail: string | null;
    createdAt: Date;
  }>;
  impact: TaskImpact;
  backHref: string;
}) {
  const atrasada = isTaskAtrasada(task);
  const itensChecklist = parseChecklist(task.descricao);
  const textoLivre = descricaoLivre(task.descricao);

  // Concluir é a única ação de movimentação disponível aqui para o cliente
  // (aprovar/devolver são exclusivos do analista/admin — Task 11).
  const mostrarConcluir = ator === 'cliente' && task.status === 'em_andamento';
  const mostrarAprovarDevolver = ator !== 'cliente' && task.status === 'em_revisao';

  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-sm text-muted transition-colors hover:text-white">
        ← Voltar
      </Link>

      <header className="rounded-2xl border border-line bg-bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold text-white">{task.titulo}</h1>
            <p className="mt-1 text-xs text-dim">{CRIADO_POR_LABEL[task.criadoPor]}</p>
          </div>

          {mostrarConcluir ? (
            <form action={concluirTaskFormAction}>
              <input type="hidden" name="taskId" value={task.id} />
              {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
              <Button type="submit" variant="secondary" size="sm" data-testid="task-concluir">
                Concluir
              </Button>
            </form>
          ) : null}

          {mostrarAprovarDevolver && orgId ? (
            <div className="flex items-center gap-2">
              <form action={aprovarTaskFormAction}>
                <input type="hidden" name="taskId" value={task.id} />
                <input type="hidden" name="orgId" value={orgId} />
                <Button type="submit" size="sm" data-testid="aprovar-task">
                  Aprovar
                </Button>
              </form>
              <DevolverTaskButton taskId={task.id} orgId={orgId} titulo={task.titulo} />
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant="neutral">{STATUS_TASK_LABEL[task.status]}</Badge>
          <Badge variant="neutral">{TIPO_TASK_LABEL[task.tipo]}</Badge>
          <Badge variant={PRIORIDADE_BADGE_VARIANT[task.prioridade]}>
            {PRIORIDADE_TASK_LABEL[task.prioridade]}
          </Badge>
          {atrasada ? <Badge variant="danger">Atrasada</Badge> : null}
          {task.descricao.includes('_Reincidente:') ? <Badge variant="warn">Reincidente</Badge> : null}
        </div>

        {/* task.prazo é dia-calendário 'yyyy-mm-dd' (date-only): formatDataUtc
            não desloca o dia (formatData/BRT tiraria 1 dia — bug da Task 2). */}
        {task.prazo ? <p className="mt-2 text-xs text-dim">Prazo: {formatDataUtc(task.prazo)}</p> : null}
      </header>

      {ator !== 'cliente' && orgId ? (
        <TaskEditForm
          task={{
            id: task.id,
            titulo: task.titulo,
            descricao: task.descricao,
            tipo: task.tipo,
            prioridade: task.prioridade,
            prazo: task.prazo,
          }}
          orgId={orgId}
          backHref={backHref}
        />
      ) : null}

      {textoLivre || itensChecklist.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-sm">Descrição</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {textoLivre ? <p className="whitespace-pre-wrap text-sm text-white/90">{textoLivre}</p> : null}
            <TaskChecklist taskId={task.id} itens={itensChecklist} orgId={orgId} />
          </CardContent>
        </Card>
      ) : null}

      {impact !== null ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="text-sm">Impacto</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Cor baseada no MESMO valor arredondado exibido no texto — evita
              // que um deltaPct pequeno e negativo (ex.: -0.4%) apareça como
              // "0%" pintado de vermelho.
              const pctArredondado = Math.round(impact.deltaPct);
              const corDelta =
                pctArredondado > 0 ? 'text-success-fg' : pctArredondado < 0 ? 'text-danger-fg' : 'text-dim';
              return (
                <p data-testid="task-impacto" className="text-sm text-white/90">
                  Vendas no período do relatório de origem: {formatBRL(impact.totalOrigem)} → relatório mais recente:{' '}
                  {formatBRL(impact.totalAtual)} (<span className={corDelta}>{formatDeltaPct(pctArredondado)}</span>)
                </p>
              );
            })()}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-sm">Comentários</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskComments taskId={task.id} orgId={orgId} comments={comments} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" className="text-sm">Atividades</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <p className="text-sm text-dim">Nenhuma atividade registrada.</p>
          ) : (
            <ol data-testid="task-atividades" className="space-y-2">
              {activities.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-white/80">
                    {eventoLabel(a)}
                    {a.userEmail ? <span className="text-xs text-dim"> — {a.userEmail}</span> : null}
                  </span>
                  <span className="whitespace-nowrap text-xs text-dim">{formatData(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
