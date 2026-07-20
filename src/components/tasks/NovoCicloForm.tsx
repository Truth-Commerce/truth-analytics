'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { criarCicloAction, type CycleActionState } from '@/actions/cycles.actions';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

const initial: CycleActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} data-testid="crm-ciclos-novo-submit">
      Criar ciclo
    </Button>
  );
}

/** Form de criação de ciclo (H5/T9) — nome obrigatório, início/fim opcionais (sem os dois, o ciclo nasce sem burndown). */
export function NovoCicloForm() {
  const [state, action] = useFormState(criarCicloAction, initial);
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      toast({ variant: 'success', title: 'Ciclo criado' });
      formRef.current?.reset();
    }
  }, [state, toast]);

  return (
    <form ref={formRef} action={action} data-testid="crm-ciclos-novo-form" className="grid gap-3 sm:grid-cols-3">
      {state.error ? (
        <p role="alert" className="col-span-full text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <Field label="Nome" htmlFor="ciclo-novo-nome" className="sm:col-span-3">
        <Input id="ciclo-novo-nome" name="nome" data-testid="crm-ciclos-novo-nome" required minLength={3} maxLength={120} placeholder="Sprint 12" />
      </Field>

      <Field label="Início" htmlFor="ciclo-novo-inicio">
        <Input id="ciclo-novo-inicio" name="inicio" type="date" data-testid="crm-ciclos-novo-inicio" />
      </Field>

      <Field label="Fim" htmlFor="ciclo-novo-fim">
        <Input id="ciclo-novo-fim" name="fim" type="date" data-testid="crm-ciclos-novo-fim" />
      </Field>

      <div className="flex items-end justify-end">
        <SubmitButton />
      </div>
    </form>
  );
}
