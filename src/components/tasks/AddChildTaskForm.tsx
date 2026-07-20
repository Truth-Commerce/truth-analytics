'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { criarSubtarefaFormAction, type TaskActionState } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';
import type { Nivel } from '@/modules/tasks/hierarquia';
import {
  PRIORIDADE_TASK_LABEL,
  TASK_PRIORIDADES,
  TASK_TIPOS,
  TIPO_TASK_LABEL,
} from '@/modules/tasks/task.types';

const initial: TaskActionState = {};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} data-testid="add-child-task-submit">
      {label}
    </Button>
  );
}

/**
 * Formulário "Adicionar task filha"/"Adicionar subtarefa" do card Hierarquia
 * (F2, revisão H5/T11) — único lugar da UI que cria um FILHO de uma task já
 * existente. `filhoNivel` é decidido por quem chama a partir do nível do PAI
 * (épico → filhoNivel='task'; task → filhoNivel='subtask') — nunca escolhido
 * pelo usuário aqui, então o form nunca oferece uma combinação que
 * `nivelFilhoValido` recusaria no servidor.
 */
export function AddChildTaskForm({
  parentId,
  filhoNivel,
  orgId,
}: {
  parentId: string;
  filhoNivel: Extract<Nivel, 'task' | 'subtask'>;
  orgId?: string;
}) {
  const [state, action] = useFormState(criarSubtarefaFormAction, initial);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (state.ok) {
      toast({
        variant: 'success',
        title: filhoNivel === 'task' ? 'Task filha criada' : 'Subtarefa criada',
      });
      formRef.current?.reset();
      setAberto(false);
    }
    if (state.error) {
      toast({ variant: 'error', title: 'Não foi possível criar.', description: state.error });
    }
  }, [state, toast, filhoNivel]);

  if (!aberto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-testid="abrir-add-child-task-form"
        onClick={() => setAberto(true)}
      >
        {filhoNivel === 'task' ? '+ Adicionar task filha' : '+ Adicionar subtarefa'}
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      data-testid="add-child-task-form"
      className="grid gap-3 rounded-xl border border-line bg-bg-elevated p-3 sm:grid-cols-2"
    >
      <input type="hidden" name="parentId" value={parentId} />
      <input type="hidden" name="nivel" value={filhoNivel} />
      {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
      {state.error ? (
        <p role="alert" className="col-span-full text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Field label="Título" htmlFor="add-child-titulo" className="sm:col-span-2">
        <Input id="add-child-titulo" name="titulo" required minLength={3} maxLength={200} />
      </Field>

      <Field label="Tipo" htmlFor="add-child-tipo">
        <Select id="add-child-tipo" name="tipo" defaultValue={TASK_TIPOS[0]}>
          {TASK_TIPOS.map((tipo) => (
            <option key={tipo} value={tipo}>
              {TIPO_TASK_LABEL[tipo]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Prioridade" htmlFor="add-child-prioridade">
        <Select id="add-child-prioridade" name="prioridade" defaultValue="media">
          {TASK_PRIORIDADES.map((prioridade) => (
            <option key={prioridade} value={prioridade}>
              {PRIORIDADE_TASK_LABEL[prioridade]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Prazo" htmlFor="add-child-prazo">
        <Input id="add-child-prazo" name="prazo" type="date" />
      </Field>

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
        <SubmitButton label={filhoNivel === 'task' ? 'Adicionar task filha' : 'Adicionar subtarefa'} />
      </div>
    </form>
  );
}
