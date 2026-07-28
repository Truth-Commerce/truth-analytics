import { z } from 'zod';

import { decryptSecret, encryptSecret } from '@/modules/crypto/crypto';
import type { ErpProviderId } from '@/modules/providers/types';

export type ConnectionSecretKind =
  | 'client_id'
  | 'client_secret'
  | 'access_token'
  | 'refresh_token';

const Envelope = z.object({
  v: z.literal(1),
  orgId: z.string().min(1),
  provider: z.enum(['bling', 'olist']),
  kind: z.enum(['client_id', 'client_secret', 'access_token', 'refresh_token']),
  value: z.string(),
});

type ConnectionSecretEnvelope = z.infer<typeof Envelope>;

type SecretContext = {
  orgId: string;
  provider: ErpProviderId;
  kind: ConnectionSecretKind;
};

export function encryptConnectionSecret(input: SecretContext & { value: string }): string {
  const envelope: ConnectionSecretEnvelope = {
    v: 1,
    orgId: input.orgId,
    provider: input.provider,
    kind: input.kind,
    value: input.value,
  };
  return encryptSecret(JSON.stringify(envelope));
}

export function decryptConnectionSecret(input: SecretContext & { ciphertext: string }): string {
  let envelope: ConnectionSecretEnvelope;
  try {
    envelope = Envelope.parse(JSON.parse(decryptSecret(input.ciphertext)));
  } catch (error) {
    if (error instanceof Error && error.message === 'decrypt_failed') throw error;
    throw new Error('connection_secret_invalido');
  }

  if (
    envelope.orgId !== input.orgId ||
    envelope.provider !== input.provider ||
    envelope.kind !== input.kind
  ) {
    throw new Error('connection_secret_context_mismatch');
  }
  return envelope.value;
}
