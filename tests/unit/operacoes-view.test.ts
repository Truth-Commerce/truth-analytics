import { describe, expect, it } from 'vitest';

import {
  CADENCIA_POR_ROTA,
  diasAteExpirar,
  statusDosCrons,
} from '@/modules/admin/operacoes-view';
import type { CronHeartbeatRecord } from '@/db/schema';

const AGORA = new Date('2026-07-20T12:00:00.000Z');
const HORA_MS = 60 * 60 * 1000;
const MINUTO_MS = 60 * 1000;
const DIA_MS = 24 * HORA_MS;

function hb(rota: string, horasAtras: number, overrides: Partial<CronHeartbeatRecord> = {}): CronHeartbeatRecord {
  return {
    rota,
    executado_em: new Date(AGORA.getTime() - horasAtras * HORA_MS),
    ok: true,
    detalhes: {},
    ...overrides,
  };
}

describe('CADENCIA_POR_ROTA — mapa de cadência conhece as 8 rotas registradas', () => {
  it('tem as 5 rotas diárias/semanal + watchdog + duas rotas Olist biorárias', () => {
    expect(Object.keys(CADENCIA_POR_ROTA).sort()).toEqual(
      [
        'preparar-olist',
        'sincronizar-pedidos',
        'sincronizar-estoque',
        'gerar-relatorios',
        'verificar-alertas',
        'digest-semanal',
        'watchdog',
        'renovar-conexoes',
      ].sort(),
    );
  });

  it('renovar-conexoes usa cadência biorária com tolerância de 150 minutos', () => {
    expect(CADENCIA_POR_ROTA['renovar-conexoes']).toMatchObject({
      tipo: 'bihorario',
      toleranciaMs: 150 * MINUTO_MS,
    });
  });

  it('preparar-olist usa cadência biorária, tolerância de 150 minutos e label específico', () => {
    expect(CADENCIA_POR_ROTA['preparar-olist']).toEqual({
      tipo: 'bihorario',
      toleranciaMs: 150 * MINUTO_MS,
      label: 'Preparar Olist shadow (a cada 2h)',
    });
  });
});

describe('statusDosCrons — frescor por rota (puro)', () => {
  it('rota diária executada há 10h → ok', () => {
    const [status] = statusDosCrons([hb('sincronizar-pedidos', 10)], AGORA).filter(
      (s) => s.rota === 'sincronizar-pedidos',
    );
    expect(status.badge).toBe('ok');
  });

  it('rota diária executada há 27h (>26h) → atrasado', () => {
    const [status] = statusDosCrons([hb('sincronizar-pedidos', 27)], AGORA).filter(
      (s) => s.rota === 'sincronizar-pedidos',
    );
    expect(status.badge).toBe('atrasado');
  });

  it('rota diária exatamente no limite de 26h → ok (tolerância inclusiva)', () => {
    const heartbeats = [hb('gerar-relatorios', 0, { executado_em: new Date(AGORA.getTime() - 26 * HORA_MS) })];
    const [status] = statusDosCrons(heartbeats, AGORA).filter((s) => s.rota === 'gerar-relatorios');
    expect(status.badge).toBe('ok');
  });

  it('watchdog há 35min (<40min) → ok; há 45min (>40min) → atrasado', () => {
    const ok = statusDosCrons(
      [{ rota: 'watchdog', executado_em: new Date(AGORA.getTime() - 35 * MINUTO_MS), ok: true, detalhes: {} }],
      AGORA,
    ).find((s) => s.rota === 'watchdog')!;
    expect(ok.badge).toBe('ok');

    const atrasado = statusDosCrons(
      [{ rota: 'watchdog', executado_em: new Date(AGORA.getTime() - 45 * MINUTO_MS), ok: true, detalhes: {} }],
      AGORA,
    ).find((s) => s.rota === 'watchdog')!;
    expect(atrasado.badge).toBe('atrasado');
  });

  it('digest-semanal há 6 dias → ok; há 9 dias → atrasado', () => {
    const ok = statusDosCrons(
      [{ rota: 'digest-semanal', executado_em: new Date(AGORA.getTime() - 6 * DIA_MS), ok: true, detalhes: {} }],
      AGORA,
    ).find((s) => s.rota === 'digest-semanal')!;
    expect(ok.badge).toBe('ok');

    const atrasado = statusDosCrons(
      [{ rota: 'digest-semanal', executado_em: new Date(AGORA.getTime() - 9 * DIA_MS), ok: true, detalhes: {} }],
      AGORA,
    ).find((s) => s.rota === 'digest-semanal')!;
    expect(atrasado.badge).toBe('atrasado');
  });

  it('rota sem heartbeat nenhum → atrasado, executadoEm null', () => {
    const status = statusDosCrons([], AGORA).find((s) => s.rota === 'verificar-alertas')!;
    expect(status.badge).toBe('atrasado');
    expect(status.executadoEm).toBeNull();
    expect(status.ok).toBeNull();
  });

  it('array vazio ainda retorna as 8 rotas do mapa', () => {
    expect(statusDosCrons([], AGORA)).toHaveLength(8);
  });

  it('heartbeat de rota fora do mapa é ignorado (nunca lança, não aparece)', () => {
    const status = statusDosCrons([hb('rota-legada-desconhecida', 0)], AGORA);
    expect(status).toHaveLength(8);
    expect(status.find((s) => s.rota === 'rota-legada-desconhecida')).toBeUndefined();
  });

  it('carrega ok=false do heartbeat mesmo quando fresco (badge continua ok — frescor é só sobre tempo)', () => {
    const status = statusDosCrons(
      [hb('sincronizar-pedidos', 1, { ok: false })],
      AGORA,
    ).find((s) => s.rota === 'sincronizar-pedidos')!;
    expect(status.badge).toBe('ok');
    expect(status.ok).toBe(false);
  });
});

describe('diasAteExpirar — dias até uma data futura (puro)', () => {
  it('data 3 dias no futuro → 3', () => {
    const expiraEm = new Date(AGORA.getTime() + 3 * DIA_MS);
    expect(diasAteExpirar(expiraEm, AGORA)).toBe(3);
  });

  it('data no passado → negativo', () => {
    const expiraEm = new Date(AGORA.getTime() - 2 * DIA_MS);
    expect(diasAteExpirar(expiraEm, AGORA)).toBeLessThan(0);
  });

  it('null → null', () => {
    expect(diasAteExpirar(null, AGORA)).toBeNull();
  });
});
