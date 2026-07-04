import { describe, expect, it } from 'vitest';

import {
  accountActivatedTemplate,
  blingConnectionFailedTemplate,
  pipelineFailedTemplate,
  reportReadyTemplate,
  taskAprovadaTemplate,
  taskComentarioTemplate,
  taskCriadaTemplate,
  taskDevolvidaTemplate,
} from '@/modules/notifications/templates';

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
    it('retorna subject, html e text não-vazios', () => {
      const result = reportReadyTemplate('rep-123', 'http://x');
      expect(result.subject.length).toBeGreaterThan(0);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
    });

    it('text contém o reportId', () => {
      const result = reportReadyTemplate('rep-123', 'http://x');
      expect(result.text).toContain('rep-123');
    });

    it('html contém o link completo com reportId', () => {
      const result = reportReadyTemplate('rep-123', 'http://x');
      expect(result.html).toContain('http://x/dashboard/relatorios/rep-123');
    });

    it('text contém a URL do relatório', () => {
      const result = reportReadyTemplate('rep-abc', 'https://app.truthanalytics.com');
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
  });
});
