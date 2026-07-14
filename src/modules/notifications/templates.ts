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

/** Dados ricos do e-mail "relatório pronto" — montados no finalize (Task 5). */
export type ReportReadyEmailData = {
  reportId: string;
  periodoInicio: Date;
  periodoFim: Date;
  totalPeriodo: number;
  deltaPct: number | null;
  score: number | null;
  primeiroGargalo: string | null;
};

/**
 * Template: relatório pronto (enviado ao cliente após geração bem-sucedida).
 * A copy v2 completa (destaques, gargalo nº 1, delta) vem na Task 11 — aqui só
 * a nova assinatura + a estrutura de dados básica.
 */
export function reportReadyTemplate(dados: ReportReadyEmailData, appUrl: string): EmailContent {
  const url = `${appUrl}/dashboard/relatorios/${dados.reportId}`;
  const subject = 'Seu relatório está pronto — Truth Analytics';
  const text = [
    'Seu relatório de análise foi gerado com sucesso.',
    '',
    `Acesse em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Seu relatório de análise foi gerado com sucesso.</p>
<p><a href="${escapeHtml(url)}">Clique aqui para visualizar o relatório</a></p>
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
 * Template: alerta de inteligência (queda de vendas, concorrente abaixo do
 * preço, produto parado). Enviado ao cliente quando o cron detecta um novo
 * alerta. `titulo`/`corpo` vêm dos detectores (texto já pt-BR).
 */
export function alertaTemplate(titulo: string, corpo: string, appUrl: string): EmailContent {
  const url = `${appUrl}/dashboard`;
  const subject = `⚠ ${titulo} — Truth Analytics`;
  const text = [
    titulo,
    '',
    corpo,
    '',
    `Acesse seu painel em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p><strong>${escapeHtml(titulo)}</strong></p>
<p>${escapeHtml(corpo)}</p>
<p><a href="${escapeHtml(url)}">Acesse seu painel</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;

  return { subject, html, text };
}

/**
 * Template: digest de alertas — UM e-mail por org por execução do cron com
 * TODOS os alertas novos (anti-spam; a notificação in-app continua 1 por
 * alerta). `titulo`/`corpo` vêm dos detectores (pt-BR), mas são escapados.
 */
export function alertasDigestTemplate(
  alertas: { titulo: string; corpo: string }[],
  appUrl: string,
): EmailContent {
  const url = `${appUrl}/dashboard`;
  const subject =
    alertas.length === 1
      ? `⚠ ${alertas[0].titulo} — Truth Analytics`
      : `⚠ ${alertas.length} novos alertas na sua loja — Truth Analytics`;
  const text = [
    'Detectamos os seguintes alertas na sua operação:',
    '',
    ...alertas.flatMap((a) => [`• ${a.titulo}`, `  ${a.corpo}`, '']),
    `Acesse seu painel em: ${url}`,
    '',
    'Atenciosamente,',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>Detectamos os seguintes alertas na sua operação:</p>
<ul>
${alertas.map((a) => `<li><strong>${escapeHtml(a.titulo)}</strong><br>${escapeHtml(a.corpo)}</li>`).join('\n')}
</ul>
<p><a href="${escapeHtml(url)}">Acesse seu painel</a></p>
<p>Atenciosamente,<br>Equipe Truth Analytics</p>`;

  return { subject, html, text };
}

/**
 * Template: geração automática pausada após falhas consecutivas (admin interno).
 */
export function autoGeracaoPausadaTemplate(orgName: string, orgId: string): EmailContent {
  const subject = '[Truth Analytics] Geração automática pausada após falhas consecutivas';
  const text = [
    'A geração automática de relatórios de um cliente foi pausada após 3 falhas consecutivas.',
    '',
    `Cliente: ${orgName}`,
    `Org ID: ${orgId}`,
    '',
    'Investigue os erros no painel admin. Após corrigir a causa, reprocesse o último relatório no painel admin (Reprocessar) ou peça ao cliente para gerar um relatório manualmente — apenas religar a geração automática não resolve enquanto os últimos relatórios forem falhas (o cron re-pausa).',
    '',
    'Equipe Truth Analytics',
  ].join('\n');
  const html = `<p>A geração automática de relatórios de <strong>${escapeHtml(orgName)}</strong> foi pausada após 3 falhas consecutivas.</p>
<p><strong>Org ID:</strong> ${escapeHtml(orgId)}</p>
<p>Investigue os erros no painel admin. Após corrigir a causa, reprocesse o último relatório no painel admin (Reprocessar) ou peça ao cliente para gerar um relatório manualmente — apenas religar a geração automática não resolve enquanto os últimos relatórios forem falhas (o cron re-pausa).</p>`;

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
