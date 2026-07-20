'use client';

import { Fragment, useMemo, useRef, useState, useTransition } from 'react';

import { moveTaskAction, reorderTaskFormAction, updateTaskAction } from '@/actions/tasks.actions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { TaskCard, type CampoEdicaoRapida } from '@/components/tasks/TaskCard';
import { useToast } from '@/components/ui/Toast';
import { agruparSwimlanes, filtrarTasks, type BoardFiltros, type SwimlanePor } from '@/modules/tasks/board-view';
import { indiceAlvoPorPonteiro, itemSobPonteiro, passosReordenar } from '@/modules/tasks/dnd';
import { ordenarColuna } from '@/modules/tasks/kanban-order';
import type { TaskCardInfo } from '@/modules/tasks/task.repository';
import { podeTransicionar } from '@/modules/tasks/task-transitions';
import {
  PRIORIDADE_TASK_LABEL,
  STATUS_TASK_LABEL,
  TASK_PRIORIDADES,
  TASK_STATUSES,
  type TaskAtor,
  type TaskPrioridade,
  type TaskStatus,
} from '@/modules/tasks/task.types';

// ---------------------------------------------------------------------------
// Drag-and-drop nativo por pointer events (H5/T7).
//
// DECISÃO: nativo (pointerdown/move/up), sem @dnd-kit — o board só oferece 5
// colunas fixas (TASK_STATUSES) e reordenar dentro de uma coluna curta; hit-
// test é 2 comparações de retângulo (itemSobPonteiro/indiceAlvoPorPonteiro,
// puras e testadas em tests/unit/dnd.test.ts). O escopo NÃO inclui: preview
// "ao vivo" da lista durante o arraste (reflow custaria uma medição de DOM a
// cada pointermove) — a carta arrastada só fica com opacidade reduzida no
// lugar; e drag entre RAIAS (swimlanes) — como cada raia particiona as tasks
// por época/responsável, uma coluna "todo" da raia A é um subconjunto
// diferente da coluna "todo" da raia B, e mover engenharia extra de detecção
// cross-raia não paga o custo aqui — quando swimlanePor !== 'nenhum' o DnD
// fica DESLIGADO (só os botões ▲/▼/MoverTaskSelect funcionam, que sempre
// funcionam, com ou sem raias).
//
// Cross-coluna (mudança de status) reusa o MESMO onMove/moveTaskAction já
// otimista do board (T6) — dropar noutra coluna muda o status; drop numa
// coluna que podeTransicionar rejeitaria NÃO chama a action (snap back
// silencioso).
// Reorder-dentro-da-coluna chama reorderTaskFormAction (existente, sem UI até
// esta task) N vezes em sequência — reorderTask troca com o vizinho imediato
// por `ordem`, então N chamadas = N passos.
// ---------------------------------------------------------------------------

type ColInfo = { el: HTMLElement; status: TaskStatus; laneChave: string };

type ArrastoState = {
  taskId: string;
  origemStatus: TaskStatus;
  origemLaneChave: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  width: number;
  x: number;
  y: number;
  alvo: ColInfo | null;
  alvoValido: boolean;
};

const LIMIAR_ARRASTE_PX = 6;

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

  // Drag-and-drop (H5/T7) — ver nota de escopo/decisão no topo do arquivo.
  // `ordemOverride` é o mesmo padrão otimista de `movidas`/`edicoes` acima:
  // sobrepõe a ordem de UMA coluna (a que acabou de ser reordenada) até a
  // action settlar; `arrasto` é o estado "ao vivo" do gesto em andamento
  // (ghost + destaque da coluna-alvo).
  const [ordemOverride, setOrdemOverride] = useState<{ status: TaskStatus; ids: string[] } | null>(null);
  const [arrasto, setArrasto] = useState<ArrastoState | null>(null);
  // Registro de colunas visíveis (chave "raia::status" → elemento + info) —
  // preenchido pelos refs dos wrappers de coluna em renderColunas, consultado
  // nos handlers de pointer pra achar "qual coluna está sob o ponteiro".
  const colInfoRef = useRef(new Map<string, ColInfo>());
  const pendingDragRef = useRef<{
    taskId: string;
    status: TaskStatus;
    laneChave: string;
    pointerId: number;
    startX: number;
    startY: number;
    el: HTMLElement;
  } | null>(null);
  // true a partir do momento em que um arraste de VERDADE começou (passou do
  // limiar) — usado só pra suprimir o "click" fantasma que o navegador dispara
  // depois do pointerup (evita que soltar o card em cima do título dispare a
  // navegação do Link). Resetado no PRÓXIMO pointerdown, não no fim do drag.
  const dragOcorreuRef = useRef(false);

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

  // Reordenar dentro da coluna (H5/T7) — chama reorderTaskFormAction `passos`
  // vezes em sequência (cada chamada troca com o vizinho imediato por
  // `ordem`). `override` é a ordem final já calculada por quem chamou (drop
  // do drag ou clique nos botões ▲/▼) — aplicada de imediato (otimista) e
  // limpa no finally, igual ao padrão de onMove/movidas acima. Sem
  // useActionState porque reorderTaskFormAction não devolve estado (void).
  function executarReorder(
    taskId: string,
    direcao: 'up' | 'down',
    passos: number,
    override: { status: TaskStatus; ids: string[] },
  ) {
    setOrdemOverride(override);
    setPendenteId(taskId);
    startTransition(async () => {
      try {
        for (let i = 0; i < passos; i += 1) {
          const fd = new FormData();
          fd.set('taskId', taskId);
          fd.set('direcao', direcao);
          if (orgId) fd.set('orgId', orgId);
          // Sequencial de propósito: cada chamada precisa da `ordem` já
          // atualizada pela anterior no servidor (reorderTask troca com o
          // vizinho imediato) — não dá pra paralelizar com Promise.all.
          await reorderTaskFormAction(fd);
        }
      } catch {
        toast({ variant: 'error', title: 'Não foi possível reordenar.', description: 'Tente novamente.' });
      } finally {
        setOrdemOverride(null);
        setPendenteId(null);
      }
    });
  }

  // Única porta de transição pro drag também: mesma podeTransicionar que
  // TaskCard usa pra montar destinosValidos do MoverTaskSelect — um drop
  // numa coluna que ela rejeitaria não chama onMove (snap back silencioso).
  function transicaoValida(taskId: string, paraStatus: TaskStatus): boolean {
    const task = efetivas.find((t) => t.id === taskId);
    if (!task) return false;
    return podeTransicionar({ ator, criadoPor: task.criadoPor, de: task.status, para: paraStatus });
  }

  function encontrarColunaAlvo(ponto: { x: number; y: number }): ColInfo | null {
    const candidatos = Array.from(colInfoRef.current.values()).map((info) => ({
      valor: info,
      rect: info.el.getBoundingClientRect(),
    }));
    return itemSobPonteiro(candidatos, ponto);
  }

  function onCardPointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    taskId: string,
    status: TaskStatus,
    laneChave: string,
  ) {
    dragOcorreuRef.current = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return; // só botão esquerdo
    const alvoEl = e.target as HTMLElement;
    // Não intercepta pointerdown originado em controles existentes (select de
    // mover, botões ▲/▼/Concluir, link do título) — eles continuam 100%
    // clicáveis/navegáveis, arraste só começa a partir da área "morta" do card.
    if (alvoEl.closest('a, button, select, input, textarea')) return;
    pendingDragRef.current = {
      taskId,
      status,
      laneChave,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      el: e.currentTarget,
    };
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (arrasto) {
      if (arrasto.pointerId !== e.pointerId) return;
      const alvo = encontrarColunaAlvo({ x: e.clientX, y: e.clientY });
      const alvoValido =
        alvo == null ? false : alvo.status === arrasto.origemStatus ? true : transicaoValida(arrasto.taskId, alvo.status);
      setArrasto((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY, alvo, alvoValido } : prev));
      return;
    }
    const pend = pendingDragRef.current;
    if (!pend || pend.pointerId !== e.pointerId) return;
    const dx = e.clientX - pend.startX;
    const dy = e.clientY - pend.startY;
    if (Math.hypot(dx, dy) < LIMIAR_ARRASTE_PX) return; // ainda dentro do limiar — pode ser só um clique
    const rect = pend.el.getBoundingClientRect();
    try {
      pend.el.setPointerCapture(pend.pointerId);
    } catch {
      // jsdom/alguns browsers não implementam Pointer Capture — segue sem capturar
      // (o pointermove some se o ponteiro sair do elemento; degradação aceitável).
    }
    dragOcorreuRef.current = true;
    setArrasto({
      taskId: pend.taskId,
      origemStatus: pend.status,
      origemLaneChave: pend.laneChave,
      pointerId: pend.pointerId,
      offsetX: pend.startX - rect.left,
      offsetY: pend.startY - rect.top,
      width: rect.width,
      x: e.clientX,
      y: e.clientY,
      alvo: { el: pend.el, status: pend.status, laneChave: pend.laneChave }, // começa sobre a própria coluna
      alvoValido: true,
    });
  }

  function onCardPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const pend = pendingDragRef.current;
    pendingDragRef.current = null;
    if (pend && pend.pointerId === e.pointerId) {
      try {
        pend.el.releasePointerCapture(e.pointerId);
      } catch {
        // idem — best effort.
      }
    }
    if (!arrasto || arrasto.pointerId !== e.pointerId) return;
    const { taskId, origemStatus, origemLaneChave } = arrasto;
    setArrasto(null);

    const alvo = encontrarColunaAlvo({ x: e.clientX, y: e.clientY });
    // Fora de qualquer coluna, OU numa raia diferente da origem (limitação
    // documentada — DnD só é oferecido com swimlanePor === 'nenhum', então
    // isto só dispararia numa borda de re-render no meio do gesto): sem efeito.
    if (!alvo || alvo.laneChave !== origemLaneChave) return;

    if (alvo.status !== origemStatus) {
      // Drop noutra coluna = mudança de status. A MESMA porta de validação do
      // select (podeTransicionar) decide — inválida não chama a action.
      if (!transicaoValida(taskId, alvo.status)) return;
      onMove(taskId, alvo.status);
      return;
    }

    // Mesma coluna → reordenar. O card arrastado continua no DOM (só dimmed,
    // ver nota de escopo no topo do arquivo — sem preview "ao vivo"), então dá
    // pra medir a posição de todo mundo agora mesmo, no momento do drop.
    const cards = Array.from(alvo.el.querySelectorAll<HTMLElement>('[data-task-id]'));
    const medidas = cards
      .map((el) => ({ id: el.dataset.taskId ?? '', rect: el.getBoundingClientRect() }))
      .sort((a, b) => a.rect.top - b.rect.top);
    const deIndex = medidas.findIndex((c) => c.id === taskId);
    if (deIndex === -1) return; // segurança — não deveria acontecer
    const semArrastada = medidas.filter((c) => c.id !== taskId);
    const midpoints = semArrastada.map((c) => c.rect.top + c.rect.height / 2);
    const k = indiceAlvoPorPonteiro(midpoints, e.clientY);
    const passo = passosReordenar(deIndex, k);
    if (!passo) return; // soltou onde já estava
    const idsBase = semArrastada.map((c) => c.id);
    const novaOrdem = [...idsBase.slice(0, k), taskId, ...idsBase.slice(k)];
    executarReorder(taskId, passo.direcao, passo.passos, { status: alvo.status, ids: novaOrdem });
  }

  function onDragClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    if (dragOcorreuRef.current) {
      // Suprime o click sintético pós-drag (ex.: soltar o card em cima do
      // título não deve navegar pra página de detalhe da task).
      e.preventDefault();
      e.stopPropagation();
    }
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

  function renderColunas(itens: TaskCardInfo[], laneChave: string) {
    const grupos = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as TaskCardInfo[]])) as Record<
      TaskStatus,
      TaskCardInfo[]
    >;
    for (const t of itens) grupos[t.status]?.push(t);

    // Ordem exibida na coluna: a override otimista do reorder (se for A
    // coluna que acabou de ser reordenada) ganha de ordenarColuna até a action
    // settlar — mesmo padrão de `movidas`/`edicoes` (efetivas) acima.
    function coluna(status: TaskStatus): TaskCardInfo[] {
      const base = grupos[status];
      if (ordemOverride && ordemOverride.status === status) {
        const porId = new Map(base.map((t) => [t.id, t]));
        const ordenada = ordemOverride.ids
          .map((id) => porId.get(id))
          .filter((t): t is TaskCardInfo => t !== undefined);
        const idsConhecidos = new Set(ordemOverride.ids);
        const extras = base.filter((t) => !idsConhecidos.has(t.id));
        return [...ordenada, ...extras];
      }
      return ordenarColuna(base);
    }

    // DnD só no modo padrão (sem raias agrupadas) — ver nota de escopo no
    // topo do arquivo. Fora dele, só os botões/select (sempre presentes) valem.
    const dndAtivo = swimlanePor === 'nenhum';

    return (
      <div className="flex gap-4 overflow-x-auto pb-2 md:grid md:grid-cols-3 md:overflow-visible md:pb-0 xl:grid-cols-5">
        {TASK_STATUSES.map((status) => {
          const itensColuna = coluna(status);
          const idsColuna = itensColuna.map((t) => t.id);
          const destacada = arrasto != null && arrasto.alvo?.status === status && arrasto.alvo?.laneChave === laneChave;
          const anelClasse = destacada ? (arrasto!.alvoValido ? 'ring-2 ring-brand' : 'ring-2 ring-danger') : '';
          return (
            <div
              key={status}
              data-testid={`kanban-col-${status}`}
              ref={(el) => {
                const chave = `${laneChave}::${status}`;
                if (el) colInfoRef.current.set(chave, { el, status, laneChave });
                else colInfoRef.current.delete(chave);
              }}
              className={`w-64 flex-shrink-0 rounded-2xl transition-shadow md:w-auto ${anelClasse}`}
            >
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
                        onReorder={(taskId, direcao) => {
                          const idx = idsColuna.indexOf(taskId);
                          if (idx === -1) return;
                          const alvoIdx = direcao === 'up' ? idx - 1 : idx + 1;
                          if (alvoIdx < 0 || alvoIdx >= idsColuna.length) return; // já no extremo da coluna
                          const nova = [...idsColuna];
                          [nova[idx], nova[alvoIdx]] = [nova[alvoIdx], nova[idx]];
                          executarReorder(taskId, direcao, 1, { status, ids: nova });
                        }}
                        arrastando={arrasto?.taskId === task.id}
                        onDragPointerDown={
                          dndAtivo ? (e, taskId, taskStatus) => onCardPointerDown(e, taskId, taskStatus, laneChave) : undefined
                        }
                        onDragPointerMove={dndAtivo ? onCardPointerMove : undefined}
                        onDragPointerUp={dndAtivo ? onCardPointerUp : undefined}
                        onDragClickCapture={dndAtivo ? onDragClickCapture : undefined}
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
          <Fragment key={lane.chave}>{renderColunas(lane.tasks, lane.chave)}</Fragment>
        ) : (
          <div key={lane.chave} data-testid="crm-board-swimlane" className="space-y-2">
            <h3 className="font-heading text-sm font-semibold text-white">
              {swimlanePor === 'responsavel' ? (emailPorUsuario.get(lane.chave) ?? lane.label) : lane.label}
            </h3>
            {renderColunas(lane.tasks, lane.chave)}
          </div>
        ),
      )}

      {arrasto ? (
        <div
          aria-hidden="true"
          data-testid="crm-board-drag-ghost"
          className="pointer-events-none fixed z-50 rounded-xl border border-brand bg-bg-elevated px-3 py-2 text-sm font-medium text-white shadow-lg"
          style={{ left: arrasto.x - arrasto.offsetX, top: arrasto.y - arrasto.offsetY, width: arrasto.width }}
        >
          {efetivas.find((t) => t.id === arrasto.taskId)?.titulo ?? ''}
        </div>
      ) : null}
    </div>
  );
}
