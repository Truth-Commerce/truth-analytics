import { describe, expect, it } from 'vitest';
import { connections, marketSnapshots, orders, providerRateLimitState, reports } from '@/db/schema';

describe('schema pipeline', () => {
  describe('orders', () => {
    it('org_id notNull', () => {
      expect(orders.org_id.notNull).toBe(true);
    });

    it('bling_order_id is nullable for providers without a Bling identifier', () => {
      expect(orders.bling_order_id.notNull).toBe(false);
    });

    it('source_generation defaults to one', () => {
      expect(orders.source_generation.default).toBe(1);
    });

    it('frete default 0', () => {
      expect(orders.frete.default).toBe('0');
    });

    it('valor_total notNull', () => {
      expect(orders.valor_total.notNull).toBe(true);
    });

    it('itens default empty array', () => {
      expect(orders.itens.default).toEqual([]);
    });
  });

  describe('provider foundation expansion', () => {
    it('keeps report source fields nullable during rolling deploy', () => {
      expect(reports.source_provider.notNull).toBe(false);
      expect(reports.source_generation.notNull).toBe(false);
    });

    it('adds provider connection identity and generation', () => {
      expect(connections.provider_account_fingerprint.notNull).toBe(false);
      expect(connections.data_generation.default).toBe(1);
    });

    it('exports distributed provider rate-limit state', () => {
      expect(providerRateLimitState.provider.notNull).toBe(true);
      expect(providerRateLimitState.account_fingerprint.notNull).toBe(true);
    });
  });

  describe('reports', () => {
    it('org_id notNull', () => {
      expect(reports.org_id.notNull).toBe(true);
    });

    it('status default queued', () => {
      expect(reports.status.default).toBe('queued');
    });

    it('metricas is nullable (no notNull)', () => {
      expect(reports.metricas.notNull).toBe(false);
    });

    it('analise_ia is nullable (no notNull)', () => {
      expect(reports.analise_ia.notNull).toBe(false);
    });

    it('erro is nullable (no notNull)', () => {
      expect(reports.erro.notNull).toBe(false);
    });
  });

  describe('marketSnapshots', () => {
    it('org_id notNull', () => {
      expect(marketSnapshots.org_id.notNull).toBe(true);
    });

    it('report_id notNull', () => {
      expect(marketSnapshots.report_id.notNull).toBe(true);
    });

    it('dados notNull', () => {
      expect(marketSnapshots.dados.notNull).toBe(true);
    });
  });
});
