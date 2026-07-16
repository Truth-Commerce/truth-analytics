import React from 'react';
import { Document, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { deltaNumero, totalPedidos, totalVendas } from '@/modules/reports/compare';
import { PRIORIDADE_LABEL, ordenarAchados, recomendacaoCards } from '@/modules/reports/report-view-model';

import { GAUGE_INICIO, anguloDoScore, arcoPath, barrasEvolucao } from './pdf-gauge';
import { registerPdfFonts } from './fonts';

export type ReportPdfInput = {
  orgName: string;
  periodo: string;
  geradoEm: string;
  metricas: Metricas;
  analise: AnaliseIa | null;
  analistaEmail: string | null; // NOVO
};

const BRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const BRL0 = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(n);

// Paleta: capa dark, miolo claro imprimível (verde escurecido p/ contraste em branco).
const VERDE_CAPA = '#07dd2b';
const VERDE = '#0aa626';
const VERMELHO = '#dc2626';
const TEXTO = '#111318';
const MUTED = '#5b5b66';
const BORDA = '#e4e4e9';

const FATOR_ORDEM = ['crescimento', 'posicaoPreco', 'diversificacao', 'regularidade', 'cobertura'] as const;
const FATOR_LABEL: Record<(typeof FATOR_ORDEM)[number], string> = {
  crescimento: 'Crescimento',
  posicaoPreco: 'Posição de preço',
  diversificacao: 'Diversificação de canais',
  regularidade: 'Regularidade de vendas',
  cobertura: 'Cobertura de benchmark',
};

const TIPO_LABEL: Record<string, string> = {
  preco: 'Preço',
  anuncio: 'Anúncio',
  logistica: 'Logística',
  catalogo: 'Catálogo',
  conta: 'Conta',
  outro: 'Geral',
};

/** Δ% formatado para o resumo: `▲ +12,2% vs período anterior`. */
function deltaTexto(pct: number): { texto: string; positivo: boolean } {
  const positivo = pct >= 0;
  const abs = Math.abs(pct).toFixed(1).replace('.', ',');
  return { texto: `${positivo ? '▲ +' : '▼ -'}${abs}% vs período anterior`, positivo };
}

function buildStyles(fonts: ReturnType<typeof registerPdfFonts>) {
  return StyleSheet.create({
    // ---- Capa (dark) ----
    capa: {
      backgroundColor: '#0a0c10',
      color: '#ffffff',
      padding: 48,
      fontFamily: fonts.body,
      fontSize: 10,
    },
    kicker: {
      fontFamily: fonts.mono,
      fontSize: 8,
      color: VERDE_CAPA,
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    wordmarkTruth: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 24, color: VERDE_CAPA },
    wordmarkRest: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 24, color: '#ffffff' },
    capaOrg: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 28, marginTop: 40 },
    capaMono: { fontFamily: fonts.mono, color: '#a1a1aa', marginTop: 8 },
    capaMuted: { color: '#a1a1aa', fontSize: 8, marginTop: 3 },
    divider: { height: 2, backgroundColor: VERDE_CAPA, marginTop: 16, width: 72 },
    capaFooter: {
      position: 'absolute',
      bottom: 28,
      left: 48,
      right: 48,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: '#71717a',
    },

    // ---- Miolo (claro, imprimível) ----
    page: {
      backgroundColor: '#ffffff',
      color: TEXTO,
      padding: 40,
      paddingBottom: 56,
      fontFamily: fonts.body,
      fontSize: 10,
    },
    h2: {
      fontFamily: fonts.heading,
      fontWeight: 700,
      fontSize: 13,
      color: TEXTO,
      marginTop: 18,
      marginBottom: 8,
    },
    accentRule: { width: 28, height: 2, backgroundColor: VERDE, marginBottom: 10 },
    muted: { color: MUTED },
    mono: { fontFamily: fonts.mono },
    // Resumo em 3 números
    kpiRow: { flexDirection: 'row', marginBottom: 4 },
    kpi: {
      flex: 1,
      borderWidth: 1,
      borderColor: BORDA,
      borderRadius: 8,
      padding: 12,
      marginRight: 8,
    },
    kpiLabel: { fontFamily: fonts.mono, fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 },
    kpiValor: { fontFamily: fonts.mono, fontSize: 18, marginTop: 4, color: TEXTO },
    kpiDelta: { fontSize: 8, marginTop: 4 },
    // Mini-evolução
    barsRow: { flexDirection: 'row', alignItems: 'flex-end', height: 60, marginTop: 4 },
    bar: { flex: 1, marginHorizontal: 0.6, backgroundColor: VERDE, borderRadius: 1 },
    barsLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    // Breakdown score
    fatorRow: { marginBottom: 7 },
    fatorHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
    track: { height: 6, backgroundColor: '#eef0f2', borderRadius: 3 },
    // Cards / tabelas
    card: {
      borderWidth: 1,
      borderColor: BORDA,
      borderRadius: 8,
      padding: 10,
      marginBottom: 6,
    },
    badge: { fontFamily: fonts.mono, fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 },
    impacto: { fontFamily: fonts.mono, fontSize: 9, color: VERDE, marginTop: 3 },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 3,
      borderBottomWidth: 1,
      borderBottomColor: BORDA,
    },
    tableHead: { fontFamily: fonts.mono, fontSize: 7, color: MUTED, textTransform: 'uppercase', letterSpacing: 1 },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 40,
      right: 40,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: MUTED,
    },
  });
}

/** ScoreGauge nativo em SVG (@react-pdf) — 270° como o gauge da UI. */
function GaugePdf({ score }: { score: number }) {
  const cor = score >= 70 ? '#07dd2b' : score >= 40 ? '#eab308' : '#ef4444';
  return (
    <View style={{ width: 140, height: 140, position: 'relative', marginTop: 32 }}>
      <Svg width={140} height={140} viewBox="0 0 140 140">
        <Path
          d={arcoPath(70, 70, 58, GAUGE_INICIO, 135)}
          stroke="#ffffff18"
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />
        <Path
          d={arcoPath(70, 70, 58, GAUGE_INICIO, anguloDoScore(score))}
          stroke={cor}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 140,
          height: 140,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 30, color: '#ffffff' }}>{score}</Text>
        <Text style={{ fontSize: 8, color: '#a1a1aa' }}>/ 100 · Truth Score</Text>
      </View>
    </View>
  );
}

function Rodape({
  style,
  analistaEmail,
}: {
  style: ReturnType<typeof buildStyles>['footer'];
  analistaEmail: string | null;
}) {
  return (
    <View style={style} fixed>
      <Text>truthcommerce.com.br</Text>
      <Text>Analista responsável: {analistaEmail ?? '—'}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
    </View>
  );
}

export function ReportPdf({ orgName, periodo, geradoEm, metricas, analise, analistaEmail }: ReportPdfInput) {
  const fonts = registerPdfFonts();
  const s = buildStyles(fonts);
  const ts = metricas.truth_score;

  const total = totalVendas(metricas);
  const totalDelta =
    ts && ts.totalPeriodoAnterior !== null && ts.totalPeriodoAnterior !== 0
      ? deltaNumero(total, ts.totalPeriodoAnterior).deltaPct
      : null;
  const bars = barrasEvolucao(metricas.evolucao);

  const achados = analise?.achados && analise.achados.length > 0 ? ordenarAchados(analise.achados).slice(0, 3) : [];
  const cards = analise && achados.length === 0 ? recomendacaoCards(analise).slice(0, 6) : [];

  return (
    <Document title={`Truth Analytics — ${orgName}`} author="Truth Commerce">
      {/* Página 1 — capa (dark) */}
      <Page size="A4" style={s.capa}>
        <Text style={s.kicker}>Análise por IA · Truth Commerce</Text>
        <Text>
          <Text style={s.wordmarkTruth}>Truth</Text>
          <Text style={s.wordmarkRest}>Analytics</Text>
        </Text>
        <View style={s.divider} />

        <Text style={s.capaOrg}>{orgName}</Text>
        <Text style={s.capaMono}>Período: {periodo}</Text>
        <Text style={s.capaMuted}>Gerado em {geradoEm}</Text>

        {ts ? <GaugePdf score={ts.score} /> : null}

        <View style={s.capaFooter} fixed>
          <Text>truthcommerce.com.br</Text>
          <Text>Analista responsável: {analistaEmail ?? '—'}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>

      {/* Página 2 — resumo em 3 números + evolução + score + métricas (miolo claro) */}
      <Page size="A4" style={s.page}>
        <Text style={s.h2}>Resumo em 3 números</Text>
        <View style={s.accentRule} />
        <View style={s.kpiRow}>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Total do período</Text>
            <Text style={s.kpiValor}>{BRL(total)}</Text>
            {totalDelta !== null ? (
              <Text style={[s.kpiDelta, { color: deltaTexto(totalDelta).positivo ? VERDE : VERMELHO }]}>
                {deltaTexto(totalDelta).texto}
              </Text>
            ) : (
              <Text style={[s.kpiDelta, s.muted]}>sem base de comparação</Text>
            )}
          </View>
          <View style={s.kpi}>
            <Text style={s.kpiLabel}>Pedidos</Text>
            <Text style={s.kpiValor}>{totalPedidos(metricas)}</Text>
          </View>
          <View style={[s.kpi, { marginRight: 0 }]}>
            <Text style={s.kpiLabel}>Ticket médio</Text>
            <Text style={s.kpiValor}>{BRL(metricas.ticketMedio)}</Text>
          </View>
        </View>

        {bars.length > 0 ? (
          <>
            <Text style={s.h2}>Evolução de vendas</Text>
            <View style={s.accentRule} />
            <View style={s.barsRow}>
              {bars.map((b, i) => (
                <View key={i} style={[s.bar, { height: `${b.pct}%` }]} />
              ))}
            </View>
            <View style={s.barsLabels}>
              <Text style={[s.mono, s.muted, { fontSize: 7 }]}>{bars[0].label}</Text>
              <Text style={[s.mono, s.muted, { fontSize: 7 }]}>{bars[bars.length - 1].label}</Text>
            </View>
          </>
        ) : null}

        {ts ? (
          <>
            <Text style={s.h2}>Composição do Truth Score</Text>
            <View style={s.accentRule} />
            {FATOR_ORDEM.map((k) => {
              const f = ts.fatores[k];
              const pct = f.max > 0 ? Math.min(100, Math.round((f.pontos / f.max) * 100)) : 0;
              return (
                <View key={k} style={s.fatorRow} wrap={false}>
                  <View style={s.fatorHead}>
                    <Text>{FATOR_LABEL[k]}</Text>
                    <Text style={s.mono}>
                      {Math.round(f.pontos)}/{Math.round(f.max)}
                    </Text>
                  </View>
                  <View style={s.track}>
                    <View style={{ height: 6, width: `${pct}%`, backgroundColor: VERDE, borderRadius: 3 }} />
                  </View>
                </View>
              );
            })}
          </>
        ) : null}

        <Text style={s.h2}>Vendas por canal</Text>
        <View style={s.accentRule} />
        <View style={s.row}>
          <Text style={[s.tableHead, { width: '50%' }]}>Canal</Text>
          <Text style={[s.tableHead, { width: '25%', textAlign: 'right' }]}>Total</Text>
          <Text style={[s.tableHead, { width: '25%', textAlign: 'right' }]}>Pedidos</Text>
        </View>
        {metricas.vendasPorCanal.map((v, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={{ width: '50%' }}>{v.canal}</Text>
            <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{BRL(v.total)}</Text>
            <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{v.pedidos}</Text>
          </View>
        ))}

        <Text style={s.h2}>Top produtos</Text>
        <View style={s.accentRule} />
        {metricas.topProdutos.map((pr, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={{ width: '45%' }}>{pr.nome}</Text>
            <Text style={[s.mono, s.muted, { width: '20%' }]}>{pr.sku}</Text>
            <Text style={[s.mono, { width: '15%', textAlign: 'right' }]}>{pr.quantidade}</Text>
            <Text style={[s.mono, { width: '20%', textAlign: 'right' }]}>{BRL(pr.receita)}</Text>
          </View>
        ))}

        <Text style={s.h2}>Posição de preço</Text>
        <View style={s.accentRule} />
        {metricas.posicaoPreco.map((pp, i) => (
          <View key={i} style={s.row} wrap={false}>
            <Text style={{ width: '40%' }}>{pp.nome}</Text>
            <Text style={[s.mono, { width: '20%', textAlign: 'right' }]}>{BRL(pp.nossoPreco)}</Text>
            <Text style={[s.mono, s.muted, { width: '25%', textAlign: 'right' }]}>
              mercado {BRL(pp.precoMercadoMediano)}
            </Text>
            <Text style={[s.muted, { width: '15%', textAlign: 'right' }]}>{pp.fonte}</Text>
          </View>
        ))}

        <Rodape style={s.footer} analistaEmail={analistaEmail} />
      </Page>

      {/* Página 3 — análise (miolo claro) */}
      {analise ? (
        <Page size="A4" style={s.page}>
          <Text style={s.h2}>Resumo executivo</Text>
          <View style={s.accentRule} />
          <View style={s.card}>
            <Text style={{ lineHeight: 1.5 }}>{analise.resumoExecutivo}</Text>
          </View>

          {achados.length > 0 ? (
            <>
              <Text style={s.h2}>Principais achados</Text>
              <View style={s.accentRule} />
              {achados.map(({ achado }, i) => (
                <View key={i} style={s.card} wrap={false}>
                  <Text style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 11 }}>{achado.titulo}</Text>
                  <Text style={s.badge}>
                    Prioridade {PRIORIDADE_LABEL[achado.prioridade]} · {TIPO_LABEL[achado.tipo] ?? achado.tipo}
                  </Text>
                  {achado.impactoEstimadoMensalBRL !== null ? (
                    <Text style={s.impacto}>+ {BRL0(achado.impactoEstimadoMensalBRL)}/mês</Text>
                  ) : null}
                  {achado.descricao ? (
                    <Text style={{ marginTop: 4, lineHeight: 1.4 }}>{achado.descricao}</Text>
                  ) : null}
                  {achado.comoFazer.map((passo, j) => (
                    <Text key={j} style={[s.muted, { marginTop: 2, lineHeight: 1.4 }]}>
                      {j + 1}. {passo}
                    </Text>
                  ))}
                </View>
              ))}
            </>
          ) : cards.length > 0 ? (
            <>
              <Text style={s.h2}>Recomendações</Text>
              <View style={s.accentRule} />
              {cards.map((c, i) => (
                <View key={i} style={s.card} wrap={false}>
                  <Text
                    style={[
                      s.badge,
                      { color: c.prioridade === 'alta' ? VERMELHO : c.prioridade === 'media' ? '#b45309' : MUTED },
                    ]}
                  >
                    Prioridade {PRIORIDADE_LABEL[c.prioridade]}
                  </Text>
                  <Text style={{ marginTop: 3, lineHeight: 1.4 }}>{c.texto}</Text>
                </View>
              ))}
            </>
          ) : null}

          {analise.recomendacoesPreco.length > 0 ? (
            <>
              <Text style={s.h2}>Preços sugeridos</Text>
              <View style={s.accentRule} />
              {analise.recomendacoesPreco.map((r, i) => (
                <View key={i} style={s.card} wrap={false}>
                  <Text style={s.mono}>
                    {r.sku} · {r.nome}
                    {r.precoAtual !== undefined ? ` · ${BRL(r.precoAtual)} → ` : ' → '}
                    <Text style={{ color: VERDE }}>{BRL(r.precoSugerido)}</Text>
                  </Text>
                  <Text style={[s.muted, { marginTop: 2, lineHeight: 1.4 }]}>{r.justificativa}</Text>
                </View>
              ))}
            </>
          ) : null}

          <Rodape style={s.footer} analistaEmail={analistaEmail} />
        </Page>
      ) : null}
    </Document>
  );
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return renderToBuffer(<ReportPdf {...input} />);
}
