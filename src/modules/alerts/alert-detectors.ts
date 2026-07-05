import type { Metricas } from '@/modules/pipeline/contracts';
import {
  CONCORRENTE_CRITICO_PCT,
  CONCORRENTE_MARGEM_MINIMA,
  PRODUTO_PARADO_DIAS,
  QUEDA_BASE_MINIMA_SEMANAL,
  QUEDA_VENDAS_CRITICO,
  QUEDA_VENDAS_LIMIAR,
} from './alerts.constants';

export type TipoAlerta = 'queda_vendas' | 'concorrente_preco' | 'produto_parado';
export type SeveridadeAlerta = 'atencao' | 'critico';

export type AlertaCandidato = {
  tipo: TipoAlerta;
  severidade: SeveridadeAlerta;
  titulo: string;
  corpo: string;
  dados: Record<string, unknown>;
  /** Identidade p/ dedup contra alertas abertos (fica em dados.chave_dedup). */
  chaveDedup: string;
};

function brl(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

/** (a) Queda de vendas: total 7d vs média das 4 semanas anteriores. Pura. */
export function detectarQuedaVendas(input: {
  total7dias: number;
  totaisSemanasAnteriores: number[]; // 4 entradas (semana -2, -3, -4, -5)
}): AlertaCandidato | null {
  if (input.totaisSemanasAnteriores.length < 4) return null;
  const media =
    input.totaisSemanasAnteriores.reduce((a, b) => a + b, 0) / input.totaisSemanasAnteriores.length;
  if (media < QUEDA_BASE_MINIMA_SEMANAL) return null;
  const razao = input.total7dias / media;
  if (razao >= QUEDA_VENDAS_LIMIAR) return null;
  const quedaPct = Math.round((1 - razao) * 100);
  return {
    tipo: 'queda_vendas',
    severidade: razao < QUEDA_VENDAS_CRITICO ? 'critico' : 'atencao',
    titulo: `Queda de vendas de ${quedaPct}% na última semana`,
    corpo: `Os últimos 7 dias somaram ${brl(input.total7dias)} — ${quedaPct}% abaixo da média semanal das 4 semanas anteriores (${brl(media)}).`,
    dados: {
      total7dias: input.total7dias,
      mediaSemanal: Math.round(media * 100) / 100,
      quedaPercentual: quedaPct,
    },
    chaveDedup: 'queda_vendas',
  };
}

/** (b) Concorrente abaixo do preço: mediana do mercado ≥5% abaixo do nosso. Pura. */
export function detectarConcorrenteAbaixo(
  posicaoPreco: Metricas['posicaoPreco'],
): AlertaCandidato[] {
  return posicaoPreco
    .filter(
      (p) =>
        p.nossoPreco > 0 &&
        p.precoMercadoMediano > 0 &&
        p.precoMercadoMediano < p.nossoPreco * (1 - CONCORRENTE_MARGEM_MINIMA),
    )
    .map((p) => {
      const diffPct = Math.round((1 - p.precoMercadoMediano / p.nossoPreco) * 100);
      return {
        tipo: 'concorrente_preco' as const,
        severidade: (diffPct >= CONCORRENTE_CRITICO_PCT ? 'critico' : 'atencao') as SeveridadeAlerta,
        titulo: `Mercado ${diffPct}% abaixo do seu preço em ${p.nome}`,
        corpo: `A mediana de mercado de ${p.nome} (${p.sku}) está em ${brl(p.precoMercadoMediano)}, ${diffPct}% abaixo do seu preço médio (${brl(p.nossoPreco)}). Fonte: ${p.fonte}.`,
        dados: {
          sku: p.sku,
          nossoPreco: p.nossoPreco,
          precoMercadoMediano: p.precoMercadoMediano,
          diferencaPercentual: diffPct,
          fonte: p.fonte,
        },
        chaveDedup: `concorrente_preco:${p.sku}`,
      };
    });
}

/** (c) Produto monitorado sem venda há 14+ dias (mas que já vendeu na janela histórica). Pura. */
export function detectarProdutoParado(
  produtos: { sku: string; nome: string }[],
  ultimaVendaPorSku: Map<string, Date>,
  agora: Date,
): AlertaCandidato[] {
  const out: AlertaCandidato[] = [];
  for (const p of produtos) {
    const ultima = ultimaVendaPorSku.get(p.sku);
    if (!ultima) continue; // nunca vendeu na janela histórica → não é "parado"
    const dias = Math.floor((agora.getTime() - ultima.getTime()) / 86_400_000);
    if (dias < PRODUTO_PARADO_DIAS) continue;
    out.push({
      tipo: 'produto_parado',
      severidade: 'atencao',
      titulo: `${p.nome} está há ${dias} dias sem vender`,
      corpo: `O produto monitorado ${p.nome} (${p.sku}) não registra vendas desde ${ultima.toISOString().slice(0, 10)} (${dias} dias).`,
      dados: { sku: p.sku, diasSemVenda: dias, ultimaVenda: ultima.toISOString() },
      chaveDedup: `produto_parado:${p.sku}`,
    });
  }
  return out;
}

/** Dedup puro: descarta candidato cujo tipo+chaveDedup já tem alerta ABERTO. */
export function filtrarNaoDuplicados(
  candidatos: AlertaCandidato[],
  abertos: { tipo: string; chaveDedup: string }[],
): AlertaCandidato[] {
  const chaves = new Set(abertos.map((a) => `${a.tipo}|${a.chaveDedup}`));
  return candidatos.filter((c) => !chaves.has(`${c.tipo}|${c.chaveDedup}`));
}
