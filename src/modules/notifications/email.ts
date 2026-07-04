import { serverEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { Plano } from '@/modules/auth/user.types';
import {
  accountActivatedTemplate,
  blingConnectionFailedTemplate,
  passwordResetTemplate,
  pipelineFailedTemplate,
  reportReadyTemplate,
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
export async function sendReportReadyEmail(to: string, reportId: string): Promise<void> {
  const content = reportReadyTemplate(reportId, serverEnv.APP_URL);
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
 * Notifica o cliente que sua conexão com o Bling expirou.
 * Nunca lança.
 */
export async function sendBlingConnectionFailedEmail(to: string): Promise<void> {
  const content = blingConnectionFailedTemplate(serverEnv.APP_URL);
  await sendEmail({ to, ...content });
}

/**
 * Envia o link de redefinição de senha. Nunca lança.
 */
export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${serverEnv.APP_URL}/redefinir-senha/${token}`;
  const content = passwordResetTemplate(link);
  await sendEmail({ to, ...content });
}
