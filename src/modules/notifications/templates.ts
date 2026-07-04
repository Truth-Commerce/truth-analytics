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
 * Escapa caracteres especiais de HTML para prevenir injeção (XSS) quando
 * valores de origem do usuário (ex.: título de tarefa) são interpolados
 * diretamente em templates de e-mail HTML.
 *
 * A ordem importa: `&` precisa ser escapado primeiro, senão os `&` gerados
 * pelas substituições seguintes seriam escapados de novo (double-escaping).
 */
export function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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
 * Template: nova tarefa criada (enviado ao destinatário da tarefa).
 */
export function taskCriadaTemplate(titulo: string, url: string): EmailContent {
  const subject = 'Nova tarefa atribuída a você — Truth Analytics';
  const text = [
    'Uma nova tarefa foi criada para você.',
    '',
    `Tarefa: ${titulo}`,
    '',
    `Acesse em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Uma nova tarefa foi criada para você.</p>
<p><strong>Tarefa:</strong> ${escapeHtml(titulo)}</p>
<p><a href="${escapeHtml(url)}">Clique aqui para visualizar a tarefa</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;

  return { subject, html, text };
}

/**
 * Template: novo comentário em uma tarefa (enviado ao outro participante).
 */
export function taskComentarioTemplate(titulo: string, url: string): EmailContent {
  const subject = 'Novo comentário em uma tarefa — Truth Analytics';
  const text = [
    'Há um novo comentário em uma tarefa que envolve você.',
    '',
    `Tarefa: ${titulo}`,
    '',
    `Acesse em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Há um novo comentário em uma tarefa que envolve você.</p>
<p><strong>Tarefa:</strong> ${escapeHtml(titulo)}</p>
<p><a href="${escapeHtml(url)}">Clique aqui para visualizar a tarefa</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;

  return { subject, html, text };
}

/**
 * Template: tarefa devolvida (enviado a quem precisa retrabalhar a tarefa).
 */
export function taskDevolvidaTemplate(titulo: string, url: string): EmailContent {
  const subject = 'Tarefa devolvida — Truth Analytics';
  const text = [
    'Uma tarefa foi devolvida e precisa da sua atenção.',
    '',
    `Tarefa: ${titulo}`,
    '',
    `Acesse em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Uma tarefa foi devolvida e precisa da sua atenção.</p>
<p><strong>Tarefa:</strong> ${escapeHtml(titulo)}</p>
<p><a href="${escapeHtml(url)}">Clique aqui para visualizar a tarefa</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;

  return { subject, html, text };
}

/**
 * Template: tarefa aprovada (enviado a quem executou a tarefa).
 */
export function taskAprovadaTemplate(titulo: string, url: string): EmailContent {
  const subject = 'Tarefa aprovada — Truth Analytics';
  const text = [
    'Sua tarefa foi aprovada.',
    '',
    `Tarefa: ${titulo}`,
    '',
    `Acesse em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Sua tarefa foi aprovada.</p>
<p><strong>Tarefa:</strong> ${escapeHtml(titulo)}</p>
<p><a href="${escapeHtml(url)}">Clique aqui para visualizar a tarefa</a></p>
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
