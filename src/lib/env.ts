import { z } from 'zod';

const KEY_ID_RE = /^[a-z0-9_-]{1,16}$/;
// Nomes que colidem com o protótipo de Object — vetados como keyId (prototype pollution).
const KEY_ID_DENYLIST = new Set(['__proto__', 'constructor', 'prototype']);

const schema = z
  .object({
  POSTGRES_URL: z.string().min(1, 'POSTGRES_URL é obrigatória'),
  POSTGRES_URL_DIRECT: z.string().min(1).optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).optional(),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET é obrigatória'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'ENCRYPTION_KEY deve ser 32 bytes em base64',
    })
    .optional(),
  OLIST_ACCOUNT_FINGERPRINT_KEY: z.string().optional().refine(
    (v) => v === undefined || Buffer.from(v, 'base64').length === 32,
    { message: 'OLIST_ACCOUNT_FINGERPRINT_KEY deve ser 32 bytes em base64' },
  ),
  ENCRYPTION_KEYS: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v) return undefined;
      let obj: Record<string, string>;
      try {
        obj = JSON.parse(v) as Record<string, string>;
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'ENCRYPTION_KEYS deve ser JSON' });
        return z.NEVER;
      }
      for (const [keyId, b64] of Object.entries(obj)) {
        if (!KEY_ID_RE.test(keyId) || KEY_ID_DENYLIST.has(keyId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `keyId inválido em ENCRYPTION_KEYS: ${keyId}`,
          });
          return z.NEVER;
        }
        if (Buffer.from(b64, 'base64').length !== 32) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `chave ${keyId} deve ser 32 bytes em base64`,
          });
          return z.NEVER;
        }
      }
      return obj;
    }),
  ENCRYPTION_KEY_ACTIVE: z.string().regex(KEY_ID_RE).optional(),
  BLING_CLIENT_ID: z.string().min(1).optional(),
  BLING_CLIENT_SECRET: z.string().min(1).optional(),
  BLING_REDIRECT_URI: z.string().url().optional(),
  BLING_API_BASE: z.string().url().default('https://www.bling.com.br/Api/v3'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANALYSIS_MODEL: z.string().default('claude-opus-4-8'),
  SERPAPI_KEY: z.string().min(1).optional(),
  SERPAPI_BASE: z.string().url().default('https://serpapi.com'),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().optional(),
  ADMIN_ALERT_EMAIL: z.string().optional(),
  PIPELINE_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  SENTRY_DSN: z.string().url().optional(),
  })
  .superRefine((env, ctx) => {
    // KEYS e ACTIVE andam juntas: metade configurada é misconfiguração explícita
    // (evita degradar silenciosamente para o caminho legado durante uma rotação).
    if (env.ENCRYPTION_KEYS && !env.ENCRYPTION_KEY_ACTIVE) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ENCRYPTION_KEYS configurada sem ENCRYPTION_KEY_ACTIVE — defina o keyId ativo',
      });
      return;
    }
    if (env.ENCRYPTION_KEY_ACTIVE && !env.ENCRYPTION_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ENCRYPTION_KEY_ACTIVE configurada sem ENCRYPTION_KEYS — defina o chaveiro',
      });
      return;
    }
    const temVersionada = Boolean(env.ENCRYPTION_KEYS && env.ENCRYPTION_KEY_ACTIVE);
    if (!temVersionada && !env.ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Configure ENCRYPTION_KEYS + ENCRYPTION_KEY_ACTIVE (ou ENCRYPTION_KEY legado)',
      });
    }
    if (
      temVersionada &&
      !Object.hasOwn(env.ENCRYPTION_KEYS as Record<string, string>, env.ENCRYPTION_KEY_ACTIVE as string)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ENCRYPTION_KEY_ACTIVE não existe em ENCRYPTION_KEYS',
      });
    }
  });

export type ServerEnv = z.infer<typeof schema>;

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return schema.parse(source);
}

export const serverEnv = parseServerEnv();
