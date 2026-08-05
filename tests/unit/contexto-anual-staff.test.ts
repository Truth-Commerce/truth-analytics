import { describe, expect, it } from 'vitest';

import { deveExibirContextoAnual } from '@/app/(client)/dashboard/relatorios/[id]/contexto-anual-staff';

describe('deveExibirContextoAnual', () => {
  it('exibe para analista/admin_truth abrindo via contexto staff (?orgId=)', () => {
    expect(deveExibirContextoAnual('analista', 'org-1')).toBe(true);
    expect(deveExibirContextoAnual('admin_truth', 'org-1')).toBe(true);
  });
  it('NUNCA exibe para cliente, mesmo se forjar ?orgId= na URL', () => {
    expect(deveExibirContextoAnual('client', 'org-1')).toBe(false);
  });
  it('nao exibe sem ?orgId= (analista lendo o proprio dashboard)', () => {
    expect(deveExibirContextoAnual('analista', undefined)).toBe(false);
  });
});
