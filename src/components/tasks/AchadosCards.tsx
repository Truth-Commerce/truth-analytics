'use client';

import { useEffect, useRef } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { createTasksFromReportAction, type TaskActionState } from '@/actions/tasks.actions';
import { formatBRL } from '@/lib/format';
import type { Achado } from '@/modules/pipeline/contracts';
import { ordenarAchados } from '@/modules/reports/report-view-model';
import { tituloFromItem } from '@/modules/tasks/report-to-task';
import { PRIORIDADE_TASK_LABEL, TIPO_TASK_LABEL } from '@/modules/tasks/task.types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

type State = TaskActionState & { criadas?: number };
const initial: State = {};

const PRIORIDADE_VARIANT = { alta: 'danger', media: 'warn', baixa: 'neutral' } as const;

function VirarTarefaButton({
  indice,
  jaExiste,
  onClick,
}: {
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
        data-testid={`virar-task-achados-${indice}`}
      >
        Tarefa criada
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
      data-testid={`virar-task-achados-${indice}`}
    >
      Virar tarefa
    </Button>
  );
}

/** Achados estruturados da IA como cards acionáveis, ordenados por impacto R$ desc. */
export function AchadosCards({
  reportId,
  achados,
  titulosExistentes,
}: {
  reportId: string;
  achados: Achado[];
  titulosExistentes: string[];
}) {
  const [state, action] = useFormState(createTasksFromReportAction, initial);
  const { toast } = useToast();
  const itensInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok && typeof state.criadas === 'number') {
      toast({ variant: 'success', title: `${state.criadas} tarefa(s) criada(s) no Plano de Ação` });
    }
  }, [state, toast]);

  if (achados.length === 0) return null;

  const existentes = new Set(titulosExistentes);
  const ordenados = ordenarAchados(achados);

  function definirItens(alvo: Array<{ fonte: 'achados'; indice: number }>) {
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

      <div className="space-y-4" data-testid="achados-cards">
        {ordenados.map(({ achado, indice }) => {
          const jaExiste = existentes.has(tituloFromItem(achado.titulo));
          return (
            <Card key={indice} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={PRIORIDADE_VARIANT[achado.prioridade]}>
                  Prioridade {PRIORIDADE_TASK_LABEL[achado.prioridade]}
                </Badge>
                <Badge variant="neutral">{TIPO_TASK_LABEL[achado.tipo]}</Badge>
                {achado.impactoEstimadoMensalBRL !== null ? (
                  <span className="font-mono text-sm font-bold text-brand">
                    {formatBRL(achado.impactoEstimadoMensalBRL)}/mês
                  </span>
                ) : null}
              </div>
              <h3 className="font-heading text-base font-semibold text-white">{achado.titulo}</h3>
              <p className="text-sm leading-relaxed text-white/80">{achado.descricao}</p>
              {achado.comoFazer.length > 0 ? (
                <ol className="list-decimal space-y-1 pl-5 text-sm text-white/70">
                  {achado.comoFazer.map((passo, i) => (
                    <li key={i}>{passo}</li>
                  ))}
                </ol>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                {achado.skus.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {achado.skus.map((sku) => (
                      <span
                        key={sku}
                        className="rounded border border-line bg-bg-elevated px-1.5 py-0.5 font-mono text-[11px] text-muted"
                      >
                        {sku}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span />
                )}
                <VirarTarefaButton
                  indice={indice}
                  jaExiste={jaExiste}
                  onClick={() => definirItens([{ fonte: 'achados', indice }])}
                />
              </div>
            </Card>
          );
        })}
      </div>
    </form>
  );
}
