import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { serverEnv } from '@/lib/env';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function key(): Buffer {
  return Buffer.from(serverEnv.ENCRYPTION_KEY, 'base64');
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decryptSecret(payload: string): string {
  try {
    const parts = payload.split('.');
    if (parts.length !== 3) throw new Error('formato');
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv(ALGO, key(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    throw new Error('decrypt_failed');
  }
}
