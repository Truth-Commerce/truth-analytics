import type { Plano } from '@/modules/auth/user.types';

export type EmailContent = {
  subject: string;
  html: string;
  text: string;
};

const PLANO_LABELS: Record<Plano, string> = {
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  monthly: 'Mensal',
};

/**
 * Template: conta ativada (enviado ao cliente após ativação da organização).
 */
export function accountActivatedTemplate(plano: Plano): EmailContent {
  const planoLabel = PLANO_LABELS[plano] ?? plano;
  const subject = 'Sua conta foi ativada — Truth Analytics';
  const text = [
    'Parabéns! Sua conta no Truth Analytics foi ativada com sucesso.',
    '',
    `Plano: ${planoLabel}`,
    '',
    'Acesse o painel para acompanhar suas análises de mercado e relatórios de vendas.',
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Parabéns! Sua conta no <strong>Truth Analytics</strong> foi ativada com sucesso.</p>
<p><strong>Plano:</strong> ${planoLabel}</p>
<p>Acesse o painel para acompanhar suas análises de mercado e relatórios de vendas.</p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;

  return { subject, html, text };
}

/**
 * Template: relatório pronto (enviado ao cliente após geração bem-sucedida).
 */
export function reportReadyTemplate(reportId: string, appUrl: string): EmailContent {
  const url = `${appUrl}/dashboard/relatorios/${reportId}`;
  const subject = 'Seu relatório está pronto — Truth Analytics';
  const text = [
    'Seu relatório de análise foi gerado com sucesso.',
    '',
    `Relatório ID: ${reportId}`,
    '',
    `Acesse em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Seu relatório de análise foi gerado com sucesso.</p>
<p><strong>Relatório ID:</strong> ${reportId}</p>
<p><a href="${url}">Clique aqui para visualizar o relatório</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;

  return { subject, html, text };
}

/**
 * Template: falha no pipeline (enviado ao admin interno).
 */
export function pipelineFailedTemplate(
  orgId: string,
  reportId: string,
  erro: string,
): EmailContent {
  const subject = '[Truth Analytics] Falha na geração do relatório';
  const text = [
    'Falha ao gerar o relatório.',
    '',
    `Org ID: ${orgId}`,
    `Relatório ID: ${reportId}`,
    `Erro: ${erro}`,
    '',
    'Verifique o painel administrativo para mais detalhes.',
    '',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Falha ao gerar o relatório.</p>
<p><strong>Org ID:</strong> ${orgId}</p>
<p><strong>Relatório ID:</strong> ${reportId}</p>
<p><strong>Erro:</strong> ${erro}</p>
<p>Verifique o painel administrativo para mais detalhes.</p>`;

  return { subject, html, text };
}

/**
 * Template: redefinição de senha (link expira em 1h; single-use).
 */
export function passwordResetTemplate(link: string): EmailContent {
  const subject = 'Redefinição de senha — Truth Analytics';
  const text = [
    'Recebemos um pedido para redefinir a senha da sua conta no Truth Analytics.',
    '',
    `Para criar uma nova senha, acesse: ${link}`,
    '',
    'O link expira em 1 hora e só pode ser usado uma vez.',
    'Se você não pediu a redefinição, ignore este e-mail — sua senha permanece a mesma.',
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Recebemos um pedido para redefinir a senha da sua conta no <strong>Truth Analytics</strong>.</p>
<p><a href="${link}">Clique aqui para criar uma nova senha</a></p>
<p>O link expira em <strong>1 hora</strong> e só pode ser usado uma vez.</p>
<p>Se você não pediu a redefinição, ignore este e-mail — sua senha permanece a mesma.</p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;
  return { subject, html, text };
}

/**
 * Template: conexão Bling expirou (enviado ao cliente).
 */
export function blingConnectionFailedTemplate(appUrl: string): EmailContent {
  const url = `${appUrl}/conexoes`;
  const subject = 'Sua conexão com o Bling expirou — Truth Analytics';
  const text = [
    'Sua conexão com o Bling expirou e precisa ser renovada.',
    '',
    `Acesse suas conexões em: ${url}`,
    '',
    'Reconecte sua conta para continuar recebendo relatórios atualizados.',
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Sua conexão com o Bling expirou e precisa ser renovada.</p>
<p><a href="${url}">Clique aqui para renovar sua conexão</a></p>
<p>Reconecte sua conta para continuar recebendo relatórios atualizados.</p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;

  return { subject, html, text };
}
