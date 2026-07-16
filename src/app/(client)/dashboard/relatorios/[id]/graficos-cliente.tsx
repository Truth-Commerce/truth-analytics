'use client';

import React from 'react';

import { formatBRL, formatBRLCompacto } from '@/lib/format';
import {
  divergingPrecoModel,
  evolucaoComparadaModel,
  paretoModel,
  stackedAreaModel,
} from '@/components/ui/charts/chart-models';
import { DivergingBarChart } from '@/components/ui/charts/DivergingBarChart';
import { EvolucaoComparadaChart } from '@/components/ui/charts/EvolucaoComparadaChart';
import { ParetoChart } from '@/components/ui/charts/ParetoChart';
import { StackedAreaChart } from '@/components/ui/charts/StackedAreaChart';
import { WeekdayBarChart } from '@/components/ui/charts/WeekdayBarChart';

type Dia = { data: string; total: number };

export function EvolucaoV2({ atual, anterior }: { atual: Dia[]; anterior: Dia[] | null }) {
  const data = evolucaoComparadaModel(atual, anterior);
  return (
    <EvolucaoComparadaChart
      data={data}
      formatY={formatBRLCompacto}
      temAnterior={anterior !== null && anterior.length > 0}
      srSummary={`Evolução diária de vendas com média móvel de 7 dias${anterior ? ' e comparação com o período anterior' : ''}: ${data.map((d) => `${d.x}: ${formatBRL(d.atual)}`).join('; ')}`}
    />
  );
}

export function CanalPorDiaV2({ canalPorDia }: { canalPorDia: { data: string; canais: Record<string, number> }[] }) {
  const { keys, rows } = stackedAreaModel(canalPorDia);
  return (
    <StackedAreaChart
      keys={keys}
      rows={rows}
      formatY={formatBRLCompacto}
      srSummary={`Vendas por canal ao longo dos dias. Canais: ${keys.join(', ')}.`}
    />
  );
}

type AbcItem = { sku: string; nome: string; receita: number; pctAcumulado: number };

export function ParetoV2({ curvaAbc }: { curvaAbc: { a: AbcItem[]; b: AbcItem[]; c: AbcItem[]; concentracaoTop3Pct: number } }) {
  const data = paretoModel(curvaAbc);
  return (
    <ParetoChart
      data={data}
      formatReceita={formatBRLCompacto}
      srSummary={`Curva ABC de produtos por receita: ${data.map((d) => `${d.label} ${formatBRL(d.receita)} (${d.acumulado}% acumulado)`).join('; ')}`}
    />
  );
}

export function DiaSemanaV2({ porDiaSemana }: { porDiaSemana: { label: string; mediaVendas: number }[] }) {
  const data = porDiaSemana.map((d) => ({ label: d.label, value: d.mediaVendas }));
  return (
    <WeekdayBarChart
      data={data}
      formatValue={formatBRLCompacto}
      srSummary={`Média de vendas por dia da semana: ${data.map((d) => `${d.label}: ${formatBRL(d.value)}`).join('; ')}`}
    />
  );
}

export function PrecoVsMercadoV2({ posicao }: { posicao: { sku: string; nome: string; nossoPreco: number; precoMercadoMediano: number }[] }) {
  const data = divergingPrecoModel(posicao);
  if (data.length === 0) return null;
  return (
    <DivergingBarChart
      data={data}
      srSummary={`Diferença percentual do nosso preço em relação à mediana de mercado por produto: ${data.map((d) => `${d.label}: ${d.deltaPct}%`).join('; ')}`}
    />
  );
}
