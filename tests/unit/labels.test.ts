import { describe, expect, it } from 'vitest';

import { PLANO_LABEL, STATUS_ORG_LABEL } from '@/lib/labels';

describe('labels de negócio pt-BR', () => {
  it('status de organização', () => {
    expect(STATUS_ORG_LABEL).toEqual({ pending: 'Pendente', active: 'Ativo', suspended: 'Suspenso' });
  });

  it('planos', () => {
    expect(PLANO_LABEL).toEqual({ weekly: 'Semanal', biweekly: 'Quinzenal', monthly: 'Mensal' });
  });
});
