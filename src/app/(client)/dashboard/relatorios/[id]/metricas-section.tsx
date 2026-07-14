import React from 'react';

import { formatBRL, formatDataCurta } from '@/lib/format';
import type { Metricas } from '@/modules/pipeline/contracts';
import { compararMetricas } from '@/modules/reports/compare';
import { corDeltaPreco, deltaReceitaPorSku, posicaoPrecoView } from '@/modules/reports/report-view-model';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Stat } from '@/components/ui/Stat';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table';
import { CanalPorDiaV2, DiaSemanaV2, EvolucaoV2, ParetoV2, PrecoVsMercadoV2 } from './graficos-cliente';

/**
 * Δ% com seta. Cor padrão: subir é bom (receita). Com `bomSeNegativo` (preço
 * vs mercado) a cor inverte via corDeltaPreco: acima do mercado = vermelho.
 */
function DeltaPct({ valor, bomSeNegativo = false }: { valor: number | null; bomSeNegativo?: boolean }) {
  if (valor === null) return <span className="text-dim">—</span>;
  const positivo = valor >= 0;
  const bom = bomSeNegativo ? corDeltaPreco(valor) === 'boa' : positivo;
  return (
    <span className={`font-mono text-xs ${bom ? 'text-brand' : 'text-red-400'}`}>
      {positivo ? '▲' : '▼'} {positivo ? '+' : ''}
      {valor.toLocaleString('pt-BR')}%
    </span>
  );
}

/** Barra da faixa de mercado min→p75 com marcadores de mediana e do nosso preço. */
function FaixaBar({ faixa }: { faixa: NonNullable<ReturnType<typeof posicaoPrecoView>[number]['faixa']> }) {
  return (
    <div className="relative h-2 w-36 rounded bg-white/5" aria-hidden="true">
      <div
        className="absolute h-2 rounded bg-white/15"
        style={{ left: `${faixa.pctP25}%`, width: `${Math.max(2, faixa.pctP75 - faixa.pctP25)}%` }}
      />
      <div className="absolute top-[-2px] h-3 w-0.5 bg-white/60" style={{ left: `${faixa.pctMediana}%` }} />
      {faixa.pctNosso !== null ? (
        <div className="absolute top-[-3px] h-3.5 w-1 rounded bg-brand" style={{ left: `${faixa.pctNosso}%` }} />
      ) : null}
    </div>
  );
}

export function MetricasSection({ metricas, anterior }: { metricas: Metricas; anterior: Metricas | null }) {
  const comp = anterior ? compararMetricas(metricas, anterior) : null;
  const deltaCanal = new Map((comp?.porCanal ?? []).map((c) => [c.canal, c.delta.deltaPct]));
  const deltaSku = deltaReceitaPorSku(metricas.topProdutos, anterior?.topProdutos);
  const ticketCanal = new Map((metricas.ticketPorCanal ?? []).map((t) => [t.canal, t.ticket]));
  const posicao = posicaoPrecoView(metricas.posicaoPreco, metricas.faixaMercado);
  const linhasEvolucao: Array<{ data: string; total: number; pedidos?: number }> =
    metricas.evolucaoDetalhada ?? metricas.evolucao;

  return (
    <>
      <h2 className="font-heading text-xl font-semibold text-white">Métricas</h2>

      <div className="flex flex-wrap gap-6">
        <Card className="inline-flex">
          <Stat label="Ticket médio" value={formatBRL(metricas.ticketMedio)} />
        </Card>
        {metricas.unidadesTotais !== undefined ? (
          <Card className="inline-flex">
            <Stat label="Unidades vendidas" value={metricas.unidadesTotais} />
          </Card>
        ) : null}
        {metricas.itensPorPedido !== undefined ? (
          <Card className="inline-flex">
            <Stat label="Itens por pedido" value={metricas.itensPorPedido.toLocaleString('pt-BR')} />
          </Card>
        ) : null}
      </div>

      {metricas.benchmarkParcial && (
        <Badge variant="warn" className="flex w-fit gap-1.5">
          Benchmark de mercado parcial — dados de concorrência incompletos.
        </Badge>
      )}

      {/* Evolução: chart v2 + tabela dd/MM */}
      <Card>
        <CardHeader>
          <CardTitle as="h3" className="text-sm">Evolução das vendas</CardTitle>
        </CardHeader>
        <CardContent>
          {metricas.evolucao.length > 0 ? (
            <>
              <EvolucaoV2 atual={metricas.evolucao} anterior={anterior?.evolucao ?? null} />
              <Table>
                <THead>
                  <TR>
                    <TH>Data</TH>
                    <TH className="text-right">Total</TH>
                    {metricas.evolucaoDetalhada ? <TH className="text-right">Pedidos</TH> : null}
                  </TR>
                </THead>
                <TBody>
                  {linhasEvolucao.map((e, i) => (
                    <TR key={i}>
                      <TD className="font-mono text-sm">{formatDataCurta(e.data)}</TD>
                      <TD numeric>{formatBRL(e.total)}</TD>
                      {metricas.evolucaoDetalhada ? <TD numeric>{e.pedidos ?? ''}</TD> : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </>
          ) : (
            <p className="text-sm text-muted">Nenhuma venda registrada no período.</p>
          )}
        </CardContent>
      </Card>

      {/* Canal × dia (v2) */}
      {metricas.canalPorDia && metricas.canalPorDia.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm">Vendas por canal ao longo dos dias</CardTitle>
          </CardHeader>
          <CardContent>
            <CanalPorDiaV2 canalPorDia={metricas.canalPorDia} />
          </CardContent>
        </Card>
      ) : null}

      {/* Vendas por canal + Δ + ticket por canal */}
      <Card>
        <CardHeader>
          <CardTitle as="h3" className="text-sm">Vendas por canal</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <THead>
              <TR>
                <TH>Canal</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Pedidos</TH>
                {metricas.ticketPorCanal ? <TH className="text-right">Ticket</TH> : null}
                {comp ? <TH className="text-right">Δ vs anterior</TH> : null}
              </TR>
            </THead>
            <TBody>
              {metricas.vendasPorCanal.map((v, i) => (
                <TR key={i}>
                  <TD>{v.canal}</TD>
                  <TD numeric>{formatBRL(v.total)}</TD>
                  <TD numeric>{v.pedidos}</TD>
                  {metricas.ticketPorCanal ? (
                    <TD numeric>{ticketCanal.has(v.canal) ? formatBRL(ticketCanal.get(v.canal)!) : '—'}</TD>
                  ) : null}
                  {comp ? (
                    <TD className="text-right"><DeltaPct valor={deltaCanal.get(v.canal) ?? null} /></TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dia da semana (v2) */}
      {metricas.porDiaSemana && metricas.porDiaSemana.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm">Média de vendas por dia da semana</CardTitle>
          </CardHeader>
          <CardContent>
            <DiaSemanaV2 porDiaSemana={metricas.porDiaSemana} />
          </CardContent>
        </Card>
      ) : null}

      {/* Curva ABC (v2) + piores */}
      {metricas.curvaAbc ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm">Concentração de receita (curva ABC)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-white/90">
              <span className="font-mono font-bold text-brand">
                {Math.min(3, metricas.curvaAbc.a.length + metricas.curvaAbc.b.length + metricas.curvaAbc.c.length)} produtos
              </span>{' '}
              concentram{' '}
              <span className="font-mono font-bold text-brand">
                {metricas.curvaAbc.concentracaoTop3Pct.toLocaleString('pt-BR')}%
              </span>{' '}
              da sua receita.
            </p>
            <ParetoV2 curvaAbc={metricas.curvaAbc} />
            {metricas.piores && metricas.piores.length > 0 ? (
              <div>
                <h4 className="mb-2 text-xs uppercase tracking-wide text-muted">Menores receitas (com venda no período)</h4>
                <Table>
                  <THead>
                    <TR>
                      <TH>Produto</TH>
                      <TH>SKU</TH>
                      <TH className="text-right">Qtd.</TH>
                      <TH className="text-right">Receita</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {metricas.piores.map((p, i) => (
                      <TR key={i}>
                        <TD>{p.nome}</TD>
                        <TD className="font-mono text-sm">{p.sku}</TD>
                        <TD numeric>{p.quantidade}</TD>
                        <TD numeric>{formatBRL(p.receita)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Top produtos + Δ */}
      <Card>
        <CardHeader>
          <CardTitle as="h3" className="text-sm">Top produtos</CardTitle>
        </CardHeader>
        <CardContent>
          {metricas.topProdutos.length > 0 ? (
            <Table>
              <THead>
                <TR>
                  <TH>Nome</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Qtd.</TH>
                  <TH className="text-right">Receita</TH>
                  {anterior ? <TH className="text-right">Δ vs anterior</TH> : null}
                </TR>
              </THead>
              <TBody>
                {metricas.topProdutos.map((p, i) => (
                  <TR key={i}>
                    <TD>{p.nome}</TD>
                    <TD className="font-mono text-sm">{p.sku}</TD>
                    <TD numeric>{p.quantidade}</TD>
                    <TD numeric>{formatBRL(p.receita)}</TD>
                    {anterior ? (
                      <TD className="text-right"><DeltaPct valor={deltaSku.get(p.sku) ?? null} /></TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="text-sm text-muted">Nenhum produto vendido no período.</p>
          )}
        </CardContent>
      </Card>

      {/* Frete (v2) */}
      {metricas.frete ? (
        <Card>
          <CardHeader>
            <CardTitle as="h3" className="text-sm">Frete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-8">
              <Stat label="Frete médio por pedido" value={formatBRL(metricas.frete.freteMedio)} />
              <Stat label="Frete sobre a receita" value={`${metricas.frete.pctFreteSobreReceita.toLocaleString('pt-BR')}%`} />
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Canal</TH>
                  <TH className="text-right">Frete médio</TH>
                  <TH className="text-right">Frete total</TH>
                </TR>
              </THead>
              <TBody>
                {metricas.frete.fretePorCanal.map((f, i) => (
                  <TR key={i}>
                    <TD>{f.canal}</TD>
                    <TD numeric>{formatBRL(f.freteMedio)}</TD>
                    <TD numeric>{formatBRL(f.freteTotal)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {/* Posição de preço v2 */}
      <Card>
        <CardHeader>
          <CardTitle as="h3" className="text-sm">Posição de preço vs mercado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {posicao.length > 0 ? (
            <>
              <PrecoVsMercadoV2 posicao={metricas.posicaoPreco} />
              <Table>
                <THead>
                  <TR>
                    <TH>Produto</TH>
                    <TH className="text-right">Nosso preço</TH>
                    <TH className="text-right">Mercado (mediana)</TH>
                    <TH className="text-right">Δ vs mercado</TH>
                    <TH>Faixa de mercado</TH>
                    <TH>Fonte</TH>
                  </TR>
                </THead>
                <TBody>
                  {posicao.map((pp, i) => (
                    <TR key={i}>
                      <TD>
                        {pp.nome} <span className="font-mono text-xs text-dim">{pp.sku}</span>
                      </TD>
                      <TD numeric>
                        {pp.semVendas ? (
                          <span className="text-dim">sem vendas no período</span>
                        ) : (
                          formatBRL(pp.nossoPreco)
                        )}
                      </TD>
                      <TD numeric>{pp.precoMercadoMediano > 0 ? formatBRL(pp.precoMercadoMediano) : '—'}</TD>
                      <TD className="text-right"><DeltaPct valor={pp.deltaPct} bomSeNegativo /></TD>
                      <TD>
                        {pp.faixa ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-dim">{formatBRL(pp.faixa.min)}</span>
                            <FaixaBar faixa={pp.faixa} />
                            <span className="font-mono text-[10px] text-dim">{formatBRL(pp.faixa.p75)}</span>
                          </div>
                        ) : (
                          <span className="text-dim">—</span>
                        )}
                      </TD>
                      <TD className="text-sm text-muted">{pp.fonte}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </>
          ) : (
            <p className="text-sm text-muted">
              Nenhum produto monitorado com SKU — cadastre produtos em Conexões para acompanhar preços de mercado.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
