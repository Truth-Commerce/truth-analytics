import React from 'react';
import Link from 'next/link';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { formatBRL } from '@/lib/format';
import { posicaoPrecoResumo, topProdutosDashboard } from '@/modules/reports/dashboard-model';
import type { ReportDetail } from '@/modules/reports/report.types';

/** Bento do último relatório: top produtos, posição de preço e resumo em 2 linhas. */
export function BentoCards({ latestDone }: { latestDone: ReportDetail | null }) {
  if (!latestDone?.metricas) return null;
  const top = topProdutosDashboard(latestDone.metricas);
  const posicao = posicaoPrecoResumo(latestDone.metricas);
  const resumo = latestDone.analiseIa?.resumoExecutivo ?? null;
  if (top.length === 0 && !posicao && !resumo) return null;
  const base = `/dashboard/relatorios/${latestDone.id}`;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {top.length > 0 ? (
        <Card data-testid="card-top-produtos">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Top produtos por receita</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {top.map((p, i) => (
                <li
                  key={p.sku || `${p.nome}-${i}`}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate text-white/90">
                    <span className="font-mono text-xs text-dim">{i + 1}.</span> {p.nome}
                  </span>
                  <span className="shrink-0 font-mono text-muted">{formatBRL(p.receita)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {posicao ? (
        <Card data-testid="card-posicao-preco">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Posição de preço</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-mono text-lg font-bold text-white">{posicao.leitura}</p>
            <p className="text-xs text-dim">{posicao.total} produto(s) comparados com o mercado.</p>
            <Link href={`${base}#metricas`} className="text-sm text-brand hover:underline">
              Ver comparação →
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {resumo ? (
        <Card data-testid="card-resumo">
          <CardHeader>
            <CardTitle as="h2" className="text-base">Resumo executivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p
              className="text-sm leading-relaxed text-muted"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {resumo}
            </p>
            <Link href={`${base}#resumo`} className="text-sm text-brand hover:underline">
              Ler análise →
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
