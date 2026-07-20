import { hojeBrt } from '@/lib/timezone';
import type { UserRole } from '@/modules/auth/user.types';

export const TASK_STATUSES = ['backlog', 'todo', 'em_andamento', 'em_revisao', 'concluida'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TIPOS = ['catalogo', 'preco', 'anuncio', 'logistica', 'conta', 'outro'] as const;
export type TaskTipo = (typeof TASK_TIPOS)[number];

export const TASK_PRIORIDADES = ['baixa', 'media', 'alta'] as const;
export type TaskPrioridade = (typeof TASK_PRIORIDADES)[number];

export type TaskCriadoPor = 'analista' | 'cliente' | 'ia';
export type TaskAtor = 'cliente' | 'analista' | 'admin';

export const STATUS_TASK_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'A fazer',
  em_andamento: 'Em andamento',
  em_revisao: 'Em revisão',
  concluida: 'Concluída',
};

export const TIPO_TASK_LABEL: Record<TaskTipo, string> = {
  catalogo: 'Catálogo',
  preco: 'Preço',
  anuncio: 'Anúncio',
  logistica: 'Logística',
  conta: 'Conta',
  outro: 'Outro',
};

export const PRIORIDADE_TASK_LABEL: Record<TaskPrioridade, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

export type TaskSummary = {
  id: string;
  titulo: string;
  tipo: TaskTipo;
  prioridade: TaskPrioridade;
  status: TaskStatus;
  prazo: string | null;
  criadoPor: TaskCriadoPor;
  reportId: string | null;
  ordem: number;
  createdAt: Date;
};

export type TaskDetail = TaskSummary & {
  descricao: string;
  assigneeUserId: string | null;
  orgId: string;
  updatedAt: Date;
  /** Labels (H5/T3) — já normalizadas (ver `normalizarLabels`/`setTaskLabels`). */
  labels: string[];
};

export function atorFromRole(role: UserRole): TaskAtor {
  switch (role) {
    case 'client':
      return 'cliente';
    case 'analista':
      return 'analista';
    case 'admin_truth':
      return 'admin';
  }
}

export function isTaskAtrasada(task: Pick<TaskSummary, 'prazo' | 'status'>, hoje: Date = new Date()): boolean {
  if (!task.prazo || task.status === 'concluida') return false;
  // Dia-calendário em America/Sao_Paulo (o antigo toISOString().slice(0,10)
  // era UTC: entre 21h e 0h BRT a task "atrasava" 3h antes da meia-noite).
  return task.prazo < hojeBrt(hoje);
}
