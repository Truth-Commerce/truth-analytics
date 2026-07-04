'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { recordAttempt, isResetRateLimited } from '@/modules/auth/rate-limit';
import { consumeResetToken } from '@/modules/auth/password-reset.repository';
import { dispatchPasswordReset } from '@/modules/auth/password-reset.dispatch';

export type ResetRequestState = { error?: string; ok?: boolean };
export type ResetState = { error?: string };

const requestSchema = z.object({
  email: z.string().trim().email('E-mail inválido.'),
});

/**
 * Pede o link de redefinição. ANTI-ENUMERAÇÃO: a resposta é SEMPRE ok:true
 * (com conta, sem conta ou rate-limited) — nunca revela se o e-mail existe.
 */
export async function requestPasswordResetAction(
  _prev: ResetRequestState,
  formData: FormData,
): Promise<ResetRequestState> {
  const parsed = requestSchema.safeParse({ email: formData.get('email') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const forwarded = headers().get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0]!.trim() : null;

  if (await isRateLimitedSilencioso(parsed.data.email, ip)) {
    return { ok: true }; // mesma resposta — não vaza o rate-limit
  }

  await recordAttempt({ escopo: 'reset', email: parsed.data.email, ip, success: true });

  // Fire-and-forget: criar token + enviar e-mail acontece FORA do caminho de
  // resposta. Existente e inexistente retornam a MESMA resposta no mesmo tempo —
  // sem oráculo de timing (o INSERT do token e o await de rede do e-mail só
  // existiriam no caminho "existe"). Ver password-reset.dispatch.ts.
  dispatchPasswordReset(parsed.data.email);

  return { ok: true };
}

async function isRateLimitedSilencioso(email: string, ip: string | null): Promise<boolean> {
  return isResetRateLimited(email, ip);
}

const resetSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64}$/, 'Link inválido.'),
  senha: z.string().min(8, 'A senha precisa ter ao menos 8 caracteres.'),
});

export async function resetPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const parsed = resetSchema.safeParse({
    token: formData.get('token'),
    senha: formData.get('senha'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }

  const ok = await consumeResetToken(parsed.data.token, parsed.data.senha);
  if (!ok) {
    return { error: 'Link inválido ou expirado. Solicite um novo.' };
  }

  redirect('/sign-in?senha_redefinida=1');
}
