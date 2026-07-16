import { describe, expect, it } from 'vitest';

import { friendlyReportError } from '@/modules/reports/report-errors';

describe('friendlyReportError', () => {
  it('mapeia códigos conhecidos para pt-BR', () => {
    expect(friendlyReportError('timeout_watchdog')).toContain('demorou mais que o esperado');
    expect(friendlyReportError('analise_ia_invalida')).toContain('não conseguiu concluir a análise');
    expect(friendlyReportError('sem_conexao_bling')).toContain('Bling');
    expect(friendlyReportError('refresh_bling_falhou')).toContain('Reconecte');
  });

  it('mapeia os códigos novos do refresh classificado (invalido/transiente)', () => {
    // Permanente: exige re-OAuth do cliente
    expect(friendlyReportError('bling_refresh_invalido')).toContain('Reconecte');
    // Transiente: NÃO manda reconectar — só tentar de novo
    const transiente = friendlyReportError('bling_refresh_transiente');
    expect(transiente).toContain('novamente');
    expect(transiente).not.toContain('Reconecte');
  });

  it('NUNCA ecoa código desconhecido (stack/objeto técnico não vaza)', () => {
    const cru = 'TypeError: fetch failed at orchestrator.ts:42';
    const msg = friendlyReportError(cru);
    expect(msg).not.toContain('TypeError');
    expect(msg).not.toContain('orchestrator');
    expect(msg).toContain('Não foi possível concluir');
  });

  it('null usa a mensagem genérica', () => {
    expect(friendlyReportError(null)).toContain('Não foi possível concluir');
  });
});
