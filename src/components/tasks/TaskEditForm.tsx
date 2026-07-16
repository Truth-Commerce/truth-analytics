'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { deleteTaskFormAction, updateTaskAction, type TaskActionState } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import {
  PRIORIDADE_TASK_LABEL,
  TASK_PRIORIDADES,
  TASK_TIPOS,
  TIPO_TASK_LABEL,
  type TaskPrioridade,
  type TaskTipo,
} from '@/modules/tasks/task.types';

const initial: TaskActionState = {};

function SalvarButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} data-testid="task-edit-salvar">
      Salvar alterações
    </Button>
  );
}

/**
 * Edição + exclusão de task — SÓ analista/admin (o servidor também bloqueia
 * cliente em updateTaskAction/deleteTaskFormAction; aqui o componente nem é
 * montado para o cliente — ver TaskDetail).
 */
export function TaskEditForm({
  task,
  orgId,
  backHref,
}: {
  task: { id: string; titulo: string; descricao: string; tipo: TaskTipo; prioridade: TaskPrioridade; prazo: string | null };
  orgId: string;
  backHref: string;
}) {
  const [state, action] = useFormState(updateTaskAction, initial);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok) toast({ variant: 'success', title: 'Tarefa atualizada' });
    if (state.error) toast({ variant: 'error', title: 'Não foi possível salvar.', description: state.error });
  }, [state, toast]);

  return (
    <details className="rounded-2xl border border-line bg-bg-surface p-5">
      <summary className="cursor-pointer font-heading text-sm font-semibold text-white">Editar tarefa</summary>

      <form action={action} data-testid="task-edit-form" className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="orgId" value={orgId} />

        <Field label="Título" htmlFor="task-edit-titulo" className="sm:col-span-2">
          <Input id="task-edit-titulo" name="titulo" defaultValue={task.titulo} required minLength={3} maxLength={200} />
        </Field>

        <Field label="Tipo" htmlFor="task-edit-tipo">
          <Select id="task-edit-tipo" name="tipo" defaultValue={task.tipo}>
            {TASK_TIPOS.map((tipo) => (
              <option key={tipo} value={tipo}>
                {TIPO_TASK_LABEL[tipo]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Prioridade" htmlFor="task-edit-prioridade">
          <Select id="task-edit-prioridade" name="prioridade" defaultValue={task.prioridade}>
            {TASK_PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_TASK_LABEL[p]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Prazo" htmlFor="task-edit-prazo">
          <Input id="task-edit-prazo" name="prazo" type="date" defaultValue={task.prazo ?? ''} />
        </Field>

        <Field label="Descrição (linhas `- [ ]` viram checklist)" htmlFor="task-edit-descricao" className="sm:col-span-2">
          <textarea
            id="task-edit-descricao"
            name="descricao"
            rows={5}
            maxLength={5000}
            defaultValue={task.descricao}
            className="w-full rounded-lg border border-line bg-bg-elevated px-3 py-2 text-white outline-none transition-colors placeholder:text-dim focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/50"
          />
        </Field>

        <div className="flex items-center justify-between sm:col-span-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            data-testid="task-excluir"
            className="text-danger-fg"
            onClick={() => setConfirmarExclusao(true)}
          >
            Excluir tarefa
          </Button>
          <SalvarButton />
        </div>
      </form>

      {/* Exclusão: form separado (fire-and-refresh) disparado pelo ConfirmDialog. */}
      <form id={`excluir-task-${task.id}`} action={deleteTaskFormAction} className="hidden">
        <input type="hidden" name="taskId" value={task.id} />
        <input type="hidden" name="orgId" value={orgId} />
        <input type="hidden" name="redirectTo" value={backHref} />
      </form>

      <ConfirmDialog
        open={confirmarExclusao}
        title="Excluir esta tarefa?"
        description="Comentários e histórico também serão excluídos. Essa ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="danger"
        onCancel={() => setConfirmarExclusao(false)}
        onConfirm={() => {
          setConfirmarExclusao(false);
          (document.getElementById(`excluir-task-${task.id}`) as HTMLFormElement | null)?.requestSubmit();
        }}
      />
    </details>
  );
}
