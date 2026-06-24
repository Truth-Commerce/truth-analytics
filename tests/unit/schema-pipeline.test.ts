import { describe, expect, it } from 'vitest';
import { orders, reports, marketSnapshots } from '@/db/schema';

describe('schema pipeline', () => {
  describe('orders', () => {
    it('org_id notNull', () => {
      expect(orders.org_id.notNull).toBe(true);
    });

    it('bling_order_id notNull', () => {
      expect(orders.bling_order_id.notNull).toBe(true);
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
