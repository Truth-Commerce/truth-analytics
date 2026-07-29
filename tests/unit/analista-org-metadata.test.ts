import { describe, expect, it, vi } from 'vitest';

const { getOrganizationById } = vi.hoisted(() => ({
  getOrganizationById: vi.fn(async () => ({ name: 'Cliente secreto' })),
}));

vi.mock('@/modules/admin/admin.repository', () => ({ getOrganizationById }));

import { generateMetadata } from '@/app/analista/[orgId]/page';

describe('metadata da visão do cliente pelo analista', () => {
  it('é genérica e não consulta dados da organização antes do guard de acesso', async () => {
    await expect(
      generateMetadata(),
    ).resolves.toEqual({ title: 'Cliente' });
    expect(getOrganizationById).not.toHaveBeenCalled();
  });
});
