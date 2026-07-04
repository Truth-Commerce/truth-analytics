import type { TaskAtor, TaskCriadoPor, TaskStatus } from './task.types';

export function proximoStatusAoConcluir(criadoPor: TaskCriadoPor): TaskStatus {
  return criadoPor === 'cliente' ? 'concluida' : 'em_revisao';
}

const LIVRES_CLIENTE: readonly TaskStatus[] = ['backlog', 'todo', 'em_andamento'];

export function podeTransicionar(input: {
  ator: TaskAtor;
  criadoPor: TaskCriadoPor;
  de: TaskStatus;
  para: TaskStatus;
}): boolean {
  const { ator, criadoPor, de, para } = input;
  if (de === para) return false;
  if (ator === 'analista' || ator === 'admin') return true;
  // cliente
  if (!LIVRES_CLIENTE.includes(de)) return false;
  if (LIVRES_CLIENTE.includes(para)) return true;
  return para === proximoStatusAoConcluir(criadoPor);
}
