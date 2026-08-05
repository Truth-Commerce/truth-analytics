import { describe, expect, it } from 'vitest';

import {
  manualReportPeriod,
  parseReportPeriodDays,
  REPORT_PERIOD_DAYS,
} from '@/modules/reports/manual-report-period';

describe('período manual do relatório', () => {
  it('aceita exatamente as seis janelas públicas', () => {
    expect(REPORT_PERIOD_DAYS).toEqual([7, 14, 30, 60, 90, 180]);
    for (const days of REPORT_PERIOD_DAYS) {
      expect(parseReportPeriodDays(String(days))).toBe(days);
    }
  });

  it.each(['', '0', '15', '30.5', '181', 'abc', null])(
    'recusa valor adulterado %s',
    (value) => {
      expect(parseReportPeriodDays(value)).toBeNull();
    },
  );

  it('180 dias terminam ontem e contêm exatamente 180 dias fechados', () => {
    expect(manualReportPeriod(180, new Date('2026-08-05T15:00:00Z'))).toEqual({
      inicio: new Date('2026-02-06T00:00:00.000Z'),
      fim: new Date('2026-08-04T23:59:59.999Z'),
    });
  });
});
