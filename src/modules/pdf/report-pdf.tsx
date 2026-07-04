import React from 'react';
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';

import type { AnaliseIa, Metricas } from '@/modules/pipeline/contracts';
import { PRIORIDADE_LABEL, recomendacaoCards } from '@/modules/reports/report-view-model';

import { registerPdfFonts } from './fonts';

export type ReportPdfInput = {
  orgName: string;
  periodo: string;
  geradoEm: string;
  metricas: Metricas;
  analise: AnaliseIa | null;
};

const BRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);

function buildStyles(fonts: ReturnType<typeof registerPdfFonts>) {
  return StyleSheet.create({
    page: {
      backgroundColor: '#0a0c10',
      color: '#ffffff',
      padding: 40,
      fontFamily: fonts.body,
      fontSize: 10,
    },
    kicker: {
      fontFamily: fonts.mono,
      fontSize: 8,
      color: '#07dd2b',
      letterSpacing: 2,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    wordmarkTruth: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 22, color: '#07dd2b' },
    wordmarkRest: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 22, color: '#ffffff' },
    h1: { fontFamily: fonts.heading, fontWeight: 700, fontSize: 18, marginTop: 16 },
    h2: {
      fontFamily: fonts.heading,
      fontWeight: 700,
      fontSize: 13,
      color: '#07dd2b',
      marginTop: 18,
      marginBottom: 8,
    },
    muted: { color: '#a1a1aa' },
    mono: { fontFamily: fonts.mono },
    divider: { height: 2, backgroundColor: '#07dd2b', marginTop: 12, width: 64 },
    card: {
      backgroundColor: '#0d0d10',
      borderWidth: 1,
      borderColor: '#26262b',
      borderRadius: 8,
      padding: 10,
      marginBottom: 6,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#1a1a1f' },
    tableHead: { fontFamily: fonts.mono, fontSize: 7, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1 },
    footer: {
      position: 'absolute',
      bottom: 24,
      left: 40,
      right: 40,
      flexDirection: 'row',
      justifyContent: 'space-between',
      fontSize: 7,
      color: '#a1a1aa',
    },
  });
}

export function ReportPdf({ orgName, periodo, geradoEm, metricas, analise }: ReportPdfInput) {
  const fonts = registerPdfFonts();
  const s = buildStyles(fonts);
  const cards = analise ? recomendacaoCards(analise) : [];

  return (
    <Document title={`Truth Analytics — ${orgName}`} author="Truth Commerce">
      <Page size="A4" style={s.page}>
        <Text style={s.kicker}>Análise por IA · Truth Commerce</Text>
        <Text>
          <Text style={s.wordmarkTruth}>Truth</Text>
          <Text style={s.wordmarkRest}>Analytics</Text>
        </Text>
        <Text style={s.h1}>{orgName}</Text>
        <Text style={[s.mono, s.muted, { marginTop: 4 }]}>Período: {periodo}</Text>
        <Text style={[s.muted, { fontSize: 8, marginTop: 2 }]}>Gerado em {geradoEm}</Text>
        <View style={s.divider} />

        <Text style={s.h2}>Métricas</Text>
        <View style={s.card}>
          <Text style={s.tableHead}>Ticket médio</Text>
          <Text style={[s.mono, { fontSize: 16, marginTop: 2 }]}>{BRL(metricas.ticketMedio)}</Text>
        </View>

        <Text style={s.h2}>Vendas por canal</Text>
        <View style={s.row}>
          <Text style={[s.tableHead, { width: '50%' }]}>Canal</Text>
          <Text style={[s.tableHead, { width: '25%', textAlign: 'right' }]}>Total</Text>
          <Text style={[s.tableHead, { width: '25%', textAlign: 'right' }]}>Pedidos</Text>
        </View>
        {metricas.vendasPorCanal.map((v, i) => (
          <View key={i} style={s.row}>
            <Text style={{ width: '50%' }}>{v.canal}</Text>
            <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{BRL(v.total)}</Text>
            <Text style={[s.mono, { width: '25%', textAlign: 'right' }]}>{v.pedidos}</Text>
          </View>
        ))}

        <Text style={s.h2}>Top produtos</Text>
        {metricas.topProdutos.map((pr, i) => (
          <View key={i} style={s.row}>
            <Text style={{ width: '45%' }}>{pr.nome}</Text>
            <Text style={[s.mono, s.muted, { width: '20%' }]}>{pr.sku}</Text>
            <Text style={[s.mono, { width: '15%', textAlign: 'right' }]}>{pr.quantidade}</Text>
            <Text style={[s.mono, { width: '20%', textAlign: 'right' }]}>{BRL(pr.receita)}</Text>
          </View>
        ))}

        <Text style={s.h2}>Posição de preço</Text>
        {metricas.posicaoPreco.map((pp, i) => (
          <View key={i} style={s.row}>
            <Text style={{ width: '40%' }}>{pp.nome}</Text>
            <Text style={[s.mono, { width: '20%', textAlign: 'right' }]}>{BRL(pp.nossoPreco)}</Text>
            <Text style={[s.mono, s.muted, { width: '25%', textAlign: 'right' }]}>
              mercado {BRL(pp.precoMercadoMediano)}
            </Text>
            <Text style={[s.muted, { width: '15%', textAlign: 'right' }]}>{pp.fonte}</Text>
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>truthcommerce.com.br</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
        </View>
      </Page>

      {analise ? (
        <Page size="A4" style={s.page}>
          <Text style={s.h2}>Resumo executivo</Text>
          <View style={s.card}>
            <Text style={{ lineHeight: 1.5 }}>{analise.resumoExecutivo}</Text>
          </View>

          {cards.length > 0 ? (
            <>
              <Text style={s.h2}>Recomendações</Text>
              {cards.map((c, i) => (
                <View key={i} style={s.card}>
                  <Text style={[s.tableHead, { color: c.prioridade === 'alta' ? '#f87171' : c.prioridade === 'media' ? '#fbbf24' : '#a1a1aa' }]}>
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
              {analise.recomendacoesPreco.map((r, i) => (
                <View key={i} style={s.card}>
                  <Text style={s.mono}>
                    {r.sku} · {r.nome} → {BRL(r.precoSugerido)}
                  </Text>
                  <Text style={[s.muted, { marginTop: 2, lineHeight: 1.4 }]}>{r.justificativa}</Text>
                </View>
              ))}
            </>
          ) : null}

          <View style={s.footer} fixed>
            <Text>truthcommerce.com.br</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber}/${totalPages}`} />
          </View>
        </Page>
      ) : null}
    </Document>
  );
}

export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  return renderToBuffer(<ReportPdf {...input} />);
}
