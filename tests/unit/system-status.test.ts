import { describe, expect, it } from 'vitest';

import { statusDoSistema } from '@/modules/admin/system-status';

describe('statusDoSistema — saúde de configuração (presença/ausência)', () => {
  it('tudo configurado → 4 itens ok', () => {
    const itens = statusDoSistema({
      RESEND_API_KEY: 'k',
      EMAIL_FROM: 'noreply@x.com',
      SERPAPI_KEY: 'k',
      CRON_SECRET: 's',
      SENTRY_DSN: 'https://x.ingest.sentry.io/1',
    });
    expect(itens).toHaveLength(4);
    expect(itens.every((i) => i.ok)).toBe(true);
    // NUNCA vaza valores
    expect(JSON.stringify(itens)).not.toContain('noreply@x.com');
  });

  it('RESEND exige chave E remetente; consequência em pt-BR quando ausente', () => {
    const semFrom = statusDoSistema({ RESEND_API_KEY: 'k' });
    const resend = semFrom.find((i) => i.chave === 'resend')!;
    expect(resend.ok).toBe(false);
    expect(resend.opcional).toBe(false);
    expect(resend.detalhe).toContain('NÃO estão sendo enviados');
  });

  it('SERPAPI e SENTRY são opcionais; CRON_SECRET é crítico', () => {
    const itens = statusDoSistema({});
    expect(itens.find((i) => i.chave === 'serpapi')!.opcional).toBe(true);
    expect(itens.find((i) => i.chave === 'sentry')!.opcional).toBe(true);
    const cron = itens.find((i) => i.chave === 'cron')!;
    expect(cron.ok).toBe(false);
    expect(cron.opcional).toBe(false);
    expect(cron.detalhe).toMatch(/NÃO estão rodando/);
  });
});
