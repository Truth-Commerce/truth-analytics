import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { buildPasswordResetUrl } from '@/modules/auth/password-reset.repository';
import type { Plano } from '@/modules/auth/user.types';
import {
  accountActivatedTemplate,
  alertaTemplate,
  alertasDigestTemplate,
  autoGeracaoPausadaTemplate,
  blingConnectionFailedTemplate,
  digestSemanalTemplate,
  type DigestEmailData,
  lembretePrazoTemplate,
  olistConnectionFailedTemplate,
  passwordChangedTemplate,
  passwordResetTemplate,
  pipelineFailedTemplate,
  reportReadyTemplate,
  type ReportReadyEmailData,
  taskAprovadaTemplate,
  taskComentarioTemplate,
  taskCriadaTemplate,
  taskDevolvidaTemplate,
  taskRevisaoTemplate,
} from './templates';

/**
 * Envia um e-mail via Resend.
 *
 * Se RESEND_API_KEY ou EMAIL_FROM não estiverem configurados, opera em modo
 * no-op (sem erro) e registra um log informativo sem dados sensíveis.
 * Nunca lança exceção — falha de e-mail não deve quebrar nenhum fluxo de negócio.
 */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  if (!serverEnv.RESEND_API_KEY || !serverEnv.EMAIL_FROM) {
    logger.info('e-mail em modo no-op', { subject: input.subject });
    return;
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.RESEND_API_KEY);
    await resend.emails.send({
      from: serverEnv.EMAIL_FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  } catch (err) {
    logger.warn('falha ao enviar e-mail', { subject: input.subject }, err);
  }
}

/**
 * Notifica o cliente que sua conta foi ativada.
 * Nunca lança.
 */
export async function sendAccountActivatedEmail(to: string, plano: Plano): Promise<void> {
  const content = accountActivatedTemplate(plano);
  await sendEmail({ to, ...content });
}

/**
 * Notifica o cliente que seu relatório está pronto.
 * Nunca lança.
 */
export async function sendReportReadyEmail(to: string, dados: ReportReadyEmailData): Promise<void> {
  const content = reportReadyTemplate(dados, serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}

/**
 * Notifica o admin interno sobre falha no pipeline.
 * Nunca lança.
 *
 * @param to - destinatário (admin interno; use getAdminAlertEmail())
 * @param orgId - ID da organização
 * @param reportId - ID do relatório
 * @param erro - mensagem de erro truncada
 */
export async function sendPipelineFailedEmail(
  to: string,
  orgId: string,
  reportId: string,
  erro: string,
): Promise<void> {
  const content = pipelineFailedTemplate(orgId, reportId, erro);
  await sendEmail({ to, ...content });
}

/**
 * Avisa o admin interno que a auto-geração de uma org foi pausada. Nunca lança.
 */
export async function sendAutoGeracaoPausadaEmail(
  to: string,
  orgName: string,
  orgId: string,
): Promise<void> {
  const content = autoGeracaoPausadaTemplate(orgName, orgId);
  await sendEmail({ to, ...content });
}

/**
 * Notifica o cliente que sua conexão com o Bling expirou.
 * Nunca lança.
 */
export async function sendBlingConnectionFailedEmail(to: string): Promise<void> {
  const content = blingConnectionFailedTemplate(serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}

/** Notifica cliente ou analista de que a autorização Olist expirou. Nunca lança. */
export async function sendOlistConnectionFailedEmail(to: string, href: string): Promise<void> {
  const content = olistConnectionFailedTemplate(serverEnv.APP_URL, href);
  await sendEmail({ to, ...content });
}

/**
 * Envia o link de redefinição de senha. Nunca lança.
 */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = buildPasswordResetUrl(token);
  const content = passwordResetTemplate(link);
  await sendEmail({ to, ...content });
}

/**
 * Aviso de segurança: senha alterada com sucesso. Nunca lança.
 */
export async function sendPasswordChangedEmail(to: string): Promise<void> {
  const content = passwordChangedTemplate(serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}

/**
 * Notifica que uma nova tarefa foi criada. Nunca lança.
 */
export async function sendTaskCriadaEmail(to: string, titulo: string, url: string): Promise<void> {
  const content = taskCriadaTemplate(titulo, url);
  await sendEmail({ to, ...content });
}

/**
 * Notifica que há um novo comentário em uma tarefa. Nunca lança.
 */
export async function sendTaskComentarioEmail(to: string, titulo: string, url: string): Promise<void> {
  const content = taskComentarioTemplate(titulo, url);
  await sendEmail({ to, ...content });
}

/**
 * Notifica que uma tarefa foi devolvida. Nunca lança.
 */
export async function sendTaskDevolvidaEmail(to: string, titulo: string, url: string): Promise<void> {
  const content = taskDevolvidaTemplate(titulo, url);
  await sendEmail({ to, ...content });
}

/**
 * Notifica que uma tarefa foi aprovada. Nunca lança.
 */
export async function sendTaskAprovadaEmail(to: string, titulo: string, url: string): Promise<void> {
  const content = taskAprovadaTemplate(titulo, url);
  await sendEmail({ to, ...content });
}

/** Task aguardando ação da consultoria (analista ou fallback admin). Nunca lança. */
export async function sendTaskRevisaoEmail(to: string, titulo: string, url: string): Promise<void> {
  const content = taskRevisaoTemplate(titulo, url);
  await sendEmail({ to, ...content });
}

/** Lembrete de prazo de tarefa. Nunca lança. */
export async function sendLembretePrazoEmail(
  to: string,
  input: { titulo: string; prazoLabel: string; tipo: 'vence_em_breve' | 'atrasada' },
): Promise<void> {
  const content = lembretePrazoTemplate(input, serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}

/**
 * Digest semanal do Plano de Ação por org (tasks da semana + vendas do mês).
 * Nunca lança.
 */
export async function sendDigestSemanalEmail(to: string, dados: DigestEmailData): Promise<void> {
  const content = digestSemanalTemplate(dados, serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}

/**
 * Notifica o cliente sobre um novo alerta de inteligência. Nunca lança.
 */
export async function sendAlertaEmail(to: string, titulo: string, corpo: string): Promise<void> {
  const content = alertaTemplate(titulo, corpo, serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}

/**
 * Digest: notifica o cliente sobre TODOS os alertas novos da execução em um
 * único e-mail. Nunca lança.
 */
export async function sendAlertasDigestEmail(
  to: string,
  alertas: { titulo: string; corpo: string }[],
): Promise<void> {
  if (alertas.length === 0) return;
  const content = alertasDigestTemplate(alertas, serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}
