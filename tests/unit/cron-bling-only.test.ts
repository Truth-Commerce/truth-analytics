import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cron de sincronização', () => {
  it('mantém o agendamento operacional limitado ao Bling', () => {
    const route = readFileSync(resolve(process.cwd(), 'src/app/api/cron/sincronizar-pedidos/route.ts'), 'utf8');
    expect(route).toContain("provider: 'bling'");
    expect(route).not.toContain("provider: 'olist'");
  });

  it('cerca o fingerprint Olist pela geração congelada durante o enriquecimento', () => {
    const step = readFileSync(resolve(process.cwd(), 'src/modules/pipeline/steps/enrich-orders.ts'), 'utf8');
    expect(step).toContain('getOlistAccountFingerprint(source.orgId, source.sourceGeneration)');
  });

  it('não inventa watermark Olist antes do backfill inicial', () => {
    const sync = readFileSync(resolve(process.cwd(), 'src/modules/pipeline/sync-pedidos.ts'), 'utf8');
    expect(sync).toContain("throw new Error('olist_incremental_baseline_missing')");
  });
});
