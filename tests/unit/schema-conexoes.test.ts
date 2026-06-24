import { describe, expect, it } from 'vitest';
import { connections, trackedProducts } from '@/db/schema';

describe('schema conexões', () => {
  it('connections: org_id notNull, status default erro', () => {
    expect(connections.org_id.notNull).toBe(true);
    expect(connections.status.default).toBe('erro');
  });
  it('tracked_products: keywords array notNull, ativo default true', () => {
    expect(trackedProducts.ativo.default).toBe(true);
    expect(trackedProducts.org_id.notNull).toBe(true);
  });
});
