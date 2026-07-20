import { createHmac } from 'node:crypto';

import { serverEnv } from '@/lib/env';
import { secretsMatch } from '@/lib/secret-compare';

// ---------------------------------------------------------------------------
// impersonation.ts — PURO. Sem I/O de cookie (isso fica nos callers:
// require-active-org.ts lê/decide, admin.actions.ts grava/apaga). Este
// módulo só assina e verifica o valor do cookie `ta_impersonate` via
// HMAC-SHA256 com `AUTH_SECRET` (mesmo segredo do NextAuth — trocar o
// segredo já invalida qualquer cookie de impersonação pendente).
//
// Formato do valor assinado: `${base64url(payload)}.${assinatura}`, onde
// `payload = "orgId.adminId.exp"` (exp = epoch ms) e `assinatura =
// HMAC-SHA256(payload, AUTH_SECRET)` — HMAC sobre o payload CRU (não sobre a
// versão base64), ambos em base64url. Nem orgId nem adminId (uuid/cuid) têm
// '.', então o split por '.' do payload decodificado é seguro.
// ---------------------------------------------------------------------------

export const IMPERSONATION_COOKIE = 'ta_impersonate';
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000; // 30min

function hmac(payload: string): string {
  return createHmac('sha256', serverEnv.AUTH_SECRET).update(payload).digest('base64url');
}

export function assinarImpersonation(orgId: string, adminId: string, agora: Date): string {
  const exp = agora.getTime() + IMPERSONATION_TTL_MS;
  const payload = `${orgId}.${adminId}.${exp}`;
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  return `${payloadB64}.${hmac(payload)}`;
}

export function verificarImpersonation(
  valor: string,
  agora: Date,
): { orgId: string; adminId: string } | null {
  if (!valor) return null;

  const ponto = valor.indexOf('.');
  if (ponto === -1) return null;
  const payloadB64 = valor.slice(0, ponto);
  const assinaturaRecebida = valor.slice(ponto + 1);

  let payload: string;
  try {
    payload = Buffer.from(payloadB64, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  // Comparação em tempo constante — evita timing attack na verificação da
  // assinatura (mesmo padrão do state-cookie... exceto que ali é `!==`; aqui
  // usamos secretsMatch de propósito, por ser um cookie de elevação de
  // privilégio, não um nonce de CSRF de OAuth).
  if (!secretsMatch(assinaturaRecebida, hmac(payload))) return null;

  const campos = payload.split('.');
  if (campos.length !== 3) return null;
  const [orgId, adminId, expStr] = campos;
  if (!orgId || !adminId) return null;

  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return null;
  if (agora.getTime() > exp) return null; // vencido

  return { orgId, adminId };
}
