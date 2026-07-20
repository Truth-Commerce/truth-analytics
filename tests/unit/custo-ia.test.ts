import { describe, expect, it } from 'vitest';

import {
  custoIaDoMes,
  OPUS_INPUT_USD_PER_MTOK,
  OPUS_OUTPUT_USD_PER_MTOK,
  type ReportUsageRow,
} from '@/modules/admin/custo-ia';

const usage = (input: number, output: number, tentativas?: number) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  ...(tentativas !== undefined ? { tentativas } : {}),
});

describe('custoIaDoMes — soma das 4 fontes de uso IA (puro)', () => {
  it('soma as 4 fontes de um report da mesma org', () => {
    const rows: ReportUsageRow[] = [
      {
        orgId: 'org-1',
        iaUsage: usage(1000, 500, 1),
        kitsIaUsage: usage(200, 100, 1),
        calendarIaUsage: usage(300, 150, 1),
        briefingIaUsage: usage(400, 200, 1),
      },
    ];
    const { porOrg } = custoIaDoMes(rows);
    expect(porOrg).toHaveLength(1);
    expect(porOrg[0]).toMatchObject({
      orgId: 'org-1',
      inputTokens: 1000 + 200 + 300 + 400,
      outputTokens: 500 + 100 + 150 + 200,
      chamadas: 4,
    });
  });

  it('acumula múltiplos reports da mesma org', () => {
    const rows: ReportUsageRow[] = [
      { orgId: 'org-1', iaUsage: usage(100, 50, 1), kitsIaUsage: null, calendarIaUsage: null, briefingIaUsage: null },
      { orgId: 'org-1', iaUsage: usage(200, 100, 1), kitsIaUsage: null, calendarIaUsage: null, briefingIaUsage: null },
    ];
    const { porOrg } = custoIaDoMes(rows);
    expect(porOrg).toHaveLength(1);
    expect(porOrg[0]).toMatchObject({ inputTokens: 300, outputTokens: 150, chamadas: 2 });
  });

  it('múltiplas orgs → 1 linha por org, ordenado por custo desc', () => {
    const rows: ReportUsageRow[] = [
      { orgId: 'org-barata', iaUsage: usage(1000, 500, 1), kitsIaUsage: null, calendarIaUsage: null, briefingIaUsage: null },
      { orgId: 'org-cara', iaUsage: usage(1_000_000, 500_000, 1), kitsIaUsage: null, calendarIaUsage: null, briefingIaUsage: null },
    ];
    const { porOrg } = custoIaDoMes(rows);
    expect(porOrg.map((o) => o.orgId)).toEqual(['org-cara', 'org-barata']);
  });

  it('campos ausentes/null dentro do usage não lançam — contam 0', () => {
    const rows: ReportUsageRow[] = [
      {
        orgId: 'org-1',
        iaUsage: { input_tokens: null, output_tokens: undefined } as ReportUsageRow['iaUsage'],
        kitsIaUsage: undefined,
        calendarIaUsage: null,
        briefingIaUsage: null,
      },
    ];
    expect(() => custoIaDoMes(rows)).not.toThrow();
    const { porOrg } = custoIaDoMes(rows);
    expect(porOrg[0]).toMatchObject({ inputTokens: 0, outputTokens: 0, chamadas: 1 });
  });

  it('org com report no mês mas as 4 fontes ausentes ainda aparece, zerada', () => {
    const rows: ReportUsageRow[] = [
      { orgId: 'org-sem-ia', iaUsage: null, kitsIaUsage: null, calendarIaUsage: null, briefingIaUsage: null },
    ];
    const { porOrg } = custoIaDoMes(rows);
    expect(porOrg).toEqual([
      { orgId: 'org-sem-ia', inputTokens: 0, outputTokens: 0, chamadas: 0, custoUsd: 0 },
    ]);
  });

  it('tentativas ausente conta 1 chamada; tentativas presente conta o valor', () => {
    const rows: ReportUsageRow[] = [
      {
        orgId: 'org-1',
        iaUsage: { input_tokens: 10, output_tokens: 5 }, // sem tentativas
        kitsIaUsage: { input_tokens: 10, output_tokens: 5, tentativas: 2 }, // retentativa
        calendarIaUsage: null,
        briefingIaUsage: null,
      },
    ];
    const { porOrg } = custoIaDoMes(rows);
    expect(porOrg[0].chamadas).toBe(1 + 2);
  });

  it('custo estimado usa as constantes nomeadas do Opus ($5/$25 por Mtok)', () => {
    expect(OPUS_INPUT_USD_PER_MTOK).toBe(5);
    expect(OPUS_OUTPUT_USD_PER_MTOK).toBe(25);
    const rows: ReportUsageRow[] = [
      { orgId: 'org-1', iaUsage: usage(1_000_000, 1_000_000, 1), kitsIaUsage: null, calendarIaUsage: null, briefingIaUsage: null },
    ];
    const { porOrg, total } = custoIaDoMes(rows);
    expect(porOrg[0].custoUsd).toBeCloseTo(OPUS_INPUT_USD_PER_MTOK + OPUS_OUTPUT_USD_PER_MTOK, 2);
    expect(total.custoUsd).toBeCloseTo(30, 2);
  });

  it('total agrega tokens/chamadas/custo de todas as orgs', () => {
    const rows: ReportUsageRow[] = [
      { orgId: 'org-1', iaUsage: usage(1_000_000, 0, 1), kitsIaUsage: null, calendarIaUsage: null, briefingIaUsage: null },
      { orgId: 'org-2', iaUsage: usage(0, 1_000_000, 1), kitsIaUsage: null, calendarIaUsage: null, briefingIaUsage: null },
    ];
    const { total } = custoIaDoMes(rows);
    expect(total).toEqual({ inputTokens: 1_000_000, outputTokens: 1_000_000, chamadas: 2, custoUsd: 30 });
  });

  it('sem rows → porOrg vazio, total zerado', () => {
    expect(custoIaDoMes([])).toEqual({
      porOrg: [],
      total: { inputTokens: 0, outputTokens: 0, chamadas: 0, custoUsd: 0 },
    });
  });
});
