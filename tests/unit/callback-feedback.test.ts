import { describe, expect, it } from 'vitest';

import { feedbackDeCallback } from '@/app/(client)/conexoes/callback-feedback';

describe('feedbackDeCallback — retorno do OAuth Bling', () => {
  it('ok=1 → sucesso com CTA de gerar análise', () => {
    const f = feedbackDeCallback({ ok: '1' });
    expect(f).not.toBeNull();
    expect(f!.variante).toBe('success');
    expect(f!.titulo).toContain('Bling conectado');
    expect(f!.mensagem).toContain('análise');
  });

  it('erro=state_invalido → orientação para tentar de novo', () => {
    const f = feedbackDeCallback({ erro: 'state_invalido' });
    expect(f!.variante).toBe('danger');
    expect(f!.mensagem).toMatch(/tente/i);
  });

  it('erro=falha_conexao → orientação de aguardar e tentar novamente', () => {
    const f = feedbackDeCallback({ erro: 'falha_conexao' });
    expect(f!.variante).toBe('danger');
    expect(f!.mensagem).toMatch(/novamente/i);
  });

  it('erro desconhecido → fallback genérico; sem params → null', () => {
    expect(feedbackDeCallback({ erro: 'outro_qualquer' })!.variante).toBe('danger');
    expect(feedbackDeCallback(undefined)).toBeNull();
    expect(feedbackDeCallback({})).toBeNull();
  });
});
