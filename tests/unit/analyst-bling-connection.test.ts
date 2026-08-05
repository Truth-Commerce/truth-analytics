import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Bling na conexão gerenciada pelo analista', () => {
  it('exibe Bling e Olist na aba de conexão da organização', () => {
    const page = readFileSync(join(process.cwd(), 'src/app/analista/[orgId]/page.tsx'), 'utf8');
    expect(page).toContain('BlingConnectionCard');
    expect(page).toContain('OlistConnectionCard');
    expect(page).toContain('surface="analyst_org"');
  });

  it('inicia e conclui OAuth usando a organização assinada da tentativa', () => {
    const start = readFileSync(join(process.cwd(), 'src/app/api/connections/bling/route.ts'), 'utf8');
    const callback = readFileSync(join(process.cwd(), 'src/app/api/connections/bling/callback/route.ts'), 'utf8');
    expect(start).toContain('assertConnectionOrgAccess');
    expect(start).toContain('createBlingOAuthAttempt');
    expect(callback).toContain('verifyBlingOAuthAttempt');
    expect(callback).toContain('saveBlingConnection(attempt.orgId, tokens)');
    expect(callback).toContain("assertConnectionOrgAccess(access, attempt.orgId, attempt.surface)");
  });
});
