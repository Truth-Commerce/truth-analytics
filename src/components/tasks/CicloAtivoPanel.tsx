'use client';

import { useState, useTransition } from 'react';

import { moverTaskParaCicloAction } from '@/actions/tasks.actions';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LineChart } from '@/components/ui/charts/LineChart';
import { useToast } from '@/components/ui/Toast';
import type { PontoBurndown } from '@/modules/tasks/burndown';
import type { Cycle } from '@/modules/tasks/cycle.repository';
import { STATUS_TASK_LABEL, type TaskSummary } from '@/modules/tasks/task.types';

/**
 * Painel do ciclo ATIVO (H5/T9): burndown (LineChart, alimentado por
 * `burndownDoCiclo` — [] quando o ciclo não tem início/fim) + duas listas
 * lado a lado (tasks do ciclo / pool de tasks sem ciclo) com botões
 * Adicionar/Remover que chamam `moverTaskParaCicloAction`. Otimismo local
 * (`movidasParaDentro`/`movidasParaFora`) some assim que a action settla e o
 * `revalidatePath` da action já trouxe os dados reais — mesmo padrão de
 * `movidas` no KanbanBoard.
 */
export function CicloAtivoPanel({
  ciclo,
  tasks,
  tasksDisponiveis,
  burndown,
}: {
  ciclo: Cycle;
  tasks: TaskSummary[];
  tasksDisponiveis: TaskSummary[];
  burndown: PontoBurndown[];
}) {
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [pendenteId, setPendenteId] = useState<string | null>(null);
  const [movidasParaDentro, setMovidasParaDentro] = useState<Set<string>>(new Set());
  const [movidasParaFora, setMovidasParaFora] = useState<Set<string>>(new Set());

  function mover(taskId: string, cycleId: string | null) {
    setPendenteId(taskId);
    if (cycleId) setMovidasParaDentro((s) => new Set(s).add(taskId));
    else setMovidasParaFora((s) => new Set(s).add(taskId));

    startTransition(async () => {
      const fd = new FormData();
      fd.set('taskId', taskId);
      if (cycleId) fd.set('cycleId', cycleId);
      const res = await moverTaskParaCicloAction(fd);
      if (res.error) {
        toast({ variant: 'error', title: 'Não foi possível mover.', description: res.error });
        // desfaz o otimismo — o revalidate não vem quando a action erra.
        if (cycleId) {
          setMovidasParaDentro((s) => {
            const n = new Set(s);
            n.delete(taskId);
            return n;
          });
        } else {
          setMovidasParaFora((s) => {
            const n = new Set(s);
            n.delete(taskId);
            return n;
          });
        }
      }
      setPendenteId(null);
    });
  }

  const tasksDoCicloEfetivas = tasks.filter((t) => !movidasParaFora.has(t.id));
  const poolEfetivo = tasksDisponiveis.filter((t) => !movidasParaDentro.has(t.id));

  // eixo x compacto (mm-dd) — o dia completo 'yyyy-mm-dd' já está implícito
  // no período do ciclo mostrado no título/cabeçalho da página.
  const pontos = burndown.map((p) => ({ x: p.dia.slice(5), y: p.abertas }));

  return (
    <div data-testid="crm-ciclos-ativo" className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Ciclo ativo: {ciclo.nome}</CardTitle>
        </CardHeader>
        <CardContent>
          {pontos.length > 0 ? (
            <div data-testid="crm-ciclos-burndown">
              <LineChart
                data={pontos}
                formatY={(v) => String(Math.round(v))}
                srSummary={`Burndown do ciclo ${ciclo.nome}: ${pontos.length} dias, de ${burndown[0]?.abertas ?? 0} até ${burndown[burndown.length - 1]?.abertas ?? 0} tasks abertas.`}
              />
            </div>
          ) : (
            <p data-testid="crm-ciclos-sem-burndown" className="text-sm text-muted">
              Defina início e fim do ciclo para acompanhar o burndown.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="mb-0">
            <CardTitle as="h3" className="text-sm">
              Tasks do ciclo
            </CardTitle>
            <span className="text-xs text-dim">{tasksDoCicloEfetivas.length}</span>
          </CardHeader>
          <CardContent data-testid="crm-ciclos-tasks-do-ciclo" className="mt-3 space-y-2">
            {tasksDoCicloEfetivas.length === 0 ? (
              <EmptyState title="Nenhuma task neste ciclo" className="px-3 py-6" />
            ) : (
              tasksDoCicloEfetivas.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                >
                  <span className="truncate text-white">{t.titulo}</span>
                  <span className="shrink-0 text-xs text-dim">{STATUS_TASK_LABEL[t.status]}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    data-testid="crm-ciclos-task-remover"
                    disabled={pendenteId === t.id}
                    onClick={() => mover(t.id, null)}
                  >
                    Remover
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="mb-0">
            <CardTitle as="h3" className="text-sm">
              Tasks disponíveis (sem ciclo)
            </CardTitle>
            <span className="text-xs text-dim">{poolEfetivo.length}</span>
          </CardHeader>
          <CardContent data-testid="crm-ciclos-tasks-disponiveis" className="mt-3 space-y-2">
            {poolEfetivo.length === 0 ? (
              <EmptyState title="Nenhuma task disponível" className="px-3 py-6" />
            ) : (
              poolEfetivo.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                >
                  <span className="truncate text-white">{t.titulo}</span>
                  <span className="shrink-0 text-xs text-dim">{STATUS_TASK_LABEL[t.status]}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    data-testid="crm-ciclos-task-adicionar"
                    disabled={pendenteId === t.id}
                    onClick={() => mover(t.id, ciclo.id)}
                  >
                    Adicionar
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
