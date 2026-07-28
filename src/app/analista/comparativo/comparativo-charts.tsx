'use client';

import { BarChart } from '@/components/ui/charts/BarChart';
import { DonutChart } from '@/components/ui/charts/DonutChart';
import { formatBRL } from '@/lib/format';

type ChartDatum = { label: string; value: number };

export function ComparativoBarChart({ data }: { data: ChartDatum[] }) {
  return <BarChart data={data} formatValue={formatBRL} />;
}

export function ComparativoDonutChart({ data }: { data: ChartDatum[] }) {
  return <DonutChart data={data} formatValue={formatBRL} />;
}
