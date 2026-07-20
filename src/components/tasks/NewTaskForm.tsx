'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { createTaskAction, type TaskActionState } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import {
  PRIORIDADE_TASK_LABEL,
  TASK_PRIORIDADES,
  TASK_TIPOS,
  TIPO_TASK_LABEL,
} from '@/modules/tasks/task.types';

const initial: TaskActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      Criar task
    </Button>
  );
}

// `orgId` é usado pelo analista/admin (Task 11) — o resolveTaskContext da
// Task 7 exige orgId no form para esses papéis (o cliente nunca o envia,
// sempre usa a org da própria sessão).
export function NewTaskForm({ orgId }: { orgId?: string } = {}) {
  const [state, action] = useFormState(createTaskAction, initial);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast({ variant: 'success', title: 'Task criada no Plano de Ação' });
      formRef.current?.reset();
    }
  }, [state, toast]);

  return (
    <form ref={formRef} action={action} data-testid="nova-task-form" className="grid gap-3 sm:grid-cols-2">
      {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
      {state.error ? (
        <p role="alert" className="col-span-full text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Field label="Título" htmlFor="nova-task-titulo" className="sm:col-span-2">
        <Input id="nova-task-titulo" name="titulo" required minLength={3} maxLength={200} />
      </Field>

      <Field label="Tipo" htmlFor="nova-task-tipo">
        <Select id="nova-task-tipo" name="tipo" defaultValue={TASK_TIPOS[0]}>
          {TASK_TIPOS.map((tipo) => (
            <option key={tipo} value={tipo}>
              {TIPO_TASK_LABEL[tipo]}
            </option>
          ))}
        </Select>
      </Field>

      {/* F2 (revisão H5/T11): único ponto da UI que cria a raiz da hierarquia
          (nivel='epico') — sem isso, todo o consumo de hierarquia (progresso
          no card, filtro/swimlane por épico, card Hierarquia) ficava morto. */}
      <Field label="Nível" htmlFor="nova-task-nivel">
        <Select id="nova-task-nivel" name="nivel" defaultValue="task">
          <option value="task">Task</option>
          <option value="epico">Épico</option>
        </Select>
      </Field>

      <Field label="Prioridade" htmlFor="nova-task-prioridade">
        <Select id="nova-task-prioridade" name="prioridade" defaultValue="media">
          {TASK_PRIORIDADES.map((prioridade) => (
            <option key={prioridade} value={prioridade}>
              {PRIORIDADE_TASK_LABEL[prioridade]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Prazo" htmlFor="nova-task-prazo">
        <Input id="nova-task-prazo" name="prazo" type="date" />
      </Field>

      <Field label="Descrição" htmlFor="nova-task-descricao" className="sm:col-span-2">
        <textarea
          id="nova-task-descricao"
          name="descricao"
          rows={3}
          maxLength={5000}
          className="w-full rounded-lg border border-line bg-bg-elevated px-3 py-2 text-white outline-none transition-colors placeholder:text-dim focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/50"
        />
      </Field>

      <div className="flex justify-end sm:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
