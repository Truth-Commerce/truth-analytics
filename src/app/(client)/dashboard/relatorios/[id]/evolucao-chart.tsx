'use client';

import React from 'react';

import { formatBRL } from '@/lib/format';
import { LineChart, type XY } from '@/components/ui/charts/LineChart';

/**
 * Wrapper client do LineChart de evolução: importa formatBRL no lado do
 * cliente (funções não são serializáveis Server → Client Component).
 */
export function EvolucaoChart({ data }: { data: XY[] }) {
  return <LineChart data={data} formatY={formatBRL} />;
}
