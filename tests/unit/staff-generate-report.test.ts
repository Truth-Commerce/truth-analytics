import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-dom', async (importOriginal) => {
  const original = await importOriginal<typeof import('react-dom')>();
  return { ...original, useFormState: () => [{}, '/mock-action'] as const };
});

import { StaffGenerateReport } from '@/app/analista/[orgId]/staff-generate-report';

describe('StaffGenerateReport', () => {
  it('mostra Olist ativo e envia a organização explícita', () => {
    const html = renderToStaticMarkup(createElement(StaffGenerateReport, {
      orgId: 'org-a', provider: 'olist', reportInProgressId: null,
    }));
    expect(html).toContain('Olist ERP ativo');
    expect(html).toContain('name="orgId"');
    expect(html).toContain('value="org-a"');
    expect(html).toContain('name="periodDays"');
    expect(html).toContain('<option value="30" selected="">Últimos 30 dias</option>');
    for (const days of [7, 14, 30, 60, 90, 180]) {
      expect(html).toContain(`value="${days}"`);
    }
    expect(html).toContain('Gerar relatório agora');
  });

  it('desabilita o disparo quando já existe relatório em andamento', () => {
    const html = renderToStaticMarkup(createElement(StaffGenerateReport, {
      orgId: 'org-a', provider: 'bling', reportInProgressId: 'report-1',
    }));
    expect(html).toContain('Bling ativo');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Relatório em andamento');
  });

  it('explica quando o cliente ainda não possui ERP ativo', () => {
    const html = renderToStaticMarkup(createElement(StaffGenerateReport, {
      orgId: 'org-a', provider: null, reportInProgressId: null,
    }));
    expect(html).toContain('Nenhum ERP ativo');
    expect(html).not.toContain('Gerar relatório agora');
  });
});
