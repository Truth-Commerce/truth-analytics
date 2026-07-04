import { afterEach, describe, expect, it, vi } from 'vitest';

import { createLogger, logger } from '@/lib/logger';

describe('logger estruturado', () => {
  afterEach(() => vi.restoreAllMocks());

  it('emite JSON com ts, nivel, msg e contexto', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('pipeline iniciado', { orgId: 'org-1', reportId: 'rep-1' });
    const linha = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(linha.nivel).toBe('info');
    expect(linha.msg).toBe('pipeline iniciado');
    expect(linha.orgId).toBe('org-1');
    expect(linha.reportId).toBe('rep-1');
    expect(typeof linha.ts).toBe('string');
  });

  it('error serializa Error com name/message e usa console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('falhou', { orgId: 'org-1' }, new Error('boom'));
    const linha = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(linha.erro.message).toBe('boom');
    expect(linha.erro.name).toBe('Error');
  });

  it('createLogger mescla contexto base', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger({ reportId: 'rep-9' });
    log.info('etapa', { etapa: 'analisando_ia' });
    const linha = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(linha.reportId).toBe('rep-9');
    expect(linha.etapa).toBe('analisando_ia');
  });
});
