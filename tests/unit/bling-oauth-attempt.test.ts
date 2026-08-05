import { describe, expect, it } from 'vitest';

import {
  createBlingOAuthAttempt,
  verifyBlingOAuthAttempt,
  blingReturnPath,
} from '@/modules/connections/bling-oauth-attempt';

describe('tentativa OAuth do Bling', () => {
  it('vincula estado assinado ao usuário, organização e superfície', () => {
    const attempt = createBlingOAuthAttempt({
      orgId: 'org-client',
      userId: 'analyst-1',
      surface: 'analyst_org',
    });

    expect(
      verifyBlingOAuthAttempt({
        cookieValue: attempt.cookieValue,
        state: attempt.state,
        expectedUserId: 'analyst-1',
      }),
    ).toMatchObject({
      provider: 'bling',
      orgId: 'org-client',
      userId: 'analyst-1',
      surface: 'analyst_org',
    });
  });

  it('rejeita cookie adulterado, estado diferente e outro usuário', () => {
    const attempt = createBlingOAuthAttempt({
      orgId: 'org-client',
      userId: 'analyst-1',
      surface: 'analyst_org',
    });
    expect(verifyBlingOAuthAttempt({ cookieValue: `${attempt.cookieValue}x`, state: attempt.state, expectedUserId: 'analyst-1' })).toBeNull();
    expect(verifyBlingOAuthAttempt({ cookieValue: attempt.cookieValue, state: 'other', expectedUserId: 'analyst-1' })).toBeNull();
    expect(verifyBlingOAuthAttempt({ cookieValue: attempt.cookieValue, state: attempt.state, expectedUserId: 'analyst-2' })).toBeNull();
  });

  it('retorna para a superfície que iniciou a conexão', () => {
    expect(blingReturnPath('client_connections', 'org-client')).toBe('/conexoes');
    expect(blingReturnPath('analyst_org', 'org-client')).toBe('/analista/org-client?tab=conexao');
  });
});
