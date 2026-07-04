import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { serverEnv } from '@/lib/env';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;
const V1 = 'v1';

type KeyRing = { keys: Record<string, Buffer>; active: string };

function keyRing(): KeyRing | null {
  if (!serverEnv.ENCRYPTION_KEYS || !serverEnv.ENCRYPTION_KEY_ACTIVE) return null;
  const keys: Record<string, Buffer> = {};
  for (const [keyId, b64] of Object.entries(serverEnv.ENCRYPTION_KEYS)) {
    keys[keyId] = Buffer.from(b64, 'base64');
  }
  return { keys, active: serverEnv.ENCRYPTION_KEY_ACTIVE };
}

function legacyKey(): Buffer {
  if (!serverEnv.ENCRYPTION_KEY) throw new Error('encryption_key_ausente');
  return Buffer.from(serverEnv.ENCRYPTION_KEY, 'base64');
}

function cipherWith(key: Buffer, plaintext: string): { iv: Buffer; tag: Buffer; ct: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ct };
}

function decipherWith(key: Buffer, ivB64: string, tagB64: string, ctB64: string): string {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * Cifra com a chave ATIVA do chaveiro (payload `v1:<keyId>:<iv>:<tag>:<ct>`).
 * Sem chaveiro configurado, mantém o formato legado `iv.tag.ct` com ENCRYPTION_KEY.
 */
export function encryptSecret(plaintext: string): string {
  const ring = keyRing();
  if (ring) {
    const { iv, tag, ct } = cipherWith(ring.keys[ring.active]!, plaintext);
    return [V1, ring.active, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(
      ':',
    );
  }
  const { iv, tag, ct } = cipherWith(legacyKey(), plaintext);
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

/**
 * Decifra payloads v1 (resolve a chave pelo keyId) e legados (ENCRYPTION_KEY).
 * Qualquer falha → 'decrypt_failed' (contrato estável do chamador).
 */
export function decryptSecret(payload: string): string {
  try {
    if (payload.startsWith(`${V1}:`)) {
      const parts = payload.split(':');
      if (parts.length !== 5) throw new Error('formato');
      const [, keyId, ivB64, tagB64, ctB64] = parts;
      const key = keyRing()?.keys[keyId!];
      if (!key) throw new Error('chave_desconhecida');
      return decipherWith(key, ivB64!, tagB64!, ctB64!);
    }
    const parts = payload.split('.');
    if (parts.length !== 3) throw new Error('formato');
    return decipherWith(legacyKey(), parts[0]!, parts[1]!, parts[2]!);
  } catch {
    throw new Error('decrypt_failed');
  }
}

/** keyId de um payload v1; null para payloads legados (usado pelo reencrypt). */
export function encryptionKeyIdOf(payload: string): string | null {
  if (!payload.startsWith(`${V1}:`)) return null;
  return payload.split(':')[1] ?? null;
}
