import { describe, expect, it, vi } from 'vitest';

vi.mock('@/modules/providers/registry', () => {
  throw new Error('adapter_registry_must_not_load_for_active_connection_resolution');
});

describe('provider catalog', () => {
  it('loads the active connection resolver without initializing adapter registry', async () => {
    await expect(import('@/modules/connections/active-provider.repository')).resolves.toEqual(
      expect.objectContaining({ getActiveErpConnection: expect.any(Function) }),
    );
  });

  it('recognizes only supported ERP provider identifiers', async () => {
    const { isErpProviderId } = await import('@/modules/providers/provider-catalog');

    expect(isErpProviderId('bling')).toBe(true);
    expect(isErpProviderId('olist')).toBe(true);
    expect(isErpProviderId('unknown')).toBe(false);
  });
});
