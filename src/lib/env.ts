import { z } from 'zod';

const schema = z.object({
  POSTGRES_URL: z.string().min(1, 'POSTGRES_URL é obrigatória'),
  POSTGRES_URL_DIRECT: z.string().min(1).optional(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(20).optional(),
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET é obrigatória'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'ENCRYPTION_KEY deve ser 32 bytes em base64',
    }),
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
});

export type ServerEnv = z.infer<typeof schema>;

export function parseServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  return schema.parse(source);
}

export const serverEnv = parseServerEnv();
