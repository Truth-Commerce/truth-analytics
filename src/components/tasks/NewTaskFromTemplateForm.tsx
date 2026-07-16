'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { createTaskAction, type TaskActionState } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { TaskTemplate } from '@/modules/tasks/task-template.repository';
import { TASK_TIPOS } from '@/modules/tasks/task.types';

const initial: TaskActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      Criar de template
    </Button>
  );
}

/**
 * Cria uma task a partir de um `TaskTemplate` (Task 11 — analista/admin).
 * `createTaskAction` exige titulo/tipo mesmo com templateId (o servidor os
 * sobrescreve a partir do template quando `ator !== 'cliente'`) — por isso
 * envia valores placeholder ocultos para eles. Prioridade e prazo vêm do
 * playbook (prioridade + prazo_dias); o servidor os aplica (Task 10 — G3).
 */
export function NewTaskFromTemplateForm({ orgId, templates }: { orgId: string; templates: TaskTemplate[] }) {
  const [state, action] = useFormState(createTaskAction, initial);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast({ variant: 'success', title: 'Task criada a partir do template' });
      formRef.current?.reset();
    }
  }, [state, toast]);

  if (templates.length === 0) return null;

  return (
    <form ref={formRef} action={action} data-testid="nova-task-template-form" className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="orgId" value={orgId} />
      <input type="hidden" name="titulo" value="Task de template" />
      <input type="hidden" name="tipo" value={TASK_TIPOS[0]} />

      {state.error ? (
        <p role="alert" className="col-span-full text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Field label="Template" htmlFor="nova-task-template-id" className="sm:col-span-2">
        <Select id="nova-task-template-id" name="templateId" defaultValue={templates[0]?.id}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.titulo}
            </option>
          ))}
        </Select>
      </Field>

      <div className="flex justify-end sm:col-span-2">
        <SubmitButton />
      </div>
    </form>
  );
}
