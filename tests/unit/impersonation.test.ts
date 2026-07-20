import { describe, expect, it, vi } from 'vitest';

import { createHmac } from 'node:crypto';

vi.mock('@/lib/env', () => ({
  serverEnv: { AUTH_SECRET: 'segredo-de-teste-bem-longo-032' },
}));

const AUTH_SECRET_TESTE = 'segredo-de-teste-bem-longo-032';

import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_MS,
  assinarImpersonation,
  verificarImpersonation,
} from '@/modules/auth/impersonation';

// Reproduz o HMAC do módulo (mesmo segredo mockado) só para montar, no teste,
// um valor "assinatura válida + payload malformado" — o módulo não exporta o
// HMAC cru de propósito (superfície mínima), então recomputamos aqui.
function assinarPayloadCru(payload: string): string {
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const assinatura = createHmac('sha256', AUTH_SECRET_TESTE).update(payload).digest('base64url');
  return `${payloadB64}.${assinatura}`;
}

describe('impersonation — assinar/verificar (HMAC puro, sem cookie I/O)', () => {
  const agora = new Date('2026-07-20T12:00:00Z');

  it('constantes', () => {
    expect(IMPERSONATION_COOKIE).toBe('ta_impersonate');
    expect(IMPERSONATION_TTL_MS).toBe(30 * 60 * 1000);
  });

  it('roundtrip: assina e verifica dentro da janela → devolve orgId/adminId', () => {
    const valor = assinarImpersonation('org-1', 'admin-1', agora);
    expect(verificarImpersonation(valor, agora)).toEqual({ orgId: 'org-1', adminId: 'admin-1' });
  });

  it('ainda válido 1ms antes do vencimento (janela de 30min é inclusiva no limite)', () => {
    const valor = assinarImpersonation('org-1', 'admin-1', agora);
    const quaseVencendo = new Date(agora.getTime() + IMPERSONATION_TTL_MS - 1);
    expect(verificarImpersonation(valor, quaseVencendo)).toEqual({ orgId: 'org-1', adminId: 'admin-1' });
  });

  it('vencido (1ms após o TTL) → null', () => {
    const valor = assinarImpersonation('org-1', 'admin-1', agora);
    const depoisDoPrazo = new Date(agora.getTime() + IMPERSONATION_TTL_MS + 1);
    expect(verificarImpersonation(valor, depoisDoPrazo)).toBeNull();
  });

  it('HMAC adulterado (assinatura trocada) → null', () => {
    const valor = assinarImpersonation('org-1', 'admin-1', agora);
    const [payload] = valor.split('.');
    expect(verificarImpersonation(`${payload}.assinaturaFalsaQualquer`, agora)).toBeNull();
  });

  it('payload adulterado (orgId trocado depois de assinado) → assinatura não bate → null', () => {
    const valor = assinarImpersonation('org-1', 'admin-1', agora);
    const [, assinatura] = valor.split('.');
    const exp = agora.getTime() + IMPERSONATION_TTL_MS;
    const payloadForjado = Buffer.from(`org-ALVO-TROCADO.admin-1.${exp}`, 'utf8').toString('base64url');
    expect(verificarImpersonation(`${payloadForjado}.${assinatura}`, agora)).toBeNull();
  });

  it('escalada de privilégio: adminId trocado no payload → assinatura não bate → null', () => {
    const valor = assinarImpersonation('org-1', 'admin-1', agora);
    const [, assinatura] = valor.split('.');
    const exp = agora.getTime() + IMPERSONATION_TTL_MS;
    const payloadForjado = Buffer.from(`org-1.outro-admin.${exp}`, 'utf8').toString('base64url');
    expect(verificarImpersonation(`${payloadForjado}.${assinatura}`, agora)).toBeNull();
  });

  it('valor vazio → null', () => {
    expect(verificarImpersonation('', agora)).toBeNull();
  });

  it('valor sem ponto separador (malformado) → null', () => {
    expect(verificarImpersonation('valorsemponto', agora)).toBeNull();
  });

  it('payload não é base64 válido → null (não lança)', () => {
    expect(() => verificarImpersonation('***não-é-base64***.assinatura', agora)).not.toThrow();
    expect(verificarImpersonation('***não-é-base64***.assinatura', agora)).toBeNull();
  });

  it('assinatura válida mas payload sem 3 campos → null', () => {
    const valor = assinarPayloadCru('so-um-campo-sem-pontos');
    expect(verificarImpersonation(valor, agora)).toBeNull();
  });

  it('assinatura válida mas exp não-numérico → null', () => {
    const valor = assinarPayloadCru('org-1.admin-1.nao-e-numero');
    expect(verificarImpersonation(valor, agora)).toBeNull();
  });

  it('assinaturas com comprimentos diferentes não lançam (timing-safe via secretsMatch)', () => {
    const valor = assinarImpersonation('org-1', 'admin-1', agora);
    const [payload] = valor.split('.');
    expect(() => verificarImpersonation(`${payload}.curta`, agora)).not.toThrow();
    expect(verificarImpersonation(`${payload}.curta`, agora)).toBeNull();
  });

  it('dois orgId/adminId diferentes produzem valores assinados diferentes', () => {
    const v1 = assinarImpersonation('org-1', 'admin-1', agora);
    const v2 = assinarImpersonation('org-2', 'admin-1', agora);
    expect(v1).not.toBe(v2);
  });
});
