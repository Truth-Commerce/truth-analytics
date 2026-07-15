'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { createTasksFromReportAction, type TaskActionState } from '@/actions/tasks.actions';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { formatBRL } from '@/lib/format';
import type { AcaoPrincipal } from '@/modules/reports/dashboard-model';

type State = TaskActionState & { criadas?: number };
const initial: State = {};

function VirarTarefaButton({ jaExiste }: { jaExiste: boolean }) {
  const { pending } = useFormStatus();
  if (jaExiste) {
    return (
      <Button type="button" variant="secondary" size="sm" disabled data-testid="acao-principal-virar-task">
        Tarefa criada
      </Button>
    );
  }
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending} data-testid="acao-principal-virar-task">
      {pending ? 'Criando…' : 'Virar tarefa'}
    </Button>
  );
}

/** "Ação nº 1" da IA no topo do dashboard, com conversão em task no fluxo F2/G1. */
export function AcaoPrincipalCard({
  reportId,
  acao,
  jaExiste,
}: {
  reportId: string;
  acao: AcaoPrincipal;
  jaExiste: boolean;
}) {
  const [state, action] = useFormState(createTasksFromReportAction, initial);
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && typeof state.criadas === 'number') {
      toast({ variant: 'success', title: 'Tarefa criada no Plano de Ação' });
    }
  }, [state, toast]);

  return (
    <Card data-testid="acao-principal" className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-[11px] uppercase tracking-widest text-brand">Ação nº 1</p>
        {acao.impactoBRL !== null ? (
          <Badge variant="success">até {formatBRL(acao.impactoBRL)}/mês</Badge>
        ) : null}
      </div>
      <p className="text-sm font-medium leading-relaxed text-white">{acao.titulo}</p>
      {acao.descricao ? <p className="text-sm text-muted">{acao.descricao}</p> : null}
      {state.error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {state.error}
        </p>
      ) : null}
      <form action={action} className="mt-auto">
        <input type="hidden" name="reportId" value={reportId} />
        <input
          type="hidden"
          name="itens"
          value={JSON.stringify([{ fonte: acao.fonte, indice: acao.indice }])}
        />
        <VirarTarefaButton jaExiste={jaExiste} />
      </form>
    </Card>
  );
}
