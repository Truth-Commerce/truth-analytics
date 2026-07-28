import { describe, expect, it } from 'vitest';

import { olistFeedback } from '@/components/connections/olist-feedback';

describe('olistFeedback', () => {
  it('mapeia sucesso', () => {
    expect(olistFeedback({ olist: 'conectado' })).toMatchObject({ variant: 'success' });
  });

  it.each([
    'olist_parametros_invalidos',
    'olist_state_invalido',
    'olist_autorizacao_negada',
    'olist_autorizacao_falhou',
    'olist_credenciais_ausentes',
    'olist_credenciais_alteradas',
    'olist_oauth_transiente',
    'acesso_negado',
    'organizacao_inativa',
  ])('mapeia erro allowlisted %s', (erro) => {
    expect(olistFeedback({ erro })).toMatchObject({ variant: 'danger' });
  });

  it.each(['constructor', '__proto__', 'toString', 'desconhecido'])(
    'usa fallback seguro para %s',
    (erro) => {
      expect(olistFeedback({ erro })).toEqual({
        variant: 'danger',
        title: 'Não foi possível conectar ao Olist',
        message: 'Tente novamente. Se o problema continuar, fale com o suporte.',
      });
    },
  );
});
