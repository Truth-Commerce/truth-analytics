import { janelaDiasFechados } from '@/lib/timezone';

export const REPORT_PERIOD_DAYS = [7, 14, 30, 60, 90, 180] as const;

export type ReportPeriodDays = (typeof REPORT_PERIOD_DAYS)[number];

export function parseReportPeriodDays(value: unknown): ReportPeriodDays | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const days = Number(value);
  return REPORT_PERIOD_DAYS.includes(days as ReportPeriodDays)
    ? (days as ReportPeriodDays)
    : null;
}

export function manualReportPeriod(days: ReportPeriodDays, now: Date = new Date()) {
  return janelaDiasFechados(days, now);
}
