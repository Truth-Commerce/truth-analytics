import { describe, expect, it } from 'vitest';

import {
  fimDeDiaUtc,
  hojeBrt,
  inicioDeDiaUtc,
  janelaDiasFechados,
  ontemBrt,
} from '@/lib/timezone';

describe('timezone — calendário America/Sao_Paulo', () => {
  it('hojeBrt/ontemBrt viram o dia às 03:00Z (meia-noite BRT)', () => {
    expect(hojeBrt(new Date('2026-07-14T02:59:00Z'))).toBe('2026-07-13');
    expect(hojeBrt(new Date('2026-07-14T03:00:00Z'))).toBe('2026-07-14');
    expect(ontemBrt(new Date('2026-07-14T12:00:00Z'))).toBe('2026-07-13');
    expect(ontemBrt(new Date('2026-07-14T01:00:00Z'))).toBe('2026-07-12');
  });

  it('viradas de mês e ano', () => {
    expect(ontemBrt(new Date('2026-07-01T12:00:00Z'))).toBe('2026-06-30');
    // 01/01 01:00Z = 31/12 22:00 BRT → hoje=31/12, ontem=30/12
    expect(ontemBrt(new Date('2026-01-01T01:00:00Z'))).toBe('2025-12-30');
  });

  it('inicioDeDiaUtc/fimDeDiaUtc codificam o dia-calendário em UTC', () => {
    expect(inicioDeDiaUtc('2026-07-13').toISOString()).toBe('2026-07-13T00:00:00.000Z');
    expect(fimDeDiaUtc('2026-07-13').toISOString()).toBe('2026-07-13T23:59:59.999Z');
  });

  it('janelaDiasFechados(7) = 7 dias fechados terminando ontem', () => {
    const j = janelaDiasFechados(7, new Date('2026-07-14T12:00:00Z'));
    expect(j.fim.toISOString()).toBe('2026-07-13T23:59:59.999Z');
    expect(j.inicio.toISOString()).toBe('2026-07-07T00:00:00.000Z');
  });

  it('janelaDiasFechados na madrugada UTC recua o "ontem" junto', () => {
    const j = janelaDiasFechados(7, new Date('2026-07-14T01:00:00Z')); // 22:00 BRT de 13/07
    expect(j.fim.toISOString()).toBe('2026-07-12T23:59:59.999Z');
    expect(j.inicio.toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });
});
