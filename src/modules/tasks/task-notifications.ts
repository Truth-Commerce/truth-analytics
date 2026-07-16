import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { notify } from '@/modules/notifications/notification.repository';
import {
  getAdminAlertEmail,
  getOrgAnalistaUser,
  getOrgPrimaryUser,
} from '@/modules/notifications/recipients';
import {
  sendTaskAprovadaEmail,
  sendTaskComentarioEmail,
  sendTaskCriadaEmail,
  sendTaskDevolvidaEmail,
  sendTaskRevisaoEmail,
} from '@/modules/notifications/email';

type Destinatario = { id: string; email: string };
type EmailSender = (to: string, titulo: string, url: string) => Promise<void>;

function hrefCliente(taskId: string): string {
  return `/dashboard/plano-de-acao/${taskId}`;
}

function hrefAnalista(orgId: string, taskId: string): string {
  return `/analista/${orgId}/tasks/${taskId}`;
}

/**
 * Dispatcher genérico dos gatilhos de notificação de task: resolve o
 * destinatário, dispara a notificação in-app e (se configurado) o e-mail.
 * NUNCA lança — best-effort em toda a extensão (lookup de destinatário
 * incluído): uma falha de DB/e-mail aqui não pode quebrar a action de
 * negócio que a chamou.
 */
async function dispatch(input: {
  taskId: string;
  tipo: string;
  tituloNotificacao: string;
  corpo: string;
  href: string;
  getDestinatario: () => Promise<Destinatario | null>;
  enviarEmail?: EmailSender;
  /**
   * Sem destinatário (org sem analista): manda o e-mail para
   * getAdminAlertEmail() — sem in-app (não há user determinístico). Se a env
   * não estiver configurada, comporta-se como antes (descarte).
   */
  fallbackEmailAdmin?: boolean;
}): Promise<void> {
  try {
    const destinatario = await input.getDestinatario();
    const url = `${serverEnv.APP_URL}${input.href}`;

    if (!destinatario) {
      if (input.fallbackEmailAdmin && input.enviarEmail) {
        const adminEmail = getAdminAlertEmail();
        if (adminEmail) await input.enviarEmail(adminEmail, input.corpo, url);
      }
      return;
    }

    await notify(destinatario.id, {
      tipo: input.tipo,
      titulo: input.tituloNotificacao,
      corpo: input.corpo,
      href: input.href,
    });

    if (input.enviarEmail) {
      await input.enviarEmail(destinatario.email, input.corpo, url);
    }
  } catch (e) {
    logger.warn('gatilho de notificação de task falhou', { taskId: input.taskId, tipo: input.tipo }, e);
  }
}

/** Task criada por analista/admin → notifica o cliente da org. */
export async function notifyTaskCriada(orgId: string, taskId: string, titulo: string): Promise<void> {
  await dispatch({
    taskId,
    tipo: 'task_criada',
    tituloNotificacao: 'Nova task no seu Plano de Ação',
    corpo: titulo,
    href: hrefCliente(taskId),
    getDestinatario: () => getOrgPrimaryUser(orgId),
    enviarEmail: sendTaskCriadaEmail,
  });
}

/** Task movida para em_revisao pelo cliente → notifica o analista da org (fallback: e-mail admin). */
export async function notifyTaskEmRevisao(orgId: string, taskId: string, titulo: string): Promise<void> {
  await dispatch({
    taskId,
    tipo: 'task_em_revisao',
    tituloNotificacao: 'Tarefa aguardando revisão',
    corpo: titulo,
    href: hrefAnalista(orgId, taskId),
    getDestinatario: () => getOrgAnalistaUser(orgId),
    enviarEmail: sendTaskRevisaoEmail,
    fallbackEmailAdmin: true,
  });
}

/** Task criada PELO CLIENTE → notifica o analista da org (fallback: e-mail admin). */
export async function notifyTaskCriadaPeloCliente(
  orgId: string,
  taskId: string,
  titulo: string,
): Promise<void> {
  await dispatch({
    taskId,
    tipo: 'task_criada_cliente',
    tituloNotificacao: 'Cliente criou uma tarefa',
    corpo: titulo,
    href: hrefAnalista(orgId, taskId),
    getDestinatario: () => getOrgAnalistaUser(orgId),
    enviarEmail: sendTaskRevisaoEmail,
    fallbackEmailAdmin: true,
  });
}

/** Task aprovada pelo analista/admin → notifica o cliente. */
export async function notifyTaskAprovada(orgId: string, taskId: string, titulo: string): Promise<void> {
  await dispatch({
    taskId,
    tipo: 'task_aprovada',
    tituloNotificacao: 'Tarefa aprovada',
    corpo: titulo,
    href: hrefCliente(taskId),
    getDestinatario: () => getOrgPrimaryUser(orgId),
    enviarEmail: sendTaskAprovadaEmail,
  });
}

/** Task devolvida pelo analista/admin → notifica o cliente. */
export async function notifyTaskDevolvida(orgId: string, taskId: string, titulo: string): Promise<void> {
  await dispatch({
    taskId,
    tipo: 'task_devolvida',
    tituloNotificacao: 'Tarefa devolvida',
    corpo: titulo,
    href: hrefCliente(taskId),
    getDestinatario: () => getOrgPrimaryUser(orgId),
    enviarEmail: sendTaskDevolvidaEmail,
  });
}

/**
 * N tasks criadas de uma vez a partir dos achados da análise IA de um
 * relatório (Task 8) → 1 notificação agregada ao cliente (nunca ao autor —
 * quem dispara este gatilho é sempre analista/admin, o cliente nunca se
 * auto-notifica ao converter os próprios achados). Sem e-mail dedicado.
 */
export async function notifyTasksDoRelatorio(orgId: string, reportId: string, criadas: number): Promise<void> {
  const texto = `${criadas} nova(s) task(s) do seu relatório`;
  await dispatch({
    taskId: reportId,
    tipo: 'tasks_do_relatorio',
    tituloNotificacao: texto,
    corpo: texto,
    href: '/dashboard/plano-de-acao',
    getDestinatario: () => getOrgPrimaryUser(orgId),
  });
}

/**
 * Cliente converteu achados do relatório em N tasks → notifica o analista da
 * org (fallback: e-mail admin). Espelho de notifyTasksDoRelatorio para o outro
 * lado da conversa (Task 10 — G3).
 */
export async function notifyTasksDoRelatorioParaAnalista(
  orgId: string,
  reportId: string,
  criadas: number,
): Promise<void> {
  const texto = `Cliente criou ${criadas} tarefa(s) a partir do relatório`;
  await dispatch({
    taskId: reportId,
    tipo: 'tasks_do_relatorio_cliente',
    tituloNotificacao: texto,
    corpo: texto,
    href: `/analista/${orgId}`,
    getDestinatario: () => getOrgAnalistaUser(orgId),
    enviarEmail: sendTaskRevisaoEmail,
    fallbackEmailAdmin: true,
  });
}

/**
 * Novo comentário em uma task → notifica o outro lado da conversa:
 * autor cliente → analista da org; autor analista/admin → cliente da org.
 * Fallback de e-mail admin só quando o alvo é a consultoria (autor cliente).
 */
export async function notifyTaskComentario(
  orgId: string,
  taskId: string,
  titulo: string,
  autorEhCliente: boolean,
): Promise<void> {
  await dispatch({
    taskId,
    tipo: 'task_comentario',
    tituloNotificacao: 'Novo comentário em uma tarefa',
    corpo: titulo,
    href: autorEhCliente ? hrefAnalista(orgId, taskId) : hrefCliente(taskId),
    getDestinatario: () => (autorEhCliente ? getOrgAnalistaUser(orgId) : getOrgPrimaryUser(orgId)),
    enviarEmail: sendTaskComentarioEmail,
    fallbackEmailAdmin: autorEhCliente,
  });
}
