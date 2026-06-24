import { describe, expect, it } from 'vitest';
import { auditLog, organizations, users } from '@/db/schema';

describe('schema de fundação', () => {
  it('organizations tem coluna de trava de plano', () => {
    expect(organizations.proximo_relatorio_liberado_em.name).toBe(
      'proximo_relatorio_liberado_em',
    );
    expect(organizations.status.default).toBe('pending');
  });

  it('users referencia organizations e default role client', () => {
    expect(users.org_id.notNull).toBe(true);
    expect(users.role.default).toBe('client');
  });

  it('audit_log aceita org_id nulo (eventos de sistema)', () => {
    expect(auditLog.org_id.notNull).toBe(false);
  });
});
