'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { createTasksFromReportAction, type TaskActionState } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { tituloFromItem, type FonteAnalise } from '@/modules/tasks/report-to-task';

type State = TaskActionState & { criadas?: number };
const initial: State = {};

function CriarTodasButton({
  fonte,
  disabled,
  onClick,
}: {
  fonte: FonteAnalise;
  disabled: boolean;
  onClick: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      data-testid={`criar-todas-${fonte}`}
      disabled={pending || disabled}
      onClick={onClick}
    >
      Criar todas
    </Button>
  );
}

function VirarTaskButton({
  fonte,
  indice,
  jaExiste,
  onClick,
}: {
  fonte: FonteAnalise;
  indice: number;
  jaExiste: boolean;
  onClick: () => void;
}) {
  const { pending } = useFormStatus();

  if (jaExiste) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled
        data-testid={`virar-task-${fonte}-${indice}`}
      >
        Task criada
      </Button>
    );
  }

  return (
    <Button
      type="submit"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={onClick}
      data-testid={`virar-task-${fonte}-${indice}`}
    >
      Virar task
    </Button>
  );
}

export function AchadosParaTasks({
  reportId,
  fonte,
  itens,
  titulosExistentes,
}: {
  reportId: string;
  fonte: FonteAnalise;
  itens: string[];
  titulosExistentes: string[];
}) {
  const [state, action] = useFormState(createTasksFromReportAction, initial);
  const { toast } = useToast();
  const itensInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok && typeof state.criadas === 'number') {
      toast({ variant: 'success', title: `${state.criadas} task(s) criada(s) no Plano de Ação` });
    }
  }, [state, toast]);

  if (itens.length === 0) return null;

  const existentes = new Set(titulosExistentes);
  const pendentes = itens
    .map((texto, indice) => ({ texto, indice }))
    .filter(({ texto }) => !existentes.has(tituloFromItem(texto)));

  function definirItens(alvo: Array<{ fonte: FonteAnalise; indice: number }>) {
    if (itensInputRef.current) itensInputRef.current.value = JSON.stringify(alvo);
  }

  return (
    <form action={action}>
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="itens" ref={itensInputRef} defaultValue="[]" />

      {state.error ? (
        <p role="alert" className="mb-2 text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <div className="mb-2 flex justify-end">
        <CriarTodasButton
          fonte={fonte}
          disabled={pendentes.length === 0}
          onClick={() => definirItens(pendentes.map(({ indice }) => ({ fonte, indice })))}
        />
      </div>

      <ul className="space-y-2">
        {itens.map((texto, indice) => {
          const jaExiste = existentes.has(tituloFromItem(texto));
          return (
            <li key={indice} className="flex items-start justify-between gap-3 text-sm leading-relaxed text-ink/80">
              <span className="flex-1">• {texto}</span>
              <VirarTaskButton
                fonte={fonte}
                indice={indice}
                jaExiste={jaExiste}
                onClick={() => definirItens([{ fonte, indice }])}
              />
            </li>
          );
        })}
      </ul>
    </form>
  );
}
