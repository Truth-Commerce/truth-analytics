import { describe, expect, it } from 'vitest';

import { reportReadyTemplate, type ReportReadyEmailData } from '@/modules/notifications/templates';

const DADOS: ReportReadyEmailData = {
  reportId: 'rep-123',
  // Fronteiras de período REAIS: dias-calendário codificados como meia-noite
  // UTC (inicioDeDiaUtc). Formatar em BRT deslocaria o início 1 dia para trás.
  periodoInicio: new Date('2026-06-01T00:00:00Z'),
  periodoFim: new Date('2026-06-30T00:00:00Z'),
  totalPeriodo: 10880,
  deltaPct: 12.2,
  score: 76,
  primeiroGargalo: 'Frete <caro> no ML & Shopee',
};

describe('reportReadyTemplate v2', () => {
  it('assunto tem período dd/mm, total formatado e direção do delta', () => {
    const { subject } = reportReadyTemplate(DADOS, 'http://x');
    expect(subject).toContain('01/06');
    expect(subject).toContain('30/06');
    expect(subject).toContain('10.880');
    expect(subject).toContain('▲');
    expect(subject).toContain('12,2%');
    expect(subject).toContain('relatório Truth pronto');
  });

  it('delta negativo → ▼; delta null → sem parênteses de variação', () => {
    expect(reportReadyTemplate({ ...DADOS, deltaPct: -8.4 }, 'http://x').subject).toContain('▼');
    const semDelta = reportReadyTemplate({ ...DADOS, deltaPct: null }, 'http://x').subject;
    expect(semDelta).not.toContain('▲');
    expect(semDelta).not.toContain('▼');
  });

  it('html tem CTA para o relatório, score, gargalo ESCAPADO e parágrafo do Plano de Ação', () => {
    const { html } = reportReadyTemplate(DADOS, 'http://x');
    expect(html).toContain('http://x/dashboard/relatorios/rep-123');
    expect(html).toContain('Ver relatório completo');
    expect(html).toContain('76');
    expect(html).toContain('Frete &lt;caro&gt; no ML &amp; Shopee');
    expect(html).not.toContain('Frete <caro>');
    expect(html).toContain('Plano de Ação');
    expect(html).toContain('#07dd2b'); // wordmark/CTA na cor da marca
  });

  it('score/gargalo nulos → seções omitidas sem quebrar', () => {
    const { html, text } = reportReadyTemplate({ ...DADOS, score: null, primeiroGargalo: null }, 'http://x');
    expect(html).not.toContain('Truth Score');
    expect(html).not.toContain('Principal gargalo');
    expect(text.length).toBeGreaterThan(0);
  });

  it('texto plano equivalente (total, link e gargalo)', () => {
    const { text } = reportReadyTemplate(DADOS, 'http://x');
    expect(text).toContain('10.880');
    expect(text).toContain('http://x/dashboard/relatorios/rep-123');
    expect(text).toContain('Frete <caro> no ML & Shopee'); // texto plano NÃO escapa
  });
});
