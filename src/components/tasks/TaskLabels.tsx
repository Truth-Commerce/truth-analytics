'use client';

import { useRef, useState } from 'react';

import { setTaskLabelsFormAction } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';

/**
 * Labels (H5/T5): chips editáveis + sugestões (frequência das labels já
 * usadas na org, via `sugerirLabels`). Um único form oculto recebe o array
 * final (JSON) e é resubmetido a cada mudança (add/remover/sugestão) —
 * `setTaskLabels` normaliza (trim/dedup/cap/max) no servidor, então o cliente
 * não precisa validar nada além de não mandar vazio.
 */
export function TaskLabels({
  taskId,
  orgId,
  labels,
  sugestoes,
}: {
  taskId: string;
  orgId?: string;
  labels: string[];
  sugestoes: string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  const [novaLabel, setNovaLabel] = useState('');

  function enviar(proximasLabels: string[]): void {
    if (hiddenRef.current) hiddenRef.current.value = JSON.stringify(proximasLabels);
    formRef.current?.requestSubmit();
  }

  const sugestoesDisponiveis = sugestoes.filter(
    (s) => !labels.some((l) => l.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div data-testid="crm-labels" className="space-y-3">
      <form ref={formRef} action={setTaskLabelsFormAction} className="hidden" aria-hidden>
        <input type="hidden" name="taskId" value={taskId} />
        {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
        <input ref={hiddenRef} type="hidden" name="labels" />
      </form>

      <div className="flex flex-wrap gap-1.5">
        {labels.length === 0 ? (
          <span className="text-xs text-dim">Sem labels.</span>
        ) : (
          labels.map((label) => (
            <span
              key={label}
              data-testid="crm-label-chip"
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-bg-elevated px-2.5 py-1 text-xs text-white/80"
            >
              {label}
              <button
                type="button"
                aria-label={`Remover label ${label}`}
                onClick={() => enviar(labels.filter((l) => l !== label))}
                className="text-dim outline-none hover:text-danger-fg focus-visible:ring-2 focus-visible:ring-brand/50"
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          data-testid="crm-label-input"
          value={novaLabel}
          onChange={(e) => setNovaLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const v = novaLabel.trim();
            if (!v) return;
            enviar([...labels, v]);
            setNovaLabel('');
          }}
          placeholder="Nova label..."
          maxLength={20}
          aria-label="Nova label"
          className="w-36 rounded-lg border border-line bg-bg-elevated px-2.5 py-1.5 text-xs text-white outline-none transition-colors placeholder:text-dim focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/50"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="crm-label-add"
          onClick={() => {
            const v = novaLabel.trim();
            if (!v) return;
            enviar([...labels, v]);
            setNovaLabel('');
          }}
        >
          Adicionar
        </Button>

        {sugestoesDisponiveis.map((s) => (
          <button
            key={s}
            type="button"
            data-testid="crm-label-suggestion"
            onClick={() => enviar([...labels, s])}
            className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-dim outline-none transition-colors hover:border-brand hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
