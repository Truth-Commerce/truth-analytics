import { serverEnv } from '@/lib/env';

/**
 * Envia o e-mail de "relatório pronto" para o endereço indicado.
 * Se RESEND_API_KEY ou EMAIL_FROM não estiverem configurados, opera em modo
 * no-op (sem erro) e registra um log informativo sem dados sensíveis.
 * Nunca lança exceção — falha de e-mail não deve quebrar o pipeline.
 */
export async function sendReportReadyEmail(to: string, reportId: string): Promise<void> {
  if (!serverEnv.RESEND_API_KEY || !serverEnv.EMAIL_FROM) {
    console.info(`[email] (no-op) relatório pronto report=${reportId}`);
    return;
  }

  try {
    // Lazy-construct o cliente Resend para evitar instância no carregamento do módulo
    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.RESEND_API_KEY);

    await resend.emails.send({
      from: serverEnv.EMAIL_FROM,
      to,
      subject: 'Seu relatório de análise está pronto',
      text: `Seu relatório (ID: ${reportId}) foi gerado com sucesso. Acesse o painel para visualizá-lo.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[email] falha ao enviar e-mail de relatório pronto report=${reportId}: ${msg}`);
  }
}

/**
 * Envia o e-mail de falha no pipeline para o administrador.
 * Mesmo comportamento de no-op e tratamento de erro que sendReportReadyEmail.
 */
export async function sendPipelineFailedEmail(
  orgId: string,
  reportId: string,
  erro: string,
): Promise<void> {
  if (!serverEnv.RESEND_API_KEY || !serverEnv.EMAIL_FROM) {
    console.info(
      `[email] (no-op) pipeline falhou org=${orgId} report=${reportId}`,
    );
    return;
  }

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(serverEnv.RESEND_API_KEY);

    await resend.emails.send({
      from: serverEnv.EMAIL_FROM,
      to: serverEnv.EMAIL_FROM, // Plano 6 expande com e-mail do admin da org
      subject: `[Truth Analytics] Falha na geração do relatório`,
      text: `Falha ao gerar o relatório.\n\nOrg ID: ${orgId}\nRelatório ID: ${reportId}\nErro: ${erro}\n\nVerifique o painel administrativo.`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[email] falha ao enviar e-mail de pipeline falhou org=${orgId} report=${reportId}: ${msg}`,
    );
  }
}
