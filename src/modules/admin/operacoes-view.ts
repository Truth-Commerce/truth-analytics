import type { CronHeartbeatRecord } from '@/db/schema';

/**
 * Frescor dos crons (H4 T10) — módulo PURO (zero I/O), testável em node.
 * Cada rota registrada via `registrarHeartbeat` (heartbeat.repository.ts,
 * T9) tem uma cadência esperada (mapa abaixo, ver .github/workflows/crons.yml
 * para os horários reais); o badge de frescor compara `executado_em` contra
 * `agora` com uma margem de TOLERÂNCIA sobre essa cadência — absorve atraso
 * normal de fila/infra do runner de cron sem virar falso "atrasado". Rota
 * sem heartbeat nenhum (nunca rodou) também é 'atrasado'.
 *
 * digest-semanal tem cadência SEMANAL (não diária) — teria ficado
 * incorretamente "atrasado" em 6 dos 7 dias da semana sob um limiar único de
 * ~26h; por isso o mapa é por rota, não um único threshold global.
 */

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

export type TipoCadencia = 'bihorario' | 'diario' | 'semanal' | 'watchdog';

/** Tolerância = cadência esperada + margem de segurança (nunca é a cadência crua). */
const TOLERANCIA_DIARIA_MS = 26 * HORA_MS; // esperado 24h + 2h de margem
const TOLERANCIA_SEMANAL_MS = 8 * DIA_MS; // esperado 7 dias + 1 dia de margem
const TOLERANCIA_WATCHDOG_MS = 40 * MINUTO_MS; // esperado 30min + 10min de margem
const TOLERANCIA_BIHORARIA_MS = 150 * MINUTO_MS; // esperado 2h + 30min de margem

type CadenciaRota = { tipo: TipoCadencia; toleranciaMs: number; label: string };

/** As 6 rotas que chamam `registrarHeartbeat` hoje (api/cron/*\/route.ts). */
export const CADENCIA_POR_ROTA: Record<string, CadenciaRota> = {
  'renovar-conexoes': {
    tipo: 'bihorario',
    toleranciaMs: TOLERANCIA_BIHORARIA_MS,
    label: 'Renovar conexões Olist (a cada 2h)',
  },
  'sincronizar-pedidos': {
    tipo: 'diario',
    toleranciaMs: TOLERANCIA_DIARIA_MS,
    label: 'Sincronizar pedidos (diário, 7h)',
  },
  'sincronizar-estoque': {
    tipo: 'diario',
    toleranciaMs: TOLERANCIA_DIARIA_MS,
    label: 'Sincronizar estoque (diário, 7h30)',
  },
  'gerar-relatorios': {
    tipo: 'diario',
    toleranciaMs: TOLERANCIA_DIARIA_MS,
    label: 'Gerar relatórios (diário, 9h)',
  },
  'verificar-alertas': {
    tipo: 'diario',
    toleranciaMs: TOLERANCIA_DIARIA_MS,
    label: 'Verificar alertas (diário, 9h30)',
  },
  'digest-semanal': {
    tipo: 'semanal',
    toleranciaMs: TOLERANCIA_SEMANAL_MS,
    label: 'Digest semanal (2ª-feira, 9h)',
  },
  watchdog: {
    tipo: 'watchdog',
    toleranciaMs: TOLERANCIA_WATCHDOG_MS,
    label: 'Watchdog (a cada 30min)',
  },
};

export type FrescorBadge = 'ok' | 'atrasado';

export type CronStatusView = {
  rota: string;
  label: string;
  tipo: TipoCadencia;
  executadoEm: Date | null;
  /** `ok` cru do último heartbeat (sucesso/falha da execução) — independente do badge de frescor, que é só sobre tempo. */
  ok: boolean | null;
  badge: FrescorBadge;
  detalhes: Record<string, unknown> | null;
};

/**
 * Status de TODAS as rotas do mapa — mesmo as que nunca rodaram (aparecem
 * como 'atrasado' com executadoEm/ok null). Heartbeats de rotas fora do mapa
 * (ex.: teste/legado) são ignorados, nunca lançam.
 */
export function statusDosCrons(
  heartbeats: CronHeartbeatRecord[],
  agora: Date = new Date(),
): CronStatusView[] {
  const porRota = new Map(heartbeats.map((h) => [h.rota, h]));
  return Object.entries(CADENCIA_POR_ROTA).map(([rota, cadencia]) => {
    const heartbeat = porRota.get(rota);
    const fresco = heartbeat
      ? agora.getTime() - heartbeat.executado_em.getTime() <= cadencia.toleranciaMs
      : false;
    return {
      rota,
      label: cadencia.label,
      tipo: cadencia.tipo,
      executadoEm: heartbeat?.executado_em ?? null,
      ok: heartbeat?.ok ?? null,
      badge: fresco ? 'ok' : 'atrasado',
      detalhes: (heartbeat?.detalhes as Record<string, unknown> | undefined) ?? null,
    };
  });
}

/**
 * Dias até uma data futura (negativo = já passou); null se não houver data.
 * Arredonda para cima — 1h restante ainda conta como "1 dia" (mais cauteloso
 * para alerta de expiração do que arredondar para baixo).
 */
export function diasAteExpirar(expiraEm: Date | null, agora: Date = new Date()): number | null {
  if (!expiraEm) return null;
  return Math.ceil((expiraEm.getTime() - agora.getTime()) / DIA_MS);
}
