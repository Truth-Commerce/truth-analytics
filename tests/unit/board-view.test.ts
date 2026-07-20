import { describe, expect, it } from 'vitest';

import {
  agruparSwimlanes,
  filtrarTasks,
  slaBadge,
  SEM_EPICO,
  SEM_RESPONSAVEL,
  type BoardFiltros,
} from '@/modules/tasks/board-view';
import type { TaskPrioridade, TaskStatus } from '@/modules/tasks/task.types';

type T = {
  id: string;
  titulo: string;
  prioridade: TaskPrioridade;
  status: TaskStatus;
  prazo: string | null;
  labels: string[];
  parentId: string | null;
  assigneeUserId: string | null;
};

function task(overrides: Partial<T> & { id: string }): T {
  return {
    titulo: 'task',
    prioridade: 'media',
    status: 'backlog',
    prazo: null,
    labels: [],
    parentId: null,
    assigneeUserId: null,
    ...overrides,
  };
}

describe('filtrarTasks', () => {
  const tasks: T[] = [
    task({ id: '1', titulo: 'Corrigir preço do SKU 123', prioridade: 'alta', labels: ['bug'], parentId: 'epico-a', assigneeUserId: 'user-1' }),
    task({ id: '2', titulo: 'Atualizar anúncio do Mercado Livre', prioridade: 'media', labels: ['catalogo'], parentId: 'epico-a', assigneeUserId: 'user-2' }),
    task({ id: '3', titulo: 'Revisar logística', prioridade: 'baixa', labels: [], parentId: 'epico-b', assigneeUserId: null }),
    task({ id: 'epico-a', titulo: 'Épico A', prioridade: 'media', labels: [], parentId: null, assigneeUserId: null }),
  ];

  it('sem filtros (objeto vazio) devolve todas as tasks, sem restrição', () => {
    expect(filtrarTasks(tasks, {})).toEqual(tasks);
  });

  it('texto: substring case-insensitive no título', () => {
    const r = filtrarTasks(tasks, { texto: 'MERCADO livre' });
    expect(r.map((t) => t.id)).toEqual(['2']);
  });

  it('texto: substring vazia não restringe (equivalente a undefined)', () => {
    expect(filtrarTasks(tasks, { texto: '' }).map((t) => t.id)).toEqual(['1', '2', '3', 'epico-a']);
  });

  it('label: task.labels inclui o valor', () => {
    const r = filtrarTasks(tasks, { label: 'bug' });
    expect(r.map((t) => t.id)).toEqual(['1']);
  });

  it('epicoId: parent_id === epicoId OU id === epicoId (inclui o próprio épico)', () => {
    const r = filtrarTasks(tasks, { epicoId: 'epico-a' });
    expect(r.map((t) => t.id).sort()).toEqual(['1', '2', 'epico-a'].sort());
  });

  it('responsavel: assignee match exato', () => {
    const r = filtrarTasks(tasks, { responsavel: 'user-2' });
    expect(r.map((t) => t.id)).toEqual(['2']);
  });

  it('responsavel: task sem assignee não bate com um id específico', () => {
    const r = filtrarTasks(tasks, { responsavel: 'user-1' });
    expect(r.map((t) => t.id)).toEqual(['1']);
  });

  it('prioridade: match exato', () => {
    const r = filtrarTasks(tasks, { prioridade: 'baixa' });
    expect(r.map((t) => t.id)).toEqual(['3']);
  });

  it('combinação AND: prioridade + epicoId — só bate quem satisfaz AMBOS', () => {
    const r = filtrarTasks(tasks, { epicoId: 'epico-a', prioridade: 'alta' });
    expect(r.map((t) => t.id)).toEqual(['1']);
  });

  it('combinação AND: label + responsavel — nenhuma task satisfaz ambos → vazio', () => {
    const r = filtrarTasks(tasks, { label: 'bug', responsavel: 'user-2' });
    expect(r).toEqual([]);
  });

  it('combinação AND: texto + prioridade', () => {
    const r = filtrarTasks(tasks, { texto: 'anúncio', prioridade: 'media' });
    expect(r.map((t) => t.id)).toEqual(['2']);
  });

  it('filtro que não bate ninguém devolve array vazio (não undefined/null)', () => {
    expect(filtrarTasks(tasks, { label: 'inexistente' })).toEqual([]);
  });
});

describe('agruparSwimlanes', () => {
  const tasks: T[] = [
    task({ id: '1', titulo: 'Task 1', parentId: 'epico-a', assigneeUserId: 'user-1' }),
    task({ id: '2', titulo: 'Task 2', parentId: 'epico-b', assigneeUserId: null }),
    task({ id: '3', titulo: 'Task 3', parentId: 'epico-a', assigneeUserId: 'user-2' }),
    task({ id: '4', titulo: 'Task sem épico', parentId: null, assigneeUserId: 'user-1' }),
    task({ id: 'epico-a', titulo: 'Épico A', parentId: null, assigneeUserId: null }),
    task({ id: 'epico-b', titulo: 'Épico B', parentId: null, assigneeUserId: null }),
  ];

  it("'nenhum': uma única raia com todas as tasks, ordem preservada", () => {
    const lanes = agruparSwimlanes(tasks, 'nenhum');
    expect(lanes).toHaveLength(1);
    expect(lanes[0]!.tasks.map((t) => t.id)).toEqual(tasks.map((t) => t.id));
  });

  it("'nenhum' não muta o array original", () => {
    const copia = [...tasks];
    agruparSwimlanes(tasks, 'nenhum');
    expect(tasks).toEqual(copia);
  });

  it("'epico': agrupa por parentId, rótulo = título do épico (achado no próprio array)", () => {
    const lanes = agruparSwimlanes(tasks, 'epico');
    const laneA = lanes.find((l) => l.chave === 'epico-a');
    expect(laneA?.label).toBe('Épico A');
    expect(laneA?.tasks.map((t) => t.id)).toEqual(['1', '3']);

    const laneB = lanes.find((l) => l.chave === 'epico-b');
    expect(laneB?.tasks.map((t) => t.id)).toEqual(['2']);
  });

  it("'epico': tasks sem parentId (inclusive épicos-raiz) caem no balde SEM_EPICO, sempre por último", () => {
    const lanes = agruparSwimlanes(tasks, 'epico');
    const ultima = lanes[lanes.length - 1]!;
    expect(ultima.chave).toBe(SEM_EPICO);
    expect(ultima.label).toBe('Sem épico');
    // task '4' + os dois épicos-raiz (epico-a, epico-b) não têm parentId.
    expect(ultima.tasks.map((t) => t.id).sort()).toEqual(['4', 'epico-a', 'epico-b'].sort());
  });

  it("'epico': ordem das raias = 1ª aparição no array de entrada (exceto SEM_EPICO, sempre por último)", () => {
    const lanes = agruparSwimlanes(tasks, 'epico');
    expect(lanes.map((l) => l.chave)).toEqual(['epico-a', 'epico-b', SEM_EPICO]);
  });

  it("'responsavel': agrupa por assigneeUserId; balde SEM_RESPONSAVEL por último", () => {
    const lanes = agruparSwimlanes(tasks, 'responsavel');
    expect(lanes.map((l) => l.chave)).toEqual(['user-1', 'user-2', SEM_RESPONSAVEL]);
    expect(lanes.find((l) => l.chave === 'user-1')?.tasks.map((t) => t.id)).toEqual(['1', '4']);
    expect(lanes.find((l) => l.chave === SEM_RESPONSAVEL)?.label).toBe('Sem responsável');
  });

  it('ordem relativa das tasks dentro de cada raia é preservada (particionamento estável)', () => {
    const entrada: T[] = [
      task({ id: 'a', parentId: 'e1' }),
      task({ id: 'b', parentId: 'e2' }),
      task({ id: 'c', parentId: 'e1' }),
      task({ id: 'd', parentId: 'e1' }),
    ];
    const lanes = agruparSwimlanes(entrada, 'epico');
    expect(lanes.find((l) => l.chave === 'e1')?.tasks.map((t) => t.id)).toEqual(['a', 'c', 'd']);
  });

  it('lista vazia → devolve raias vazias (sem baldes fantasmas)', () => {
    expect(agruparSwimlanes([], 'nenhum')).toEqual([{ chave: 'todas', label: 'Todas', tasks: [] }]);
    expect(agruparSwimlanes([], 'epico')).toEqual([]);
    expect(agruparSwimlanes([], 'responsavel')).toEqual([]);
  });
});

describe('slaBadge', () => {
  const HOJE = '2026-07-20';

  it('sem prazo → ok', () => {
    expect(slaBadge({ status: 'todo', prazo: null }, HOJE)).toBe('ok');
  });

  it('prazo no passado (atrasada) → atrasada', () => {
    expect(slaBadge({ status: 'todo', prazo: '2026-07-19' }, HOJE)).toBe('atrasada');
  });

  it('prazo hoje → vence (fronteira: vence_em_breve inclui hoje)', () => {
    expect(slaBadge({ status: 'em_andamento', prazo: '2026-07-20' }, HOJE)).toBe('vence');
  });

  it('prazo no limite de VENCE_EM_BREVE_DIAS (hoje+2) → vence', () => {
    expect(slaBadge({ status: 'em_andamento', prazo: '2026-07-22' }, HOJE)).toBe('vence');
  });

  it('prazo além do limite (hoje+3) → ok', () => {
    expect(slaBadge({ status: 'em_andamento', prazo: '2026-07-23' }, HOJE)).toBe('ok');
  });

  it('concluida força ok mesmo com prazo vencido (prazo nunca conta p/ task concluída)', () => {
    expect(slaBadge({ status: 'concluida', prazo: '2020-01-01' }, HOJE)).toBe('ok');
  });

  it('usa hojeBrt() como default quando "hoje" não é passado', () => {
    // Só garante que a assinatura aceita chamada sem o 2º argumento (sem lançar).
    expect(['ok', 'vence', 'atrasada']).toContain(slaBadge({ status: 'todo', prazo: null }));
  });
});
