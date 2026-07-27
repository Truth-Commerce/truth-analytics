'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';

import { toggleGeracaoAutomaticaAction, type ConnState } from '@/actions/connections.actions';
import { useToast } from '@/components/ui/Toast';

const initial: ConnState = {};

export function GeracaoAutomaticaToggle({ ativa }: { ativa: boolean }) {
  const [checked, setChecked] = useState(ativa);
  const [state, action] = useFormState(async (previousState: ConnState, formData: FormData) => {
    const nextState = await toggleGeracaoAutomaticaAction(previousState, formData);
    if (nextState.error) setChecked(ativa);
    return nextState;
  }, initial);
  const ativaFieldRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (state.error) {
      toast({ title: 'Não foi possível salvar.', description: state.error, variant: 'error' });
    }
  }, [state, toast, ativa]);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="ativa" ref={ativaFieldRef} defaultValue={String(checked)} />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/90">
        <input
          type="checkbox"
          checked={checked}
          data-testid="geracao-automatica-toggle"
          onChange={(e) => {
            const next = e.currentTarget.checked;
            setChecked(next);
            if (ativaFieldRef.current) ativaFieldRef.current.value = String(next);
            formRef.current?.requestSubmit();
          }}
          className="h-4 w-4 shrink-0 rounded border-line bg-bg-elevated accent-brand"
        />
        Geração automática de relatórios
      </label>
      {state.error ? <span className="text-sm text-danger-fg" role="alert">{state.error}</span> : null}
    </form>
  );
}
