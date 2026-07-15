'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

import { createTasksFromReportAction, type TaskActionState } from '@/actions/tasks.actions';
import { formatBRL } from '@/lib/format';
import type { Achado } from '@/modules/pipeline/contracts';
import { ordenarAchados } from '@/modules/reports/report-view-model';
import { tituloFromItem } from '@/modules/tasks/report-to-task';
import { prazoDefault } from '@/modules/tasks/sla';
import { PRIORIDADE_TASK_LABEL, TIPO_TASK_LABEL, type TaskTipo } from '@/modules/tasks/task.types';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';

type State = TaskActionState & { criadas?: number };
const initial: State = {};

type ItemConversao = { fonte: 'achados'; indice: number; prazo?: string; usarChecklistPlaybook?: boolean };

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

  // Abre o mini-form de conversão — o submit real sai do botão do mini-form.
  return (
    <Button
      type="button"
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

function SubmitTasksButton({
  testid,
  variant = 'primary',
  onClick,
  children,
}: {
  testid: string;
  variant?: 'primary' | 'secondary';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size="sm" disabled={pending} onClick={onClick} data-testid={testid}>
      {children}
    </Button>
  );
}

/** Achados estruturados da IA como cards acionáveis, ordenados por impacto R$ desc. */
export function AchadosCards({
  reportId,
  achados,
  titulosExistentes,
  playbooksPorTipo,
}: {
  reportId: string;
  achados: Achado[];
  titulosExistentes: string[];
  playbooksPorTipo?: Partial<Record<TaskTipo, { id: string; titulo: string }>>;
}) {
  const [state, action] = useFormState(createTasksFromReportAction, initial);
  const { toast } = useToast();
  const itensInputRef = useRef<HTMLInputElement>(null);
  const [aberto, setAberto] = useState<number | null>(null);
  const [prazos, setPrazos] = useState<Record<number, string>>({});
  const [usarPlaybook, setUsarPlaybook] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (state.ok && typeof state.criadas === 'number') {
      toast({ variant: 'success', title: `${state.criadas} tarefa(s) criada(s) no Plano de Ação` });
      setAberto(null);
    }
  }, [state, toast]);

  if (achados.length === 0) return null;

  const existentes = new Set(titulosExistentes);
  const ordenados = ordenarAchados(achados);
  const restantes = ordenados.filter(({ achado }) => !existentes.has(tituloFromItem(achado.titulo)));

  function definirItens(alvo: ItemConversao[]) {
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

      {restantes.length > 0 ? (
        <div className="mb-3 flex justify-end">
          <SubmitTasksButton
            testid="criar-todas-achados"
            variant="secondary"
            onClick={() => definirItens(restantes.map(({ indice }) => ({ fonte: 'achados' as const, indice })))}
          >
            Criar todas as tarefas
          </SubmitTasksButton>
        </div>
      ) : null}

      <div className="space-y-4" data-testid="achados-cards">
        {ordenados.map(({ achado, indice }) => {
          const jaExiste = existentes.has(tituloFromItem(achado.titulo));
          const playbook = playbooksPorTipo?.[achado.tipo];
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
                  onClick={() => setAberto((cur) => (cur === indice ? null : indice))}
                />
              </div>
              {aberto === indice && !jaExiste ? (
                <div
                  className="mt-2 space-y-2 rounded-xl border border-line bg-bg-elevated p-3"
                  data-testid={`achado-form-${indice}`}
                >
                  <p className="text-xs text-dim">
                    Tipo: {TIPO_TASK_LABEL[achado.tipo]} · Prioridade: {PRIORIDADE_TASK_LABEL[achado.prioridade]}
                  </p>
                  <label className="block text-xs text-muted" htmlFor={`achado-prazo-${indice}`}>
                    Prazo
                    <input
                      id={`achado-prazo-${indice}`}
                      type="date"
                      defaultValue={prazoDefault(achado.prioridade)}
                      onChange={(e) => setPrazos((prev) => ({ ...prev, [indice]: e.target.value }))}
                      className="mt-1 block w-full rounded-lg border border-line bg-bg-surface px-3 py-1.5 text-sm text-white outline-none focus:border-brand"
                    />
                  </label>
                  {playbook ? (
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={usarPlaybook[indice] ?? true}
                        onChange={(e) => setUsarPlaybook((prev) => ({ ...prev, [indice]: e.target.checked }))}
                      />
                      Usar checklist do playbook &quot;{playbook.titulo}&quot;
                    </label>
                  ) : null}
                  <SubmitTasksButton
                    testid={`achado-criar-${indice}`}
                    onClick={() =>
                      definirItens([
                        {
                          fonte: 'achados',
                          indice,
                          prazo: prazos[indice] ?? prazoDefault(achado.prioridade),
                          usarChecklistPlaybook: playbook ? (usarPlaybook[indice] ?? true) : undefined,
                        },
                      ])
                    }
                  >
                    Criar tarefa
                  </SubmitTasksButton>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
    </form>
  );
}
