import { describe, expect, it } from 'vitest';

import {
  accountActivatedTemplate,
  alertaTemplate,
  blingConnectionFailedTemplate,
  escapeHtml,
  lembretePrazoTemplate,
  pipelineFailedTemplate,
  reportReadyTemplate,
  taskAprovadaTemplate,
  taskComentarioTemplate,
  taskCriadaTemplate,
  taskDevolvidaTemplate,
  taskRevisaoTemplate,
} from '@/modules/notifications/templates';

describe('escapeHtml', () => {
  it('escapa & < > " \' na ordem correta (sem double-escaping)', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('escapa & antes dos demais para não escapar duas vezes as entidades geradas', () => {
    expect(escapeHtml('<')).toBe('&lt;');
  });

  it('mantém texto sem caracteres especiais inalterado', () => {
    expect(escapeHtml('Catalogar produto X')).toBe('Catalogar produto X');
  });
});

describe('notification templates (puro)', () => {
  describe('accountActivatedTemplate', () => {
    it('retorna subject, html e text não-vazios', () => {
      const result = accountActivatedTemplate('weekly');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('text menciona "ativada" (conta foi ativada)', () => {
      const result = accountActivatedTemplate('weekly');
      expect(result.text.toLowerCase()).toContain('ativada');
    });

    it('text menciona o plano weekly como "Semanal"', () => {
      const result = accountActivatedTemplate('weekly');
      expect(result.text).toContain('Semanal');
    });

    it('text menciona o plano biweekly como "Quinzenal"', () => {
      const result = accountActivatedTemplate('biweekly');
      expect(result.text).toContain('Quinzenal');
    });

    it('text menciona o plano monthly como "Mensal"', () => {
      const result = accountActivatedTemplate('monthly');
      expect(result.text).toContain('Mensal');
    });

    it('subject está em pt-BR e menciona Truth Analytics', () => {
      const result = accountActivatedTemplate('weekly');
      expect(result.subject).toContain('Truth Analytics');
    });
  });

  describe('reportReadyTemplate', () => {
    // Task 5: assinatura mudou para reportReadyTemplate(dados, appUrl). O
    // reportId agora aparece só embutido no link — não há mais linha "Relatório
    // ID:" solta (por isso a antiga asserção "text contém o reportId" saiu).
    const DADOS = {
      reportId: 'rep-123',
      periodoInicio: new Date('2026-06-01T00:00:00Z'),
      periodoFim: new Date('2026-06-30T00:00:00Z'),
      totalPeriodo: 10880,
      deltaPct: 12.2,
      score: 76,
      primeiroGargalo: 'Frete caro',
    };

    it('retorna subject, html e text não-vazios', () => {
      const result = reportReadyTemplate(DADOS, 'http://x');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('html contém o link completo com reportId', () => {
      const result = reportReadyTemplate(DADOS, 'http://x');
      expect(result.html).toContain('http://x/dashboard/relatorios/rep-123');
    });

    it('text contém a URL do relatório', () => {
      const result = reportReadyTemplate(
        { ...DADOS, reportId: 'rep-abc' },
        'https://app.truthanalytics.com',
      );
      expect(result.text).toContain('https://app.truthanalytics.com/dashboard/relatorios/rep-abc');
    });
  });

  describe('pipelineFailedTemplate', () => {
    it('retorna subject, html e text não-vazios', () => {
      const result = pipelineFailedTemplate('o1', 'r1', 'boom');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('text contém o erro', () => {
      const result = pipelineFailedTemplate('o1', 'r1', 'boom');
      expect(result.text).toContain('boom');
    });

    it('text contém orgId e reportId', () => {
      const result = pipelineFailedTemplate('o1', 'r1', 'boom');
      expect(result.text).toContain('o1');
      expect(result.text).toContain('r1');
    });

    it('subject menciona "Falha" (alerta de problema)', () => {
      const result = pipelineFailedTemplate('org-x', 'rep-x', 'erro qualquer');
      expect(result.subject.toLowerCase()).toContain('falha');
    });

    it('erro com markup não injeta tag no html (escapa HTML — G4)', () => {
      const { html } = pipelineFailedTemplate('org-1', 'rep-1', '<script>alert(1)</script> & "x"');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
      expect(html).toContain('&amp; &quot;x&quot;');
    });
  });

  describe('blingConnectionFailedTemplate', () => {
    it('retorna subject, html e text não-vazios', () => {
      const result = blingConnectionFailedTemplate('http://app');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('html contém link para /conexoes', () => {
      const result = blingConnectionFailedTemplate('http://app');
      expect(result.html).toContain('http://app/conexoes');
    });

    it('text menciona Bling', () => {
      const result = blingConnectionFailedTemplate('http://app');
      expect(result.text).toContain('Bling');
    });

    it('subject menciona "expirou"', () => {
      const result = blingConnectionFailedTemplate('http://app');
      expect(result.subject.toLowerCase()).toContain('expirou');
    });
  });

  describe('taskCriadaTemplate', () => {
    it('retorna subject, html e text não-vazios', () => {
      const result = taskCriadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('subject está em pt-BR e menciona Truth Analytics', () => {
      const result = taskCriadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.subject).toContain('Truth Analytics');
    });

    it('text contém o título da tarefa', () => {
      const result = taskCriadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.text).toContain('Catalogar produto X');
    });

    it('text contém a url', () => {
      const result = taskCriadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.text).toContain('http://app/tasks/1');
    });

    it('html contém a url', () => {
      const result = taskCriadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.html).toContain('http://app/tasks/1');
    });

    it('escapa HTML injetado no título (evita XSS)', () => {
      const titulo = '<img src=x onerror=alert(1)><script>alert(2)</script>';
      const result = taskCriadaTemplate(titulo, 'http://app/tasks/1');
      expect(result.html).not.toContain('<img');
      expect(result.html).not.toContain('<script>');
      expect(result.html).toContain('&lt;img');
      expect(result.text).toContain(titulo);
    });
  });

  describe('taskComentarioTemplate', () => {
    it('retorna subject, html e text não-vazios', () => {
      const result = taskComentarioTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('subject está em pt-BR e menciona Truth Analytics', () => {
      const result = taskComentarioTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.subject).toContain('Truth Analytics');
    });

    it('text contém o título da tarefa', () => {
      const result = taskComentarioTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.text).toContain('Catalogar produto X');
    });

    it('text contém a url', () => {
      const result = taskComentarioTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.text).toContain('http://app/tasks/1');
    });

    it('html contém a url', () => {
      const result = taskComentarioTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.html).toContain('http://app/tasks/1');
    });

    it('escapa HTML injetado no título (evita XSS)', () => {
      const titulo = '<img src=x onerror=alert(1)>';
      const result = taskComentarioTemplate(titulo, 'http://app/tasks/1');
      expect(result.html).not.toContain('<img');
      expect(result.html).toContain('&lt;img');
      expect(result.text).toContain(titulo);
    });
  });

  describe('taskDevolvidaTemplate', () => {
    it('retorna subject, html e text não-vazios', () => {
      const result = taskDevolvidaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('subject está em pt-BR e menciona Truth Analytics', () => {
      const result = taskDevolvidaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.subject).toContain('Truth Analytics');
    });

    it('text contém o título da tarefa', () => {
      const result = taskDevolvidaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.text).toContain('Catalogar produto X');
    });

    it('text contém a url', () => {
      const result = taskDevolvidaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.text).toContain('http://app/tasks/1');
    });

    it('html contém a url', () => {
      const result = taskDevolvidaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.html).toContain('http://app/tasks/1');
    });

    it('escapa HTML injetado no título (evita XSS)', () => {
      const titulo = '<img src=x onerror=alert(1)>';
      const result = taskDevolvidaTemplate(titulo, 'http://app/tasks/1');
      expect(result.html).not.toContain('<img');
      expect(result.html).toContain('&lt;img');
      expect(result.text).toContain(titulo);
    });
  });

  describe('taskAprovadaTemplate', () => {
    it('retorna subject, html e text não-vazios', () => {
      const result = taskAprovadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('subject está em pt-BR e menciona Truth Analytics', () => {
      const result = taskAprovadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.subject).toContain('Truth Analytics');
    });

    it('text contém o título da tarefa', () => {
      const result = taskAprovadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.text).toContain('Catalogar produto X');
    });

    it('text contém a url', () => {
      const result = taskAprovadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.text).toContain('http://app/tasks/1');
    });

    it('html contém a url', () => {
      const result = taskAprovadaTemplate('Catalogar produto X', 'http://app/tasks/1');
      expect(result.html).toContain('http://app/tasks/1');
    });

    it('escapa HTML injetado no título (evita XSS)', () => {
      const titulo = `<img src=x onerror=alert(1)> and "quotes" and 'apostrophes'`;
      const result = taskAprovadaTemplate(titulo, 'http://app/tasks/1');
      expect(result.html).not.toContain('<img');
      expect(result.html).toContain('&lt;img');
      expect(result.html).toContain('&quot;quotes&quot;');
      expect(result.html).toContain('&#39;apostrophes&#39;');
      expect(result.text).toContain(titulo);
    });
  });

  describe('taskRevisaoTemplate', () => {
    it('retorna subject, html e text não-vazios, em pt-BR com Truth Analytics', () => {
      const result = taskRevisaoTemplate('Revisar catálogo', 'http://app/analista/o1/tasks/t1');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.subject).toContain('Truth Analytics');
    });

    it('text e html contêm o título da tarefa e a url', () => {
      const result = taskRevisaoTemplate('Revisar catálogo', 'http://app/analista/o1/tasks/t1');
      expect(result.text).toContain('Revisar catálogo');
      expect(result.text).toContain('http://app/analista/o1/tasks/t1');
      expect(result.html).toContain('http://app/analista/o1/tasks/t1');
    });

    it('escapa HTML injetado no título (evita XSS)', () => {
      const titulo = '<img src=x onerror=alert(1)>';
      const result = taskRevisaoTemplate(titulo, 'http://app/analista/o1');
      expect(result.html).not.toContain('<img');
      expect(result.html).toContain('&lt;img');
      expect(result.text).toContain(titulo);
    });
  });

  describe('alertaTemplate', () => {
    it('retorna subject, html e text não-vazios', () => {
      const result = alertaTemplate('Queda de vendas de 60%', 'Corpo do alerta', 'http://app');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('subject contém o título do alerta e menciona Truth Analytics', () => {
      const result = alertaTemplate('Queda de vendas de 60%', 'Corpo do alerta', 'http://app');
      expect(result.subject).toContain('Queda de vendas de 60%');
      expect(result.subject).toContain('Truth Analytics');
    });

    it('text contém o corpo do alerta e o link do painel', () => {
      const result = alertaTemplate('Título X', 'Detalhe importante do alerta', 'http://app');
      expect(result.text).toContain('Detalhe importante do alerta');
      expect(result.text).toContain('http://app/dashboard');
    });

    it('escapa HTML injetado no título e no corpo (evita XSS)', () => {
      const result = alertaTemplate('<script>alert(1)</script>', '<img src=x>', 'http://app');
      expect(result.html).not.toContain('<script>');
      expect(result.html).not.toContain('<img');
      expect(result.html).toContain('&lt;script&gt;');
      expect(result.html).toContain('&lt;img');
    });
  });
});

describe('alertasDigestTemplate', () => {
  it('1 alerta → assunto com o título; N alertas → assunto com a contagem; escapa HTML', async () => {
    const { alertasDigestTemplate } = await import('@/modules/notifications/templates');
    const um = alertasDigestTemplate(
      [{ titulo: 'Queda de vendas de 60%', corpo: 'Últimos 7 dias <fracos>' }],
      'https://app.exemplo.com',
    );
    expect(um.subject).toContain('Queda de vendas de 60%');
    expect(um.html).toContain('&lt;fracos&gt;');
    expect(um.html).not.toContain('<fracos>');
    expect(um.text).toContain('https://app.exemplo.com/dashboard');

    const tres = alertasDigestTemplate(
      [
        { titulo: 'A', corpo: 'a' },
        { titulo: 'B', corpo: 'b' },
        { titulo: 'C', corpo: 'c' },
      ],
      'https://app.exemplo.com',
    );
    expect(tres.subject).toContain('3');
    expect(tres.html).toContain('<li>');
  });
});

describe('lembretePrazoTemplate', () => {
  it('vence_em_breve: assunto de aviso + título escapado + link do plano', () => {
    const t = lembretePrazoTemplate(
      { titulo: 'Ajustar <preço> do kit', prazoLabel: 'Vence amanhã', tipo: 'vence_em_breve' },
      'http://x',
    );
    expect(t.subject).toContain('Tarefa perto do prazo');
    expect(t.html).toContain('&lt;preço&gt;');
    expect(t.html).toContain('http://x/dashboard/plano-de-acao');
    expect(t.text).toContain('Vence amanhã');
  });

  it('atrasada: assunto de atraso', () => {
    const t = lembretePrazoTemplate({ titulo: 'T', prazoLabel: 'Atrasada há 2d', tipo: 'atrasada' }, 'http://x');
    expect(t.subject).toContain('Tarefa atrasada');
  });
});

describe('digestSemanalTemplate', () => {
  const DADOS = {
    orgName: 'Loja <Teste>',
    resumo: '3 concluídas ✅, 2 atrasadas ⚠️, 4 em andamento',
    vendasMes: 10880.5,
    vendasMesAnterior: 9700,
  };

  it('assunto com resumo, nome escapado, vendas e CTA do plano de ação', async () => {
    const { digestSemanalTemplate } = await import('@/modules/notifications/templates');
    const t = digestSemanalTemplate(DADOS, 'http://x');
    expect(t.subject).toContain('Resumo da semana');
    expect(t.html).toContain('&lt;Teste&gt;');
    expect(t.html).not.toContain('<Teste>');
    expect(t.html).toContain('3 concluídas ✅, 2 atrasadas ⚠️, 4 em andamento');
    expect(t.text).toContain('R$');
    expect(t.html).toContain('http://x/dashboard/plano-de-acao');
  });

  it('mês anterior > 0 → delta percentual com seta; = 0 → só o valor do mês', async () => {
    const { digestSemanalTemplate } = await import('@/modules/notifications/templates');
    const alta = digestSemanalTemplate(DADOS, 'http://x');
    expect(alta.text).toContain('▲ 12,2% vs mês anterior');
    const queda = digestSemanalTemplate({ ...DADOS, vendasMes: 8730 }, 'http://x');
    expect(queda.text).toContain('▼ 10% vs mês anterior');
    const semBase = digestSemanalTemplate({ ...DADOS, vendasMesAnterior: 0 }, 'http://x');
    expect(semBase.text).toContain('Vendas do mês:');
    expect(semBase.text).not.toContain('vs mês anterior');
  });
});

describe('autoGeracaoPausadaTemplate', () => {
  it('inclui nome e id da org, escapando HTML', async () => {
    const { autoGeracaoPausadaTemplate } = await import('@/modules/notifications/templates');
    const t = autoGeracaoPausadaTemplate('Loja <X>', 'org-123');
    expect(t.subject).toContain('Geração automática pausada');
    expect(t.html).toContain('&lt;X&gt;');
    expect(t.text).toContain('org-123');
  });

  it('instrui a reprocessar/gerar manualmente e avisa que só religar NÃO resolve', async () => {
    const { autoGeracaoPausadaTemplate } = await import('@/modules/notifications/templates');
    const t = autoGeracaoPausadaTemplate('Loja Y', 'org-456');
    // A pausa é re-aplicada pelo cron enquanto os 3 últimos relatórios forem
    // failed — a copy NÃO pode dizer que religar em Conexões resolve.
    expect(t.text).toContain('reprocesse o último relatório no painel admin');
    expect(t.text).toContain('não resolve enquanto os últimos relatórios forem falhas');
    expect(t.html).toContain('reprocesse o último relatório no painel admin');
    expect(t.html).toContain('não resolve enquanto os últimos relatórios forem falhas');
    expect(t.text).not.toContain('o cliente pode religar em Conexões');
  });
});
