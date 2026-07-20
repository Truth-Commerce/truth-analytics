'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';

import { moveTaskAction, updateTaskAction } from '@/actions/tasks.actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { TaskCard, type CampoEdicaoRapida } from '@/components/tasks/TaskCard';
import { useToast } from '@/components/ui/Toast';
import { agruparSwimlanes, filtrarTasks, type BoardFiltros, type SwimlanePor } from '@/modules/tasks/board-view';
import { ordenarColuna } from '@/modules/tasks/kanban-order';
import type { TaskCardInfo } from '@/modules/tasks/task.repository';
import {
  PRIORIDADE_TASK_LABEL,
  STATUS_TASK_LABEL,
  TASK_PRIORIDADES,
  TASK_STATUSES,
  type TaskAtor,
  type TaskPrioridade,
  type TaskStatus,
} from '@/modules/tasks/task.types';

const SWIMLANE_LABEL: Record<SwimlanePor, string> = {
  nenhum: 'Sem raias',
  epico: 'Por épico',
  responsavel: 'Por responsável',
};

export function KanbanBoard({
  tasks,
  ator,
  taskHrefBase,
  orgId,
  emptyCta,
  usuarios = [],
}: {
  tasks: TaskCardInfo[];
  ator: TaskAtor;
  taskHrefBase: string;
  orgId?: string;
  emptyCta?: React.ReactNode; // Task 12: CTA pro último relatório quando o board está vazio
  /** Usuários da org (H5/T6) — opções do filtro/edição rápida de "Responsável". */
  usuarios?: Array<{ id: string; email: string }>;
}) {
  // Otimismo sem useOptimistic (React 18.3): mapa taskId→status aplicado por
  // cima dos dados do servidor; limpo quando a action settla (o
  // revalidatePath da action já terá atualizado a árvore RSC na transition).
  const [movidas, setMovidas] = useState<Record<string, TaskStatus>>({});
  // Idem para a edição rápida (H5/T6) — prioridade/prazo/responsável otimistas
  // até a action settlar.
  const [edicoes, setEdicoes] = useState<
    Record<string, Partial<Pick<TaskCardInfo, 'prioridade' | 'prazo' | 'assigneeUserId'>>>
  >({});
  const [, startTransition] = useTransition();
  const [pendenteId, setPendenteId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const { toast } = useToast();

  // Board turbinado (H5/T6): filtros combináveis + raias — tudo client-side
  // sobre as tasks já carregadas (nenhum fetch novo; filtrarTasks/
  // agruparSwimlanes são puros).
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroPrioridade, setFiltroPrioridade] = useState<TaskPrioridade | ''>('');
  const [filtroLabel, setFiltroLabel] = useState('');
  const [filtroEpico, setFiltroEpico] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState('');
  const [swimlanePor, setSwimlanePor] = useState<SwimlanePor>('nenhum');

  const efetivas = useMemo(
    () =>
      tasks.map((t) => {
        let out = t;
        if (movidas[t.id]) out = { ...out, status: movidas[t.id]! };
        if (edicoes[t.id]) out = { ...out, ...edicoes[t.id] };
        return out;
      }),
    [tasks, movidas, edicoes],
  );

  // Opções dos selects de filtro derivam do total da org (não do subconjunto
  // já filtrado) — a lista de opções não deve encolher conforme o usuário filtra.
  const labelsDisponiveis = useMemo(
    () => Array.from(new Set(tasks.flatMap((t) => t.labels))).sort((a, b) => a.localeCompare(b)),
    [tasks],
  );
  const epicosDisponiveis = useMemo(
    () => tasks.filter((t) => t.nivel === 'epico').sort((a, b) => a.titulo.localeCompare(b.titulo)),
    [tasks],
  );
  const emailPorUsuario = useMemo(() => new Map(usuarios.map((u) => [u.id, u.email])), [usuarios]);

  const filtros: BoardFiltros = useMemo(() => {
    const f: BoardFiltros = {};
    if (filtroTexto) f.texto = filtroTexto;
    if (filtroPrioridade) f.prioridade = filtroPrioridade;
    if (filtroLabel) f.label = filtroLabel;
    if (filtroEpico) f.epicoId = filtroEpico;
    if (filtroResponsavel) f.responsavel = filtroResponsavel;
    return f;
  }, [filtroTexto, filtroPrioridade, filtroLabel, filtroEpico, filtroResponsavel]);

  const temFiltroAtivo =
    filtroTexto !== '' ||
    filtroPrioridade !== '' ||
    filtroLabel !== '' ||
    filtroEpico !== '' ||
    filtroResponsavel !== '' ||
    swimlanePor !== 'nenhum';

  function limparFiltros() {
    setFiltroTexto('');
    setFiltroPrioridade('');
    setFiltroLabel('');
    setFiltroEpico('');
    setFiltroResponsavel('');
    setSwimlanePor('nenhum');
  }

  function onMove(taskId: string, para: TaskStatus) {
    setMovidas((prev) => ({ ...prev, [taskId]: para }));
    setPendenteId(taskId);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('taskId', taskId);
      fd.set('para', para);
      if (orgId) fd.set('orgId', orgId);
      try {
        const res = await moveTaskAction(fd);
        if (res.error) {
          toast({ variant: 'error', title: 'Não foi possível mover.', description: res.error });
        }
      } finally {
        // Limpeza do otimismo SEMPRE roda — inclusive se a action rejeitar (erro
        // de infra re-lançado). Sem o finally, o card ficava preso na coluna
        // otimista com o select desabilitado.
        setMovidas((prev) => {
          const { [taskId]: _, ...resto } = prev;
          return resto;
        });
        setPendenteId(null);
      }
    });
  }

  // Edição rápida (H5/T6) — reusa updateTaskAction (mesmo guard de
  // impersonação + "cliente não edita" do form completo de edição). Chamada
  // direta (sem useActionState), mesmo padrão de onMove/moveTaskAction acima.
  function onQuickEdit(taskId: string, campo: CampoEdicaoRapida, valor: string) {
    const valorOtimista = campo === 'prioridade' ? (valor as TaskPrioridade) : valor === '' ? null : valor;
    setEdicoes((prev) => ({ ...prev, [taskId]: { ...prev[taskId], [campo]: valorOtimista } }));
    setEditandoId(taskId);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('taskId', taskId);
      if (orgId) fd.set('orgId', orgId);
      fd.set(campo, valor);
      try {
        const res = await updateTaskAction({}, fd);
        if (res.error) {
          toast({ variant: 'error', title: 'Não foi possível salvar.', description: res.error });
        }
      } finally {
        setEdicoes((prev) => {
          const { [taskId]: _, ...resto } = prev;
          return resto;
        });
        setEditandoId(null);
      }
    });
  }

  if (tasks.length === 0 && emptyCta) {
    return (
      <EmptyState
        title="Nenhuma tarefa no seu Plano de Ação ainda."
        description="Converta os achados do seu último relatório em tarefas com 1 clique."
        action={emptyCta}
        data-testid="kanban-vazio"
      />
    );
  }

  function renderColunas(itens: TaskCardInfo[]) {
    const grupos = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as TaskCardInfo[]])) as Record<
      TaskStatus,
      TaskCardInfo[]
    >;
    for (const t of itens) grupos[t.status]?.push(t);

    return (
      <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 xl:grid-cols-5">
        {TASK_STATUSES.map((status) => {
          const itensColuna = ordenarColuna(grupos[status]);
          return (
            <div key={status} data-testid={`kanban-col-${status}`} className="w-64 flex-shrink-0 md:w-auto">
              <Card className="flex h-full flex-col gap-3">
                <CardHeader className="mb-0">
                  <CardTitle as="h3" className="text-sm">
                    {STATUS_TASK_LABEL[status]}
                  </CardTitle>
                  <span className="text-xs text-dim">{itensColuna.length}</span>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  {itensColuna.length === 0 ? (
                    <EmptyState title="Nenhuma task" className="px-3 py-6" />
                  ) : (
                    itensColuna.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        ator={ator}
                        taskHrefBase={taskHrefBase}
                        orgId={orgId}
                        onMove={onMove}
                        pendente={pendenteId === task.id}
                        usuarios={usuarios}
                        onQuickEdit={ator === 'cliente' ? undefined : onQuickEdit}
                        editandoId={editandoId}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    );
  }

  const filtradas = filtrarTasks(efetivas, filtros);
  const lanes = agruparSwimlanes(filtradas, swimlanePor);

  return (
    <div className="space-y-4">
      <div data-testid="crm-board-filtros" className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          data-testid="crm-board-filtro-texto"
          placeholder="Buscar por título…"
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          className="rounded-lg border border-line bg-bg-elevated px-3 py-1.5 text-sm text-white outline-none transition-colors placeholder:text-dim focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/50"
        />
        <select
          aria-label="Filtrar por prioridade"
          data-testid="crm-board-filtro-prioridade"
          value={filtroPrioridade}
          onChange={(e) => setFiltroPrioridade(e.target.value as TaskPrioridade | '')}
          className="rounded-lg border border-line bg-bg-elevated px-2 py-1.5 text-sm text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          <option value="">Prioridade (todas)</option>
          {TASK_PRIORIDADES.map((p) => (
            <option key={p} value={p}>
              {PRIORIDADE_TASK_LABEL[p]}
            </option>
          ))}
        </select>
        {labelsDisponiveis.length > 0 ? (
          <select
            aria-label="Filtrar por label"
            data-testid="crm-board-filtro-label"
            value={filtroLabel}
            onChange={(e) => setFiltroLabel(e.target.value)}
            className="rounded-lg border border-line bg-bg-elevated px-2 py-1.5 text-sm text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <option value="">Label (todas)</option>
            {labelsDisponiveis.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        ) : null}
        {epicosDisponiveis.length > 0 ? (
          <select
            aria-label="Filtrar por épico"
            data-testid="crm-board-filtro-epico"
            value={filtroEpico}
            onChange={(e) => setFiltroEpico(e.target.value)}
            className="rounded-lg border border-line bg-bg-elevated px-2 py-1.5 text-sm text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <option value="">Épico (todos)</option>
            {epicosDisponiveis.map((e) => (
              <option key={e.id} value={e.id}>
                {e.titulo}
              </option>
            ))}
          </select>
        ) : null}
        {usuarios.length > 0 ? (
          <select
            aria-label="Filtrar por responsável"
            data-testid="crm-board-filtro-responsavel"
            value={filtroResponsavel}
            onChange={(e) => setFiltroResponsavel(e.target.value)}
            className="rounded-lg border border-line bg-bg-elevated px-2 py-1.5 text-sm text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <option value="">Responsável (todos)</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        ) : null}
        <select
          aria-label="Agrupar em raias"
          data-testid="crm-board-swimlane-select"
          value={swimlanePor}
          onChange={(e) => setSwimlanePor(e.target.value as SwimlanePor)}
          className="rounded-lg border border-line bg-bg-elevated px-2 py-1.5 text-sm text-muted outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-brand/50"
        >
          {(Object.keys(SWIMLANE_LABEL) as SwimlanePor[]).map((por) => (
            <option key={por} value={por}>
              {SWIMLANE_LABEL[por]}
            </option>
          ))}
        </select>
        {temFiltroAtivo ? (
          <button
            type="button"
            data-testid="crm-board-limpar-filtros"
            onClick={limparFiltros}
            className="text-xs text-muted underline-offset-2 outline-none hover:text-white hover:underline focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            Limpar filtros
          </button>
        ) : null}
      </div>

      {lanes.map((lane) =>
        swimlanePor === 'nenhum' ? (
          <Fragment key={lane.chave}>{renderColunas(lane.tasks)}</Fragment>
        ) : (
          <div key={lane.chave} data-testid="crm-board-swimlane" className="space-y-2">
            <h3 className="font-heading text-sm font-semibold text-white">
              {swimlanePor === 'responsavel' ? (emailPorUsuario.get(lane.chave) ?? lane.label) : lane.label}
            </h3>
            {renderColunas(lane.tasks)}
          </div>
        ),
      )}
    </div>
  );
}
